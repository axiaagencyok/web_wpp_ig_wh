import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { adminClient } from "@/lib/supabase/admin";
import { z } from "zod";

const patchSchema = z.object({
  admin_phone:         z.string().max(30).nullable().optional(),
  admin_system_prompt: z.string().max(4000).nullable().optional(),
});

export async function GET() {
  try {
    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) return new NextResponse("Unauthorized", { status: 401 });

    // Get user's tenant_id via RLS-safe query
    const { data: userRow, error: userErr } = await supabase
      .from("users")
      .select("tenant_id")
      .eq("id", user.id)
      .single();

    if (userErr || !userRow) return NextResponse.json({ error: "User not found" }, { status: 404 });

    const { data: tenant, error: tenantErr } = await adminClient
      .from("tenants")
      .select("id, name, whatsapp_number, admin_phone, admin_system_prompt, agent_system_prompt, google_sheet_id, google_sheet_range, agent_enabled")
      .eq("id", userRow.tenant_id)
      .single();

    if (tenantErr || !tenant) return NextResponse.json({ error: "Tenant not found" }, { status: 404 });

    return NextResponse.json(tenant);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) return new NextResponse("Unauthorized", { status: 401 });

    let body: unknown;
    try { body = await req.json(); }
    catch { return NextResponse.json({ error: "JSON inválido" }, { status: 400 }); }

    const parsed = patchSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: "Datos inválidos", detail: parsed.error.flatten() }, { status: 400 });
    }

    const { data: userRow, error: userErr } = await supabase
      .from("users")
      .select("tenant_id")
      .eq("id", user.id)
      .single();

    if (userErr || !userRow) return NextResponse.json({ error: "User not found" }, { status: 404 });

    const { data, error } = await adminClient
      .from("tenants")
      .update(parsed.data)
      .eq("id", userRow.tenant_id)
      .select("id, admin_phone, admin_system_prompt")
      .single();

    if (error) {
      console.error("[PATCH /api/settings] update error:", error.message);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json(data);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
