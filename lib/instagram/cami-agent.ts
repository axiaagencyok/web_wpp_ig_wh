import Anthropic from "@anthropic-ai/sdk";
import nodemailer from "nodemailer";
import { after } from "next/server";
import { adminClient } from "@/lib/supabase/admin";
import { composeSystemPrompt } from "@/lib/agents/compose-prompt";
import { scoreConversation } from "@/lib/leads/scoring-agent";
import { upsertLead } from "@/lib/leads/upsert-lead";
import { sendInstagramMessage, pauseInstagramBot, clearPostContextFlag, ManyChatError } from "./manychat";
import { sendHandoffEmail } from "@/lib/notifications/handoff";

const MODEL = "claude-sonnet-4-5";
const FALLBACK_MODEL = "claude-haiku-4-5-20251001";
const RETRY_DELAYS_MS = [1_000, 3_000, 9_000];
// Ventana de historial. El cliente NO debe sentir amnesia — preferimos gastar
// tokens antes que olvidar lo que dijo 2 turnos atrás. 30 mensajes ≈ 15 turnos
// completos (user + assistant). Sube a más si hace falta.
const MAX_HISTORY_MESSAGES = 30;

function requireEnv(name: string): string {
  const v = process.env[name];
  if (!v || !v.trim()) {
    throw new Error(`[cami] Variable de entorno requerida no definida: ${name}`);
  }
  return v;
}

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

// Retries on 529/503 with exponential backoff; falls back to Haiku if Sonnet is exhausted.
async function callClaude(
  params: Omit<Anthropic.MessageCreateParamsNonStreaming, "model">
): Promise<Anthropic.Message> {
  for (const [modelIdx, model] of [MODEL, FALLBACK_MODEL].entries()) {
    const isLastModel = modelIdx === 1;
    for (let attempt = 0; attempt <= RETRY_DELAYS_MS.length; attempt++) {
      try {
        return await anthropic.messages.create({ ...params, model });
      } catch (err) {
        const status = (err as { status?: number }).status;
        const isOverload = status === 529 || status === 503;

        if (isOverload && attempt < RETRY_DELAYS_MS.length) {
          console.warn(`[cami] ${status} (${model}) attempt ${attempt + 1}, retrying in ${RETRY_DELAYS_MS[attempt]}ms`);
          await new Promise<void>((r) => setTimeout(r, RETRY_DELAYS_MS[attempt]));
          continue;
        }
        if (isOverload && !isLastModel) {
          console.warn(`[cami] ${status} on ${model} exhausted — falling back to ${FALLBACK_MODEL}`);
          break;
        }
        throw err;
      }
    }
  }
  throw new Error("[cami] All Claude API attempts exhausted");
}

async function getMailTransporter() {
  const host = process.env.SMTP_HOST;
  if (!host) return null;

  return nodemailer.createTransport({
    host,
    port: parseInt(process.env.SMTP_PORT ?? "587"),
    secure: process.env.SMTP_SECURE === "true",
    auth: {
      user: process.env.SMTP_USER ?? "",
      pass: process.env.SMTP_PASS ?? "",
    },
  });
}

async function sendSupervisorEmail(nombre: string, igUsername: string): Promise<void> {
  const transporter = await getMailTransporter();
  if (!transporter) {
    console.warn("[cami] SMTP not configured, skipping supervisor email");
    return;
  }

  const supervisorEmail = requireEnv("SUPERVISOR_EMAIL");

  try {
    await transporter.sendMail({
      from: process.env.SMTP_USER,
      to: supervisorEmail,
      subject: "Supervision",
      text: `El cliente ${nombre}, con usuario @${igUsername} solicitó atención por parte de un supervisor.`,
    });
    console.log(`[cami] Supervisor email sent for @${igUsername}`);
  } catch (e) {
    console.error("[cami] Error sending supervisor email:", (e as Error).message);
  }
}

// ── History builder ──────────────────────────────────────────────────────────

