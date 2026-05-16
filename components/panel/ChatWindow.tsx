"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { ChatHeader } from "./ChatHeader";
import { MessageBubble } from "./MessageBubble";
import { MessageInput } from "./MessageInput";
import { Skeleton } from "@/components/ui/skeleton";
import type { Conversation, Message } from "@/types/database.types";

interface Props {
  conversation: Conversation;
  onConversationUpdate: (updated: Partial<Conversation>) => void;
  onBack?: () => void;
  onInfoToggle?: () => void;
}

function MessagesSkeleton() {
  return (
    <div className="px-4 py-6 space-y-5">
      <div className="flex justify-start">
        <Skeleton className="h-14 w-52 rounded-2xl rounded-bl-md" />
      </div>
      <div className="flex justify-end">
        <Skeleton className="h-10 w-40 rounded-2xl rounded-br-md" />
      </div>
      <div className="flex justify-start">
        <Skeleton className="h-20 w-60 rounded-2xl rounded-bl-md" />
      </div>
      <div className="flex justify-end">
        <Skeleton className="h-10 w-48 rounded-2xl rounded-br-md" />
      </div>
      <div className="flex justify-start">
        <Skeleton className="h-12 w-44 rounded-2xl rounded-bl-md" />
      </div>
    </div>
  );
}

export function ChatWindow({ conversation, onConversationUpdate, onBack, onInfoToggle }: Props) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [loading, setLoading] = useState(true);
  const bottomRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = useCallback((smooth = false) => {
    bottomRef.current?.scrollIntoView({ behavior: smooth ? "smooth" : "instant" });
  }, []);

  useEffect(() => {
    setLoading(true);
    fetch(`/api/chats/${conversation.id}/messages`)
      .then(async (r) => {
        if (!r.ok) return [];
        const data: unknown = await r.json();
        return Array.isArray(data) ? (data as Message[]) : [];
      })
      .then((data) => {
        setMessages(data);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, [conversation.id]);

  useEffect(() => {
    if (!loading) scrollToBottom();
  }, [messages, loading, scrollToBottom]);

  useEffect(() => {
    const supabase = createClient();
    const channel = supabase
      .channel(`messages:${conversation.id}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "messages", filter: `conversation_id=eq.${conversation.id}` },
        (payload) => {
          setMessages((prev) => {
            if (prev.some((m) => m.id === (payload.new as Message).id)) return prev;
            return [...prev, payload.new as Message];
          });
          scrollToBottom(true);
        }
      )
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "messages", filter: `conversation_id=eq.${conversation.id}` },
        (payload) => {
          setMessages((prev) =>
            prev.map((m) => m.id === (payload.new as Message).id ? (payload.new as Message) : m)
          );
        }
      )
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [conversation.id, scrollToBottom]);

  function handleToggle(paused: boolean) {
    onConversationUpdate({ automation_paused: paused });
  }

  function handleContactUpdate(updated: Partial<Conversation>) {
    onConversationUpdate(updated);
  }

  function handleSent() {
    fetch(`/api/chats/${conversation.id}/messages`)
      .then(async (r) => {
        if (!r.ok) return null;
        const data: unknown = await r.json();
        return Array.isArray(data) ? (data as Message[]) : null;
      })
      .then((data) => { if (data) setMessages(data); })
      .catch(() => {});
  }

  return (
    <div className="flex flex-col h-full bg-background">
      <ChatHeader
        conversation={conversation}
        onToggle={handleToggle}
        onConversationUpdate={handleContactUpdate}
        onBack={onBack}
        onInfoToggle={onInfoToggle}
      />

      {/* Messages area */}
      <div className="flex-1 overflow-y-auto bg-[#F8F5EF] dark:bg-[#0A0818]">
        {loading ? (
          <MessagesSkeleton />
        ) : messages.length === 0 ? (
          <div className="flex justify-center pt-12">
            <span className="text-sm text-gray-400 bg-white dark:bg-[#1A1530] border border-gray-100 dark:border-[#2D2A45] px-4 py-1.5 rounded-full shadow-sm">
              Sin mensajes todavía
            </span>
          </div>
        ) : (
          <div className="py-5 space-y-2.5">
            {messages.map((msg) => <MessageBubble key={msg.id} message={msg} />)}
          </div>
        )}
        <div ref={bottomRef} className="h-3" />
      </div>

      <MessageInput conversationId={conversation.id} onSent={handleSent} />
    </div>
  );
}
