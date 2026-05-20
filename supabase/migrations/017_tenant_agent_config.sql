-- ─────────────────────────────────────────────────────────────────────────────
-- 017_tenant_agent_config.sql
-- Config estructurada por tenant que el panel /settings expone como campos
-- editables (en vez de prompt crudo). Por ahora los agentes (Cami/Matías/
-- Lucas) NO la consumen — siguen leyendo *_agent_system_prompt como hoy.
-- Un PR futuro va a wirear compose-prompt que combine esta config con la
-- plantilla base del agente para generar el system prompt final.
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE tenants
  ADD COLUMN IF NOT EXISTS agent_tone                  text,
  ADD COLUMN IF NOT EXISTS agent_orthography           text[] NOT NULL DEFAULT ARRAY[]::text[],
  ADD COLUMN IF NOT EXISTS agent_active_offer          text,
  ADD COLUMN IF NOT EXISTS agent_business_hours        text,
  ADD COLUMN IF NOT EXISTS agent_business_hours_alert  boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS agent_temporary_closures    text,
  ADD COLUMN IF NOT EXISTS agent_special_instructions  text;

COMMENT ON COLUMN tenants.agent_tone                  IS 'Tono de habla del agente: "cercano_casual" / "profesional" / "argentino_divertido" / "neutro_formal".';
COMMENT ON COLUMN tenants.agent_orthography           IS 'Lista de reglas de estilo seleccionadas: "voseo_argentino", "sin_emojis", "emojis_moderados".';
COMMENT ON COLUMN tenants.agent_active_offer          IS 'Oferta vigente para mencionar en respuestas (ej. "20% OFF en SPC hasta el viernes").';
COMMENT ON COLUMN tenants.agent_business_hours        IS 'Horario de atención en formato libre.';
COMMENT ON COLUMN tenants.agent_business_hours_alert  IS 'Si true, el agente avisa al cliente cuando se contesta fuera del horario configurado.';
COMMENT ON COLUMN tenants.agent_temporary_closures    IS 'Cierres temporales en formato libre (ej. "Cerrado del 24/12 al 02/01").';
COMMENT ON COLUMN tenants.agent_special_instructions  IS 'Instrucciones libres que no entran en los otros campos. Máx 500 chars desde el panel.';
