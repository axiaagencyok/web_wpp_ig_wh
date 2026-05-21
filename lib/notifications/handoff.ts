// Envío de mail al derivar un chat a humano. Independiente del mail de
// leads (lead_notification_email): este se dispara desde el agente cuando
// la conv pasa a `automation_paused=true` por `paused_reason='derived_to_human'`.
//
// Anti-spam: si el mismo chat se derivó hace < 60 min, skipea silencioso.

import { Resend } from "resend";
import { adminClient } from "@/lib/supabase/admin";
import { generateHandoffSummary } from "./handoff-summary";
import type { Tenant, Conversation } from "@/types/database.types";

const DEFAULT_FROM = "Fenoma Leads <leads@fenoma.agency>";
const ANTI_SPAM_MIN = 60; // minutos entre mails de handoff por chat.

export interface HandoffEmailResult {
  sent:    boolean;
  reason?: string;
}

export interface HandoffTenantInfo {
  id:    Tenant["id"];
  name:  Tenant["name"];
  handoff_notification_email:    Tenant["handoff_notification_email"];
  handoff_notifications_enabled: Tenant["handoff_notifications_enabled"];
}

export interface HandoffConversationInfo {
  id:                    Conversation["id"];
  contact_name:          Conversation["contact_name"];
  contact_phone:         Conversation["contact_phone"];
  channel:               Conversation["channel"];
  last_handoff_email_at: Conversation["last_handoff_email_at"];
  /**
   * Sólo Instagram: handle del cliente (sin "@"). Lo extrae el caller de
   * `conversation.custom_fields.ig_username` (lo guarda ManyChat en el
   * webhook). Si está presente, se usa como label primario del cliente en
   * subject y body para que el supervisor sepa a quién contactar sin tener
   * que abrir el panel.
   */
  ig_username?:          string | null;
}

export async function sendHandoffEmail(
  tenant: HandoffTenantInfo,
  conv:   HandoffConversationInfo,
): Promise<HandoffEmailResult> {
  // ── Toggle del tenant ─────────────────────────────────────────────────
  if (!tenant.handoff_notifications_enabled) {
    return { sent: false, reason: "disabled-by-tenant" };
  }

  const to = tenant.handoff_notification_email?.trim();
  if (!to) {
    return { sent: false, reason: "no-email-configured" };
  }

  // ── Anti-spam: 60 min entre mails por chat ────────────────────────────
  if (conv.last_handoff_email_at) {
    const minsSince =
      (Date.now() - new Date(conv.last_handoff_email_at).getTime()) / 60_000;
    if (minsSince < ANTI_SPAM_MIN) {
      console.log(
        `[handoff] Skip mail — última notificación hace ${Math.round(minsSince)}min para conv ${conv.id}`,
      );
      return { sent: false, reason: "rate-limited" };
    }
  }

  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    console.warn(
      `[handoff] RESEND_API_KEY no seteada. Skip handoff mail para conv ${conv.id}.`,
    );
    return { sent: false, reason: "no-api-key" };
  }

  // ── Resumen LLM-generated ─────────────────────────────────────────────
  const { summary, lastClientMessage } = await generateHandoffSummary({
    conversationId: conv.id,
  });

  // ── Subject + body ────────────────────────────────────────────────────
  // En IG preferimos @ig_username como label principal: el supervisor abre
  // Instagram, no nuestro panel, así que el handle es lo accionable. Si no
  // hay handle (caso WPP o IG sin custom field cargado) caemos a
  // contact_name → contact_phone.
  const igHandle = conv.ig_username?.trim() || null;
  const clientLabel =
    conv.channel === "instagram" && igHandle
      ? `@${igHandle}`
      : conv.contact_name?.trim() || conv.contact_phone;
  const motivo =
    lastClientMessage.length > 60
      ? `${lastClientMessage.slice(0, 60)}…`
      : lastClientMessage || "derivación a humano";
  const subject = `Chat derivado: ${clientLabel} — ${motivo}`;

  const panelBase =
    process.env.PANEL_PUBLIC_URL?.replace(/\/$/, "") ??
    (process.env.PROD_DOMAIN ? `https://${process.env.PROD_DOMAIN}` : "");
  const panelLink = panelBase ? `${panelBase}/instagram` : "";
  const channelLabel = conv.channel === "instagram" ? "Instagram" : "WhatsApp";

  const igLine = igHandle ? `<p><strong>Instagram:</strong> @${escapeHtml(igHandle)}</p>` : "";
  const nameLine = conv.contact_name?.trim()
    ? `<p><strong>Nombre:</strong> ${escapeHtml(conv.contact_name.trim())}</p>`
    : "";

  const html = `
<div style="font-family:ui-sans-serif,system-ui;font-size:14px;line-height:1.55;color:#2a2a2a;max-width:560px">
  <p style="font-size:13px;color:#6b7280;margin:0 0 8px 0">${tenant.name} · ${channelLabel}</p>
  <h2 style="margin:0 0 12px 0;font-size:18px;font-weight:600">Chat derivado a humano</h2>
  <p><strong>Cliente:</strong> ${escapeHtml(clientLabel)}</p>
  ${igLine}
  ${igHandle ? nameLine : ""}
  ${lastClientMessage ? `<p><strong>Último mensaje del cliente:</strong><br><span style="color:#444;font-style:italic">${escapeHtml(lastClientMessage)}</span></p>` : ""}
  <p><strong>Resumen:</strong><br>${escapeHtml(summary).replace(/\n/g, "<br>")}</p>
  ${panelLink ? `<p style="margin-top:18px"><a href="${panelLink}" style="background:#2a2a2a;color:#fff;padding:9px 16px;border-radius:8px;text-decoration:none;font-size:13px;display:inline-block">Abrir panel</a></p>` : ""}
</div>
`.trim();

  const text = [
    `Chat derivado a humano — ${tenant.name} (${channelLabel})`,
    ``,
    `Cliente: ${clientLabel}`,
    igHandle ? `Instagram: @${igHandle}` : "",
    igHandle && conv.contact_name?.trim() ? `Nombre: ${conv.contact_name.trim()}` : "",
    lastClientMessage ? `Último mensaje: ${lastClientMessage}` : "",
    ``,
    `Resumen:`,
    summary,
    panelLink ? `\nPanel: ${panelLink}` : "",
  ]
    .filter(Boolean)
    .join("\n");

  // ── Envío ─────────────────────────────────────────────────────────────
  const from = process.env.RESEND_FROM?.trim() || DEFAULT_FROM;
  const resend = new Resend(apiKey);

  try {
    const { error } = await resend.emails.send({ from, to, subject, text, html });
    if (error) {
      console.error(`[handoff] Error enviando mail para conv ${conv.id}:`, error);
      return { sent: false, reason: error.message ?? "resend-error" };
    }
  } catch (e) {
    console.error(`[handoff] Excepción enviando mail para conv ${conv.id}:`, (e as Error).message);
    return { sent: false, reason: (e as Error).message };
  }

  // ── Stamp anti-spam ───────────────────────────────────────────────────
  await adminClient
    .from("conversations")
    .update({ last_handoff_email_at: new Date().toISOString() })
    .eq("id", conv.id);

  return { sent: true };
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
