import { NextRequest, NextResponse, after } from "next/server";
import { adminClient } from "@/lib/supabase/admin";
import { upsertBuffer } from "@/lib/ai/buffer";
import { processInstagramMediaUrl, isInstagramMediaUrl } from "@/lib/instagram/media-processor";

interface ManyChatPayload {
  "full-data": {
    id: string;
    first_name: string;
    ig_username: string;
    last_input_text: string;
    ig_last_interaction: string;
    custom_fields?: {
      producto_consultado?: string;
    };
  };
}

async function processIncoming(payload: ManyChatPayload): Promise<void> {
  const data = payload["full-data"];
  const manychatId = data.id;
  const nombre = data.first_name;
  const igUsername = data.ig_username;
  const mensajeRaw = data.last_input_text ?? "";
  const productoConsultado = data.custom_fields?.producto_consultado ?? null;

  // Find tenant configured for Instagram (env: INSTAGRAM_TENANT_ID)
  const tenantId = process.env.INSTAGRAM_TENANT_ID;
  if (!tenantId) {
    console.error("[ig-webhook] INSTAGRAM_TENANT_ID not set");
    return;
  }

  const { data: tenant } = await adminClient
    .from("tenants")
    .select("id, agent_enabled, buffer_seconds")
    .eq("id", tenantId)
    .single();

  if (!tenant) {
    console.error(`[ig-webhook] Tenant not found: ${tenantId}`);
    return;
  }

  if (!tenant.agent_enabled) {
    console.log(`[ig-webhook] Agent disabled for tenant ${tenantId}`);
    return;
  }

  // Normalize message — process media if needed
  let mensajeNormalizado: string | null = mensajeRaw;

  if (isInstagramMediaUrl(mensajeRaw)) {
    mensajeNormalizado = await processInstagramMediaUrl(mensajeRaw);
    if (!mensajeNormalizado) {
      // Unsupported media type — ignore silently
      return;
    }
  }

  const contactPhone = `instagram:${manychatId}`;

  // Upsert conversation
  const { data: conversation, error: upsertError } = await adminClient
    .from("conversations")
    .upsert(
      {
        tenant_id: tenantId,
        contact_phone: contactPhone,
        contact_name: nombre,
        channel: "instagram",
        custom_fields: { ig_username: igUsername, ...(productoConsultado ? { producto_consultado: productoConsultado } : {}) },
        last_message_at: new Date().toISOString(),
      },
      { onConflict: "tenant_id,contact_phone" }
    )
    .select("id, automation_paused")
    .single();

  if (!conversation) {
    console.error(
      "[ig-webhook] Error upserting conversation",
      upsertError?.code,
      upsertError?.message,
      upsertError?.details,
      upsertError?.hint,
      { tenantId, contactPhone }
    );
    return;
  }

  // Update last_message_at on existing convs
  await adminClient
    .from("conversations")
    .update({ last_message_at: new Date().toISOString() })
    .eq("id", conversation.id);

  // Save inbound message
  await adminClient.from("messages").insert({
    conversation_id: conversation.id,
    tenant_id: tenantId,
    direction: "inbound",
    sender: "contact",
    body: mensajeNormalizado,
    status: "delivered",
  });

  // Enqueue in buffer unless paused
  if (!conversation.automation_paused) {
    await upsertBuffer(conversation.id, tenant.buffer_seconds);
  }

  console.log(
    `[ig-webhook] @${igUsername} (${manychatId}) → conv ${conversation.id}`
  );
}

export async function POST(req: NextRequest) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return new NextResponse("Bad Request", { status: 400 });
  }

  after(async () => {
    try {
      await processIncoming(body as ManyChatPayload);
    } catch (e) {
      console.error("[ig-webhook] Processing error:", (e as Error).message);
    }
  });

  return new NextResponse("OK", { status: 200 });
}
