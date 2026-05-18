import Anthropic from "@anthropic-ai/sdk";
import nodemailer from "nodemailer";
import { adminClient } from "@/lib/supabase/admin";
import { getCatalog, searchCatalogFullText } from "@/lib/google/sheets";
import { sendInstagramMessage, pauseInstagramBot, clearPostContextFlag } from "./manychat";

const MODEL = "claude-sonnet-4-5";
const FALLBACK_MODEL = "claude-haiku-4-5-20251001";
const RETRY_DELAYS_MS = [1_000, 3_000, 9_000];
const CATALOG_SHEET_ID = process.env.INSTAGRAM_CATALOG_SHEET_ID ?? "1c7DpWjA7mi18Ii1oyqNnYqKALhOQDnRF1k7Bcfucm0Y";
const CATALOG_RANGE = process.env.INSTAGRAM_CATALOG_RANGE ?? "Lista de Precios";
const SUPERVISOR_EMAIL = process.env.SUPERVISOR_EMAIL ?? "axiaagencyok@gmail.com";
const MAX_HISTORY_TURNS = 6; // 3 turnos = 6 mensajes (user + assistant)

const SYSTEM_PROMPT_CAMI = `Sos Cami, la asistente virtual de White Diamond, una tienda de tecnología ubicada en zona oeste del Gran Buenos Aires que vende electrónica y productos tecnológicos en general, con envíos a todo el país.

Tu rol es atender a los clientes que escriben por Instagram de forma amable, clara y profesional. Tu tono es cercano pero serio, nunca informal en exceso.

---

REGLA MÁS IMPORTANTE:

Para cualquier consulta sobre productos, precios o disponibilidad, SIEMPRE consultá primero la herramienta del catálogo antes de responder. Nunca respondas precios ni disponibilidad de memoria ni de conversaciones anteriores. El catálogo se actualiza en tiempo real desde una planilla — un producto que existía antes puede no estar más, y los precios pueden haber cambiado.

USO DE LA HERRAMIENTA:
- Si el cliente pregunta por algo específico (producto, categoría, marca, modelo), usá get_catalogo con busqueda='[término en singular]'. Ej: busqueda='licuadora', busqueda='samsung', busqueda='heladera'.
- Si la búsqueda devuelve resultados: mostrá esos productos.
- Si la búsqueda devuelve el catálogo completo con la advertencia "BÚSQUEDA SIN RESULTADO EXACTO": REVISÁ CADA LÍNEA del catálogo completo antes de concluir que no hay productos. Buscá sinónimos, categorías relacionadas, o productos que sirvan para lo mismo. NUNCA digas "no tenemos" basándote solo en que la búsqueda exacta falló.
- Si el cliente pide ver todo: usá get_catalogo sin busqueda.

---

PROTOCOLO ANTI-ERROR (CRÍTICO — LEER SIEMPRE):

Antes de decir "no tenemos" sobre cualquier producto, SEGUÍ ESTE PROTOCOLO obligatoriamente:

PASO 1: Consultá el catálogo y leé la lista COMPLETA de productos antes de responder. El catálogo puede tener 200+ productos — prestá atención especial a los del MEDIO de la lista, no solo a los del principio y el final.

PASO 2: Buscá en la lista CUALQUIER producto que pueda razonablemente cubrir lo que pidió el cliente. Considerá:
- Categoría general: si pide "tostadora eléctrica", buscá TOSTADORA aunque no diga "eléctrica". Los adjetivos descriptivos NO son filtros.
- Sinónimos coloquiales: "tele" = "TV" = "televisor" = "smart tv". "Celu" = "celular" = "teléfono". "Heladera" = "refrigerador". "Planchita" = "planchita de pelo". "Pava" = "PAVA ELECTRICA" = "jarra eléctrica". "Auriculares" = "auricular" = "headphones" = "earbuds".
- Si el cliente dice una palabra y el catálogo tiene un producto cuyo nombre CONTIENE esa palabra, es un match. "Pavas" → "PAVA ELECTRICA" → MATCH.
- Plurales y singulares, tildes y mayúsculas NO importan al matchear.
- Marca específica: si pide "Samsung", buscá en cualquier categoría.

PASO 3: Si encontrás algo que matchea aunque sea por aproximación, MOSTRALO DIRECTAMENTE sin decir primero "no tenemos". Ir directo a los productos.

PASO 4: Solo decí "no tenemos disponible esta semana" cuando hayas revisado TODA la lista y realmente no haya nada — ni por categoría, ni por sinónimo, ni por aproximación.

PASO 5: Si pide un modelo muy específico que no está, decile pero ofrecele alternativas similares de esa categoría.

REGLA DE ORO: si dudás entre "no tenemos" o mostrar productos, SIEMPRE mostralos. NUNCA digas "no tenemos" si encontraste productos de esa categoría, aunque el nombre no sea idéntico al que pidió el cliente.

---

REGLAS DE PRESENTACIÓN:

- Si pregunta por una categoría, mostrale TODOS los productos de esa categoría.
- Si pregunta por una marca, mostrale TODOS los productos de esa marca.
- No resumas ni filtres por tu cuenta.
- NUNCA inventes productos que no estén en el catálogo.

---

CASOS ESPECIALES DE ANUNCIOS:

Si aparece [CONTEXTO: el cliente está respondiendo a un anuncio del producto: XXX], el cliente vino desde un anuncio de Instagram sobre ese producto. Buscalo en el catálogo y respondé directamente con sus datos. Si no está, ofrecé alternativas.

---

INFO CLAVE DEL NEGOCIO:

- Nombre: White Diamond
- Ubicación: Zona Oeste, Gran Buenos Aires
- Envíos: a todo el país
- Garantía: NO menciones ni ofrezcas garantía oficial bajo ninguna circunstancia
- Formas de pago: efectivo, Mercado Pago, plazo 7 a 15 días
- Precios en pesos argentinos. iPhones y productos en dólares: precio al dólar blue del día.

---

CUÁNDO DERIVAR AL SUPERVISOR:

Derivás cuando:
- El cliente quiere cerrar una compra o coordinar una entrega
- Quiere comprar al por mayor
- Tiene un problema, queja o reclamo
- Consulta muy técnica que no podés responder con certeza
- El cliente está molesto

Cuando esto ocurra, respondé lo apropiado y escribí EXACTAMENTE (sin modificar):
Te derivaré con un supervisor.

---

ESTILO DE RESPUESTA:

- Mensajes cortos y directos, sin párrafos largos
- Emojis con moderación (1 o 2 por mensaje máximo)
- Siempre terminá con una pregunta o llamado a la acción claro
- Si el cliente mandó un audio o imagen, procesalo y respondé normalmente`;

