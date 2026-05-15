import OpenAI from "openai";

const IMAGE_ANALYSIS_PROMPT = `Sos un analizador de imágenes para una tienda de tecnología.

Analizá la imagen y describí en 2 o 3 oraciones cortas qué se ve, enfocándote en:
- Si es un producto: qué producto es, qué marca y modelo se ven, y si parece nuevo o usado.
- Si es un producto roto o con falla: qué producto es y qué daño o problema se ve visualmente.
- Si es una captura de precio o publicación de otra tienda: qué producto es, qué precio se ve y de qué tienda o plataforma es.

Si la imagen no entra en ninguna de estas categorías, describí brevemente qué se ve.
Respondé siempre en español, de forma clara y directa. Sin saludos, sin explicaciones extras.`;

function getOpenAI(): OpenAI {
  if (!process.env.OPENAI_API_KEY) throw new Error("OPENAI_API_KEY not set");
  return new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
}

async function downloadMedia(
  url: string
): Promise<{ buffer: Buffer; contentType: string } | null> {
  try {
    const res = await fetch(url);
    if (!res.ok) {
      console.error(`[ig-media] Download failed ${res.status}: ${url}`);
      return null;
    }
    const contentType = res.headers.get("content-type") ?? "application/octet-stream";
    const arrayBuffer = await res.arrayBuffer();
    return { buffer: Buffer.from(arrayBuffer), contentType: contentType.split(";")[0].trim() };
  } catch (e) {
    console.error("[ig-media] Error downloading:", (e as Error).message);
    return null;
  }
}

async function transcribeAudio(buffer: Buffer): Promise<string> {
  const openai = getOpenAI();
  const blob = new Blob([new Uint8Array(buffer)], { type: "video/mp4" });
  const file = new File([blob], "audio.mp4", { type: "video/mp4" });
  const transcription = await openai.audio.transcriptions.create({
    file,
    model: "whisper-1",
    language: "es",
  });
  return transcription.text;
}

async function analyzeImage(
  buffer: Buffer,
  mimeType: "image/jpeg" | "image/png"
): Promise<string> {
  const openai = getOpenAI();
  const base64 = buffer.toString("base64");
  const response = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    max_tokens: 300,
    messages: [
      {
        role: "user",
        content: [
          { type: "text", text: IMAGE_ANALYSIS_PROMPT },
          {
            type: "image_url",
            image_url: { url: `data:${mimeType};base64,${base64}` },
          },
        ],
      },
    ],
  });
  return response.choices[0]?.message?.content ?? "[Imagen no analizable]";
}

/**
 * Processes an Instagram CDN URL. Returns normalized text or null to ignore.
 */
export async function processInstagramMediaUrl(url: string): Promise<string | null> {
  const downloaded = await downloadMedia(url);
  if (!downloaded) return null;

  const { buffer, contentType } = downloaded;

  if (contentType === "video/mp4") {
    try {
      return await transcribeAudio(buffer);
    } catch (e) {
      console.error("[ig-media] Whisper error:", (e as Error).message);
      return "[Audio no transcribible]";
    }
  }

  if (contentType === "image/jpeg" || contentType === "image/png") {
    try {
      return await analyzeImage(buffer, contentType);
    } catch (e) {
      console.error("[ig-media] GPT-4o-mini error:", (e as Error).message);
      return "[Imagen no analizable]";
    }
  }

  // Unsupported type — silently ignore
  console.log(`[ig-media] Unsupported type ${contentType}, ignoring`);
  return null;
}

export function isInstagramMediaUrl(text: string): boolean {
  return text.includes("lookaside");
}
