"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Loader2, Trash2, Send, Link as LinkIcon, ShoppingBag } from "lucide-react";
import { toast } from "sonner";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";
import type { MeliAccount, MeliQuestion } from "@/types/database.types";

type Tab = "pending" | "answered" | "settings";

export default function MeliPage() {
  const supabase = useMemo(() => createClient(), []);
  const [tab, setTab] = useState<Tab>("pending");
  const [account, setAccount] = useState<MeliAccount | null>(null);
  const [accountLoading, setAccountLoading] = useState(true);
  const [pending, setPending] = useState<MeliQuestion[]>([]);
  const [answered, setAnswered] = useState<MeliQuestion[]>([]);
  const [questionsLoading, setQuestionsLoading] = useState(true);

  // ── Load account + questions ───────────────────────────────────────────────
  useEffect(() => {
    let cancelled = false;

    async function load() {
      setAccountLoading(true);
      setQuestionsLoading(true);

      const { data: accountRow } = await supabase
        .from("meli_accounts")
        .select("*")
        .order("connected_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (!cancelled) setAccount(accountRow ?? null);

      const { data: rows } = await supabase
        .from("meli_questions")
        .select("*")
        .in("status", ["pending", "answered"])
        .order("date_created", { ascending: false })
        .limit(200);
      if (!cancelled) {
        const all = rows ?? [];
        setPending(all.filter((q) => q.status === "pending"));
        setAnswered(all.filter((q) => q.status === "answered"));
      }

      if (!cancelled) {
        setAccountLoading(false);
        setQuestionsLoading(false);
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, [supabase]);

  // ── Realtime subscription ──────────────────────────────────────────────────
  useEffect(() => {
    const channel = supabase
      .channel("meli_questions:panel")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "meli_questions" },
        (payload) => {
          const row = (payload.new ?? payload.old) as MeliQuestion;
          if (!row) return;

          if (payload.eventType === "DELETE") {
            setPending((p) => p.filter((q) => q.id !== row.id));
            setAnswered((p) => p.filter((q) => q.id !== row.id));
            return;
          }

          // INSERT or UPDATE: re-bucket
          setPending((p) => p.filter((q) => q.id !== row.id));
          setAnswered((p) => p.filter((q) => q.id !== row.id));
          if (row.status === "pending") {
            setPending((p) => [row, ...p].slice(0, 200));
          } else if (row.status === "answered") {
            setAnswered((p) => [row, ...p].slice(0, 200));
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [supabase]);

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <header className="px-6 py-4 border-b border-line flex items-center justify-between bg-cream-raised">
        <div className="flex items-center gap-3">
          <ShoppingBag className="size-5 text-foreground/70" />
          <h1 className="text-lg font-semibold">Mercado Libre</h1>
          {account && (
            <Badge variant="outline" className="ml-2">
              {account.meli_nickname ?? account.meli_user_id}
              {account.status === "needs_reauth" && (
                <span className="ml-1 text-destructive">• reconectar</span>
              )}
            </Badge>
          )}
        </div>
        {!account && !accountLoading && <ConnectButton />}
      </header>

      <Tabs tab={tab} onChange={setTab} pendingCount={pending.length} answeredCount={answered.length} />

      <ScrollArea className="flex-1 min-h-0">
        <div className="px-6 py-4">
          {tab === "pending" && (
            <PendingList
              questions={pending}
              loading={questionsLoading}
              hasAccount={!!account}
            />
          )}
          {tab === "answered" && (
            <AnsweredList questions={answered} loading={questionsLoading} />
          )}
          {tab === "settings" && <SettingsPanel />}
        </div>
      </ScrollArea>
    </div>
  );
}

// ─── Connect button ──────────────────────────────────────────────────────────

function ConnectButton() {
  return (
    <a
      href="/api/auth/meli/connect"
      className="inline-flex h-8 items-center gap-1.5 rounded-lg bg-primary px-2.5 text-sm font-medium text-primary-foreground hover:bg-primary/80 transition-colors"
    >
      <LinkIcon className="size-4" />
      Conectar cuenta
    </a>
  );
}

// ─── Tabs ────────────────────────────────────────────────────────────────────

function Tabs({
  tab,
  onChange,
  pendingCount,
  answeredCount,
}: {
  tab: Tab;
  onChange: (t: Tab) => void;
  pendingCount: number;
  answeredCount: number;
}) {
  const items: { key: Tab; label: string; count?: number }[] = [
    { key: "pending", label: "Pendientes", count: pendingCount },
    { key: "answered", label: "Respondidas", count: answeredCount },
    { key: "settings", label: "Configuración" },
  ];

  return (
    <div className="px-6 border-b border-line bg-cream-raised">
      <div className="flex gap-1">
        {items.map((it) => (
          <button
            key={it.key}
            onClick={() => onChange(it.key)}
            className={cn(
              "px-3 py-2 text-sm font-medium border-b-2 transition-colors -mb-px",
              tab === it.key
                ? "border-primary text-foreground"
                : "border-transparent text-muted-foreground hover:text-foreground"
            )}
          >
            {it.label}
            {typeof it.count === "number" && it.count > 0 && (
              <span className="ml-2 text-xs text-muted-foreground">({it.count})</span>
            )}
          </button>
        ))}
      </div>
    </div>
  );
}

// ─── Pending list ────────────────────────────────────────────────────────────

function PendingList({
  questions,
  loading,
  hasAccount,
}: {
  questions: MeliQuestion[];
  loading: boolean;
  hasAccount: boolean;
}) {
  if (loading) {
    return (
      <div className="flex items-center justify-center py-12 text-muted-foreground">
        <Loader2 className="size-4 animate-spin mr-2" /> Cargando…
      </div>
    );
  }
  if (!hasAccount) {
    return (
      <EmptyState
        title="Conectá tu cuenta de Mercado Libre"
        body="Una vez conectada, las preguntas de los compradores van a aparecer acá automáticamente con una respuesta sugerida por la IA."
      />
    );
  }
  if (questions.length === 0) {
    return (
      <EmptyState
        title="No hay preguntas pendientes"
        body="Cuando llegue una pregunta nueva la vas a ver acá en tiempo real."
      />
    );
  }
  return (
    <div className="space-y-3">
      {questions.map((q) => (
        <QuestionCard key={q.id} question={q} variant="pending" />
      ))}
    </div>
  );
}

// ─── Answered list ───────────────────────────────────────────────────────────

function AnsweredList({ questions, loading }: { questions: MeliQuestion[]; loading: boolean }) {
  if (loading) {
    return (
      <div className="flex items-center justify-center py-12 text-muted-foreground">
        <Loader2 className="size-4 animate-spin mr-2" /> Cargando…
      </div>
    );
  }
  if (questions.length === 0) {
    return <EmptyState title="Sin respuestas todavía" body="Las preguntas que envíes van a quedar archivadas acá." />;
  }
  return (
    <div className="space-y-3">
      {questions.map((q) => (
        <QuestionCard key={q.id} question={q} variant="answered" />
      ))}
    </div>
  );
}

// ─── Question card ───────────────────────────────────────────────────────────

function QuestionCard({ question, variant }: { question: MeliQuestion; variant: "pending" | "answered" }) {
  const [draft, setDraft] = useState(question.ai_suggested_answer ?? "");
  const [sending, setSending] = useState(false);
  const [dismissing, setDismissing] = useState(false);

  // Si llega la sugerencia después por realtime, propagamos al textarea
  // (solo si el operador no la editó todavía).
  useEffect(() => {
    setDraft((current) => (current ? current : question.ai_suggested_answer ?? ""));
  }, [question.ai_suggested_answer]);

  async function approve() {
    if (sending) return;
    if (!draft.trim()) {
      toast.error("La respuesta no puede estar vacía");
      return;
    }
    setSending(true);
    try {
      const res = await fetch("/api/meli/answer", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ questionId: question.id, text: draft, sentBy: "human" }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error ?? `HTTP ${res.status}`);
      toast.success("Respuesta enviada");
    } catch (e) {
      toast.error(`No se pudo enviar: ${(e as Error).message}`);
    } finally {
      setSending(false);
    }
  }

  async function dismiss() {
    if (dismissing) return;
    setDismissing(true);
    try {
      const res = await fetch("/api/meli/dismiss", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ questionId: question.id }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error ?? `HTTP ${res.status}`);
      toast.success("Pregunta descartada");
    } catch (e) {
      toast.error(`No se pudo descartar: ${(e as Error).message}`);
    } finally {
      setDismissing(false);
    }
  }

  return (
    <div className="border border-line rounded-lg p-4 bg-background flex flex-col gap-3">
      <div className="flex gap-3">
        {question.item_thumbnail ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={question.item_thumbnail}
            alt={question.item_title ?? "item"}
            className="size-16 rounded-md object-cover border border-line"
          />
        ) : (
          <div className="size-16 rounded-md bg-muted flex items-center justify-center">
            <ShoppingBag className="size-5 text-muted-foreground" />
          </div>
        )}
        <div className="min-w-0 flex-1">
          <div className="text-sm font-medium truncate">{question.item_title ?? question.item_id}</div>
          <div className="text-xs text-muted-foreground">
            {question.item_price != null && (
              <span>$ {Number(question.item_price).toLocaleString("es-AR")} · </span>
            )}
            <span>{relativeTime(question.date_created)}</span>
            {question.from_user_nickname && <span> · @{question.from_user_nickname}</span>}
          </div>
        </div>
      </div>

      <div className="bg-muted/40 rounded-md p-3 text-sm">{question.text}</div>

      {variant === "pending" ? (
        <>
          <Textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder={question.ai_suggested_answer ? "" : "Esperando respuesta sugerida…"}
            rows={5}
            maxLength={2000}
            className="text-sm"
          />
          <div className="flex items-center justify-between gap-2">
            <span className="text-xs text-muted-foreground">{draft.length} / 2000</span>
            <div className="flex gap-2">
              <Button variant="ghost" onClick={dismiss} disabled={dismissing}>
                {dismissing ? <Loader2 className="size-3 animate-spin" /> : <Trash2 className="size-3" />}
                Descartar
              </Button>
              <Button onClick={approve} disabled={sending || !draft.trim()}>
                {sending ? <Loader2 className="size-3 animate-spin" /> : <Send className="size-3" />}
                Aprobar y enviar
              </Button>
            </div>
          </div>
        </>
      ) : (
        <div className="space-y-1">
          <div className="text-xs text-muted-foreground">
            Respondida {question.answered_at ? relativeTime(question.answered_at) : "—"} · por {question.sent_by ?? "—"}
          </div>
          <div className="text-sm border border-line rounded-md p-3 bg-background">
            {question.sent_answer ?? "—"}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Settings panel ──────────────────────────────────────────────────────────

function SettingsPanel() {
  const supabase = useMemo(() => createClient(), []);
  const [original, setOriginal] = useState<boolean | null>(null);
  const [draftAuto, setDraftAuto] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        setLoading(false);
        return;
      }
      const { data: u } = await supabase
        .from("users")
        .select("tenant_id")
        .eq("id", user.id)
        .maybeSingle();
      if (!u?.tenant_id) {
        setLoading(false);
        return;
      }
      const { data: t } = await supabase
        .from("tenants")
        .select("meli_auto_answer")
        .eq("id", u.tenant_id)
        .maybeSingle();
      if (cancelled) return;
      if (t) {
        setOriginal(t.meli_auto_answer);
        setDraftAuto(t.meli_auto_answer);
      }
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [supabase]);

  const dirty = original !== null && draftAuto !== original;

  async function save() {
    if (!dirty || saving) return;
    setSaving(true);
    try {
      const res = await fetch("/api/meli/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ meli_auto_answer: draftAuto }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error ?? `HTTP ${res.status}`);
      setOriginal(draftAuto);
      toast.success("Configuración guardada");
    } catch (e) {
      toast.error(`No se pudo guardar: ${(e as Error).message}`);
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12 text-muted-foreground">
        <Loader2 className="size-4 animate-spin mr-2" /> Cargando…
      </div>
    );
  }

  return (
    <div className="max-w-2xl space-y-6">
      <section className="space-y-3">
        <label className="flex items-start gap-3 cursor-pointer">
          <input
            type="checkbox"
            checked={draftAuto}
            onChange={(e) => setDraftAuto(e.target.checked)}
            className="mt-1 size-4 accent-accent cursor-pointer"
          />
          <div className="flex-1">
            <div className="text-[14px] font-medium text-ink">Auto-responder</div>
            <p className="text-[12px] text-ink-soft mt-1 leading-relaxed">
              Si está activado, el agente envía la respuesta directamente sin esperar aprobación humana. Las preguntas
              aparecen directamente en la pestaña "Respondidas". Si está desactivado, cada pregunta queda en
              "Pendientes" con una respuesta sugerida que tenés que aprobar.
            </p>
          </div>
        </label>
      </section>

      <div className="flex justify-end">
        <Button disabled={!dirty || saving} onClick={save}>
          {saving ? <Loader2 className="size-3 animate-spin" /> : null}
          Guardar
        </Button>
      </div>
    </div>
  );
}

// ─── Misc ────────────────────────────────────────────────────────────────────

function EmptyState({ title, body }: { title: string; body: string }) {
  return (
    <div className="text-center py-12 max-w-md mx-auto">
      <h2 className="text-base font-medium">{title}</h2>
      <p className="text-sm text-muted-foreground mt-1">{body}</p>
    </div>
  );
}

function relativeTime(iso: string): string {
  const now = Date.now();
  const t = new Date(iso).getTime();
  const diffMs = now - t;
  if (diffMs < 60_000) return "hace segundos";
  const mins = Math.floor(diffMs / 60_000);
  if (mins < 60) return `hace ${mins} min`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `hace ${hours} h`;
  const days = Math.floor(hours / 24);
  return `hace ${days} d`;
}

export const dynamic = "force-dynamic";
