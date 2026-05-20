import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";

/**
 * PUT /api/meli/settings
 * Body: { meli_agent_system_prompt?: string|null, meli_auto_answer?: boolean }
 *
 * Actualiza la configuración MELI del tenant del usuario logueado.
 * Se hace con el cliente autenticado (sesión del usuario) — la RLS valida
 * que solo pueda updatear su propio tenant.
 */

const bodySchema = z
  .object({
    meli_agent_system_prompt: z.union([z.string(), z.null()]).optional(),
    meli_auto_answer: z.boolean().optional(),
  })
  .refine((v) => v.meli_agent_system_prompt !== undefined || v.meli_auto_answer !== undefined, {
    message: "at-least-one-field-required",
  });

export async function PUT(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return new NextResponse("Unauthorized", { status: 401 });

  let parsed: z.infer<typeof bodySchema>;
  try {
    parsed = bodySchema.parse(await req.json());
  } catch (e) {
    return NextResponse.json({ error: "invalid-body", detail: (e as Error).message }, { status: 400 });
  }

  // Resolver tenant del usuario
  const { data: userRow, error: userErr } = await supabase
    .from("users")
    .select("tenant_id")
    .eq("id", user.id)
    .maybeSingle();
  if (userErr || !userRow?.tenant_id) {
    return NextResponse.json({ error: "tenant-unresolved" }, { status: 403 });
  }

  const updatePayload: {
    meli_agent_system_prompt?: string | null;
    meli_auto_answer?: boolean;
  } = {};
  if (parsed.meli_agent_system_prompt !== undefined) {
    updatePayload.meli_agent_system_prompt = parsed.meli_agent_system_prompt;
  }
  if (parsed.meli_auto_answer !== undefined) {
    updatePayload.meli_auto_answer = parsed.meli_auto_answer;
  }

  const { data, error } = await supabase
    .from("tenants")
    .update(updatePayload)
    .eq("id", userRow.tenant_id)
    .select("meli_agent_system_prompt, meli_auto_answer")
    .maybeSingle();

  if (error) {
    console.error("[/api/meli/settings] update error:", error.message);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  if (!data) {
    return new NextResponse("Forbidden", { status: 403 });
  }
  return NextResponse.json({ ok: true, settings: data });
}
