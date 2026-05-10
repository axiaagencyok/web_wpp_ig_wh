import type { MessagingProvider, SendMessageParams, SendMessageResult } from "./types";

// STUB — implementar cuando migremos a Meta Cloud API
export class CloudApiProvider implements MessagingProvider {
  async send(_params: SendMessageParams): Promise<SendMessageResult> {
    throw new Error("CloudApiProvider not implemented yet");
  }

  validateWebhookSignature(
    _signature: string,
    _url: string,
    _params: Record<string, string>
  ): boolean {
    throw new Error("CloudApiProvider not implemented yet");
  }
}
