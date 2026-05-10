export interface TranscriptionProvider {
  transcribe(audioBuffer: Buffer, mimeType: string): Promise<string>
}
