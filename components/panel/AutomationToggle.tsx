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
    setPaused(next);
    onToggle(next);

    try {
      const res = await fetch(`/api/chats/${conversationId}/toggle-automation`, { method: "PATCH" });
      if (!res.ok) throw new Error("Error al cambiar modo");
      const data = await res.json() as { automation_paused: boolean };
      setPaused(data.automation_paused);
      onToggle(data.automation_paused);
      toast.success(data.automation_paused ? "Modo manual activado" : "IA reactivada");
    } catch {
      setPaused(!next);
      onToggle(!next);
      toast.error("No se pudo cambiar el modo");
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
        flex items-center gap-2 rounded-full px-3 py-1.5 text-xs font-medium
        transition-all duration-200 select-none border cursor-pointer
        disabled:opacity-50 disabled:cursor-not-allowed
        ${paused
          ? "bg-amber-500/10 border-amber-500/20 text-amber-600 dark:text-amber-400 hover:bg-amber-500/20"
          : "bg-primary/10 border-primary/20 text-primary hover:bg-primary/20"
        }
      `}
    >
      {/* Switch track */}
      <div className={`
        relative w-8 h-[18px] rounded-full transition-colors duration-200 flex-shrink-0
        ${paused ? "bg-amber-400/30" : "bg-primary/30"}
      `}>
        <span className={`
          absolute top-0.5 w-3.5 h-3.5 rounded-full shadow-sm transition-all duration-200
          ${paused ? "left-0.5 bg-amber-500 dark:bg-amber-400" : "left-4 bg-primary"}
        `} />
      </div>

      {paused
        ? <><Hand size={11} className="flex-shrink-0" />Manual</>
        : <><Bot size={11} className="flex-shrink-0" /><span className="flex items-center gap-1">IA<span className={`w-1.5 h-1.5 rounded-full bg-primary animate-pulse`} /></span></>
      }
    </button>
  );
}
