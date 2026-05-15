import Anthropic from "@anthropic-ai/sdk";
import { adminClient } from "@/lib/supabase/admin";
import { getMessagingProvider } from "@/lib/messaging";
import { getCatalog, updateCell, appendRow, clearRow } from "@/lib/google/sheets";
import { getTenantCatalog } from "./business-context";
import {
  ADMIN_TOOL_DEFINITIONS,
  type GetContactsReportInput,
  type GetMessagesReportInput,
  type GetStatsInput,
  type UpdateCatalogPriceInput,
  type AddCatalogItemInput,
  type DeleteCatalogItemInput,
  type SendMessageToContactInput,
  type PauseConversationInput,
  type UpdateContactInfoInput,
  type UpdateAgentPromptInput,
} from "./admin-tools";
import type { Conversation, Tenant } from "@/types/database.types";

const MAX_ITERATIONS = 10;
const MODEL = "claude-sonnet-4-5";
const FALLBACK_MODEL = "claude-haiku-4-5-20251001";
const RETRY_DELAYS_MS = [1_000, 3_000, 9_000];
const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

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
          console.warn(`[admin-agent] ${status} (${model}) attempt ${attempt + 1}, retrying in ${RETRY_DELAYS_MS[attempt]}ms`);
          await new Promise<void>((r) => setTimeout(r, RETRY_DELAYS_MS[attempt]));
          continue;
        }
        if (isOverload && !isLastModel) {
          console.warn(`[admin-agent] ${status} on ${model} exhausted — falling back to ${FALLBACK_MODEL}`);
          break;
        }
        throw err;
      }
    }
  }
  throw new Error("[admin-agent] All Claude API attempts exhausted");
}

// ── Period → Date range ───────────────────────────────────────────────────────

function periodToSince(period: string): string {
  const map: Record<string, number> = { "24h": 24, "7d": 7 * 24, "30d": 30 * 24 };
  const hours = map[period] ?? 7 * 24;
  return new Date(Date.now() - hours * 3_600_000).toISOString();
}

// ── Tool executor ─────────────────────────────────────────────────────────────

