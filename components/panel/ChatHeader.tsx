"use client";

import { useState, useRef, useEffect } from "react";
import { MoreVertical, ArrowLeft, Phone } from "lucide-react";
import { AutomationToggle } from "./AutomationToggle";
import { avatarColor, phoneInitials } from "@/lib/utils";
import type { Conversation } from "@/types/database.types";

interface Props {
  conversation: Conversation;
  onToggle: (paused: boolean) => void;
  onBack?: () => void;
}

function displayPhone(phone: string) {
  return phone.replace("whatsapp:", "");
}

export function ChatHeader({ conversation, onToggle, onBack }: Props) {
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const color = avatarColor(conversation.contact_phone);
  const initials = phoneInitials(conversation.contact_phone);

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
    <div className="flex items-center gap-3 px-4 py-3 bg-card border-b border-border shadow-sm">
      {/* Back button (mobile only) */}
      {onBack && (
        <button
          onClick={onBack}
          className="md:hidden w-8 h-8 flex items-center justify-center rounded-lg hover:bg-muted text-muted-foreground hover:text-foreground transition-colors cursor-pointer flex-shrink-0"
        >
          <ArrowLeft size={18} />
        </button>
      )}

      {/* Avatar */}
      <div
        className="w-10 h-10 rounded-full flex items-center justify-center text-white text-[13px] font-semibold flex-shrink-0 shadow-sm"
        style={{ backgroundColor: color }}
      >
        {initials}
      </div>

      {/* Info */}
      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold text-foreground truncate leading-tight">
          {conversation.contact_name ?? displayPhone(conversation.contact_phone)}
        </p>
        <div className="flex items-center gap-1.5 mt-0.5">
          <Phone size={10} className="text-muted-foreground flex-shrink-0" />
          <p className="text-[11px] text-muted-foreground truncate font-mono">
            {displayPhone(conversation.contact_phone)}
          </p>
        </div>
      </div>

      {/* Actions */}
      <div className="flex items-center gap-2 flex-shrink-0">
        <AutomationToggle
          conversationId={conversation.id}
          initialPaused={conversation.automation_paused}
          onToggle={onToggle}
        />

        {/* Kebab menu */}
        <div className="relative" ref={menuRef}>
          <button
            onClick={() => setMenuOpen((o) => !o)}
            className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-muted text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
          >
            <MoreVertical size={16} />
          </button>

          {menuOpen && (
            <div className="absolute right-0 top-full mt-1.5 w-48 bg-card border border-border rounded-xl shadow-lg z-50 py-1 overflow-hidden animate-in fade-in slide-in-from-top-1 duration-150">
              <button
                className="w-full px-4 py-2.5 text-sm text-left text-foreground hover:bg-muted transition-colors cursor-pointer"
                onClick={() => setMenuOpen(false)}
              >
                Ver información
              </button>
              <button
                className="w-full px-4 py-2.5 text-sm text-left text-foreground hover:bg-muted transition-colors cursor-pointer"
                onClick={() => setMenuOpen(false)}
              >
                Marcar como leído
              </button>
              <div className="my-1 border-t border-border" />
              <button
                className="w-full px-4 py-2.5 text-sm text-left text-destructive hover:bg-destructive/5 transition-colors cursor-pointer"
                onClick={() => setMenuOpen(false)}
              >
                Archivar conversación
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
