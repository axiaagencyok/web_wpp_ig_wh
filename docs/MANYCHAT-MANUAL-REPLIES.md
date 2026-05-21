# ManyChat — Forwarding manual replies al panel

Si el operador responde manualmente desde la app de Instagram (o desde Live
Chat de ManyChat), esos mensajes **no** aparecen en el panel a menos que
ManyChat los reenvíe a nuestro webhook con un flow específico.

ManyChat sí permite eso. Setup:

## 1. Crear un Custom Field `manual_reply` (boolean)

ManyChat → **Settings → Custom Fields → New** :

- Name: `manual_reply`
- Type: Boolean
- Default: `false`

## 2. Flow que se dispara cuando el bot está pausado (= operador tomó el chat)

ManyChat → **Automation → Default Reply** (o un Conversation Trigger
equivalente):

1. **Trigger:** "Conversation Status changes to Live Chat" (o "Bot paused").
2. **Action 1 — Set Custom Field:**
   - `manual_reply` = `true`
3. **Action 2 — External Request:**
   - Method: `POST`
   - URL: `https://${PROD_DOMAIN}/api/webhooks/manychat`
   - Body type: JSON, raw
   - Body:
     ```json
     {
       "full-data": {
         "id": "{{user_id}}",
         "first_name": "{{first_name}}",
         "ig_username": "{{ig_username}}",
         "last_input_text": "",
         "last_output_text": "{{last_output_text}}",
         "ig_last_interaction": "{{ig_last_interaction}}",
         "custom_fields": {
           "manual_reply": true
         }
       }
     }
     ```
4. **Action 3 — Set Custom Field:**
   - `manual_reply` = `false` (consume one-shot, igual que story_reply / ad_click)

## 3. Comportamiento del webhook

Cuando llega un payload con `custom_fields.manual_reply: true`:

- El texto se lee de `last_output_text` (no `last_input_text`).
- Se inserta en `messages` con `direction: 'outbound'` y `sender: 'human'`.
- **No** se encola al buffer — Cami no responde.
- Aparece en el panel como mensaje del operador (burbuja a la derecha).

Cuando llega un payload normal de subscriber (sin `manual_reply`):

- Se procesa como antes — `direction: 'inbound'`, `sender: 'contact'`, se
  encola al buffer si `agent_enabled` y `automation_paused = false`.

## 4. Verificación

Después de configurar el flow:

1. Conversación de prueba con tu IG personal → manda un mensaje al brand.
2. Pausá el bot en ManyChat (o respondé desde la app de Instagram).
3. El mensaje del operador debe aparecer en `/instagram` del panel,
   alineado a la derecha, sin que Cami responda encima.

Si NO aparece, chequear:

- Vercel logs → buscar `[ig-webhook] @{username}` con el payload manual.
- Que `custom_fields.manual_reply` esté llegando como `true` (no string
  vacío ni `False` con mayúscula — el webhook acepta `true`, `"true"`,
  `"Yes"`, `"1"`).
- Que `last_output_text` tenga el texto real (a veces ManyChat lo deja
  vacío si el flow no captura bien).
