// Executor para las acciones admin propuestas vía PR D. Una vez que el
// admin contesta SI, el webhook saca la pending_admin_action y la pasa por
// acá. Si falla, devolvemos un mensaje legible para mandarle al admin.

import { adminClient } from "@/lib/supabase/admin";
import { updateCell } from "@/lib/google/sheets";
import type { Tenant } from "@/types/database.types";
import type {
  AdminActionPayload,
  UpdatePricePayload,
  UpdateContextPayload,
} from "./parse-intent";

export interface ExecuteResult {
  ok:      boolean;
  message: string; // texto natural en español listo para responder al admin
}

export async function executeAdminAction(
  action: AdminActionPayload,
  tenant: Tenant,
): Promise<ExecuteResult> {
  try {
    if (action.action_type === "update_price") {
      return await execUpdatePrice(action.payload, tenant);
    }
    if (action.action_type === "update_context") {
      return await execUpdateContext(action.payload, tenant);
    }
    return { ok: false, message: "Tipo de acción no soportado." };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return { ok: false, message: `No pude aplicar el cambio: ${msg}` };
  }
}

async function execUpdatePrice(
  payload: UpdatePricePayload,
  tenant:  Tenant,
): Promise<ExecuteResult> {
  if (!tenant.google_sheet_id) {
    return { ok: false, message: "El tenant no tiene Google Sheet configurado." };
  }
  const result = await updateCell(
    tenant.google_sheet_id,
    tenant.google_sheet_range,
    payload.sheet_match,
    payload.column,
    payload.new_value,
  );
  return {
    ok: true,
    message: `Listo, cambié "${payload.column}" de "${result.previousValue || "(vacío)"}" a "${result.newValue}" en la fila "${payload.sheet_match}".`,
  };
}

async function execUpdateContext(
  payload: UpdateContextPayload,
  tenant:  Tenant,
): Promise<ExecuteResult> {
  const value = payload.content;
  const update =
    payload.field === "stories_context_general"  ? { stories_context_general:  value } :
    payload.field === "stories_context_keywords" ? { stories_context_keywords: value } :
    payload.field === "ads_context_general"      ? { ads_context_general:      value } :
                                                   { ads_context_keywords:     value };

  const { error } = await adminClient.from("tenants").update(update).eq("id", tenant.id);
  if (error) return { ok: false, message: `Error al guardar: ${error.message}` };

  return { ok: true, message: `Listo, actualicé ${CONTEXT_LABELS[payload.field]}.` };
}

const CONTEXT_LABELS: Record<UpdateContextPayload["field"], string> = {
  stories_context_general:  "el contexto general de stories",
  stories_context_keywords: "las palabras clave de stories",
  ads_context_general:      "el contexto general de ads",
  ads_context_keywords:     "las palabras clave de ads",
};
