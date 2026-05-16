"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import { FenomaMark } from "@/components/FenomaMark";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);

    const supabase = createClient();
    const { error } = await supabase.auth.signInWithPassword({ email, password });

    if (error) {
      toast.error(error.message);
      setLoading(false);
      return;
    }

    router.push("/dashboard");
    router.refresh();
  }

  return (
    <div className="min-h-full flex items-center justify-center bg-cream px-4">
      <div className="relative w-full max-w-sm">
        {/* Brand */}
        <div className="flex flex-col items-center gap-4 mb-10">
          <FenomaMark tone="auto" size={64} />
          <div className="flex items-center gap-3" aria-hidden="true">
            <span className="block w-8 h-px bg-line-strong" />
            <span className="text-stone text-[10px]">◆</span>
            <span className="block w-8 h-px bg-line-strong" />
          </div>
          <p className="font-display text-[26px] text-ink leading-none">Fenoma</p>
        </div>

        {/* Card */}
        <div className="bg-cream-raised border border-line rounded-3xl px-8 py-8">
          <h1 className="font-display text-[22px] text-ink text-center mb-1 leading-tight">
            Bienvenido
          </h1>
          <p className="text-[13px] text-stone text-center mb-7">
            Ingresá para acceder al panel
          </p>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-1.5">
              <label className="text-[10px] font-bold text-stone uppercase tracking-[0.14em]">
                Email
              </label>
              <input
                type="email"
                placeholder="tu@empresa.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                className="
                  w-full rounded-xl bg-cream border border-line px-4 py-2.5
                  text-sm text-ink placeholder:text-stone
                  outline-none focus:border-accent focus:bg-cream-soft
                  transition-colors duration-150
                "
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-[10px] font-bold text-stone uppercase tracking-[0.14em]">
                Contraseña
              </label>
              <input
                type="password"
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                className="
                  w-full rounded-xl bg-cream border border-line px-4 py-2.5
                  text-sm text-ink placeholder:text-stone
                  outline-none focus:border-accent focus:bg-cream-soft
                  transition-colors duration-150
                "
              />
            </div>

            <button
              type="submit"
              disabled={loading}
              className="
                w-full flex items-center justify-center gap-2 mt-4
                rounded-full bg-ink text-cream
                py-2.5 text-[13px] font-medium
                hover:bg-accent transition-colors duration-150
                disabled:opacity-60 disabled:cursor-not-allowed disabled:hover:bg-ink
                cursor-pointer
              "
            >
              {loading
                ? <><Loader2 size={16} className="animate-spin" />Ingresando…</>
                : "Ingresar"
              }
            </button>
          </form>
        </div>

        <p className="text-center text-[11px] text-stone mt-6 tracking-wide">
          Fenoma · Multi-canal
        </p>
      </div>
    </div>
  );
}
