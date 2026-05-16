"use client";

import { useState, useRef, useEffect } from "react";
import { MoreVertical, ArrowLeft, Phone, Video, ChevronRight, Hand, AlertCircle, Star, UserCircle } from "lucide-react";
import { toast } from "sonner";
import { AutomationToggle } from "./AutomationToggle";
import { ContactSheet } from "./ContactSheet";
import { getAvatarStyle, nameInitials, cn } from "@/lib/utils";
import type { Conversation } from "@/types/database.types";

type DealStatus = Conversation["deal_status"];

interface Props {
  conversation: Conversation;
  onToggle: (paused: boolean) => void;
  onConversationUpdate: (updated: Partial<Conversation>) => void;
  onBack?: () => void;
}

const DEAL_OPTIONS: { value: DealStatus; label: string }[] = [
  { value: "nuevo",           label: "Nuevo"           },
  { value: "contactado",      label: "Contactado"      },
  { value: "esperando_pago",  label: "Esp. pago"       },
  { value: "pago_pendiente",  label: "Pago pendiente"  },
  { value: "cerrado",         label: "Cerrado"         },
];

function displayPhone(phone: string) {
  return phone.replace("whatsapp:", "");
}

const iconBtnCls =
  "w-9 h-9 flex items-center justify-center rounded-full border border-line text-stone hover:text-ink hover:bg-cream transition-colors cursor-pointer";

function HeaderAvatar({ conv }: { conv: Conversation }) {
  const style = getAvatarStyle(conv.contact_phone);
  const initials = nameInitials(conv.contact_name, conv.contact_phone);
  return (
    <div className="relative flex-shrink-0">
      <div
        className="w-12 h-12 rounded-full flex items-center justify-center text-sm font-medium tracking-tight"
        style={{
          background: style.bg,
          color: style.fg,
          ...(style.ring ? { boxShadow: `0 0 0 2px ${style.ring}` } : {}),
        }}
      >
        {initials}
      </div>
      <span className="absolute bottom-0.5 right-0.5 w-3 h-3 bg-emerald-500 rounded-full ring-2 ring-cream-raised" />
    </div>
  );
}

function StatusBadges({ conv }: { conv: Conversation }) {
  const badges: React.ReactNode[] = [];

  if (conv.is_admin) {
    badges.push(
      <span
        key="admin"
        className="inline-flex items-center gap-1 text-[10px] font-medium px-2 py-0.5 rounded-full bg-accent-soft text-accent"
      >
        <Star size={8} />
        Admin
      </span>
    );
  }
  if (conv.paused_reason === "derived_to_human") {
    badges.push(
      <span
        key="derived"
        className="inline-flex items-center gap-1 text-[10px] font-medium px-2 py-0.5 rounded-full bg-accent-soft text-accent"
      >
        <AlertCircle size={8} />
        Derivado
      </span>
    );
  } else if (conv.automation_paused) {
    badges.push(
      <span
        key="manual"
        className="inline-flex items-center gap-1 text-[10px] font-medium px-2 py-0.5 rounded-full bg-stone/15 text-ink-soft"
      >
        <Hand size={8} />
        Manual
      </span>
    );
  }

  if (badges.length === 0) return null;
  return <div className="flex items-center gap-1">{badges}</div>;
}

