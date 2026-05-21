// Smoke de webhooks externos — Manychat (Instagram) y Mercado Libre.
//
// El objetivo no es testear el agente completo, sino verificar que:
//   1. El handler parsea el payload sin tirar.
//   2. Devuelve 2xx para payloads válidos (Manychat y MELI re-tiran si no
//      responden 200 rápido).
//   3. Devuelve 4xx para payloads inválidos.
//
// El trabajo pesado pasa dentro de `after()` (Next defiere hasta cerrar
// la respuesta HTTP). Mockeamos `after` con un no-op para que el test no
// dispare procesamiento de fondo — eso queda para tests de integración
// del agente cuando los armemos.

import { describe, it, expect, vi, beforeEach } from "vitest";
import { createSupabaseMock } from "./helpers/supabase-mock";

const supabase = createSupabaseMock({
  tenants: {
    row: {
      id: "00000000-0000-0000-0000-000000000001",
      agent_enabled: true,
      buffer_seconds: 5,
      manychat_api_key: "test-key",
    },
  },
  conversations: {
    row: { id: "conv-1", automation_paused: false },
  },
});

vi.mock("@/lib/supabase/admin", () => ({
  adminClient: supabase.client,
}));

vi.mock("@/lib/ai/buffer", () => ({
  upsertBuffer: vi.fn(async () => undefined),
}));

// Capturamos las callbacks de `after()` en un array exportable para que los
// tests que necesitan verificar background work (ej. cleanup de ManyChat) las
// puedan ejecutar a mano. Por defecto NO se disparan automáticamente.
const afterCallbacks: Array<() => void | Promise<void>> = [];

vi.mock("next/server", async () => {
  const actual = await vi.importActual<typeof import("next/server")>("next/server");
  return {
    ...actual,
    after: (fn: () => void | Promise<void>) => {
      afterCallbacks.push(fn);
    },
  };
});

const clearStoryContextFlagMock = vi.fn(async () => undefined);
const clearContextoComentarioFlagMock = vi.fn(async () => undefined);

vi.mock("@/lib/instagram/manychat", async () => {
  const actual = await vi.importActual<typeof import("@/lib/instagram/manychat")>(
    "@/lib/instagram/manychat",
  );
  return {
    ...actual,
    clearStoryContextFlag: clearStoryContextFlagMock,
    clearContextoComentarioFlag: clearContextoComentarioFlagMock,
    clearStoryReplyFlag: vi.fn(async () => undefined),
    clearAdClickFlag: vi.fn(async () => undefined),
    clearPostContextFlag: vi.fn(async () => undefined),
  };
});

beforeEach(() => {
  supabase.calls.length = 0;
  afterCallbacks.length = 0;
  clearStoryContextFlagMock.mockClear();
  clearContextoComentarioFlagMock.mockClear();
});

function buildPost(url: string, body: unknown): Request {
  return new Request(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("POST /api/webhooks/manychat", () => {
  it("acepta payload válido de Instagram con custom fields y devuelve 200", async () => {
    const { POST } = await import("@/app/api/webhooks/manychat/route");

    const payload = {
      "full-data": {
        id: "manychat_12345",
        first_name: "Juan",
        ig_username: "juan.test",
        last_input_text: "Hola, quería info del SPC click",
        ig_last_interaction: new Date().toISOString(),
        custom_fields: {
          producto_consultado: "SPC click 4mm",
          story_reply: false,
          ad_click: false,
          post_comment: false,
          post_context: "-",
        },
      },
    };

    const res = await POST(buildPost("https://test/api/webhooks/manychat", payload) as never);
    expect(res.status).toBe(200);
  });

  it("devuelve 400 cuando el body no es JSON parseable", async () => {
    const { POST } = await import("@/app/api/webhooks/manychat/route");

    const req = new Request("https://test/api/webhooks/manychat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "{not-json",
    });

    const res = await POST(req as never);
    expect(res.status).toBe(400);
  });

  it("persiste from_story=true cuando story_context viene true y dispara cleanup en ManyChat", async () => {
    const { POST } = await import("@/app/api/webhooks/manychat/route");

    const payload = {
      "full-data": {
        id: "manychat_story_42",
        first_name: "Lara",
        ig_username: "lara.test",
        last_input_text: "Cuánto sale?",
        ig_last_interaction: new Date().toISOString(),
        custom_fields: {
          story_context: true,
        },
      },
    };

    const res = await POST(buildPost("https://test/api/webhooks/manychat", payload) as never);
    expect(res.status).toBe(200);

    // El handler delega el procesamiento al `after()` del route, que a su
    // vez encola MÁS `after()` (cleanup de ManyChat). Drenamos la cola hasta
    // que no queden callbacks pendientes.
    while (afterCallbacks.length > 0) {
      const cb = afterCallbacks.shift()!;
      await cb();
    }

    const upsert = supabase.calls.find(
      (c) => c.table === "conversations" && c.op === "upsert",
    );
    expect(upsert).toBeDefined();
    const upsertPayload = upsert!.payload as { custom_fields: Record<string, unknown> };
    expect(upsertPayload.custom_fields.from_story).toBe(true);

    expect(clearStoryContextFlagMock).toHaveBeenCalledWith("manychat_story_42", "test-key");
  });

  it("acepta payload con manual_reply=true y procesa last_output_text", async () => {
    // Restablecemos el mock para verificar el flow de manual reply.
    const { POST } = await import("@/app/api/webhooks/manychat/route");

    const payload = {
      "full-data": {
        id: "manychat_77",
        first_name: "Fran",
        ig_username: "fran.test",
        last_input_text: "",
        last_output_text: "Listo, te paso el link de pago",
        ig_last_interaction: new Date().toISOString(),
        custom_fields: {
          manual_reply: true,
        },
      },
    };

    const res = await POST(buildPost("https://test/api/webhooks/manychat", payload) as never);
    expect(res.status).toBe(200);
  });
});

describe("POST /api/webhooks/meli", () => {
  it("acepta payload de pregunta de MELI y devuelve 200 rápido", async () => {
    const { POST } = await import("@/app/api/webhooks/meli/route");

    const payload = {
      topic: "questions",
      resource: "/questions/12345",
      user_id: 99999999,
      application_id: 1234567890,
      sent: new Date().toISOString(),
      attempts: 1,
      _id: "abc123",
      received: new Date().toISOString(),
    };

    const res = await POST(buildPost("https://test/api/webhooks/meli", payload) as never);
    expect(res.status).toBe(200);
    const body = (await res.json()) as { ok: boolean };
    expect(body.ok).toBe(true);
  });

  it("ignora topics que no son questions con 200 (no-retry de MELI)", async () => {
    const { POST } = await import("@/app/api/webhooks/meli/route");
    const payload = {
      topic: "orders",
      resource: "/orders/12345",
      user_id: 99999999,
      _id: "xyz",
    };
    const res = await POST(buildPost("https://test/api/webhooks/meli", payload) as never);
    expect(res.status).toBe(200);
  });

  it("devuelve 400 cuando el body no es JSON", async () => {
    const { POST } = await import("@/app/api/webhooks/meli/route");
    const req = new Request("https://test/api/webhooks/meli", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "{",
    });
    const res = await POST(req as never);
    expect(res.status).toBe(400);
  });
});
