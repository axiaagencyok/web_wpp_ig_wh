import { NextRequest, NextResponse, after } from "next/server";
import { adminClient } from "@/lib/supabase/admin";
import { getMeliAccountByUserId, getMeliRequest } from "@/lib/meli/client";
import { generateAnswer } from "@/lib/meli/agent";
import { sendAnswer } from "@/lib/meli/answers";
import type { MeliAccount } from "@/types/database.types";

/**
 * Webhook receiver de Mercado Libre.
 *
 * Contrato MELI:
 *   - POST con body JSON: { topic, resource, user_id, application_id, sent,
 *                            attempts, _id, received }
 *   - El handler debe devolver 2xx en menos de ~500ms o MELI considera el
 *     webhook fallido y reintenta. Toda la lógica costosa va detrás de
 *     `after()` (Next defiere hasta después de cerrar la respuesta HTTP).
 *
 * Flow para `topic === 'questions'`:
 *   1. resolver meli_account by user_id (multi-tenant routing).
 *   2. GET /questions/{id}?api_version=4 → datos completos de la pregunta.
 *   3. (opcional) GET /items/{id}?attributes=... → thumbnail y precio del ítem.
 *   4. INSERT en meli_questions (ON CONFLICT DO NOTHING vía UNIQUE
 *      meli_question_id — idempotente si MELI reintenta).
 *   5. Si `tenant.meli_enabled = true`: generar respuesta AI vía compose-prompt,
 *      guardar `ai_suggested_answer`. Si `meli_auto_answer = true`, además
 *      enviar la respuesta y marcar status='answered'.
 *
 * El handler ignora otros topics (orders, messages, etc.) con un 200, así MELI
 * no reintenta indefinidamente cuando lleguen suscripciones cruzadas.
 */

interface MeliWebhookPayload {
  topic?: string;
  resource?: string;
  user_id?: number;
  application_id?: number;
  sent?: string;
  attempts?: number;
  _id?: string;
  received?: string;
}

interface MeliQuestionApi {
  id: number;
  text: string;
  status?: string;
  date_created: string;
  item_id: string;
  from?: { id?: number; nickname?: string };
}

interface MeliItemSummary {
  id: string;
  title?: string;
  price?: number;
  thumbnail?: string;
  secure_thumbnail?: string;
}

export async function POST(req: NextRequest) {
  let payload: MeliWebhookPayload;
  try {
    payload = (await req.json()) as MeliWebhookPayload;
  } catch {
    console.warn("[meli/webhook] body no parseable como JSON");
    return new NextResponse("Bad Request", { status: 400 });
  }

  console.log(
    `[meli/webhook] topic=${payload.topic} resource=${payload.resource} user_id=${payload.user_id} attempts=${payload.attempts}`
  );

  // Ignorar topics que no nos interesan (MELI puede mandar varios si se
  // suscribieron en el portal).
  if (payload.topic !== "questions") {
    return NextResponse.json({ ok: true, ignored: payload.topic });
  }

  const questionId = extractQuestionId(payload.resource);
  if (!questionId || !payload.user_id) {
    console.warn(`[meli/webhook] resource o user_id inválidos: ${payload.resource}, ${payload.user_id}`);
    return NextResponse.json({ ok: true, ignored: "invalid-payload" });
  }

  // Defer todo el trabajo costoso para devolver 200 rápido.
  after(processQuestionWebhook(payload.user_id, questionId));

  return NextResponse.json({ ok: true });
}

function extractQuestionId(resource?: string): number | null {
  if (!resource) return null;
  // Formato esperado: "/questions/123456789" (a veces puede traer subpath)
  const match = resource.match(/^\/questions\/(\d+)/);
  if (!match) return null;
  const n = parseInt(match[1], 10);
  return Number.isFinite(n) ? n : null;
}

