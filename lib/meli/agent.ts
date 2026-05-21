import Anthropic from "@anthropic-ai/sdk";
import { getCatalogText } from "@/lib/catalog/catalog-source";
import { composeSystemPrompt } from "@/lib/agents/compose-prompt";
import { getMeliRequest } from "./client";
import type { MeliAccount, MeliQuestion, Tenant } from "@/types/database.types";

/**
 * Agente MELI (Matías): dada una pregunta sobre una publicación, genera la
 * respuesta sugerida.
 *
 * - Gate: `tenant.meli_enabled` debe ser true. Si false → return null.
 *   (Antes el gate era "tenant.meli_agent_system_prompt no-vacío". El system
 *   prompt ahora se compone con lib/agents/compose-prompt.ts; el flag
 *   booleano es el único toggle.)
 * - Trae el catálogo del tenant via `getCatalogText`.
 * - Trae el item específico vía `GET /items/{id}` para datos puntuales.
 * - Llama a Claude con system prompt compuesto + catálogo + item block.
 * - Devuelve la respuesta truncada a 2000 chars (límite del API MELI).
 */

const MAX_ANSWER_CHARS = 2000;
const DEFAULT_MODEL = "claude-sonnet-4-5";

interface MeliItemDetail {
  id: string;
  title?: string;
  price?: number;
  currency_id?: string;
  available_quantity?: number;
  condition?: string;
  permalink?: string;
  attributes?: Array<{ id?: string; name?: string; value_name?: string }>;
}

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

export async function generateAnswer(
  question: Pick<MeliQuestion, "id" | "meli_question_id" | "text" | "item_id" | "item_title">,
  account: MeliAccount,
  tenant: Tenant
): Promise<string | null> {
  if (!tenant.meli_enabled) return null;

  // Catálogo del tenant (sheets o pdf — abstraído por catalog-source).
  let catalogText = "";
  try {
    catalogText = await getCatalogText(tenant);
  } catch (e) {
    console.warn(`[meli/agent] catálogo no disponible para tenant ${tenant.id}: ${(e as Error).message}`);
  }

  // Detalle del item específico — provee info que el catálogo del tenant
  // tal vez no tenga (atributos, currency, condition).
  let itemBlock = "";
  try {
    const item = await getMeliRequest<MeliItemDetail>(account, `/items/${encodeURIComponent(question.item_id)}`);
    const lines: string[] = [
      `ID: ${item.id}`,
      item.title ? `Título: ${item.title}` : null,
      item.price !== undefined ? `Precio: ${item.price} ${item.currency_id ?? ""}`.trim() : null,
      item.condition ? `Condición: ${item.condition}` : null,
      typeof item.available_quantity === "number" ? `Stock: ${item.available_quantity}` : null,
      item.permalink ? `Link: ${item.permalink}` : null,
    ].filter((s): s is string => Boolean(s));
    if (item.attributes && item.attributes.length > 0) {
      lines.push("Atributos:");
      for (const a of item.attributes.slice(0, 20)) {
        if (a.name && a.value_name) lines.push(`  - ${a.name}: ${a.value_name}`);
      }
    }
    itemBlock = lines.join("\n");
  } catch (e) {
    console.warn(`[meli/agent] item ${question.item_id} no se pudo leer: ${(e as Error).message}`);
    itemBlock = `ID: ${question.item_id}${question.item_title ? `\nTítulo: ${question.item_title}` : ""}`;
  }

  const meliItemBlock =
    `─────────────────────────────────────────\n` +
    `PUBLICACIÓN A LA QUE PREGUNTA EL CLIENTE\n` +
    `─────────────────────────────────────────\n` +
    `${itemBlock}`;

  // Pasamos `catalog` explícito (incluso si es "" cuando falló la carga)
  // para que compose-prompt NO intente re-fetchearlo de vuelta.
  const systemPrompt = await composeSystemPrompt(tenant, "meli", {
    catalog: catalogText,
    meliItem: meliItemBlock,
  });

  const model = process.env.MELI_AGENT_MODEL?.trim() || DEFAULT_MODEL;

  let response: Anthropic.Message;
  try {
    response = await anthropic.messages.create({
      model,
      max_tokens: 1024,
      system: systemPrompt,
      messages: [{ role: "user", content: question.text }],
    });
  } catch (e) {
    console.error(`[meli/agent] Anthropic error (question ${question.id}):`, (e as Error).message);
    return null;
  }

  const text = response.content
    .filter((b): b is Anthropic.TextBlock => b.type === "text")
    .map((b) => b.text)
    .join("\n")
    .trim();

  if (!text) return null;
  return text.length > MAX_ANSWER_CHARS ? text.slice(0, MAX_ANSWER_CHARS) : text;
}
