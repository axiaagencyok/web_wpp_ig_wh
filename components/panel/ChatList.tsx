"use client";

import { useEffect, useRef, useState } from "react";
import { useTheme } from "next-themes";
import { createClient } from "@/lib/supabase/client";
import { Search, Hand, Sun, Moon, Star, AlertCircle } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { avatarGradient, nameInitials } from "@/lib/utils";
import type { Conversation } from "@/types/database.types";

const DEAL_DOT: Record<Conversation["deal_status"], { color: string; label: string }> = {
  nuevo:           { color: "#A89E90", label: "Nuevo"          },
  contactado:      { color: "#8B5CF6", label: "Contactado"     },
  esperando_pago:  { color: "#D97706", label: "Esperando pago" },
  pago_pendiente:  { color: "#B45309", label: "Pago pendiente" },
  cerrado:         { color: "#65A30D", label: "Cerrado"        },
};

type ConvWithLastMsg = Conversation & {
  last_message: {
    body: string | null;
    sender: string;
    direction: string;
    media_type: string | null;
  } | null;
  custom_fields: Record<string, string> | null;
};

type Tab = "all" | "unread" | "unassigned";
type Channel = "whatsapp" | "instagram";

function formatTime(iso: string) {
  const d = new Date(iso);
  const now = new Date();
  if (d.toDateString() === now.toDateString()) {
    return d.toLocaleTimeString("es-AR", { hour: "2-digit", minute: "2-digit" });
  }
  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  if (d.toDateString() === yesterday.toDateString()) return "Ayer";
  return d.toLocaleDateString("es-AR", { day: "2-digit", month: "2-digit" });
}

function displayName(conv: ConvWithLastMsg) {
  if (conv.contact_name) return conv.contact_name;
  if (conv.contact_phone.startsWith("instagram:")) {
    const igUser = (conv.custom_fields as Record<string, string> | null)?.ig_username;
    return igUser ? `@${igUser}` : conv.contact_phone.replace("instagram:", "");
  }
  return conv.contact_phone.replace("whatsapp:", "");
}

function previewText(conv: ConvWithLastMsg) {
  const msg = conv.last_message;
  if (!msg) return "Sin mensajes";
  if (msg.media_type?.startsWith("image")) return "📷 Imagen";
  if (msg.media_type?.startsWith("audio")) return "🎤 Audio";
  if (msg.media_type?.startsWith("video")) return "🎥 Video";
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
      className="w-8 h-8 flex items-center justify-center rounded-full text-gray-400 hover:text-violet-600 hover:bg-violet-50 dark:hover:bg-violet-900/30 transition-all duration-200 cursor-pointer"
      title={isDark ? "Modo claro" : "Modo oscuro"}
    >
      {isDark ? <Sun size={15} /> : <Moon size={15} />}
    </button>
  );
}

function ContactAvatar({
  name,
  phone,
  isInstagram = false,
  size = "md",
}: {
  name: string | null;
  phone: string;
  isInstagram?: boolean;
  size?: "sm" | "md" | "lg";
}) {
  const gradient = avatarGradient(phone);
  const initials = nameInitials(name, phone);
  const dim =
    size === "lg" ? "w-13 h-13 text-sm" :
    size === "sm" ? "w-9 h-9 text-xs" :
    "w-12 h-12 text-sm";

  return (
    <div className="relative flex-shrink-0">
      <div
        className={`${dim} rounded-full flex items-center justify-center text-white font-bold shadow-md`}
        style={{ background: gradient }}
      >
        {initials}
      </div>
      {isInstagram ? (
        <span className="absolute bottom-0 right-0 w-3.5 h-3.5 rounded-full border-2 border-white dark:border-[#0F0B1F] flex items-center justify-center bg-gradient-to-br from-purple-500 via-pink-500 to-orange-400">
          <svg viewBox="0 0 24 24" fill="white" width="7" height="7"><path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zM12 0C8.741 0 8.333.014 7.053.072 2.695.272.273 2.69.073 7.052.014 8.333 0 8.741 0 12c0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98C8.333 23.986 8.741 24 12 24c3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98C15.668.014 15.259 0 12 0zm0 5.838a6.162 6.162 0 100 12.324 6.162 6.162 0 000-12.324zM12 16a4 4 0 110-8 4 4 0 010 8zm6.406-11.845a1.44 1.44 0 100 2.881 1.44 1.44 0 000-2.881z"/></svg>
        </span>
      ) : (
        <span className="absolute bottom-0 right-0 w-3.5 h-3.5 bg-green-500 rounded-full border-2 border-white dark:border-[#0F0B1F] flex-shrink-0" />
      )}
    </div>
  );
}

