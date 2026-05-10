"use client";

import { useRef, useState } from "react";
import { Send } from "lucide-react";
import { toast } from "sonner";

interface Props {
  conversationId: string;
  onSent: () => void;
}

export function MessageInput({ conversationId, onSent }: Props) {
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

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
    const el = e.target;
    el.style.height = "auto";
    el.style.height = Math.min(el.scrollHeight, 120) + "px";
  }

  const hasText = text.trim().length > 0;

  return (
    <div className="flex items-end gap-2.5 px-4 py-3 bg-card border-t border-border">
      <div className="flex-1 relative">
        <textarea
          ref={textareaRef}
          value={text}
          onChange={onInput}
          onKeyDown={onKeyDown}
          placeholder="Escribí un mensaje…"
          rows={1}
          className="
            w-full resize-none rounded-2xl bg-muted px-4 py-2.5
            text-foreground placeholder:text-muted-foreground text-sm
            outline-none focus:ring-2 focus:ring-primary/30 focus:bg-background
            leading-relaxed max-h-[120px] overflow-y-auto
            transition-all duration-200
          "
        />
      </div>

      <button
        onClick={send}
        disabled={!hasText || sending}
        className="
          flex-shrink-0 flex items-center justify-center
          w-10 h-10 rounded-full bg-primary text-primary-foreground
          transition-all duration-200 cursor-pointer
          hover:opacity-90 hover:scale-105
          disabled:opacity-40 disabled:cursor-not-allowed disabled:scale-100
          shadow-sm shadow-primary/20
        "
      >
        {sending
          ? <span className="w-4 h-4 border-2 border-primary-foreground/40 border-t-primary-foreground rounded-full animate-spin" />
          : <Send size={16} />
        }
      </button>
    </div>
  );
}
