-- ─────────────────────────────────────────────────────────────────────────────
-- 022_tenant_manychat_key.sql
-- Per-tenant ManyChat API key.
--
-- Hasta ahora el backend usaba `process.env.MANYCHAT_API_KEY` (un único
-- valor global), lo que impedía operar dos cuentas de ManyChat en paralelo
-- (una por tenant con Instagram). Esta migración agrega la columna y los
-- callers (sendInstagramMessage / pauseBot / resumeBot / clear*Flag) leen
-- desde el tenant. Si la columna está NULL, se hace fallback a la env var
-- para no romper deploys existentes.
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE tenants
  ADD COLUMN IF NOT EXISTS manychat_api_key text;

COMMENT ON COLUMN tenants.manychat_api_key IS 'API key del ManyChat account de este tenant. Si NULL, se usa MANYCHAT_API_KEY env var (back-compat).';
