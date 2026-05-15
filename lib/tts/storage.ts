import { adminClient } from "@/lib/supabase/admin";

const BUCKET = "tts-audio";

export async function uploadAudio(audioBuffer: Buffer, filename: string): Promise<string> {
  const { error } = await adminClient.storage
    .from(BUCKET)
    .upload(filename, audioBuffer, {
      contentType: "audio/mpeg",
      upsert: true,
    });

  if (error) throw new Error(`[tts/storage] Upload failed: ${error.message}`);

  const { data } = adminClient.storage.from(BUCKET).getPublicUrl(filename);
  return data.publicUrl;
}
