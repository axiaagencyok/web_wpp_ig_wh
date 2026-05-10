"use client";

import { useEffect, useRef, useState } from "react";
import { useTheme } from "next-themes";
import { createClient } from "@/lib/supabase/client";
import { Search, Bot, AlertCircle, Hand, Sun, Moon, Star } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { avatarColor, phoneInitials } from "@/lib/utils";
import type { Conversation } from "@/types/database.types";

type ConvWithLastMsg = Conversation & {
  last_message: {
    body: string | null;
    sender: string;
    direction: string;
    media_type: string | null;
  } | null;
};

function formatTime(iso: string) {
  const d = new Date(iso);
  const now = new Date();
  const isToday = d.toDateString() === now.toDateString();
  if (isToday) return d.toLocaleTimeString("es-AR", { hour: "2-digit", minute: "2-digit" });
  return d.toLocaleDateString("es-AR", { day: "2-digit", month: "2-digit" });
}

function displayName(conv: ConvWithLastMsg) {
  return conv.contact_name ?? conv.contact_phone.replace("whatsapp:", "");
}

function previewText(conv: ConvWithLastMsg) {
  const msg = conv.last_message;
  if (!msg) return "";
  if (msg.media_type?.startsWith("image")) return "Imagen";
  if (msg.media_type?.startsWith("audio")) return "Audio";
  if (msg.media_type?.startsWith("video")) return "Video";
  return msg.body ?? "";
}

function ThemeToggle() {
  const { setTheme, resolvedTheme } = useTheme();
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  if (!mounted) return <div className="w-8 h-8" />;
  const isDark = resolvedTheme === "dark";
  return (
    <button
      onClick={() => setTheme(isDark ? "light" : "dark")}
      className="w-8 h-8 flex items-center justify-center rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted transition-colors duration-200 cursor-pointer"
      title={isDark ? "Cambiar a claro" : "Cambiar a oscuro"}
    >
      {isDark ? <Sun size={16} /> : <Moon size={16} />}
    </button>
  );
}

function StatusBadge({ conv }: { conv: ConvWithLastMsg }) {
  if (conv.paused_reason === "derived_to_human") {
    return (
      <span className="inline-flex items-center gap-1 text-[10px] font-medium px-1.5 py-0.5 rounded-full bg-violet-500/10 text-violet-600 dark:text-violet-400">
        <AlertCircle size={9} />
        Derivado
      </span>
    );
  }
  if (conv.automation_paused) {
    return (
      <span className="inline-flex items-center gap-1 text-[10px] font-medium px-1.5 py-0.5 rounded-full bg-amber-500/10 text-amber-600 dark:text-amber-400">
        <Hand size={9} />
        Manual
      </span>
    );
  }
  return null;
}

function ChatListSkeleton() {
  return (
    <div className="space-y-1 p-2">
      {[0, 1, 2, 3, 4].map((i) => (
        <div key={i} className="flex items-center gap-3 p-3 rounded-xl">
          <Skeleton className="h-11 w-11 rounded-full flex-shrink-0" />
          <div className="flex-1 space-y-2">
            <Skeleton className="h-3.5 w-3/4 rounded" />
            <Skeleton className="h-3 w-1/2 rounded" />
          </div>
          <Skeleton className="h-3 w-10 rounded" />
        </div>
      ))}
    </div>
  );
}

interface Props {
  selectedId: string | null;
  onSelect: (conv: ConvWithLastMsg) => void;
}

