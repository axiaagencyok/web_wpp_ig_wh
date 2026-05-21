// Thin wrappers sobre la lib oficial twilio y fetch para uso desde el flujo
// admin (PR D). El runtime principal de mensajería sigue usando
// lib/messaging/twilio-provider.ts; este módulo expone dos helpers que el
// webhook necesita: enviar un mensaje WPP y descargar un media URL firmado.

import twilio from "twilio";

const ACCOUNT_SID = process.env.TWILIO_ACCOUNT_SID;
const AUTH_TOKEN  = process.env.TWILIO_AUTH_TOKEN;

function getClient() {
  if (!ACCOUNT_SID || !AUTH_TOKEN) {
    throw new Error("TWILIO_ACCOUNT_SID y TWILIO_AUTH_TOKEN son requeridos");
  }
  return twilio(ACCOUNT_SID, AUTH_TOKEN);
}

export interface SendResult {
  sid:    string;
  status: string;
}

// `from` y `to` deben venir en formato whatsapp:+549... (igual que el resto
// del código). Para una respuesta al admin esto es siempre el número Twilio
// del tenant y el número del admin tal cual lo mandó Twilio en `From`.
export async function sendWhatsAppMessage(
  from: string,
  to:   string,
  body: string,
): Promise<SendResult> {
  const client = getClient();
  const msg = await client.messages.create({ from, to, body });
  return { sid: msg.sid, status: msg.status };
}

// Twilio devuelve MediaUrl0 como una URL firmada que requiere Basic Auth
// con el AccountSid:AuthToken. La URL es válida ~24h.
export async function downloadMedia(mediaUrl: string): Promise<{
  buffer:   Buffer;
  mimeType: string;
}> {
  if (!ACCOUNT_SID || !AUTH_TOKEN) {
    throw new Error("TWILIO_ACCOUNT_SID y TWILIO_AUTH_TOKEN son requeridos");
  }

  const auth = Buffer.from(`${ACCOUNT_SID}:${AUTH_TOKEN}`).toString("base64");
  const res  = await fetch(mediaUrl, { headers: { Authorization: `Basic ${auth}` } });

  if (!res.ok) {
    throw new Error(`Twilio media download failed: ${res.status} ${res.statusText}`);
  }

  const mimeType = res.headers.get("content-type") ?? "application/octet-stream";
  const buffer   = Buffer.from(await res.arrayBuffer());
  return { buffer, mimeType };
}
