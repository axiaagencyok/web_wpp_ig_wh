"use client";

import { useEffect, useState } from "react";
import {
  Loader2,
  Save,
  Phone,
  ShoppingBag,
  Mail,
  FileText,
  Upload,
  CheckCircle2,
  AlertCircle,
} from "lucide-react";
import { toast } from "sonner";
import { ColumnHeader } from "@/components/panel/ColumnHeader";
import { SettingsTabs, type SettingsTab } from "@/components/panel/SettingsTabs";
import { cn } from "@/lib/utils";

// ─── Types ────────────────────────────────────────────────────────────────────

type CatalogSource = "sheets" | "pdf";
type PromptChannel = "ig" | "wpp" | "meli";

interface TenantSettings {
  id: string;
  name: string;
  whatsapp_number: string;

  // Identidad / admin
  admin_phone: string | null;
  admin_system_prompt: string | null;

  // Contextos
  stories_context_general: string | null;
  stories_context_keywords: string | null;
  ads_context_general: string | null;
  ads_context_keywords: string | null;

  // Catálogo
  catalog_source: CatalogSource;
  catalog_pdf_path: string | null;
  catalog_text_cached_at: string | null;
  google_sheet_id: string | null;
  google_sheet_range: string;

  // Notificaciones
  lead_notification_email: string | null;
  handoff_notification_email: string | null;
  handoff_notifications_enabled: boolean;

  // Prompts por canal (migración 023). Cada uno es el system prompt
  // COMPLETO del agente para ese canal — fuente única de verdad.
  agent_name: string | null;
  ig_agent_system_prompt: string | null;
  wpp_agent_system_prompt: string | null;
  meli_agent_system_prompt: string | null;

  agent_enabled: boolean;
}

interface FormState {
  // Prompts por canal
  agent_name: string;
  ig_agent_system_prompt: string;
  wpp_agent_system_prompt: string;
  meli_agent_system_prompt: string;

  // Catálogo
  catalog_source: CatalogSource;
  google_sheet_id: string;
  google_sheet_range: string;

  // Contextos
  stories_context_general: string;
  stories_context_keywords: string;
  ads_context_general: string;
  ads_context_keywords: string;

  // Notificaciones
  lead_notification_email: string;
  handoff_notification_email: string;
  handoff_notifications_enabled: boolean;

  // Integraciones
  admin_phone: string;
  admin_system_prompt: string;
}

const EMPTY_FORM: FormState = {
  agent_name: "",
  ig_agent_system_prompt: "",
  wpp_agent_system_prompt: "",
  meli_agent_system_prompt: "",
  catalog_source: "sheets",
  google_sheet_id: "",
  google_sheet_range: "",
  stories_context_general: "",
  stories_context_keywords: "",
  ads_context_general: "",
  ads_context_keywords: "",
  lead_notification_email: "",
  handoff_notification_email: "",
  handoff_notifications_enabled: true,
  admin_phone: "",
  admin_system_prompt: "",
};

// ─── Tabs config ──────────────────────────────────────────────────────────────

type TabKey =
  | "prompts"
  | "catalog"
  | "contexts"
  | "notifications"
  | "integrations";

