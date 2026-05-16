"use client";

import { useState } from "react";
import { ChatList } from "@/components/panel/ChatList";
import { ChatWindow } from "@/components/panel/ChatWindow";
import { FenomaMark } from "@/components/FenomaMark";
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
    <div className="flex flex-1 min-h-0 overflow-hidden">
      {/* Conversation list */}
      <div
        className={`
          flex-shrink-0 w-full md:w-[320px] lg:w-[340px]
          md:flex flex-col
          ${selected ? "hidden md:flex" : "flex"}
        `}
      >
        <ChatList selectedId={selected?.id ?? null} onSelect={handleSelect} />
      </div>

      {/* Chat window */}
      <div
        className={`
          flex-1 min-w-0 flex-col border-l border-line
          ${selected ? "flex" : "hidden md:flex"}
        `}
      >
        {selected ? (
          <ChatWindow
            key={selected.id}
            conversation={selected}
            onConversationUpdate={handleConversationUpdate}
            onBack={handleBack}
          />
        ) : (
          <EmptyState />
        )}
      </div>
    </div>
  );
}

function EmptyState() {
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
        Tus chats aparecen acá para que respondas más rápido.
      </p>
    </div>
  );
}
