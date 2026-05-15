ALTER TABLE tenants
  ADD COLUMN IF NOT EXISTS ig_agent_system_prompt text DEFAULT NULL;
