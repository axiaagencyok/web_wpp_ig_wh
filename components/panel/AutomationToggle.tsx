"use client";

import { useState } from "react";
import { Bot, Hand } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

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

    try {
      const res = await fetch(`/api/chats/${conversationId}/toggle-automation`, { method: "PATCH" });
      if (!res.ok) throw new Error("Error al cambiar modo");
      const data = await res.json() as { automation_paused: boolean };
      setPaused(data.automation_paused);
      onToggle(data.automation_paused);
      toast.success(data.automation_paused ? "Modo manual activado" : "IA reactivada", { duration: 1500 });
    } catch {
      setPaused(!next);
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
      className={cn(
        "flex items-center gap-2 rounded-full px-3.5 py-2 text-[12px] font-medium",
        "border transition-colors duration-200 select-none cursor-pointer",
        "disabled:opacity-50 disabled:cursor-not-allowed",
        paused
          ? "bg-stone/10 border-line text-ink-soft hover:bg-stone/15"
          : "bg-accent-soft border-line text-accent hover:bg-accent-soft/80"
      )}
    >
      {/* Toggle track */}
      <div
        className={cn(
          "relative w-8 h-[18px] rounded-full transition-colors duration-200 flex-shrink-0",
          paused ? "bg-stone/30" : "bg-accent/30"
        )}
      >
        <span
          className={cn(
            "absolute top-0.5 w-3.5 h-3.5 rounded-full transition-all duration-200",
            paused ? "left-0.5 bg-stone" : "left-4 bg-accent"
          )}
        />
      </div>

      {paused
        ? <><Hand size={11} className="flex-shrink-0" />Manual</>
        : <><Bot size={11} className="flex-shrink-0" />IA</>
      }
    </button>
  );
}
