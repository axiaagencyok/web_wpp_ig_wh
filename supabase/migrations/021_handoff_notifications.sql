-- ─────────────────────────────────────────────────────────────────────────────
-- 021_handoff_notifications.sql
-- ISSUE 1 — mail al derivar chat a humano.
--
-- Es independiente del mail de leads existente (lead_notification_email,
-- migración 013). Este se dispara cuando una conversación pasa a
-- automation_paused=true por paused_reason='derived_to_human', con un
-- resumen LLM-generated de los últimos N mensajes.
--
-- Columnas nuevas:
--   - tenants.handoff_notification_email     text (nullable)
--   - tenants.handoff_notifications_enabled  boolean default true
--   - conversations.last_handoff_email_at    timestamptz (anti-spam)
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE tenants
  ADD COLUMN IF NOT EXISTS handoff_notification_email   text,
  ADD COLUMN IF NOT EXISTS handoff_notifications_enabled boolean NOT NULL DEFAULT true;

COMMENT ON COLUMN tenants.handoff_notification_email IS
  'Mail al que se notifica cuando un chat se deriva a humano. NULL = no enviar (independiente de handoff_notifications_enabled, que solo gate-a el envío si el mail está cargado).';

COMMENT ON COLUMN tenants.handoff_notifications_enabled IS
  'Toggle UI: cuando false, no se envía mail de derivación aunque haya email cargado.';

ALTER TABLE conversations
  ADD COLUMN IF NOT EXISTS last_handoff_email_at timestamptz;

COMMENT ON COLUMN conversations.last_handoff_email_at IS
  'Última vez que se envió mail de handoff para este chat. Anti-spam: si se intenta enviar otro dentro de 60 min, skip silencioso.';

NOTIFY pgrst, 'reload schema';
