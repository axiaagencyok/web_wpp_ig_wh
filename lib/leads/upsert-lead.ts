import { adminClient } from "@/lib/supabase/admin";
import { sendLeadNotification } from "@/lib/notifications/resend";
import type { Conversation, Lead, Tenant } from "@/types/database.types";
import type { ScoringResult } from "./scoring-agent";

const NOTIFICATION_THRESHOLD = 60;

export interface UpsertLeadParams {
  tenant: Pick<Tenant, "id" | "name" | "lead_notification_email">;
  conversation: Pick<Conversation, "id" | "contact_phone" | "contact_name" | "custom_fields">;
  scoring: ScoringResult;
}

/**
 * Persiste (o actualiza) el lead derivado de una conversación de Instagram.
 *
 * - Upsert por (tenant_id, manychat_id). Si ya existía, actualiza datos pero
 *   NO resetea notificado_at — eso garantiza una sola notificación por lead.
 * - Si el score post-upsert >= 60 y notificado_at sigue NULL, marca
 *   notificado_at=now() y dispara `sendLeadNotification` **fire-and-forget**.
 * - El caller obtiene el lead final como retorno (o null si algo falló).
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

  const insertPayload = {
    tenant_id: tenant.id,
    conversation_id: conversation.id,
    manychat_id: manychatId,
    instagram_user: igUsername,
    nombre: scoring.nombre,
    zona: scoring.zona,
    tipo_proyecto: scoring.tipo_proyecto,
    m2_estimados: scoring.m2_estimados,
    producto_interes: scoring.producto_interes,
    urgencia: scoring.urgencia,
    lead_score: scoring.lead_score,
    resumen_conversacion: scoring.resumen_conversacion,
  };

  // Upsert por (tenant_id, manychat_id) cuando manychat_id existe.
  // Si manychat_id es null (no debería pasar en IG real, pero por las dudas),
  // caemos a un insert plano.
  let lead: Lead | null = null;

  if (manychatId) {
    const { data, error } = await adminClient
      .from("Leads")
      .upsert(insertPayload, { onConflict: "tenant_id,manychat_id" })
      .select("*")
      .single();
    if (error) {
      console.error(`[upsertLead] upsert error (tenant ${tenant.id}, manychat ${manychatId}):`, error.message);
      return null;
    }
    lead = data;
  } else {
    const { data, error } = await adminClient
      .from("Leads")
      .insert(insertPayload)
      .select("*")
      .single();
    if (error) {
      console.error(`[upsertLead] insert error (tenant ${tenant.id}, conv ${conversation.id}):`, error.message);
      return null;
    }
    lead = data;
  }

  // Notificación: solo si score supera umbral Y no se notificó antes.
  if (lead && lead.lead_score !== null && lead.lead_score >= NOTIFICATION_THRESHOLD && !lead.notificado_at) {
    const now = new Date().toISOString();
    const { data: stamped, error: stampErr } = await adminClient
      .from("Leads")
      .update({ notificado_at: now })
      .eq("id", lead.id)
      // Re-chequear notificado_at sigue NULL acá previene una doble notificación
      // si dos turnos concurrentes pasan el umbral al mismo tiempo (raro pero posible).
      .is("notificado_at", null)
      .select("*")
      .single();

    if (stampErr) {
      console.error(`[upsertLead] stamp notificado_at error lead ${lead.id}:`, stampErr.message);
    } else if (stamped) {
      lead = stamped;
      // Fire-and-forget. Cualquier error queda logueado dentro de sendLeadNotification.
      void sendLeadNotification(lead, tenant).catch((e) =>
        console.error(`[upsertLead] sendLeadNotification rejected for lead ${lead?.id}:`, (e as Error).message)
      );
    }
  }

  return lead;
}
