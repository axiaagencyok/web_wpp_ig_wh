-- ─────────────────────────────────────────────────────────────────────────────
-- 018_deprecate_raw_prompts.sql
--
-- Marca las tres columnas de prompt crudo como DEPRECATED — el runtime
-- pasa a leer `lib/agents/compose-prompt.ts` que arma el system prompt
-- mergeando una plantilla base hardcodeada por agente + la configuración
-- estructurada de tenants (agent_tone, agent_orthography, agent_active_offer,
-- agent_business_hours, agent_temporary_closures, agent_special_instructions).
--
-- NO se vacían las columnas — la data queda como histórico por si hay que
-- consultarla. En una migración futura, una vez confirmado que todos los
-- clientes están sobre la nueva composición, se puede dropear.
-- ─────────────────────────────────────────────────────────────────────────────

COMMENT ON COLUMN tenants.agent_system_prompt
  IS 'DEPRECATED (2026-05): runtime ya no la lee. El system prompt del agente WhatsApp (Mati, ex-Lucas) se compone con lib/agents/compose-prompt.ts a partir de la configuración estructurada en tenants.agent_* (tone, orthography, etc.). Esta columna queda como histórico.';

COMMENT ON COLUMN tenants.ig_agent_system_prompt
  IS 'DEPRECATED (2026-05): runtime ya no la lee. El system prompt del agente Instagram (Cami/Matías) se compone con lib/agents/compose-prompt.ts. Esta columna queda como histórico.';

COMMENT ON COLUMN tenants.meli_agent_system_prompt
  IS 'DEPRECATED (2026-05): runtime ya no la lee. El system prompt del agente Mercado Libre (Matías MELI) se compone con lib/agents/compose-prompt.ts. El gate de "agent activo en MELI" pasó de "esta columna no-vacía" a tenant.meli_enabled = true. Esta columna queda como histórico.';