function ConvItem({
  conv,
  isSelected,
  onSelect,
}: {
  conv: ConvWithLastMsg;
  isSelected: boolean;
  onSelect: (c: ConvWithLastMsg) => void;
}) {
  const color    = avatarColor(conv.contact_phone);
  const initials = phoneInitials(conv.contact_phone);
  const name     = displayName(conv);
  const firstTag = conv.tags?.[0] ?? null;

  return (
    <button
      onClick={() => onSelect(conv)}
      className={`
        w-full flex items-center gap-3 px-3 py-3 rounded-xl text-left
        transition-all duration-200 cursor-pointer
        ${isSelected
          ? "bg-primary/10 shadow-sm"
          : "hover:bg-muted hover:scale-[1.005]"
        }
      `}
    >
      {/* Avatar */}
      <div
        className="w-11 h-11 rounded-full flex items-center justify-center text-white text-[13px] font-semibold flex-shrink-0 shadow-sm"
        style={{ backgroundColor: color }}
      >
        {initials}
      </div>

      {/* Content */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between gap-1 mb-0.5">
          <span className={`text-sm font-semibold truncate ${isSelected ? "text-primary" : "text-foreground"}`}>
            {name}
          </span>
          <span className="text-[11px] text-muted-foreground flex-shrink-0 font-mono tabular-nums">
            {formatTime(conv.last_message_at)}
          </span>
        </div>

        <div className="flex items-center justify-between gap-1">
          <div className="flex items-center gap-1.5 min-w-0">
            <span className="text-xs text-muted-foreground truncate">
              {previewText(conv)}
            </span>
            {firstTag && (
              <span className="inline-flex items-center text-[9px] font-medium px-1.5 py-0.5 rounded-full bg-primary/10 text-primary flex-shrink-0">
                {firstTag}
              </span>
            )}
          </div>
          <div className="flex items-center gap-1 flex-shrink-0">
            <StatusBadge conv={conv} />
            {conv.unread_count > 0 && (
              <span className="bg-primary text-primary-foreground text-[10px] font-bold rounded-full min-w-[18px] h-[18px] flex items-center justify-center px-1 animate-in zoom-in duration-200">
                {conv.unread_count > 9 ? "9+" : conv.unread_count}
              </span>
            )}
          </div>
        </div>
      </div>
    </button>
  );
}

export function ChatList({ selectedId, onSelect }: Props) {
  const [conversations, setConversations] = useState<ConvWithLastMsg[]>([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const searchRef = useRef<HTMLInputElement>(null);

  async function load() {
    try {
      const res = await fetch("/api/chats");
      if (!res.ok) { setConversations([]); setLoading(false); return; }
      const data: unknown = await res.json();
      setConversations(Array.isArray(data) ? (data as ConvWithLastMsg[]) : []);
    } catch (e) {
      console.error("[ChatList] fetch error:", e);
      setConversations([]);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, []);

  useEffect(() => {
    const supabase = createClient();
    const channel = supabase
      .channel("conversations-list")
      .on("postgres_changes", { event: "*", schema: "public", table: "conversations" }, () => load())
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "messages" }, () => load())
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, []);

  const filtered = conversations.filter((c) =>
    displayName(c).toLowerCase().includes(search.toLowerCase())
  );

  // Admin chat siempre primero
  const adminConvs   = filtered.filter((c) => c.is_admin);
  const regularConvs = filtered.filter((c) => !c.is_admin);

  return (
    <div className="flex flex-col h-full bg-background border-r border-border">
      {/* ── Header ── */}
      <div className="flex items-center justify-between px-4 py-3.5 border-b border-border">
        <div className="flex items-center gap-2.5">
          <div className="w-7 h-7 rounded-lg bg-primary flex items-center justify-center flex-shrink-0">
            <Bot size={14} className="text-primary-foreground" />
          </div>
          <div>
            <span className="font-display text-[15px] font-bold text-foreground tracking-tight leading-none">
              Fenoma
            </span>
            <span className="block text-[10px] text-muted-foreground leading-none mt-0.5">
              WhatsApp Agent
            </span>
          </div>
        </div>
        <ThemeToggle />
      </div>

      {/* ── Search ── */}
      <div className="px-3 py-2.5">
        <div className="flex items-center gap-2 bg-muted rounded-xl px-3 py-2 transition-all duration-200 focus-within:ring-2 focus-within:ring-primary/30 focus-within:bg-card">
          <Search size={14} className="text-muted-foreground flex-shrink-0" />
          <input
            ref={searchRef}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar conversaciones…"
            className="bg-transparent text-foreground text-sm placeholder:text-muted-foreground outline-none flex-1 min-w-0"
          />
        </div>
      </div>

      {/* ── Lista ── */}
      <div className="flex-1 overflow-y-auto">
        {loading ? (
          <ChatListSkeleton />
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center pt-16 gap-2">
            <div className="w-10 h-10 rounded-full bg-muted flex items-center justify-center">
              <Search size={16} className="text-muted-foreground" />
            </div>
            <p className="text-sm text-muted-foreground">Sin conversaciones</p>
          </div>
        ) : (
          <div className="p-2 space-y-0.5">
            {/* Admin chats — sticky section */}
            {adminConvs.length > 0 && (
              <>
                <div className="flex items-center gap-1.5 px-3 py-1">
                  <Star size={10} className="text-violet-500" />
                  <span className="text-[10px] font-semibold text-violet-500 uppercase tracking-wider">
                    Admin
                  </span>
                </div>
                {adminConvs.map((conv) => (
                  <div key={conv.id} className="relative">
                    {/* Admin badge overlay */}
                    <div className="absolute left-3 top-3 z-10">
                      <span className="inline-flex items-center gap-0.5 text-[9px] font-bold px-1.5 py-0.5 rounded-full bg-violet-500/15 text-violet-600 dark:text-violet-400 border border-violet-500/20">
                        <Star size={8} />
                        Admin
                      </span>
                    </div>
                    <ConvItem
                      conv={conv}
                      isSelected={selectedId === conv.id}
                      onSelect={onSelect}
                    />
                  </div>
                ))}
                {regularConvs.length > 0 && (
                  <div className="flex items-center gap-1.5 px-3 py-1 mt-1">
                    <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">
                      Clientes
                    </span>
                  </div>
                )}
              </>
            )}

            {/* Regular chats */}
            {regularConvs.map((conv) => (
              <ConvItem
                key={conv.id}
                conv={conv}
                isSelected={selectedId === conv.id}
                onSelect={onSelect}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
