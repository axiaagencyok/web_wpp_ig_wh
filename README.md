# AgenteWPP

Agente de IA para WhatsApp con panel de control multi-tenant. Recibe mensajes via Twilio Sandbox, responde usando Anthropic Claude con un catálogo de Google Sheets como fuente de verdad, y expone un panel estilo WhatsApp Web para que el dueño del negocio vea los chats en tiempo real, pause la automatización por conversación y envíe mensajes manualmente.

## Stack

- **Next.js 16** (App Router, TypeScript strict)
- **Supabase** — Postgres + Auth + Realtime + RLS
- **Anthropic Claude** (`claude-sonnet-4-5`) con tool calling
- **Twilio WhatsApp Sandbox**
- **Google Sheets API** (Service Account, caché 5 min)
- **shadcn/ui + Tailwind CSS**

---

## 1. Setup desde cero

### Prerequisitos

- Node.js 20+
- Cuenta Supabase (proyecto creado)
- Cuenta Twilio con Sandbox WhatsApp activado
- Proyecto Google Cloud con Sheets API habilitada
- API key de Anthropic

### Clonar e instalar

```bash
git clone <repo-url>
cd agentewpp
npm install
```

### Variables de entorno

Copiar `.env.local.example` a `.env.local` y completar todos los valores:

```env
# Anthropic
ANTHROPIC_API_KEY=sk-ant-...

# Supabase
NEXT_PUBLIC_SUPABASE_URL=https://xxxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJ...
SUPABASE_SERVICE_ROLE_KEY=eyJ...

# Twilio
TWILIO_ACCOUNT_SID=ACxxx
TWILIO_AUTH_TOKEN=xxx
TWILIO_WHATSAPP_NUMBER=whatsapp:+14155238886
TWILIO_WEBHOOK_URL=https://tu-dominio.ngrok.app/api/webhooks/twilio
TWILIO_SKIP_VALIDATION=false   # true solo en dev local sin ngrok

# Google Sheets
GOOGLE_SA_CLIENT_EMAIL=service-account@project.iam.gserviceaccount.com
GOOGLE_SA_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----\n"
GOOGLE_SHEET_ID=1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgVE2upms
GOOGLE_SHEET_RANGE=Lista de Precios!A:Z

# Seguridad interna
INTERNAL_WORKER_SECRET=un-secret-largo-aleatorio
```

---

## 2. Google Service Account y Google Sheets

### Crear Service Account

