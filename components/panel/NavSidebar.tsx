"use client";

import { usePathname } from "next/navigation";
import Link from "next/link";
import {
  MessageSquare,
  FileText,
  Megaphone,
  BarChart2,
  Settings,
  Wifi,
} from "lucide-react";
import { cn } from "@/lib/utils";

const NAV_ITEMS = [
  { icon: MessageSquare, label: "Chats",      href: "/dashboard",  implemented: true  },
  { icon: BarChart2,     label: "Analytics",  href: "/analytics",  implemented: true  },
  { icon: FileText,      label: "Plantillas", href: "/templates",  implemented: false },
  { icon: Megaphone,     label: "Campañas",   href: "/campaigns",  implemented: false },
];

function NavItem({
  icon: Icon,
  label,
  href,
  implemented,
  isActive,
}: {
  icon: React.ElementType;
  label: string;
  href: string;
  implemented: boolean;
  isActive: boolean;
}) {
  const cls = cn(
    "w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-[13px] font-medium transition-all duration-200",
    isActive
      ? "bg-violet-100 text-violet-700 font-semibold shadow-sm dark:bg-violet-900/30 dark:text-violet-300"
      : "text-gray-500 hover:text-violet-700 hover:bg-violet-50 dark:text-gray-400 dark:hover:text-violet-300 dark:hover:bg-violet-900/20",
    !implemented && "opacity-40 cursor-not-allowed pointer-events-none"
  );

  if (!implemented) {
    return (
      <button className={cls} disabled aria-disabled="true" title={`${label} — próximamente`}>
        <Icon size={18} strokeWidth={isActive ? 2.2 : 1.8} className="flex-shrink-0" />
        <span className="truncate">{label}</span>
      </button>
    );
  }

  return (
    <Link href={href} className={cls} title={label}>
      <Icon size={18} strokeWidth={isActive ? 2.2 : 1.8} className="flex-shrink-0" />
      <span className="truncate">{label}</span>
    </Link>
  );
}

export function NavSidebar() {
  const pathname = usePathname();

  return (
    <aside className="hidden md:flex flex-col w-[176px] flex-shrink-0 bg-[#F0EDFF] dark:bg-[#150F2C] border-r border-violet-100 dark:border-[#2D2A45]">
      {/* Brand */}
      <div className="px-4 py-5 border-b border-violet-100 dark:border-[#2D2A45]">
        <div className="flex items-center gap-3">
          <div className="flex-shrink-0 w-9 h-9 rounded-xl bg-violet-600 flex items-center justify-center shadow-md shadow-violet-200 dark:shadow-violet-900/40">
            <span className="block dark:hidden">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src="/brand/Fenoma%20Simbolo%20PNG.png"
                alt=""
                width={22}
                height={22}
                className="object-contain brightness-0 invert"
                aria-hidden="true"
              />
            </span>
            <span className="hidden dark:block">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src="/brand/Fenoma%20Simbolo%20Blanco%3B%20Violeta.png"
                alt=""
                width={22}
                height={22}
                className="object-contain"
                aria-hidden="true"
              />
            </span>
          </div>
          <div>
            <p className="font-display text-[15px] font-bold text-gray-900 dark:text-white leading-none tracking-tight">
              Fenoma
            </p>
            <p className="text-[10px] text-violet-500 dark:text-violet-400 leading-none mt-1 font-medium">
              Multi-canal
            </p>
          </div>
        </div>
      </div>

      {/* Nav */}
      <nav className="flex-1 px-2.5 py-3 flex flex-col gap-0.5">
        {NAV_ITEMS.map(({ icon, label, href, implemented }) => {
          const isActive =
            href === "/dashboard"
              ? pathname.startsWith("/dashboard")
              : pathname.startsWith(href);
          return (
            <NavItem
              key={label}
              icon={icon}
              label={label}
              href={href}
              implemented={implemented}
              isActive={isActive}
            />
          );
        })}
      </nav>

      {/* Bottom */}
      <div className="px-2.5 pb-4 flex flex-col gap-1 border-t border-violet-100 dark:border-[#2D2A45] pt-3">
        <Link
          href="/settings"
          className={cn(
            "w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-[13px] font-medium transition-all duration-200",
            pathname === "/settings"
              ? "bg-violet-100 text-violet-700 font-semibold dark:bg-violet-900/30 dark:text-violet-300"
              : "text-gray-500 hover:text-violet-700 hover:bg-violet-50 dark:text-gray-400 dark:hover:text-violet-300 dark:hover:bg-violet-900/20"
          )}
        >
          <Settings size={18} strokeWidth={1.8} className="flex-shrink-0" />
          <span>Ajustes</span>
        </Link>

        {/* Agent status card */}
        <div className="mt-1 rounded-xl bg-white/60 dark:bg-white/5 border border-violet-100 dark:border-[#2D2A45] px-3 py-2.5">
          <div className="flex items-center gap-2 mb-1.5">
            <div className="w-7 h-7 rounded-full bg-violet-600 flex items-center justify-center text-white text-[11px] font-bold flex-shrink-0">
              A
            </div>
            <div className="min-w-0">
              <p className="text-[12px] font-semibold text-gray-800 dark:text-gray-100 truncate leading-tight">Admin</p>
              <p className="text-[10px] text-gray-400 truncate leading-tight">Agente</p>
            </div>
          </div>
          <div className="flex items-center gap-1.5 pl-0.5">
            <Wifi size={10} className="text-green-500" />
            <span className="text-[10px] font-medium text-green-600 dark:text-green-400">En línea · Activo</span>
          </div>
        </div>
      </div>
    </aside>
  );
}
