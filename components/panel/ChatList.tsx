"use client";

import { useEffect, useId, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { Search, Hand, AlertCircle } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { getAvatarStyle, nameInitials, cn } from "@/lib/utils";
import { toast } from "sonner";
import { ColumnHeader } from "@/components/panel/ColumnHeader";
import type { Conversation } from "@/types/database.types";

const DEAL_DOT: Record<Conversation["deal_status"], { color: string; label: string }> = {
  nuevo:           { color: "#A89E90", label: "Nuevo"          },
  contactado:      { color: "#4A4560", label: "Contactado"     },
  esperando_pago:  { color: "#B89066", label: "Esperando pago" },
  pago_pendiente:  { color: "#8E6E47", label: "Pago pendiente" },
  cerrado:         { color: "#7A8569", label: "Cerrado"        },
};

type ConvWithLastMsg = Conversation & {
  last_message: {
    body: string | null;
    sender: string;
    direction: string;
    media_type: string | null;
  } | null;
  custom_fields: Record<string, string> | null;
  avatar_url?: string | null;
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

function WaIcon({ size = 12, active = false }: { size?: number; active?: boolean }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill={active ? "#25D366" : "currentColor"}
      width={size}
      height={size}
      aria-hidden="true"
    >
      <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/>
    </svg>
  );
}

function IgIcon({ size = 12, active = false }: { size?: number; active?: boolean }) {
  const gid = useId();
  const gradientId = `ig-grad-${gid}`;
  return (
    <svg
      viewBox="0 0 24 24"
      fill={active ? `url(#${gradientId})` : "currentColor"}
      width={size}
      height={size}
      aria-hidden="true"
    >
      {active && (
        <defs>
          <linearGradient id={gradientId} x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#F58529" />
            <stop offset="50%" stopColor="#DD2A7B" />
            <stop offset="100%" stopColor="#8134AF" />
          </linearGradient>
        </defs>
      )}
      <path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zM12 0C8.741 0 8.333.014 7.053.072 2.695.272.273 2.69.073 7.052.014 8.333 0 8.741 0 12c0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98C8.333 23.986 8.741 24 12 24c3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98C15.668.014 15.259 0 12 0zm0 5.838a6.162 6.162 0 100 12.324 6.162 6.162 0 000-12.324zM12 16a4 4 0 110-8 4 4 0 010 8zm6.406-11.845a1.44 1.44 0 100 2.881 1.44 1.44 0 000-2.881z"/>
    </svg>
  );
}

function ContactAvatar({
  name,
  phone,
  avatarUrl,
  isInstagram = false,
  size = "md",
}: {
  name: string | null;
  phone: string;
  avatarUrl?: string | null;
  isInstagram?: boolean;
  size?: "sm" | "md" | "lg";
}) {
  const style = getAvatarStyle(phone);
  const initials = nameInitials(name, phone);
  const dim =
    size === "lg" ? "w-13 h-13 text-sm" :
    size === "sm" ? "w-9 h-9 text-xs" :
    "w-11 h-11 text-[13px]";

  return (
    <div className="relative flex-shrink-0">
      {avatarUrl ? (
        /* eslint-disable-next-line @next/next/no-img-element */
        <img
          src={avatarUrl}
          alt=""
          className={`${dim} rounded-full object-cover`}
          style={style.ring ? { boxShadow: `0 0 0 2px ${style.ring}` } : undefined}
        />
      ) : (
        <div
          className={`${dim} rounded-full flex items-center justify-center font-medium tracking-tight`}
          style={{
            background: style.bg,
            color: style.fg,
            ...(style.ring ? { boxShadow: `0 0 0 2px ${style.ring}` } : {}),
          }}
        >
          {initials}
        </div>
      )}
      {isInstagram ? (
        <span className="absolute -bottom-0.5 -right-0.5 w-4 h-4 rounded-full bg-cream-raised flex items-center justify-center text-stone ring-2 ring-cream-raised">
          <IgIcon size={9} />
        </span>
      ) : (
        <span className="absolute bottom-0 right-0 w-3 h-3 bg-emerald-500 rounded-full ring-2 ring-cream-raised flex-shrink-0" />
      )}
    </div>
  );
}

function StatusBadge({ conv }: { conv: ConvWithLastMsg }) {
  if (conv.paused_reason === "derived_to_human") {
    return (
      <span className="inline-flex items-center gap-1 text-[10px] font-medium px-2 py-0.5 rounded-full bg-accent-soft text-accent">
        <AlertCircle size={8} />
        Derivado
      </span>
    );
  }
  if (conv.automation_paused) {
    return (
      <span className="inline-flex items-center gap-1 text-[10px] font-medium px-2 py-0.5 rounded-full bg-stone/15 text-ink-soft">
        <Hand size={8} />
        Manual
      </span>
    );
  }
  return null;
}

function SkeletonList() {
  return (
    <div className="py-2">
      {[0, 1, 2, 3, 4].map((i) => (
        <div key={i} className="flex items-center gap-3.5 px-5 py-3 border-b border-line/60 last:border-b-0">
          <Skeleton className="h-11 w-11 rounded-full flex-shrink-0" />
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
  const avatarUrl = conv.avatar_url ?? null;

  return (
    <button
      onClick={() => onSelect(conv)}
      className={cn(
        "relative w-full flex items-center gap-3.5 px-5 py-3 text-left cursor-pointer",
        "transition-colors duration-200",
        "border-b border-line/60 last:border-b-0",
        isSelected ? "bg-cream-soft" : "hover:bg-cream/60"
      )}
    >
      {isSelected && (
        <span
          aria-hidden="true"
          className="absolute left-0 top-1/2 -translate-y-1/2 w-[2px] h-9 rounded-full bg-accent"
        />
      )}

      <ContactAvatar
        name={conv.contact_name}
        phone={conv.contact_phone}
        avatarUrl={avatarUrl}
        isInstagram={conv.channel === "instagram"}
      />

      <div className="flex-1 min-w-0">
        {/* Row 1: name + time */}
        <div className="flex items-center justify-between gap-2 mb-1">
          <span className="text-[14px] font-medium text-ink truncate leading-tight">
            {name}
          </span>
          <span className="text-[11px] text-stone tabular-nums flex-shrink-0">
            {formatTime(conv.last_message_at)}
          </span>
        </div>

        {/* Row 2: preview + badges */}
        <div className="flex items-center justify-between gap-2">
          <span className="text-[12.5px] text-stone truncate flex-1 leading-snug">
            {preview}
          </span>
          <div className="flex items-center gap-1.5 flex-shrink-0">
            <StatusBadge conv={conv} />
            {firstTag && !conv.automation_paused && (
              <span className="text-[9px] font-medium px-2 py-0.5 rounded-full bg-stone/15 text-ink-soft">
                {firstTag}
              </span>
            )}
            {(() => {
              const dot = DEAL_DOT[conv.deal_status] ?? DEAL_DOT["nuevo"];
              return (
                <span
                  title={dot.label}
                  className="w-2 h-2 rounded-full flex-shrink-0 ring-2 ring-cream-raised"
                  style={{ backgroundColor: dot.color }}
                />
              );
            })()}
            {conv.unread_count > 0 && (
              <span className="bg-accent text-cream text-[10px] font-bold rounded-full min-w-[20px] h-5 flex items-center justify-center px-1.5">
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

  const selectedIdRef = useRef<string | null>(selectedId);
  useEffect(() => { selectedIdRef.current = selectedId; }, [selectedId]);

  const convsRef = useRef<ConvWithLastMsg[]>([]);
  useEffect(() => { convsRef.current = conversations; }, [conversations]);

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

  useEffect(() => {
    if (typeof window !== "undefined" && "Notification" in window && Notification.permission === "default") {
      Notification.requestPermission();
    }
  }, []);

  useEffect(() => { load(); }, []);

  useEffect(() => {
    const id = setInterval(() => load(), 20_000);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    const supabase = createClient();

    const sub = supabase
      .channel("conversations-list")
      .on("postgres_changes", { event: "*", schema: "public", table: "conversations" }, () => load())
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "messages" },
        (payload) => {
          type MsgPayload = {
            conversation_id: string;
            direction: string;
            body: string | null;
            sender: string;
            media_type: string | null;
            created_at: string;
          };
          const msg = payload.new as MsgPayload;

          setConversations((prev) => {
            const updated = prev.map((c) => {
              if (c.id !== msg.conversation_id) return c;
              return {
                ...c,
                last_message_at: msg.created_at,
                unread_count:
                  msg.direction === "inbound" && c.id !== selectedIdRef.current
                    ? c.unread_count + 1
                    : c.unread_count,
                last_message: {
                  body: msg.body,
                  sender: msg.sender,
                  direction: msg.direction,
                  media_type: msg.media_type,
                },
              };
            });
            return [...updated].sort(
              (a, b) =>
                new Date(b.last_message_at).getTime() - new Date(a.last_message_at).getTime()
            );
          });

          if (msg.direction === "inbound" && msg.conversation_id !== selectedIdRef.current) {
            const conv = convsRef.current.find((c) => c.id === msg.conversation_id);
            if (conv) {
              const name = displayName(conv);
              const body = msg.body
                ? msg.body.slice(0, 80)
                : msg.media_type?.startsWith("image")
                ? "📷 Imagen"
                : msg.media_type?.startsWith("audio")
                ? "🎤 Audio"
                : "Nuevo mensaje";

              toast(name, { description: body, duration: 5000 });

              if (typeof navigator !== "undefined" && "vibrate" in navigator) {
                navigator.vibrate(200);
              }

              if (typeof window !== "undefined" && "Notification" in window && Notification.permission === "granted") {
                new Notification(name, { body, icon: "/favicon.ico", tag: conv.id });
              }
            }
          }

          load();
        }
      )
      .subscribe();

    return () => { supabase.removeChannel(sub); };
  }, []);

  function handleSelect(conv: ConvWithLastMsg) {
    setConversations((prev) =>
      prev.map((c) => (c.id === conv.id ? { ...c, unread_count: 0 } : c))
    );
    onSelect(conv);
  }

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
    <div className="flex flex-col h-full bg-cream-raised">
      {/* ── Column header: Fenoma lockup + theme toggle ── */}
      <ColumnHeader />

      {/* ── Section title ── */}
      <div className="px-5 py-4 border-b border-line">
        <h2 className="font-display text-[22px] text-ink leading-tight">Chats</h2>
        {conversations.length > 0 && (
          <p className="text-[11px] text-stone mt-1">{conversations.length} chats</p>
        )}
      </div>

      {/* ── Channel tabs — segmented control with bottom border ── */}
      <div className="flex items-center gap-1 px-5 border-b border-line">
        {([
          { key: "whatsapp",  label: "WhatsApp",  Icon: WaIcon },
          { key: "instagram", label: "Instagram", Icon: IgIcon },
        ] as { key: Channel; label: string; Icon: typeof WaIcon }[]).map(({ key, label, Icon }) => {
          const isActive = channel === key;
          return (
            <button
              key={key}
              onClick={() => setChannel(key)}
              className={cn(
                "flex items-center gap-1.5 py-3 px-2 text-[12.5px] cursor-pointer transition-colors",
                "border-b-2 -mb-px",
                isActive
                  ? "border-ink text-ink font-medium"
                  : "border-transparent text-stone hover:text-ink"
              )}
            >
              <Icon size={12} active={isActive} />
              {label}
            </button>
          );
        })}
      </div>

      {/* ── Filter pills ── */}
      <div className="flex items-center gap-1.5 px-4 pt-3 pb-0">
        {([
          { key: "all",        label: "Todas",     count: byChannel.length },
          { key: "unread",     label: "No leídas", count: unreadCount },
          { key: "unassigned", label: "Derivadas", count: derivedCount },
        ] as { key: Tab; label: string; count: number }[]).map(({ key, label, count }) => {
          const isActive = tab === key;
          return (
            <button
              key={key}
              onClick={() => setTab(key)}
              className={cn(
                "flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[12px] font-medium transition-colors cursor-pointer",
                isActive
                  ? "bg-ink text-cream"
                  : "bg-cream border border-line text-stone hover:text-ink"
              )}
            >
              {label}
              {count > 0 && (
                <span
                  className={cn(
                    "text-[10px] font-bold min-w-[16px] h-4 flex items-center justify-center rounded-full px-1",
                    isActive
                      ? "bg-cream/20 text-cream"
                      : "bg-stone/15 text-ink-soft"
                  )}
                >
                  {count}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* ── Search ── */}
      <div className="px-4 py-3">
        <div className="flex items-center gap-2.5 bg-cream border border-line rounded-full px-4 py-2.5 focus-within:border-accent transition-colors">
          <Search size={14} className="text-stone flex-shrink-0" strokeWidth={1.8} />
          <input
            ref={searchRef}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar conversaciones…"
            className="bg-transparent text-ink text-[13.5px] placeholder:text-stone outline-none flex-1 min-w-0"
          />
        </div>
      </div>

      {/* ── List ── */}
      <div className="flex-1 overflow-y-auto">
        {loading ? (
          <SkeletonList />
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center pt-16 gap-3 px-6">
            <div className="w-12 h-12 rounded-full bg-cream flex items-center justify-center">
              <Search size={18} className="text-stone" />
            </div>
            <div className="text-center">
              <p className="text-[13px] font-medium text-ink">Sin resultados</p>
              <p className="text-[12px] text-stone mt-0.5">Probá otro filtro o búsqueda.</p>
            </div>
          </div>
        ) : (
          <div>
            {adminConvs.length > 0 && (
              <>
                <div className="px-5 pt-3 pb-1.5">
                  <span className="text-[10px] font-bold text-stone uppercase tracking-[0.16em]">
                    Admin
                  </span>
                </div>
                <div>
                  {adminConvs.map((conv) => (
                    <ConvItem
                      key={conv.id}
                      conv={conv}
                      isSelected={selectedId === conv.id}
                      onSelect={handleSelect}
                    />
                  ))}
                </div>
                {regularConvs.length > 0 && (
                  <div className="px-5 pt-4 pb-1.5">
                    <span className="text-[10px] font-bold text-stone uppercase tracking-[0.16em]">
                      Clientes
                    </span>
                  </div>
                )}
              </>
            )}
            <div>
              {regularConvs.map((conv) => (
                <ConvItem
                  key={conv.id}
                  conv={conv}
                  isSelected={selectedId === conv.id}
                  onSelect={handleSelect}
                />
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
