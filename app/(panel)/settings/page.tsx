"use client";

import { useEffect, useState } from "react";
import { Loader2, Phone, Bot, Save, Settings } from "lucide-react";
import { toast } from "sonner";

interface TenantSettings {
  id: string;
  name: string;
  whatsapp_number: string;
  admin_phone: string | null;
  admin_system_prompt: string | null;
  agent_system_prompt: string;
  google_sheet_id: string | null;
  google_sheet_range: string;
  agent_enabled: boolean;
}

export default function SettingsPage() {
  const [settings, setSettings]   = useState<TenantSettings | null>(null);
  const [loading, setLoading]     = useState(true);
  const [saving, setSaving]       = useState(false);

  const [adminPhone, setAdminPhone]     = useState("");
  const [adminPrompt, setAdminPrompt]   = useState("");
  const [agentPrompt, setAgentPrompt]   = useState("");

  useEffect(() => {
    fetch("/api/settings")
      .then(async (r) => {
        if (!r.ok) throw new Error("Error cargando configuración");
        return r.json() as Promise<TenantSettings>;
      })
      .then((data) => {
        setSettings(data);
        setAdminPhone(data.admin_phone ?? "");
        setAdminPrompt(data.admin_system_prompt ?? "");
        setAgentPrompt(data.agent_system_prompt ?? "");
      })
      .catch((err) => toast.error((err as Error).message))
      .finally(() => setLoading(false));
  }, []);

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      const res = await fetch("/api/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          admin_phone:          adminPhone || null,
          admin_system_prompt:  adminPrompt || null,
          agent_system_prompt:  agentPrompt || undefined,
        }),
      });
      if (!res.ok) {
        const d = await res.json() as { error?: string };
        throw new Error(d.error ?? "Error guardando");
      }
      toast.success("Configuración guardada");
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <Loader2 size={20} className="animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="h-full overflow-y-auto bg-muted/20">
      <div className="max-w-2xl mx-auto px-6 py-10 space-y-8">
        {/* Page header */}
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-primary/10 flex items-center justify-center">
            <Settings size={18} className="text-primary" />
          </div>
          <div>
            <h1 className="font-display text-xl font-bold text-foreground">Configuración</h1>
            <p className="text-sm text-muted-foreground">{settings?.name}</p>
          </div>
        </div>

        <form onSubmit={handleSave} className="space-y-6">
          {/* ── Tenant info (readonly) ── */}
          <section className="bg-card border border-border rounded-2xl p-5 space-y-4">
            <h2 className="text-sm font-semibold text-foreground">Información del negocio</h2>

            <Field label="Número principal" icon={<Phone size={13} />}>
              <input
                type="text"
                value={settings?.whatsapp_number ?? ""}
                readOnly
                className={readonlyCls}
              />
            </Field>
          </section>

          {/* ── Admin WhatsApp ── */}
          <section className="bg-card border border-border rounded-2xl p-5 space-y-4">
            <div className="flex items-start gap-2">
              <div className="w-7 h-7 rounded-lg bg-accent/10 flex items-center justify-center flex-shrink-0 mt-0.5">
                <Bot size={14} className="text-accent" />
              </div>
              <div>
                <h2 className="text-sm font-semibold text-foreground">Admin via WhatsApp</h2>
                <p className="text-xs text-muted-foreground mt-0.5">
                  El gerente puede enviar mensajes desde este número para obtener reportes y gestionar el catálogo.
                </p>
              </div>
            </div>

            <Field label="Número del admin" icon={<Phone size={13} />}>
              <input
                type="text"
                value={adminPhone}
                onChange={(e) => setAdminPhone(e.target.value)}
                placeholder="whatsapp:+54911..."
                className={inputCls}
              />
              <p className="text-[10px] text-muted-foreground px-1">
                Formato: <code className="font-mono">whatsapp:+549...</code>
              </p>
            </Field>

            <Field label="Prompt del agente admin" icon={<Bot size={13} />}>
              <textarea
                value={adminPrompt}
                onChange={(e) => setAdminPrompt(e.target.value)}
                placeholder={`Sos el asistente operativo de ${settings?.name ?? "tu negocio"}. El gerente te escribe por WhatsApp para pedirte reportes, modificar el catálogo, o consultar info del negocio. Sos preciso, conciso, profesional. Antes de cualquier acción que modifique datos (precio, broadcast, borrar), pedí confirmación explícita.`}
                rows={6}
                className={`${inputCls} resize-none leading-relaxed`}
              />
            </Field>
          </section>

          {/* ── Agente de atención ── */}
          <section className="bg-card border border-border rounded-2xl p-5 space-y-4">
            <div className="flex items-start gap-2">
              <div className="w-7 h-7 rounded-lg bg-primary/10 flex items-center justify-center flex-shrink-0 mt-0.5">
                <Bot size={14} className="text-primary" />
              </div>
              <div>
                <h2 className="text-sm font-semibold text-foreground">Agente de atención WhatsApp (Lucas)</h2>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Define la personalidad, tono y reglas del agente que responde a los clientes por WhatsApp.
                </p>
              </div>
            </div>

            <Field label="System prompt del agente" icon={<Bot size={13} />}>
              <textarea
                value={agentPrompt}
                onChange={(e) => setAgentPrompt(e.target.value)}
                placeholder={`Sos Cami, la asistente virtual de ${settings?.name ?? "nuestro negocio"}. Respondés consultas de clientes por WhatsApp de forma amigable, clara y concisa. Siempre saludás con calidez, ofrecés ayuda proactiva y derivás a un humano si la consulta es compleja o el cliente lo pide.`}
                rows={8}
                className={`${inputCls} resize-none leading-relaxed`}
              />
              <p className="text-[10px] text-muted-foreground px-1">
                Este prompt define el comportamiento del agente IA con tus clientes. Podés incluir nombre, tono, productos, horarios y restricciones.
              </p>
            </Field>
          </section>

          {/* Save */}
          <div className="flex justify-end">
            <button
              type="submit"
              disabled={saving}
              className="
                flex items-center gap-2 rounded-xl bg-primary text-primary-foreground
                px-5 py-2.5 text-sm font-semibold
                hover:opacity-90 transition-all duration-200
                disabled:opacity-60 disabled:cursor-not-allowed
                shadow-sm shadow-primary/20 cursor-pointer
              "
            >
              {saving
                ? <><Loader2 size={15} className="animate-spin" />Guardando…</>
                : <><Save size={15} />Guardar cambios</>
              }
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

const inputCls = `
  w-full rounded-xl bg-muted border border-transparent px-3 py-2
  text-sm text-foreground placeholder:text-muted-foreground
  outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary/30 focus:bg-background
  transition-all duration-200
`;

const readonlyCls = `
  w-full rounded-xl bg-muted/50 border border-transparent px-3 py-2
  text-sm text-muted-foreground font-mono
  outline-none cursor-default select-all
`;

function Field({ label, icon, children }: { label: string; icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <label className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground uppercase tracking-wider">
        {icon}
        {label}
      </label>
      {children}
    </div>
  );
}
