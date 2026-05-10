import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { z } from "zod";

const patchSchema = z.object({
  contact_name:  z.string().max(120).nullable().optional(),
  contact_email: z.string().email().max(254).nullable().optional(),
  notes:         z.string().max(4000).nullable().optional(),
  tags:          z.array(z.string().max(40)).max(20).optional(),
});

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const supabase = await createClient();

    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) return new NextResponse("Unauthorized", { status: 401 });

    let body: unknown;
    try { body = await req.json(); }
    catch { return NextResponse.json({ error: "JSON inválido" }, { status: 400 }); }

    const parsed = patchSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Datos inválidos", detail: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const { id } = await params;

    // RLS garantiza que solo puede editar conversaciones del propio tenant
    const { data, error } = await supabase
      .from("conversations")
      .update(parsed.data)
      .eq("id", id)
      .select("id, contact_name, contact_email, notes, tags")
      .single();

    if (error) {
      console.error("[PATCH /api/chats/[id]] update error:", error.message);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    if (!data) return NextResponse.json({ error: "No encontrado" }, { status: 404 });

    return NextResponse.json(data);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[PATCH /api/chats/[id]] unexpected:", msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
