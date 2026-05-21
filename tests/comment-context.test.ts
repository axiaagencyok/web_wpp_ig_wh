// ISSUE 2 — contexto_comentario IG inyectado al system prompt.
//
// El operador carga manualmente "contexto_comentario" en ManyChat por
// publicación. Persiste en conversations.custom_fields y se inyecta en
// CADA turno de Cami (no se consume como story_reply / ad_click).

import { describe, it, expect, vi } from "vitest";
import { composeSystemPrompt } from "@/lib/agents/compose-prompt";
import type { Tenant } from "@/types/database.types";

// El test corre composeSystemPrompt sin Supabase: forzamos catalog="" para
// que el helper no intente resolver el catálogo de un tenant fake.

const TENANT: Tenant = {
  id: "t-1",
  name: "GPI Todo en Pisos",
  whatsapp_number: "+0",
  agent_system_prompt: "",
  agent_enabled: true,
  buffer_seconds: 5,
  google_sheet_id: null,
  google_sheet_range: "",
  catalog_source: "sheets",
  catalog_pdf_path: null,
  catalog_text_cache: null,
  catalog_text_cached_at: null,
  admin_phone: null,
  admin_system_prompt: null,
  agent_name: "Matías",
  ig_agent_system_prompt: "PROMPT DE PRUEBA DEL TENANT GPI — sos Matías de GPI.",
  wpp_agent_system_prompt: null,
  meli_agent_system_prompt: null,
  stories_context_general: null,
  stories_context_keywords: null,
  ads_context_general: null,
  ads_context_keywords: null,
  lead_notification_email: null,
  lead_scoring_prompt: null,
  lead_reset_after_days: 3,
  handoff_notification_email: null,
  handoff_notifications_enabled: true,
  meli_auto_answer: false,
  meli_enabled: false,
  instagram_enabled: true,
  whatsapp_enabled: false,
  manychat_api_key: null,
  twilio_account_sid: null,
  twilio_auth_token_encrypted: null,
  created_at: new Date().toISOString(),
};

