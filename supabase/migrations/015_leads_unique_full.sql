-- ─────────────────────────────────────────────────────────────────────────────
-- 015_leads_unique_full.sql
--
-- Fix de un bug en producción: upsertLead falla con
--   "no unique or exclusion constraint matching the ON CONFLICT specification"
-- porque la migración 013 creó el índice como PARCIAL
-- (`WHERE manychat_id IS NOT NULL`). Postgres NO matchea un índice parcial
-- contra un `ON CONFLICT (tenant_id, manychat_id)` a menos que la sentencia
-- repita el mismo WHERE — y supabase-js / PostgREST no aceptan WHERE en el
-- parámetro `on_conflict`.
--
-- Solución: reemplazar el índice por uno SIN WHERE. Misma semántica de
-- aislamiento (Postgres considera NULLs distintos por default en UNIQUE, así
-- que múltiples rows con manychat_id NULL siguen siendo válidas para el
-- mismo tenant — comportamiento equivalente al WHERE explícito anterior).
-- ─────────────────────────────────────────────────────────────────────────────

DROP INDEX IF EXISTS leads_tenant_manychat_unique;

CREATE UNIQUE INDEX IF NOT EXISTS leads_tenant_manychat_unique
  ON "Leads" (tenant_id, manychat_id);
