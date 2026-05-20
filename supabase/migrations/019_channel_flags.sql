-- ─────────────────────────────────────────────────────────────────────────────
-- 019_channel_flags.sql
-- Feature flags por canal: controlan visibilidad de cada sección en el
-- sidebar del panel (Instagram / WhatsApp / Mercado Libre).
--
-- Convención (igual que `meli_enabled` introducido en migración 014):
-- - <channel>_enabled = false → el item del sidebar NO se renderiza para
--   ese tenant.
-- - <channel>_enabled = true  → el item aparece.
--
-- NO se gatea el runtime de los agentes sobre estos flags en esta migración.
-- WHD y GPI siguen procesando IG vía ManyChat como hasta ahora — los flags
-- solo afectan UI. PR C va a usar `whatsapp_enabled` para gatear el agente
-- WhatsApp Cloud API cuando ese flow esté wired.
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE tenants
  ADD COLUMN IF NOT EXISTS instagram_enabled boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS whatsapp_enabled  boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN tenants.instagram_enabled IS 'Feature flag UI: cuando false, la sección "Instagram" no aparece en la sidebar del panel para este tenant.';
COMMENT ON COLUMN tenants.whatsapp_enabled  IS 'Feature flag UI: cuando false, la sección "WhatsApp" no aparece en la sidebar del panel para este tenant. PR C va a usarlo además para gatear el runtime del agente WhatsApp Cloud API.';

-- ── Activación inicial para los tenants en uso hoy ───────────────────────────
-- WHD y GPI ya tienen IG funcionando via ManyChat, así que el flag refleja la
-- realidad. WhatsApp queda en false hasta que PR C cablee la integración.
-- Idempotente: si el tenant no existe, la UPDATE no hace nada.

UPDATE tenants
  SET instagram_enabled = true
  WHERE name IN ('White Diamond', 'GPI Todo en Pisos');
