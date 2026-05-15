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
  if (status === "queued")    return <Clock size={11} className="flex-shrink-0 text-violet-300" />;
  if (status === "sent")      return <Check size={11} className="flex-shrink-0 text-violet-400/70" />;
  if (status === "delivered") return <CheckCheck size={11} className="flex-shrink-0 text-violet-400" />;
  if (status === "read")      return <CheckCheck size={11} className="flex-shrink-0 text-violet-600" />;
  if (status === "failed")    return <X size={11} className="flex-shrink-0 text-red-400" />;
  return null;
}

function SenderPill({ sender }: { sender: Message["sender"] }) {
  if (sender === "ai") {
    return (
      <span className="inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-full bg-violet-100 text-violet-600 dark:bg-violet-900/40 dark:text-violet-300">
        <Bot size={9} />
        IA
      </span>
    );
  }
  if (sender === "human") {
    return (
      <span className="inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-full bg-violet-100 text-violet-600 dark:bg-violet-900/40 dark:text-violet-300">
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
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.2, ease: "easeOut" }}
      className={`flex ${isOutbound ? "justify-end" : "justify-start"} px-4`}
    >
      <div className={`max-w-[72%] ${isOutbound ? "items-end" : "items-start"} flex flex-col gap-1`}>
        {/* Sender pill (outbound only) */}
        {isOutbound && (
          <div className="px-1">
            <SenderPill sender={message.sender} />
          </div>
        )}

        <div
          className={`
            relative px-4 py-3 shadow-sm
            ${isOutbound
              ? "bg-gradient-to-br from-violet-500 to-violet-600 text-white rounded-2xl rounded-br-sm"
              : "bg-white dark:bg-[#1E1B2E] border border-gray-100 dark:border-[#2D2A45] text-gray-800 dark:text-gray-100 rounded-2xl rounded-bl-sm shadow-[0_2px_12px_rgba(17,24,39,0.06)]"
            }
          `}
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
            <div className="flex items-center gap-2 mb-2 opacity-60">
              <ImageIcon size={16} />
              <span className="text-xs">Imagen</span>
            </div>
          )}

          {/* Audio */}
          {message.media_type?.startsWith("audio") && (
            <div className="flex items-center gap-2 mb-2">
              <Mic size={14} className={isOutbound ? "text-white/70" : "text-gray-400"} />
              <span className={`text-xs italic ${isOutbound ? "text-white/80" : "text-gray-500"}`}>
                {message.transcription ? `"${message.transcription}"` : "Audio"}
              </span>
            </div>
          )}

          {/* Body */}
          {message.body && (
            <p className={`text-[15px] leading-relaxed whitespace-pre-wrap break-words ${isOutbound ? "text-white" : "text-gray-800 dark:text-gray-100"}`}>
              {message.body}
            </p>
          )}

          {/* Footer: timestamp + ticks */}
          <div className="flex items-center justify-end gap-1 mt-1.5">
            <span className={`text-[10px] tabular-nums ${isOutbound ? "text-white/60" : "text-gray-400"}`}>
              {formatTime(message.created_at)}
            </span>
            {isOutbound && <StatusTick status={message.status} />}
          </div>
        </div>
      </div>
    </motion.div>
  );
}
