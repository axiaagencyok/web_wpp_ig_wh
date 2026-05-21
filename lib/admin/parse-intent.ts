// Parser de intents del admin assistant (PR D).
// Toma un texto en español + contexto del tenant y devuelve una propuesta
// de cambio estructurada (sin ejecutarla). El webhook persiste la propuesta
// en pending_admin_actions y le pide al admin que conteste SI o NO.

import Anthropic from "@anthropic-ai/sdk";
import type { Tenant } from "@/types/database.types";

const MODEL = "claude-sonnet-4-5";
const FALLBACK_MODEL = "claude-haiku-4-5-20251001";
const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

// ── Tipos del contrato ──────────────────────────────────────────────────────

export type AdminActionType = "update_price" | "update_agent_config" | "update_context";

export interface UpdatePricePayload {
  sheet_match: string;   // texto para identificar la fila (substring case-insensitive)
  column:      string;   // nombre exacto de la columna
  new_value:   string;   // nuevo valor
  current_value?: string; // valor actual leído del sheet (informativo)
}

// Sólo permitimos campos estructurados conocidos para evitar que el modelo
// invente columnas. update_agent_prompt full-text lo sigue cubriendo el
// admin-agent existente; este flujo es para los campos discretos.
export type AgentConfigField =
  | "agent_active_offer"
  | "agent_business_hours"
  | "agent_temporary_closures"
  | "agent_special_instructions";

export interface UpdateAgentConfigPayload {
  field:     AgentConfigField;
  new_value: string | null; // null = limpiar el campo
}

export type ContextField =
  | "stories_context_general"
  | "stories_context_keywords"
  | "ads_context_general"
  | "ads_context_keywords";

export interface UpdateContextPayload {
  field:   ContextField;
  content: string;
}

export type AdminActionPayload =
  | { action_type: "update_price";        payload: UpdatePricePayload }
  | { action_type: "update_agent_config"; payload: UpdateAgentConfigPayload }
  | { action_type: "update_context";      payload: UpdateContextPayload };

export type ParsedIntent =
  | { ok: true;  action: AdminActionPayload; human_summary: string }
  | { ok: false; reason: string };

// ── Contexto que recibe el parser ───────────────────────────────────────────

export interface ParseContext {
  tenant:           Tenant;
  // Headers del Google Sheet del tenant (para que el modelo sepa qué columnas existen).
  catalogHeaders?:  string[];
  // Sample de las primeras filas para que pueda hacer match sobre nombres reales.
  catalogSample?:   string[][];
}

// ── Schema-as-prompt ────────────────────────────────────────────────────────

const SYSTEM_PROMPT = `Sos un parser de intents para un asistente administrativo de WhatsApp. El dueño del negocio te manda un mensaje en español pidiendo modificar la configuración del agente o el catálogo. Tu único trabajo es devolver UN JSON con la propuesta de cambio. NO ejecutás nada — sólo proponés.

Devolvé JSON con UNA de estas formas:

1) Cambiar un precio o columna del catálogo (Google Sheets):
{
  "action_type": "update_price",
  "payload": {
    "sheet_match": "<texto para identificar la fila — ej. nombre del producto>",
    "column":      "<nombre EXACTO de la columna a modificar — debe coincidir con uno de los headers>",
    "new_value":   "<nuevo valor como string>"
  },
  "human_summary": "<oración en español resumiendo la propuesta>"
}

2) Cambiar un campo estructurado de la config del agente:
{
  "action_type": "update_agent_config",
  "payload": {
    "field":     "agent_active_offer" | "agent_business_hours" | "agent_temporary_closures" | "agent_special_instructions",
    "new_value": "<texto nuevo, o null para limpiar el campo>"
  },
  "human_summary": "..."
}

   - agent_active_offer: oferta vigente que el agente menciona.
   - agent_business_hours: horario de atención en texto libre.
   - agent_temporary_closures: cierres temporales (vacaciones, feriados).
   - agent_special_instructions: instrucciones libres adicionales.

3) Cambiar contexto dinámico (stories / ads):
{
  "action_type": "update_context",
  "payload": {
    "field":   "stories_context_general" | "stories_context_keywords" | "ads_context_general" | "ads_context_keywords",
    "content": "<texto sin precios ni stock>"
  },
  "human_summary": "..."
}

REGLAS:
- "human_summary" siempre en español natural, sin tecnicismos. Ej: "subir el precio de SPC Click 4mm a 42000".
- Si el usuario quiere borrar/sacar una oferta o cierre, usá action_type=update_agent_config con new_value=null.
- Para update_context NUNCA incluyas precios ni stock — eso siempre viene del catálogo.
- Si el mensaje no encaja en ninguno de los 3 tipos (consultas, saludos, dudas, pedidos no soportados) devolvé:
  { "ok": false, "reason": "<por qué no se pudo parsear, en español, corto>" }
- NO inventes columnas que no estén en la lista de headers del catálogo.
- Sólo respondés JSON crudo, sin markdown, sin comentarios.`;

