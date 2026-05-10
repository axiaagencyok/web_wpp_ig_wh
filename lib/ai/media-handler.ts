import type Anthropic from "@anthropic-ai/sdk";

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