function StatusBadge({ conv }: { conv: ConvWithLastMsg }) {
  if (conv.paused_reason === "derived_to_human") {
    return (
      <span className="inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-full bg-violet-100 text-violet-700 dark:bg-violet-900/40 dark:text-violet-300">
        <AlertCircle size={8} />
        Derivado
      </span>
    );
  }
  if (conv.automation_paused) {
    return (
      <span className="inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-full bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400">
        <Hand size={8} />
        Manual
      </span>
    );
  }
  return null;
}

function SkeletonList() {
  return (
    <div className="space-y-1 px-3 py-2">
      {[0, 1, 2, 3, 4].map((i) => (
        <div key={i} className="flex items-center gap-3 px-3 py-4 rounded-2xl">
          <Skeleton className="h-12 w-12 rounded-full flex-shrink-0" />
          <div className="flex-1 space-y-2">
            <Skeleton className="h-3.5 w-3/4 rounded" />
            <Skeleton className="h-3 w-1/2 rounded" />
          </div>
          <Skeleton className="h-3 w-8 rounded" />
        </div>
      ))}
    </div>
  );
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
  const name = displayName(conv);
  const preview = previewText(conv);
  const firstTag = conv.tags?.[0] ?? null;

  return (
    <button
      onClick={() => onSelect(conv)}
      className={`
        w-full flex items-center gap-3.5 px-3 py-3.5 rounded-2xl text-left
        transition-all duration-200 cursor-pointer
        ${isSelected
          ? "bg-violet-50 border border-violet-200 shadow-sm dark:bg-violet-900/20 dark:border-violet-800"
          : "hover:bg-white hover:shadow-md dark:hover:bg-white/5 border border-transparent hover:border-gray-100 dark:hover:border-white/10"
        }
      `}
    >
      <ContactAvatar name={conv.contact_name} phone={conv.contact_phone} isInstagram={conv.channel === "instagram"} />

      <div className="flex-1 min-w-0">
        {/* Row 1: name + time */}
        <div className="flex items-center justify-between gap-2 mb-1">
          <span className={`text-[14.5px] font-semibold truncate leading-tight ${isSelected ? "text-violet-700 dark:text-violet-300" : "text-gray-900 dark:text-gray-100"}`}>
            {name}
          </span>
          <span className="text-[11px] text-gray-400 tabular-nums flex-shrink-0">
            {formatTime(conv.last_message_at)}
          </span>
        </div>

        {/* Row 2: preview + badges */}
        <div className="flex items-center justify-between gap-2">
          <span className="text-[12.5px] text-gray-400 dark:text-gray-500 truncate flex-1">
            {preview}
          </span>
          <div className="flex items-center gap-1.5 flex-shrink-0">
            <StatusBadge conv={conv} />
            {firstTag && !conv.automation_paused && (
              <span className="text-[9px] font-semibold px-2 py-0.5 rounded-full bg-violet-100 text-violet-600 dark:bg-violet-900/40 dark:text-violet-300">
                {firstTag}
              </span>
            )}
            {/* Deal status dot */}
            {(() => {
              const dot = DEAL_DOT[conv.deal_status] ?? DEAL_DOT["nuevo"];
              return (
                <span
                  title={dot.label}
                  className="w-2 h-2 rounded-full flex-shrink-0 ring-1 ring-white dark:ring-[#0F0B1F]"
                  style={{ backgroundColor: dot.color }}
                />
              );
            })()}
            {conv.unread_count > 0 && (
              <span className="bg-violet-600 text-white text-[10px] font-bold rounded-full min-w-[20px] h-5 flex items-center justify-center px-1.5 shadow-sm shadow-violet-200 dark:shadow-none">
                {conv.unread_count > 9 ? "9+" : conv.unread_count}
              </span>
            )}
          </div>
        </div>
      </div>
    </button>
  );
}