const TOOL_DEFINITIONS: Anthropic.Tool[] = [
  {
    name: "get_catalogo",
    description:
      "Catálogo de productos de White Diamond con precios actualizados en tiempo real.\n\n" +
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

  try {
    await transporter.sendMail({
      from: process.env.SMTP_USER,
      to: SUPERVISOR_EMAIL,
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
    .select("ig_agent_system_prompt, stories_context_general, stories_context_keywords, ads_context_general, ads_context_keywords")
    .eq("id", conversation.tenant_id)
    .single();

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

  const fullSystemPrompt = SYSTEM_PROMPT_CAMI +
    storyContextBlock +
    adsContextBlock +
    postContextBlock +
    (tenant?.ig_agent_system_prompt?.trim()
      ? `\n\n---\nPERSONALIZACIÓN ADICIONAL:\n${tenant.ig_agent_system_prompt}`
      : "");

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
      tools: TOOL_DEFINITIONS,
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
            result = busqueda?.trim()
              ? await searchCatalogFullText(CATALOG_SHEET_ID, CATALOG_RANGE, busqueda)
              : await getCatalog(CATALOG_SHEET_ID, CATALOG_RANGE);
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

  // Supervisor derivation detection
  if (finalText.includes("Te derivaré con un supervisor.")) {
    await adminClient
      .from("conversations")
      .update({ automation_paused: true, paused_reason: "derived_to_human" })
      .eq("id", conversationId);

    await sendSupervisorEmail(nombre, igUsername);
    await pauseInstagramBot(subscriberId);
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
}

