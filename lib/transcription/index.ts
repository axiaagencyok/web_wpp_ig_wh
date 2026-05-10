import { WhisperProvider } from "./whisper-provider";
import type { TranscriptionProvider } from "./types";

export type { TranscriptionProvider };
export { WhisperProvider };

let instance: TranscriptionProvider | null = null;

export function getTranscriptionProvider(): TranscriptionProvider {
  if (!instance) {
    instance = new WhisperProvider();
  }
  return instance;
}
