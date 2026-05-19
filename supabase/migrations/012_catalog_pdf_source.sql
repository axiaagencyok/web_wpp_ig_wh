-- ─────────────────────────────────────────────────────────────────────────────
-- 012_catalog_pdf_source.sql
-- Soporte para catálogo en PDF como alternativa a Google Sheets.
--
-- Default = 'sheets', así que los tenants existentes (WHD) quedan intactos.
-- El bucket de Storage `catalogs` se crea fuera de SQL (Dashboard), siguiendo
-- la convención existente del proyecto para buckets (ver `tts-audio`).
-- ─────────────────────────────────────────────────────────────────────────────

DO $$ BEGIN
  CREATE TYPE catalog_source_type AS ENUM ('sheets', 'pdf');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

ALTER TABLE tenants
  ADD COLUMN IF NOT EXISTS catalog_source         catalog_source_type NOT NULL DEFAULT 'sheets',
  ADD COLUMN IF NOT EXISTS catalog_pdf_path       text,
  ADD COLUMN IF NOT EXISTS catalog_text_cache     text,
  ADD COLUMN IF NOT EXISTS catalog_text_cached_at timestamptz;

COMMENT ON COLUMN tenants.catalog_source         IS 'Fuente del catálogo: sheets (Google Sheets) o pdf (Supabase Storage).';
COMMENT ON COLUMN tenants.catalog_pdf_path       IS 'Path en el bucket `catalogs` cuando catalog_source = pdf. Convención: {tenant_id}/catalog.pdf';
COMMENT ON COLUMN tenants.catalog_text_cache     IS 'Texto extraído del PDF (cache para no re-parsear cada turno).';
COMMENT ON COLUMN tenants.catalog_text_cached_at IS 'Cuándo se llenó catalog_text_cache. Se invalida cuando el PDF en Storage tiene updated_at posterior.';
