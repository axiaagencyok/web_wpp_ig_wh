"use client";

import { useEffect, useRef, useState } from "react";
import { Mail, Phone, StickyNote, Tag, Loader2, User, X } from "lucide-react";
import { toast } from "sonner";
import { avatarGradient, nameInitials, cn } from "@/lib/utils";
import type { Conversation, Message } from "@/types/database.types";

interface Props {
  conversation: Conversation;
  onSaved: (updated: Partial<Conversation>) => void;
  onClose?: () => void;
}

export function ContactPanel({ conversation, onSaved, onClose }: Props) {
  const [name, setName]     = useState(conversation.contact_name ?? "");
  const [email, setEmail]   = useState(conversation.contact_email ?? "");
  const [notes, setNotes]   = useState(conversation.notes ?? "");
  const [tags, setTags]     = useState<string[]>(conversation.tags ?? []);
  const [tagInput, setTagInput] = useState("");
  const [saving, setSaving] = useState(false);
  const [mediaUrls, setMediaUrls] = useState<string[]>([]);

  const tagRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setName(conversation.contact_name ?? "");
    setEmail(conversation.contact_email ?? "");
    setNotes(conversation.notes ?? "");
    setTags(conversation.tags ?? []);
    setTagInput("");
  }, [conversation.id]);

  useEffect(() => {
    fetch(`/api/chats/${conversation.id}/messages`)
      .then(async (r) => {
        if (!r.ok) return [];
        const data: unknown = await r.json();
        if (!Array.isArray(data)) return [];
        return (data as Message[])
          .filter((m) => m.media_url && m.media_type?.startsWith("image"))
          .map((m) => m.media_url as string)
          .slice(-9);
      })
      .then(setMediaUrls)
      .catch(() => {});
  }, [conversation.id]);

  function addTag(raw: string) {
    const t = raw.trim().toLowerCase().replace(/\s+/g, "-");
    if (!t || tags.includes(t) || tags.length >= 20) return;
    setTags((prev) => [...prev, t]);
    setTagInput("");
  }

  function removeTag(t: string) {
    setTags((prev) => prev.filter((x) => x !== t));
  }

  function onTagKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter" || e.key === ",") {
      e.preventDefault();
      addTag(tagInput);
    } else if (e.key === "Backspace" && tagInput === "" && tags.length > 0) {
      setTags((prev) => prev.slice(0, -1));
    }
  }

  async function handleSave() {
    setSaving(true);
    try {
      const res = await fetch(`/api/chats/${conversation.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contact_name:  name || null,
          contact_email: email || null,
          notes:         notes || null,
          tags,
        }),
      });
      if (!res.ok) {
        const d = await res.json() as { error?: string };
        throw new Error(d.error ?? "Error al guardar");
      }
      const updated = await res.json() as Partial<Conversation>;
      onSaved(updated);
      toast.success("Contacto actualizado");
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setSaving(false);
    }
  }

  const isInstagram = conversation.channel === "instagram";
  const igUsername  = (conversation.custom_fields as Record<string, string> | null)?.ig_username ?? null;
  const displayPhone = isInstagram
    ? (igUsername ? `@${igUsername}` : conversation.contact_phone.replace("instagram:", ""))
    : conversation.contact_phone.replace("whatsapp:", "");

  const gradient = avatarGradient(conversation.contact_phone);
  const initials  = nameInitials(conversation.contact_name, conversation.contact_phone);

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100 dark:border-[#2D2A45] bg-white dark:bg-[#1A1530]">
        <h3 className="text-[13px] font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">
          Info del contacto
        </h3>
        {onClose && (
          <button
            onClick={onClose}
            className="w-7 h-7 flex items-center justify-center rounded-lg text-gray-400 hover:text-gray-700 hover:bg-gray-100 dark:hover:text-gray-200 dark:hover:bg-white/10 transition-all cursor-pointer"
            title="Cerrar"
          >
            <X size={15} />
          </button>
        )}
      </div>

      {/* Avatar hero */}
      <div className="flex flex-col items-center gap-3 py-7 border-b border-gray-100 dark:border-[#2D2A45] bg-white dark:bg-[#1A1530]">
        <div
          className="w-[72px] h-[72px] rounded-full flex items-center justify-center text-white text-2xl font-bold shadow-lg"
          style={{ background: gradient }}
        >
          {initials}
        </div>
        <div className="text-center px-4 mt-1">
          <p className="font-bold text-gray-900 dark:text-white text-[15px] truncate max-w-[220px]">
            {name || displayPhone}
          </p>
          <p className="text-[12px] text-gray-400 font-mono mt-0.5 truncate max-w-[220px]">
            {displayPhone}
          </p>
          <div className="flex items-center justify-center gap-1.5 mt-2.5">
            {isInstagram ? (
              <span className="inline-flex items-center gap-1 text-[10px] font-bold px-2.5 py-1 rounded-full bg-gradient-to-r from-purple-100 to-pink-100 text-pink-700 dark:from-purple-900/30 dark:to-pink-900/30 dark:text-pink-300">
                <svg viewBox="0 0 24 24" fill="currentColor" width="9" height="9"><path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zM12 0C8.741 0 8.333.014 7.053.072 2.695.272.273 2.69.073 7.052.014 8.333 0 8.741 0 12c0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98C8.333 23.986 8.741 24 12 24c3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98C15.668.014 15.259 0 12 0zm0 5.838a6.162 6.162 0 100 12.324 6.162 6.162 0 000-12.324zM12 16a4 4 0 110-8 4 4 0 010 8zm6.406-11.845a1.44 1.44 0 100 2.881 1.44 1.44 0 000-2.881z"/></svg>
                Instagram
              </span>
            ) : (
              <span className="inline-flex items-center gap-1 text-[10px] font-bold px-2.5 py-1 rounded-full bg-green-50 text-green-700 dark:bg-green-900/30 dark:text-green-300">
                <svg viewBox="0 0 24 24" fill="currentColor" width="9" height="9"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/></svg>
                WhatsApp
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Scrollable form */}
      <div className="flex-1 overflow-y-auto bg-gray-50 dark:bg-[#0F0B1F]">
        <div className="px-5 py-5 space-y-5">

          {/* Name */}
          <Field label="Nombre" icon={<User size={12} />}>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Nombre del contacto"
              className={inputCls}
            />
          </Field>

          {/* Phone / Instagram (readonly) */}
          <Field
            label={isInstagram ? "Instagram" : "Teléfono"}
            icon={<Phone size={12} />}
          >
            <input
              type="text"
              value={displayPhone}
              readOnly
              className={cn(inputCls, "text-gray-400 cursor-default select-all")}
            />
          </Field>

          {/* Email */}
          <Field label="Email" icon={<Mail size={12} />}>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="email@ejemplo.com"
              className={inputCls}
            />
          </Field>

          {/* Tags */}
          <Field label="Etiquetas" icon={<Tag size={12} />}>
            <div
              className="min-h-[42px] flex flex-wrap gap-1.5 items-center rounded-xl bg-white dark:bg-[#1A1530] border border-gray-200 dark:border-[#2D2A45] px-3 py-2 cursor-text focus-within:ring-2 focus-within:ring-violet-300 focus-within:border-violet-300 transition-all"
              onClick={() => tagRef.current?.focus()}
            >
              {tags.map((t) => (
                <span
                  key={t}
                  className="inline-flex items-center gap-1 text-[11px] font-medium px-2 py-0.5 rounded-full bg-violet-100 text-violet-700 dark:bg-violet-900/40 dark:text-violet-300"
                >
                  {t}
                  <button
                    type="button"
                    onClick={(e) => { e.stopPropagation(); removeTag(t); }}
                    className="hover:text-violet-900 dark:hover:text-violet-100 cursor-pointer"
                  >
                    <X size={9} />
                  </button>
                </span>
              ))}
              <input
                ref={tagRef}
                value={tagInput}
                onChange={(e) => setTagInput(e.target.value)}
                onKeyDown={onTagKeyDown}
                onBlur={() => { if (tagInput) addTag(tagInput); }}
                placeholder={tags.length === 0 ? "Enter para agregar…" : ""}
                className="bg-transparent outline-none text-[13px] text-gray-800 dark:text-gray-100 placeholder:text-gray-400 flex-1 min-w-[80px]"
              />
            </div>
          </Field>

          {/* Notes */}
          <Field label="Notas" icon={<StickyNote size={12} />}>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Notas internas sobre este contacto…"
              rows={4}
              className={cn(inputCls, "resize-none leading-relaxed")}
            />
          </Field>

          {/* Media grid */}
          {mediaUrls.length > 0 && (
            <div>
              <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider mb-2.5">
                Media · {mediaUrls.length} imágenes
              </p>
              <div className="grid grid-cols-3 gap-1.5">
                {mediaUrls.map((url, i) => (
                  <a
                    key={i}
                    href={url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="block rounded-xl overflow-hidden aspect-square bg-gray-100 dark:bg-[#1E1B2E] hover:opacity-90 transition-opacity"
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={url}
                      alt=""
                      className="w-full h-full object-cover"
                      loading="lazy"
                    />
                  </a>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Save footer */}
      <div className="px-5 py-4 border-t border-gray-100 dark:border-[#2D2A45] bg-white dark:bg-[#1A1530]">
        <button
          onClick={handleSave}
          disabled={saving}
          className="w-full flex items-center justify-center gap-2 rounded-xl bg-violet-600 text-white py-2.5 text-[13px] font-semibold hover:bg-violet-700 transition-all duration-200 disabled:opacity-60 disabled:cursor-not-allowed shadow-sm shadow-violet-200 dark:shadow-none cursor-pointer"
        >
          {saving
            ? <><Loader2 size={14} className="animate-spin" />Guardando…</>
            : "Guardar cambios"
          }
        </button>
      </div>
    </div>
  );
}

const inputCls = `
  w-full rounded-xl bg-white dark:bg-[#1A1530]
  border border-gray-200 dark:border-[#2D2A45]
  px-3 py-2 text-[13px] text-gray-800 dark:text-gray-100
  placeholder:text-gray-400
  outline-none focus:ring-2 focus:ring-violet-300 focus:border-violet-300
  transition-all duration-200
`;

function Field({
  label,
  icon,
  children,
}: {
  label: string;
  icon: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <label className="flex items-center gap-1.5 text-[11px] font-semibold text-gray-400 uppercase tracking-wider">
        {icon}
        {label}
      </label>
      {children}
    </div>
  );
}
