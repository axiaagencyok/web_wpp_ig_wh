"use client";

import { useEffect, useState } from "react";
import { Loader2, Phone, Bot, Save, Settings } from "lucide-react";
import { toast } from "sonner";
import { ColumnHeader } from "@/components/panel/ColumnHeader";

interface TenantSettings {
  id: string;
  name: string;
  whatsapp_number: string;
  admin_phone: string | null;
  admin_system_prompt: string | null;
  agent_system_prompt: string;
  ig_agent_system_prompt: string | null;
  google_sheet_id: string | null;
  google_sheet_range: string;
  agent_enabled: boolean;
}

// Inline IG logo SVG
function IgIcon({ size = 14 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor">
      <path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zm0-2.163c-3.259 0-3.667.014-4.947.072-4.358.2-6.78 2.618-6.98 6.98-.059 1.281-.073 1.689-.073 4.948 0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98 1.281.058 1.689.072 4.948.072 3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98-1.281-.059-1.69-.073-4.949-.073zm0 5.838c-3.403 0-6.162 2.759-6.162 6.162s2.759 6.163 6.162 6.163 6.162-2.759 6.162-6.163c0-3.403-2.759-6.162-6.162-6.162zm0 10.162c-2.209 0-4-1.79-4-4 0-2.209 1.791-4 4-4s4 1.791 4 4c0 2.21-1.791 4-4 4zm6.406-11.845c-.796 0-1.441.645-1.441 1.44s.645 1.44 1.441 1.44c.795 0 1.439-.645 1.439-1.44s-.644-1.44-1.439-1.44z"/>
    </svg>
  );
}

// Inline WA logo SVG
function WaIcon({ size = 14 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor">
      <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/>
    </svg>
  );
}