describe("composeSystemPrompt con commentContext", () => {
  it("inyecta el bloque CONTEXTO DEL COMENTARIO IG cuando hay contexto", async () => {
    const prompt = await composeSystemPrompt(TENANT, "ig", {
      catalog: "",
      commentContext: "Comentó en post de SPC click, ya le ofrecimos info",
    });

    expect(prompt).toContain("CONTEXTO DEL COMENTARIO IG (PERSISTENTE)");
    expect(prompt).toContain("Comentó en post de SPC click, ya le ofrecimos info");
    expect(prompt).toContain("Tenelo presente DURANTE TODA la");
  });

  it("NO inyecta el bloque si commentContext está vacío", async () => {
    const prompt = await composeSystemPrompt(TENANT, "ig", { catalog: "" });
    expect(prompt).not.toContain("CONTEXTO DEL COMENTARIO IG");
  });

  it("NO inyecta el bloque si commentContext es solo whitespace", async () => {
    const prompt = await composeSystemPrompt(TENANT, "ig", { catalog: "", commentContext: "   " });
    expect(prompt).not.toContain("CONTEXTO DEL COMENTARIO IG");
  });

  it("commentContext convive con storiesContext (story tiene prioridad pero ambos se inyectan)", async () => {
    const prompt = await composeSystemPrompt(TENANT, "ig", {
      catalog: "",
      storiesContext: "CONTEXTO DE STORIES: vasos",
      commentContext: "Comentó en post de jarros",
    });
    expect(prompt).toContain("CONTEXTO DE STORIES");
    expect(prompt).toContain("CONTEXTO DEL COMENTARIO IG");
  });

  it("instrucción 'no le preguntes de qué quiere info' está presente para evitar el bug de Burger/GPI", async () => {
    const prompt = await composeSystemPrompt(TENANT, "ig", {
      catalog: "",
      commentContext: "Comentó en post de hamburguesas. ManyChat ya ofreció info.",
    });
    expect(prompt).toContain("preguntes de qué quiere info");
  });

  it("throws si el tenant no tiene prompt configurado para el canal pedido", async () => {
    await expect(
      composeSystemPrompt(TENANT, "wpp", { catalog: "" })
    ).rejects.toThrow(/no tiene prompt configurado para canal WhatsApp/);
  });

  it("siempre sufija la regla anti-alucinación al final", async () => {
    const prompt = await composeSystemPrompt(TENANT, "ig", { catalog: "" });
    expect(prompt).toContain("REGLA CRÍTICA ANTI-ALUCINACIÓN");
    expect(prompt.endsWith("Mejor pedí más info al cliente o derivá.")).toBe(true);
  });

  it("el prompt del tenant es la BASE — aparece antes del catálogo y del comment context", async () => {
    const prompt = await composeSystemPrompt(TENANT, "ig", {
      catalog: "CATALOGO_FAKE_INLINE",
      commentContext: "Comentó en post de SPC click",
    });
    const tenantIdx = prompt.indexOf("PROMPT DE PRUEBA DEL TENANT GPI");
    const catalogIdx = prompt.indexOf("CATÁLOGO DE PRODUCTOS");
    const commentIdx = prompt.indexOf("CONTEXTO DEL COMENTARIO IG");
    expect(tenantIdx).toBeGreaterThanOrEqual(0);
    expect(tenantIdx).toBeLessThan(catalogIdx);
    expect(tenantIdx).toBeLessThan(commentIdx);
  });

  it("throws con mensaje explícito si tenant.ig_agent_system_prompt es null", async () => {
    await expect(
      composeSystemPrompt({ ...TENANT, ig_agent_system_prompt: null }, "ig", { catalog: "" })
    ).rejects.toThrow(/no tiene prompt configurado para canal Instagram/);
  });

  it("throws si tenant.ig_agent_system_prompt está vacío o whitespace", async () => {
    await expect(
      composeSystemPrompt({ ...TENANT, ig_agent_system_prompt: "   " }, "ig", { catalog: "" })
    ).rejects.toThrow(/no tiene prompt configurado para canal Instagram/);
  });

  // ── story_context: 3 casos del flow persistente from_story + tenant ────────
  //
  // El boolean `story_context` (ManyChat) → `from_story` (conversations).
  // Cuando está activo, cami-agent resuelve el TEXTO desde
  // tenant.stories_context_general/_keywords y se lo pasa a compose-prompt
  // como `storyContext`. Cuando no hay flag o el tenant no tiene cargado
  // nada, compose-prompt recibe `undefined` y NO inyecta el bloque.

  it("[story con contexto cargado] inyecta CONTEXTO DE LA STORY IG (PERSISTENTE) con el texto del tenant", async () => {
    const prompt = await composeSystemPrompt(TENANT, "ig", {
      catalog: "",
      storyContext: "Hoy publicamos vasos de vidrio\nPalabras clave: VASOS: vasos de vidrio",
    });

    expect(prompt).toContain("CONTEXTO DE LA STORY IG (PERSISTENTE)");
    expect(prompt).toContain("Hoy publicamos vasos de vidrio");
    expect(prompt).toContain("VASOS: vasos de vidrio");
    expect(prompt).toContain("respondiendo a una story específica");
  });

  it("[story sin contexto cargado] NO inyecta el bloque cuando el tenant no tiene stories_context_*", async () => {
    // Simula el caso en que cami-agent vio from_story=true pero ni
    // stories_context_general ni stories_context_keywords están cargados:
    // el helper devuelve undefined y compose-prompt no inyecta nada.
    const prompt = await composeSystemPrompt(TENANT, "ig", {
      catalog: "",
      storyContext: undefined,
    });
    expect(prompt).not.toContain("CONTEXTO DE LA STORY IG");
  });

  it("[no es story] NO inyecta el bloque cuando from_story está apagado", async () => {
    // Conversación normal — cami-agent no llama con storyContext.
    const prompt = await composeSystemPrompt(TENANT, "ig", { catalog: "" });
    expect(prompt).not.toContain("CONTEXTO DE LA STORY IG");
  });

  it("storyContext queda en la sección de referencia, después del catálogo y junto al commentContext", async () => {
    const prompt = await composeSystemPrompt(TENANT, "ig", {
      catalog: "CATALOGO_FAKE_INLINE",
      commentContext: "Comentó en post de SPC click",
      storyContext: "Hoy publicamos vasos de vidrio",
    });
    const catalogIdx = prompt.indexOf("CATÁLOGO DE PRODUCTOS");
    const commentIdx = prompt.indexOf("CONTEXTO DEL COMENTARIO IG");
    const storyIdx = prompt.indexOf("CONTEXTO DE LA STORY IG");
    expect(catalogIdx).toBeGreaterThanOrEqual(0);
    expect(commentIdx).toBeGreaterThan(catalogIdx);
    expect(storyIdx).toBeGreaterThan(catalogIdx);
  });
});

// Silenciar warnings del cami logger durante el test
vi.spyOn(console, "warn").mockImplementation(() => {});
