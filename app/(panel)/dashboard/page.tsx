"use client";

import { useState } from "react";
import { ChatList } from "@/components/panel/ChatList";
import { ChatWindow } from "@/components/panel/ChatWindow";
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
    <div className="flex h-full bg-background overflow-hidden">
      {/* ── Sidebar ── */}
      <div
        className={`
          flex-shrink-0 w-full md:w-[340px] lg:w-[380px]
          md:flex flex-col
          ${selected ? "hidden md:flex" : "flex"}
        `}
      >
        <ChatList selectedId={selected?.id ?? null} onSelect={handleSelect} />
      </div>

      {/* ── Main area ── */}
      <div
        className={`
          flex-1 min-w-0
          ${selected ? "flex" : "hidden md:flex"}
          flex-col
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
    <div className="flex flex-col items-center justify-center h-full gap-6 bg-muted/20 select-none">
      {/* Geometric SVG illustration */}
      <div className="relative">
        <svg width="120" height="100" viewBox="0 0 120 100" fill="none" xmlns="http://www.w3.org/2000/svg">
          {/* Main bubble */}
          <rect x="8" y="10" width="90" height="64" rx="16" className="fill-primary/10 stroke-primary/20" strokeWidth="1.5" />
          {/* Dots inside bubble */}
          <circle cx="35" cy="42" r="5" className="fill-primary/40" />
          <circle cx="53" cy="42" r="5" className="fill-primary/60" />
          <circle cx="71" cy="42" r="5" className="fill-primary/40" />
          {/* Tail */}
          <path d="M20 74 L8 88 L32 74" className="fill-primary/10 stroke-primary/20" strokeWidth="1.5" strokeLinejoin="round" />
          {/* Reply bubble (accent) */}
          <rect x="42" y="68" width="70" height="28" rx="10" className="fill-accent/10 stroke-accent/20" strokeWidth="1.5" />
          <circle cx="62" cy="82" r="3.5" className="fill-accent/40" />
          <circle cx="77" cy="82" r="3.5" className="fill-accent/60" />
          <circle cx="92" cy="82" r="3.5" className="fill-accent/40" />
        </svg>
      </div>

      <div className="text-center space-y-1.5 max-w-xs">
        <p className="font-display text-lg font-bold text-foreground tracking-tight">
          Fenoma
        </p>
        <p className="text-sm font-medium text-foreground/70">
          Seleccioná una conversación
        </p>
        <p className="text-xs text-muted-foreground">
          Tus chats de WhatsApp aparecen en el panel izquierdo
        </p>
      </div>
    </div>
  );
}
