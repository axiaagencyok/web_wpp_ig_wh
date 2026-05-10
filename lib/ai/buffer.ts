import { adminClient } from "@/lib/supabase/admin";

/**
 * Inserta o actualiza la entrada del buffer para una conversación.
 * Si ya existe una entrada no-procesando, extiende el process_after.
 * Si no, crea una nueva.
 */
export async function upsertBuffer(
  conversationId: string,
  bufferSeconds: number
): Promise<void> {
  const processAfter = new Date(Date.now() + bufferSeconds * 1000).toISOString();

  // Intentar extender una entrada existente
  const { data: updated } = await adminClient
    .from("message_buffer")
    .update({ process_after: processAfter })
    .eq("conversation_id", conversationId)
    .eq("processing", false)
    .select("id");

  if (!updated || updated.length === 0) {
    // No había entrada pendiente — crear una nueva
    await adminClient.from("message_buffer").insert({
      conversation_id: conversationId,
      process_after: processAfter,
    });
  }
}

/**
 * Toma entradas listas (process_after < NOW, no procesando),
 * las marca como processing y devuelve sus conversation_ids.
 */
export async function claimReadyEntries(): Promise<
  { bufferId: string; conversationId: string }[]
> {
  const { data: entries } = await adminClient
    .from("message_buffer")
    .select("id, conversation_id")
    .lt("process_after", new Date().toISOString())
    .eq("processing", false)
    .limit(50); // proceso en lote de hasta 50

  if (!entries || entries.length === 0) return [];

  const ids = entries.map((e) => e.id);

  await adminClient
    .from("message_buffer")
    .update({ processing: true })
    .in("id", ids);

  return entries.map((e) => ({
    bufferId: e.id,
    conversationId: e.conversation_id,
  }));
}

export async function deleteBufferEntry(bufferId: string): Promise<void> {
  await adminClient.from("message_buffer").delete().eq("id", bufferId);
}