const TABS: ReadonlyArray<SettingsTab<TabKey>> = [
  { key: "prompts",       label: "Prompts del agente" },
  { key: "catalog",       label: "Catálogo y productos" },
  { key: "contexts",      label: "Contextos" },
  { key: "notifications", label: "Notificaciones" },
  { key: "integrations",  label: "Integraciones" },
];

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function SettingsPage() {
  const [settings, setSettings] = useState<TenantSettings | null>(null);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  // `dirty` se trackea como flag explícito en vez de comparar form vs settings
  // con JSON.stringify. Cualquier llamada a `onChange` (definida abajo) lo
  // levanta a true; los puntos donde resincronizamos form con la fuente de
  // verdad del server (load inicial, post-save, refresh manual) lo bajan a
  // false. Esto evita falsos negativos por ordering de claves o por re-renders
  // que conservaban referencias.
  const [dirty, setDirty] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [tab, setTab] = useState<TabKey>("prompts");

  useEffect(() => {
    fetch("/api/settings")
      .then(async (r) => {
        if (!r.ok) throw new Error("Error cargando configuración");
        return r.json() as Promise<TenantSettings>;
      })
      .then((data) => {
        setSettings(data);
        setForm(tenantToForm(data));
        setDirty(false);
      })
      .catch((err) => toast.error((err as Error).message))
      .finally(() => setLoading(false));
  }, []);

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
      const refreshed = (await (await fetch("/api/settings")).json()) as TenantSettings;
      setSettings(refreshed);
      setForm(tenantToForm(refreshed));
      setDirty(false);
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

  const onChange = <K extends keyof FormState>(key: K, value: FormState[K]) => {
    setForm((prev) => ({ ...prev, [key]: value }));
    setDirty(true);
  };

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
            {tab === "prompts" && <PromptsTab form={form} onChange={onChange} />}
            {tab === "catalog" && (
              <CatalogTab
                form={form}
                onChange={onChange}
                tenant={settings}
                onTenantRefresh={async () => {
                  const r = await fetch("/api/settings");
                  if (r.ok) {
                    const fresh = (await r.json()) as TenantSettings;
                    setSettings(fresh);
                    setForm(tenantToForm(fresh));
                    setDirty(false);
                  }
                }}
              />
            )}
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
          </div>
        </div>

        <SaveBar dirty={dirty} saving={saving} />
      </form>
    </div>
  );
}

// ─── Tab: Prompts del agente ─────────────────────────────────────────────────

const CHANNEL_FIELD: Record<PromptChannel, "ig_agent_system_prompt" | "wpp_agent_system_prompt" | "meli_agent_system_prompt"> = {
  ig:   "ig_agent_system_prompt",
  wpp:  "wpp_agent_system_prompt",
  meli: "meli_agent_system_prompt",
};

const CHANNEL_LABELS: Record<PromptChannel, string> = {
  ig:   "Instagram",
  wpp:  "WhatsApp",
  meli: "Mercado Libre",
};

function PromptsTab({
  form,
  onChange,
}: {
  form: FormState;
  onChange: <K extends keyof FormState>(k: K, v: FormState[K]) => void;
}) {
  const [channel, setChannel] = useState<PromptChannel>("ig");
  const field = CHANNEL_FIELD[channel];
  const value = form[field];

  return (
    <>
      <SectionHeader
        title="Prompts del agente"
        body="Editá el system prompt completo del agente para este canal. Es la fuente única de verdad. El catálogo y los contextos dinámicos se inyectan automáticamente — no los pongas acá."
      />

      <Card>
        <Field label="Nombre del agente" hint='Cómo se presenta a los clientes. Ej. "Cami", "Matías".'>
          <Input
            value={form.agent_name}
            onChange={(v) => onChange("agent_name", v)}
            placeholder="Cami"
          />
        </Field>

        <Field label="Canal" hint="Cada canal tiene su prompt independiente.">
          <div className="flex gap-2">
            {(Object.keys(CHANNEL_LABELS) as PromptChannel[]).map((c) => {
              const isActive = c === channel;
              return (
                <button
                  key={c}
                  type="button"
                  onClick={() => setChannel(c)}
                  className={cn(
                    "px-4 py-2 rounded-full border text-[13px] font-medium transition-colors",
                    isActive
                      ? "border-accent bg-accent-soft text-ink"
                      : "border-line bg-cream text-ink-soft hover:bg-cream-soft"
                  )}
                >
                  {CHANNEL_LABELS[c]}
                </button>
              );
            })}
          </div>
        </Field>

        <Field
          label={`Prompt — ${CHANNEL_LABELS[channel]}`}
          hint={`${value.length} caracteres. Mínimo recomendado: ~500. Máximo aceptado por el servidor: 20.000.`}
        >
          <textarea
            value={value}
            onChange={(e) => onChange(field, e.target.value)}
            placeholder={`Escribí el system prompt del agente para ${CHANNEL_LABELS[channel]}…`}
            className={cn(
              inputBase,
              "resize-y leading-relaxed font-mono text-[12.5px]"
            )}
            style={{ minHeight: 600 }}
          />
        </Field>

        <p className="text-[11px] text-stone leading-relaxed">
          El catálogo y el contexto del comentario IG se inyectan como prefijo
          automáticamente — no los duplices acá. La regla anti-alucinación global
          también se agrega como sufijo en cada turno.
        </p>
      </Card>
    </>
  );
}

