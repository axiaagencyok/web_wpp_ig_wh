import { NextRequest, NextResponse, after } from "next/server";
import { adminClient } from "@/lib/supabase/admin";
import { upsertBuffer } from "@/lib/ai/buffer";
import { processInstagramMediaUrl, isInstagramMediaUrl } from "@/lib/instagram/media-processor";
import {
  clearStoryReplyFlag,
  clearAdClickFlag,
  clearPostContextFlag,
  clearContextoComentarioFlag,
  clearStoryContextFlag,
} from "@/lib/instagram/manychat";
import type { Json } from "@/types/database.types";

export interface ManyChatPayload {
  "full-data": {
    id: string;
    first_name: string;
    ig_username: string;
    last_input_text: string;
    ig_last_interaction: string;
    // Manual reply support: cuando un operador responde manualmente desde
    // la app de Instagram (o desde ManyChat Live Chat), ManyChat puede
    // dispararnos el webhook con un flow configurado, marcando
    // `manual_reply: true` y poniendo el texto del operador en
    // `last_output_text`. Ver docs/MANYCHAT-MANUAL-REPLIES.md para el
    // setup del flow.
    last_output_text?: string;
    custom_fields?: {
      producto_consultado?: string;
      story_reply?: boolean | string;
      ad_click?: boolean | string;
      post_comment?: boolean | string;
      post_context?: string;
      manual_reply?: boolean | string;
      // contexto_comentario: MANUAL — el operador lo carga en ManyChat
      // por publicación con texto libre tipo "Comentó en post de SPC click,
      // ya le ofrecimos info". A diferencia de post_context (auto-fill por
      // flow), este NO se consume — persiste en custom_fields hasta que
      // el operador lo cambie, y Cami lo inyecta en cada turno.
      contexto_comentario?: string;
      // story_context: BOOLEAN one-shot que ManyChat setea en true cuando el
      // DM viene como respuesta a una story. Lo leemos para marcar la
      // conversación como originada en story (custom_fields.from_story).
      // Después limpiamos el flag en ManyChat. El TEXTO del contexto NO
      // viene acá — vive en tenants.stories_context_general (panel
      // /settings > Contextos > Stories), que es lo que compose-prompt
      // inyecta cuando from_story está activo.
      story_context?: boolean | string;
    };
  };
}

function isStoryReply(v: boolean | string | undefined): boolean {
  return v === true || v === "true";
}

function parseAdClick(v: boolean | string | undefined): boolean {
  return v === true || v === "true" || v === "Yes";
}

function isManualReply(v: boolean | string | undefined): boolean {
  return v === true || v === "true" || v === "Yes" || v === "1";
}

