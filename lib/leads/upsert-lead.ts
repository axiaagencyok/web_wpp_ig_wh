import { adminClient } from "@/lib/supabase/admin";
import { sendLeadNotification } from "@/lib/notifications/resend";
import type { Conversation, Lead, Tenant } from "@/types/database.types";
import type { ScoringResult } from "./scoring-agent";

const NOTIFICATION_THRESHOLD = 60;
const RESET_DAYS_DEFAULT = 3;

export interface UpsertLeadParams {
  tenant: Pick<Tenant, "id" | "name" | "lead_notification_email" | "lead_reset_after_days">;
  conversation: Pick<Conversation, "id" | "contact_phone" | "contact_name" | "custom_fields">;
  scoring: ScoringResult;
}

/**
 * Persiste (o actualiza) el lead derivado de una conversación de Instagram.
 *
 * Comportamiento:
 *
 *   1. Si no existe un lead previo para (tenant_id, manychat_id) → INSERT con
 *      estado='Nuevo' (default del schema), es_recurrente=false (default),
 *      compras_anteriores=0 (default).
 *
 *   2. Si EXISTE un lead previo:
 *      a. Chequea condiciones de "reset":
 *           - estado IN ('Cerrado','Descartado'), o
 *           - updated_at más viejo que tenant.lead_reset_after_days días
 *             (default 3 si la columna es NULL).
 *      b. Si cumple alguna → trata el turno como un cliente recurrente:
 *           estado='Nuevo', notificado_at=null, es_recurrente=true,
 *           compras_anteriores += 1, y sobrescribe los campos de scoring.
 *           El nullify de notificado_at habilita una nueva notificación
 *           si el score post-reset supera el umbral.
 *      c. Si NO cumple ninguna → UPDATE preservando estado/notificado_at/
 *           es_recurrente/compras_anteriores. Solo se refrescan los campos
 *           de scoring (datos del último turno).
 *
 *   3. En todos los casos, si el lead post-upsert tiene `lead_score >= 60`
 *      Y `notificado_at IS NULL`, se stampea `notificado_at=now()` con un
 *      guard `is null` (anti doble notificación bajo concurrencia) y se
 *      dispara `sendLeadNotification` fire-and-forget.
 *
 * Nunca tira excepción al caller — errores se logean y la función devuelve null.
 */