// ─── Tab: Catálogo y productos ────────────────────────────────────────────────

function CatalogTab({
  form,
  onChange,
  tenant,
  onTenantRefresh,
}: {
  form: FormState;
  onChange: <K extends keyof FormState>(k: K, v: FormState[K]) => void;
  tenant: TenantSettings | null;
  onTenantRefresh: () => Promise<void>;
}) {
  return (
    <>
      <SectionHeader
        title="Fuente del catálogo"
        body="El asistente lee el catálogo para responder consultas. Cuando lo actualices, los próximos mensajes ya usan la versión nueva."
      />

      <Card>
        <Field label="Tipo de fuente">
          <RadioGroup
            value={form.catalog_source}
            onChange={(v) => onChange("catalog_source", v as CatalogSource)}
            options={[
              {
                value: "sheets",
                label: "Google Sheets",
                hint: "Tu catálogo en una hoja de cálculo. Se actualiza en vivo cada vez que editás el sheet.",
              },
              {
                value: "pdf",
                label: "Archivo PDF",
                hint: "Subís un PDF con tu catálogo. Lo cambiás cuando quieras desde acá.",
              },
            ]}
          />
        </Field>
      </Card>

      {form.catalog_source === "sheets" ? (
        <SheetsConfig form={form} onChange={onChange} />
      ) : (
        <PdfConfig tenant={tenant} onUploaded={onTenantRefresh} />
      )}
    </>
  );
}

function SheetsConfig({
  form,
  onChange,
}: {
  form: FormState;
  onChange: <K extends keyof FormState>(k: K, v: FormState[K]) => void;
}) {
  const [validating, setValidating] = useState(false);
  const [result, setResult] = useState<{ ok: boolean; message: string } | null>(null);

  async function validate() {
    if (validating) return;
    if (!form.google_sheet_id.trim() || !form.google_sheet_range.trim()) {
      setResult({ ok: false, message: "Cargá el Sheet ID y el rango antes de validar." });
      return;
    }
    setValidating(true);
    setResult(null);
    try {
      const res = await fetch("/api/settings/catalog-validate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          google_sheet_id: form.google_sheet_id,
          google_sheet_range: form.google_sheet_range,
        }),
      });
      const json = (await res.json()) as { ok: boolean; empty?: boolean; error?: string };
      if (json.ok) {
        setResult({
          ok: true,
          message: json.empty
            ? "Conexión OK — pero el rango no devolvió filas. Revisá que el Sheet tenga headers + al menos una fila."
            : "Conexión OK. El asistente puede leer este catálogo.",
        });
      } else {
        setResult({ ok: false, message: json.error ?? "Error desconocido" });
      }
    } catch (e) {
      setResult({ ok: false, message: (e as Error).message });
    } finally {
      setValidating(false);
    }
  }

  return (
    <Card>
      <Field label="Google Sheet ID" hint="El ID que aparece en la URL del Sheet entre /d/ y /edit.">
        <Input
          value={form.google_sheet_id}
          onChange={(v) => {
            onChange("google_sheet_id", v);
            setResult(null);
          }}
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
          onChange={(v) => {
            onChange("google_sheet_range", v);
            setResult(null);
          }}
          placeholder="Lista de Precios"
        />
      </Field>

      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={validate}
          disabled={validating}
          className="
            inline-flex items-center gap-2 rounded-full border border-line bg-cream
            px-4 py-1.5 text-[13px] font-medium text-ink hover:bg-cream-soft
            transition-colors disabled:opacity-40 disabled:cursor-not-allowed
          "
        >
          {validating ? <Loader2 size={13} className="animate-spin" /> : null}
          Validar conexión
        </button>
        {result && (
          <span
            className={cn(
              "inline-flex items-center gap-1.5 text-[12px]",
              result.ok ? "text-emerald-700" : "text-destructive"
            )}
          >
            {result.ok ? <CheckCircle2 size={13} /> : <AlertCircle size={13} />}
            {result.message}
          </span>
        )}
      </div>
    </Card>
  );
}

