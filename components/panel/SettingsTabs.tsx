"use client";

import { cn } from "@/lib/utils";

/**
 * Horizontal tab strip usado en /settings.
 *
 * Diseño editorial — sin pills, sin sombras, sin gradientes. Solo una línea
 * inferior de violeta sobre el tab activo para mantener el ritmo cream del
 * resto del panel. Mismo patrón que ya usa /meli para consistencia.
 */

export interface SettingsTab<K extends string = string> {
  key: K;
  label: string;
  hint?: string;
}

export function SettingsTabs<K extends string>({
  tabs,
  active,
  onChange,
}: {
  tabs: ReadonlyArray<SettingsTab<K>>;
  active: K;
  onChange: (key: K) => void;
}) {
  return (
    <div className="border-b border-line bg-cream-raised">
      <nav className="flex gap-1 px-6 overflow-x-auto" aria-label="Secciones">
        {tabs.map((t) => {
          const isActive = t.key === active;
          return (
            <button
              key={t.key}
              type="button"
              onClick={() => onChange(t.key)}
              className={cn(
                "shrink-0 px-3 py-2.5 -mb-px border-b-2 text-sm font-medium transition-colors",
                isActive
                  ? "border-accent text-ink"
                  : "border-transparent text-ink-soft hover:text-ink"
              )}
              aria-current={isActive ? "page" : undefined}
              title={t.hint}
            >
              {t.label}
            </button>
          );
        })}
      </nav>
    </div>
  );
}
