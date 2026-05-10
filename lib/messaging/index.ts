import { TwilioProvider } from "./twilio-provider";
import { CloudApiProvider } from "./cloud-api-provider";
import type { MessagingProvider } from "./types";

export type { MessagingProvider };
export { TwilioProvider, CloudApiProvider };

export function getMessagingProvider(): MessagingProvider {
  const provider = process.env.MESSAGING_PROVIDER ?? "twilio";

  if (provider === "cloud-api") {
    return new CloudApiProvider();
  }

  const accountSid = process.env.TWILIO_ACCOUNT_SID;
  const authToken = process.env.TWILIO_AUTH_TOKEN;

  if (!accountSid || !authToken) {
    throw new Error("TWILIO_ACCOUNT_SID and TWILIO_AUTH_TOKEN are required");
  }

  return new TwilioProvider(accountSid, authToken);
}
