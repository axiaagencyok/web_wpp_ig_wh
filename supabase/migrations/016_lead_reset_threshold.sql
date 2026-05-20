-- ─────────────────────────────────────────────────────────────────────────────
-- 016_lead_reset_threshold.sql
-- Threshold configurable (días) para reescorear leads recurrentes.
--
-- Cuando un cliente que ya tiene una row en "Leads" vuelve a escribir,
-- upsertLead chequea:
--   - estado IN ('Cerrado','Descartado'), o
--   - updated_at < NOW() - lead_reset_after_days días
-- Si cumple alguna → resetea (estado='Nuevo', notificado_at=null,
-- es_recurrente=true, compras_anteriores += 1) y vuelve a aplicar el
-- scoring del nuevo turno. Si no, update normal preservando flags.
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE tenants
  ADD COLUMN IF NOT EXISTS lead_reset_after_days integer DEFAULT 3;

COMMENT ON COLUMN tenants.lead_reset_after_days
  IS 'Días de inactividad después de los cuales un lead existente se considera "nuevo" otra vez y se vuelve a scorear desde cero (con flag es_recurrente=true). NULL se trata como el default del código (3).';
