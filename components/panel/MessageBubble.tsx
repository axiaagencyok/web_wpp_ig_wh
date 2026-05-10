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

function StatusTick({ status }: { status: Message["status"] }) {
  const base = "flex-shrink-0";
  if (status === "queued")    return <Clock size={11} className={`${base} text-white/50`} />;
  if (status === "sent")      return <Check size={11} className={`${base} text-white/60`} />;
  if (status === "delivered") return <CheckCheck size={11} className={`${base} text-white/60`} />;
  if (status === "read")      return <CheckCheck size={11} className={`${base} text-white`} />;
  if (status === "failed")    return <X size={11} className={`${base} text-red-300`} />;
  return null;
}

function SenderPill({ sender }: { sender: Message["sender"] }) {
  if (sender === "ai") {
    return (
      <span className="inline-flex items-center gap-1 text-[10px] font-medium px-1.5 py-0.5 rounded-full bg-white/20 text-white/80">
        <Bot size={9} />
        IA
      </span>
    );
  }
  if (sender === "human") {
    return (
      <span className="inline-flex items-center gap-1 text-[10px] font-medium px-1.5 py-0.5 rounded-full bg-white/20 text-white/80">
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
      transition={{ duration: 0.18, ease: "easeOut" }}
      className={`flex ${isOutbound ? "justify-end" : "justify-start"} px-4`}
    >
      <div className={`max-w-[72%] ${isOutbound ? "items-end" : "items-start"} flex flex-col gap-0.5`}>
        {/* Sender pill (outbound only, above bubble) */}
        {isOutbound && (
          <div className="px-1">
            <SenderPill sender={message.sender} />
          </div>
        )}

        <div
          className={`
            relative px-3.5 py-2.5 shadow-sm
            ${isOutbound
              ? "bg-primary text-primary-foreground rounded-2xl rounded-br-md"
              : "bg-card border border-border text-foreground rounded-2xl rounded-bl-md"
            }
          `}
        >
          {/* Image */}
          {message.media_url && message.media_type?.startsWith("image") && (
            <img
              src={message.media_url}
              alt="media"
              className="rounded-lg max-w-[240px] mb-2 block"
              loading="lazy"
            />
          )}

          {/* Image placeholder (no URL yet) */}
          {!message.media_url && message.media_type?.startsWith("image") && (
            <div className="flex items-center gap-2 mb-2 opacity-60">
              <ImageIcon size={16} />
              <span className="text-xs">Imagen</span>
            </div>
          )}

          {/* Audio */}
          {message.media_type?.startsWith("audio") && (
            <div className="flex items-center gap-2 mb-2">
              <Mic size={14} className={isOutbound ? "text-primary-foreground/70" : "text-muted-foreground"} />
              <span className={`text-xs italic ${isOutbound ? "text-primary-foreground/80" : "text-muted-foreground"}`}>
                {message.transcription ? `"${message.transcription}"` : "Audio"}
              </span>
            </div>
          )}

          {/* Body */}
          {message.body && (
            <p className="text-sm leading-relaxed whitespace-pre-wrap break-words">
              {message.body}
            </p>
          )}

          {/* Footer: timestamp + ticks */}
          <div className={`flex items-center gap-1 mt-1 ${isOutbound ? "justify-end" : "justify-end"}`}>
            <span className={`text-[10px] tabular-nums ${isOutbound ? "text-primary-foreground/60" : "text-muted-foreground"}`}>
              {formatTime(message.created_at)}
            </span>
            {isOutbound && <StatusTick status={message.status} />}
          </div>
        </div>
      </div>
    </motion.div>
  );
}