async function executeTool(
  name: string,
  input: Record<string, unknown>,
  tenantId: string,
  tenant: Tenant
): Promise<string> {

  // ── Read-only tools ──────────────────────────────────────────────────────────

  if (name === "get_catalog") {
    const { category } = input as { category?: string };
    return getTenantCatalog(tenant, category);
  }

  if (name === "get_contacts_report") {
    const { period = "7d", tags, limit = 20 } = input as GetContactsReportInput;
    const since = periodToSince(period);

    let query = adminClient
      .from("conversations")
      .select("contact_phone, contact_name, contact_email, notes, tags, last_message_at, automation_paused, unread_count")
      .eq("tenant_id", tenantId)
      .eq("is_admin", false)
      .gte("last_message_at", since)
      .order("last_message_at", { ascending: false })
      .limit(limit);

    if (tags?.length) {
      query = query.overlaps("tags", tags);
    }

    const { data, error } = await query;
    if (error) return `Error: ${error.message}`;
    if (!data?.length) return "No se encontraron contactos en el período indicado.";

    const rows = data.map((c) => [
      c.contact_name ?? c.contact_phone,
      c.contact_phone,
      c.contact_email ?? "-",
      c.tags?.join(", ") ?? "-",
      new Date(c.last_message_at).toLocaleString("es-AR"),
      c.automation_paused ? "Pausado" : "IA activa",
      c.notes?.slice(0, 60) ?? "-",
    ].join(" | "));

    return `Contactos (${data.length}):\nNombre | Teléfono | Email | Tags | Último mensaje | Estado | Notas\n${rows.join("\n")}`;
  }

  if (name === "get_messages_report") {
    const { period, contact_phone } = input as unknown as GetMessagesReportInput;
    const since = periodToSince(period);

    let convQuery = adminClient
      .from("conversations")
      .select("id, contact_phone, contact_name")
      .eq("tenant_id", tenantId)
      .eq("is_admin", false);

    if (contact_phone) convQuery = convQuery.eq("contact_phone", contact_phone);

    const { data: convs } = await convQuery;
    if (!convs?.length) return "No se encontraron conversaciones.";

    const convIds = convs.map((c) => c.id);
    const phoneMap = Object.fromEntries(convs.map((c) => [c.id, c.contact_name ?? c.contact_phone]));

    const { data: msgs, error } = await adminClient
      .from("messages")
      .select("conversation_id, direction, sender, body, created_at")
      .in("conversation_id", convIds)
      .gte("created_at", since)
      .order("created_at", { ascending: false })
      .limit(100);

    if (error) return `Error: ${error.message}`;
    if (!msgs?.length) return "No hay mensajes en el período.";

    const rows = msgs.map((m) =>
      `[${new Date(m.created_at).toLocaleString("es-AR")}] ${phoneMap[m.conversation_id]} — ${m.direction}/${m.sender}: ${m.body?.slice(0, 100) ?? "(media)"}`
    );

    return `Mensajes (${msgs.length}):\n${rows.join("\n")}`;
  }

  if (name === "get_stats") {
    const { period } = input as unknown as GetStatsInput;
    const since = periodToSince(period);

    const [
      { count: totalMsgs },
      { count: aiMsgs },
      { count: humanMsgs },
      { count: derivaciones },
      { data: uniqueConvs },
      { data: logRows },
    ] = await Promise.all([
      adminClient.from("messages").select("*", { count: "exact", head: true }).eq("tenant_id", tenantId).gte("created_at", since),
      adminClient.from("messages").select("*", { count: "exact", head: true }).eq("tenant_id", tenantId).eq("sender", "ai").gte("created_at", since),
      adminClient.from("messages").select("*", { count: "exact", head: true }).eq("tenant_id", tenantId).eq("sender", "human").gte("created_at", since),
      adminClient.from("conversations").select("*", { count: "exact", head: true }).eq("tenant_id", tenantId).eq("paused_reason", "derived_to_human"),
      adminClient.from("messages").select("conversation_id").eq("tenant_id", tenantId).gte("created_at", since),
      adminClient.from("ai_logs").select("prompt_tokens, completion_tokens").eq("tenant_id", tenantId).gte("created_at", since),
    ]);

    const uniqueContacts = new Set(uniqueConvs?.map((m) => m.conversation_id) ?? []).size;
    const totalTokens    = (logRows ?? []).reduce((sum, r) => sum + (r.prompt_tokens ?? 0) + (r.completion_tokens ?? 0), 0);
    const pctAi          = totalMsgs ? Math.round(((aiMsgs ?? 0) / totalMsgs) * 100) : 0;

    return [
      `Estadísticas (${period}):`,
      `• Mensajes totales: ${totalMsgs ?? 0}`,
      `• Enviados por IA: ${aiMsgs ?? 0} (${pctAi}%)`,
      `• Enviados por humano: ${humanMsgs ?? 0}`,
      `• Contactos únicos activos: ${uniqueContacts}`,
      `• Derivaciones a humano: ${derivaciones ?? 0}`,
      `• Tokens consumidos: ${totalTokens.toLocaleString()}`,
    ].join("\n");
  }

  // ── Write tools (con confirmación) ──────────────────────────────────────────

  if (name === "update_catalog_price") {
    const { row_match, column, new_value, confirmed } = input as unknown as UpdateCatalogPriceInput;

    if (!confirmed) {
      // Preview: buscar valor actual
      try {
        const sheetId = tenant.google_sheet_id;
        const range   = tenant.google_sheet_range;
        if (!sheetId) return "El tenant no tiene Google Sheet configurado.";

        const { rows, headers } = await import("./admin-tools").then(() =>
          import("../google/sheets").then((m) => m.getRawRows(sheetId, range))
        );

        const colIndex = headers.findIndex((h) => h.toLowerCase().trim() === column.toLowerCase().trim());
        const rowIndex = rows.findIndex((row) =>
          row.some((cell) => cell?.toLowerCase().includes(row_match.toLowerCase()))
        );

        const currentVal = rowIndex >= 0 && colIndex >= 0 ? (rows[rowIndex][colIndex] ?? "(vacío)") : "desconocido";

        return `PREVIEW: Voy a cambiar "${row_match}" → columna "${column}" de "${currentVal}" a "${new_value}". ¿Confirmás? Respondé "sí" o "confirma".`;
      } catch {
        return `PREVIEW: Voy a cambiar "${row_match}" → columna "${column}" a "${new_value}". ¿Confirmás?`;
      }
    }

    const sheetId = tenant.google_sheet_id;
    const range   = tenant.google_sheet_range;
    if (!sheetId) return "El tenant no tiene Google Sheet configurado.";

    const result = await updateCell(sheetId, range, row_match, column, new_value);
    return `✅ Actualizado: "${row_match}" → "${column}" cambió de "${result.previousValue}" a "${result.newValue}".`;
  }

  if (name === "add_catalog_item") {
    const { row_data, confirmed } = input as unknown as AddCatalogItemInput;

    if (!confirmed) {
      const preview = Object.entries(row_data).map(([k, v]) => `${k}: ${v}`).join(", ");
      return `PREVIEW: Voy a agregar una nueva fila al catálogo con: ${preview}. ¿Confirmás?`;
    }

    const sheetId = tenant.google_sheet_id;
    const range   = tenant.google_sheet_range;
    if (!sheetId) return "El tenant no tiene Google Sheet configurado.";

    const result = await appendRow(sheetId, range, row_data);
    return `✅ Fila agregada: ${result.appendedRow.join(" | ")}`;
  }

  if (name === "delete_catalog_item") {
    const { row_match, confirmed } = input as unknown as DeleteCatalogItemInput;

    if (!confirmed) {
      return `PREVIEW: Voy a eliminar (limpiar) la fila que contiene "${row_match}" del catálogo. ¿Confirmás?`;
    }

    const sheetId = tenant.google_sheet_id;
    const range   = tenant.google_sheet_range;
    if (!sheetId) return "El tenant no tiene Google Sheet configurado.";

    const result = await clearRow(sheetId, range, row_match);
    if (!result.found) return `No se encontró ninguna fila que contenga "${row_match}".`;
    return `✅ Fila con "${row_match}" eliminada del catálogo.`;
  }

  if (name === "send_message_to_contact") {
    const { contact_phone, message, confirmed } = input as unknown as SendMessageToContactInput;

    if (!confirmed) {
      return `PREVIEW: Voy a enviar a ${contact_phone}: "${message}". ¿Confirmás?`;
    }

    const messaging = getMessagingProvider();
    const { sid } = await messaging.send({
      from: tenant.whatsapp_number,
      to: contact_phone,
      body: message,
    });

    // Insertar como mensaje outbound del agente admin
    const { data: conv } = await adminClient
      .from("conversations")
      .select("id, tenant_id")
      .eq("tenant_id", tenantId)
      .eq("contact_phone", contact_phone)
      .single();

    if (conv) {
      await adminClient.from("messages").insert({
        conversation_id: conv.id,
        tenant_id: tenantId,
        direction: "outbound",
        sender: "ai",
        body: message,
        twilio_sid: sid,
        status: "sent",
      });
      await adminClient.from("conversations").update({ last_message_at: new Date().toISOString() }).eq("id", conv.id);
    }

    return `✅ Mensaje enviado a ${contact_phone}. SID: ${sid}`;
  }

  if (name === "pause_conversation_automation") {
    const { contact_phone, paused } = input as unknown as PauseConversationInput;

    const { error } = await adminClient
      .from("conversations")
      .update({
        automation_paused: paused,
        paused_reason: paused ? "manual" : null,
      })
      .eq("tenant_id", tenantId)
      .eq("contact_phone", contact_phone);

    if (error) return `Error: ${error.message}`;
    return `✅ IA ${paused ? "pausada" : "reactivada"} para ${contact_phone}.`;
  }

  if (name === "update_agent_prompt") {
    const { new_prompt } = input as unknown as UpdateAgentPromptInput;

    const { error } = await adminClient
      .from("tenants")
      .update({ agent_system_prompt: new_prompt })
      .eq("id", tenantId);

    if (error) return `Error al actualizar el prompt: ${error.message}`;
    return `✅ Listo, cambio aplicado al agente.`;
  }

  if (name === "update_contact_info") {
    const { contact_phone, fields } = input as unknown as UpdateContactInfoInput;

    const update: {
      contact_name?: string;
      contact_email?: string;
      notes?: string;
      tags?: string[];
    } = {};
    if (fields.name  !== undefined) update.contact_name  = fields.name;
    if (fields.email !== undefined) update.contact_email = fields.email;
    if (fields.notes !== undefined) update.notes         = fields.notes;
    if (fields.tags  !== undefined) update.tags          = fields.tags;

    const { error } = await adminClient
      .from("conversations")
      .update(update)
      .eq("tenant_id", tenantId)
      .eq("contact_phone", contact_phone);

    if (error) return `Error: ${error.message}`;
    return `✅ Contacto ${contact_phone} actualizado: ${Object.keys(update).join(", ")}.`;
  }

  return `Tool "${name}" no reconocida.`;
}

