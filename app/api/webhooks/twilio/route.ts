import { NextRequest, NextResponse } from "next/server";
import { adminClient } from "@/lib/supabase/admin";
import { upsertBuffer } from "@/lib/ai/buffer";
import { TwilioProvider } from "@/lib/messaging/twilio-provider";
import { handleAdminMessagePRD, toE164 } from "@/lib/admin/handle-admin-message";

async function parseFormBody(req: NextRequest): Promise<Record<string, string>> {
  const text = await req.text();
  return Object.fromEntries(new URLSearchParams(text));
}

function reconstructUrl(req: NextRequest): string {
  const proto = req.headers.get("x-forwarded-proto") ?? "https";
  const host  = req.headers.get("x-forwarded-host") ?? req.headers.get("host") ?? "localhost:3000";
  return `${proto}://${host}${req.nextUrl.pathname}`;
}

export async function POST(req: NextRequest) {
  const body = await parseFormBody(req);

  // ── 1. Validar firma Twilio ─────────────────────────────────────────────────
  const accountSid      = process.env.TWILIO_ACCOUNT_SID!;
  const authToken       = process.env.TWILIO_AUTH_TOKEN!;
  const skipValidation  = process.env.TWILIO_SKIP_VALIDATION === "true";

  if (!skipValidation) {
    const signature  = req.headers.get("x-twilio-signature") ?? "";
    const webhookUrl = process.env.TWILIO_WEBHOOK_URL ?? reconstructUrl(req);
    const provider   = new TwilioProvider(accountSid, authToken);
    if (!provider.validateWebhookSignature(signature, webhookUrl, body)) {
      return new NextResponse("Forbidden", { status: 403 });
    }
  }

  const from       = body["From"];       // whatsapp:+5491122223333
  const to         = body["To"];         // whatsapp:+14155238886
  const msgBody    = body["Body"] ?? "";
  const messageSid = body["MessageSid"];
  const numMedia   = parseInt(body["NumMedia"] ?? "0", 10);
  const mediaUrl   = numMedia > 0 ? body["MediaUrl0"] ?? null : null;
  const mediaType  = numMedia > 0 ? body["MediaContentType0"] ?? null : null;

  // ── 1.5. PR D — flujo admin estructurado con confirmación SI/NO ─────────────
  // Si el From matchea un tenant_admin_phones activo, intentamos manejarlo
  // acá (transcribir audio + parsear intent + propose/confirm). Si el parser
  // no logra extraer un intent (ej. el admin pidió un reporte o stats),
  // dejamos pasar al flujo legacy (admin-agent vía buffer) para preservar
  // las capacidades de reporting existentes.
  try {
    const prd = await handleAdminMessagePRD({ from, to, body: msgBody, mediaUrl, mediaType });
    if (prd.handled) return twimlOk();
  } catch (err) {
    console.error("[webhook] handleAdminMessagePRD failed:", err);
  }

  // ── 2. Identificar tenant ───────────────────────────────────────────────────
  // En el Twilio Sandbox todos los tenants comparten el mismo TO
  // (whatsapp:+14155238886). Buscar tenant por `To` no funciona: caería en
  // el mismo tenant para todo el tráfico (o en ninguno). Cruzamos primero
  // por FROM contra tenant_admin_phones (PR D dejó esa tabla poblada con
  // E.164 sin prefijo). Como fallback mantenemos el lookup por TO para
  // tenants con número Twilio dedicado, donde clientes finales son los que
  // escriben y no van a estar en tenant_admin_phones.
  //
  // Si nada matchea: 200 silencioso. No es un error, es ruido.
  const tenant = await resolveTenant({ from, to });
  if (!tenant) {
    console.warn(`[webhook] Mensaje sin tenant: from=${from} to=${to} — descartado`);
    return twimlOk();
  }

  // ── 3. ¿Es el admin hablando? ───────────────────────────────────────────────
  const isAdminMessage = !!tenant.admin_phone && from === tenant.admin_phone;

  // ── 4. Upsert conversation ──────────────────────────────────────────────────
  const { data: conversation } = await adminClient
    .from("conversations")
    .upsert(
      {
        tenant_id:      tenant.id,
        contact_phone:  from,
        last_message_at: new Date().toISOString(),
        // Marcar is_admin en upsert; si la conv ya existe el flag se preserva
        ...(isAdminMessage ? { is_admin: true } : {}),
      },
      { onConflict: "tenant_id,contact_phone" }
    )
    .select("id, automation_paused, is_admin")
    .single();

  if (!conversation) {
    console.error("[webhook] Error creating conversation");
    return twimlOk();
  }

  await adminClient
    .from("conversations")
    .update({ last_message_at: new Date().toISOString() })
    .eq("id", conversation.id);

  // ── 5. Insertar mensaje inbound ─────────────────────────────────────────────
  const { data: message } = await adminClient
    .from("messages")
    .insert({
      conversation_id: conversation.id,
      tenant_id:       tenant.id,
      direction:       "inbound",
      sender:          "contact",
      body:            msgBody || null,
      media_url:       mediaUrl,
      media_type:      mediaType,
      twilio_sid:      messageSid,
      status:          "delivered",
    })
    .select("id")
    .single();

  if (!message) {
    console.error("[webhook] Error saving message");
    return twimlOk();
  }

  const effectiveIsAdmin = isAdminMessage || conversation.is_admin;

  console.log(
    `[webhook] ${messageSid} from ${from} → conv ${conversation.id}` +
    (effectiveIsAdmin ? " [ADMIN]" : "") +
    (numMedia > 0 ? ` [${mediaType}]` : "")
  );

  // ── 6. Encolar en buffer ────────────────────────────────────────────────────
  // Admin: siempre encola (tiene su propio agente, no respeta automation_paused)
  // Normal: solo si agent_enabled y no pausado
  const shouldQueue = effectiveIsAdmin
    ? true
    : tenant.agent_enabled && !conversation.automation_paused;

  if (shouldQueue) {
    await upsertBuffer(conversation.id, effectiveIsAdmin ? 1 : tenant.buffer_seconds);
  }

  return twimlOk();
}

function twimlOk() {
  return new NextResponse("<Response/>", {
    status: 200,
    headers: { "Content-Type": "text/xml" },
  });
}

interface ResolvedTenant {
  id:              string;
  buffer_seconds:  number;
  agent_enabled:   boolean;
  admin_phone:     string | null;
}

// Busca el tenant primero por FROM (cruce contra tenant_admin_phones), y si
// no hay match, cae al lookup viejo por TO (whatsapp_number). Devuelve null
// si ninguna lookup tiene resultado.
async function resolveTenant(args: { from: string; to: string }): Promise<ResolvedTenant | null> {
  const fromE164 = toE164(args.from);

  const { data: adminRow } = await adminClient
    .from("tenant_admin_phones")
    .select("tenant_id")
    .eq("phone_number", fromE164)
    .eq("is_active", true)
    .limit(1)
    .maybeSingle();

  if (adminRow?.tenant_id) {
    const { data: t } = await adminClient
      .from("tenants")
      .select("id, buffer_seconds, agent_enabled, admin_phone")
      .eq("id", adminRow.tenant_id)
      .maybeSingle();
    if (t) return t;
  }

  const { data: tenantByTo } = await adminClient
    .from("tenants")
    .select("id, buffer_seconds, agent_enabled, admin_phone")
    .eq("whatsapp_number", args.to)
    .maybeSingle();
  return tenantByTo ?? null;
}
