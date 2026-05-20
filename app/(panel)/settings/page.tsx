"use client";

import { useEffect, useMemo, useState } from "react";
import {
  Loader2,
  Save,
  Bot,
  Sparkles,
  Phone,
  ShoppingBag,
  Mail,
  AlertTriangle,
} from "lucide-react";
import { toast } from "sonner";
import { ColumnHeader } from "@/components/panel/ColumnHeader";
import { SettingsTabs, type SettingsTab } from "@/components/panel/SettingsTabs";
import { cn } from "@/lib/utils";

// ─── Types ────────────────────────────────────────────────────────────────────

type AgentTone = "cercano_casual" | "profesional" | "argentino_divertido" | "neutro_formal";
type OrthographyRule = "voseo_argentino" | "sin_emojis" | "emojis_moderados";

interface TenantSettings {
  id: string;
  name: string;
  whatsapp_number: string;

  // Identidad / admin
  admin_phone: string | null;
  admin_system_prompt: string | null;

  // Prompts crudos
  agent_system_prompt: string;
  ig_agent_system_prompt: string | null;

  // Contextos
  stories_context_general: string | null;
  stories_context_keywords: string | null;
  ads_context_general: string | null;
  ads_context_keywords: string | null;

  // Catálogo (sheets)
  google_sheet_id: string | null;
  google_sheet_range: string;

  // Notificaciones
  lead_notification_email: string | null;

  // Config estructurada del agente (migración 017)
  agent_tone: AgentTone | null;
  agent_orthography: OrthographyRule[];
  agent_active_offer: string | null;
  agent_business_hours: string | null;
  agent_business_hours_alert: boolean;
  agent_temporary_closures: string | null;
  agent_special_instructions: string | null;

  agent_enabled: boolean;
}

interface FormState {
  // Agent
  agent_tone: AgentTone | "";
  agent_orthography: OrthographyRule[];
  agent_active_offer: string;
  agent_business_hours: string;
  agent_business_hours_alert: boolean;
  agent_temporary_closures: string;
  agent_special_instructions: string;

  // Catálogo
  google_sheet_id: string;
  google_sheet_range: string;

  // Contextos
  stories_context_general: string;
  stories_context_keywords: string;
  ads_context_general: string;
  ads_context_keywords: string;

  // Notificaciones
  lead_notification_email: string;

  // Integraciones
  admin_phone: string;
  admin_system_prompt: string;

  // Avanzado
  agent_system_prompt: string;
  ig_agent_system_prompt: string;
}

const EMPTY_FORM: FormState = {
  agent_tone: "",
  agent_orthography: [],
  agent_active_offer: "",
  agent_business_hours: "",
  agent_business_hours_alert: false,
  agent_temporary_closures: "",
  agent_special_instructions: "",
  google_sheet_id: "",
  google_sheet_range: "",
  stories_context_general: "",
  stories_context_keywords: "",
  ads_context_general: "",
  ads_context_keywords: "",
  lead_notification_email: "",
  admin_phone: "",
  admin_system_prompt: "",
  agent_system_prompt: "",
  ig_agent_system_prompt: "",
};

// ─── Tabs config ──────────────────────────────────────────────────────────────

type TabKey =
  | "agent"
  | "catalog"
  | "contexts"
  | "notifications"
  | "integrations"
  | "advanced";