1. Ir a [console.cloud.google.com](https://console.cloud.google.com) → tu proyecto → **IAM & Admin → Service Accounts**
2. **+ Create Service Account** → nombre descriptivo → Create
3. En la lista, hacer clic en la cuenta creada → pestaña **Keys** → **Add Key → JSON**
4. El archivo descargado contiene `client_email` y `private_key` — copiar esos valores al `.env.local`

### Habilitar Google Sheets API

1. En el mismo proyecto → **APIs & Services → Library**
2. Buscar "Google Sheets API" → **Enable**

### Compartir el Sheet

1. Abrir el Google Sheet con el catálogo
2. **Compartir** → pegar el `client_email` del Service Account → rol **Viewer** → Listo

El rango por defecto es `Lista de Precios!A:Z`. La primera fila debe ser encabezados; la columna `Tipo` se usa para filtrar por categoría.

---

## 3. Twilio Sandbox

### Activar Sandbox

1. En [console.twilio.com](https://console.twilio.com) → **Messaging → Try it out → Send a WhatsApp message**
2. Seguir instrucciones para unir tu número al Sandbox enviando el código por WhatsApp

### Configurar webhook

1. En la consola de Twilio → **Messaging → Settings → WhatsApp Sandbox Settings**
2. En **"When a message comes in"** pegar la URL del webhook:
   ```
   https://tu-dominio.ngrok.app/api/webhooks/twilio
   ```
3. Método: **HTTP POST**

Para dev local usar ngrok:
```bash
ngrok http 3000
# Copiar la URL https://xxx.ngrok.app al campo del webhook y al .env.local
```

---

## 4. Migraciones Supabase

No hay CLI configurado — aplicar manualmente vía SQL Editor:

1. Ir a [supabase.com](https://supabase.com) → tu proyecto → **SQL Editor**
2. Abrir y ejecutar `supabase/migrations/001_initial.sql`
3. Abrir y ejecutar `supabase/migrations/002_fix_rls_recursion.sql`

Las migraciones crean las tablas `tenants`, `users`, `conversations`, `messages`, `message_buffer`, `ai_logs` con RLS habilitado.

---

## 5. Comandos dev (3 terminales)

**Terminal 1 — Next.js**
```bash
npm run dev
# → http://localhost:3000
```

**Terminal 2 — ngrok** (para recibir webhooks de Twilio)
```bash
ngrok http 3000
```

**Terminal 3 — Worker de buffer** (procesa mensajes entrantes cada 5s)
```bash
npx tsx scripts/worker.ts
```

En producción (Vercel) el worker corre como Cron Job cada minuto (`vercel.json`). El intervalo mínimo de Vercel Cron es 1 minuto; en dev el script hace polling cada 5 segundos.

---

## 6. Primer tenant y usuario del panel

### Crear tenant

En el SQL Editor de Supabase:

```sql
INSERT INTO tenants (
  name,
  whatsapp_number,
  agent_enabled,
  agent_system_prompt,
  google_sheet_id,
  google_sheet_range
) VALUES (
  'Mi Negocio',
  'whatsapp:+14155238886',   -- mismo número del Sandbox
  true,
  'Sos un asistente de ventas amable. Respondé en español. Usá get_catalog para consultar precios antes de responder sobre productos.',
  '1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgVE2upms',
  'Lista de Precios!A:Z'
) RETURNING id;
```

Anotar el `id` retornado.

### Crear usuario del panel

1. En Supabase → **Authentication → Users → Add user** → ingresar email y contraseña
2. Anotar el UUID del usuario creado

```sql
INSERT INTO users (id, tenant_id, name, role)
VALUES (
  'uuid-del-usuario',   -- UUID del paso anterior
  'uuid-del-tenant',    -- ID retornado al crear el tenant
  'Admin',
  'admin'
);
```

3. Ir a `http://localhost:3000/login` e iniciar sesión con las credenciales creadas

---

## 7. Estructura del proyecto

```
agentewpp/
├── app/
│   ├── api/
│   │   ├── chats/
│   │   │   ├── route.ts                    # GET /api/chats
│   │   │   └── [id]/
│   │   │       ├── messages/route.ts       # GET /api/chats/:id/messages
│   │   │       └── toggle-automation/route.ts  # PATCH
│   │   ├── messages/
│   │   │   └── send/route.ts               # POST /api/messages/send
│   │   ├── webhooks/
│   │   │   └── twilio/route.ts             # POST webhook Twilio
│   │   └── internal/
│   │       ├── run-buffer-worker/route.ts  # GET/POST worker
│   │       └── process-message/route.ts   # POST procesar una conv
│   ├── dashboard/page.tsx                  # Panel principal
│   └── login/page.tsx
├── components/
│   └── panel/
│       ├── ChatList.tsx        # Lista de conversaciones con Realtime
│       ├── ChatWindow.tsx      # Ventana de mensajes con Realtime
│       ├── MessageBubble.tsx   # Burbuja con ticks de estado
│       ├── MessageInput.tsx    # Input de envío manual
│       ├── ChatHeader.tsx      # Encabezado con toggle
│       └── AutomationToggle.tsx  # Toggle IA/Manual con optimistic UI
├── lib/
│   ├── ai/
│   │   ├── agent.ts            # Loop Claude tool-calling
│   │   ├── tools.ts            # Definiciones get_catalog, derive_to_human
│   │   └── buffer.ts           # Upsert/claim del buffer
│   ├── google/
│   │   └── sheets.ts           # Caché raw rows, filtro por categoría
│   ├── messaging/
│   │   ├── index.ts            # Factory getMessagingProvider()
│   │   └── twilio-provider.ts  # Implementación Twilio
│   └── supabase/
│       ├── server.ts           # Cliente SSR (RLS del usuario)
│       ├── client.ts           # Cliente browser
│       └── admin.ts            # Service role (bypasa RLS)
├── scripts/
│   └── worker.ts               # Dev: polling cada 5s
├── supabase/
│   └── migrations/
│       ├── 001_initial.sql
│       └── 002_fix_rls_recursion.sql
├── types/
│   └── database.types.ts       # Tipos generados manualmente
└── vercel.json                  # Cron job producción
```

---

## 8. Troubleshooting

### RLS: `stack depth limit exceeded` (Postgres 54001)

**Causa:** `auth_tenant_id()` sin `SECURITY DEFINER` consultaba la tabla `users` con RLS activo, que a su vez volvía a llamar a `auth_tenant_id()` → loop infinito.

**Fix:** Migración `002_fix_rls_recursion.sql` recrea la función con `SECURITY DEFINER + SET search_path = public`. La policy de `users` usa `auth.uid()` directamente sin llamar a la función.

Si el panel muestra error 500 y en los logs de Supabase aparece `54001`, verificar que la migración 002 fue aplicada.

### Panel en blanco / `conversations.filter is not a function`

**Causa:** El componente `ChatList` recibía un objeto de error en lugar de un array cuando la API fallaba.

**Fix ya aplicado:** `ChatList.tsx` tiene guards `res.ok` + `Array.isArray(data)` + `try/catch/finally`.

Si reaparece, revisar la consola del servidor (`npm run dev`) para ver el error real de la API.

### Claude responde con `stop_reason: max_tokens`

**Causa:** `max_tokens` era 1024, el catálogo completo ocupa ~21k tokens, no quedaba espacio para la respuesta.

**Fix ya aplicado:** `max_tokens: 4096` en `lib/ai/agent.ts`. El tool `get_catalog` acepta parámetro `category` para filtrar en memoria (reducción ~93% de tokens para categorías específicas).

### Conversaciones de prueba del seed aparecen en el panel

Las conversaciones creadas manualmente en el SQL Editor tienen `tenant_id` arbitrario. Si el usuario del panel pertenece a otro tenant, RLS las oculta correctamente. Para limpiarlas:

```sql
DELETE FROM messages WHERE conversation_id IN (
  SELECT id FROM conversations WHERE contact_name LIKE '%Test%'
);
DELETE FROM conversations WHERE contact_name LIKE '%Test%';
```

### Twilio no entrega el webhook

1. Verificar que ngrok está corriendo y la URL en Twilio coincide exactamente
2. Verificar `TWILIO_WEBHOOK_URL` en `.env.local`
3. En dev, setear `TWILIO_SKIP_VALIDATION=true` si no se puede usar ngrok

### El worker no procesa mensajes

1. Verificar que `scripts/worker.ts` está corriendo (Terminal 3)
2. Verificar que `INTERNAL_WORKER_SECRET` en `.env.local` coincide con el valor configurado
3. Revisar la tabla `message_buffer` en Supabase — si hay filas con `processing=true` atascadas, resetear:
   ```sql
   UPDATE message_buffer SET processing = false WHERE processing = true;
   ```

### Imágenes/audio no se procesan

El soporte de media (imágenes, audio) está implementado en el webhook pero el transcriptor de audio (Whisper) está como stub. Las imágenes se pasan a Claude como bloques `image` base64. Si Twilio no puede autenticar el download del media, verificar `TWILIO_ACCOUNT_SID` y `TWILIO_AUTH_TOKEN`.
