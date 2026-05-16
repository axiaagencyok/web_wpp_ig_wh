"use client";

import { useRef, useState } from "react";
import { Send } from "lucide-react";
import { toast } from "sonner";

interface Props {
  conversationId: string;
  onSent: () => void;
}

const QUICK_REPLIES = [
  { label: "Saludo",          text: "¡Hola! ¿En qué puedo ayudarte hoy?" },
  { label: "Envíos",          text: "Los envíos se realizan de lunes a viernes en 3-5 días hábiles." },
  { label: "Métodos de pago", text: "Aceptamos transferencia bancaria, tarjeta de crédito/débito y efectivo." },
  { label: "Devoluciones",    text: "Para gestionar una devolución escribinos con tu número de pedido y te ayudamos." },
];

export function MessageInput({ conversationId, onSent }: Props) {
  const [text, setText]       = useState("");
  const [sending, setSending] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  function applyHeight(el: HTMLTextAreaElement) {
    el.style.height = "auto";
    el.style.height = Math.min(el.scrollHeight, 130) + "px";
  }

  function insertQuickReply(reply: string) {
    setText(reply);
    setTimeout(() => {
      const el = textareaRef.current;
      if (!el) return;
      applyHeight(el);
      el.focus();
      el.setSelectionRange(reply.length, reply.length);
    }, 0);
  }

  async function send() {
    const trimmed = text.trim();
    if (!trimmed || sending) return;

    setSending(true);
    setText("");
    if (textareaRef.current) textareaRef.current.style.height = "auto";

    try {
      const res = await fetch("/api/messages/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ conversationId, message: trimmed }),
      });
      if (!res.ok) {
        const data = await res.json() as { error?: string };
        throw new Error(data.error ?? "Error enviando");
      }
      onSent();
    } catch (err) {
      toast.error((err as Error).message);
      setText(trimmed);
    } finally {
      setSending(false);
      textareaRef.current?.focus();
    }
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      send();
    }
  }

  function onInput(e: React.ChangeEvent<HTMLTextAreaElement>) {
    setText(e.target.value);
    applyHeight(e.target);
  }

  const hasText = text.trim().length > 0;

  return (
    <div className="bg-cream-raised border-t border-line">
      {/* Quick reply chips */}
      <div className="flex items-center gap-2 px-4 pt-3 pb-0 overflow-x-auto scrollbar-none">
        {QUICK_REPLIES.map((qr) => (
          <button
            key={qr.label}
            onClick={() => insertQuickReply(qr.text)}
            className="
              flex-shrink-0 text-[12px] font-medium px-3.5 py-1.5 rounded-full
              border border-line bg-cream text-ink-soft
              hover:bg-cream-soft hover:text-ink hover:border-stone/40
              transition-colors cursor-pointer whitespace-nowrap
            "
          >
            {qr.label}
          </button>
        ))}
      </div>

      {/* Input row */}
      <div className="flex items-end gap-3 px-4 py-3">
        <div className="flex-1 relative">
          <textarea
            ref={textareaRef}
            value={text}
            onChange={onInput}
            onKeyDown={onKeyDown}
            placeholder="Escribí un mensaje…"
            rows={1}
            className="
              w-full resize-none rounded-3xl
              bg-cream border border-line
              px-5 py-3
              text-[15px] text-ink placeholder:text-stone
              outline-none
              focus:border-accent focus:bg-cream-soft
              leading-relaxed max-h-[130px] overflow-y-auto
              transition-colors duration-150
              min-h-[48px]
            "
          />
        </div>

        <button
          onClick={send}
          disabled={!hasText || sending}
          className="
            flex-shrink-0 flex items-center justify-center
            w-12 h-12 rounded-full
            bg-ink text-cream
            hover:bg-accent
            transition-colors duration-150 cursor-pointer
            disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-ink
          "
        >
          {sending
            ? <span className="w-5 h-5 border-2 border-cream/40 border-t-cream rounded-full animate-spin" />
            : <Send size={17} strokeWidth={1.8} />
          }
        </button>
      </div>
    </div>
  );
}