function buildContextBlock(ctx: ParseContext): string {
  const lines: string[] = [];
  lines.push(`Negocio: ${ctx.tenant.name}`);

  if (ctx.catalogHeaders?.length) {
    lines.push(`Headers del catálogo: ${ctx.catalogHeaders.join(" | ")}`);
  }

  if (ctx.catalogSample?.length) {
    lines.push("Muestra del catálogo (primeras filas):");
    for (const row of ctx.catalogSample.slice(0, 8)) {
      lines.push("  " + row.map((c) => c ?? "").join(" | "));
    }
  }

  // Estado actual de los campos editables — útil para que el modelo entienda
  // qué pide cambiar el usuario cuando dice "sacar la oferta" etc.
  const t = ctx.tenant;
  const current = [
    ["agent_active_offer",         t.agent_active_offer],
    ["agent_business_hours",       t.agent_business_hours],
    ["agent_temporary_closures",   t.agent_temporary_closures],
    ["agent_special_instructions", t.agent_special_instructions],
    ["stories_context_general",    t.stories_context_general],
    ["stories_context_keywords",   t.stories_context_keywords],
    ["ads_context_general",        t.ads_context_general],
    ["ads_context_keywords",       t.ads_context_keywords],
  ] as const;

  const lines2 = current
    .filter(([, v]) => v != null && v !== "")
    .map(([k, v]) => `  ${k}: ${v}`);
  if (lines2.length) {
    lines.push("Valores actuales:");
    lines.push(...lines2);
  }

  return lines.join("\n");
}

// ── Parser ──────────────────────────────────────────────────────────────────

function extractJson(text: string): unknown {
  const cleaned = text.trim().replace(/^```(?:json)?\s*/i, "").replace(/```$/, "").trim();
  return JSON.parse(cleaned);
}

async function callClaude(userMessage: string, systemBlock: string): Promise<string> {
  for (const model of [MODEL, FALLBACK_MODEL]) {
    try {
      const res = await anthropic.messages.create({
        model,
        max_tokens: 1024,
        system: systemBlock,
        messages: [{ role: "user", content: userMessage }],
      });
      const text = res.content.find((b) => b.type === "text");
      if (text && text.type === "text") return text.text;
    } catch (err) {
      const status = (err as { status?: number }).status;
      if (status === 529 || status === 503) continue; // fallback
      throw err;
    }
  }
  throw new Error("[parse-intent] todas las llamadas a Claude fallaron");
}

export async function parseAdminIntent(
  text:    string,
  context: ParseContext,
): Promise<ParsedIntent> {
  const systemBlock = `${SYSTEM_PROMPT}\n\nCONTEXTO:\n${buildContextBlock(context)}`;
  const raw = await callClaude(text, systemBlock);

  let parsed: unknown;
  try {
    parsed = extractJson(raw);
  } catch {
    return { ok: false, reason: "No pude entender el pedido (respuesta del parser no es JSON)." };
  }

  if (!parsed || typeof parsed !== "object") {
    return { ok: false, reason: "No pude entender el pedido." };
  }

  // Caso explícito de "no se pudo parsear"
  if ((parsed as { ok?: boolean }).ok === false) {
    return { ok: false, reason: (parsed as { reason?: string }).reason ?? "No pude entender el pedido." };
  }

  const action_type = (parsed as { action_type?: string }).action_type;
  const payload     = (parsed as { payload?: unknown }).payload;
  const summary     = (parsed as { human_summary?: string }).human_summary?.trim();

  if (!action_type || !payload || typeof payload !== "object" || !summary) {
    return { ok: false, reason: "El parser devolvió un JSON incompleto." };
  }

  const validated = validatePayload(action_type, payload, context);
  if (!validated.ok) return { ok: false, reason: validated.reason };

  return { ok: true, action: validated.action, human_summary: summary };
}

function validatePayload(
  action_type: string,
  payload:     object,
  context:     ParseContext,
): { ok: true; action: AdminActionPayload } | { ok: false; reason: string } {
  if (action_type === "update_price") {
    const { sheet_match, column, new_value } = payload as Partial<UpdatePricePayload>;
    if (!sheet_match || !column || new_value == null) {
      return { ok: false, reason: "Faltan campos para actualizar el precio." };
    }
    if (context.catalogHeaders?.length) {
      const ok = context.catalogHeaders.some(
        (h) => h.toLowerCase().trim() === column.toLowerCase().trim(),
      );
      if (!ok) {
        return {
          ok: false,
          reason: `La columna "${column}" no existe en el catálogo. Columnas: ${context.catalogHeaders.join(", ")}.`,
        };
      }
    }
    return {
      ok: true,
      action: {
        action_type: "update_price",
        payload: { sheet_match, column, new_value: String(new_value) },
      },
    };
  }

  if (action_type === "update_agent_config") {
    const { field, new_value } = payload as Partial<UpdateAgentConfigPayload>;
    const allowed: AgentConfigField[] = [
      "agent_active_offer",
      "agent_business_hours",
      "agent_temporary_closures",
      "agent_special_instructions",
    ];
    if (!field || !allowed.includes(field as AgentConfigField)) {
      return { ok: false, reason: `Campo de config no soportado: "${field}".` };
    }
    return {
      ok: true,
      action: {
        action_type: "update_agent_config",
        payload: { field: field as AgentConfigField, new_value: new_value ?? null },
      },
    };
  }

  if (action_type === "update_context") {
    const { field, content } = payload as Partial<UpdateContextPayload>;
    const allowed: ContextField[] = [
      "stories_context_general",
      "stories_context_keywords",
      "ads_context_general",
      "ads_context_keywords",
    ];
    if (!field || !allowed.includes(field as ContextField)) {
      return { ok: false, reason: `Campo de contexto no soportado: "${field}".` };
    }
    if (!content || !content.trim()) {
      return { ok: false, reason: "Falta el contenido del contexto." };
    }
    return {
      ok: true,
      action: {
        action_type: "update_context",
        payload: { field: field as ContextField, content: content.trim() },
      },
    };
  }

  return { ok: false, reason: `action_type desconocido: "${action_type}".` };
}