const TABS: ReadonlyArray<SettingsTab<TabKey>> = [
  { key: "agent",         label: "Configuración del agente" },
  { key: "catalog",       label: "Catálogo y productos" },
  { key: "contexts",      label: "Contextos" },
  { key: "notifications", label: "Notificaciones" },
  { key: "integrations",  label: "Integraciones" },
  { key: "advanced",      label: "Avanzado" },
];

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function SettingsPage() {
  const [settings, setSettings] = useState<TenantSettings | null>(null);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [tab, setTab] = useState<TabKey>("agent");

  useEffect(() => {
    fetch("/api/settings")
      .then(async (r) => {
        if (!r.ok) throw new Error("Error cargando configuración");
        return r.json() as Promise<TenantSettings>;
      })
      .then((data) => {
        setSettings(data);
        setForm(tenantToForm(data));
      })
      .catch((err) => toast.error((err as Error).message))
      .finally(() => setLoading(false));
  }, []);

  const dirty = useMemo(() => {
    if (!settings) return false;
    return JSON.stringify(tenantToForm(settings)) !== JSON.stringify(form);
  }, [settings, form]);

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    if (!dirty || saving) return;
    setSaving(true);
    try {
      const res = await fetch("/api/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(formToPatch(form)),
      });
      if (!res.ok) {
        const d = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(d.error ?? "Error guardando");
      }
      toast.success("Configuración guardada");
      // Refrescar settings para que `dirty` se reevalúe contra el nuevo baseline
      const refreshed = (await (await fetch("/api/settings")).json()) as TenantSettings;
      setSettings(refreshed);
      setForm(tenantToForm(refreshed));
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
          <Loader2 size={20} className="animate-spin text-stone" />
        </div>
      </div>
    );
  }

  const onChange = <K extends keyof FormState>(key: K, value: FormState[K]) =>
    setForm((prev) => ({ ...prev, [key]: value }));

  return (
    <div className="flex-1 min-w-0 min-h-0 flex flex-col overflow-hidden">
      <ColumnHeader />

      <header className="px-6 pt-8 pb-5 bg-cream-raised border-b border-line">
        <div className="max-w-3xl mx-auto">
          <h1 className="font-display text-[28px] text-ink leading-tight">Configuración</h1>
          {settings?.name && (
            <p className="text-[13px] text-stone mt-1">{settings.name}</p>
          )}
        </div>
      </header>

      <SettingsTabs tabs={TABS} active={tab} onChange={setTab} />

      <form onSubmit={handleSave} className="flex-1 min-h-0 flex flex-col">
        <div className="flex-1 overflow-y-auto">
          <div className="max-w-3xl mx-auto px-6 py-8 space-y-6">
            {tab === "agent" && <AgentTab form={form} onChange={onChange} />}
            {tab === "catalog" && <CatalogTab form={form} onChange={onChange} />}
            {tab === "contexts" && <ContextsTab form={form} onChange={onChange} />}
            {tab === "notifications" && (
              <NotificationsTab form={form} onChange={onChange} />
            )}
            {tab === "integrations" && (
              <IntegrationsTab
                form={form}
                onChange={onChange}
                tenant={settings}
              />
            )}
            {tab === "advanced" && (
              <AdvancedTab form={form} onChange={onChange} />
            )}
          </div>
        </div>

        <SaveBar dirty={dirty} saving={saving} />
      </form>
    </div>
  );
}

// ─── Tab: Configuración del agente ───────────────────────────────────────────

