-- ─────────────────────────────────────────────────────────────────────────────
-- 003_crm_admin.sql
-- Feature 1: CRM ligero en conversations
-- Feature 2: Admin-via-WhatsApp (admin_phone, admin_system_prompt en tenants)
-- ─────────────────────────────────────────────────────────────────────────────

-- ── Feature 1: CRM fields en conversations ──────────────────────────────────

ALTER TABLE conversations
  ADD COLUMN IF NOT EXISTS contact_email   text,
  ADD COLUMN IF NOT EXISTS notes           text,
  ADD COLUMN IF NOT EXISTS tags            text[]  DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS custom_fields   jsonb   DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS is_admin        boolean DEFAULT false;

-- ── Feature 2: Admin tenant config ──────────────────────────────────────────

ALTER TABLE tenants
  ADD COLUMN IF NOT EXISTS admin_phone         text,
  ADD COLUMN IF NOT EXISTS admin_system_prompt text;

-- pending_action: almacena la acción admin pendiente de confirmación
-- Se guarda como jsonb en conversations para no necesitar tabla extra.
ALTER TABLE conversations
  ADD COLUMN IF NOT EXISTS pending_action jsonb DEFAULT NULL;

-- Índice para buscar rápido el chat admin de un tenant
CREATE INDEX IF NOT EXISTS idx_conversations_is_admin
  ON conversations (tenant_id, is_admin)
  WHERE is_admin = true;

-- Índice para buscar por tags (GIN para arrays)
CREATE INDEX IF NOT EXISTS idx_conversations_tags
  ON conversations USING GIN (tags);
