-- ─────────────────────────────────────────────────────────────────────────────
-- 014_meli_integration.sql
-- Mercado Libre como tercer canal (junto a WhatsApp e Instagram).
--   - meli_accounts: tokens OAuth por tenant
--   - meli_questions: bandeja de preguntas con respuesta AI sugerida
--   - tenants.meli_agent_system_prompt / .meli_auto_answer: config por cliente
-- ─────────────────────────────────────────────────────────────────────────────

-- ── meli_accounts ────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS meli_accounts (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  meli_user_id    bigint NOT NULL,
  meli_nickname   text,
  access_token    text NOT NULL,
  refresh_token   text NOT NULL,
  expires_at      timestamptz NOT NULL,
  scope           text,
  -- Estado del enlace OAuth. Cuando un refresh falla con 401, marcamos
  -- 'needs_reauth' para que el panel pida al operador reconectar.
  status          text NOT NULL DEFAULT 'connected' CHECK (status IN ('connected','needs_reauth')),
  connected_at    timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, meli_user_id)
);

CREATE INDEX IF NOT EXISTS meli_accounts_tenant_idx ON meli_accounts (tenant_id);
-- Lookup más frecuente: webhook viene con meli_user_id y necesitamos el tenant.
CREATE INDEX IF NOT EXISTS meli_accounts_user_idx ON meli_accounts (meli_user_id);

-- ── meli_questions ───────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS meli_questions (
  id                    bigserial PRIMARY KEY,
  tenant_id             uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  meli_account_id       uuid REFERENCES meli_accounts(id) ON DELETE SET NULL,
  meli_question_id      bigint NOT NULL UNIQUE,
  item_id               text NOT NULL,
  item_title            text,
  item_price            numeric,
  item_thumbnail        text,
  text                  text NOT NULL,
  from_user_id          bigint,
  from_user_nickname    text,
  status                text NOT NULL DEFAULT 'pending'
                          CHECK (status IN ('pending','answered','deleted')),
  ai_suggested_answer   text,
  sent_answer           text,
  answered_at           timestamptz,
  sent_by               text CHECK (sent_by IN ('ai','human')),
  date_created          timestamptz NOT NULL,
  received_at           timestamptz NOT NULL DEFAULT now(),
  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS meli_questions_tenant_status_idx
  ON meli_questions (tenant_id, status, date_created DESC);

CREATE INDEX IF NOT EXISTS meli_questions_tenant_account_idx
  ON meli_questions (tenant_id, meli_account_id);

-- ── Triggers updated_at (reusan set_updated_at() creado en 013) ──────────────

DROP TRIGGER IF EXISTS meli_accounts_set_updated_at  ON meli_accounts;
CREATE TRIGGER meli_accounts_set_updated_at
  BEFORE UPDATE ON meli_accounts
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

DROP TRIGGER IF EXISTS meli_questions_set_updated_at ON meli_questions;
CREATE TRIGGER meli_questions_set_updated_at
  BEFORE UPDATE ON meli_questions
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ── RLS ──────────────────────────────────────────────────────────────────────

ALTER TABLE meli_accounts  ENABLE ROW LEVEL SECURITY;
ALTER TABLE meli_questions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "tenant_isolation" ON meli_accounts;
CREATE POLICY "tenant_isolation" ON meli_accounts
  FOR ALL USING (tenant_id = auth_tenant_id());

DROP POLICY IF EXISTS "tenant_isolation" ON meli_questions;
CREATE POLICY "tenant_isolation" ON meli_questions
  FOR ALL USING (tenant_id = auth_tenant_id());

-- ── Realtime — agregado idempotente (evita 42710 duplicate_object en reruns) ─

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND tablename = 'meli_questions' AND schemaname = 'public'
  ) THEN
    EXECUTE 'ALTER PUBLICATION supabase_realtime ADD TABLE public.meli_questions';
  END IF;
END $$;

-- ── tenants: nuevas columnas ─────────────────────────────────────────────────

ALTER TABLE tenants
  ADD COLUMN IF NOT EXISTS meli_agent_system_prompt text,
  ADD COLUMN IF NOT EXISTS meli_auto_answer         boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS meli_enabled             boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN tenants.meli_agent_system_prompt IS 'System prompt del agente MELI. Si NULL, el agente no genera respuestas para este tenant.';
COMMENT ON COLUMN tenants.meli_auto_answer         IS 'Si true, el agente envía la respuesta directamente al cliente sin esperar aprobación humana.';
COMMENT ON COLUMN tenants.meli_enabled             IS 'Feature flag UI: cuando false, la entrada "Mercado Libre" no aparece en la sidebar del panel para este tenant.';
