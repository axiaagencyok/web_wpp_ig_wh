"use client";

import { useCallback, useEffect, useState } from "react";
import {
  LineChart, Line, BarChart, Bar, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
} from "recharts";
import {
  RefreshCw, TrendingUp, TrendingDown, Minus,
  MessageSquare, Zap, Users, DollarSign, BarChart2,
} from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { ColumnHeader } from "@/components/panel/ColumnHeader";

// ── Types ────────────────────────────────────────────────────────────────────

type Period = "24h" | "7d" | "30d" | "90d";

interface AnalyticsData {
  kpis: {
    totalMessages: number;
    totalDelta: number | null;
    automationPct: number;
    derivations: number;
    tokensInput: number;
    tokensOutput: number;
    costUSD: number;
  };
  messagesByDay:   { date: string; inbound: number; ai: number; human: number }[];
  messagesByHour:  { hour: number; avg: number }[];
  dealDistribution: { status: string; count: number }[];
  topContacts: {
    id: string;
    contact_name: string | null;
    contact_phone: string;
    deal_status: string;
    msgCount: number;
    lastAt: string;
  }[];
  latencyByDay: { date: string; avg: number }[];
}

// ── Constants ────────────────────────────────────────────────────────────────

const COLOR_INBOUND = "#A89E90";  // Piedra
const COLOR_AI      = "#4A4560";  // Violeta brand
const COLOR_HUMAN   = "#2E2A3F";  // Nocturno

const DEAL_COLORS: Record<string, string> = {
  nuevo:          "#A89E90",
  contactado:     "#4A4560",
  esperando_pago: "#B89066",
  pago_pendiente: "#8E6E47",
  cerrado:        "#7A8569",
};

const DEAL_LABELS: Record<string, string> = {
  nuevo:          "Nuevo",
  contactado:     "Contactado",
  esperando_pago: "Esp. pago",
  pago_pendiente: "Pago pendiente",
  cerrado:        "Cerrado",
};

const TOOLTIP_STYLE = {
  backgroundColor: "var(--card)",
  border: "1px solid var(--border)",
  borderRadius: 12,
  color: "var(--foreground)",
  fontSize: 12,
  fontWeight: 500,
  boxShadow: "0 8px 32px rgba(0,0,0,0.18)",
  padding: "8px 12px",
};

// ── Helpers ──────────────────────────────────────────────────────────────────

function formatDate(iso: string) {
  try {
    const d = new Date(iso + "T00:00:00");
    return d.toLocaleDateString("es-AR", { day: "numeric", month: "short" });
  } catch { return iso; }
}

function formatLastAt(iso: string) {
  if (!iso) return "—";
  try {
    const d = new Date(iso);
    const now = new Date();
    if (d.toDateString() === now.toDateString())
      return d.toLocaleTimeString("es-AR", { hour: "2-digit", minute: "2-digit" });
    return d.toLocaleDateString("es-AR", { day: "2-digit", month: "2-digit" });
  } catch { return "—"; }
}

function formatPhone(phone: string) {
  return phone.replace("whatsapp:", "");
}

// ── Sub-components ───────────────────────────────────────────────────────────

function SectionCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="bg-card border border-border rounded-2xl p-5">
      <h3 className="font-display text-[15px] font-bold text-foreground mb-5 tracking-tight">{title}</h3>
      {children}
    </div>
  );
}

function EmptyChart({ label }: { label: string }) {
  return (
    <div className="flex flex-col items-center justify-center h-[220px] gap-3 text-center">
      <div className="w-12 h-12 rounded-2xl bg-muted flex items-center justify-center">
        <BarChart2 size={20} className="text-muted-foreground" />
      </div>
      <p className="text-sm text-muted-foreground font-medium">{label}</p>
    </div>
  );
}

interface KpiCellProps {
  label: string;
  value: string | number;
  description?: string;
  icon: React.ElementType;
  delta?: number | null;
  color?: string;
  className?: string;
}

