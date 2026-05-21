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

---

# Cleanup del `story_context` en ManyChat

## TL;DR

El custom_field `story_context` en ManyChat es un **boolean one-shot**:
`true` cuando el DM viene como respuesta a una story de IG. El webhook lo
lee, persiste el estado en `conversations.custom_fields.from_story = true`
(marca durable de "esta conversación arrancó por story"), y dispara un
cleanup `setCustomFieldByName story_context = false` para que el flag no
contamine el próximo mensaje del subscriber.

Implementación: `clearStoryContextFlag()` en `lib/instagram/manychat.ts`,
llamada vía `after()` anidado en
`app/api/webhooks/manychat/route.ts → processIncoming()`.

## Diferencia con `contexto_comentario`

| Aspecto | `contexto_comentario` | `story_context` |
|---------|----------------------|-----------------|
| Tipo en ManyChat | String (texto libre del operador) | Boolean (true/false) |
| Texto del contexto | Vive en el custom_field de ManyChat | Vive en `tenants.stories_context_general` / `_keywords` (panel /settings > Contextos > Stories) |
| Estado persistente | El texto se guarda en `conversations.custom_fields.contexto_comentario` y se inyecta cada turno | Se persiste un boolean `conversations.custom_fields.from_story = true`; el texto se resuelve desde el tenant en cada turno |
| Cleanup en ManyChat | `field_value: "-"` (string sentinel) | `field_value: false` (boolean) |
| Frecuencia del cleanup | Siempre en cada mensaje | Siempre en cada mensaje |

El motivo de separar texto-del-contexto (tenant) de flag-de-trigger (custom
field) en stories es que el contexto de stories se edita una vez por día
desde el panel y vale para TODOS los subscribers que respondan stories ese
día. Si lo metieramos como string custom_field por subscriber duplicaríamos
trabajo del operador en cada DM.

## Flow

1. ManyChat detecta story reply → setea `story_context = true` → dispara el
   webhook al endpoint del tenant.
2. `processIncoming()` lee `data.custom_fields.story_context`:
   - Acepta `true` (boolean) o `"true"` (string) — `isStoryReply()` cubre
     ambos.
   - Si truthy, marca `conversations.custom_fields.from_story = true` en el
     upsert.
3. `compose-prompt.ts` recibe `storyContext` (string ya resuelto por el
   caller). Cuando está presente, inyecta el bloque
   `CONTEXTO DE LA STORY IG (PERSISTENTE)` en la sección de referencia,
   junto al de `contexto_comentario`, antes del catálogo.
4. `cami-agent.ts` arma ese string a partir de
   `tenant.stories_context_general` + `tenant.stories_context_keywords` SI
   `conversations.custom_fields.from_story === true`. Si el tenant no tiene
   nada cargado, no pasa nada a `compose-prompt` (no se inyecta bloque).
5. `clearStoryContextFlag()` se dispara vía `after()` anidado para resetear
   el flag a `false` en ManyChat (mismo racional que `contexto_comentario`
   — `after()` anidado para no perder el HTTP de cleanup cuando Vercel
   cierra la función serverless).

## Logs

| Log | Significado |
|-----|-------------|
| `[manychat-cleanup] start (story_context) subscriber=X` | El cleanup arrancó (api key OK) |
| `[manychat-cleanup] ok (story_context) subscriber=X` | El POST a ManyChat respondió 2xx |
| `[manychat-cleanup] error (story_context) subscriber=X status=Y body=...` | ManyChat respondió error |
| `[manychat-cleanup] no API key — cannot clear story_context ...` | No hay api key disponible |
| `[manychat-cleanup] uncaught error (story_context) subscriber=X: ...` | Excepción inesperada |
