ALTER TABLE conversations
  ADD COLUMN IF NOT EXISTS deal_status text DEFAULT 'nuevo' NOT NULL;

ALTER TABLE conversations
  DROP CONSTRAINT IF EXISTS conversations_deal_status_check;

ALTER TABLE conversations
  ADD CONSTRAINT conversations_deal_status_check
  CHECK (deal_status IN ('nuevo', 'contactado', 'esperando_pago', 'pago_pendiente', 'cerrado'));