export async function processIncoming(payload: ManyChatPayload, tenantId: string): Promise<void> {
  const data = payload["full-data"];
  const manychatId = data.id;
  const nombre = data.first_name;
  const igUsername = data.ig_username;
  const manualReply = isManualReply(data.custom_fields?.manual_reply);
  const mensajeRaw = manualReply
    ? (data.last_output_text ?? "")
    : (data.last_input_text ?? "");
  const productoConsultado = data.custom_fields?.producto_consultado ?? null;
  const storyReply = isStoryReply(data.custom_fields?.story_reply);
  const adClick = parseAdClick(data.custom_fields?.ad_click);
  const postComment = parseAdClick(data.custom_fields?.post_comment);
  const postContext = data.custom_fields?.post_context ?? null;
  const contextoComentario = data.custom_fields?.contexto_comentario?.trim() || null;
  // story_context viene como boolean (true cuando es respuesta a story).
  // ManyChat puede serializarlo como boolean o string según cómo esté
  // configurado el custom_field — aceptamos ambos.
  const storyContextFlag = isStoryReply(data.custom_fields?.story_context);

  if (!tenantId) {
    console.error("[ig-webhook] tenantId not provided");
    return;
  }

  const { data: tenant } = await adminClient
    .from("tenants")
    .select("id, agent_enabled, buffer_seconds, manychat_api_key")
    .eq("id", tenantId)
    .single();

  if (!tenant) {
    console.error(`[ig-webhook] Tenant not found: ${tenantId}`);
    return;
  }

  // agent_enabled gateaba ANTES el persistido del mensaje también — eso
  // perdía el histórico de chats si el dueño apagaba el agente. Ahora el
  // mensaje SIEMPRE se guarda; solo gate al enqueue del buffer (más abajo).

  // Normalize message — process media if needed. Las URLs de media solo
  // aparecen en input del subscriber, no en respuestas de operador, así
  // que skipeamos esta normalización para manual replies.
  let mensajeNormalizado: string | null = mensajeRaw;

  if (!manualReply && isInstagramMediaUrl(mensajeRaw)) {
    mensajeNormalizado = await processInstagramMediaUrl(mensajeRaw);
    if (!mensajeNormalizado) {
      // Unsupported media type — ignore silently
      return;
    }
  }

  // Sin texto no hay nada que persistir.
  if (!mensajeNormalizado || !mensajeNormalizado.trim()) {
    console.warn(`[ig-webhook] Empty message for @${igUsername} (manualReply=${manualReply}); skipping`);
    return;
  }

  const contactPhone = `instagram:${manychatId}`;

  // Read existing custom_fields to merge (avoid clobbering story_reply set by a previous webhook).
  const { data: existing } = await adminClient
    .from("conversations")
    .select("custom_fields")
    .eq("tenant_id", tenantId)
    .eq("contact_phone", contactPhone)
    .maybeSingle();

  const prevCustomFields = (existing?.custom_fields as Record<string, unknown> | null) ?? {};
  const mergedCustomFields: Record<string, unknown> = {
    ...prevCustomFields,
    ig_username: igUsername,
    ...(productoConsultado ? { producto_consultado: productoConsultado } : {}),
    ...(storyReply ? { story_reply: true } : {}),
    ...(adClick ? { ad_click: true } : {}),
    ...(postComment ? { post_comment: true } : {}),
    ...(postContext ? { post_context: postContext } : {}),
    // contexto_comentario persistente — solo sobreescribe si el webhook
    // trae un valor nuevo no-vacío. Eso permite que ManyChat lo mande
    // solo en el primer trigger y persista en mensajes siguientes.
    ...(contextoComentario ? { contexto_comentario: contextoComentario } : {}),
    // from_story: marca PERSISTENTE de que la conversación arrancó como
    // respuesta a una story de IG. Una vez seteada, compose-prompt inyecta
    // el contexto de stories del tenant en cada turno mientras la
    // conversación dure. El flag en ManyChat (story_context boolean) se
    // limpia después de leerlo — el estado persistente vive acá.
    ...(storyContextFlag ? { from_story: true } : {}),
  };

  // Upsert conversation
  const { data: conversation, error: upsertError } = await adminClient
    .from("conversations")
    .upsert(
      {
        tenant_id: tenantId,
        contact_phone: contactPhone,
        contact_name: nombre,
        channel: "instagram",
        custom_fields: mergedCustomFields as Json,
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

  // Save message. Si es respuesta manual del operador, va como outbound/human
  // y NO disparamos a Cami (el operador ya respondió). Si es input del
  // subscriber, va como inbound/contact y encolamos al buffer para que Cami
  // responda (excepto que el chat esté pausado o el agente desactivado).
  await adminClient.from("messages").insert({
    conversation_id: conversation.id,
    tenant_id: tenantId,
    direction: manualReply ? "outbound" : "inbound",
    sender: manualReply ? "human" : "contact",
    body: mensajeNormalizado,
    status: manualReply ? "sent" : "delivered",
  });

  // Enqueue buffer solo para inputs reales del subscriber, no para respuestas
  // del operador. agent_enabled = false también skip-ea el buffer (pero
  // el mensaje ya quedó guardado arriba — no se pierde el histórico).
  const shouldQueue =
    !manualReply && tenant.agent_enabled && !conversation.automation_paused;
  if (shouldQueue) {
    await upsertBuffer(conversation.id, tenant.buffer_seconds);
  }

  const tenantKey = tenant.manychat_api_key ?? null;

  // Fire-and-forget: reset story_reply flag so it's consumed only once
  if (storyReply) {
    clearStoryReplyFlag(manychatId, tenantKey).catch((e) =>
      console.error("[ig-webhook] clearStoryReplyFlag error:", (e as Error).message)
    );
  }

  // Fire-and-forget: reset ad_click flag so it's consumed only once
  if (adClick) {
    clearAdClickFlag(manychatId, tenantKey).catch((e) =>
      console.error("[ig-webhook] clearAdClickFlag error:", (e as Error).message)
    );
  }

  // Fire-and-forget: reset post_comment/post_context flags so they're consumed only once
  if (postComment) {
    clearPostContextFlag(manychatId, tenantKey).catch((e) =>
      console.error("[ig-webhook] clearPostContextFlag error:", (e as Error).message)
    );
  }

  // Reset `contexto_comentario` SIEMPRE — no solo cuando vino populado.
  // Replica el nodo "HTTP Request2" del flow viejo de n8n: garantiza que
  // el custom_field queda en "-" después de cada turno y no contamina el
  // próximo. Ver docs/MANYCHAT-CONTEXT-CLEANUP.md.
  //
  // Usamos `after()` anidado en vez de fire-and-forget `void` para que la
  // promesa quede registrada en el chain de waitUntil de Vercel — sino la
  // función serverless puede terminar antes de que el HTTP a ManyChat se
  // dispare. Misma lección que el bug del mail de leads.
  after(async () => {
    try {
      await clearContextoComentarioFlag(manychatId, tenantKey);
    } catch (e) {
      console.error(
        `[manychat-cleanup] uncaught error subscriber=${manychatId}:`,
        (e as Error).message,
      );
    }
  });

  // Mismo racional para story_context — ver docs/MANYCHAT-CONTEXT-CLEANUP.md.
  // El flag es boolean one-shot: el estado persistente (from_story) ya quedó
  // en conversations.custom_fields arriba, así que en ManyChat lo reseteamos
  // siempre para que no contamine el próximo subscriber.
  after(async () => {
    try {
      await clearStoryContextFlag(manychatId, tenantKey);
    } catch (e) {
      console.error(
        `[manychat-cleanup] uncaught error (story_context) subscriber=${manychatId}:`,
        (e as Error).message,
      );
    }
  });

  console.log(
    `[ig-webhook] @${igUsername} (${manychatId}) → conv ${conversation.id}`
  );
}

// Legacy webhook sin tenantId en la URL. Resuelve el tenant desde
// INSTAGRAM_TENANT_ID (env var). Se mantiene por compatibilidad mientras
// los flows existentes de ManyChat siguen apuntando acá; los flows nuevos
// deben usar /api/webhooks/manychat/[tenantId] para soportar multi-tenant.
export async function POST(req: NextRequest) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return new NextResponse("Bad Request", { status: 400 });
  }

  console.log("[ig-webhook] Received payload (legacy):", JSON.stringify(body).slice(0, 300));

  const tenantId = process.env.INSTAGRAM_TENANT_ID;
  if (!tenantId) {
    console.error("[ig-webhook] INSTAGRAM_TENANT_ID not set on legacy endpoint");
    return new NextResponse("OK", { status: 200 });
  }

  after(async () => {
    try {
      await processIncoming(body as ManyChatPayload, tenantId);
    } catch (e) {
      console.error("[ig-webhook] Processing error:", (e as Error).message);
    }
  });

  return new NextResponse("OK", { status: 200 });
}
