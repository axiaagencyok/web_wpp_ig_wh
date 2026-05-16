"use client";

import { motion } from "framer-motion";
import { Check, CheckCheck, Clock, X, Bot, User, Image as ImageIcon, Mic } from "lucide-react";
import type { Message } from "@/types/database.types";

interface Props {
  message: Message;
}

function formatTime(iso: string) {
  return new Date(iso).toLocaleTimeString("es-AR", {
    hour: "2-digit",
    minute: "2-digit",
  });
}

function StatusTick({ status, isOutbound }: { status: Message["status"]; isOutbound: boolean }) {
  const base = "flex-shrink-0";
  const muted = isOutbound ? "text-cream/55" : "text-stone";
  if (status === "queued")    return <Clock size={11} className={`${base} ${muted}`} />;
  if (status === "sent")      return <Check size={11} className={`${base} ${muted}`} />;
  if (status === "delivered") return <CheckCheck size={11} className={`${base} ${muted}`} />;
  if (status === "read")      return <CheckCheck size={11} className={`${base} text-accent`} />;
  if (status === "failed")    return <X size={11} className={`${base} text-destructive`} />;
  return null;
}

function SenderPill({ sender }: { sender: Message["sender"] }) {
  if (sender === "ai") {
    return (
      <span className="inline-flex items-center gap-1 text-[10px] font-medium px-2 py-0.5 rounded-full border border-line text-ink-soft bg-cream-raised">
        <Bot size={9} />
        IA
      </span>
    );
  }
  if (sender === "human") {
    return (
      <span className="inline-flex items-center gap-1 text-[10px] font-medium px-2 py-0.5 rounded-full border border-line text-ink-soft bg-cream-raised">
        <User size={9} />
        Vos
      </span>
    );
  }
  return null;
}

export function MessageBubble({ message }: Props) {
  const isOutbound = message.direction === "outbound";

  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.22, ease: "easeOut" }}
      className={`flex ${isOutbound ? "justify-end" : "justify-start"} px-4`}
    >
      <div className={`max-w-[72%] ${isOutbound ? "items-end" : "items-start"} flex flex-col gap-1`}>
        {isOutbound && (
          <div className="px-1">
            <SenderPill sender={message.sender} />
          </div>
        )}

        <div
          className={
            isOutbound
              ? "px-4 py-3 bg-ink text-cream rounded-2xl rounded-br-[6px]"
              : "px-4 py-3 bg-cream-raised text-ink border border-line rounded-2xl rounded-bl-[6px]"
          }
        >
          {/* Image */}
          {message.media_url && message.media_type?.startsWith("image") && (
            /* eslint-disable-next-line @next/next/no-img-element */
            <img
              src={message.media_url}
              alt="media"
              className="rounded-xl max-w-[240px] mb-2 block"
              loading="lazy"
            />
          )}

          {/* Image placeholder */}
          {!message.media_url && message.media_type?.startsWith("image") && (
            <div
              className={`flex items-center gap-2 mb-2 ${isOutbound ? "text-cream/70" : "text-stone"}`}
            >
              <ImageIcon size={16} />
              <span className="text-xs">Imagen</span>
            </div>
          )}

          {/* Audio */}
          {message.media_type?.startsWith("audio") && (
            <div className="flex items-center gap-2 mb-2">
              <Mic size={14} className={isOutbound ? "text-cream/70" : "text-stone"} />
              <span className={`text-xs italic ${isOutbound ? "text-cream/80" : "text-ink-soft"}`}>
                {message.transcription ? `"${message.transcription}"` : "Audio"}
              </span>
            </div>
          )}

          {/* Body */}
          {message.body && (
            <p
              className={`text-[15px] leading-relaxed whitespace-pre-wrap break-words ${
                isOutbound ? "text-cream" : "text-ink"
              }`}
            >
              {message.body}
            </p>
          )}

          {/* Footer: timestamp + ticks */}
          <div className="flex items-center justify-end gap-1 mt-1.5">
            <span
              className={`text-[10px] tabular-nums ${isOutbound ? "text-cream/55" : "text-stone"}`}
            >
              {formatTime(message.created_at)}
            </span>
            {isOutbound && <StatusTick status={message.status} isOutbound={isOutbound} />}
          </div>
        </div>
      </div>
    </motion.div>
  );
}