// ── System prompt builder ─────────────────────────────────────────────────────

function buildAdminSystemPrompt(tenant: Tenant): string {
  const base = tenant.admin_system_prompt ??
    `Sos el asistente operativo de ${tenant.name}. El gerente te escribe por WhatsApp para pedirte reportes, modificar el catálogo, o consultar info del negocio. Sos preciso, conciso, profesional. Antes de cualquier acción que modifique datos (precio, broadcast, borrar), pedí confirmación explícita.`;

  const currentAgentPrompt = tenant.agent_system_prompt
    ? `\n\nPROMPT ACTUAL DEL AGENTE DE CLIENTES:\n"""\n${tenant.agent_system_prompt}\n"""\nCuando el gerente pida cambiar algo del agente, modificá ese prompt aplicando el cambio puntual y guardalo con update_agent_prompt.`
    : "";

  return `${base}${currentAgentPrompt}

Tenés acceso a las siguientes tools:
- get_catalog: catálogo de productos con precios desde Google Sheets. Llamá SIEMPRE antes de responder sobre productos, precios o disponibilidad — nunca afirmes que algo no existe sin consultarlo primero.
- get_contacts_report: lista de contactos con último mensaje, tags y notas.
- get_messages_report: mensajes en un período, filtrado por contacto.
- get_stats: estadísticas del período (mensajes, IA vs manual, tokens, derivaciones).
- update_catalog_price: actualiza precios en Google Sheets (requiere confirmación).
- add_catalog_item: agrega productos al catálogo (requiere confirmación).
- delete_catalog_item: elimina productos del catálogo (requiere confirmación).
- send_message_to_contact: envía WhatsApp a un contacto (requiere confirmación).
- pause_conversation_automation: pausa/reactiva IA para un chat.
- update_contact_info: actualiza nombre, email, notas, tags de un contacto.

Para acciones destructivas (update_catalog_price, add_catalog_item, delete_catalog_item, send_message_to_contact) siempre mostrás un PREVIEW y esperás confirmación explícita ("sí", "confirmá", "dale") antes de ejecutar.
REGLA CRÍTICA: Después de ejecutar CUALQUIER acción (tool call), SIEMPRE generá una respuesta de texto confirmando al admin qué hiciste, en lenguaje natural y concreto. Ejemplo: "Listo, actualicé el precio del iPhone 14 de $1.200.000 a $1.300.000." Si la acción falló, reportá el error con claridad. Nunca quedes en silencio después de una tool.
Nunca te despidas ni cierres la conversación a menos que el admin lo diga explícitamente.
Respondé siempre en español. Sé conciso.`;
}

