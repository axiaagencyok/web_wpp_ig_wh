import twilio from "twilio";
import type { MessagingProvider, SendMessageParams, SendMessageResult } from "./types";

export class TwilioProvider implements MessagingProvider {
  private client: ReturnType<typeof twilio>;

  constructor(
    private readonly accountSid: string,
    private readonly authToken: string
  ) {
    this.client = twilio(accountSid, authToken);
  }

  async send(params: SendMessageParams): Promise<SendMessageResult> {
    const message = await this.client.messages.create({
      from: params.from,
      to: params.to,
      body: params.body,
      ...(params.mediaUrl ? { mediaUrl: [params.mediaUrl] } : {}),
    });

    return { sid: message.sid, status: message.status };
  }

  validateWebhookSignature(
    signature: string,
    url: string,
    params: Record<string, string>
  ): boolean {
    return twilio.validateRequest(this.authToken, signature, url, params);
  }
}
