"use client";

import { useEffect, useMemo, useState } from "react";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { ChatList } from "@/components/panel/ChatList";
import { ChatWindow } from "@/components/panel/ChatWindow";
import { FenomaMark } from "@/components/FenomaMark";
import { ColumnHeader } from "@/components/panel/ColumnHeader";
import { createClient } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";
import type { Conversation } from "@/types/database.types";

type ConvWithLastMsg = Conversation & {
  last_message: {
    body: string | null;
    sender: string;
    direction: string;
    media_type: string | null;
  } | null;
};

type Tab = "inbox" | "settings";

export default function InstagramPage() {
  const [tab, setTab] = useState<Tab>("inbox");
  const [selected, setSelected] = useState<Conversation | null>(null);

  function handleSelect(conv: ConvWithLastMsg) {
    setSelected(conv);
  }

  function handleConversationUpdate(updated: Partial<Conversation>) {
    if (!selected) return;
    setSelected((prev) => (prev ? { ...prev, ...updated } : null));
  }

  function handleBack() {
    setSelected(null);
  }

  return (
    <div className="flex-1 min-w-0 min-h-0 flex flex-col overflow-hidden">
      <header className="px-6 py-4 border-b border-line flex items-center justify-between bg-cream-raised">
        <div className="flex items-center gap-3">
          <IgGlyph className="size-5 text-foreground/70" />
          <h1 className="text-lg font-semibold">Instagram</h1>
        </div>
        <TabStrip tab={tab} onChange={setTab} />
      </header>

      {tab === "inbox" ? (
        <div className="flex flex-1 min-h-0 overflow-hidden">
          {/* List */}
          <div
            className={cn(
              "flex-shrink-0 w-full md:w-[320px] lg:w-[340px] md:flex flex-col",
              selected ? "hidden md:flex" : "flex"
            )}
          >
            <ChatList
              selectedId={selected?.id ?? null}
              onSelect={handleSelect}
              fixedChannel="instagram"
              title="Instagram"
            />
          </div>

          {/* Window */}
          <div
            className={cn(
              "flex-1 min-w-0 flex-col border-l border-line",
              selected ? "flex" : "hidden md:flex"
            )}
          >
            {selected ? (
              <ChatWindow
                key={selected.id}
                conversation={selected}
                onConversationUpdate={handleConversationUpdate}
                onBack={handleBack}
              />
            ) : (
              <InboxEmpty />
            )}
          </div>
        </div>
      ) : (
        <SettingsBody />
      )}
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

// ─── Empty inbox state ────────────────────────────────────────────────────────

function InboxEmpty() {
  return (
    <div className="flex flex-col items-center justify-center h-full px-6 select-none bg-cream-soft">
      <FenomaMark tone="auto" size={56} className="opacity-90" />
      <div className="flex items-center gap-3 mt-7 mb-5" aria-hidden="true">
        <span className="block w-10 h-px bg-line-strong" />
        <span className="text-stone text-[10px]">◆</span>
        <span className="block w-10 h-px bg-line-strong" />
      </div>
      <h2 className="font-display text-[28px] text-ink leading-tight text-center max-w-sm">
        Seleccioná una conversación
      </h2>
      <p className="text-[14px] text-stone mt-3 max-w-xs text-center leading-relaxed">
        Tus chats de Instagram aparecen acá para que respondas más rápido.
      </p>
    </div>
  );
}

// ─── Settings tab body ────────────────────────────────────────────────────────

function SettingsBody() {
  const supabase = useMemo(() => createClient(), []);
  const [enabled, setEnabled] = useState<boolean | null>(null);
  const [original, setOriginal] = useState<boolean | null>(null);
  const [saving, setSaving] = useState(false);

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
        .select("instagram_enabled")
        .eq("id", u.tenant_id)
        .maybeSingle();
      if (cancelled) return;
      const v = t?.instagram_enabled ?? false;
      setEnabled(v);
      setOriginal(v);
    })();
    return () => {
      cancelled = true;
    };
  }, [supabase]);

  if (enabled === null || original === null) {
    return (
      <div className="flex-1 flex items-center justify-center text-stone">
        <Loader2 size={20} className="animate-spin" />
      </div>
    );
  }

  const dirty = enabled !== original;

  async function save() {
    if (!dirty || saving) return;
    setSaving(true);
    try {
      const res = await fetch("/api/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ instagram_enabled: enabled }),
      });
      if (!res.ok) {
        const d = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(d.error ?? `HTTP ${res.status}`);
      }
      setOriginal(enabled);
      toast.success("Configuración guardada");
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="flex-1 overflow-y-auto">
      <div className="max-w-2xl mx-auto px-6 py-8 space-y-6">
        <div>
          <h2 className="font-display text-[20px] text-ink leading-tight">Instagram</h2>
          <p className="text-[13px] text-ink-soft mt-1 leading-relaxed">
            Conectado vía ManyChat. El canal recibe DMs, respuestas a stories, clicks en ads y comentarios en posts/reels.
          </p>
        </div>

        <div className="rounded-2xl border border-line bg-cream-raised p-5 shadow-card space-y-4">
          <label className="flex items-start gap-3 cursor-pointer">
            <input
              type="checkbox"
              checked={enabled}
              onChange={(e) => setEnabled(e.target.checked)}
              className="mt-1 size-4 accent-accent cursor-pointer"
            />
            <div className="flex-1">
              <div className="text-[14px] font-medium text-ink">Auto-respuesta de Instagram</div>
              <p className="text-[12px] text-ink-soft mt-1 leading-relaxed">
                Si está activado, el agente Cami / Matías responde automáticamente los mensajes nuevos. Desactivado, la sección "Instagram" desaparece del menú lateral.
              </p>
            </div>
          </label>
        </div>

        <div className="flex justify-end">
          <button
            type="button"
            onClick={save}
            disabled={!dirty || saving}
            className="inline-flex items-center gap-2 rounded-full bg-ink text-cream px-5 py-2 text-[13px] font-medium hover:bg-accent transition-colors disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-ink"
          >
            {saving ? <Loader2 size={14} className="animate-spin" /> : null}
            Guardar
          </button>
        </div>
      </div>
    </div>
  );
}

// Inline IG glyph (lucide 1.14 no exporta brand icons).
function IgGlyph({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden="true">
      <rect width="20" height="20" x="2" y="2" rx="5" />
      <path d="M16 11.37A4 4 0 1 1 12.63 8 4 4 0 0 1 16 11.37z" />
      <line x1="17.5" x2="17.51" y1="6.5" y2="6.5" />
    </svg>
  );
}

// Keep the ColumnHeader import alive for parity with the rest of the panel
// pages (mobile nav lives there) — used below for visual parity if needed.
void ColumnHeader;

export const dynamic = "force-dynamic";