// ── Main entry point ──────────────────────────────────────────────────────────

export async function processAdminConversation(conversationId: string): Promise<void> {
  const start = Date.now();

  // ── Load conversation + tenant ────────────────────────────────────────────
  const { data: conv, error: convErr } = await adminClient
    .from("conversations")
    .select("*, tenant:tenants(*)")
    .eq("id", conversationId)
    .single();

  if (convErr || !conv) {
    console.error("[admin-agent] Conversation not found:", conversationId);
    return;
  }

  const tenant = conv.tenant as unknown as Tenant;

  // ── Security: re-verify this is indeed an admin conversation ─────────────
  if (!tenant.admin_phone || conv.contact_phone !== tenant.admin_phone) {
    console.error("[admin-agent] Security check failed: phone mismatch");
    return;
  }

  // ── Load last N messages (most recent, in chronological order) ───────────
  const { data: rawMessages } = await adminClient
    .from("messages")
    .select("*")
    .eq("conversation_id", conversationId)
    .order("created_at", { ascending: false })
    .limit(30);

  const messages = (rawMessages ?? []).reverse();

  // Build message history (simple: inbound = user, outbound = assistant)
  const history: Anthropic.MessageParam[] = [];
  for (const msg of messages) {
    const role = msg.direction === "inbound" ? "user" : "assistant";
    const text = msg.body?.trim();
    if (!text) continue;
    // Merge consecutive same-role
    if (history.length > 0 && history[history.length - 1].role === role) {
      const last = history[history.length - 1];
      if (Array.isArray(last.content)) {
        (last.content as Anthropic.ContentBlockParam[]).push({ type: "text", text });
      }
    } else {
      history.push({ role, content: [{ type: "text", text }] });
    }
  }

  if (history.length === 0 || history[history.length - 1].role !== "user") return;

  // ── Agent loop ────────────────────────────────────────────────────────────
  const loopMessages = [...history];
  let iterations = 0;
  let finalText  = "";
  let promptTokensTotal = 0;
  let completionTokensTotal = 0;
  const toolCallsLog: unknown[] = [];
  let lastToolResult = ""; // fallback if Claude is silent after tool execution

  while (iterations < MAX_ITERATIONS) {
    iterations++;

    const response = await callClaude({
      max_tokens: 4096,
      system: buildAdminSystemPrompt(tenant),
      tools:  ADMIN_TOOL_DEFINITIONS,
      messages: loopMessages,
    });

    promptTokensTotal     += response.usage.input_tokens;
    completionTokensTotal += response.usage.output_tokens;

    if (response.stop_reason === "tool_use") {
      const assistantContent: Anthropic.ContentBlockParam[] = [];
      const toolResults: Anthropic.ToolResultBlockParam[]   = [];

      for (const block of response.content) {
        if (block.type === "text") {
          assistantContent.push(block);
        } else if (block.type === "tool_use") {
          assistantContent.push(block);
          toolCallsLog.push({ name: block.name, input: block.input });

          const result = await executeTool(
            block.name,
            block.input as Record<string, unknown>,
            tenant.id,
            tenant
          );

          lastToolResult = result; // track for fallback

          toolResults.push({
            type:       "tool_result",
            tool_use_id: block.id,
            content:    result,
          });
        }
      }

      loopMessages.push({ role: "assistant", content: assistantContent });
      loopMessages.push({ role: "user",      content: toolResults });
      continue;
    }

    // end_turn or max_tokens
    finalText = response.content
      .filter((b): b is Anthropic.TextBlock => b.type === "text")
      .map((b) => b.text)
      .join("\n")
      .trim();
    break;
  }

  // If Claude was silent after tool execution, use the last tool result directly
  if (!finalText && lastToolResult) {
    console.warn("[admin-agent] Claude silent after tool — using tool result as response");
    finalText = lastToolResult;
  }

  if (!finalText) {
    console.error("[admin-agent] No response after loop");
    return;
  }

  // ── Send response via Twilio ──────────────────────────────────────────────
  const messaging = getMessagingProvider();
  const { sid, status } = await messaging.send({
    from: tenant.whatsapp_number,
    to:   conv.contact_phone,
    body: finalText,
  });

  // ── Persist outbound message ──────────────────────────────────────────────
  await adminClient.from("messages").insert({
    conversation_id: conversationId,
    tenant_id:       tenant.id,
    direction:       "outbound",
    sender:          "ai",
    body:            finalText,
    twilio_sid:      sid,
    status:          status as "sent" | "queued",
  });

  await adminClient.from("conversations")
    .update({ last_message_at: new Date().toISOString() })
    .eq("id", conversationId);

  // ── Log to ai_logs ────────────────────────────────────────────────────────
  await adminClient.from("ai_logs").insert({
    tenant_id:         tenant.id,
    conversation_id:   conversationId,
    prompt_tokens:     promptTokensTotal,
    completion_tokens: completionTokensTotal,
    model:             MODEL,
    latency_ms:        Date.now() - start,
    tool_calls:        toolCallsLog as never,
    is_admin_action:   true,
  });
}
