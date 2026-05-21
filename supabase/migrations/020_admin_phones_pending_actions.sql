-- ─────────────────────────────────────────────────────────────────────────────
-- 020_admin_phones_pending_actions.sql
-- PR D — Admin assistant vía WhatsApp con confirmación explícita SI/NO.
--
-- Coexiste con el admin-agent existente (lib/ai/admin-agent.ts) que usa
-- `tenants.admin_phone` y confirmación dentro del loop Claude. Este PR
-- introduce un flujo paralelo y determinista:
--   1) parse intent → propose
--   2) admin contesta SI/NO
--   3) ejecutamos o descartamos
--
-- Tablas:
--   - tenant_admin_phones    : multi-admin por tenant (E.164)
--   - pending_admin_actions  : estado intermedio antes de confirmar
--
-- RLS aislada por tenant igual que el resto (auth_tenant_id()).
-- ─────────────────────────────────────────────────────────────────────────────

-- ── tenant_admin_phones ──────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS tenant_admin_phones (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id     uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  phone_number  text NOT NULL,
  admin_name    text,
  is_active     boolean NOT NULL DEFAULT true,
  created_at    timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, phone_number)
);

COMMENT ON TABLE  tenant_admin_phones IS 'Admins autorizados a operar el agente vía WhatsApp. phone_number en E.164 sin prefijo whatsapp:.';
COMMENT ON COLUMN tenant_admin_phones.phone_number IS 'Formato E.164 ej. +5491133334444. El webhook compara contra el From de Twilio quitando el prefijo whatsapp:.';
COMMENT ON COLUMN tenant_admin_phones.is_active     IS 'Si false el webhook lo ignora silenciosamente.';

CREATE INDEX IF NOT EXISTS tenant_admin_phones_phone_idx
  ON tenant_admin_phones (phone_number)
  WHERE is_active;

-- ── pending_admin_actions ────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS pending_admin_actions (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  admin_phone     text NOT NULL,
  action_type     text NOT NULL CHECK (action_type IN ('update_price','update_agent_config','update_context')),
  action_payload  jsonb NOT NULL,
  human_summary   text NOT NULL,
  status          text NOT NULL DEFAULT 'pending'
                    CHECK (status IN ('pending','confirmed','rejected','expired')),
  created_at      timestamptz NOT NULL DEFAULT now(),
  expires_at      timestamptz NOT NULL DEFAULT (now() + interval '10 minutes'),
  resolved_at     timestamptz
);

COMMENT ON TABLE  pending_admin_actions IS 'Propuestas de cambio del admin pendientes de confirmación SI/NO.';
COMMENT ON COLUMN pending_admin_actions.action_payload IS 'Payload tipado según action_type. update_price: {sheet_match,column,new_value}. update_agent_config: {field,new_value}. update_context: {context_type,field,content}.';
COMMENT ON COLUMN pending_admin_actions.human_summary  IS 'Texto en español que se mandó al admin cuando se propuso el cambio. Sirve para que el admin recuerde qué confirma.';

-- Lookup típico: la última pending del admin no expirada.
CREATE INDEX IF NOT EXISTS pending_admin_actions_lookup_idx
  ON pending_admin_actions (admin_phone, status, created_at DESC);

-- ── RLS ──────────────────────────────────────────────────────────────────────

ALTER TABLE tenant_admin_phones    ENABLE ROW LEVEL SECURITY;
ALTER TABLE pending_admin_actions  ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "tenant_isolation" ON tenant_admin_phones;
CREATE POLICY "tenant_isolation" ON tenant_admin_phones
  FOR ALL USING (tenant_id = auth_tenant_id());

DROP POLICY IF EXISTS "tenant_isolation" ON pending_admin_actions;
CREATE POLICY "tenant_isolation" ON pending_admin_actions
  FOR ALL USING (tenant_id = auth_tenant_id());

-- ── Seed: portar tenants.admin_phone existente al nuevo modelo ──────────────
-- Idempotente: ON CONFLICT DO NOTHING. Si un tenant ya tenía admin_phone
-- configurado, aparece como admin activo en la nueva tabla sin requerir
-- migración manual.

INSERT INTO tenant_admin_phones (tenant_id, phone_number, admin_name, is_active)
SELECT
  t.id,
  -- admin_phone viene en formato whatsapp:+549... — guardamos E.164 limpio.
  CASE
    WHEN t.admin_phone LIKE 'whatsapp:%' THEN substring(t.admin_phone FROM 10)
    ELSE t.admin_phone
  END,
  'Admin principal',
  true
FROM tenants t
WHERE t.admin_phone IS NOT NULL AND t.admin_phone <> ''
ON CONFLICT (tenant_id, phone_number) DO NOTHING;
