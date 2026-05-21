import { getCatalogText } from "@/lib/catalog/catalog-source";
import type { Tenant } from "@/types/database.types";

/**
 * Composición del system prompt final que recibe cada agente.
 *
 * Arquitectura nueva (migración 023):
 *
 *   1. Cada tenant tiene SU PROPIO system prompt completo en DB
 *      (`tenants.{ig|wpp|meli}_agent_system_prompt`), editable desde el panel
 *      "Prompts del agente". Es la fuente única de verdad — NO hay plantilla
 *      base hardcodeada por código.
 *   2. Orden del prompt final:
 *      - BASE: el prompt del tenant tal cual está en DB. Define voz, marca y
 *        reglas; va PRIMERO para que el modelo lo lea antes que cualquier
 *        material de referencia (de lo contrario un catálogo gigante lo
 *        sepulta y el modelo lo trata como nota al pie).
 *      - Catálogo (resuelto vía `getCatalogText`) y, si aplica, el
 *        `commentContext` IG persistente — material de referencia auxiliar.
 *      - Contextos dinámicos por turno (stories / ads / post) que el caller
 *        pasa explícito.
 *      - Regla GLOBAL anti-alucinación, fija y no editable, sufijada al final
 *        para que cierre la conversación.
 *   3. Si el tenant no tiene prompt cargado para el canal pedido, tiramos
 *      error explícito. NO hay fallback genérico — un tenant sin prompt
 *      configurado no puede operar ese canal.
 */

export type AgentTarget = "ig" | "wpp" | "meli";

export interface ComposeContext {
  /**
   * Texto del catálogo. Si NO se pasa (undefined), `composeSystemPrompt`
   * lo resuelve solo desde `tenant.catalog_source` vía `getCatalogText`.
   * Pasá un string vacío `""` para saltear la inyección del catálogo.
   * Pasá un string con contenido para usarlo tal cual (caso MELI que ya
   * lo pre-fetchea con detalle del item).
   */
  catalog?: string;
  /** Bloque ya formateado de contexto de stories cuando el turno es story_reply. */
  storiesContext?: string;
  /** Bloque ya formateado de contexto de ads cuando el turno es ad_click. */
  adsContext?: string;
  /** Bloque ya formateado de contexto de post-comment (one-shot, hardcoded en ManyChat). */
  postContext?: string;
  /**
   * Contexto persistente del comentario IG — el operador lo carga
   * manualmente en ManyChat por publicación. Se inyecta en CADA turno
   * mientras esté presente, a diferencia de postContext que se consume.
   */
  commentContext?: string;
  /** Bloque adicional con datos del ítem MELI puntual (sólo MELI). */
  meliItem?: string;
}

const PROMPT_COLUMN: Record<
  AgentTarget,
  "ig_agent_system_prompt" | "wpp_agent_system_prompt" | "meli_agent_system_prompt"
> = {
  ig: "ig_agent_system_prompt",
  wpp: "wpp_agent_system_prompt",
  meli: "meli_agent_system_prompt",
};

const CHANNEL_LABEL: Record<AgentTarget, string> = {
  ig: "Instagram",
  wpp: "WhatsApp",
  meli: "Mercado Libre",
};

// ─── Public API ──────────────────────────────────────────────────────────────

