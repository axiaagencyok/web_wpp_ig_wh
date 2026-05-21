"use client";

import { useEffect, useMemo, useState } from "react";
import { Loader2, MessageSquare } from "lucide-react";
import { ColumnHeader } from "@/components/panel/ColumnHeader";
import { FenomaMark } from "@/components/FenomaMark";
import { createClient } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";

type Tab = "inbox" | "settings";

// Hook compartido: lee tenants.whatsapp_enabled del tenant del usuario logueado.
// Devuelve null mientras carga.
function useWhatsappEnabled(): boolean | null {
  const supabase = useMemo(() => createClient(), []);
  const [enabled, setEnabled] = useState<boolean | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        if (!cancelled) setEnabled(false);
        return;
      }
      const { data: u } = await supabase
        .from("users")
        .select("tenant_id")
        .eq("id", user.id)
        .maybeSingle();
      if (!u?.tenant_id) {
        if (!cancelled) setEnabled(false);
        return;
      }
      const { data: t } = await supabase
        .from("tenants")
        .select("whatsapp_enabled")
        .eq("id", u.tenant_id)
        .maybeSingle();
      if (!cancelled) setEnabled(t?.whatsapp_enabled ?? false);
    })();
    return () => {
      cancelled = true;
    };
  }, [supabase]);

  return enabled;
}

export default function WhatsAppPage() {
  const [tab, setTab] = useState<Tab>("inbox");
  const enabled = useWhatsappEnabled();

  return (
    <div className="flex-1 min-w-0 min-h-0 flex flex-col overflow-hidden">
      <header className="px-6 py-4 border-b border-line flex items-center justify-between bg-cream-raised">
        <div className="flex items-center gap-3">
          <MessageSquare className="size-5 text-foreground/70" />
          <h1 className="text-lg font-semibold">WhatsApp</h1>
        </div>
        <TabStrip tab={tab} onChange={setTab} />
      </header>

      {tab === "inbox" ? <InboxView enabled={enabled} /> : <SettingsBody enabled={enabled} />}
    </div>
  );
}

// ─── Tabs ─────────────────────────────────────────────────────────────────────

function TabStrip({ tab, onChange }: { tab: Tab; onChange: (t: Tab) => void }) {
  const items: { key: Tab; label: string }[] = [
    { key: "inbox", label: "Conversaciones" },
    { key: "settings", label: "Configuración" },
  ];
  return (
    <div className="flex gap-1">
      {items.map((it) => (
        <button
          key={it.key}
          onClick={() => onChange(it.key)}
          className={cn(
            "px-3 py-1.5 text-sm font-medium rounded-md transition-colors",
            tab === it.key
              ? "bg-accent-soft text-ink"
              : "text-ink-soft hover:text-ink hover:bg-cream-soft"
          )}
        >
          {it.label}
        </button>
      ))}
    </div>
  );
}

// ─── Inbox empty state — depende de whatsapp_enabled ─────────────────────────

function InboxView({ enabled }: { enabled: boolean | null }) {
  return (
    <div className="flex-1 flex flex-col items-center justify-center px-6 select-none bg-cream-soft">
      <FenomaMark tone="auto" size={56} className="opacity-90" />

      <div className="flex items-center gap-3 mt-7 mb-5" aria-hidden="true">
        <span className="block w-10 h-px bg-line-strong" />
        <span className="text-stone text-[10px]">◆</span>
        <span className="block w-10 h-px bg-line-strong" />
      </div>

      <h2 className="font-display text-[28px] text-ink leading-tight text-center max-w-sm">
        {enabled ? "Sin conversaciones todavía" : "WhatsApp no conectado"}
      </h2>
      <p className="text-[14px] text-stone mt-3 max-w-xs text-center leading-relaxed">
        {enabled
          ? "Tu número de WhatsApp está activo. Apenas un cliente escriba, lo vas a ver acá."
          : "Conectá una cuenta de WhatsApp Business para empezar a recibir mensajes acá."}
      </p>
    </div>
  );
}

// ─── Settings ─────────────────────────────────────────────────────────────────

function SettingsBody({ enabled }: { enabled: boolean | null }) {
  if (enabled === null) {
    return (
      <div className="flex-1 flex items-center justify-center text-stone">
        <Loader2 size={20} className="animate-spin" />
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-y-auto">
      <div className="max-w-2xl mx-auto px-6 py-8 space-y-6">
        <div>
          <h2 className="font-display text-[20px] text-ink leading-tight">WhatsApp</h2>
          <p className="text-[13px] text-ink-soft mt-1 leading-relaxed">
            {enabled
              ? "Tu cuenta de WhatsApp está conectada vía Twilio. El agente Mati responde automáticamente los mensajes que entran por este canal."
              : "Aún no conectaste una cuenta de WhatsApp para este tenant. Contactanos para activarla."}
          </p>
        </div>

        {/* Estado de conexión */}
        <div className="rounded-2xl border border-line bg-cream-raised p-5 shadow-card space-y-4">
          <div>
            <div className="text-[14px] font-medium text-ink">
              {enabled ? "Cuenta conectada" : "Conectar cuenta de WhatsApp Business"}
            </div>
            <p className="text-[12px] text-ink-soft mt-1 leading-relaxed">
              {enabled
                ? "La integración corre sobre Twilio (sandbox o número productivo). Los mensajes entran por el webhook y se enrutan al agente."
                : "Para conectar un número de WhatsApp, contactanos: configuramos Twilio + flow del agente."}
            </p>
          </div>
        </div>

        {/* Auto-respuesta toggle (informativo) */}
        <div className={cn(
          "rounded-2xl border border-line bg-cream-raised p-5 shadow-card",
          !enabled && "opacity-60"
        )}>
          <label className="flex items-start gap-3 cursor-not-allowed">
            <input
              type="checkbox"
              checked={enabled}
              disabled
              className="mt-1 size-4 accent-accent cursor-not-allowed"
            />
            <div className="flex-1">
              <div className="text-[14px] font-medium text-ink">Auto-respuesta de WhatsApp</div>
              <p className="text-[12px] text-ink-soft mt-1 leading-relaxed">
                {enabled
                  ? "El agente Mati está activo y responde mensajes nuevos automáticamente."
                  : "Cuando la integración esté activa, el agente Mati responde automáticamente. Por ahora este toggle queda inhabilitado."}
              </p>
            </div>
          </label>
        </div>
      </div>
    </div>
  );
}

void ColumnHeader;

export const dynamic = "force-dynamic";
