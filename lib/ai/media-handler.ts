import type Anthropic from "@anthropic-ai/sdk";
import { adminClient } from "@/lib/supabase/admin";
import { getTranscriptionProvider } from "@/lib/transcription";
import type { Message } from "@/types/database.types";

const SUPPORTED_IMAGE_TYPES = ["image/jpeg", "image/png", "image/gif", "image/webp"];

/**
 * Descarga un archivo de Twilio con autenticación Basic.
 * Las URLs de media de Twilio requieren account_sid:auth_token.
 */
export async function downloadTwilioMedia(
  mediaUrl: string
): Promise<{ buffer: Buffer; contentType: string } | null> {
  const accountSid = process.env.TWILIO_ACCOUNT_SID;
  const authToken = process.env.TWILIO_AUTH_TOKEN;

  if (!accountSid || !authToken) return null;

  try {
    const credentials = Buffer.from(`${accountSid}:${authToken}`).toString("base64");
    const res = await fetch(mediaUrl, {
      headers: { Authorization: `Basic ${credentials}` },
    });

    if (!res.ok) {
      console.error(`[media] Error descargando ${mediaUrl}: ${res.status}`);
      return null;
    }

    const contentType = res.headers.get("content-type") ?? "application/octet-stream";
    const arrayBuffer = await res.arrayBuffer();
    return { buffer: Buffer.from(arrayBuffer), contentType };
  } catch (e) {
    console.error("[media] Error al descargar media:", (e as Error).message);
    return null;
  }
}

/**
 * Convierte una imagen de Twilio a un content block de Claude.
 * Devuelve null si no es un tipo soportado o falla la descarga.
 */
export async function buildImageContentBlock(
  mediaUrl: string,
  mediaType: string
): Promise<Anthropic.ImageBlockParam | null> {
  const normalizedType = mediaType.split(";")[0].trim().toLowerCase();

  if (!SUPPORTED_IMAGE_TYPES.includes(normalizedType)) {
    console.warn(`[media] Tipo de imagen no soportado por Claude: ${normalizedType}`);
    return null;
  }

  const downloaded = await downloadTwilioMedia(mediaUrl);
  if (!downloaded) return null;

  return {
    type: "image",
    source: {
      type: "base64",
      media_type: normalizedType as "image/jpeg" | "image/png" | "image/gif" | "image/webp",
      data: downloaded.buffer.toString("base64"),
    },
  };
}

/**
 * Construye el texto de un mensaje de audio para incluir en el contexto.
 * Si ya fue transcripto, usa eso. Si no, avisa al agente.
 */
export function buildAudioText(transcription: string | null): string {
  if (transcription && transcription.trim()) {
    return `[Audio transcripto]: ${transcription}`;
  }
  return "[El cliente envió un audio que no pudo transcribirse automáticamente]";
}

/**
 * Transcribe todos los mensajes de audio de una conversación que aún no tienen
 * transcripción, guardando el resultado en la DB. Se llama antes de buildMessageHistory.
 */
export async function transcribePendingAudio(messages: Message[]): Promise<void> {
  const audioMessages = messages.filter(
    (m) => m.media_type?.startsWith("audio") && m.media_url && !m.transcription
  );

  if (audioMessages.length === 0) return;

  let provider: ReturnType<typeof getTranscriptionProvider>;
  try {
    provider = getTranscriptionProvider();
  } catch {
    console.warn("[transcribe] OPENAI_API_KEY no configurado, omitiendo transcripción");
    return;
  }

  await Promise.all(
    audioMessages.map(async (msg) => {
      const downloaded = await downloadTwilioMedia(msg.media_url!);
      if (!downloaded) return;

      try {
        const text = await provider.transcribe(downloaded.buffer, downloaded.contentType);
        await adminClient
          .from("messages")
          .update({ transcription: text })
          .eq("id", msg.id);
        // Mutate in-place so buildMessageHistory sees the result without a re-fetch
        msg.transcription = text;
      } catch (e) {
        console.error(`[transcribe] Error transcribiendo mensaje ${msg.id}:`, (e as Error).message);
      }
    })
  );
}