function DealStatusPills({
  conversationId,
  current,
  onUpdate,
}: {
  conversationId: string;
  current: DealStatus;
  onUpdate: (status: DealStatus) => void;
}) {
  const [saving, setSaving] = useState<DealStatus | null>(null);

  async function handleClick(value: DealStatus) {
    if (value === current || saving) return;
    setSaving(value);
    onUpdate(value);
    try {
      const res = await fetch(`/api/chats/${conversationId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ deal_status: value }),
      });
      if (!res.ok) throw new Error("Error actualizando estado");
      toast.success("Estado actualizado");
    } catch {
      onUpdate(current);
      toast.error("No se pudo actualizar el estado");
    } finally {
      setSaving(null);
    }
  }

  return (
    <div className="flex items-center gap-1 flex-wrap">
      {DEAL_OPTIONS.map(({ value, label }) => {
        const isActive = value === current;
        return (
          <button
            key={value}
            onClick={() => handleClick(value)}
            disabled={!!saving}
            className={cn(
              "text-[11px] font-medium px-2.5 py-1 rounded-full border transition-colors duration-150 cursor-pointer",
              "disabled:cursor-wait",
              isActive
                ? "bg-ink text-cream border-ink"
                : "bg-transparent text-stone border-line hover:text-ink hover:border-stone/40"
            )}
          >
            {label}
          </button>
        );
      })}
    </div>
  );
}

export function ChatHeader({ conversation, onToggle, onConversationUpdate, onBack }: Props) {
  const [menuOpen, setMenuOpen]   = useState(false);
  const [sheetOpen, setSheetOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false);
      }
    }
    if (menuOpen) document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [menuOpen]);

  return (
    <>
      <div className="bg-cream-raised border-b border-line">
        {/* Row 1: avatar + name + actions */}
        <div className="flex items-center gap-3 px-5 py-3">
          {onBack && (
            <button
              onClick={onBack}
              className={`md:hidden ${iconBtnCls} flex-shrink-0`}
            >
              <ArrowLeft size={18} strokeWidth={1.8} />
            </button>
          )}

          <button
            onClick={() => setSheetOpen(true)}
            className="flex items-center gap-3.5 flex-1 min-w-0 text-left hover:opacity-80 transition-opacity cursor-pointer group"
          >
            <HeaderAvatar conv={conversation} />
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-1.5 mb-0.5">
                <p className="text-[16px] font-medium text-ink truncate leading-tight">
                  {conversation.contact_name ?? displayPhone(conversation.contact_phone)}
                </p>
                <ChevronRight
                  size={13}
                  className="text-stone flex-shrink-0 opacity-0 group-hover:opacity-100 transition-opacity"
                />
              </div>
              <div className="flex items-center gap-2 flex-wrap">
                <div className="flex items-center gap-1">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 flex-shrink-0" />
                  <span className="text-[11px] text-stone">En línea</span>
                </div>
                <span className="text-stone/50 text-[10px] select-none">·</span>
                <div className="flex items-center gap-1">
                  <Phone size={9} className="text-stone flex-shrink-0" strokeWidth={1.8} />
                  <span className="text-[11.5px] text-stone font-mono">
                    {displayPhone(conversation.contact_phone)}
                  </span>
                </div>
                <StatusBadges conv={conversation} />
              </div>
            </div>
          </button>

          <div className="flex items-center gap-2 flex-shrink-0">
            <button
              onClick={() => setSheetOpen(true)}
              title="Información del contacto"
              className={`hidden xl:flex ${iconBtnCls}`}
            >
              <UserCircle size={17} strokeWidth={1.8} />
            </button>
            <button
              disabled
              title="Llamada (próximamente)"
              className="hidden xl:flex w-9 h-9 items-center justify-center rounded-full border border-line text-stone/60 cursor-not-allowed"
            >
              <Phone size={15} strokeWidth={1.8} />
            </button>
            <button
              disabled
              title="Video (próximamente)"
              className="hidden xl:flex w-9 h-9 items-center justify-center rounded-full border border-line text-stone/60 cursor-not-allowed"
            >
              <Video size={15} strokeWidth={1.8} />
            </button>

            <AutomationToggle
              conversationId={conversation.id}
              initialPaused={conversation.automation_paused}
              onToggle={onToggle}
            />

            <div className="relative" ref={menuRef}>
              <button
                onClick={() => setMenuOpen((o) => !o)}
                className={iconBtnCls}
              >
                <MoreVertical size={16} strokeWidth={1.8} />
              </button>
              {menuOpen && (
                <div className="absolute right-0 top-full mt-2 w-52 bg-cream-raised border border-line rounded-2xl shadow-card-lg z-50 py-1.5 overflow-hidden">
                  <button
                    className="w-full px-4 py-2.5 text-[13px] text-left text-ink hover:bg-cream-soft transition-colors cursor-pointer"
                    onClick={() => { setSheetOpen(true); setMenuOpen(false); }}
                  >
                    Ver información
                  </button>
                  <button
                    className="w-full px-4 py-2.5 text-[13px] text-left text-ink hover:bg-cream-soft transition-colors cursor-pointer"
                    onClick={() => setMenuOpen(false)}
                  >
                    Marcar como leído
                  </button>
                  <div className="my-1 border-t border-line" />
                  <button
                    className="w-full px-4 py-2.5 text-[13px] text-left text-destructive hover:bg-cream-soft transition-colors cursor-pointer"
                    onClick={() => setMenuOpen(false)}
                  >
                    Archivar conversación
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Row 2: deal status pills */}
        <div className="px-5 pb-3">
          <DealStatusPills
            conversationId={conversation.id}
            current={conversation.deal_status}
            onUpdate={(status) => onConversationUpdate({ deal_status: status })}
          />
        </div>
      </div>

      <ContactSheet
        conversation={conversation}
        open={sheetOpen}
        onClose={() => setSheetOpen(false)}
        onSaved={onConversationUpdate}
      />
    </>
  );
}
