import Anthropic from "@anthropic-ai/sdk";
import nodemailer from "nodemailer";
import { after } from "next/server";
import { adminClient } from "@/lib/supabase/admin";
import { getCatalogText } from "@/lib/catalog/catalog-source";
import { composeSystemPrompt } from "@/lib/agents/compose-prompt";
import { scoreConversation } from "@/lib/leads/scoring-agent";
import { upsertLead } from "@/lib/leads/upsert-lead";
import { sendInstagramMessage, pauseInstagramBot, clearPostContextFlag, ManyChatError } from "./manychat";

const MODEL = "claude-sonnet-4-5";
const FALLBACK_MODEL = "claude-haiku-4-5-20251001";
const RETRY_DELAYS_MS = [1_000, 3_000, 9_000];
const MAX_HISTORY_TURNS = 6; // 3 turnos = 6 mensajes (user + assistant)

function requireEnv(name: string): string {
  const v = process.env[name];
  if (!v || !v.trim()) {
    throw new Error(`[cami] Variable de entorno requerida no definida: ${name}`);
  }
  return v;
}

function buildToolDefinitions(tenantName: string): Anthropic.Tool[] {
  return [
    {
      name: "get_catalogo",
      description:
        `Catálogo de productos de ${tenantName} con precios actualizados en tiempo real.\n\n` +
        "CUÁNDO usar busqueda (RECOMENDADO para consultas específicas):\n" +
        "- El cliente pregunta por un producto o categoría específica → busqueda='licuadora'\n" +
        "- El cliente pregunta por una marca → busqueda='samsung'\n" +
        "- El cliente pregunta por un modelo → busqueda='galaxy a15'\n" +
        "Usá el nombre en SINGULAR y sin adjetivos. Ejemplos: 'licuadora' no 'licuadoras baratas'.\n\n" +
        "CUÁNDO NO usar busqueda:\n" +
        "- El cliente pregunta qué tienen en general o pide ver todo el catálogo.\n\n" +
        "Si la búsqueda no encuentra resultados exactos, recibirás el catálogo completo con una advertencia. " +
        "En ese caso REVISÁ TODA LA LISTA línea por línea antes de decir que no hay productos.",
      input_schema: {
        type: "object" as const,
        properties: {
          busqueda: {
            type: "string",
            description:
              "Término a buscar en todas las columnas del catálogo (tipo, marca, producto, descripción). " +
              "Usar singular sin adjetivos. Ej: 'licuadora', 'heladera', 'samsung', 'galaxy a15'.",
          },
        },
        required: [],
      },
    },
  ];
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

  const toolDefinitions = buildToolDefinitions(tenantName);

  const customFields = (conversation.custom_fields as Record<string, unknown> | null) ?? {};
  const isStoryReply = customFields.story_reply === true;
  const isAdClick = customFields.ad_click === true;
  const isPostComment = customFields.post_comment === true;
  const rawPostContext = typeof customFields.post_context === "string" ? customFields.post_context : "";

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
      `4. Usá get_catalogo INMEDIATAMENTE con el producto/keyword del contexto para traer precio, stock y descripción reales. Nunca inventes datos.\n` +
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
      `4. Usá get_catalogo INMEDIATAMENTE con el producto del contexto.\n` +
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
      `3. Usá get_catalogo INMEDIATAMENTE con el producto del contexto.\n` +
      `4. Respondé pivoteando al producto del post/reel.\n` +
      `================================================================`
    : "";

  // System prompt vía compose-prompt: la plantilla base + la config
  // estructurada del tenant + los bloques de contexto del turno actual.
  // El catálogo no se preinyecta acá — Cami lo trae bajo demanda con la
  // tool `get_catalogo`.
  const fullSystemPrompt = composeSystemPrompt(tenant, "cami_ig", {
    storiesContext: storyContextBlock || undefined,
    adsContext: adsContextBlock || undefined,
    postContext: postContextBlock || undefined,
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
      clearPostContextFlag(conversation.contact_phone.replace("instagram:", "")).catch((e) =>
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
    .limit(MAX_HISTORY_TURNS);
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

  // Tool loop
  // On story reply, ad click, or post comment turns, skip prior history so the
  // model can't anchor to a previous product. The auto-clear above ensures only
  // this one turn is affected.
  const loopMessages: Anthropic.MessageParam[] = (hasStoryContext || hasAdsContext || hasPostContext)
    ? [history[history.length - 1]]
    : [...history];
  let finalText: string | null = null;
  let promptTokens = 0;
  let completionTokens = 0;
  let usedModel = MODEL;
  const toolCallsLog: string[] = [];
  const startMs = Date.now();

  for (let i = 0; i < 10; i++) {
    const response = await callClaude({
      max_tokens: 1024,
      system: fullSystemPrompt,
      tools: toolDefinitions,
      messages: loopMessages,
    });

    promptTokens += response.usage.input_tokens;
    completionTokens += response.usage.output_tokens;
    usedModel = response.model ?? usedModel;

    if (response.stop_reason === "end_turn") {
      const textBlock = response.content
        .filter((b): b is Anthropic.TextBlock => b.type === "text")
        .pop();
      finalText = textBlock?.text ?? null;
      break;
    }

    if (response.stop_reason === "tool_use") {
      loopMessages.push({ role: "assistant", content: response.content });

      const toolResults: Anthropic.ToolResultBlockParam[] = [];

      for (const block of response.content) {
        if (block.type !== "tool_use") continue;
        toolCallsLog.push(block.name);

        let result: string;
        if (block.name === "get_catalogo") {
          try {
            const { busqueda } = block.input as { busqueda?: string };
            result = await getCatalogText(tenant, { search: busqueda });
          } catch (e) {
            result = `Error obteniendo catálogo: ${(e as Error).message}`;
          }
        } else {
          result = `Tool desconocida: ${block.name}`;
        }

        toolResults.push({ type: "tool_result", tool_use_id: block.id, content: result });
      }

      loopMessages.push({ role: "user", content: toolResults });
      continue;
    }

    console.warn(`[cami] Unexpected stop_reason: ${response.stop_reason}`);
    break;
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
    tool_calls: toolCallsLog as unknown as import("@/types/database.types").Json,
  });

  if (!finalText) {
    console.log(`[cami] No text response for conv ${conversationId}`);
    return;
  }

  // Supervisor derivation detection.
  //
  // Orden de operaciones: primero intentamos pausar el bot en ManyChat. Solo
  // si el pause es "real" (o falla con un error grave que sugiere problema de
  // infraestructura) marcamos la conversación como derivada y notificamos al
  // supervisor. ManyChat devuelve 404 ocasionalmente para subscribers cuyo
  // perfil quedó desincronizado del endpoint /instagram/subscriber/* — en ese
  // caso preferimos seguir el flow normal de Cami antes que dejar al cliente
  // sin respuesta.
  if (finalText.includes("Te derivaré con un supervisor.")) {
    let shouldDerive = true;
    try {
      await pauseInstagramBot(subscriberId);
    } catch (err) {
      if (err instanceof ManyChatError && !err.isTransient) {
        // 404 (y otros 4xx no-críticos): seguimos el flow normal. El cliente
        // recibe la respuesta de Cami; no marcamos paused/derived.
        console.warn(
          `[cami] pauseBot ${err.status} — skipping derivation, continuing normal flow for subscriber ${subscriberId}`
        );
        shouldDerive = false;
      } else {
        // 5xx / 401 / 408 / 429 / red: lo tratamos como problema grave y
        // derivamos igual (la pausa no quedó aplicada en ManyChat pero el
        // supervisor puede tomar el chat manualmente).
        console.error("[cami] pauseBot transient/grave error — deriving anyway:", err);
      }
    }

    if (shouldDerive) {
      await adminClient
        .from("conversations")
        .update({ automation_paused: true, paused_reason: "derived_to_human" })
        .eq("id", conversationId);
      await sendSupervisorEmail(nombre, igUsername);
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
    await sendInstagramMessage(subscriberId, finalText);
    await adminClient
      .from("messages")
      .update({ status: "sent" })
      .eq("conversation_id", conversationId)
      .eq("direction", "outbound")
      .eq("status", "queued");

    console.log(
      `[cami] ✓ Sent to @${igUsername} | ${promptTokens + completionTokens} tokens | ${latencyMs}ms | tools: ${toolCallsLog.join(", ") || "none"}`
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

