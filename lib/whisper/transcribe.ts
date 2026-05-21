// Wrapper finito sobre OpenAI Whisper. Se mantiene separado del
// WhisperProvider de lib/transcription/ para que el flujo admin no
// dependa del registro de providers — el admin asistente lo invoca
// directamente cuando recibe un audio por Twilio.

import OpenAI from "openai";

let cachedClient: OpenAI | null = null;

function getClient(): OpenAI {
  if (!cachedClient) {
    if (!process.env.OPENAI_API_KEY) {
      throw new Error("OPENAI_API_KEY es requerido para Whisper");
    }
    cachedClient = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  }
  return cachedClient;
}

function extensionFromMime(mimeType: string): string {
  if (mimeType.includes("ogg"))  return "ogg";
  if (mimeType.includes("mpeg")) return "mp3";
  if (mimeType.includes("mp3"))  return "mp3";
  if (mimeType.includes("mp4"))  return "mp4";
  if (mimeType.includes("m4a"))  return "m4a";
  if (mimeType.includes("wav"))  return "wav";
  if (mimeType.includes("webm")) return "webm";
  return "ogg";
}

export async function transcribeAudio(
  audioBuffer: Buffer,
  options:     { mimeType?: string; language?: string } = {},
): Promise<string> {
  const { mimeType = "audio/ogg", language = "es" } = options;
  const ext  = extensionFromMime(mimeType);
  const file = new File([audioBuffer.buffer as ArrayBuffer], `audio.${ext}`, { type: mimeType });

  const response = await getClient().audio.transcriptions.create({
    file,
    model: "whisper-1",
    language,
  });

  return response.text.trim();
}
