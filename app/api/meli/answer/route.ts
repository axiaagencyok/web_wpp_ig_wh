import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { sendAnswer } from "@/lib/meli/answers";

/**
 * POST /api/meli/answer
 * Body: { questionId: number, text: string, sentBy: 'ai' | 'human' }
 *
 * - Requiere usuario logueado en el panel (cookies de Supabase Auth).
 * - El usuario tiene que pertenecer al mismo tenant que la pregunta —
 *   esto se valida vía la propia RLS (consulta con su sesión).
 * - Llama sendAnswer (con adminClient internamente) y devuelve el row
 *   actualizado.
 */

const bodySchema = z.object({
  questionId: z.number().int().positive(),
  text: z.string().min(1).max(2000),
  sentBy: z.enum(["ai", "human"]),
});

export async function POST(req: NextRequest) {
  // Auth
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return new NextResponse("Unauthorized", { status: 401 });
  }

  // Body
  let parsed: z.infer<typeof bodySchema>;
  try {
    parsed = bodySchema.parse(await req.json());
  } catch (e) {
    return NextResponse.json({ error: "invalid-body", detail: (e as Error).message }, { status: 400 });
  }

  // Ownership check: usamos el cliente con la sesión del user, así si la
  // pregunta no pertenece a su tenant la RLS la oculta y maybeSingle() es null.
  const { data: ownedQuestion, error: ownErr } = await supabase
    .from("meli_questions")
    .select("id, status")
    .eq("id", parsed.questionId)
    .maybeSingle();
  if (ownErr) {
    console.error("[/api/meli/answer] ownership check error:", ownErr.message);
    return NextResponse.json({ error: "lookup-failed" }, { status: 500 });
  }
  if (!ownedQuestion) {
    return new NextResponse("Forbidden", { status: 403 });
  }

  if (ownedQuestion.status === "answered") {
    return NextResponse.json({ error: "already-answered" }, { status: 409 });
  }
  if (ownedQuestion.status === "deleted") {
    return NextResponse.json({ error: "question-deleted" }, { status: 409 });
  }

  const result = await sendAnswer(parsed.questionId, parsed.text, parsed.sentBy);
  if (!result.ok) {
    return NextResponse.json({ error: result.error, question: result.question }, { status: 502 });
  }
  return NextResponse.json({ ok: true, question: result.question });
}
