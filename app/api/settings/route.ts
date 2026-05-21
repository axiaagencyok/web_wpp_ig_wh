import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { adminClient } from "@/lib/supabase/admin";
import { z } from "zod";

const patchSchema = z.object({
  // Identidad / admin / canales
  admin_phone:                 z.string().max(30).nullable().optional(),
  admin_system_prompt:         z.string().max(4000).nullable().optional(),

  // Contextos dinámicos
  stories_context_general:     z.string().max(4000).nullable().optional(),
  stories_context_keywords:    z.string().max(4000).nullable().optional(),
  ads_context_general:         z.string().max(4000).nullable().optional(),
  ads_context_keywords:        z.string().max(4000).nullable().optional(),

  // Catálogo
  catalog_source:              z.enum(["sheets", "pdf"]).optional(),
  google_sheet_id:             z.string().max(200).nullable().optional(),
  google_sheet_range:          z.string().max(100).optional(),

  // Leads / notificaciones.
  // Email validation must not block saves on OTHER fields when the column
  // already holds a legacy/malformed value. Empty strings collapse to null;
  // otherwise we accept any string ≤200 chars. Front-end already enforces
  // email format on edit (`type="email"`), so this is a server-side guard
  // against historic dirty rows blocking unrelated edits.
  lead_notification_email:     z.string().max(200).nullable().optional()
                                   .transform((v) => (typeof v === "string" && v.trim() === "" ? null : v)),

  // Handoff a humano (migración 021) — mismo patrón defensivo que
  // lead_notification_email: longitud + nullable, sin gate de formato
  // estricto del lado server. El front valida email format con type="email".
  handoff_notification_email:    z.string().max(200).nullable().optional()
                                   .transform((v) => (typeof v === "string" && v.trim() === "" ? null : v)),
  handoff_notifications_enabled: z.boolean().optional(),

  // Prompts independientes por canal (migración 023). Cada uno es el system
  // prompt COMPLETO del agente para ese canal — fuente única de verdad.
  // Límite 20k chars: deja headroom para prompts largos sin permitir abusos.
  ig_agent_system_prompt:   z.string().max(20000).nullable().optional(),
  wpp_agent_system_prompt:  z.string().max(20000).nullable().optional(),
  meli_agent_system_prompt: z.string().max(20000).nullable().optional(),
  agent_name:               z.string().max(60).nullable().optional(),

  // Channel feature flags (migración 019)
  instagram_enabled:           z.boolean().optional(),
  whatsapp_enabled:            z.boolean().optional(),
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
      .select(
        [
          "id",
          "name",
          "whatsapp_number",
          "admin_phone",
          "admin_system_prompt",
          "stories_context_general",
          "stories_context_keywords",
          "ads_context_general",
          "ads_context_keywords",
          "catalog_source",
          "catalog_pdf_path",
          "catalog_text_cached_at",
          "google_sheet_id",
          "google_sheet_range",
          "agent_enabled",
          "lead_notification_email",
          "handoff_notification_email",
          "handoff_notifications_enabled",
          "agent_name",
          "ig_agent_system_prompt",
          "wpp_agent_system_prompt",
          "meli_agent_system_prompt",
          "instagram_enabled",
          "whatsapp_enabled",
        ].join(", ")
      )
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
      const flat = parsed.error.flatten();
      // Loguear con detalle para que regresiones del front no se queden
      // mudas en producción.
      console.error("[PATCH /api/settings] validation failed:", JSON.stringify(flat));
      // Resumen humano del primer field problemático, si existe, para que
      // el toast del front no diga solo "Datos inválidos".
      const firstField = Object.entries(flat.fieldErrors)[0];
      const summary = firstField
        ? `Datos inválidos en "${firstField[0]}": ${firstField[1]?.[0] ?? "valor no aceptado"}`
        : "Datos inválidos";
      return NextResponse.json({ error: summary, detail: flat }, { status: 400 });
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
      .select("id")
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
