// Orquesta el flujo PR D dentro del webhook de Twilio:
//   1) Identifica al admin por tenant_admin_phones (E.164 sin prefijo).
//   2) Si el mensaje es audio, lo transcribe con Whisper.
//   3) Detecta si es una confirmación SI/NO de una pending_admin_action.
//   4) Si no, parsea un intent estructurado y propone el cambio.
// Devuelve `handled: true` cuando ya respondió por WPP — el webhook
// debe cortar y no encolar el mensaje. Si devuelve `handled: false` el
// webhook sigue su flujo normal (admin-agent legacy via buffer, o agente
// de clientes).

import { adminClient } from "@/lib/supabase/admin";
import { sendWhatsAppMessage, downloadMedia } from "@/lib/twilio/client";
import { transcribeAudio } from "@/lib/whisper/transcribe";
import { parseAdminIntent } from "./parse-intent";
import { executeAdminAction } from "./execute-action";
import { getRawRows } from "@/lib/google/sheets";
import type { Tenant } from "@/types/database.types";
import type { AdminActionPayload } from "./parse-intent";

export interface HandleAdminInput {
  // tal cual los recibe el webhook
  from:       string; // whatsapp:+549...
  to:         string; // whatsapp:+1415... (número Twilio del tenant)
  body:       string;
  mediaUrl:   string | null;
  mediaType:  string | null;
}

export interface HandleAdminResult {
  handled:    boolean;
  reason?:    string; // por qué no se manejó (debugging)
}

// ── E.164 helpers ───────────────────────────────────────────────────────────

export function toE164(twilioFrom: string): string {
  return twilioFrom.startsWith("whatsapp:") ? twilioFrom.slice(9) : twilioFrom;
}

// ── Confirmación textual ────────────────────────────────────────────────────

const YES_WORDS = ["si", "sí", "ok", "dale", "confirmo", "confirma", "confirmá", "listo", "perfecto"];
const NO_WORDS  = ["no", "cancelar", "cancelá", "cancela", "negativo", "abortar"];

export type ConfirmKind = "yes" | "no" | null;

export function detectConfirmation(text: string): ConfirmKind {
  const normalized = text.trim().toLowerCase().replace(/[¡!¿?.,;:]/g, "");
  if (!normalized) return null;
  // Sólo consideramos confirmación si el mensaje es CORTO (≤ 3 palabras).
  // Eso evita matchear un "si querés cambiamos..." dentro de una instrucción.
  if (normalized.split(/\s+/).length > 3) return null;
  if (YES_WORDS.some((w) => normalized === w || normalized.startsWith(w + " "))) return "yes";
  if (NO_WORDS.some((w)  => normalized === w || normalized.startsWith(w + " "))) return "no";
  return null;
}

// ── Lookup ──────────────────────────────────────────────────────────────────

async function findAdminAndTenant(fromE164: string): Promise<{
  tenant: Tenant;
  adminPhone: string;
} | null> {
  const { data: adminRow, error } = await adminClient
    .from("tenant_admin_phones")
    .select("phone_number, tenant_id")
    .eq("phone_number", fromE164)
    .eq("is_active", true)
    .limit(1)
    .maybeSingle();

  if (error || !adminRow) return null;

  const { data: tenant } = await adminClient
    .from("tenants")
    .select("*")
    .eq("id", adminRow.tenant_id)
    .single();

  if (!tenant) return null;
  return { tenant, adminPhone: adminRow.phone_number };
}

// ── Texto desde el mensaje (texto o audio) ──────────────────────────────────

async function extractText(input: HandleAdminInput): Promise<string | null> {
  const trimmed = input.body?.trim();
  if (trimmed) return trimmed;
  if (input.mediaUrl && input.mediaType?.startsWith("audio")) {
    try {
      const { buffer, mimeType } = await downloadMedia(input.mediaUrl);
      return await transcribeAudio(buffer, { mimeType });
    } catch (err) {
      console.error("[admin-pr-d] Audio transcription failed:", err);
      return null;
    }
  }
  return null;
}

// ── Pending action helpers ──────────────────────────────────────────────────