function AgentTab({
  form,
  onChange,
}: {
  form: FormState;
  onChange: <K extends keyof FormState>(k: K, v: FormState[K]) => void;
}) {
  return (
    <>
      <SectionHeader
        title="Personalidad y reglas"
        body="Cómo te gusta que responda tu agente. Estos campos definen el tono, las normas de estilo, y la información de tu negocio que el agente menciona cuando hace falta."
      />

      <Card>
        <Field label="Tono de habla">
          <Select
            value={form.agent_tone}
            onChange={(v) => onChange("agent_tone", v as AgentTone | "")}
            options={[
              { value: "", label: "Sin definir" },
              { value: "cercano_casual", label: "Cercano y casual" },
              { value: "profesional", label: "Profesional" },
              { value: "argentino_divertido", label: "Argentino divertido" },
              { value: "neutro_formal", label: "Neutro formal" },
            ]}
          />
        </Field>

        <Field label="Reglas de ortografía y estilo" hint="Marcá las que apliquen.">
          <CheckboxGroup
            value={form.agent_orthography}
            onChange={(v) => onChange("agent_orthography", v as OrthographyRule[])}
            options={[
              { value: "voseo_argentino", label: "Usar voseo argentino (vos / tenés / querés)" },
              { value: "emojis_moderados", label: "Permitir emojis moderados" },
              { value: "sin_emojis", label: "Sin emojis" },
            ]}
          />
        </Field>
      </Card>

      <SectionHeader
        title="Promociones y horarios"
        body="Información que el agente puede usar en sus respuestas. Cuando no aplique, dejá el campo vacío."
      />

      <Card>
        <Field
          label="Oferta vigente"
          hint='Una sola promoción activa. Ej. "20% OFF en SPC Click hasta el viernes".'
        >
          <Input
            value={form.agent_active_offer}
            onChange={(v) => onChange("agent_active_offer", v)}
            placeholder='Ej. "20% OFF en SPC Click hasta el viernes"'
          />
        </Field>

        <Field label="Horario de atención">
          <Input
            value={form.agent_business_hours}
            onChange={(v) => onChange("agent_business_hours", v)}
            placeholder="Lun a vie de 9 a 18hs, sáb 9 a 13hs"
          />
        </Field>

        <Field>
          <Checkbox
            checked={form.agent_business_hours_alert}
            onChange={(c) => onChange("agent_business_hours_alert", c)}
            label="Avisar al cliente cuando se contesta fuera de horario"
          />
        </Field>

        <Field
          label="Cierres temporales"
          hint='Solo si vas a estar cerrado un período específico. Ej. "Cerrado del 24/12 al 02/01".'
        >
          <Input
            value={form.agent_temporary_closures}
            onChange={(v) => onChange("agent_temporary_closures", v)}
            placeholder='Ej. "Cerrado del 24/12 al 02/01"'
          />
        </Field>
      </Card>

      <SectionHeader
        title="Instrucciones libres"
        body="Cualquier cosa que no entre en los campos de arriba. Pensá en restricciones específicas o casos de uso particulares."
      />

      <Card>
        <Field
          label="Instrucciones especiales"
          hint={`${form.agent_special_instructions.length} / 500 caracteres`}
        >
          <Textarea
            value={form.agent_special_instructions}
            onChange={(v) => onChange("agent_special_instructions", v.slice(0, 500))}
            rows={5}
            placeholder='Ej. "No prometer plazos de entrega menores a 7 días hábiles. Si el cliente pregunta por accesorios para Air Fryer, sugerir la canasta extra que viene en combo."'
          />
        </Field>
      </Card>

      <FutureNotice>
        Estos campos ya quedan guardados, pero todavía no se aplican automáticamente al
        agente — sigue usando los prompts crudos. En la próxima actualización el agente
        va a leer esta configuración estructurada en vez de los prompts.
      </FutureNotice>
    </>
  );
}

// ─── Tab: Catálogo y productos ────────────────────────────────────────────────

function CatalogTab({
  form,
  onChange,
}: {
  form: FormState;
  onChange: <K extends keyof FormState>(k: K, v: FormState[K]) => void;
}) {
  return (
    <>
      <SectionHeader
        title="Google Sheets"
        body="Si tu catálogo vive en una hoja de Sheets, configurá el ID y el rango. El agente lo lee en cada conversación con un cache corto."
      />

      <Card>
        <Field label="Google Sheet ID" hint="El ID que aparece en la URL del Sheet.">
          <Input
            value={form.google_sheet_id}
            onChange={(v) => onChange("google_sheet_id", v)}
            placeholder="1c7DpWjA7mi18Ii1oyqNnYqKALhOQDnRF1k7Bcfucm0Y"
            mono
          />
        </Field>

        <Field
          label="Rango"
          hint='Hoja y celdas a leer. Ej. "Lista de Precios" o "Productos!A1:G500".'
        >
          <Input
            value={form.google_sheet_range}
            onChange={(v) => onChange("google_sheet_range", v)}
            placeholder="Lista de Precios"
          />
        </Field>
      </Card>

      <SectionHeader
        title="Catálogo PDF"
        body="Si preferís un PDF como fuente, el setup se hace desde el equipo de Fenoma — pedinos que subamos el archivo al bucket. Una vez cargado, el agente lo lee automáticamente."
      />

      <Card>
        <p className="text-[13px] text-ink-soft leading-relaxed">
          La fuente del catálogo (Sheets vs PDF) se configura desde el backend.
          Si querés cambiar a PDF, contactanos.
        </p>
      </Card>
    </>
  );
}

