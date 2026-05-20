import Anthropic from "@anthropic-ai/sdk";
import { getCatalogText } from "@/lib/catalog/catalog-source";
import { getMeliRequest } from "./client";
import type { MeliAccount, MeliQuestion, Tenant } from "@/types/database.types";

/**
 * Agente MELI: dada una pregunta sobre un item, genera la respuesta sugerida.
 *
 * - Si `tenant.meli_agent_system_prompt` está vacío → return null (opt-in).
 * - Trae el catálogo del tenant via `getCatalogText` (mismo path que usa
 *   Cami/Matías en Instagram — sheets o PDF, depende de cómo esté configurado).
 * - Trae el item específico de MELI vía `GET /items/{item_id}` para tener
 *   título, precio y atributos al alcance del modelo.
 * - Llama a Claude Sonnet 4 con system = prompt del tenant + catálogo + datos
 *   del item, y el texto del comprador como user message.
 * - Devuelve la respuesta truncada a 2000 chars (límite del API de MELI).
 */

const MAX_ANSWER_CHARS = 2000;
const DEFAULT_MODEL = "claude-sonnet-4-20250514";

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
  const sys = tenant.meli_agent_system_prompt?.trim();
  if (!sys) return null;

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

  const systemPrompt =
    `${sys}\n\n` +
    `─────────────────────────────────────────\n` +
    `PUBLICACIÓN A LA QUE PREGUNTA EL CLIENTE\n` +
    `─────────────────────────────────────────\n` +
    `${itemBlock}\n\n` +
    (catalogText
      ? `─────────────────────────────────────────\nCATÁLOGO COMPLETO DEL NEGOCIO\n─────────────────────────────────────────\n${catalogText}\n`
      : "");

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
