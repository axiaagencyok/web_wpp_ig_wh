"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import Link from "next/link";
import {
  MessageSquare,
  FileText,
  Megaphone,
  BarChart2,
  Settings,
  LogOut,
  ShoppingBag,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { createClient } from "@/lib/supabase/client";
import { toast } from "sonner";

const NAV_ITEMS = [
  { icon: MessageSquare, label: "Chats",      href: "/dashboard",  implemented: true  },
  { icon: ShoppingBag,   label: "Mercado Libre", href: "/meli",    implemented: true  },
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
  const baseCls =
    "relative w-full flex flex-col items-center justify-center gap-1.5 py-3 rounded-xl text-[11px] font-medium transition-colors duration-200 select-none";
  const stateCls = isActive
    ? "text-sidebar-foreground bg-sidebar-accent"
    : "text-sidebar-foreground/65 hover:text-sidebar-foreground hover:bg-sidebar-accent/60";
  const disabledCls = !implemented ? "opacity-35 cursor-not-allowed pointer-events-none" : "cursor-pointer";

  const content = (
    <>
      {isActive && (
        <span
          aria-hidden="true"
          className="absolute left-1 top-1/2 -translate-y-1/2 w-[3px] h-7 rounded-full bg-accent"
        />
      )}
      <Icon size={20} strokeWidth={isActive ? 2 : 1.6} className="flex-shrink-0" />
      <span className="leading-none">{label}</span>
    </>
  );

  if (!implemented) {
    return (
      <button
        className={cn(baseCls, stateCls, disabledCls)}
        disabled
        aria-disabled="true"
        title={`${label} — próximamente`}
      >
        {content}
      </button>
    );
  }

  return (
    <Link href={href} className={cn(baseCls, stateCls, disabledCls)} title={label}>
      {content}
    </Link>
  );
}

function AdminMenu() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [signingOut, setSigningOut] = useState(false);
  const [email, setEmail] = useState<string | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const supabase = createClient();
    supabase.auth.getUser().then(({ data }) => setEmail(data.user?.email ?? null));
  }, []);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    function handleKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    if (open) {
      document.addEventListener("mousedown", handleClickOutside);
      document.addEventListener("keydown", handleKey);
    }
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("keydown", handleKey);
    };
  }, [open]);

  async function handleSignOut() {
    setSigningOut(true);
    const supabase = createClient();
    const { error } = await supabase.auth.signOut();
    if (error) {
      toast.error("No se pudo cerrar la sesión");
      setSigningOut(false);
      return;
    }
    router.push("/login");
    router.refresh();
  }

  return (
    <div className="relative" ref={containerRef}>
      <button
        onClick={() => setOpen((o) => !o)}
        title="Menú de la cuenta"
        className="w-full flex flex-col items-center gap-1.5 rounded-xl py-1.5 cursor-pointer hover:bg-sidebar-accent/60 transition-colors"
      >
        <div className="relative">
          <div className="w-9 h-9 rounded-full bg-accent flex items-center justify-center text-sidebar-foreground text-[12px] font-medium">
            A
          </div>
          <span
            aria-hidden="true"
            className="absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 rounded-full bg-emerald-500 ring-2 ring-sidebar"
          />
        </div>
        <p className="text-[10px] text-sidebar-foreground/65 leading-none">En línea</p>
      </button>

      {open && (
        <div
          className="
            absolute left-full bottom-0 ml-2 w-56 z-50
            bg-cream-raised border border-line rounded-2xl shadow-card-lg overflow-hidden
          "
          role="menu"
        >
          <div className="px-4 py-3 border-b border-line">
            <p className="text-[12px] font-medium text-ink leading-tight">Admin</p>
            <p className="text-[11px] text-stone truncate mt-0.5">{email ?? "Agente"}</p>
          </div>
          <button
            onClick={handleSignOut}
            disabled={signingOut}
            className="
              w-full px-4 py-2.5 text-[13px] text-left text-destructive
              hover:bg-cream-soft transition-colors cursor-pointer
              disabled:opacity-60 disabled:cursor-wait
              flex items-center gap-2
            "
            role="menuitem"
          >
            <LogOut size={13} strokeWidth={1.8} />
            {signingOut ? "Cerrando…" : "Cerrar sesión"}
          </button>
        </div>
      )}
    </div>
  );
}

export function NavSidebar() {
  const pathname = usePathname();

  return (
    <aside
      className="
        hidden md:flex flex-col flex-shrink-0
        w-[88px]
        bg-sidebar text-sidebar-foreground
        border-r border-line
      "
    >
      <div className="h-4" aria-hidden="true" />

      <nav className="flex-1 px-2.5 py-2 flex flex-col gap-1">
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

      <div className="px-2.5 pb-2">
        <NavItem
          icon={Settings}
          label="Ajustes"
          href="/settings"
          implemented
          isActive={pathname === "/settings"}
        />
      </div>

      <div className="px-2.5 pb-3 pt-2 border-t border-sidebar-border">
        <AdminMenu />
      </div>
    </aside>
  );
}
