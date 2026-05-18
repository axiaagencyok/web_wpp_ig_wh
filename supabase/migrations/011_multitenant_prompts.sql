-- ─────────────────────────────────────────────────────────────────────────────
-- 011_multitenant_prompts.sql
-- Asegura las columnas necesarias para correr múltiples clientes con prompts
-- almacenados en DB en lugar de hardcodeados en el código.
--
-- Nota: las tres columnas (`name`, `agent_system_prompt`, `ig_agent_system_prompt`)
-- ya existen en migraciones previas (001 y 007). Esta migración es idempotente
-- y sólo añade lo que falte, para que entornos creados desde cero o con un
-- baseline distinto queden alineados antes de correr el seed de prompts.
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE tenants
  ADD COLUMN IF NOT EXISTS agent_system_prompt    text,
  ADD COLUMN IF NOT EXISTS ig_agent_system_prompt text;

-- `name` ya está como NOT NULL en 001; no se redefine acá para no romper el
-- constraint existente.
