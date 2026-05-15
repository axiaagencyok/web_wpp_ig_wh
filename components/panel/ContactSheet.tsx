"use client";

import { useEffect, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X, User, Mail, Phone, StickyNote, Tag, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { avatarColor, phoneInitials, cn } from "@/lib/utils";
import type { Conversation } from "@/types/database.types";

interface Props {
  conversation: Conversation;
  open: boolean;
  onClose: () => void;
  onSaved: (updated: Partial<Conversation>) => void;
}

export function ContactSheet({ conversation, open, onClose, onSaved }: Props) {
  const [name, setName]   = useState(conversation.contact_name ?? "");
  const [email, setEmail] = useState(conversation.contact_email ?? "");
  const [notes, setNotes] = useState(conversation.notes ?? "");
  const [tags, setTags]   = useState<string[]>(conversation.tags ?? []);
  const [tagInput, setTagInput] = useState("");
  const [saving, setSaving]     = useState(false);
  const tagRef = useRef<HTMLInputElement>(null);

  // Sync when conversation changes (different chat selected)
  useEffect(() => {
    setName(conversation.contact_name ?? "");
    setEmail(conversation.contact_email ?? "");
    setNotes(conversation.notes ?? "");
    setTags(conversation.tags ?? []);
    setTagInput("");
  }, [conversation.id]);

  // Close on Escape
  useEffect(() => {
    function onKey(e: KeyboardEvent) { if (e.key === "Escape") onClose(); }
    if (open) document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onClose]);

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
      onClose();
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setSaving(false);
    }
  }

  const isInstagram = conversation.channel === "instagram";
  const igUsername  = (conversation.custom_fields as Record<string, string> | null)?.ig_username ?? null;
  const color    = avatarColor(conversation.contact_phone);
  const initials = phoneInitials(conversation.contact_phone);
  const phone    = isInstagram
    ? (igUsername ? `@${igUsername}` : conversation.contact_phone.replace("instagram:", ""))
    : conversation.contact_phone.replace("whatsapp:", "");

  return (
    <AnimatePresence>
      {open && (
        <>
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="fixed inset-0 bg-black/30 z-40 backdrop-blur-[2px]"
            onClick={onClose}
          />

          {/* Drawer */}
          <motion.div
            initial={{ x: "100%" }}
            animate={{ x: 0 }}
            exit={{ x: "100%" }}
            transition={{ type: "spring", damping: 28, stiffness: 300 }}
            className="fixed inset-y-0 right-0 w-full max-w-sm bg-card border-l border-border shadow-2xl z-50 flex flex-col"
          >
            {/* Header */}
            <div className="flex items-center justify-between px-5 py-4 border-b border-border">
              <h2 className="font-semibold text-foreground text-base">Info del contacto</h2>
              <button
                onClick={onClose}
                className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-muted text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
              >
                <X size={16} />
              </button>
            </div>

            {/* Avatar hero */}
            <div className="flex flex-col items-center gap-3 py-6 border-b border-border">
              <div
                className="w-16 h-16 rounded-full flex items-center justify-center text-white text-xl font-bold shadow-lg"
                style={{ backgroundColor: color }}
              >
                {initials}
              </div>
              <div className="text-center">
                <p className="font-semibold text-foreground text-sm">
                  {name || phone}
                </p>
                <p className="text-xs text-muted-foreground font-mono mt-0.5">{phone}</p>
              </div>
            </div>

            {/* Form */}
            <div className="flex-1 overflow-y-auto px-5 py-5 space-y-5">
              {/* Nombre */}
              <Field label="Nombre" icon={<User size={13} />}>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Nombre del contacto"
                  className={inputCls}
                />
              </Field>

              {/* Teléfono / Instagram (readonly) */}
              {isInstagram ? (
                <Field label="Usuario de Instagram" icon={<svg viewBox="0 0 24 24" fill="currentColor" width="13" height="13"><path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zM12 0C8.741 0 8.333.014 7.053.072 2.695.272.273 2.69.073 7.052.014 8.333 0 8.741 0 12c0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98C8.333 23.986 8.741 24 12 24c3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98C15.668.014 15.259 0 12 0zm0 5.838a6.162 6.162 0 100 12.324 6.162 6.162 0 000-12.324zM12 16a4 4 0 110-8 4 4 0 010 8zm6.406-11.845a1.44 1.44 0 100 2.881 1.44 1.44 0 000-2.881z"/></svg>}>
                  {igUsername ? (
                    <a
                      href={`https://instagram.com/${igUsername}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className={cn(inputCls, "flex items-center gap-2 text-pink-600 dark:text-pink-400 hover:underline cursor-pointer")}
                    >
                      @{igUsername}
                    </a>
                  ) : (
                    <input
                      type="text"
                      value={conversation.contact_phone.replace("instagram:", "")}
                      readOnly
                      className={cn(inputCls, "text-muted-foreground cursor-default select-all")}
                    />
                  )}
                </Field>
              ) : (
                <Field label="Teléfono" icon={<Phone size={13} />}>
                  <input
                    type="text"
                    value={phone}
                    readOnly
                    className={cn(inputCls, "text-muted-foreground cursor-default select-all")}
                  />
                </Field>
              )}

              {/* Email */}
              <Field label="Email" icon={<Mail size={13} />}>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="email@ejemplo.com"
                  className={inputCls}
                />
              </Field>

              {/* Tags */}
              <Field label="Etiquetas" icon={<Tag size={13} />}>
                <div
                  className="min-h-[42px] flex flex-wrap gap-1.5 items-center rounded-xl bg-muted px-3 py-2 cursor-text focus-within:ring-2 focus-within:ring-primary/30 focus-within:bg-background transition-all"
                  onClick={() => tagRef.current?.focus()}
                >
                  {tags.map((t) => (
                    <span
                      key={t}
                      className="inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-full bg-accent/10 text-accent"
                    >
                      {t}
                      <button
                        type="button"
                        onClick={(e) => { e.stopPropagation(); removeTag(t); }}
                        className="hover:text-primary/60 cursor-pointer"
                      >
                        <X size={10} />
                      </button>
                    </span>
                  ))}
                  <input
                    ref={tagRef}
                    value={tagInput}
                    onChange={(e) => setTagInput(e.target.value)}
                    onKeyDown={onTagKeyDown}
                    onBlur={() => { if (tagInput) addTag(tagInput); }}
                    placeholder={tags.length === 0 ? "Escribí y Enter para agregar…" : ""}
                    className="bg-transparent outline-none text-sm text-foreground placeholder:text-muted-foreground flex-1 min-w-[80px]"
                  />
                </div>
                <p className="text-[10px] text-muted-foreground mt-1 px-1">
                  Enter o coma para agregar · Backspace para borrar el último
                </p>
              </Field>

              {/* Notas */}
              <Field label="Notas" icon={<StickyNote size={13} />}>
                <textarea
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="Notas internas sobre este contacto…"
                  rows={5}
                  className={cn(inputCls, "resize-none leading-relaxed")}
                />
              </Field>
            </div>

            {/* Footer */}
            <div className="px-5 py-4 border-t border-border">
              <button
                onClick={handleSave}
                disabled={saving}
                className="
                  w-full flex items-center justify-center gap-2
                  rounded-xl bg-primary text-primary-foreground
                  py-2.5 text-sm font-semibold
                  hover:opacity-90 transition-all duration-200
                  disabled:opacity-60 disabled:cursor-not-allowed
                  shadow-sm shadow-primary/20 cursor-pointer
                "
              >
                {saving
                  ? <><Loader2 size={15} className="animate-spin" />Guardando…</>
                  : "Guardar"
                }
              </button>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}

const inputCls = `
  w-full rounded-xl bg-muted border border-transparent px-3 py-2
  text-sm text-foreground placeholder:text-muted-foreground
  outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary/30 focus:bg-background
  transition-all duration-200
`;

function Field({ label, icon, children }: { label: string; icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <label className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground uppercase tracking-wider">
        {icon}
        {label}
      </label>
      {children}
    </div>
  );
}