function PdfConfig({
  tenant,
  onUploaded,
}: {
  tenant: TenantSettings | null;
  onUploaded: () => Promise<void>;
}) {
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const currentPath = tenant?.catalog_pdf_path ?? null;
  const cachedAt = tenant?.catalog_text_cached_at ?? null;
  const filename = currentPath ? currentPath.split("/").pop() : null;

  async function handleFile(file: File) {
    if (uploading) return;
    setError(null);
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const res = await fetch("/api/settings/catalog-pdf", { method: "POST", body: fd });
      const json = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string; detail?: string };
      if (!res.ok || !json.ok) {
        throw new Error(json.detail ?? json.error ?? `HTTP ${res.status}`);
      }
      await onUploaded();
      toast.success("Catálogo actualizado");
    } catch (e) {
      setError((e as Error).message);
      toast.error((e as Error).message);
    } finally {
      setUploading(false);
    }
  }

  return (
    <Card>
      {currentPath ? (
        <Field label="Archivo cargado">
          <div className="flex items-center justify-between gap-3 rounded-xl border border-line bg-cream px-4 py-3">
            <div className="flex items-center gap-3 min-w-0">
              <FileText size={18} strokeWidth={1.6} className="text-accent flex-shrink-0" />
              <div className="min-w-0">
                <div className="text-[13px] font-medium text-ink truncate">{filename}</div>
                <div className="text-[11px] text-stone mt-0.5">
                  {cachedAt ? `Procesado ${relativeTime(cachedAt)}` : "Aún no se procesó"}
                </div>
              </div>
            </div>
            <PdfPicker uploading={uploading} onFile={handleFile} label="Reemplazar" />
          </div>
        </Field>
      ) : (
        <Field label="Subir PDF" hint="Máx. 5 MB. Solo archivos .pdf.">
          <PdfPicker uploading={uploading} onFile={handleFile} label="Subir archivo" big />
        </Field>
      )}

      {error && (
        <p className="text-[12px] text-destructive flex items-center gap-1.5">
          <AlertCircle size={13} />
          {error}
        </p>
      )}

      <p className="text-[11px] text-stone leading-relaxed">
        Cuando subas un PDF nuevo, el asistente lo procesa al primer mensaje que reciba después. La transcripción
        queda cacheada hasta que vuelvas a reemplazar el archivo.
      </p>
    </Card>
  );
}

function PdfPicker({
  uploading,
  onFile,
  label,
  big = false,
}: {
  uploading: boolean;
  onFile: (f: File) => void;
  label: string;
  big?: boolean;
}) {
  return (
    <label
      className={cn(
        "inline-flex items-center gap-2 rounded-full bg-ink text-cream font-medium cursor-pointer hover:bg-accent transition-colors",
        big ? "px-5 py-2.5 text-[13px]" : "px-3 py-1.5 text-[12px]",
        uploading && "opacity-60 cursor-not-allowed"
      )}
    >
      {uploading ? <Loader2 size={13} className="animate-spin" /> : <Upload size={big ? 14 : 12} strokeWidth={1.8} />}
      {uploading ? "Subiendo…" : label}
      <input
        type="file"
        accept="application/pdf,.pdf"
        disabled={uploading}
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) {
            onFile(file);
            // Reset the input so picking the same file again re-fires
            e.target.value = "";
          }
        }}
        className="hidden"
      />
    </label>
  );
}

function RadioGroup<T extends string>({
  value,
  onChange,
  options,
}: {
  value: T;
  onChange: (v: T) => void;
  options: ReadonlyArray<{ value: T; label: string; hint?: string }>;
}) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
      {options.map((o) => {
        const isActive = o.value === value;
        return (
          <button
            key={o.value}
            type="button"
            onClick={() => onChange(o.value)}
            className={cn(
              "text-left rounded-xl border px-4 py-3 transition-colors",
              isActive
                ? "border-accent bg-accent-soft"
                : "border-line bg-cream hover:bg-cream-soft"
            )}
          >
            <div className="flex items-center gap-2">
              <span
                className={cn(
                  "size-3.5 rounded-full border-2 flex-shrink-0",
                  isActive ? "border-accent bg-accent" : "border-line"
                )}
                aria-hidden="true"
              />
              <span className="text-[13px] font-medium text-ink">{o.label}</span>
            </div>
            {o.hint && (
              <p className="text-[11px] text-ink-soft leading-relaxed mt-1.5 pl-5">{o.hint}</p>
            )}
          </button>
        );
      })}
    </div>
  );
}

