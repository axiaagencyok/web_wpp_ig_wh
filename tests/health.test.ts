// /api/health — el endpoint que el smoke test post-deploy curlea.
// Debe devolver 200 con shape { status, version, dbConnected } cuando la
// DB responde, y 500 cuando no. Las dos paths se exercitan.

import { describe, it, expect, vi, beforeEach } from "vitest";
import { createSupabaseMock } from "./helpers/supabase-mock";

const supabase = createSupabaseMock();

vi.mock("@/lib/supabase/admin", () => ({
  adminClient: supabase.client,
}));

beforeEach(() => {
  supabase.calls.length = 0;
  // por defecto la DB responde OK
  supabase.setState("tenants", { error: null });
});

describe("/api/health", () => {
  it("devuelve 200 con dbConnected:true cuando la query a tenants funciona", async () => {
    const { GET } = await import("@/app/api/health/route");
    const res = await GET();
    expect(res.status).toBe(200);
    const body = (await res.json()) as { status: string; version: string; dbConnected: boolean };
    expect(body.status).toBe("ok");
    expect(body.dbConnected).toBe(true);
    expect(typeof body.version).toBe("string");
  });

  it("devuelve 500 con dbConnected:false cuando la DB tira error", async () => {
    supabase.setState("tenants", { error: { message: "connection refused" } });
    const { GET } = await import("@/app/api/health/route");
    const res = await GET();
    expect(res.status).toBe(500);
    const body = (await res.json()) as { status: string; dbConnected: boolean; error: string };
    expect(body.status).toBe("error");
    expect(body.dbConnected).toBe(false);
    expect(body.error).toContain("connection");
  });
});