export default function SettingsPage() {
  const [settings, setSettings] = useState<TenantSettings | null>(null);
  const [loading, setLoading]   = useState(true);
  const [saving, setSaving]     = useState(false);

  const [adminPhone, setAdminPhone]       = useState("");
  const [adminPrompt, setAdminPrompt]     = useState("");
  const [agentPrompt, setAgentPrompt]     = useState("");
  const [igAgentPrompt, setIgAgentPrompt] = useState("");

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
        setIgAgentPrompt(data.ig_agent_system_prompt ?? "");
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
          admin_phone:            adminPhone || null,
          admin_system_prompt:    adminPrompt || null,
          agent_system_prompt:    agentPrompt || undefined,
          ig_agent_system_prompt: igAgentPrompt || null,
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
      <div className="flex-1 min-w-0 min-h-0 flex flex-col overflow-hidden">
        <ColumnHeader />
        <div className="flex-1 flex items-center justify-center">
          <Loader2 size={20} className="animate-spin text-muted-foreground" />
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 min-w-0 min-h-0 flex flex-col overflow-hidden">
      <ColumnHeader />
      <div className="flex-1 overflow-y-auto">
        <div className="max-w-2xl mx-auto px-6 py-10 space-y-8">
        {/* Page header */}
        <div>
          <h1 className="font-display text-[28px] text-ink leading-tight">Configuración</h1>
          {settings?.name && (
            <p className="text-[13px] text-stone mt-1">{settings.name}</p>
          )}
        </div>

        <form onSubmit={handleSave} className="space-y-6">
          {/* ── Tenant info (readonly) ── */}
          <section className="bg-card border border-border rounded-2xl p-5 space-y-4">
            <h2 className="text-[14px] font-medium text-ink">Información del negocio</h2>

            <Field label="Número principal" icon={<Phone size={13} />}>
              <input
                type="text"
                value={settings?.whatsapp_number ?? ""}
                readOnly
                className={readonlyCls}
              />
            </Field>
          </section>

          {/* ── Lucas — WPP agent ── */}
          <section className="bg-card border border-border rounded-2xl p-5 space-y-4">
            <div className="flex items-start gap-2">
              <div className="w-7 h-7 rounded-lg bg-[#25D366]/15 flex items-center justify-center flex-shrink-0 mt-0.5 text-[#25D366]">
                <WaIcon size={14} />
              </div>
              <div>
                <h2 className="text-[14px] font-medium text-ink">Lucas — agente WhatsApp</h2>
                <p className="text-[12px] text-stone mt-0.5 leading-relaxed">
                  Personalización adicional para Lucas. El prompt base ya está configurado — acá podés agregar instrucciones específicas de tu negocio: nombre de la empresa, horarios, restricciones, etc.
                </p>
              </div>
            </div>

            <Field label="Personalización de Lucas" icon={<Bot size={13} />}>
              <textarea
                value={agentPrompt}
                onChange={(e) => setAgentPrompt(e.target.value)}
                placeholder={`Ejemplo: "La empresa se llama ${settings?.name ?? "tu negocio"}. Atendemos de lunes a sábado de 9 a 18hs. No hacemos envíos internacionales. Si el cliente pregunta por garantía, mencionar que es oficial de 12 meses."`}
                rows={6}
                className={`${inputCls} resize-none leading-relaxed`}
              />
              <p className="text-[10px] text-stone px-1">
                Estas instrucciones se agregan al final del prompt base de Lucas. No reemplaza la lógica principal.
              </p>
            </Field>
          </section>

          {/* ── Cami — IG agent ── */}
          <section className="bg-card border border-border rounded-2xl p-5 space-y-4">
            <div className="flex items-start gap-2">
              <div className="w-7 h-7 rounded-lg bg-[#E1306C]/15 flex items-center justify-center flex-shrink-0 mt-0.5 text-[#E1306C]">
                <IgIcon size={14} />
              </div>
              <div>
                <h2 className="text-[14px] font-medium text-ink">Cami — agente Instagram</h2>
                <p className="text-[12px] text-stone mt-0.5 leading-relaxed">
                  Personalización adicional para Cami. Igual que Lucas, el prompt base ya está configurado — acá agregás lo específico de tu negocio para Instagram.
                </p>
              </div>
            </div>

            <Field label="Personalización de Cami" icon={<Bot size={13} />}>
              <textarea
                value={igAgentPrompt}
                onChange={(e) => setIgAgentPrompt(e.target.value)}
                placeholder={`Ejemplo: "La empresa se llama ${settings?.name ?? "tu negocio"}. Los seguidores de Instagram suelen preguntar por combos y promociones especiales. Si mencionan un reel o historia, responder con entusiasmo."`}
                rows={6}
                className={`${inputCls} resize-none leading-relaxed`}
              />
              <p className="text-[10px] text-stone px-1">
                Estas instrucciones se agregan al final del prompt base de Cami. No reemplaza la lógica principal.
              </p>
            </Field>
          </section>

          {/* ── Juan — admin WhatsApp ── */}
          <section className="bg-card border border-border rounded-2xl p-5 space-y-4">
            <div className="flex items-start gap-2">
              <div className="w-7 h-7 rounded-lg bg-accent/10 flex items-center justify-center flex-shrink-0 mt-0.5">
                <Bot size={14} className="text-accent" />
              </div>
              <div>
                <h2 className="text-[14px] font-medium text-ink">Juan — admin via WhatsApp</h2>
                <p className="text-[12px] text-stone mt-0.5 leading-relaxed">
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
              <p className="text-[10px] text-stone px-1">
                Formato: <code className="font-mono">whatsapp:+549...</code>
              </p>
            </Field>

            <Field label="Personalización del agente admin" icon={<Bot size={13} />}>
              <textarea
                value={adminPrompt}
                onChange={(e) => setAdminPrompt(e.target.value)}
                placeholder={`Sos el asistente operativo de ${settings?.name ?? "tu negocio"}. El gerente te escribe por WhatsApp para pedirte reportes, modificar el catálogo, o consultar info del negocio. Sos preciso, conciso, profesional.`}
                rows={6}
                className={`${inputCls} resize-none leading-relaxed`}
              />
            </Field>
          </section>

          {/* Save */}
          <div className="flex justify-end">
            <button
              type="submit"
              disabled={saving}
              className="
                flex items-center gap-2 rounded-full bg-ink text-cream
                px-5 py-2.5 text-[13px] font-medium
                hover:bg-accent transition-colors duration-150
                disabled:opacity-60 disabled:cursor-not-allowed disabled:hover:bg-ink
                cursor-pointer
              "
            >
              {saving
                ? <><Loader2 size={15} className="animate-spin" />Guardando…</>
                : <><Save size={15} strokeWidth={1.8} />Guardar cambios</>
              }
            </button>
          </div>
        </form>
        </div>
      </div>
    </div>
  );
}

const inputCls = `
  w-full rounded-xl bg-cream border border-line px-3 py-2
  text-sm text-ink placeholder:text-stone
  outline-none focus:border-accent focus:bg-cream-soft
  transition-colors duration-150
`;

const readonlyCls = `
  w-full rounded-xl bg-cream-soft border border-line px-3 py-2
  text-sm text-stone font-mono
  outline-none cursor-default select-all
`;

function Field({ label, icon, children }: { label: string; icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <label className="flex items-center gap-1.5 text-[10px] font-bold text-stone uppercase tracking-[0.14em]">
        {icon}
        {label}
      </label>
      {children}
    </div>
  );
}