// Compact "hace X" — same lógica que /meli usa.
function relativeTime(iso: string): string {
  const now = Date.now();
  const t = new Date(iso).getTime();
  const diffMs = now - t;
  if (diffMs < 60_000) return "hace unos segundos";
  const mins = Math.floor(diffMs / 60_000);
  if (mins < 60) return `hace ${mins} min`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `hace ${hours} h`;
  const days = Math.floor(hours / 24);
  return `hace ${days} d`;
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
        title="Leads calificados"
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

      <SectionHeader
        title="Derivación a humano"
        body="Cuando el agente decide derivar un chat (cliente quiere cerrar compra, reclamo, consulta técnica), te llega un mail con un resumen del estado de la conversación."
      />

      <Card>
        <Field>
          <Checkbox
            checked={form.handoff_notifications_enabled}
            onChange={(c) => onChange("handoff_notifications_enabled", c)}
            label="Notificar por mail al derivar chat"
          />
        </Field>

        <Field label="Email para chats derivados" icon={<Mail size={13} strokeWidth={1.8} />}>
          <Input
            type="email"
            value={form.handoff_notification_email}
            onChange={(v) => onChange("handoff_notification_email", v)}
            placeholder="vos@tuempresa.com"
          />
          <p className="text-[11px] text-stone leading-relaxed">
            Puede ser el mismo o distinto al de leads. Anti-spam: máximo un mail por
            hora por chat. Si lo dejás vacío no se envían aunque el toggle esté activo.
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

// ─── State <-> server payload ─────────────────────────────────────────────────

function tenantToForm(t: TenantSettings): FormState {
  return {
    agent_name: t.agent_name ?? "",
    ig_agent_system_prompt: t.ig_agent_system_prompt ?? "",
    wpp_agent_system_prompt: t.wpp_agent_system_prompt ?? "",
    meli_agent_system_prompt: t.meli_agent_system_prompt ?? "",
    catalog_source: t.catalog_source ?? "sheets",
    google_sheet_id: t.google_sheet_id ?? "",
    google_sheet_range: t.google_sheet_range ?? "",
    stories_context_general: t.stories_context_general ?? "",
    stories_context_keywords: t.stories_context_keywords ?? "",
    ads_context_general: t.ads_context_general ?? "",
    ads_context_keywords: t.ads_context_keywords ?? "",
    lead_notification_email: t.lead_notification_email ?? "",
    handoff_notification_email: t.handoff_notification_email ?? "",
    handoff_notifications_enabled: t.handoff_notifications_enabled ?? true,
    admin_phone: t.admin_phone ?? "",
    admin_system_prompt: t.admin_system_prompt ?? "",
  };
}

/** Convierte "" → null para campos opcionales; mantiene undefined para no tocar columnas no editadas. */
function formToPatch(f: FormState) {
  const orEmpty = (v: string) => (v.trim() === "" ? null : v);
  return {
    // Prompts por canal (migración 023)
    agent_name: orEmpty(f.agent_name),
    ig_agent_system_prompt: orEmpty(f.ig_agent_system_prompt),
    wpp_agent_system_prompt: orEmpty(f.wpp_agent_system_prompt),
    meli_agent_system_prompt: orEmpty(f.meli_agent_system_prompt),

    // Catálogo
    catalog_source: f.catalog_source,
    google_sheet_id: orEmpty(f.google_sheet_id),
    google_sheet_range: f.google_sheet_range.trim() === "" ? undefined : f.google_sheet_range,

    // Contextos
    stories_context_general: orEmpty(f.stories_context_general),
    stories_context_keywords: orEmpty(f.stories_context_keywords),
    ads_context_general: orEmpty(f.ads_context_general),
    ads_context_keywords: orEmpty(f.ads_context_keywords),

    // Notificaciones
    lead_notification_email: orEmpty(f.lead_notification_email),
    handoff_notification_email: orEmpty(f.handoff_notification_email),
    handoff_notifications_enabled: f.handoff_notifications_enabled,

    // Integraciones
    admin_phone: orEmpty(f.admin_phone),
    admin_system_prompt: orEmpty(f.admin_system_prompt),
  };
}