export async function upsertLead(params: UpsertLeadParams): Promise<Lead | null> {
  const { tenant, conversation, scoring } = params;

  // manychat_id viene del contact_phone "instagram:SUBSCRIBER_ID"
  const phone = conversation.contact_phone ?? "";
  const manychatId = phone.startsWith("instagram:") ? phone.slice("instagram:".length) : phone || null;

  // instagram_user del custom_fields.ig_username (cuando ManyChat lo manda)
  const customFields = (conversation.custom_fields as Record<string, unknown> | null) ?? {};
  const igUsername =
    typeof customFields.ig_username === "string" ? customFields.ig_username : null;

  // Campos del scoring — SIEMPRE se sobreescriben en cada turno (reset o no).
  const scoringFields = {
    nombre: scoring.nombre,
    zona: scoring.zona,
    tipo_proyecto: scoring.tipo_proyecto,
    m2_estimados: scoring.m2_estimados,
    producto_interes: scoring.producto_interes,
    urgencia: scoring.urgencia,
    lead_score: scoring.lead_score,
    resumen_conversacion: scoring.resumen_conversacion,
  } as const;

  // Payload para INSERT (lead nuevo).
  const insertPayload = {
    tenant_id: tenant.id,
    conversation_id: conversation.id,
    manychat_id: manychatId,
    instagram_user: igUsername,
    ...scoringFields,
  };

  let lead: Lead | null = null;

  if (!manychatId) {
    // Sin manychat_id no podemos identificar al cliente — solo INSERT plano.
    const { data, error } = await adminClient
      .from("Leads")
      .insert(insertPayload)
      .select("*")
      .single();
    if (error || !data) {
      console.error(`[upsertLead] insert error (tenant ${tenant.id}, conv ${conversation.id}):`, error?.message);
      return null;
    }
    lead = data;
  } else {
    // Lookup explícito en vez de upsert ciego — necesitamos saber si existe
    // y decidir reset vs update.
    const { data: existing, error: lookupErr } = await adminClient
      .from("Leads")
      .select("id, estado, notificado_at, updated_at, compras_anteriores")
      .eq("tenant_id", tenant.id)
      .eq("manychat_id", manychatId)
      .maybeSingle();
    if (lookupErr) {
      console.error(`[upsertLead] lookup error (tenant ${tenant.id}, manychat ${manychatId}):`, lookupErr.message);
      return null;
    }

    if (!existing) {
      // Lead nuevo → INSERT
      const { data, error } = await adminClient
        .from("Leads")
        .insert(insertPayload)
        .select("*")
        .single();
      if (error || !data) {
        console.error(`[upsertLead] insert error (tenant ${tenant.id}, manychat ${manychatId}):`, error?.message);
        return null;
      }
      lead = data;
    } else {
      // Lead existente — evaluar reset vs update preservador.
      const resetDays = tenant.lead_reset_after_days ?? RESET_DAYS_DEFAULT;
      const updatedAtMs = new Date(existing.updated_at).getTime();
      const isStale = Date.now() - updatedAtMs > resetDays * 86_400_000;
      const isClosed = existing.estado === "Cerrado" || existing.estado === "Descartado";
      const shouldReset = isStale || isClosed;

      const baseUpdate = {
        ...scoringFields,
        conversation_id: conversation.id,
        instagram_user: igUsername,
      };

      const updatePayload = shouldReset
        ? {
            ...baseUpdate,
            estado: "Nuevo" as const,
            notificado_at: null,
            es_recurrente: true,
            compras_anteriores: (existing.compras_anteriores ?? 0) + 1,
          }
        : baseUpdate;

      if (shouldReset) {
        const reason = isClosed
          ? `estado=${existing.estado}`
          : `updated_at +${resetDays}d`;
        console.log(
          `[upsertLead] reset lead ${existing.id} (tenant ${tenant.id}, manychat ${manychatId}): ${reason}`
        );
      }

      const { data, error } = await adminClient
        .from("Leads")
        .update(updatePayload)
        .eq("id", existing.id)
        .select("*")
        .single();
      if (error || !data) {
        console.error(`[upsertLead] update error for lead ${existing.id}:`, error?.message);
        return null;
      }
      lead = data;
    }
  }

  // Notificación: solo si score supera umbral Y no se notificó antes.
  // En el caso de reset, notificado_at se nulleó arriba → si el nuevo score
  // >= 60, se notifica de nuevo (caso real: cliente recurrente que califica
  // alto otra vez tras venir cerrado).
  if (!lead) {
    return lead;
  }

  const score = lead.lead_score;
  const alreadyNotified = !!lead.notificado_at;

  if (score === null || score < NOTIFICATION_THRESHOLD) {
    console.log(
      `[upsertLead] skip notify lead=${lead.id} score=${score} threshold=${NOTIFICATION_THRESHOLD}`
    );
    return lead;
  }
  if (alreadyNotified) {
    console.log(
      `[upsertLead] skip notify lead=${lead.id} score=${score} already_notified_at=${lead.notificado_at}`
    );
    return lead;
  }

  console.log(
    `[upsertLead] enter notify block lead=${lead.id} tenant=${tenant.id} score=${score} email=${tenant.lead_notification_email ?? "<null>"}`
  );

  // Stamp notificado_at primero — el filtro .is("notificado_at", null) bloquea
  // doble notificación bajo concurrencia.
  const now = new Date().toISOString();
  const { data: stamped, error: stampErr } = await adminClient
    .from("Leads")
    .update({ notificado_at: now })
    .eq("id", lead.id)
    .is("notificado_at", null)
    .select("*")
    .maybeSingle();

  if (stampErr) {
    console.error(`[upsertLead] stamp notificado_at error lead=${lead.id}:`, stampErr.message);
    return lead;
  }
  if (!stamped) {
    console.log(
      `[upsertLead] stamp no-op (otra ejecución concurrente ya notificó) lead=${lead.id}`
    );
    return lead;
  }
  lead = stamped;

  // CRÍTICO: await — antes era `void sendLeadNotification(...)` y en Vercel
  // la función serverless terminaba apenas resolvía la promesa registrada en
  // `after()`, matando el HTTP a Resend antes de que se disparara. Awaiteando
  // acá garantizamos que la promesa del scoringTask no se resuelva hasta que
  // el mail efectivamente salga (o falle con error logueado).
  try {
    const result = await sendLeadNotification(lead, tenant);
    if (result.sent) {
      console.log(`[upsertLead] ✓ notificación enviada lead=${lead.id}`);
    } else {
      console.warn(
        `[upsertLead] notificación NO enviada lead=${lead.id} reason=${result.reason ?? "?"}`
      );
    }
  } catch (e) {
    console.error(
      `[upsertLead] sendLeadNotification threw lead=${lead.id}:`,
      (e as Error).message
    );
  }

  return lead;
}
