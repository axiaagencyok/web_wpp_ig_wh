-- Add retry counter to message_buffer
ALTER TABLE message_buffer
  ADD COLUMN IF NOT EXISTS retry_count integer DEFAULT 0 NOT NULL;

-- Atomic claim function: marks rows as processing in a single statement
-- using FOR UPDATE SKIP LOCKED so concurrent workers never double-claim.
CREATE OR REPLACE FUNCTION claim_buffer_entries(batch_limit integer DEFAULT 50)
RETURNS TABLE(id uuid, conversation_id uuid, retry_count integer)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  UPDATE message_buffer mb
  SET    processing = true
  FROM (
    SELECT mb2.id
    FROM   message_buffer mb2
    WHERE  mb2.process_after < NOW()
      AND  mb2.processing   = false
      AND  mb2.retry_count  < 3
    ORDER  BY mb2.process_after
    LIMIT  batch_limit
    FOR UPDATE SKIP LOCKED
  ) candidates
  WHERE  mb.id = candidates.id
  RETURNING mb.id, mb.conversation_id, mb.retry_count;
END;
$$;