function buildCamiHistory(
  messages: { direction: string; body: string | null }[]
): Anthropic.MessageParam[] {
  const turns: Anthropic.MessageParam[] = [];

  for (const msg of messages) {
    const role: "user" | "assistant" = msg.direction === "inbound" ? "user" : "assistant";
    const text = msg.body?.trim();
    if (!text) continue;

    const last = turns[turns.length - 1];
    if (last && last.role === role && Array.isArray(last.content)) {
      (last.content as Anthropic.ContentBlockParam[]).push({ type: "text", text });
    } else {
      turns.push({ role, content: [{ type: "text", text }] });
    }
  }

  return turns;
}

// ── Main ──────────────────────────────────────────────────────────────────────

export async function processCamiConversation(conversationId: string): Promise<void> {
  const { data: conversation } = await adminClient
    .from("conversations")
    .select("*")
    .eq("id", conversationId)
    .single();

  if (!conversation) {
    console.error(`[cami] Conversation not found: ${conversationId}`);
    return;
  }

  if (conversation.automation_paused) {
    console.log(`[cami] Conversation paused: ${conversationId}`);
    return;
  }

  const { data: tenant } = await adminClient
    .from("tenants")
    .select("*")
    .eq("id", conversation.tenant_id)
    .single();

  if (!tenant) {
    throw new Error(`[cami] Tenant no encontrado: ${conversation.tenant_id}`);
  }

  const tenantName = tenant.name?.trim();
  if (!tenantName) {
    throw new Error(`Tenant ${conversation.tenant_id} no tiene name configurado en DB.`);
  }

  const customFields = (conversation.custom_fields as Record<string, unknown> | null) ?? {};
  const isStoryReply = customFields.story_reply === true;
  const isAdClick = customFields.ad_click === true;
  const isPostComment = customFields.post_comment === true;
  const rawPostContext = typeof customFields.post_context === "string" ? customFields.post_context : "";
  // contexto_comentario: PERSISTENTE — el operador lo carga manualmente en
  // ManyChat por publicación. A diferencia de los flags one-shot
  // (story_reply / ad_click / post_comment), este se inyecta en CADA turno
  // mientras esté presente. Mantiene a Cami consciente del post en el que
  // el cliente comentó originalmente.
  const contextoComentario =
    typeof customFields.contexto_comentario === "string"
      ? customFields.contexto_comentario.trim()
      : "";

  // Stories fields
  const storyGeneral = tenant?.stories_context_general?.trim();
  const storyKeywords = tenant?.stories_context_keywords?.trim();
  const hasStoryContext = isStoryReply && (storyGeneral || storyKeywords);

  // Ads fields — only active when story_reply is NOT also true (story has priority)
  const adsGeneral = tenant?.ads_context_general?.trim();
  const adsKeywords = tenant?.ads_context_keywords?.trim();
  const hasAdsContext = !isStoryReply && isAdClick && (adsGeneral || adsKeywords);

  // Post/Reel comment context — active only when neither story nor ad takes priority.
  // Context comes hardcoded in the ManyChat automation, not from tenants table.
  const hasPostContext = !isStoryReply && !isAdClick && isPostComment && !!rawPostContext && rawPostContext !== "-";


  const storyContextBlock = hasStoryContext
    ? `\n\n================================================================\nCONTEXTO DE STORIES - PRIORIDAD ABSOLUTA\n================================================================\n` +
      `El cliente acaba de responder a una story de Instagram.\n` +
      `Esto es lo que se publicó hoy: ${storyGeneral ?? ""}` +
      (storyKeywords ? `\nPalabras clave: ${storyKeywords}` : "") +
      `\n\nINSTRUCCIONES CRÍTICAS — leer antes de responder:\n` +
      `1. El cliente consulta por el/los producto(s) del contexto de arriba. Ese es el TEMA DE LA CONVERSACIÓN AHORA.\n` +
      `2. Si en mensajes anteriores de esta conversación se mencionó otro producto distinto, OLVIDALO. Esa charla ya pasó. El cliente cambió de tema al responder la story.\n` +
      `3. Si el mensaje del cliente contiene una palabra clave del listado de arriba, esa palabra define exactamente cuál producto del contexto está consultando. Si no, usá el contexto general.\n` +
      `4. Buscá ese producto/keyword en el bloque CATÁLOGO inyectado al inicio del prompt y traé de ahí precio, stock y descripción reales. Nunca inventes datos.\n` +
      `5. Respondé pivoteando al producto del contexto. Ejemplo: si el contexto es 'air fryer' y el cliente pregunta 'cuánto sale?', la respuesta arranca con info de la air fryer, no del producto anterior.\n` +
      `================================================================`
    : "";

  const adsContextBlock = hasAdsContext
    ? `\n\n================================================================\nCONTEXTO DE ADS - PRIORIDAD ABSOLUTA\n================================================================\n` +
      `El cliente acaba de clickear un anuncio de Instagram. Esto es lo que se está promocionando:\n\n` +
      `${adsGeneral ?? ""}` +
      (adsKeywords ? `\nPalabras clave: ${adsKeywords}` : "") +
      `\n\nINSTRUCCIONES CRÍTICAS:\n` +
      `1. El cliente está consultando por el/los producto(s) del ad. NO sigas temas previos.\n` +
      `2. Si en mensajes anteriores se mencionó otro producto, OLVIDALO.\n` +
      `3. Si el mensaje contiene una palabra clave del listado, esa define el producto exacto.\n` +
      `4. Buscá ese producto en el bloque CATÁLOGO inyectado al inicio del prompt.\n` +
      `5. Respondé pivoteando al producto del ad.\n` +
      `================================================================`
    : "";

  const postContextBlock = hasPostContext
    ? `\n\n================================================================\nCONTEXTO DE POSTS/REELS - PRIORIDAD ABSOLUTA\n================================================================\n` +
      `El cliente acaba de comentar en un post o reel de Instagram. El post/reel es sobre:\n\n` +
      `${rawPostContext}` +
      `\n\nINSTRUCCIONES CRÍTICAS:\n` +
      `1. El cliente está consultando por el/los producto(s) del post. NO sigas temas previos.\n` +
      `2. Si en mensajes anteriores se mencionó otro producto, OLVIDALO.\n` +
      `3. Buscá ese producto en el bloque CATÁLOGO inyectado al inicio del prompt.\n` +
      `4. Respondé pivoteando al producto del post/reel.\n` +
      `================================================================`
    : "";

  // System prompt via compose-prompt: catálogo + contexto del comentario IG
  // (prefijos) → prompt del tenant (fuente de verdad de la marca) → contextos
  // del turno actual (stories / ads / post) → regla anti-alucinación global.
  // El catálogo se pre-inyecta como prefijo — Cami ya no usa tool calling.
  const fullSystemPrompt = await composeSystemPrompt(tenant, "ig", {
    storiesContext: storyContextBlock || undefined,
    adsContext: adsContextBlock || undefined,
    postContext: postContextBlock || undefined,
    commentContext: contextoComentario || undefined,
  });

  const anyContext = hasStoryContext || hasAdsContext || hasPostContext;

  // When a context trigger fires: stamp the moment and clear consumed flags.
  // The timestamp becomes the "start of new thread" boundary for future history loads.
  if (anyContext) {
    const triggerAt = new Date().toISOString();
    const clearedFields: Record<string, unknown> = { ...customFields };
    if (isStoryReply) clearedFields.story_reply = false;
    if (isAdClick) clearedFields.ad_click = false;
    if (hasPostContext) {
      clearedFields.post_comment = false;
      clearedFields.post_context = "-";
      clearPostContextFlag(
        conversation.contact_phone.replace("instagram:", ""),
        tenant.manychat_api_key ?? null,
      ).catch((e) =>
        console.error("[cami] clearPostContextFlag error:", (e as Error).message)
      );
    }
    await adminClient
      .from("conversations")
      .update({
        custom_fields: clearedFields as import("@/types/database.types").Json,
        last_context_trigger_at: triggerAt,
      })
      .eq("id", conversationId);
    console.log(`[cami] Context trigger stamped for conv ${conversationId} at ${triggerAt} (story=${isStoryReply} ad=${isAdClick} post=${hasPostContext})`);
  }

  // Load recent messages.
  // On non-context turns, restrict history to messages after the last context trigger
  // so prior-topic conversations don't pollute the new thread.
  const triggerCutoff = anyContext ? null : (conversation.last_context_trigger_at as string | null ?? null);
  let historyQuery = adminClient
    .from("messages")
    .select("direction, body, created_at")
    .eq("conversation_id", conversationId)
    .order("created_at", { ascending: false })
    .limit(MAX_HISTORY_MESSAGES);
  if (triggerCutoff) {
    historyQuery = historyQuery.gte("created_at", triggerCutoff);
  }
  const { data: rawMessages } = await historyQuery;

  const messages = (rawMessages ?? []).reverse();

  if (messages.length === 0) return;

  // Ensure last turn is from user
  const history = buildCamiHistory(messages);
  if (history.length === 0 || history[history.length - 1].role !== "user") return;

  // Extract ManyChat subscriber ID from contact_phone (format: instagram:SUBSCRIBER_ID)
  const subscriberId = conversation.contact_phone.replace("instagram:", "");
  const igUsername = (conversation.custom_fields as Record<string, string> | null)?.ig_username ?? subscriberId;
  const nombre = conversation.contact_name ?? igUsername;

  // On story reply, ad click, or post comment turns, skip prior history so the
  // model can't anchor to a previous product. The auto-clear above ensures only
  // this one turn is affected.
  const turnMessages: Anthropic.MessageParam[] = (hasStoryContext || hasAdsContext || hasPostContext)
    ? [history[history.length - 1]]
    : [...history];

  const startMs = Date.now();
  const response = await callClaude({
    max_tokens: 1024,
    system: fullSystemPrompt,
    messages: turnMessages,
  });

  const promptTokens = response.usage.input_tokens;
  const completionTokens = response.usage.output_tokens;
  const usedModel = response.model ?? MODEL;

  const finalText = response.stop_reason === "end_turn"
    ? response.content
        .filter((b): b is Anthropic.TextBlock => b.type === "text")
        .pop()?.text ?? null
    : null;

  if (response.stop_reason !== "end_turn") {
    console.warn(`[cami] Unexpected stop_reason: ${response.stop_reason}`);
  }

  const latencyMs = Date.now() - startMs;

  // Log AI usage
  await adminClient.from("ai_logs").insert({
    tenant_id: conversation.tenant_id,
    conversation_id: conversationId,
    prompt_tokens: promptTokens,
    completion_tokens: completionTokens,
    model: usedModel,
    latency_ms: latencyMs,
    tool_calls: [] as unknown as import("@/types/database.types").Json,
  });

  if (!finalText) {
    console.log(`[cami] No text response for conv ${conversationId}`);
    return;
  }

  // Supervisor derivation detection.
  //
  // El handoff es el efecto crítico (pausar lógicamente del lado nuestro +
  // notificar al supervisor). pauseBot contra ManyChat es un best-effort
  // que NO debe abortar el handoff: ManyChat devuelve 404 ocasionalmente
  // para subscribers desincronizados del endpoint /instagram/subscriber/*
  // y eso no es razón para dejar al supervisor sin aviso.
  if (finalText.includes("Te derivaré con un supervisor.")) {
    try {
      await pauseInstagramBot(subscriberId, tenant.manychat_api_key ?? null);
      console.log(`[cami] pauseBot OK for subscriber ${subscriberId}`);
    } catch (err) {
      if (err instanceof ManyChatError && !err.isTransient) {
        console.warn(
          `[cami] pauseBot ${err.status} (no-grave) — handoff continúa (pausa lógica en DB) para subscriber ${subscriberId}`
        );
      } else {
        console.error(
          `[cami] pauseBot transient/grave error — handoff continúa para subscriber ${subscriberId}:`,
          err
        );
      }
    }

    // Pausa lógica en DB — esto es lo que evita que Cami siga respondiendo
    // en próximos turnos, independiente de si ManyChat pausó o no.
    await adminClient
      .from("conversations")
      .update({ automation_paused: true, paused_reason: "derived_to_human" })
      .eq("id", conversationId);
    await sendSupervisorEmail(nombre, igUsername);

    // Mail al operador con resumen del chat. Deferred con after() para no
    // demorar la respuesta principal. Anti-spam interno: si el mismo chat
    // fue notificado hace <60 min, skip silencioso.
    const handoffMailTask = async () => {
      try {
        const result = await sendHandoffEmail(
          {
            id: tenant.id,
            name: tenant.name,
            handoff_notification_email: tenant.handoff_notification_email,
            handoff_notifications_enabled: tenant.handoff_notifications_enabled,
          },
          {
            id: conversationId,
            contact_name: conversation.contact_name,
            contact_phone: conversation.contact_phone,
            channel: conversation.channel,
            last_handoff_email_at: conversation.last_handoff_email_at,
          },
        );
        if (result.sent) {
          console.log(
            `[handoff] triggered, mail sent to ${tenant.handoff_notification_email} for conv ${conversationId}`
          );
        } else if (result.reason === "no-email-configured") {
          console.log(`[handoff] mail skipped, no email configured for tenant ${tenant.id}`);
        } else {
          console.log(`[handoff] mail skipped (${result.reason}) for conv ${conversationId}`);
        }
      } catch (e) {
        console.error("[handoff] unexpected error sending mail:", (e as Error).message);
      }
    };

    try {
      after(handoffMailTask);
    } catch {
      // after() requiere request context de Next. Fuera de él (tests,
      // scripts) caemos a fire-and-forget.
      void handoffMailTask();
    }
  }

  // Save outbound message to DB
  await adminClient.from("messages").insert({
    conversation_id: conversationId,
    tenant_id: conversation.tenant_id,
    direction: "outbound",
    sender: "ai",
    body: finalText,
    status: "queued",
  });

  // Send via ManyChat
  try {
    await sendInstagramMessage(subscriberId, finalText, tenant.manychat_api_key ?? null);
    await adminClient
      .from("messages")
      .update({ status: "sent" })
      .eq("conversation_id", conversationId)
      .eq("direction", "outbound")
      .eq("status", "queued");

    console.log(
      `[cami] ✓ Sent to @${igUsername} | ${promptTokens + completionTokens} tokens | ${latencyMs}ms`
    );
  } catch (e) {
    console.error("[cami] Error sending via ManyChat:", (e as Error).message);
    await adminClient
      .from("messages")
      .update({ status: "failed", error_message: (e as Error).message })
      .eq("conversation_id", conversationId)
      .eq("direction", "outbound")
      .eq("status", "queued");
  }

  // ── Lead scoring (post-response, non-blocking) ──────────────────────────────
  // Solo si el tenant tiene scoring habilitado (prompt cargado en DB). El call
  // se difiere con `after()` para no demorar la respuesta del worker.
  if (tenant.lead_scoring_prompt?.trim()) {
    const scoringTask = async () => {
      try {
        const result = await scoreConversation(tenant, conversationId);
        if (!result) return;
        await upsertLead({ tenant, conversation, scoring: result });
      } catch (e) {
        console.error(`[cami] Lead-scoring task failed for conv ${conversationId}:`, (e as Error).message);
      }
    };

    try {
      after(scoringTask());
    } catch {
      // `after()` solo funciona dentro de un request context de Next. Si por
      // algún motivo no estamos en uno (tests, scripts), caemos a fire-and-forget.
      void scoringTask();
    }
  }
}

