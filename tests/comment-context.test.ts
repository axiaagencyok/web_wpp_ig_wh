// ISSUE 2 — contexto_comentario IG inyectado al system prompt.
//
// El operador carga manualmente "contexto_comentario" en ManyChat por
// publicación. Persiste en conversations.custom_fields y se inyecta en
// CADA turno de Cami (no se consume como story_reply / ad_click).

import { describe, it, expect } from "vitest";
import { composeSystemPrompt } from "@/lib/agents/compose-prompt";
import type { Tenant } from "@/types/database.types";

const TENANT: Tenant = {
  id: "t-1",
  name: "GPI Todo en Pisos",
  whatsapp_number: "+0",
  agent_system_prompt: "",
  agent_enabled: true,
  buffer_seconds: 5,
  agent_tone: null,
  agent_orthography: [],
  agent_active_offer: null,
  agent_business_hours: null,
  agent_business_hours_alert: false,
  agent_temporary_closures: null,
  agent_special_instructions: null,
  google_sheet_id: null,
  google_sheet_range: "",
  catalog_source: "sheets",
  catalog_pdf_path: null,
  catalog_text_cache: null,
  catalog_text_cached_at: null,
  admin_phone: null,
  admin_system_prompt: null,
  ig_agent_system_prompt: null,
  stories_context_general: null,
  stories_context_keywords: null,
  ads_context_general: null,
  ads_context_keywords: null,
  lead_notification_email: null,
  lead_scoring_prompt: null,
  lead_reset_after_days: 3,
  meli_agent_system_prompt: null,
  meli_auto_answer: false,
  meli_enabled: false,
  instagram_enabled: true,
  whatsapp_enabled: false,
  twilio_account_sid: null,
  twilio_auth_token_encrypted: null,
  created_at: new Date().toISOString(),
};

describe("composeSystemPrompt con commentContext", () => {
  it("inyecta el bloque CONTEXTO DEL COMENTARIO IG cuando hay contexto", () => {
    const prompt = composeSystemPrompt(TENANT, "cami_ig", {
      commentContext: "Comentó en post de SPC click, ya le ofrecimos info",
    });

    expect(prompt).toContain("CONTEXTO DEL COMENTARIO IG (PERSISTENTE)");
    expect(prompt).toContain("Comentó en post de SPC click, ya le ofrecimos info");
    expect(prompt).toContain("Tenelo presente DURANTE TODA la");
  });

  it("NO inyecta el bloque si commentContext está vacío", () => {
    const prompt = composeSystemPrompt(TENANT, "cami_ig", {});
    expect(prompt).not.toContain("CONTEXTO DEL COMENTARIO IG");
  });

  it("NO inyecta el bloque si commentContext es solo whitespace", () => {
    const prompt = composeSystemPrompt(TENANT, "cami_ig", { commentContext: "   " });
    expect(prompt).not.toContain("CONTEXTO DEL COMENTARIO IG");
  });

  it("commentContext convive con storiesContext (story tiene prioridad pero ambos se inyectan)", () => {
    const prompt = composeSystemPrompt(TENANT, "cami_ig", {
      storiesContext: "CONTEXTO DE STORIES: vasos",
      commentContext: "Comentó en post de jarros",
    });
    expect(prompt).toContain("CONTEXTO DE STORIES");
    expect(prompt).toContain("CONTEXTO DEL COMENTARIO IG");
  });

  it("instrucción 'no le preguntes de qué quiere info' está presente para evitar el bug de Burger/GPI", () => {
    // Repro del bug reportado: "Comenté en post de Burger. ManyChat mandó
    // 'querés más info?'. Cliente respondió 'si'. Cami respondió 'hola
    // como estas' (perdió contexto)." — el system prompt ahora le dice
    // explícitamente a Cami que NO pregunte de qué quiere info si ya hay
    // contexto del comentario.
    const prompt = composeSystemPrompt(TENANT, "cami_ig", {
      commentContext: "Comentó en post de hamburguesas. ManyChat ya ofreció info.",
    });
    // El texto se renderiza con line breaks (— no le\npreguntes…), así que
    // testeamos por substring que cae dentro de una sola línea.
    expect(prompt).toContain("preguntes de qué quiere info");
  });
});
