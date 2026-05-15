import { adminClient } from "@/lib/supabase/admin";

export async function upsertBuffer(
  conversationId: string,
  bufferSeconds: number
): Promise<void> {
  const processAfter = new Date(Date.now() + bufferSeconds * 1000).toISOString();

  // Try insert first. If a row already exists (unique violation on conversation_id),
  // update process_after only when not mid-processing — avoids creating duplicate
  // entries that would trigger multiple simultaneous Anthropic calls.
  const { error } = await adminClient.from("message_buffer").insert({
    conversation_id: conversationId,
    process_after: processAfter,
  });

  if (!error) return;

  if (error.code === "23505") {
    await adminClient
      .from("message_buffer")
      .update({ process_after: processAfter })
      .eq("conversation_id", conversationId)
      .eq("processing", false);
    return;
  }

  console.error("[buffer] upsertBuffer unexpected error:", error.message);
}

/**
 * Atomically claims ready entries via a single UPDATE…FOR UPDATE SKIP LOCKED.
 * Two concurrent workers will never claim the same row.
 */
export async function claimReadyEntries(
  batchLimit = 5
): Promise<{ bufferId: string; conversationId: string; retryCount: number }[]> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (adminClient as any).rpc("claim_buffer_entries", {
    batch_limit: batchLimit,
  });

  if (error) {
    console.error("[buffer] Error claiming entries:", (error as { message: string }).message);
    return [];
  }

  return ((data ?? []) as { id: string; conversation_id: string; retry_count: number }[]).map(
    (e) => ({
      bufferId: e.id,
      conversationId: e.conversation_id,
      retryCount: e.retry_count,
    })
  );
}

export async function deleteBufferEntry(bufferId: string): Promise<void> {
  await adminClient.from("message_buffer").delete().eq("id", bufferId);
}

/**
 * After successfully processing a conversation, checks if new inbound messages
 * arrived while processing was running (i.e. the buffer update was silently
 * skipped because processing=true).  If yes, re-queues the conversation so
 * those messages get answered.
 */
export async function requeueIfPendingMessages(conversationId: string): Promise<void> {
  const { data: lastInbound } = await adminClient
    .from("messages")
    .select("created_at")
    .eq("conversation_id", conversationId)
    .eq("direction", "inbound")
    .order("created_at", { ascending: false })
    .limit(1)
    .single();

  if (!lastInbound) return;

  const { data: lastOutbound } = await adminClient
    .from("messages")
    .select("created_at")
    .eq("conversation_id", conversationId)
    .eq("direction", "outbound")
    .eq("sender", "ai")
    .order("created_at", { ascending: false })
    .limit(1)
    .single();

  const inboundAt  = new Date(lastInbound.created_at);
  const outboundAt = lastOutbound ? new Date(lastOutbound.created_at) : new Date(0);

  if (inboundAt > outboundAt) {
    console.log(`[buffer] Pending messages detected after processing ${conversationId}, re-queuing`);
    await upsertBuffer(conversationId, 5);
  }
}

/**
 * Called when processing fails. Increments retry_count, resets processing=false,
 * and applies exponential backoff (30s → 90s) before the next attempt.
 * After 3 failures (retry_count 0→1→2→deleted) the entry is abandoned.
 */
export async function releaseBufferEntry(
  bufferId: string,
  retryCount: number
): Promise<void> {
  const nextRetry = retryCount + 1;
  if (nextRetry >= 3) {
    await deleteBufferEntry(bufferId);
    console.warn(`[buffer] Entry ${bufferId} abandoned after ${nextRetry} attempts`);
    return;
  }
  // Exponential backoff: 30 s on first retry, 90 s on second
  const backoffMs = 30_000 * Math.pow(3, retryCount);
  const processAfter = new Date(Date.now() + backoffMs).toISOString();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await (adminClient.from("message_buffer") as any)
    .update({ processing: false, retry_count: nextRetry, process_after: processAfter })
    .eq("id", bufferId);
}
