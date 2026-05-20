import { Resend } from "resend";
import type { Lead, Tenant } from "@/types/database.types";

/**
 * Notificación por mail cuando un lead califica (score >= umbral del caller).
 *
 * Comportamientos:
 * - Silent skip si `tenant.lead_notification_email` es NULL/empty.
 * - Silent skip + warning si `RESEND_API_KEY` no está seteada (no queremos que
 *   un flow del agente falle por un mail; el lead ya está guardado en DB).
 * - From: env `RESEND_FROM` o `"Fenoma Leads <leads@fenoma.agency>"`. Si el
 *   dominio `fenoma.agency` no está verificado en Resend, override con
 *   RESEND_FROM="Fenoma Leads <onboarding@resend.dev>" mientras se verifica.
 */
const DEFAULT_FROM = "Fenoma Leads <leads@fenoma.agency>";
const SCORE_BAR = (score: number | null | undefined): string => {
  const s = typeof score === "number" ? Math.max(0, Math.min(100, score)) : 0;
  const filled = Math.round(s / 10);
  return "█".repeat(filled) + "░".repeat(10 - filled);
};

export async function sendLeadNotification(lead: Lead, tenant: Pick<Tenant, "id" | "name" | "lead_notification_email">): Promise<{ sent: boolean; reason?: string }> {
  const to = tenant.lead_notification_email?.trim();
  if (!to) {
    return { sent: false, reason: "lead_notification_email-null" };
  }

  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    console.warn(
      `[resend] RESEND_API_KEY no seteada. Skipping notificación para lead #${lead.id} (tenant ${tenant.id}).`
    );
    return { sent: false, reason: "no-api-key" };
  }

  const from = process.env.RESEND_FROM?.trim() || DEFAULT_FROM;
  const resend = new Resend(apiKey);

  const score = lead.lead_score ?? 0;
  const subject = `🔥 Lead Instagram - Score ${score}`;
  const tag = lead.es_recurrente ? "🔁 Cliente recurrente" : "🆕 Cliente nuevo";

  const lines: string[] = [
    `${tag}`,
    ``,
    `📊 Score: ${score}/100  ${SCORE_BAR(score)}`,
    ``,
    `👤 Nombre:       ${lead.nombre ?? "—"}`,
    `📱 Instagram:    @${lead.instagram_user ?? "—"}`,
    `📍 Zona:         ${lead.zona ?? "—"}`,
    `🏗️ Tipo:         ${lead.tipo_proyecto ?? "—"}`,
    `📐 m² estimados: ${lead.m2_estimados ?? "—"}`,
    `🛒 Interés:      ${lead.producto_interes ?? "—"}`,
    `⏱️ Urgencia:     ${lead.urgencia ?? "—"}`,
  ];
  if (lead.es_recurrente) {
    lines.push(`🔁 Compras previas: ${lead.compras_anteriores}`);
  }
  lines.push(``, `📝 Resumen:`, lead.resumen_conversacion ?? "—");

  const text = lines.join("\n");
  // HTML simple — mantiene el formato monoespaciado para el bar de score.
  const html = `<pre style="font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:14px;line-height:1.45;white-space:pre-wrap;">${escapeHtml(text)}</pre>`;

  try {
    const { error } = await resend.emails.send({
      from,
      to,
      subject,
      text,
      html,
    });
    if (error) {
      console.error(`[resend] Error enviando lead #${lead.id}:`, error);
      return { sent: false, reason: error.message ?? "resend-error" };
    }
    return { sent: true };
  } catch (e) {
    console.error(`[resend] Excepción enviando lead #${lead.id}:`, (e as Error).message);
    return { sent: false, reason: (e as Error).message };
  }
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
