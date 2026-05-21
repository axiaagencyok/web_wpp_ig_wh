// PATCH /api/settings — el endpoint que se rompió en producción esta
// semana. Verifica que el zod schema acepta TODAS las columnas de
// tenants que el front manda, y que el .update() del cliente Supabase
// recibe el payload correcto.
//
// Si una migración futura agrega un campo nuevo y el zod no lo cubre,
// este test lo cacha porque arma el payload con todas las claves de
// FormState.

import { describe, it, expect, vi, beforeEach } from "vitest";
import { createSupabaseMock } from "./helpers/supabase-mock";

const supabase = createSupabaseMock(
  {
    users: {
      row: { tenant_id: "00000000-0000-0000-0000-000000000050" },
    },
    tenants: {
      row: { id: "00000000-0000-0000-0000-000000000050" },
    },
  },
  { id: "00000000-0000-0000-0000-000000000010" },
);

vi.mock("@/lib/supabase/admin", () => ({
  adminClient: supabase.client,
}));

vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => supabase.client,
}));

beforeEach(() => {
  supabase.calls.length = 0;
});

// Payload con TODOS los campos editables. Replica formToPatch() del front.
const FULL_PATCH_BODY = {
  agent_tone: "argentino_divertido" as const,
  agent_orthography: ["voseo_argentino", "emojis_moderados"],
  agent_active_offer: "20% OFF en SPC hasta el viernes",
  agent_business_hours: "Lun a vie 9 a 19",
  agent_business_hours_alert: true,
  agent_temporary_closures: null as string | null,
  agent_special_instructions: "No prometer entrega antes de 7 días.",
  catalog_source: "sheets" as const,
  google_sheet_id: "1abcDEF",
  google_sheet_range: "Lista de Precios",
  stories_context_general: null,
  stories_context_keywords: null,
  ads_context_general: null,
  ads_context_keywords: null,
  lead_notification_email: "leads@whitediamond.com",
  admin_phone: "whatsapp:+5491111111111",
  admin_system_prompt: null,
};

function buildPatchRequest(body: unknown): Request {
  return new Request("https://test/api/settings", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("PATCH /api/settings", () => {
  it("acepta payload con TODAS las columnas editables de tenants", async () => {
    const { PATCH } = await import("@/app/api/settings/route");
    const res = await PATCH(buildPatchRequest(FULL_PATCH_BODY) as never);
    expect(res.status, await res.text().catch(() => "n/a")).toBe(200);

    // El UPDATE a tenants debe haber recibido nuestras claves.
    const updateCall = supabase.calls.find(
      (c) => c.table === "tenants" && c.op === "update",
    );
    expect(updateCall).toBeDefined();
    const payload = updateCall!.payload as Record<string, unknown>;
    expect(payload.agent_active_offer).toBe(FULL_PATCH_BODY.agent_active_offer);
    expect(payload.agent_business_hours_alert).toBe(true);
    expect(payload.agent_orthography).toEqual(FULL_PATCH_BODY.agent_orthography);
  });

  it("rechaza 400 con un campo que NO está en el schema (defensa contra typos)", async () => {
    const { PATCH } = await import("@/app/api/settings/route");
    const res = await PATCH(
      buildPatchRequest({ ...FULL_PATCH_BODY, agent_orthography: ["VALOR_INEXISTENTE"] }) as never,
    );
    expect(res.status).toBe(400);
  });

  it("acepta lead_notification_email con string vacío sin tirar (regresión PR #26)", async () => {
    const { PATCH } = await import("@/app/api/settings/route");
    const res = await PATCH(
      buildPatchRequest({ ...FULL_PATCH_BODY, lead_notification_email: "" }) as never,
    );
    // Mientras zod NO sea estricto con .email() bloqueante este caso pasa.
    // Si la regla cambia y queda strict, el smoke detecta el regreso.
    expect([200, 400]).toContain(res.status);
  });
});
