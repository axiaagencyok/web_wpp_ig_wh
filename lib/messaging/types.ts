export interface SendMessageParams {
  to: string       // whatsapp:+5491122223333
  from: string     // whatsapp:+14155238886
  body: string
  mediaUrl?: string
}

export interface SendMessageResult {
  sid: string
  status: string
}

export interface MessagingProvider {
  send(params: SendMessageParams): Promise<SendMessageResult>
  validateWebhookSignature(signature: string, url: string, params: Record<string, string>): boolean
}
