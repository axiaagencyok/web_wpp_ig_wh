import { ElevenLabsClient } from "elevenlabs";

const client = new ElevenLabsClient({
  apiKey: process.env.ELEVENLABS_API_KEY!,
});

// Voice ID por defecto — cambiá en .env si querés otra voz
const DEFAULT_VOICE_ID = process.env.ELEVENLABS_VOICE_ID ?? "EXAVITQu4vr4xnSDxMaL"; // Sarah

export async function generateAudio(text: string): Promise<Buffer> {
  const stream = await client.textToSpeech.convert(DEFAULT_VOICE_ID, {
    text,
    model_id: "eleven_multilingual_v2",
    output_format: "mp3_44100_128",
    voice_settings: {
      stability: 0.35,         // más variación = más natural
      similarity_boost: 0.75,
      style: 0.4,              // expresividad
      use_speaker_boost: true,
    },
  });

  const chunks: Buffer[] = [];
  for await (const chunk of stream) {
    chunks.push(Buffer.from(chunk));
  }
  return Buffer.concat(chunks);
}
