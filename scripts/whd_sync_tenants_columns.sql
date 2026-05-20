-- ─────────────────────────────────────────────────────────────────────────────
-- whd_sync_tenants_columns.sql
--
-- Bloque idempotente que sincroniza la tabla `tenants` (más el enum
-- catalog_source_type) con el schema que el código actual espera —
-- types/database.types.ts y todos los PATCH a /api/settings.
--
-- Origen del bug: WHD Supabase (project_ref alfmwtzlvljzuojnfxog) tiene
-- migraciones 003 → 019 sin aplicar. El panel hace PATCH con TODOS los
-- campos del schema TS de tenants y PostgREST devuelve 400 con
-- "Could not find the 'X' column of 'tenants'".
--
-- Esta consolidación contiene cada ADD COLUMN / CREATE TYPE que tocó
-- `tenants` entre 003 y 019. Todo IF NOT EXISTS / DO-block guarded —
-- safe de correr aunque alguna columna ya exista. NO modifica tablas
-- distintas a `tenants`, NO toca RLS, NO toca data — sólo schema.
--
-- Cómo correrlo en WHD:
--   SQL Editor del dashboard Supabase de WHD → New query → pegar todo
--   este archivo → Run.
-- ─────────────────────────────────────────────────────────────────────────────

-- ── Enum requerido por catalog_source (migración 012) ───────────────────────

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'catalog_source_type') THEN
    CREATE TYPE catalog_source_type AS ENUM ('sheets', 'pdf');
  END IF;
END $$;

-- ── Columnas en `tenants` ────────────────────────────────────────────────────
-- El orden replica los PRs 003 → 019. Cada ADD COLUMN trae IF NOT EXISTS
-- así que es seguro re-ejecutar contra una DB ya parcialmente migrada.

-- 003_crm_admin.sql
ALTER TABLE tenants
  ADD COLUMN IF NOT EXISTS admin_phone               text,
  ADD COLUMN IF NOT EXISTS admin_system_prompt       text;

-- 007_ig_agent_prompt.sql / 011_multitenant_prompts.sql
ALTER TABLE tenants
  ADD COLUMN IF NOT EXISTS ig_agent_system_prompt    text DEFAULT NULL;

-- 008_stories_context.sql
ALTER TABLE tenants
  ADD COLUMN IF NOT EXISTS stories_context_general   text DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS stories_context_keywords  text DEFAULT NULL;

-- 009_ads_context.sql
ALTER TABLE tenants
  ADD COLUMN IF NOT EXISTS ads_context_general       text DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS ads_context_keywords      text DEFAULT NULL;

-- 012_catalog_pdf_source.sql
ALTER TABLE tenants
  ADD COLUMN IF NOT EXISTS catalog_source            catalog_source_type NOT NULL DEFAULT 'sheets',
  ADD COLUMN IF NOT EXISTS catalog_pdf_path          text,
  ADD COLUMN IF NOT EXISTS catalog_text_cache        text,
  ADD COLUMN IF NOT EXISTS catalog_text_cached_at    timestamptz;

-- 013_leads_table.sql (columnas en tenants — la tabla "Leads" se omite acá
-- porque no la usa el flow de /api/settings; si hace falta se aplica con
-- la migración original)
ALTER TABLE tenants
  ADD COLUMN IF NOT EXISTS lead_notification_email   text,
  ADD COLUMN IF NOT EXISTS lead_scoring_prompt       text;

-- 014_meli_integration.sql (columnas en tenants)
ALTER TABLE tenants
  ADD COLUMN IF NOT EXISTS meli_agent_system_prompt  text,
  ADD COLUMN IF NOT EXISTS meli_auto_answer          boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS meli_enabled              boolean NOT NULL DEFAULT false;

-- 016_lead_reset_threshold.sql
ALTER TABLE tenants
  ADD COLUMN IF NOT EXISTS lead_reset_after_days     integer DEFAULT 3;

-- 017_tenant_agent_config.sql  ← acá vivían los errores reportados
ALTER TABLE tenants
  ADD COLUMN IF NOT EXISTS agent_tone                  text,
  ADD COLUMN IF NOT EXISTS agent_orthography           text[] NOT NULL DEFAULT ARRAY[]::text[],
  ADD COLUMN IF NOT EXISTS agent_active_offer          text,
  ADD COLUMN IF NOT EXISTS agent_business_hours        text,
  ADD COLUMN IF NOT EXISTS agent_business_hours_alert  boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS agent_temporary_closures    text,
  ADD COLUMN IF NOT EXISTS agent_special_instructions  text;

-- 019_channel_flags.sql
ALTER TABLE tenants
  ADD COLUMN IF NOT EXISTS instagram_enabled boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS whatsapp_enabled  boolean NOT NULL DEFAULT false;

-- ── Sanity check post-migración ──────────────────────────────────────────────
-- Si el cliente Supabase JS está cacheando el schema viejo (PostgREST), hay
-- que pegarle un reload para que reconozca las columnas nuevas.

NOTIFY pgrst, 'reload schema';

-- ── Verificación opcional ────────────────────────────────────────────────────
-- Corré ESTA query manualmente después del bloque para confirmar que todas
-- las columnas críticas existen. Debe devolver 31 filas (sin contar las
-- columnas de 001_initial que ya existían):
--
-- SELECT column_name
-- FROM information_schema.columns
-- WHERE table_schema = 'public' AND table_name = 'tenants'
-- ORDER BY ordinal_position;
