"use client";

import { useState } from "react";
import { NavSidebar } from "@/components/panel/NavSidebar";
import { ChatList } from "@/components/panel/ChatList";
import { ChatWindow } from "@/components/panel/ChatWindow";
import { ContactPanel } from "@/components/panel/ContactPanel";
import { MessageSquare } from "lucide-react";
import type { Conversation } from "@/types/database.types";

type ConvWithLastMsg = Conversation & {
  last_message: {
    body: string | null;
    sender: string;
    direction: string;
    media_type: string | null;
  } | null;
};

export default function DashboardPage() {
  const [selected, setSelected] = useState<Conversation | null>(null);
  const [panelOpen, setPanelOpen] = useState(false);

  function handleSelect(conv: ConvWithLastMsg) {
    setSelected(conv);
    setPanelOpen(false); // reset panel when switching chat
  }

  function handleConversationUpdate(updated: Partial<Conversation>) {
    if (!selected) return;
    setSelected((prev) => (prev ? { ...prev, ...updated } : null));
  }

  function handleBack() {
    setSelected(null);
    setPanelOpen(false);
  }

  return (
    <div className="flex h-full overflow-hidden bg-[#F8F7FF] dark:bg-[#0F0B1F]">
      {/* ── Nav sidebar (desktop only) ── */}
      <NavSidebar />

      {/* ── Conversation list ── */}
      <div
        className={`
          flex-shrink-0 w-full md:w-[320px] lg:w-[340px]
          md:flex flex-col border-r border-gray-100 dark:border-[#2D2A45]
          ${selected ? "hidden md:flex" : "flex"}
        `}
      >
        <ChatList selectedId={selected?.id ?? null} onSelect={handleSelect} />
      </div>

      {/* ── Main chat area ── */}
      <div
        className={`
          flex-1 min-w-0 flex-col
          ${selected ? "flex" : "hidden md:flex"}
        `}
      >
        {selected ? (
          <ChatWindow
            key={selected.id}
            conversation={selected}
            onConversationUpdate={handleConversationUpdate}
            onBack={handleBack}
            onInfoToggle={() => setPanelOpen((o) => !o)}
          />
        ) : (
          <EmptyState />
        )}
      </div>

      {/* ── Contact panel — toggled right column (xl+) ── */}
      {selected && panelOpen && (
        <div className="hidden xl:flex flex-col flex-shrink-0 w-[296px] border-l border-gray-100 dark:border-[#2D2A45] bg-white dark:bg-[#0F0B1F]">
          <ContactPanel
            key={selected.id}
            conversation={selected}
            onSaved={handleConversationUpdate}
            onClose={() => setPanelOpen(false)}
          />
        </div>
      )}
    </div>
  );
}

function EmptyState() {
  return (
    <div className="flex flex-col items-center justify-center h-full gap-8 bg-[#F8F5EF] dark:bg-[#0A0818] select-none px-6">
      <div className="flex flex-col items-center gap-5">
        {/* Icon container */}
        <div className="w-20 h-20 rounded-3xl bg-gradient-to-br from-violet-500 to-fuchsia-500 flex items-center justify-center shadow-[0_12px_40px_rgba(124,58,237,0.30)]">
          <MessageSquare size={36} className="text-white" strokeWidth={1.5} />
        </div>

        {/* Text */}
        <div className="text-center space-y-2">
          <h2 className="text-2xl font-bold text-gray-800 dark:text-gray-100 tracking-tight">
            Seleccioná una conversación
          </h2>
          <p className="text-[15px] text-gray-400 dark:text-gray-500 max-w-xs leading-relaxed">
            Tus chats de WhatsApp aparecerán acá para que puedas responder más rápido.
          </p>
        </div>

        {/* Subtle brand mark */}
        <div className="flex items-center gap-2 mt-2 opacity-30 dark:opacity-20">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/brand/Fenoma%20Simbolo%20PNG.png"
            alt=""
            width={18}
            height={18}
            className="object-contain dark:invert"
            aria-hidden="true"
          />
          <span className="font-display text-sm font-semibold text-gray-600 dark:text-gray-300 italic">
            Fenoma
          </span>
        </div>
      </div>
    </div>
  );
}
