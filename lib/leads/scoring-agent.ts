import Anthropic from "@anthropic-ai/sdk";
import { adminClient } from "@/lib/supabase/admin";
import type { Tenant } from "@/types/database.types";

/**
 * Agente de scoring: corre después de cada turno de Matías (o cualquier otro
 * agente de IG), extrae datos del cliente y le pone un puntaje al lead.
 *
 * Reglas:
 * - Si `tenant.lead_scoring_prompt` es NULL o vacío → return null (scoring
 *   deshabilitado para ese tenant — los clientes sin scoring no hacen el
 *   roundtrip a Claude).
 * - Si la conversación está vacía → return null.
 * - El parser tolera ```json fences y texto suelto antes/después del bloque.
 * - El modelo se setea por env `LEAD_SCORING_MODEL` o cae a un default.
 */

const DEFAULT_MODEL = "claude-sonnet-4-5";

export interface ScoringResult {
  nombre: string | null;
  zona: string | null;
  tipo_proyecto: "Obra nueva" | "Refacción" | "Comercial" | "Otro" | null;
  m2_estimados: number | null;
  producto_interes: string | null;
  urgencia: "Inmediata" | "1-3 meses" | "+3 meses" | null;
  lead_score: number;
  resumen_conversacion: string | null;
}

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

export async function scoreConversation(
  tenant: Pick<Tenant, "id" | "lead_scoring_prompt">,
  conversationId: string
): Promise<ScoringResult | null> {
  const systemPrompt = tenant.lead_scoring_prompt?.trim();
  if (!systemPrompt) {
    return null; // scoring desactivado para este tenant
  }

  const { data: messages, error } = await adminClient
    .from("messages")
    .select("sender, body, created_at")
    .eq("conversation_id", conversationId)
    .order("created_at", { ascending: true });

  if (error) {
    console.error(`[scoring] Error leyendo mensajes de conv ${conversationId}:`, error.message);
    return null;
  }
  if (!messages || messages.length === 0) return null;

  const transcript = messages
    .map((m) => {
      const role = m.sender === "ai" ? "Asistente" : "Cliente";
      const body = (m.body ?? "").trim();
      return body ? `${role}: ${body}` : null;
    })
    .filter(Boolean)
    .join("\n");

  if (!transcript) return null;

  const model = process.env.LEAD_SCORING_MODEL?.trim() || DEFAULT_MODEL;

  let response: Anthropic.Message;
  try {
    response = await anthropic.messages.create({
      model,
      max_tokens: 1024,
      system: systemPrompt,
      messages: [{ role: "user", content: transcript }],
    });
  } catch (e) {
    console.error(`[scoring] Anthropic API error (conv ${conversationId}):`, (e as Error).message);
    return null;
  }

  const rawText = response.content
    .filter((b): b is Anthropic.TextBlock => b.type === "text")
    .map((b) => b.text)
    .join("\n")
    .trim();

  const parsed = extractJson(rawText);
  if (!parsed) {
    console.error(`[scoring] No se pudo parsear JSON del modelo para conv ${conversationId}. Raw: ${rawText.slice(0, 300)}`);
    return null;
  }
  return parsed;
}

/**
 * Extrae el primer objeto JSON razonable del texto de respuesta del modelo.
 * Tolera bloques ```json … ```, texto suelto antes/después, y normaliza los
 * campos al shape de ScoringResult (con guards de tipo).
 */
function extractJson(text: string): ScoringResult | null {
  let candidate = text;

  // Sacar code fences si vienen
  const fenceMatch = candidate.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fenceMatch?.[1]) candidate = fenceMatch[1].trim();

  // Recortar al primer { … } balanceado (heurística simple)
  const firstBrace = candidate.indexOf("{");
  const lastBrace = candidate.lastIndexOf("}");
  if (firstBrace >= 0 && lastBrace > firstBrace) {
    candidate = candidate.slice(firstBrace, lastBrace + 1);
  }

  let obj: unknown;
  try {
    obj = JSON.parse(candidate);
  } catch {
    return null;
  }
  if (!obj || typeof obj !== "object") return null;
  const o = obj as Record<string, unknown>;

  const scoreRaw = o.lead_score;
  const score =
    typeof scoreRaw === "number"
      ? scoreRaw
      : typeof scoreRaw === "string" && /^-?\d+$/.test(scoreRaw.trim())
        ? parseInt(scoreRaw, 10)
        : null;
  if (score === null) return null;

  const tipoRaw = typeof o.tipo_proyecto === "string" ? o.tipo_proyecto : null;
  const tipo: ScoringResult["tipo_proyecto"] =
    tipoRaw === "Obra nueva" || tipoRaw === "Refacción" || tipoRaw === "Comercial" || tipoRaw === "Otro"
      ? tipoRaw
      : null;

  const urgenciaRaw = typeof o.urgencia === "string" ? o.urgencia : null;
  const urgencia: ScoringResult["urgencia"] =
    urgenciaRaw === "Inmediata" || urgenciaRaw === "1-3 meses" || urgenciaRaw === "+3 meses"
      ? urgenciaRaw
      : null;

  const m2Raw = o.m2_estimados;
  const m2 =
    typeof m2Raw === "number"
      ? Math.round(m2Raw)
      : typeof m2Raw === "string" && /^-?\d+$/.test(m2Raw.trim())
        ? parseInt(m2Raw, 10)
        : null;

  return {
    nombre: typeof o.nombre === "string" ? o.nombre : null,
    zona: typeof o.zona === "string" ? o.zona : null,
    tipo_proyecto: tipo,
    m2_estimados: m2,
    producto_interes: typeof o.producto_interes === "string" ? o.producto_interes : null,
    urgencia,
    lead_score: Math.max(0, Math.min(100, score)),
    resumen_conversacion: typeof o.resumen_conversacion === "string" ? o.resumen_conversacion : null,
  };
}
