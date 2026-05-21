# Cleanup del `contexto_comentario` en ManyChat

## TL;DR

Después de cada mensaje entrante por Instagram, el webhook hace `POST` a la
API de ManyChat para resetear el custom_field `contexto_comentario` del
subscriber a `"-"`. Si no lo hicieramos, el contexto cargado por el operador
para un comentario puntual contaminaría todos los turnos siguientes del
mismo cliente.

Implementación: `clearContextoComentarioFlag()` en
`lib/instagram/manychat.ts`, llamada vía `after()` anidado en
`app/api/webhooks/manychat/route.ts → processIncoming()`.

## Por qué hace falta

`contexto_comentario` NO es una columna de nuestra base de datos. Vive como
**custom_field del subscriber en ManyChat**. Cuando el operador escribe en
un post de Instagram un contexto del tipo "Comentó en post de SPC Click, ya
le ofrecimos info", ManyChat lo carga en ese custom_field y nos lo manda
en cada webhook subsiguiente del mismo subscriber.

Eso es deseable mientras el contexto sea relevante. El problema: a
diferencia de `story_reply` o `ad_click` que son flags one-shot, el operador
NO siempre limpia `contexto_comentario` manualmente. Y borrar
`conversations` o `messages` en Supabase tampoco ayuda — el dato vive del
otro lado.

Resultado sin cleanup: el contexto "Comentó en post de SPC click" se inyecta
en el system prompt de Cami días después, cuando el cliente vuelve a
escribir por otro tema completamente distinto. Cami se confunde y arranca
hablando del post viejo.

## Cómo lo hacía el flow viejo (n8n)

En el workflow **"Leads Qualifier"** (`iY8lXquuEE7F6HuI`), existía un nodo
**"HTTP Request2"** que se ejecutaba en PARALELO con el nodo
**"HTTP Request1"** (el que encolaba el mensaje en el buffer del agente),
inmediatamente después del nodo "Edit Fields". Configuración:

| Campo  | Valor |
|--------|-------|
| Method | `POST` |
| URL    | `https://api.manychat.com/fb/subscriber/setCustomFieldByName` |
| Auth   | `genericCredentialType` / `httpBearerAuth` con la api key del ManyChat del tenant |
| Body   | `{ "subscriber_id": "<manychat_id>", "field_name": "contexto_comentario", "field_value": "-" }` |

Se disparaba en TODOS los mensajes entrantes — no sólo cuando había
contexto. Eso es importante: si el cleanup fuera condicional al campo estar
populado, una falla intermitente dejaría rezagos.

## Cómo lo hacemos en Fenoma

`lib/instagram/manychat.ts`:

```ts
export async function clearContextoComentarioFlag(
  subscriberId: string,
  apiKey?: string | null,
): Promise<void> {
  // Mismo endpoint, mismo body, mismo auth header. Ver función para detalle.
}
```

Se llama desde `processIncoming()` en `app/api/webhooks/manychat/route.ts`
**dentro de `after()` anidado**, no como `void` fire-and-forget:

```ts
after(async () => {
  try {
    await clearContextoComentarioFlag(manychatId, tenantKey);
  } catch (e) {
    console.error(`[manychat-cleanup] uncaught error subscriber=${manychatId}:`, ...);
  }
});
```

### Por qué `after()` anidado y no `void`

`processIncoming()` corre dentro del `after()` de la route handler. Si
disparáramos el cleanup como `void clearContextoComentario(...)` sin await,
Vercel termina la función serverless apenas la promesa del outer `after`
resuelve (i.e. cuando `processIncoming` retorna), KILLEANDO el HTTP request
a ManyChat antes de que se complete.

Es la misma lección que el bug del mail de leads
(`fix(leads): await sendLeadNotification` — commit anterior en este mismo
PR): toda I/O que arranca dentro de `after()` tiene que estar en el chain
de promesas que ese `after` espera, o registrada en un `after` anidado
propio.

### Aplicación a ambos webhooks

Como `app/api/webhooks/manychat/[tenantId]/route.ts` delega a
`processIncoming`, el cleanup queda activo automáticamente en los dos
endpoints (legacy + tenant-aware) sin código duplicado.

## API key

Se usa `tenant.manychat_api_key` (columna agregada en la migración 022) como
Bearer token. Esto permite que cada tenant tenga su propia cuenta de
ManyChat sin colisión. Si la columna está nula, `resolveKey()` cae a la env
var `MANYCHAT_API_KEY` por compatibilidad con el setup mono-tenant viejo.
Si ninguna está, se loguea un error explícito y se aborta el cleanup (no se
tira excepción para no fallar todo el procesamiento del mensaje).

## Logs

Para diagnóstico futuro:

| Log | Significado |
|-----|-------------|
| `[manychat-cleanup] start subscriber=X` | El cleanup arrancó (api key OK) |
| `[manychat-cleanup] ok subscriber=X` | El POST a ManyChat respondió 2xx |
| `[manychat-cleanup] error subscriber=X status=Y body=...` | ManyChat respondió error |
| `[manychat-cleanup] no API key — cannot clear ...` | No hay api key disponible |
| `[manychat-cleanup] uncaught error subscriber=X: ...` | Excepción inesperada (red, parse) |

Si en Vercel logs no aparece ningún `[manychat-cleanup]` para un subscriber
después de un mensaje, hay que revisar:

1. Que el webhook ManyChat haya llegado al endpoint (buscar `[ig-webhook]`).
2. Que `tenant.manychat_api_key` esté seteada para ese tenant.
3. Que Vercel no esté limitando `waitUntil` (default es generoso).
