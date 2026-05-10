import Anthropic from "@anthropic-ai/sdk";
import { adminClient } from "@/lib/supabase/admin";
import { getMessagingProvider } from "@/lib/messaging";
import { getTenantCatalog } from "./business-context";
import { buildImageContentBlock, buildAudioText } from "./media-handler";
import { TOOL_DEFINITIONS, type DeriveToHumanInput, type GetCatalogInput } from "./tools";
import type { Conversation, Message, Tenant } from "@/types/database.types";

const MAX_HISTORY_MESSAGES = 30;
const MODEL = "claude-sonnet-4-5";

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

// ── Construcción del historial ────────────────────────────────────────────────

async function buildMessageHistory(
  messages: Message[]
): Promise<Anthropic.MessageParam[]> {
  const turns: Anthropic.MessageParam[] = [];

  for (const msg of messages) {
    const role: "user" | "assistant" = msg.direction === "inbound" ? "user" : "assistant";
    const content: Anthropic.ContentBlockParam[] = [];

    // Texto principal
    if (msg.body?.trim()) {
      content.push({ type: "text", text: msg.body });
    }

    // Audio
    if (msg.media_type?.startsWith("audio")) {
      content.push({ type: "text", text: buildAudioText(msg.transcription) });
    }

    // Imagen
    if (msg.media_url && msg.media_type?.startsWith("image")) {
      const imgBlock = await buildImageContentBlock(msg.media_url, msg.media_type);
      if (imgBlock) content.push(imgBlock);
      else content.push({ type: "text", text: "[El cliente envió una imagen]" });
    }

    // Documento u otro media no soportado
    if (
      msg.media_url &&
      !msg.media_type?.startsWith("audio") &&
      !msg.media_type?.startsWith("image")
    ) {
      content.push({ type: "text", text: `[El cliente envió un archivo: ${msg.media_type ?? "desconocido"}]` });
    }

    if (content.length === 0) continue;

    // Fusionar con el turno anterior si tienen el mismo role (mensajes consecutivos del buffer)
    const last = turns[turns.length - 1];
    if (last && last.role === role && Array.isArray(last.content)) {
      (last.content as Anthropic.ContentBlockParam[]).push(...content);
    } else {
      turns.push({ role, content });
    }
  }

  return turns;
}

// ── Ejecución de tools ────────────────────────────────────────────────────────

interface ToolContext {
  tenant: Tenant;
  conversationId: string;
  derivedToHuman: boolean;
}

async function executeTool(
  toolName: string,
  toolInput: Record<string, unknown>,
  ctx: ToolContext
): Promise<{ result: string; sideEffect?: "derived" }> {
  if (toolName === "get_catalog") {
    const { category } = toolInput as GetCatalogInput;
    const catalog = await getTenantCatalog(ctx.tenant, category);
    return { result: catalog };
  }

  if (toolName === "derive_to_human") {
    const { reason } = toolInput as unknown as DeriveToHumanInput;

    await adminClient
      .from("conversations")
      .update({ automation_paused: true, paused_reason: "derived_to_human" })
      .eq("id", ctx.conversationId);

    console.log(`[agent] Conversación ${ctx.conversationId} derivada: ${reason}`);
    return {
      result: "Derivación registrada. El supervisor recibirá la conversación.",
      sideEffect: "derived",
    };
  }

  return { result: `Tool desconocida: ${toolName}` };
}

// ── Loop principal ────────────────────────────────────────────────────────────

export interface AgentResult {
  responseText: string | null;
  derivedToHuman: boolean;
  promptTokens: number;
  completionTokens: number;
  toolCallsLog: Array<{ name: string; input: Record<string, unknown> }>;
}