interface Props {
  selectedId: string | null;
  onSelect: (conv: ConvWithLastMsg) => void;
}

export function ChatList({ selectedId, onSelect }: Props) {
  const [conversations, setConversations] = useState<ConvWithLastMsg[]>([]);
  const [search, setSearch] = useState("");
  const [tab, setTab] = useState<Tab>("all");
  const [channel, setChannel] = useState<Channel>("whatsapp");
  const [loading, setLoading] = useState(true);
  const searchRef = useRef<HTMLInputElement>(null);

  async function load() {
    try {
      const res = await fetch("/api/chats");
      if (!res.ok) { setConversations([]); setLoading(false); return; }
      const data: unknown = await res.json();
      setConversations(Array.isArray(data) ? (data as ConvWithLastMsg[]) : []);
    } catch (e) {
      console.error("[ChatList]", e);
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

  const byChannel = conversations.filter((c) => c.channel === channel);

  const unreadCount  = byChannel.filter((c) => c.unread_count > 0).length;
  const derivedCount = byChannel.filter((c) => c.paused_reason === "derived_to_human").length;

  const searched = byChannel.filter((c) =>
    displayName(c).toLowerCase().includes(search.toLowerCase())
  );
  const filtered = searched.filter((c) => {
    if (tab === "unread")     return c.unread_count > 0;
    if (tab === "unassigned") return c.paused_reason === "derived_to_human";
    return true;
  });

  const adminConvs   = filtered.filter((c) => c.is_admin);
  const regularConvs = filtered.filter((c) => !c.is_admin);

  return (
    <div className="flex flex-col h-full bg-white dark:bg-[#0F0B1F]">
      {/* ── Header ── */}
      <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100 dark:border-[#2D2A45] bg-white dark:bg-[#1A1530]">
        <div>
          <h2 className="text-xl font-bold text-gray-900 dark:text-white tracking-tight">
            Conversaciones
          </h2>
          {conversations.length > 0 && (
            <p className="text-[11px] text-gray-400 mt-0.5">{conversations.length} chats</p>
          )}
        </div>
        <ThemeToggle />
      </div>

      {/* ── Channel selector ── */}
      <div className="flex items-center gap-1 px-4 pt-3 pb-1">
        <button
          onClick={() => setChannel("whatsapp")}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[12px] font-semibold transition-all duration-200 cursor-pointer ${
            channel === "whatsapp"
              ? "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300"
              : "text-gray-400 hover:text-green-600 hover:bg-green-50 dark:hover:bg-green-900/20"
          }`}
        >
          <svg viewBox="0 0 24 24" fill="currentColor" width="12" height="12"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/></svg>
          WhatsApp
        </button>
        <button
          onClick={() => setChannel("instagram")}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[12px] font-semibold transition-all duration-200 cursor-pointer ${
            channel === "instagram"
              ? "bg-pink-100 text-pink-700 dark:bg-pink-900/30 dark:text-pink-300"
              : "text-gray-400 hover:text-pink-600 hover:bg-pink-50 dark:hover:bg-pink-900/20"
          }`}
        >
          <svg viewBox="0 0 24 24" fill="currentColor" width="12" height="12"><path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zM12 0C8.741 0 8.333.014 7.053.072 2.695.272.273 2.69.073 7.052.014 8.333 0 8.741 0 12c0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98C8.333 23.986 8.741 24 12 24c3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98C15.668.014 15.259 0 12 0zm0 5.838a6.162 6.162 0 100 12.324 6.162 6.162 0 000-12.324zM12 16a4 4 0 110-8 4 4 0 010 8zm6.406-11.845a1.44 1.44 0 100 2.881 1.44 1.44 0 000-2.881z"/></svg>
          Instagram
        </button>
      </div>

      {/* ── Tabs ── */}
      <div className="flex items-center gap-1 px-4 pt-3 pb-0">
        {([
          { key: "all",        label: "Todas",       count: conversations.length },
          { key: "unread",     label: "No leídas",   count: unreadCount },
          { key: "unassigned", label: "Derivadas",   count: derivedCount },
        ] as { key: Tab; label: string; count: number }[]).map(({ key, label, count }) => (
          <button
            key={key}
            onClick={() => setTab(key)}
            className={`
              flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[12px] font-medium transition-all duration-200 cursor-pointer
              ${tab === key
                ? "text-violet-700 bg-violet-100 dark:bg-violet-900/40 dark:text-violet-300"
                : "text-gray-500 hover:text-violet-600 hover:bg-violet-50 dark:text-gray-400 dark:hover:bg-violet-900/20"
              }
            `}
          >
            {label}
            {count > 0 && (
              <span className={`text-[10px] font-bold min-w-[16px] h-4 flex items-center justify-center rounded-full px-1 ${
                tab === key
                  ? "bg-violet-600 text-white"
                  : "bg-gray-200 text-gray-500 dark:bg-gray-700 dark:text-gray-400"
              }`}>
                {count}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* ── Search ── */}
      <div className="px-4 py-3">
        <div className="flex items-center gap-2.5 bg-gray-50 dark:bg-white/5 border border-gray-200 dark:border-white/10 rounded-2xl px-3.5 py-2.5 shadow-sm transition-all duration-200 focus-within:ring-2 focus-within:ring-violet-300 focus-within:border-violet-300 focus-within:bg-white dark:focus-within:bg-white/10">
          <Search size={14} className="text-gray-400 flex-shrink-0" />
          <input
            ref={searchRef}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar conversaciones…"
            className="bg-transparent text-gray-800 dark:text-gray-100 text-[13.5px] placeholder:text-gray-400 outline-none flex-1 min-w-0"
          />
        </div>
      </div>

      {/* ── List ── */}
      <div className="flex-1 overflow-y-auto">
        {loading ? (
          <SkeletonList />
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center pt-16 gap-3">
            <div className="w-12 h-12 rounded-full bg-violet-50 dark:bg-violet-900/20 flex items-center justify-center">
              <Search size={18} className="text-violet-400" />
            </div>
            <div className="text-center">
              <p className="text-sm font-semibold text-gray-700 dark:text-gray-300">Sin resultados</p>
              <p className="text-xs text-gray-400 mt-0.5">Probá otro filtro o búsqueda</p>
            </div>
          </div>
        ) : (
          <div className="px-3 py-2 space-y-1">
            {/* Admin chats */}
            {adminConvs.length > 0 && (
              <>
                <div className="flex items-center gap-1.5 px-2 py-1.5 mt-1">
                  <Star size={9} className="text-violet-500" />
                  <span className="text-[10px] font-bold text-violet-500 uppercase tracking-widest">Admin</span>
                </div>
                {adminConvs.map((conv) => (
                  <ConvItem key={conv.id} conv={conv} isSelected={selectedId === conv.id} onSelect={onSelect} />
                ))}
                {regularConvs.length > 0 && (
                  <div className="flex items-center gap-1.5 px-2 py-1.5 mt-2">
                    <span className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">Clientes</span>
                  </div>
                )}
              </>
            )}
            {regularConvs.map((conv) => (
              <ConvItem key={conv.id} conv={conv} isSelected={selectedId === conv.id} onSelect={onSelect} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
