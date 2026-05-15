-- Add channel column to distinguish WhatsApp vs Instagram conversations
ALTER TABLE conversations
  ADD COLUMN IF NOT EXISTS channel text NOT NULL DEFAULT 'whatsapp'
  CHECK (channel IN ('whatsapp', 'instagram'));
