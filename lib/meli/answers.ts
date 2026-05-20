import { adminClient } from "@/lib/supabase/admin";
import { postMeliRequest } from "./client";
import type { MeliAccount, MeliQuestion } from "@/types/database.types";

/**
 * Envía una respuesta a una pregunta de MELI y actualiza el row local.
 *
 * - Lee la question + la meli_account asociada via adminClient (service role
 *   bypasea RLS — pensado para llamarse desde route handlers ya autorizados).
 * - POST /answers con `{ question_id, text }`.
 * - Si MELI responde OK: actualiza `sent_answer`, `answered_at`, `sent_by`,
 *   `status='answered'`.
 * - Si falla: deja `status='pending'` y devuelve el error en el resultado
 *   (el caller decide qué mostrar).
 */

export interface SendAnswerResult {
  ok: boolean;
  question: MeliQuestion | null;
  error?: string;
}

export async function sendAnswer(
  questionDbId: number,
  answerText: string,
  sentBy: "ai" | "human"
): Promise<SendAnswerResult> {
  const text = answerText.trim();
  if (!text) {
    return { ok: false, question: null, error: "answer-text-empty" };
  }
  if (text.length > 2000) {
    return { ok: false, question: null, error: "answer-text-too-long (>2000 chars)" };
  }

  const { data: question, error: qErr } = await adminClient
    .from("meli_questions")
    .select("*")
    .eq("id", questionDbId)
    .maybeSingle();
  if (qErr || !question) {
    return { ok: false, question: null, error: `question-not-found: ${qErr?.message ?? "no row"}` };
  }

  if (!question.meli_account_id) {
    return { ok: false, question, error: "question-has-no-account" };
  }

  const { data: account, error: aErr } = await adminClient
    .from("meli_accounts")
    .select("*")
    .eq("id", question.meli_account_id)
    .maybeSingle();
  if (aErr || !account) {
    return { ok: false, question, error: `account-not-found: ${aErr?.message ?? "no row"}` };
  }
  if (account.status === "needs_reauth") {
    return { ok: false, question, error: "account-needs-reauth" };
  }

  try {
    await postMeliRequest(account as MeliAccount, "/answers", {
      question_id: question.meli_question_id,
      text,
    });
  } catch (e) {
    const msg = (e as Error).message;
    console.error(`[meli/answers] sendAnswer failed for q ${questionDbId}:`, msg);
    return { ok: false, question, error: msg };
  }

  const answeredAt = new Date().toISOString();
  const { data: updated, error: updErr } = await adminClient
    .from("meli_questions")
    .update({
      sent_answer: text,
      answered_at: answeredAt,
      sent_by: sentBy,
      status: "answered",
    })
    .eq("id", question.id)
    .select("*")
    .single();

  if (updErr || !updated) {
    // El POST a MELI ya salió; la respuesta ya viajó. Logueamos pero no
    // pretendemos rollback (no se puede des-enviar una respuesta de MELI).
    console.error(`[meli/answers] no se pudo persistir el estado answered para q ${question.id}:`, updErr?.message);
    return { ok: true, question, error: `post-ok-but-db-update-failed: ${updErr?.message ?? "no row"}` };
  }

  return { ok: true, question: updated };
}
