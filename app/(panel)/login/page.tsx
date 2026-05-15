"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";

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
    <div className="min-h-full flex items-center justify-center bg-background px-4">
      {/* Subtle background texture */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none opacity-30">
        <div className="absolute -top-60 -right-60 w-[500px] h-[500px] rounded-full bg-accent/10 blur-3xl" />
        <div className="absolute -bottom-60 -left-60 w-[500px] h-[500px] rounded-full bg-accent/8 blur-3xl" />
      </div>

      <div className="relative w-full max-w-sm">
        {/* Brand */}
        <div className="flex flex-col items-center gap-5 mb-10">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/brand/Logo%20Fenoma%20PNG%20vertical.png"
            alt="Fenoma"
            width={140}
            height={140}
            className="object-contain dark:brightness-90"
          />
        </div>

        {/* Card */}
        <div className="bg-card border border-border rounded-3xl px-8 py-8 shadow-sm">
          <h1 className="font-display text-xl font-semibold text-foreground tracking-tight text-center mb-1">
            Bienvenido
          </h1>
          <p className="text-sm text-muted-foreground text-center mb-7">
            Ingresá para acceder al panel
          </p>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                Email
              </label>
              <input
                type="email"
                placeholder="tu@empresa.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                className="
                  w-full rounded-xl bg-muted border border-transparent px-4 py-2.5
                  text-sm text-foreground placeholder:text-muted-foreground
                  outline-none focus:ring-2 focus:ring-primary/20 focus:border-border focus:bg-background
                  transition-all duration-200
                "
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                Contraseña
              </label>
              <input
                type="password"
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                className="
                  w-full rounded-xl bg-muted border border-transparent px-4 py-2.5
                  text-sm text-foreground placeholder:text-muted-foreground
                  outline-none focus:ring-2 focus:ring-primary/20 focus:border-border focus:bg-background
                  transition-all duration-200
                "
              />
            </div>

            <button
              type="submit"
              disabled={loading}
              className="
                w-full flex items-center justify-center gap-2 mt-3
                rounded-xl bg-primary text-primary-foreground
                py-2.5 text-sm font-semibold
                hover:opacity-90 transition-all duration-200
                disabled:opacity-60 disabled:cursor-not-allowed
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

        <p className="text-center text-xs text-muted-foreground mt-6">
          Fenoma · WhatsApp Agent
        </p>
      </div>
    </div>
  );
}
