import OpenAI from "openai";
import type { TranscriptionProvider } from "./types";

export class WhisperProvider implements TranscriptionProvider {
  private client: OpenAI;

  constructor() {
    if (!process.env.OPENAI_API_KEY) {
      throw new Error("OPENAI_API_KEY is required for WhisperProvider");
    }
    this.client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  }

  async transcribe(audioBuffer: Buffer, mimeType: string): Promise<string> {
    const ext = mimeType.includes("ogg") ? "ogg" : mimeType.includes("mp4") ? "mp4" : "wav";

    const file = new File([audioBuffer.buffer as ArrayBuffer], `audio.${ext}`, { type: mimeType });

    const response = await this.client.audio.transcriptions.create({
      file,
      model: "whisper-1",
      language: "es",
    });

    return response.text;
  }
}
