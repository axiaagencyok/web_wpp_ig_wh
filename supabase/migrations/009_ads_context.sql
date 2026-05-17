ALTER TABLE tenants
  ADD COLUMN IF NOT EXISTS ads_context_general  text DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS ads_context_keywords text DEFAULT NULL;