// ─── Tab: Contextos ───────────────────────────────────────────────────────────

function ContextsTab({
  form,
  onChange,
}: {
  form: FormState;
  onChange: <K extends keyof FormState>(k: K, v: FormState[K]) => void;
}) {
  return (
    <>
      <SectionHeader
        title="Stories"
        body="Cuando un seguidor responde una story, el agente usa este contexto para saber a qué producto se refiere. NO incluyas precios ni stock — eso siempre se trae del catálogo."
      />

      <Card>
        <Field
          label="Contexto general"
          hint='Qué producto o tema publicaste hoy. Ej. "Hoy publicamos vasos de vidrio".'
        >
          <Textarea
            value={form.stories_context_general}
            onChange={(v) => onChange("stories_context_general", v)}
            rows={3}
            placeholder="Hoy publicamos vasos de vidrio"
          />
        </Field>

        <Field
          label="Palabras clave"
          hint='Si publicaste varios productos, listalos con su keyword. Ej. "VASOS: vasos de vidrio. JARROS: jarros de cerámica".'
        >
          <Textarea
            value={form.stories_context_keywords}
            onChange={(v) => onChange("stories_context_keywords", v)}
            rows={4}
            placeholder="VASOS: vasos de vidrio. JARROS: jarros de cerámica"
          />
        </Field>
      </Card>

      <SectionHeader
        title="Anuncios"
        body="Cuando alguien clickea un ad y escribe, el agente usa este contexto. Misma lógica que stories — sin precios ni stock."
      />

      <Card>
        <Field
          label="Contexto general"
          hint='Qué se está promocionando. Ej. "Estamos promocionando air fryers".'
        >
          <Textarea
            value={form.ads_context_general}
            onChange={(v) => onChange("ads_context_general", v)}
            rows={3}
            placeholder="Estamos promocionando air fryers"
          />
        </Field>

        <Field
          label="Palabras clave"
          hint='Si la campaña tiene varios productos. Ej. "AIR: air fryer Liliana. TV: televisor Samsung".'
        >
          <Textarea
            value={form.ads_context_keywords}
            onChange={(v) => onChange("ads_context_keywords", v)}
            rows={4}
            placeholder="AIR: air fryer Liliana. TV: televisor Samsung"
          />
        </Field>
      </Card>
    </>
  );
}

// ─── Tab: Notificaciones ──────────────────────────────────────────────────────

function NotificationsTab({
  form,
  onChange,
}: {
  form: FormState;
  onChange: <K extends keyof FormState>(k: K, v: FormState[K]) => void;
}) {
  return (
    <>
      <SectionHeader
        title="Mail de notificación"
        body="Cuando un lead supera el score de 60 puntos, te llega un mail con los datos extraídos por el agente."
      />

      <Card>
        <Field label="Email destino" icon={<Mail size={13} strokeWidth={1.8} />}>
          <Input
            type="email"
            value={form.lead_notification_email}
            onChange={(v) => onChange("lead_notification_email", v)}
            placeholder="vos@tuempresa.com"
          />
          <p className="text-[11px] text-stone leading-relaxed">
            Si lo dejás vacío no se envían notificaciones — los leads igual se guardan
            en la base.
          </p>
        </Field>
      </Card>
    </>
  );
}

// ─── Tab: Integraciones ───────────────────────────────────────────────────────

