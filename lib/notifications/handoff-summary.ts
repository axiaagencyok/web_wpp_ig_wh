// Resumen LLM-generated para el mail de handoff. Toma los últimos N
// mensajes de una conversación, le pide a Claude que extraiga en 2-3
// frases: qué quiere el cliente, qué info dio, qué falta para cerrar.

import Anthropic from "@anthropic-ai/sdk";
import { adminClient } from "@/lib/supabase/admin";

const MODEL = "claude-sonnet-4-5";
const FALLBACK_MODEL = "claude-haiku-4-5-20251001";
const N_MESSAGES = 10;

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const SYSTEM = `Sos un asistente que resume conversaciones de venta para un mail al operador.

Recibís los últimos mensajes de un chat (cliente y agente IA). Tu output es ÚNICAMENTE un párrafo de 2-3 frases (no más) en español, con esta estructura:

1. Qué quiere el cliente (producto, intención, contexto).
2. Qué información clave ya dio (zona, tipo de proyecto, urgencia, datos personales).
3. Qué falta para cerrar / próximo paso esperado.

Tono: directo, profesional, sin saludos. Sin bullets, sin headers. Solo el párrafo.`;

interface SummaryInput {
  conversationId: string;
}

interface SummaryResult {
  summary: string;
  /** Snippet con el último mensaje del cliente — útil para el subject del mail. */
  lastClientMessage: string;
}

export async function generateHandoffSummary(input: SummaryInput): Promise<SummaryResult> {
  const { data: msgs } = await adminClient
    .from("messages")
    .select("direction, sender, body, created_at")
    .eq("conversation_id", input.conversationId)
    .order("created_at", { ascending: false })
    .limit(N_MESSAGES);

  if (!msgs || msgs.length === 0) {
    return {
      summary: "Conversación derivada sin mensajes previos.",
      lastClientMessage: "",
    };
  }

  const chronological = [...msgs].reverse();

  // Formatea como transcripción simple Cliente: ... / Agente: ...
  const transcript = chronological
    .map((m) => {
      const speaker =
        m.direction === "inbound"
          ? "Cliente"
          : m.sender === "human"
            ? "Operador"
            : "Agente";
      return `${speaker}: ${(m.body ?? "").trim() || "(sin texto)"}`;
    })
    .join("\n");

  const lastClient = chronological
    .slice()
    .reverse()
    .find((m) => m.direction === "inbound");

  for (const model of [MODEL, FALLBACK_MODEL]) {
    try {
      const res = await anthropic.messages.create({
        model,
        max_tokens: 300,
        system: SYSTEM,
        messages: [{ role: "user", content: transcript }],
      });
      const block = res.content.find((b) => b.type === "text");
      if (block && block.type === "text") {
        return {
          summary: block.text.trim(),
          lastClientMessage: lastClient?.body?.trim() ?? "",
        };
      }
    } catch (err) {
      const status = (err as { status?: number }).status;
      if (status === 529 || status === 503) {
        // Fallback Haiku.
        continue;
      }
      console.error("[handoff-summary] Claude error:", err);
      // Best-effort fallback: devolvemos la transcripción literal.
      return {
        summary: `(Resumen automático no disponible). Últimos mensajes:\n${transcript.slice(0, 800)}`,
        lastClientMessage: lastClient?.body?.trim() ?? "",
      };
    }
  }

  return {
    summary: `(Resumen no disponible). Últimos mensajes:\n${transcript.slice(0, 800)}`,
    lastClientMessage: lastClient?.body?.trim() ?? "",
  };
}