export async function composeSystemPrompt(
  tenant: Tenant,
  target: AgentTarget,
  ctx: ComposeContext = {}
): Promise<string> {
  const column = PROMPT_COLUMN[target];
  const tenantPrompt = (tenant[column] as string | null | undefined)?.trim();
  if (!tenantPrompt) {
    throw new Error(
      `[compose-prompt] Tenant ${tenant.id} (${tenant.name ?? "?"}) no tiene prompt configurado para canal ${CHANNEL_LABEL[target]}. Cargalo desde el panel /settings > Prompts del agente.`
    );
  }

  // ── Catálogo ───────────────────────────────────────────────────────────────
  // Si el caller NO pasó catalog, lo resolvemos acá (Cami / Mati WPP).
  // Si pasó "" lo skippeamos a propósito.
  // Si pasó string con contenido lo usamos tal cual (MELI, que ya hizo el
  // round-trip a sheets + detalle del item).
  let catalogText: string;
  if (ctx.catalog === undefined) {
    try {
      catalogText = (await getCatalogText(tenant)).trim();
    } catch (e) {
      console.warn(
        `[compose-prompt] catálogo no disponible para tenant ${tenant.id}: ${(e as Error).message}`
      );
      catalogText = "";
    }
  } else {
    catalogText = ctx.catalog.trim();
  }

  const reference = renderReference(catalogText, ctx.commentContext);
  const dynamic = renderDynamicContexts(ctx);

  // Orden: prompt del tenant (BASE — voz, marca, reglas) → material de
  // referencia (catálogo + contexto persistente del comentario) → contextos
  // del turno (stories / ads / post / meli item) → regla anti-alucinación
  // global. El tenant prompt va primero porque un catálogo de miles de
  // líneas sepulta cualquier instrucción que venga atrás; el modelo trata
  // como dominante lo que lee en los primeros tokens. El anti-alucinación
  // queda al final para cerrar.
  return [tenantPrompt, reference, dynamic, ANTI_HALLUCINATION_SUFFIX]
    .filter((b) => b && b.trim().length > 0)
    .join("\n\n");
}

// ─── Render: material de referencia (catálogo + comment context) ────────────

function renderReference(catalog: string, commentContext?: string): string {
  const blocks: string[] = [];

  if (catalog) {
    blocks.push(
      [
        "═══════════════════════════════════════════════════════════════",
        "CATÁLOGO DE PRODUCTOS",
        "═══════════════════════════════════════════════════════════════",
        catalog,
      ].join("\n")
    );
  }

  if (commentContext?.trim()) {
    blocks.push(
      [
        "═══════════════════════════════════════════════════════════════",
        "CONTEXTO DEL COMENTARIO IG (PERSISTENTE)",
        "═══════════════════════════════════════════════════════════════",
        "El cliente vino comentando una publicación específica. El operador",
        "cargó este contexto en ManyChat. Tenelo presente DURANTE TODA la",
        "conversación, no solo en el primer turno:",
        "",
        commentContext.trim(),
        "",
        "Si el cliente da una respuesta corta tipo 'sí', 'cuánto sale?', etc.",
        "asumí que sigue hablando del producto/tema indicado arriba — no le",
        "preguntes de qué quiere info, ya lo sabés.",
      ].join("\n")
    );
  }

  return blocks.join("\n\n");
}

// ─── Render: dynamic per-turn context ────────────────────────────────────────

function renderDynamicContexts(ctx: ComposeContext): string {
  const blocks: string[] = [];
  if (ctx.storiesContext?.trim()) blocks.push(ctx.storiesContext.trim());
  if (ctx.adsContext?.trim()) blocks.push(ctx.adsContext.trim());
  if (ctx.postContext?.trim()) blocks.push(ctx.postContext.trim());
  if (ctx.meliItem?.trim()) blocks.push(ctx.meliItem.trim());
  return blocks.join("\n\n");
}

// ─── Suffix global — anti-alucinación (no editable por el cliente) ───────────

/**
 * Bloque fijo inyectado al FINAL de TODO system prompt — IG, WhatsApp, MELI.
 *
 * Motivo: ya vimos a Matías (GPI) ofrecer "pasarme precios" cuando no tenía
 * precios en su catálogo PDF. El agente inventó una capacidad. Esta regla
 * cierra ese tipo de alucinación de raíz.
 */
const ANTI_HALLUCINATION_SUFFIX = `═══════════════════════════════════════════════════════════════
REGLA CRÍTICA ANTI-ALUCINACIÓN (no negociable)
═══════════════════════════════════════════════════════════════

Si una información NO está en tu catálogo o en este system prompt, NUNCA la inventes ni prometas pasarla.

* Si falta un dato puntual, decí "Déjame consultarlo con el equipo y te paso después" o derivá a humano.
* JAMÁS prometas mandar archivos, precios, fotos o data que no tenés explícitamente.
* Si dudás de tener un dato, NO lo afirmes. Mejor pedí más info al cliente o derivá.`;