function IntegrationsTab({
  form,
  onChange,
  tenant,
}: {
  form: FormState;
  onChange: <K extends keyof FormState>(k: K, v: FormState[K]) => void;
  tenant: TenantSettings | null;
}) {
  return (
    <>
      <SectionHeader
        title="WhatsApp"
        body="Número principal y configuración del canal admin."
      />

      <Card>
        <Field label="Número principal">
          <Input value={tenant?.whatsapp_number ?? ""} readOnly mono />
        </Field>

        <Field
          label="Número del admin"
          hint='Formato: "whatsapp:+549..."'
          icon={<Phone size={13} strokeWidth={1.8} />}
        >
          <Input
            value={form.admin_phone}
            onChange={(v) => onChange("admin_phone", v)}
            placeholder="whatsapp:+549..."
            mono
          />
        </Field>

        <Field
          label="Prompt del agente admin"
          hint="Qué rol cumple el agente cuando recibe mensajes del admin."
        >
          <Textarea
            value={form.admin_system_prompt}
            onChange={(v) => onChange("admin_system_prompt", v)}
            rows={5}
            placeholder="Sos el asistente operativo de tu negocio. El admin te escribe por WhatsApp para pedirte reportes, modificar el catálogo o consultar info."
          />
        </Field>
      </Card>

      <SectionHeader
        title="Mercado Libre"
        body="La configuración de MELI se edita desde su panel propio."
      />

      <Card>
        <a
          href="/meli"
          className="
            inline-flex items-center gap-2 text-[13px] font-medium text-accent
            hover:underline underline-offset-2
          "
        >
          <ShoppingBag size={14} strokeWidth={1.8} />
          Ir al panel de Mercado Libre →
        </a>
      </Card>

      <SectionHeader
        title="Instagram"
        body="El canal IG se conecta vía ManyChat — no requiere config desde acá."
      />

      <Card>
        <p className="text-[13px] text-ink-soft leading-relaxed">
          Si necesitás cambiar la cuenta IG vinculada o ajustar el flow de ManyChat,
          contactanos.
        </p>
      </Card>
    </>
  );
}

// ─── Tab: Avanzado ────────────────────────────────────────────────────────────

function AdvancedTab({
  form,
  onChange,
}: {
  form: FormState;
  onChange: <K extends keyof FormState>(k: K, v: FormState[K]) => void;
}) {
  return (
    <>
      <div className="rounded-2xl border border-amber-500/30 bg-amber-500/5 px-4 py-3 flex items-start gap-3">
        <AlertTriangle
          size={16}
          strokeWidth={1.8}
          className="text-amber-600 mt-0.5 flex-shrink-0"
        />
        <div className="space-y-1">
          <p className="text-[13px] font-medium text-ink">Modo avanzado</p>
          <p className="text-[12px] text-ink-soft leading-relaxed">
            Editar los prompts crudos override la configuración estructurada de la pestaña
            <em> Configuración del agente</em>. Usalo solo si necesitás un comportamiento
            que no entre en los campos estándar.
          </p>
        </div>
      </div>

      <SectionHeader
        title="Mati — agente WhatsApp"
        body="Prompt completo del agente para conversaciones por WhatsApp. Quedó como histórico — el runtime ya no lee este campo (ver compose-prompt)."
      />

      <Card>
        <Field label="System prompt" icon={<Bot size={13} strokeWidth={1.8} />}>
          <Textarea
            value={form.agent_system_prompt}
            onChange={(v) => onChange("agent_system_prompt", v)}
            rows={14}
            placeholder="Sos Mati, el asistente virtual de…"
            mono
          />
        </Field>
      </Card>

      <SectionHeader
        title="Cami / Matías — agente Instagram"
        body="Prompt completo del agente para conversaciones por Instagram."
      />

      <Card>
        <Field label="System prompt" icon={<Bot size={13} strokeWidth={1.8} />}>
          <Textarea
            value={form.ig_agent_system_prompt}
            onChange={(v) => onChange("ig_agent_system_prompt", v)}
            rows={14}
            placeholder="Sos Cami, asistente virtual de…"
            mono
          />
        </Field>
      </Card>
    </>
  );
}

// ─── Save bar (sticky bottom) ─────────────────────────────────────────────────

