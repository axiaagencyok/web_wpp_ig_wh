"use client";

import { useState, useRef, useEffect } from "react";
import { MoreVertical, ArrowLeft, Phone, Video, ChevronRight, Hand, AlertCircle, Star, Wifi, UserCircle } from "lucide-react";
import { toast } from "sonner";
import { AutomationToggle } from "./AutomationToggle";
import { ContactSheet } from "./ContactSheet";
import { avatarGradient, nameInitials } from "@/lib/utils";
import type { Conversation } from "@/types/database.types";

type DealStatus = Conversation["deal_status"];

interface Props {
  conversation: Conversation;
  onToggle: (paused: boolean) => void;
  onConversationUpdate: (updated: Partial<Conversation>) => void;
  onBack?: () => void;
  onInfoToggle?: () => void;
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

function HeaderAvatar({ conv }: { conv: Conversation }) {
  const gradient = avatarGradient(conv.contact_phone);
  const initials = nameInitials(conv.contact_name, conv.contact_phone);
  return (
    <div className="relative flex-shrink-0">
      <div
        className="w-12 h-12 rounded-full flex items-center justify-center text-white text-sm font-bold shadow-md"
        style={{ background: gradient }}
      >
        {initials}
      </div>
      <span className="absolute bottom-0.5 right-0.5 w-3 h-3 bg-green-500 rounded-full border-2 border-white dark:border-[#1A1530]" />
    </div>
  );
}

function StatusBadges({ conv }: { conv: Conversation }) {
  const badges: React.ReactNode[] = [];

  if (conv.is_admin) {
    badges.push(
      <span key="admin" className="inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-full bg-violet-100 text-violet-700 dark:bg-violet-900/40 dark:text-violet-300">
        <Star size={8} />
        Admin
      </span>
    );
  }
  if (conv.paused_reason === "derived_to_human") {
    badges.push(
      <span key="derived" className="inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-full bg-violet-100 text-violet-700 dark:bg-violet-900/40 dark:text-violet-300">
        <AlertCircle size={8} />
        Derivado
      </span>
    );
  } else if (conv.automation_paused) {
    badges.push(
      <span key="manual" className="inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-full bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400">
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
    onUpdate(value); // optimistic
    try {
      const res = await fetch(`/api/chats/${conversationId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ deal_status: value }),
      });
      if (!res.ok) throw new Error("Error actualizando estado");
      toast.success("Estado actualizado");
    } catch {
      onUpdate(current); // rollback
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
            className={`
              text-[11px] font-semibold px-2.5 py-1 rounded-full border transition-all duration-150 cursor-pointer
              disabled:cursor-wait
              ${isActive
                ? "bg-violet-600 text-white border-violet-600 shadow-sm shadow-violet-200 dark:shadow-none"
                : "bg-transparent text-gray-400 border-gray-200 dark:border-[#2D2A45] hover:border-violet-300 hover:text-violet-600 dark:hover:border-violet-700 dark:hover:text-violet-400"
              }
            `}
          >
            {label}
          </button>
        );
      })}
    </div>
  );
}

export function ChatHeader({ conversation, onToggle, onConversationUpdate, onBack, onInfoToggle }: Props) {
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
      <div className="bg-white dark:bg-[#1A1530] border-b border-gray-100 dark:border-[#2D2A45] shadow-sm">
        {/* Row 1: avatar + name + actions */}
        <div className="flex items-center gap-3 px-5 py-3">
          {onBack && (
            <button
              onClick={onBack}
              className="md:hidden w-9 h-9 flex items-center justify-center rounded-full border border-gray-200 text-gray-500 hover:bg-violet-50 hover:text-violet-700 hover:border-violet-200 transition-all duration-200 cursor-pointer flex-shrink-0"
            >
              <ArrowLeft size={18} />
            </button>
          )}

          <button
            onClick={() => setSheetOpen(true)}
            className="flex items-center gap-3.5 flex-1 min-w-0 text-left hover:opacity-80 transition-opacity cursor-pointer group"
          >
            <HeaderAvatar conv={conversation} />
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-1.5 mb-0.5">
                <p className="text-[16px] font-bold text-gray-900 dark:text-white truncate leading-tight">
                  {conversation.contact_name ?? displayPhone(conversation.contact_phone)}
                </p>
                <ChevronRight size={13} className="text-gray-400 flex-shrink-0 opacity-0 group-hover:opacity-100 transition-opacity" />
              </div>
              <div className="flex items-center gap-2 flex-wrap">
                <div className="flex items-center gap-1">
                  <Wifi size={9} className="text-green-500 flex-shrink-0" />
                  <span className="text-[11px] font-medium text-green-600 dark:text-green-400">
                    En línea
                  </span>
                </div>
                <span className="text-gray-300 dark:text-gray-700 text-[10px] select-none">·</span>
                <div className="flex items-center gap-1">
                  <Phone size={9} className="text-gray-400 flex-shrink-0" />
                  <span className="text-[11.5px] text-gray-400 font-mono">
                    {displayPhone(conversation.contact_phone)}
                  </span>
                </div>
                <StatusBadges conv={conversation} />
              </div>
            </div>
          </button>

          <div className="flex items-center gap-2 flex-shrink-0">
            {/* Info toggle — xl only, opens/closes ContactPanel */}
            {onInfoToggle && (
              <button
                onClick={onInfoToggle}
                title="Info del contacto"
                className="hidden xl:flex w-9 h-9 items-center justify-center rounded-full border border-gray-200 dark:border-[#2D2A45] text-gray-500 hover:text-violet-700 hover:bg-violet-50 hover:border-violet-200 dark:hover:bg-violet-900/20 dark:hover:text-violet-300 transition-all duration-200 cursor-pointer"
              >
                <UserCircle size={17} />
              </button>
            )}
            {/* Decorative call/video buttons */}
            <button
              disabled
              title="Llamada (próximamente)"
              className="hidden xl:flex w-9 h-9 items-center justify-center rounded-full border border-gray-200 dark:border-[#2D2A45] text-gray-400 cursor-not-allowed opacity-50"
            >
              <Phone size={15} />
            </button>
            <button
              disabled
              title="Video (próximamente)"
              className="hidden xl:flex w-9 h-9 items-center justify-center rounded-full border border-gray-200 dark:border-[#2D2A45] text-gray-400 cursor-not-allowed opacity-50"
            >
              <Video size={15} />
            </button>
            <AutomationToggle
              conversationId={conversation.id}
              initialPaused={conversation.automation_paused}
              onToggle={onToggle}
            />
            <div className="relative" ref={menuRef}>
              <button
                onClick={() => setMenuOpen((o) => !o)}
                className="w-9 h-9 flex items-center justify-center rounded-full border border-gray-200 dark:border-[#2D2A45] text-gray-500 hover:bg-violet-50 hover:text-violet-700 hover:border-violet-200 dark:hover:bg-violet-900/20 dark:hover:text-violet-300 transition-all duration-200 cursor-pointer"
              >
                <MoreVertical size={16} />
              </button>
              {menuOpen && (
                <div className="absolute right-0 top-full mt-2 w-52 bg-white dark:bg-[#1A1530] border border-gray-100 dark:border-[#2D2A45] rounded-2xl shadow-[0_12px_40px_rgba(17,24,39,0.12)] z-50 py-1.5 overflow-hidden">
                  <button
                    className="w-full px-4 py-2.5 text-[13px] text-left text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-white/5 transition-colors cursor-pointer font-medium"
                    onClick={() => { setSheetOpen(true); setMenuOpen(false); }}
                  >
                    Ver información
                  </button>
                  <button
                    className="w-full px-4 py-2.5 text-[13px] text-left text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-white/5 transition-colors cursor-pointer font-medium"
                    onClick={() => setMenuOpen(false)}
                  >
                    Marcar como leído
                  </button>
                  <div className="my-1 border-t border-gray-100 dark:border-[#2D2A45]" />
                  <button
                    className="w-full px-4 py-2.5 text-[13px] text-left text-red-500 hover:bg-red-50 dark:hover:bg-red-900/10 transition-colors cursor-pointer font-medium"
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
