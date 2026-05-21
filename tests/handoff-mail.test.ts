// ISSUE 1 — mail al derivar chat. Tests del módulo lib/notifications/handoff.
// Cubre los gates antes del envío (tenant toggle, email vacío, anti-spam,
// no-api-key) y el path feliz mockeando Resend.

import { describe, it, expect, vi, beforeEach } from "vitest";

// Resend SDK: mockeamos su .emails.send para no pegar la red. Resend se
// llama con `new`, así que el mock tiene que ser una clase constructable.
// Definimos sendMock con vi.hoisted para que esté disponible cuando la
// factoría de vi.mock corre (vi.mock se hoistea al top del archivo).
const { sendMock } = vi.hoisted(() => {
  return { sendMock: vi.fn(async () => ({ data: { id: "fake-id" }, error: null })) };
});

vi.mock("resend", () => ({
  Resend: class {
    emails = { send: sendMock };
  },
}));

// Generador de resumen: stub que devuelve un summary fijo, así no llama
// a Claude desde el test.
vi.mock("@/lib/notifications/handoff-summary", () => ({
  generateHandoffSummary: vi.fn(async () => ({
    summary: "El cliente quiere SPC click 4mm, dio CP 1414, falta confirmar pago.",
    lastClientMessage: "ok, mañana hago la transferencia",
  })),
}));

// Tracking de calls a adminClient.update (para el stamp anti-spam).
const updateCalls: Array<{ table: string; payload: unknown }> = [];
vi.mock("@/lib/supabase/admin", () => {
  const chain = {
    update: vi.fn((p: unknown) => {
      chain._payload = p;
      return chain;
    }),
    eq: vi.fn(() => ({
      then: (r: (v: { error: null }) => unknown) => {
        if (chain._payload !== undefined) {
          updateCalls.push({ table: chain._table!, payload: chain._payload });
          chain._payload = undefined;
        }
        return Promise.resolve(r({ error: null }));
      },
    })),
    _table: undefined as string | undefined,
    _payload: undefined as unknown,
  };
  return {
    adminClient: {
      from: vi.fn((table: string) => {
        chain._table = table;
        chain._payload = undefined;
        return chain;
      }),
    },
  };
});

beforeEach(() => {
  sendMock.mockClear();
  updateCalls.length = 0;
  process.env.RESEND_API_KEY = "re_test";
});

const baseTenant = {
  id: "t-1",
  name: "WHD",
  handoff_notification_email: "ops@whd.com",
  handoff_notifications_enabled: true,
};

const baseConv = {
  id: "c-1",
  contact_name: "Juan",
  contact_phone: "instagram:abc123",
  channel: "instagram" as const,
  last_handoff_email_at: null,
};

describe("sendHandoffEmail — gates", () => {
  it("skip cuando handoff_notifications_enabled = false", async () => {
    const { sendHandoffEmail } = await import("@/lib/notifications/handoff");
    const result = await sendHandoffEmail(
      { ...baseTenant, handoff_notifications_enabled: false },
      baseConv,
    );
    expect(result.sent).toBe(false);
    expect(result.reason).toBe("disabled-by-tenant");
    expect(sendMock).not.toHaveBeenCalled();
  });

  it("skip cuando handoff_notification_email es null", async () => {
    const { sendHandoffEmail } = await import("@/lib/notifications/handoff");
    const result = await sendHandoffEmail(
      { ...baseTenant, handoff_notification_email: null },
      baseConv,
    );
    expect(result.sent).toBe(false);
    expect(result.reason).toBe("no-email-configured");
  });

  it("skip por rate limit si el último handoff fue hace <60 min", async () => {
    const { sendHandoffEmail } = await import("@/lib/notifications/handoff");
    const result = await sendHandoffEmail(baseTenant, {
      ...baseConv,
      last_handoff_email_at: new Date(Date.now() - 30 * 60_000).toISOString(),
    });
    expect(result.sent).toBe(false);
    expect(result.reason).toBe("rate-limited");
    expect(sendMock).not.toHaveBeenCalled();
  });

  it("envía si el último handoff fue hace >60 min", async () => {
    const { sendHandoffEmail } = await import("@/lib/notifications/handoff");
    const result = await sendHandoffEmail(baseTenant, {
      ...baseConv,
      last_handoff_email_at: new Date(Date.now() - 120 * 60_000).toISOString(),
    });
    expect(result.sent).toBe(true);
    expect(sendMock).toHaveBeenCalledOnce();
  });

  it("skip cuando RESEND_API_KEY no está seteada", async () => {
    delete process.env.RESEND_API_KEY;
    const { sendHandoffEmail } = await import("@/lib/notifications/handoff");
    const result = await sendHandoffEmail(baseTenant, baseConv);
    expect(result.sent).toBe(false);
    expect(result.reason).toBe("no-api-key");
  });
});

describe("sendHandoffEmail — path feliz", () => {
  it("envía con subject que incluye el nombre y el último mensaje", async () => {
    const { sendHandoffEmail } = await import("@/lib/notifications/handoff");
    const result = await sendHandoffEmail(baseTenant, baseConv);
    expect(result.sent).toBe(true);
    expect(sendMock).toHaveBeenCalledOnce();
    const arg = (sendMock.mock.calls[0] as unknown as [{
      to: string;
      from: string;
      subject: string;
      html: string;
      text: string;
    }])[0];
    expect(arg.to).toBe("ops@whd.com");
    expect(arg.from).toContain("leads@fenoma.agency");
    expect(arg.subject).toContain("Juan");
    expect(arg.subject).toContain("ok, mañana hago la transferencia");
    expect(arg.html).toContain("SPC click 4mm");
    expect(arg.text).toContain("SPC click 4mm");
  });

  it("stampea conversations.last_handoff_email_at después del envío", async () => {
    const { sendHandoffEmail } = await import("@/lib/notifications/handoff");
    await sendHandoffEmail(baseTenant, baseConv);
    const stampCall = updateCalls.find((c) => c.table === "conversations");
    expect(stampCall).toBeDefined();
    expect((stampCall!.payload as Record<string, unknown>).last_handoff_email_at).toBeDefined();
  });

  it("escapa HTML del nombre del cliente para evitar inyección", async () => {
    const { sendHandoffEmail } = await import("@/lib/notifications/handoff");
    await sendHandoffEmail(baseTenant, {
      ...baseConv,
      contact_name: "<script>alert(1)</script>",
    });
    const arg = (sendMock.mock.calls[0] as unknown as [{ html: string }])[0];
    expect(arg.html).not.toContain("<script>alert(1)</script>");
    expect(arg.html).toContain("&lt;script&gt;");
  });
});