function SaveBar({ dirty, saving }: { dirty: boolean; saving: boolean }) {
  return (
    <div className="border-t border-line bg-cream-raised px-6 py-3">
      <div className="max-w-3xl mx-auto flex items-center justify-between gap-4">
        <p className="text-[12px] text-stone">
          {saving
            ? "Guardando…"
            : dirty
              ? "Tenés cambios sin guardar"
              : "Todos los cambios guardados"}
        </p>
        <button
          type="submit"
          disabled={!dirty || saving}
          className="
            inline-flex items-center gap-2 rounded-full bg-ink text-cream
            px-5 py-2 text-[13px] font-medium
            hover:bg-accent transition-colors duration-150
            disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-ink
          "
        >
          {saving ? (
            <>
              <Loader2 size={14} className="animate-spin" />
              Guardando…
            </>
          ) : (
            <>
              <Save size={14} strokeWidth={1.8} />
              Guardar cambios
            </>
          )}
        </button>
      </div>
    </div>
  );
}

// ─── Reusable form atoms ──────────────────────────────────────────────────────

function SectionHeader({ title, body }: { title: string; body: string }) {
  return (
    <div className="pt-2">
      <h2 className="font-display text-[18px] text-ink leading-tight">{title}</h2>
      <p className="text-[13px] text-ink-soft mt-1 leading-relaxed max-w-prose">{body}</p>
    </div>
  );
}

function Card({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded-2xl border border-line bg-cream-raised p-5 space-y-5 shadow-card">
      {children}
    </div>
  );
}

function Field({
  label,
  icon,
  hint,
  children,
}: {
  label?: string;
  icon?: React.ReactNode;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      {label && (
        <label className="flex items-center gap-1.5 text-[11px] font-medium text-ink uppercase tracking-wider">
          {icon}
          {label}
        </label>
      )}
      {children}
      {hint && <p className="text-[11px] text-stone leading-relaxed">{hint}</p>}
    </div>
  );
}

const inputBase = "w-full rounded-xl bg-cream border border-line px-3.5 py-2.5 text-[14px] text-ink placeholder:text-stone outline-none focus:border-accent focus:bg-cream-soft transition-colors";

function Input({
  value,
  onChange,
  placeholder,
  readOnly = false,
  mono = false,
  type = "text",
}: {
  value: string;
  onChange?: (v: string) => void;
  placeholder?: string;
  readOnly?: boolean;
  mono?: boolean;
  type?: "text" | "email";
}) {
  return (
    <input
      type={type}
      value={value}
      onChange={(e) => onChange?.(e.target.value)}
      placeholder={placeholder}
      readOnly={readOnly}
      className={cn(
        inputBase,
        mono && "font-mono text-[13px]",
        readOnly && "bg-cream-soft text-stone cursor-default select-all"
      )}
    />
  );
}

function Textarea({
  value,
  onChange,
  rows = 4,
  placeholder,
  mono = false,
}: {
  value: string;
  onChange: (v: string) => void;
  rows?: number;
  placeholder?: string;
  mono?: boolean;
}) {
  return (
    <textarea
      value={value}
      onChange={(e) => onChange(e.target.value)}
      rows={rows}
      placeholder={placeholder}
      className={cn(
        inputBase,
        "resize-none leading-relaxed",
        mono && "font-mono text-[12.5px] leading-[1.55]"
      )}
    />
  );
}

function Select({
  value,
  onChange,
  options,
}: {
  value: string;
  onChange: (v: string) => void;
  options: ReadonlyArray<{ value: string; label: string }>;
}) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className={cn(inputBase, "appearance-none pr-9 bg-cream")}
      style={{
        backgroundImage:
          "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='8' viewBox='0 0 12 8' fill='none'%3E%3Cpath d='M1 1.5L6 6.5L11 1.5' stroke='%236E6878' stroke-width='1.5' stroke-linecap='round' stroke-linejoin='round'/%3E%3C/svg%3E\")",
        backgroundRepeat: "no-repeat",
        backgroundPosition: "right 14px center",
      }}
    >
      {options.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </select>
  );
}

function Checkbox({
  checked,
  onChange,
  label,
}: {
  checked: boolean;
  onChange: (c: boolean) => void;
  label: string;
}) {
  return (
    <label className="flex items-start gap-2.5 cursor-pointer select-none group">
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="
          mt-0.5 size-4 rounded border-line accent-accent cursor-pointer
          focus:ring-1 focus:ring-accent focus:ring-offset-1
        "
      />
      <span className="text-[13px] text-ink leading-snug group-hover:text-accent transition-colors">
        {label}
      </span>
    </label>
  );
}