async function processQuestionWebhook(meliUserId: number, meliQuestionId: number): Promise<void> {
  try {
    // 1. Idempotencia básica: si ya tenemos la pregunta, salir.
    const { data: existing } = await adminClient
      .from("meli_questions")
      .select("id, status")
      .eq("meli_question_id", meliQuestionId)
      .maybeSingle();
    if (existing) {
      console.log(`[meli/webhook] question ${meliQuestionId} ya existe en DB (status=${existing.status}); skip`);
      return;
    }

    // 2. Routing a tenant via meli_user_id
    const account = await getMeliAccountByUserId(meliUserId);
    if (!account) {
      console.warn(`[meli/webhook] no hay meli_account para user_id=${meliUserId}. Ignorando.`);
      return;
    }
    if (account.status === "needs_reauth") {
      console.warn(`[meli/webhook] account ${account.id} needs_reauth; pregunta ${meliQuestionId} queda sin procesar.`);
      return;
    }

    // 3. Detalle de la pregunta
    const question = await getMeliRequest<MeliQuestionApi>(
      account as MeliAccount,
      `/questions/${meliQuestionId}`,
      { query: { api_version: 4 } }
    );

    // 4. Detalle del ítem (best-effort — fallar acá no debe bloquear el upsert).
    let item: MeliItemSummary | null = null;
    try {
      item = await getMeliRequest<MeliItemSummary>(
        account as MeliAccount,
        `/items/${encodeURIComponent(question.item_id)}`,
        { query: { attributes: "id,title,price,thumbnail,secure_thumbnail" } }
      );
    } catch (e) {
      console.warn(`[meli/webhook] /items/${question.item_id} falló: ${(e as Error).message}`);
    }

    // 5. Insert en DB. ON CONFLICT DO NOTHING vía el UNIQUE en meli_question_id —
    //    cubre la race condition entre dos webhooks concurrentes.
    const insertPayload = {
      tenant_id: account.tenant_id,
      meli_account_id: account.id,
      meli_question_id: question.id,
      item_id: question.item_id,
      item_title: item?.title ?? null,
      item_price: item?.price ?? null,
      item_thumbnail: item?.secure_thumbnail ?? item?.thumbnail ?? null,
      text: question.text,
      from_user_id: question.from?.id ?? null,
      from_user_nickname: question.from?.nickname ?? null,
      date_created: question.date_created,
      status: "pending" as const,
    };

    const { data: inserted, error: insertErr } = await adminClient
      .from("meli_questions")
      .upsert(insertPayload, { onConflict: "meli_question_id", ignoreDuplicates: true })
      .select("*")
      .maybeSingle();

    if (insertErr) {
      console.error(`[meli/webhook] insert q ${meliQuestionId} falló: ${insertErr.message}`);
      return;
    }
    if (!inserted) {
      // Otro proceso ganó la carrera del INSERT — ya está la row, salimos.
      return;
    }

    // 6. Agente: leer tenant para chequear si el scoring/auto_answer aplica.
    const { data: tenant, error: tenantErr } = await adminClient
      .from("tenants")
      .select("*")
      .eq("id", account.tenant_id)
      .maybeSingle();
    if (tenantErr || !tenant) {
      console.error(`[meli/webhook] tenant ${account.tenant_id} no encontrado para q ${meliQuestionId}`);
      return;
    }
    if (!tenant.meli_enabled) {
      console.log(`[meli/webhook] tenant ${tenant.id} con meli_enabled=false; q ${meliQuestionId} queda pending para revisión humana`);
      return;
    }

    const suggestion = await generateAnswer(inserted, account as MeliAccount, tenant);
    if (!suggestion) {
      console.warn(`[meli/webhook] agente no produjo respuesta para q ${meliQuestionId}`);
      return;
    }

    // Persistir la respuesta sugerida
    await adminClient
      .from("meli_questions")
      .update({ ai_suggested_answer: suggestion })
      .eq("id", inserted.id);

    // Auto-answer
    if (tenant.meli_auto_answer) {
      const result = await sendAnswer(inserted.id, suggestion, "ai");
      if (result.ok) {
        console.log(`[meli/webhook] auto-answer enviada para q ${meliQuestionId}`);
      } else {
        console.error(`[meli/webhook] auto-answer falló para q ${meliQuestionId}: ${result.error}`);
      }
    }
  } catch (e) {
    console.error(`[meli/webhook] processQuestionWebhook error (uid=${meliUserId}, q=${meliQuestionId}):`, (e as Error).message);
  }
}
