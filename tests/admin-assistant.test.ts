// Tests del flujo PR D — admin assistant via WhatsApp.
//
// Solo cubrimos lo determinista (sin Claude/Twilio): detectConfirmation,
// toE164, executeAdminAction. El parser de intent llama a Claude — queda
// fuera de scope unitario.

import { describe, it, expect, vi, beforeEach } from "vitest";
import { detectConfirmation, toE164 } from "@/lib/admin/handle-admin-message";

// Mock self-contained de supabase: registramos las llamadas a `update`
// para asserts. No usamos el helper externo porque vi.mock se hoistea y
// no puede importar otros módulos antes de los mocks.
const calls: Array<{ table: string; payload?: unknown }> = [];

vi.mock("@/lib/supabase/admin", () => {
  const makeChain = (table: string) => {
    let payload: unknown = undefined;
    const chain = {
      select: vi.fn(() => chain),
      update: vi.fn((p: unknown) => {
        payload = p;
        return chain;
      }),
      eq: vi.fn(() => ({
        then: (resolve: (v: { data: unknown; error: null }) => unknown) => {
          if (payload !== undefined) calls.push({ table, payload });
          return Promise.resolve(resolve({ data: { id: "tenant-1" }, error: null }));
        },
      })),
    };
    return chain;
  };
  return {
    adminClient: {
      from: vi.fn((table: string) => makeChain(table)),
    },
  };
});

vi.mock("@/lib/google/sheets", () => ({
  updateCell: vi.fn(async () => ({
    found: true,
    previousValue: "$30000",
    newValue: "$42000",
    rowIndex: 5,
  })),
}));

describe("detectConfirmation", () => {
  it("detecta SI en variantes argentinas", () => {
    expect(detectConfirmation("si")).toBe("yes");
    expect(detectConfirmation("sí")).toBe("yes");
    expect(detectConfirmation("Si")).toBe("yes");
    expect(detectConfirmation("dale!")).toBe("yes");
    expect(detectConfirmation("ok")).toBe("yes");
    expect(detectConfirmation("confirmo")).toBe("yes");
    expect(detectConfirmation("listo")).toBe("yes");
  });

  it("detecta NO en variantes argentinas", () => {
    expect(detectConfirmation("no")).toBe("no");
    expect(detectConfirmation("No.")).toBe("no");
    expect(detectConfirmation("cancelá")).toBe("no");
    expect(detectConfirmation("abortar")).toBe("no");
  });

  it("devuelve null si el mensaje supera 3 palabras (instrucción nueva)", () => {
    expect(detectConfirmation("si quiero cambiar el precio")).toBeNull();
    expect(detectConfirmation("no me gustó esa oferta")).toBeNull();
    expect(detectConfirmation("dale gracias por la ayuda hoy")).toBeNull();
  });

  it("devuelve null para texto sin keyword de confirmación", () => {
    expect(detectConfirmation("hola")).toBeNull();
    expect(detectConfirmation("subí el precio")).toBeNull();
    expect(detectConfirmation("")).toBeNull();
  });
});

describe("toE164", () => {
  it("strip el prefijo whatsapp:", () => {
    expect(toE164("whatsapp:+5491133334444")).toBe("+5491133334444");
  });

  it("deja intacto si no tiene prefijo", () => {
    expect(toE164("+5491133334444")).toBe("+5491133334444");
  });
});

describe("executeAdminAction", () => {
  beforeEach(() => {
    calls.length = 0;
  });

  it("update_agent_config persiste el field correcto", async () => {
    const { executeAdminAction } = await import("@/lib/admin/execute-action");
    const tenant = {
      id: "tenant-1",
      name: "WHD",
      google_sheet_id: "abc",
      google_sheet_range: "Sheet1",
    } as never;

    const result = await executeAdminAction(
      {
        action_type: "update_agent_config",
        payload: { field: "agent_active_offer", new_value: "20% OFF en SPC" },
      },
      tenant,
    );

    expect(result.ok).toBe(true);
    const updateCall = calls.find((c) => c.table === "tenants");
    expect(updateCall).toBeDefined();
    expect((updateCall!.payload as Record<string, unknown>).agent_active_offer).toBe("20% OFF en SPC");
  });

  it("update_agent_config con new_value=null limpia el field", async () => {
    const { executeAdminAction } = await import("@/lib/admin/execute-action");
    const tenant = { id: "tenant-1", name: "WHD" } as never;

    const result = await executeAdminAction(
      {
        action_type: "update_agent_config",
        payload: { field: "agent_active_offer", new_value: null },
      },
      tenant,
    );

    expect(result.ok).toBe(true);
    expect(result.message).toContain("dejé vacío");
  });

  it("update_context persiste el field correcto", async () => {
    const { executeAdminAction } = await import("@/lib/admin/execute-action");
    const tenant = { id: "tenant-1", name: "WHD" } as never;

    const result = await executeAdminAction(
      {
        action_type: "update_context",
        payload: { field: "stories_context_general", content: "Hoy publicamos vasos" },
      },
      tenant,
    );

    expect(result.ok).toBe(true);
    const updateCall = calls.find((c) => c.table === "tenants");
    expect(updateCall).toBeDefined();
    expect((updateCall!.payload as Record<string, unknown>).stories_context_general).toBe("Hoy publicamos vasos");
  });

  it("update_price falla si el tenant no tiene Google Sheet configurado", async () => {
    const { executeAdminAction } = await import("@/lib/admin/execute-action");
    const tenant = {
      id: "tenant-1",
      name: "WHD",
      google_sheet_id: null,
      google_sheet_range: "Sheet1",
    } as never;

    const result = await executeAdminAction(
      {
        action_type: "update_price",
        payload: { sheet_match: "SPC Click 4mm", column: "Precio Efectivo", new_value: "42000" },
      },
      tenant,
    );

    expect(result.ok).toBe(false);
    expect(result.message).toContain("Google Sheet");
  });
});