function KpiCell({ label, value, description, icon: Icon, delta, color = "#4A4560", className }: KpiCellProps) {
  return (
    <div className={cn("p-5 flex flex-col gap-3", className)}>
      <div className="flex items-start justify-between gap-2">
        <span className="text-[11px] font-bold uppercase tracking-widest text-muted-foreground leading-tight">
          {label}
        </span>
        <div
          className="w-8 h-8 rounded-xl flex items-center justify-center flex-shrink-0"
          style={{ backgroundColor: `${color}18` }}
        >
          <Icon size={15} style={{ color }} />
        </div>
      </div>
      <div>
        <p className="text-4xl font-bold font-display tracking-tight text-foreground leading-none tabular-nums">
          {value}
        </p>
        <div className="flex items-center gap-1.5 mt-2 flex-wrap">
          {delta != null && (
            <span className={`flex items-center gap-0.5 text-[11px] font-semibold ${
              delta > 0 ? "text-emerald-500" : delta < 0 ? "text-destructive" : "text-muted-foreground"
            }`}>
              {delta > 0
                ? <TrendingUp size={11} />
                : delta < 0
                ? <TrendingDown size={11} />
                : <Minus size={11} />
              }
              {delta > 0 ? "+" : ""}{delta}% vs período ant.
            </span>
          )}
          {description && (
            <span className="text-[11px] text-muted-foreground">{description}</span>
          )}
        </div>
      </div>
    </div>
  );
}

function SkeletonPage() {
  return (
    <div className="space-y-6 animate-pulse">
      <div className="bg-cream-raised border border-line rounded-[16px] overflow-hidden grid grid-cols-2 lg:grid-cols-4">
        {[0, 1, 2, 3].map((i) => (
          <div
            key={i}
            className={cn(
              "p-5 space-y-3",
              i === 0 && "border-r border-line border-b lg:border-b-0",
              i === 1 && "border-b border-line lg:border-b-0 lg:border-r",
              i === 2 && "border-r border-line",
            )}
          >
            <Skeleton className="h-3 w-24 rounded" />
            <Skeleton className="h-10 w-16 rounded" />
            <Skeleton className="h-3 w-20 rounded" />
          </div>
        ))}
      </div>
      <Skeleton className="h-[320px] w-full rounded-2xl" />
      <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
        <Skeleton className="h-[280px] rounded-2xl" />
        <Skeleton className="h-[280px] rounded-2xl" />
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
        <Skeleton className="h-[280px] rounded-2xl" />
        <Skeleton className="h-[280px] rounded-2xl" />
      </div>
    </div>
  );
}

// ── Main page ────────────────────────────────────────────────────────────────

const PERIODS: { value: Period; label: string }[] = [
  { value: "24h", label: "24h" },
  { value: "7d",  label: "7d"  },
  { value: "30d", label: "30d" },
  { value: "90d", label: "90d" },
];

