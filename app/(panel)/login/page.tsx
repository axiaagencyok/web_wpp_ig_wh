"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { toast } from "sonner";
import { Loader2, Bot } from "lucide-react";

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
    <div className="min-h-full flex items-center justify-center bg-gradient-to-br from-background via-background to-primary/5 px-4">
      {/* Background decoration */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute -top-40 -right-40 w-96 h-96 rounded-full bg-primary/5 blur-3xl" />
        <div className="absolute -bottom-40 -left-40 w-96 h-96 rounded-full bg-accent/5 blur-3xl" />
      </div>

      <div className="relative w-full max-w-sm">
        {/* Card */}
        <div className="bg-card border border-border rounded-3xl p-8 shadow-xl shadow-black/5">
          {/* Brand */}
          <div className="flex flex-col items-center gap-3 mb-8">
            <div className="w-12 h-12 rounded-2xl bg-primary flex items-center justify-center shadow-lg shadow-primary/25">
              <Bot size={22} className="text-primary-foreground" />
            </div>
            <div className="text-center">
              <h1 className="font-display text-2xl font-bold text-foreground tracking-tight leading-none">
                Fenoma
              </h1>
              <p className="text-sm text-muted-foreground mt-1">
                WhatsApp Agent Panel
              </p>
            </div>
          </div>

          {/* Form */}
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-foreground/70 uppercase tracking-wider">
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
                  outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary/30 focus:bg-background
                  transition-all duration-200
                "
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-medium text-foreground/70 uppercase tracking-wider">
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
                  outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary/30 focus:bg-background
                  transition-all duration-200
                "
              />
            </div>

            <button
              type="submit"
              disabled={loading}
              className="
                w-full flex items-center justify-center gap-2 mt-2
                rounded-xl bg-primary text-primary-foreground
                py-2.5 text-sm font-semibold
                hover:opacity-90 transition-all duration-200
                disabled:opacity-60 disabled:cursor-not-allowed
                shadow-lg shadow-primary/20 cursor-pointer
              "
            >
              {loading
                ? <><Loader2 size={16} className="animate-spin" />Ingresando…</>
                : "Ingresar"
              }
            </button>
          </form>
        </div>

        <p className="text-center text-xs text-muted-foreground mt-5">
          Fenoma · WhatsApp Agent
        </p>
      </div>
    </div>
  );
}