async function findLatestPending(tenantId: string, adminPhone: string) {
  const { data } = await adminClient
    .from("pending_admin_actions")
    .select("*")
    .eq("tenant_id", tenantId)
    .eq("admin_phone", adminPhone)
    .eq("status", "pending")
    .gt("expires_at", new Date().toISOString())
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  return data;
}

async function resolvePending(id: string, status: "confirmed" | "rejected") {
  await adminClient
    .from("pending_admin_actions")
    .update({ status, resolved_at: new Date().toISOString() })
    .eq("id", id);
}

// ── Reply helper ────────────────────────────────────────────────────────────

async function reply(from: string, to: string, body: string): Promise<void> {
  // `from` del webhook = número del admin; nosotros respondemos DESDE el
  // número Twilio del tenant (`to` del webhook) HACIA el admin (`from`).
  try {
    await sendWhatsAppMessage(to, from, body);
  } catch (err) {
    console.error("[admin-pr-d] Failed to send WPP reply:", err);
  }
}

// ── Catalog headers ─────────────────────────────────────────────────────────

async function loadCatalogContext(tenant: Tenant) {
  if (!tenant.google_sheet_id) return { headers: undefined, sample: undefined };
  try {
    const { headers, rows } = await getRawRows(tenant.google_sheet_id, tenant.google_sheet_range);
    return { headers, sample: rows.slice(0, 6) };
  } catch (err) {
    console.warn("[admin-pr-d] No pude leer el catálogo para contexto:", err);
    return { headers: undefined, sample: undefined };
  }
}

// ── Entry point ─────────────────────────────────────────────────────────────

export async function handleAdminMessagePRD(input: HandleAdminInput): Promise<HandleAdminResult> {
  const fromE164 = toE164(input.from);
  const match = await findAdminAndTenant(fromE164);
  if (!match) return { handled: false, reason: "not-admin" };

  const { tenant, adminPhone } = match;

  const text = await extractText(input);
  if (!text) {
    await reply(input.from, input.to, "No pude leer el mensaje. Probá de nuevo escribiendo lo que querés cambiar.");
    return { handled: true };
  }

  // ── 1) ¿Es una confirmación de algo pendiente? ────────────────────────────
  const confirm = detectConfirmation(text);
  if (confirm) {
    const pending = await findLatestPending(tenant.id, adminPhone);
    if (!pending) {
      await reply(input.from, input.to, "No tengo ningún cambio pendiente para confirmar.");
      return { handled: true };
    }

    if (confirm === "no") {
      await resolvePending(pending.id, "rejected");
      await reply(input.from, input.to, "Cancelado, no cambié nada.");
      return { handled: true };
    }

    // SI → ejecutar
    const action = {
      action_type: pending.action_type,
      payload:     pending.action_payload,
    } as unknown as AdminActionPayload;

    const result = await executeAdminAction(action, tenant);
    await resolvePending(pending.id, result.ok ? "confirmed" : "rejected");
    await reply(input.from, input.to, result.message);
    return { handled: true };
  }

  // ── 2) Parsear intent nuevo ───────────────────────────────────────────────
  const { headers, sample } = await loadCatalogContext(tenant);
  const parsed = await parseAdminIntent(text, { tenant, catalogHeaders: headers, catalogSample: sample });

  if (!parsed.ok) {
    // Le devolvemos el control al flujo legacy (admin-agent vía buffer) —
    // este sigue manejando reportes, stats, etc.
    return { handled: false, reason: `parse-failed: ${parsed.reason}` };
  }

  // Persistir propuesta y responder con prompt de confirmación.
  const { error } = await adminClient.from("pending_admin_actions").insert({
    tenant_id:      tenant.id,
    admin_phone:    adminPhone,
    action_type:    parsed.action.action_type,
    action_payload: parsed.action.payload as never,
    human_summary:  parsed.human_summary,
  });

  if (error) {
    console.error("[admin-pr-d] Failed to insert pending:", error);
    await reply(input.from, input.to, "Tuve un problema guardando el cambio propuesto. Probá de nuevo.");
    return { handled: true };
  }

  await reply(
    input.from,
    input.to,
    `¿Querés que ${parsed.human_summary}? Respondé SI o NO.`,
  );
  return { handled: true };
}