function CheckboxGroup<T extends string>({
  value,
  onChange,
  options,
}: {
  value: T[];
  onChange: (v: T[]) => void;
  options: ReadonlyArray<{ value: T; label: string }>;
}) {
  function toggle(v: T) {
    if (value.includes(v)) onChange(value.filter((x) => x !== v));
    else onChange([...value, v]);
  }
  return (
    <div className="space-y-2">
      {options.map((o) => (
        <Checkbox
          key={o.value}
          checked={value.includes(o.value)}
          onChange={() => toggle(o.value)}
          label={o.label}
        />
      ))}
    </div>
  );
}

function FutureNotice({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded-2xl border border-line bg-cream-soft px-4 py-3 flex items-start gap-3">
      <Sparkles size={15} strokeWidth={1.8} className="text-accent mt-0.5 flex-shrink-0" />
      <p className="text-[12px] text-ink-soft leading-relaxed">{children}</p>
    </div>
  );
}

// ─── State <-> server payload ─────────────────────────────────────────────────

function tenantToForm(t: TenantSettings): FormState {
  return {
    agent_tone: t.agent_tone ?? "",
    agent_orthography: t.agent_orthography ?? [],
    agent_active_offer: t.agent_active_offer ?? "",
    agent_business_hours: t.agent_business_hours ?? "",
    agent_business_hours_alert: t.agent_business_hours_alert ?? false,
    agent_temporary_closures: t.agent_temporary_closures ?? "",
    agent_special_instructions: t.agent_special_instructions ?? "",
    google_sheet_id: t.google_sheet_id ?? "",
    google_sheet_range: t.google_sheet_range ?? "",
    stories_context_general: t.stories_context_general ?? "",
    stories_context_keywords: t.stories_context_keywords ?? "",
    ads_context_general: t.ads_context_general ?? "",
    ads_context_keywords: t.ads_context_keywords ?? "",
    lead_notification_email: t.lead_notification_email ?? "",
    admin_phone: t.admin_phone ?? "",
    admin_system_prompt: t.admin_system_prompt ?? "",
    agent_system_prompt: t.agent_system_prompt ?? "",
    ig_agent_system_prompt: t.ig_agent_system_prompt ?? "",
  };
}

/** Convierte "" → null para campos opcionales; mantiene undefined para no tocar columnas no editadas. */
function formToPatch(f: FormState) {
  const orEmpty = (v: string) => (v.trim() === "" ? null : v);
  return {
    // Agent (017)
    agent_tone: f.agent_tone === "" ? null : f.agent_tone,
    agent_orthography: f.agent_orthography,
    agent_active_offer: orEmpty(f.agent_active_offer),
    agent_business_hours: orEmpty(f.agent_business_hours),
    agent_business_hours_alert: f.agent_business_hours_alert,
    agent_temporary_closures: orEmpty(f.agent_temporary_closures),
    agent_special_instructions: orEmpty(f.agent_special_instructions),

    // Catálogo
    google_sheet_id: orEmpty(f.google_sheet_id),
    google_sheet_range: f.google_sheet_range.trim() === "" ? undefined : f.google_sheet_range,

    // Contextos
    stories_context_general: orEmpty(f.stories_context_general),
    stories_context_keywords: orEmpty(f.stories_context_keywords),
    ads_context_general: orEmpty(f.ads_context_general),
    ads_context_keywords: orEmpty(f.ads_context_keywords),

    // Notificaciones
    lead_notification_email: orEmpty(f.lead_notification_email),

    // Integraciones
    admin_phone: orEmpty(f.admin_phone),
    admin_system_prompt: orEmpty(f.admin_system_prompt),

    // Avanzado
    agent_system_prompt: f.agent_system_prompt.trim() === "" ? undefined : f.agent_system_prompt,
    ig_agent_system_prompt: orEmpty(f.ig_agent_system_prompt),
  };
}

