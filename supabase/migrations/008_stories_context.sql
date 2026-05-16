ALTER TABLE tenants
  ADD COLUMN IF NOT EXISTS stories_context_general  text DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS stories_context_keywords text DEFAULT NULL;