export default function AnalyticsPage() {
  const [period, setPeriod]   = useState<Period>("7d");
  const [data, setData]       = useState<AnalyticsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [spinning, setSpinning] = useState(false);

  const load = useCallback(async (p: Period, isRefresh = false) => {
    if (isRefresh) setSpinning(true);
    else setLoading(true);
    try {
      const res = await fetch(`/api/analytics?period=${p}`);
      if (!res.ok) throw new Error("Error cargando analytics");
      const json = await res.json() as AnalyticsData;
      setData(json);
      if (isRefresh) toast.success("Datos actualizados");
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setLoading(false);
      setSpinning(false);
    }
  }, []);

  useEffect(() => { load(period); }, [period, load]);

  const handleRefresh = () => load(period, true);

  const hasMessages = (data?.messagesByDay.length ?? 0) > 0 ||
                      (data?.kpis.totalMessages ?? 0) > 0;

  return (
    <div className="flex-1 min-w-0 min-h-0 flex flex-col overflow-hidden">
      <ColumnHeader />
      <div className="flex-1 overflow-y-auto">
        <div className="max-w-6xl mx-auto px-5 lg:px-8 py-8 space-y-6">

          {/* ── Header ── */}
          <div className="flex items-start justify-between gap-4 flex-wrap">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-xl bg-primary/10 flex items-center justify-center flex-shrink-0">
                <BarChart2 size={18} className="text-primary" />
              </div>
              <div>
                <h1 className="font-display text-xl font-bold text-foreground tracking-tight">Analytics</h1>
                <p className="text-[11px] text-muted-foreground mt-0.5">Rendimiento del agente y conversaciones</p>
              </div>
            </div>

            <div className="flex items-center gap-3">
              {/* Period tabs */}
              <div className="flex items-center gap-1 bg-muted rounded-xl p-1">
                {PERIODS.map(({ value, label }) => (
                  <button
                    key={value}
                    onClick={() => setPeriod(value)}
                    className={`px-3 py-1.5 rounded-lg text-[12px] font-semibold transition-all duration-200 cursor-pointer ${
                      period === value
                        ? "bg-card text-foreground shadow-sm border border-border"
                        : "text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>

              {/* Refresh */}
              <button
                onClick={handleRefresh}
                disabled={spinning}
                className="w-9 h-9 flex items-center justify-center rounded-xl border border-border bg-card text-muted-foreground hover:text-primary hover:border-primary/30 transition-all duration-200 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                title="Refrescar"
              >
                <RefreshCw size={15} className={spinning ? "animate-spin" : ""} />
              </button>
            </div>
          </div>

          {/* ── Content ── */}
          {loading ? (
            <SkeletonPage />
          ) : !data || !hasMessages ? (
            <div className="flex flex-col items-center justify-center py-24 gap-4">
              <div className="w-14 h-14 rounded-2xl bg-muted flex items-center justify-center">
                <BarChart2 size={24} className="text-muted-foreground" />
              </div>
              <div className="text-center">
                <p className="text-base font-semibold text-foreground">Sin actividad en este período</p>
                <p className="text-sm text-muted-foreground mt-1">
                  No hay mensajes registrados para &ldquo;{period}&rdquo;. Probá con un período más amplio.
                </p>
              </div>
            </div>
          ) : (
            <>
              {/* ── A: KPI grid — one surface, 4 cells divided by hairlines ── */}
              <div className="bg-cream-raised border border-line rounded-[16px] overflow-hidden grid grid-cols-2 lg:grid-cols-4">
                <KpiCell
                  label="Mensajes totales"
                  icon={MessageSquare}
                  value={data.kpis.totalMessages.toLocaleString("es-AR")}
                  delta={data.kpis.totalDelta}
                  color="#2E2A3F"
                  className="border-r border-line border-b lg:border-b-0"
                />
                <KpiCell
                  label="% Automatizados"
                  icon={Zap}
                  value={`${data.kpis.automationPct}%`}
                  description="de mensajes salientes"
                  color="#4A4560"
                  className="border-b border-line lg:border-b-0 lg:border-r"
                />
                <KpiCell
                  label="Derivaciones"
                  icon={Users}
                  value={data.kpis.derivations}
                  description="a agente humano"
                  color="#B89066"
                  className="border-r border-line"
                />
                <KpiCell
                  label="Costo estimado"
                  icon={DollarSign}
                  value={`$${data.kpis.costUSD.toFixed(4)}`}
                  description={`${((data.kpis.tokensInput + data.kpis.tokensOutput) / 1000).toFixed(1)}k tokens`}
                  color="#7A8569"
                />
              </div>

              {/* ── B: Messages by day ── */}
              <SectionCard title="Mensajes por día">
                {data.messagesByDay.length === 0 ? (
                  <EmptyChart label="Sin actividad en este período" />
                ) : (
                  <div className="h-[260px]">
                    <ResponsiveContainer width="100%" height="100%">
                      <LineChart data={data.messagesByDay} margin={{ top: 4, right: 16, left: -16, bottom: 0 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
                        <XAxis
                          dataKey="date"
                          tickFormatter={formatDate}
                          tick={{ fill: "var(--muted-foreground)", fontSize: 11 }}
                          axisLine={false}
                          tickLine={false}
                        />
                        <YAxis
                          tick={{ fill: "var(--muted-foreground)", fontSize: 11 }}
                          axisLine={false}
                          tickLine={false}
                          width={28}
                          allowDecimals={false}
                        />
                        <Tooltip
                          contentStyle={TOOLTIP_STYLE}
                          // eslint-disable-next-line @typescript-eslint/no-explicit-any
                          labelFormatter={(v: any) => formatDate(String(v))}
                          cursor={{ stroke: "var(--border)", strokeWidth: 1 }}
                        />
                        <Legend
                          iconType="circle"
                          iconSize={7}
                          wrapperStyle={{ fontSize: 11, paddingTop: 12 }}
                          formatter={(value) => (
                            <span style={{ color: "var(--muted-foreground)", fontWeight: 500 }}>
                              {value === "inbound" ? "Entrantes" : value === "ai" ? "IA salientes" : "Humano salientes"}
                            </span>
                          )}
                        />
                        <Line type="monotone" dataKey="inbound" stroke={COLOR_INBOUND} strokeWidth={2} dot={false} name="inbound" />
                        <Line type="monotone" dataKey="ai"      stroke={COLOR_AI}      strokeWidth={2} dot={false} name="ai"      />
                        <Line type="monotone" dataKey="human"   stroke={COLOR_HUMAN}   strokeWidth={2} dot={false} name="human"   />
                      </LineChart>
                    </ResponsiveContainer>
                  </div>
                )}
              </SectionCard>

              {/* ── C: Deal distribution + Top contacts ── */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-5">

                {/* Donut deal distribution */}
                <SectionCard title="Distribución por estado">
                  {data.dealDistribution.length === 0 ? (
                    <EmptyChart label="Sin datos de estado" />
                  ) : (
                    <div className="h-[240px]">
                      <ResponsiveContainer width="100%" height="100%">
                        <PieChart>
                          <Pie
                            data={data.dealDistribution}
                            dataKey="count"
                            nameKey="status"
                            cx="50%"
                            cy="46%"
                            innerRadius={58}
                            outerRadius={84}
                            paddingAngle={3}
                            stroke="none"
                          >
                            {data.dealDistribution.map((entry) => (
                              <Cell
                                key={entry.status}
                                fill={DEAL_COLORS[entry.status] ?? "#A89E90"}
                              />
                            ))}
                          </Pie>
                          <Legend
                            iconType="circle"
                            iconSize={7}
                            wrapperStyle={{ fontSize: 11, paddingTop: 8 }}
                            formatter={(value) => (
                              <span style={{ color: "var(--muted-foreground)", fontWeight: 500 }}>
                                {DEAL_LABELS[value] ?? value}
                              </span>
                            )}
                          />
                          <Tooltip
                            contentStyle={TOOLTIP_STYLE}
                            formatter={(value, name) => [value, DEAL_LABELS[name as string] ?? name]}
                          />
                        </PieChart>
                      </ResponsiveContainer>
                    </div>
                  )}
                </SectionCard>

                {/* Top contacts */}
                <SectionCard title="Top 5 contactos">
                  {data.topContacts.length === 0 ? (
                    <EmptyChart label="Sin actividad en este período" />
                  ) : (
                    <div className="space-y-1">
                      {data.topContacts.map((c, i) => (
                        <div
                          key={c.id}
                          className="flex items-center gap-3 px-3 py-2.5 rounded-xl hover:bg-muted/50 transition-colors"
                        >
                          <span className="text-[11px] font-bold tabular-nums text-muted-foreground w-4 flex-shrink-0">
                            {i + 1}
                          </span>
                          <div className="flex-1 min-w-0">
                            <p className="text-[13px] font-semibold text-foreground truncate leading-tight">
                              {c.contact_name ?? formatPhone(c.contact_phone)}
                            </p>
                            <p className="text-[11px] text-muted-foreground font-mono truncate">
                              {formatPhone(c.contact_phone)}
                            </p>
                          </div>
                          <div className="flex items-center gap-2 flex-shrink-0">
                            <span className="text-[11px] font-bold tabular-nums text-foreground">{c.msgCount}</span>
                            <span
                              className="w-2 h-2 rounded-full flex-shrink-0 ring-1 ring-white dark:ring-[#0F0B1F]"
                              style={{ backgroundColor: DEAL_COLORS[c.deal_status] ?? "#A89E90" }}
                              title={DEAL_LABELS[c.deal_status] ?? c.deal_status}
                            />
                            <span className="text-[10px] text-muted-foreground tabular-nums">
                              {formatLastAt(c.lastAt)}
                            </span>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </SectionCard>
              </div>

              {/* ── D: Hourly activity + latency ── */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-5">

                {/* Bar chart hourly */}
                <SectionCard title="Actividad por hora">
                  <p className="text-[11px] text-muted-foreground -mt-3 mb-4">
                    Promedio de mensajes entrantes por hora del día
                  </p>
                  {data.messagesByHour.every((h) => h.avg === 0) ? (
                    <EmptyChart label="Sin datos de actividad horaria" />
                  ) : (
                    <div className="h-[220px]">
                      <ResponsiveContainer width="100%" height="100%">
                        <BarChart
                          data={data.messagesByHour}
                          barCategoryGap="20%"
                          margin={{ top: 4, right: 4, left: -20, bottom: 0 }}
                        >
                          <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
                          <XAxis
                            dataKey="hour"
                            tick={{ fill: "var(--muted-foreground)", fontSize: 10 }}
                            axisLine={false}
                            tickLine={false}
                            interval={2}
                            tickFormatter={(h: number) => `${h}h`}
                          />
                          <YAxis
                            tick={{ fill: "var(--muted-foreground)", fontSize: 10 }}
                            axisLine={false}
                            tickLine={false}
                            width={24}
                            allowDecimals={true}
                          />
                          <Tooltip
                            contentStyle={TOOLTIP_STYLE}
                            // eslint-disable-next-line @typescript-eslint/no-explicit-any
                            labelFormatter={(h: any) => `${h}:00 hs`}
                            // eslint-disable-next-line @typescript-eslint/no-explicit-any
                            formatter={(value: any) => [value, "Prom. mensajes"] as any}
                            cursor={{ fill: "var(--muted)", opacity: 0.5 }}
                          />
                          <Bar dataKey="avg" fill={COLOR_AI} radius={[4, 4, 0, 0]} />
                        </BarChart>
                      </ResponsiveContainer>
                    </div>
                  )}
                </SectionCard>

                {/* Latency by day */}
                <SectionCard title="Latencia del agente">
                  <p className="text-[11px] text-muted-foreground -mt-3 mb-4">
                    Tiempo promedio de respuesta IA por día (ms)
                  </p>
                  {data.latencyByDay.length === 0 ? (
                    <EmptyChart label="Sin datos de latencia en este período" />
                  ) : (
                    <div className="h-[220px]">
                      <ResponsiveContainer width="100%" height="100%">
                        <LineChart
                          data={data.latencyByDay}
                          margin={{ top: 4, right: 16, left: -16, bottom: 0 }}
                        >
                          <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
                          <XAxis
                            dataKey="date"
                            tickFormatter={formatDate}
                            tick={{ fill: "var(--muted-foreground)", fontSize: 11 }}
                            axisLine={false}
                            tickLine={false}
                          />
                          <YAxis
                            tick={{ fill: "var(--muted-foreground)", fontSize: 11 }}
                            axisLine={false}
                            tickLine={false}
                            width={40}
                            tickFormatter={(v: number) => `${v}ms`}
                          />
                          <Tooltip
                            contentStyle={TOOLTIP_STYLE}
                            // eslint-disable-next-line @typescript-eslint/no-explicit-any
                            labelFormatter={(v: any) => formatDate(String(v))}
                            // eslint-disable-next-line @typescript-eslint/no-explicit-any
                            formatter={(value: any) => [`${value} ms`, "Latencia prom."] as any}
                            cursor={{ stroke: "var(--border)", strokeWidth: 1 }}
                          />
                          <Line
                            type="monotone"
                            dataKey="avg"
                            stroke={COLOR_AI}
                            strokeWidth={2}
                            dot={{ r: 3, fill: COLOR_AI, strokeWidth: 0 }}
                          />
                        </LineChart>
                      </ResponsiveContainer>
                    </div>
                  )}
                </SectionCard>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
