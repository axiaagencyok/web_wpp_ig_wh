import { NextRequest, NextResponse } from "next/server";
import { adminClient } from "@/lib/supabase/admin";
import { upsertBuffer } from "@/lib/ai/buffer";
import { TwilioProvider } from "@/lib/messaging/twilio-provider";

// Twilio envía form-encoded; Next.js no parsea esto automáticamente
async function parseFormBody(req: NextRequest): Promise<Record<string, string>> {
  const text = await req.text();
  return Object.fromEntries(new URLSearchParams(text));
}

function reconstructUrl(req: NextRequest): string {
  // En producción Vercel pasa x-forwarded-proto / x-forwarded-host
  const proto = req.headers.get("x-forwarded-proto") ?? "https";
  const host = req.headers.get("x-forwarded-host") ?? req.headers.get("host") ?? "localhost:3000";
  return `${proto}://${host}${req.nextUrl.pathname}`;
}

export async function POST(req: NextRequest) {
  const body = await parseFormBody(req);

  // ── 1. Validar firma Twilio ─────────────────────────────────────────────────
  const accountSid = process.env.TWILIO_ACCOUNT_SID!;
  const authToken = process.env.TWILIO_AUTH_TOKEN!;
  const skipValidation = process.env.TWILIO_SKIP_VALIDATION === "true";

  if (!skipValidation) {
    const signature = req.headers.get("x-twilio-signature") ?? "";
    const webhookUrl = process.env.TWILIO_WEBHOOK_URL ?? reconstructUrl(req);
    const provider = new TwilioProvider(accountSid, authToken);

    if (!provider.validateWebhookSignature(signature, webhookUrl, body)) {
      return new NextResponse("Forbidden", { status: 403 });
    }
  }

  const from = body["From"]; // whatsapp:+5491122223333
  const to = body["To"];     // whatsapp:+14155238886
  const msgBody = body["Body"] ?? "";
  const messageSid = body["MessageSid"];
  const numMedia = parseInt(body["NumMedia"] ?? "0", 10);
  const mediaUrl = numMedia > 0 ? body["MediaUrl0"] ?? null : null;
  const mediaType = numMedia > 0 ? body["MediaContentType0"] ?? null : null;

  // ── 2. Identificar tenant por número destino ────────────────────────────────
  const { data: tenant } = await adminClient
    .from("tenants")
    .select("id, buffer_seconds, agent_enabled")
    .eq("whatsapp_number", to)
    .single();

  if (!tenant) {
    console.error(`[webhook] No se encontró tenant para el número: ${to}`);
    return new NextResponse("<Response/>", {
      status: 200,
      headers: { "Content-Type": "text/xml" },
    });
  }

  // ── 3. Upsert conversation ──────────────────────────────────────────────────
  const { data: conversation } = await adminClient
    .from("conversations")
    .upsert(
      {
        tenant_id: tenant.id,
        contact_phone: from,
        last_message_at: new Date().toISOString(),
      },
      { onConflict: "tenant_id,contact_phone" }
    )
    .select("id, automation_paused")
    .single();

  if (!conversation) {
    console.error("[webhook] Error creando conversación");
    return new NextResponse("<Response/>", { status: 200, headers: { "Content-Type": "text/xml" } });
  }

  // Actualizar last_message_at
  await adminClient
    .from("conversations")
    .update({ last_message_at: new Date().toISOString() })
    .eq("id", conversation.id);

  // ── 4. Insertar mensaje inbound ─────────────────────────────────────────────
  const hasMedia = numMedia > 0;
  const isAudio = mediaType?.startsWith("audio") ?? false;

  const { data: message } = await adminClient
    .from("messages")
    .insert({
      conversation_id: conversation.id,
      tenant_id: tenant.id,
      direction: "inbound",
      sender: "contact",
      body: msgBody || null,
      media_url: mediaUrl,
      media_type: mediaType,
      twilio_sid: messageSid,
      status: "delivered",
    })
    .select("id")
    .single();

  if (!message) {
    console.error("[webhook] Error guardando mensaje");
    return new NextResponse("<Response/>", { status: 200, headers: { "Content-Type": "text/xml" } });
  }

  console.log(
    `[webhook] Mensaje ${messageSid} de ${from} → conv ${conversation.id}` +
    (hasMedia ? ` [${mediaType}${isAudio ? " — audio, se transcribirá" : ""}]` : "")
  );

  // ── 5. Encolar en buffer (solo si el agente está activo y no está pausado) ──
  if (tenant.agent_enabled && !conversation.automation_paused) {
    await upsertBuffer(conversation.id, tenant.buffer_seconds);
  }

  // Respuesta vacía a Twilio — el agente responde de forma asíncrona
  return new NextResponse("<Response/>", {
    status: 200,
    headers: { "Content-Type": "text/xml" },
  });
}
