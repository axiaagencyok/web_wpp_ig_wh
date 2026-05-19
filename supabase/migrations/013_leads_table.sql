-- ─────────────────────────────────────────────────────────────────────────────
-- 013_leads_table.sql
-- Tabla `Leads` (con L mayúscula, identificador quoted — el dashboard Lovable
-- la consume así). Aislamiento multi-tenant por RLS igual que el resto.
-- Además agrega dos columnas a `tenants` para notificaciones por mail
-- y para el prompt del agente de scoring.
-- ─────────────────────────────────────────────────────────────────────────────

-- ── Nuevas columnas en tenants ───────────────────────────────────────────────

ALTER TABLE tenants
  ADD COLUMN IF NOT EXISTS lead_notification_email text,
  ADD COLUMN IF NOT EXISTS lead_scoring_prompt     text;

COMMENT ON COLUMN tenants.lead_notification_email IS 'Destino del mail con leads calificados. Si NULL, no se envían notificaciones.';
COMMENT ON COLUMN tenants.lead_scoring_prompt     IS 'System prompt del agente que extrae datos y puntúa el lead. Si NULL, scoring deshabilitado.';

-- ── Tabla Leads ──────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS "Leads" (
  id                    bigserial PRIMARY KEY,
  tenant_id             uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  conversation_id       uuid REFERENCES conversations(id) ON DELETE SET NULL,
  manychat_id           text,
  instagram_user        text,
  nombre                text,
  zona                  text,
  tipo_proyecto         text CHECK (tipo_proyecto IN ('Obra nueva','Refacción','Comercial','Otro')),
  m2_estimados          integer,
  producto_interes      text,
  urgencia              text CHECK (urgencia IN ('Inmediata','1-3 meses','+3 meses')),
  lead_score            integer,
  resumen_conversacion  text,
  estado                text DEFAULT 'Nuevo' CHECK (estado IN ('Nuevo','Contactado','Cerrado','Descartado')),
  notas                 text,
  es_recurrente         boolean DEFAULT false,
  compras_anteriores    integer DEFAULT 0,
  notificado_at         timestamptz,
  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now()
);

-- Unique parcial: pega el upsert cuando manychat_id existe.
-- Sin esto un mismo subscriber crearía rows duplicadas.
CREATE UNIQUE INDEX IF NOT EXISTS leads_tenant_manychat_unique
  ON "Leads" (tenant_id, manychat_id)
  WHERE manychat_id IS NOT NULL;

-- Indexes para queries típicas del dashboard
CREATE INDEX IF NOT EXISTS leads_tenant_score_idx
  ON "Leads" (tenant_id, lead_score DESC NULLS LAST);

CREATE INDEX IF NOT EXISTS leads_tenant_created_idx
  ON "Leads" (tenant_id, created_at DESC);

-- ── Trigger updated_at ───────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS leads_set_updated_at ON "Leads";
CREATE TRIGGER leads_set_updated_at
  BEFORE UPDATE ON "Leads"
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ── RLS ──────────────────────────────────────────────────────────────────────

ALTER TABLE "Leads" ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "tenant_isolation" ON "Leads";
CREATE POLICY "tenant_isolation" ON "Leads"
  FOR ALL USING (tenant_id = auth_tenant_id());

-- ── Realtime ─────────────────────────────────────────────────────────────────
-- Idempotente: chequeamos antes de agregar a la publication para que rerruns
-- contra un Supabase ya migrado no fallen con 42710 duplicate_object.

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND tablename = 'Leads' AND schemaname = 'public'
  ) THEN
    EXECUTE 'ALTER PUBLICATION supabase_realtime ADD TABLE public."Leads"';
  END IF;
END $$;