export async function runAgent(
  conversation: Conversation,
  tenant: Tenant
): Promise<AgentResult> {
  // 1. Cargar historial de mensajes
  const { data: rawMessages } = await adminClient
    .from("messages")
    .select("*")
    .eq("conversation_id", conversation.id)
    .order("created_at", { ascending: true })
    .limit(MAX_HISTORY_MESSAGES);

  const messages = rawMessages ?? [];

  if (messages.length === 0) {
    return { responseText: null, derivedToHuman: false, promptTokens: 0, completionTokens: 0, toolCallsLog: [] };
  }

  // 2. Construir historial para Claude
  const messageHistory = await buildMessageHistory(messages);

  // Asegurarse de que el último turno sea del usuario
  if (messageHistory.length === 0 || messageHistory[messageHistory.length - 1].role !== "user") {
    return { responseText: null, derivedToHuman: false, promptTokens: 0, completionTokens: 0, toolCallsLog: [] };
  }

  // 3. Loop de tool calling
  const ctx: ToolContext = {
    tenant,
    conversationId: conversation.id,
    derivedToHuman: false,
  };

  const toolCallsLog: Array<{ name: string; input: Record<string, unknown> }> = [];
  let promptTokens = 0;
  let completionTokens = 0;
  let finalText: string | null = null;

  const loopMessages: Anthropic.MessageParam[] = [...messageHistory];

  for (let iteration = 0; iteration < 10; iteration++) {
    const response = await anthropic.messages.create({
      model: MODEL,
      max_tokens: 4096,
      system: tenant.agent_system_prompt,
      tools: TOOL_DEFINITIONS,
      messages: loopMessages,
    });

    promptTokens += response.usage.input_tokens;
    completionTokens += response.usage.output_tokens;

    if (response.stop_reason === "end_turn") {
      // Extraer el último bloque de texto como respuesta final
      const textBlock = response.content
        .filter((b): b is Anthropic.TextBlock => b.type === "text")
        .pop();
      finalText = textBlock?.text ?? null;
      break;
    }

    if (response.stop_reason === "tool_use") {
      // Añadir respuesta del asistente (con tool_use blocks) al historial
      loopMessages.push({ role: "assistant", content: response.content });

      // Procesar cada tool call
      const toolResults: Anthropic.ToolResultBlockParam[] = [];

      for (const block of response.content) {
        if (block.type !== "tool_use") continue;

        toolCallsLog.push({ name: block.name, input: block.input as Record<string, unknown> });

        const { result, sideEffect } = await executeTool(
          block.name,
          block.input as Record<string, unknown>,
          ctx
        );

        if (sideEffect === "derived") ctx.derivedToHuman = true;

        toolResults.push({
          type: "tool_result",
          tool_use_id: block.id,
          content: result,
        });
      }

      loopMessages.push({ role: "user", content: toolResults });
      continue;
    }

    // stop_reason inesperado
    console.warn(`[agent] stop_reason inesperado: ${response.stop_reason}`);
    break;
  }

  return {
    responseText: finalText,
    derivedToHuman: ctx.derivedToHuman,
    promptTokens,
    completionTokens,
    toolCallsLog,
  };
}

// ── Envío de respuesta y logging ──────────────────────────────────────────────

export async function processConversation(
  conversationId: string
): Promise<{ sent: boolean; derivedToHuman: boolean }> {
  const startMs = Date.now();

  // Cargar conversación y tenant
  const { data: conversation } = await adminClient
    .from("conversations")
    .select("*")
    .eq("id", conversationId)
    .single();

  if (!conversation) {
    console.error(`[agent] Conversación no encontrada: ${conversationId}`);
    return { sent: false, derivedToHuman: false };
  }

  const { data: tenant } = await adminClient
    .from("tenants")
    .select("*")
    .eq("id", conversation.tenant_id)
    .single();

  if (!tenant) {
    console.error(`[agent] Tenant no encontrado: ${conversation.tenant_id}`);
    return { sent: false, derivedToHuman: false };
  }

  // Guards
  if (!tenant.agent_enabled) {
    console.log(`[agent] Agente deshabilitado para tenant ${tenant.id}`);
    return { sent: false, derivedToHuman: false };
  }
  if (conversation.automation_paused) {
    console.log(`[agent] Conversación pausada: ${conversationId}`);
    return { sent: false, derivedToHuman: false };
  }

  // Ejecutar agente
  const result = await runAgent(conversation, tenant);

  const latencyMs = Date.now() - startMs;

  // Guardar log
  await adminClient.from("ai_logs").insert({
    tenant_id: tenant.id,
    conversation_id: conversationId,
    prompt_tokens: result.promptTokens,
    completion_tokens: result.completionTokens,
    model: MODEL,
    latency_ms: latencyMs,
    tool_calls: result.toolCallsLog as unknown as import("@/types/database.types").Json,
  });

  if (!result.responseText) {
    console.log(`[agent] Sin respuesta de texto para conv ${conversationId}`);
    return { sent: false, derivedToHuman: result.derivedToHuman };
  }

  // Guardar mensaje outbound en DB
  const { data: savedMessage } = await adminClient
    .from("messages")
    .insert({
      conversation_id: conversationId,
      tenant_id: tenant.id,
      direction: "outbound",
      sender: "ai",
      body: result.responseText,
      status: "queued",
    })
    .select("id")
    .single();

  // Enviar por WhatsApp
  try {
    const messaging = getMessagingProvider();
    const { sid, status } = await messaging.send({
      from: tenant.whatsapp_number,
      to: conversation.contact_phone,
      body: result.responseText,
    });

    if (savedMessage) {
      await adminClient
        .from("messages")
        .update({ twilio_sid: sid, status: status as "sent" | "queued" })
        .eq("id", savedMessage.id);
    }

    console.log(
      `[agent] ✓ Respuesta enviada a ${conversation.contact_phone} | ` +
        `${result.promptTokens + result.completionTokens} tokens | ` +
        `${latencyMs}ms | tools: ${result.toolCallsLog.map((t) => t.name).join(", ") || "ninguna"}`
    );
  } catch (err) {
    console.error("[agent] Error enviando mensaje:", (err as Error).message);
    if (savedMessage) {
      await adminClient
        .from("messages")
        .update({ status: "failed", error_message: (err as Error).message })
        .eq("id", savedMessage.id);
    }
  }

  return { sent: true, derivedToHuman: result.derivedToHuman };
}
