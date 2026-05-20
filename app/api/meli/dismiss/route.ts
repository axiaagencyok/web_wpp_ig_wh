import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";

/**
 * POST /api/meli/dismiss
 * Body: { questionId: number }
 *
 * Marca una pregunta como `deleted` localmente (no envía nada a MELI).
 * Útil para sacar preguntas spam/irrelevantes de la bandeja sin responder.
 * Requiere usuario logueado; la propia RLS valida ownership por tenant.
 */

const bodySchema = z.object({ questionId: z.number().int().positive() });

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return new NextResponse("Unauthorized", { status: 401 });

  let parsed: z.infer<typeof bodySchema>;
  try {
    parsed = bodySchema.parse(await req.json());
  } catch (e) {
    return NextResponse.json({ error: "invalid-body", detail: (e as Error).message }, { status: 400 });
  }

  // El update va con la sesión del user, RLS filtra por tenant.
  const { data, error } = await supabase
    .from("meli_questions")
    .update({ status: "deleted" })
    .eq("id", parsed.questionId)
    .select("id, status")
    .maybeSingle();

  if (error) {
    console.error("[/api/meli/dismiss] error:", error.message);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  if (!data) {
    return new NextResponse("Forbidden", { status: 403 });
  }
  return NextResponse.json({ ok: true, question: data });
}
