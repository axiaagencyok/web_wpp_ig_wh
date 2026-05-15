"use client";

import { useState } from "react";
import { Bot, Hand } from "lucide-react";
import { toast } from "sonner";

interface Props {
  conversationId: string;
  initialPaused: boolean;
  onToggle: (paused: boolean) => void;
}

export function AutomationToggle({ conversationId, initialPaused, onToggle }: Props) {
  const [paused, setPaused] = useState(initialPaused);
  const [loading, setLoading] = useState(false);

  async function toggle() {
    setLoading(true);
    const next = !paused;
    setPaused(next); // optimistic local only

    try {
      const res = await fetch(`/api/chats/${conversationId}/toggle-automation`, { method: "PATCH" });
      if (!res.ok) throw new Error("Error al cambiar modo");
      const data = await res.json() as { automation_paused: boolean };
      setPaused(data.automation_paused);
      onToggle(data.automation_paused); // single call, server-confirmed
      toast.success(data.automation_paused ? "Modo manual activado" : "IA reactivada", { duration: 1500 });
    } catch {
      setPaused(!next); // revert
      toast.error("No se pudo cambiar el modo", { duration: 1500 });
    } finally {
      setLoading(false);
    }
  }

  return (
    <button
      onClick={toggle}
      disabled={loading}
      title={paused ? "IA pausada — clic para reactivar" : "IA activa — clic para tomar control"}
      className={`
        flex items-center gap-2 rounded-full px-3.5 py-2 text-[12px] font-semibold
        border transition-all duration-200 select-none cursor-pointer
        disabled:opacity-50 disabled:cursor-not-allowed
        ${paused
          ? "bg-amber-50 border-amber-200 text-amber-700 hover:bg-amber-100 dark:bg-amber-900/20 dark:border-amber-700 dark:text-amber-400"
          : "bg-violet-50 border-violet-200 text-violet-700 hover:bg-violet-100 dark:bg-violet-900/20 dark:border-violet-700 dark:text-violet-300"
        }
      `}
    >
      {/* Toggle track */}
      <div className={`
        relative w-8 h-[18px] rounded-full transition-colors duration-200 flex-shrink-0
        ${paused ? "bg-amber-200 dark:bg-amber-700/40" : "bg-violet-200 dark:bg-violet-700/40"}
      `}>
        <span className={`
          absolute top-0.5 w-3.5 h-3.5 rounded-full shadow-sm transition-all duration-200
          ${paused ? "left-0.5 bg-amber-500" : "left-4 bg-violet-600"}
        `} />
      </div>

      {paused
        ? <><Hand size={11} className="flex-shrink-0" />Manual</>
        : <><Bot size={11} className="flex-shrink-0" /><span className="flex items-center gap-1">IA <span className="w-1.5 h-1.5 rounded-full bg-violet-600 dark:bg-violet-400 animate-pulse" /></span></>
      }
    </button>
  );
}
