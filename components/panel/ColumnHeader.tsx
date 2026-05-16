"use client";

import { useEffect, useState } from "react";
import { useTheme } from "next-themes";
import { Sun, Moon } from "lucide-react";
import { FenomaMark } from "@/components/FenomaMark";

function ThemeToggle() {
  const { setTheme, resolvedTheme } = useTheme();
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  if (!mounted) return <div className="w-9 h-9" />;
  const isDark = resolvedTheme === "dark";
  return (
    <button
      onClick={() => setTheme(isDark ? "light" : "dark")}
      title={isDark ? "Modo claro" : "Modo oscuro"}
      className="w-9 h-9 flex items-center justify-center rounded-full text-ink-soft hover:text-ink hover:bg-cream transition-colors cursor-pointer"
    >
      {isDark ? <Sun size={16} strokeWidth={1.8} /> : <Moon size={16} strokeWidth={1.8} />}
    </button>
  );
}

export function ColumnHeader() {
  return (
    <div className="flex items-center justify-between gap-3 px-5 h-14 border-b border-line flex-shrink-0">
      <div className="flex items-center gap-3 min-w-0">
        <FenomaMark tone="auto" size={24} />
        <div className="leading-none hidden sm:block">
          <p className="font-display text-[18px] text-ink leading-none">Fenoma</p>
          <p className="text-[9.5px] text-stone tracking-[0.14em] uppercase mt-1 leading-none">
            Multi-canal
          </p>
        </div>
      </div>
      <ThemeToggle />
    </div>
  );
}
