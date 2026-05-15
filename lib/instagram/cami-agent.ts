import Anthropic from "@anthropic-ai/sdk";
import nodemailer from "nodemailer";
import { adminClient } from "@/lib/supabase/admin";
import { getCatalog } from "@/lib/google/sheets";
import { sendInstagramMessage, pauseInstagramBot } from "./manychat";

const MODEL = "claude-haiku-4-5-20251001";
const CATALOG_SHEET_ID = process.env.INSTAGRAM_CATALOG_SHEET_ID ?? "1c7DpWjA7mi18Ii1oyqNnYqKALhOQDnRF1k7Bcfucm0Y";
const CATALOG_RANGE = process.env.INSTAGRAM_CATALOG_RANGE ?? "Lista de Precios";
const SUPERVISOR_EMAIL = process.env.SUPERVISOR_EMAIL ?? "axiaagencyok@gmail.com";
const MAX_HISTORY_TURNS = 6; // 3 turnos = 6 mensajes (user + assistant)

const SYSTEM_PROMPT_CAMI = `Sos Cami, la asistente virtual de White Diamond, una tienda de tecnología ubicada en zona oeste del Gran Buenos Aires que vende electrónica y productos tecnológicos en general, con envíos a todo el país.

Tu rol es atender a los clientes que escriben por Instagram de forma amable, clara y profesional. Tu tono es cercano pero serio, nunca informal en exceso.

---

REGLA MÁS IMPORTANTE:

Para cualquier consulta sobre productos, precios o disponibilidad, SIEMPRE consultá primero la herramienta del catálogo antes de responder. Nunca respondas precios ni disponibilidad de memoria ni de conversaciones anteriores. El catálogo se actualiza en tiempo real desde una planilla — un producto que existía antes puede no estar más, y los precios pueden haber cambiado.

Cuando consultes el catálogo, vas a recibir TODOS los productos disponibles ahora mismo, con su tipo, marca, nombre, descripción y 3 precios (efectivo, transferencia, plazo 7/15 días). Tu trabajo es filtrar esa lista según lo que pidió el cliente y mostrarle solo los que coincidan.

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
- Garantía: oficial en todos los productos
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
      "Catálogo de productos de White Diamond. Devuelve TODOS los productos disponibles esta semana con tipo, marca, producto, descripción y 3 precios. Consultala SIEMPRE que el cliente pregunte por producto, precio o disponibilidad.",
    input_schema: {
      type: "object" as const,
      properties: {},
      required: [],
    },
  },
];

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

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
    .select("ig_agent_system_prompt")
    .eq("id", conversation.tenant_id)
    .single();

  const fullSystemPrompt = SYSTEM_PROMPT_CAMI +
    (tenant?.ig_agent_system_prompt?.trim()
      ? `\n\n---\nPERSONALIZACIÓN ADICIONAL:\n${tenant.ig_agent_system_prompt}`
      : "");

  // Load recent messages
  const { data: rawMessages } = await adminClient
    .from("messages")
    .select("direction, body, created_at")
    .eq("conversation_id", conversationId)
    .order("created_at", { ascending: false })
    .limit(MAX_HISTORY_TURNS);

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
  const loopMessages: Anthropic.MessageParam[] = [...history];
  let finalText: string | null = null;
  let promptTokens = 0;
  let completionTokens = 0;
  const toolCallsLog: string[] = [];
  const startMs = Date.now();

  for (let i = 0; i < 10; i++) {
    const response = await anthropic.messages.create({
      model: MODEL,
      max_tokens: 1024,
      system: fullSystemPrompt,
      tools: TOOL_DEFINITIONS,
      messages: loopMessages,
    });

    promptTokens += response.usage.input_tokens;
    completionTokens += response.usage.output_tokens;

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
            result = await getCatalog(CATALOG_SHEET_ID, CATALOG_RANGE);
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
    model: MODEL,
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

