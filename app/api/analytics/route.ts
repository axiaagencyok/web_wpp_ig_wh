import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { adminClient } from "@/lib/supabase/admin";

// Sonnet 4.5 pricing (USD per million tokens)
const INPUT_COST_PER_M  = 3;
const OUTPUT_COST_PER_M = 15;

type Period = "24h" | "7d" | "30d" | "90d";

function periodToISO(period: Period): string {
  const ms: Record<Period, number> = {
    "24h": 24 * 60 * 60 * 1000,
    "7d":  7  * 24 * 60 * 60 * 1000,
    "30d": 30 * 24 * 60 * 60 * 1000,
    "90d": 90 * 24 * 60 * 60 * 1000,
  };
  return new Date(Date.now() - ms[period]).toISOString();
}

function periodToPrevISO(period: Period): string {
  const ms: Record<Period, number> = {
    "24h": 24 * 60 * 60 * 1000,
    "7d":  7  * 24 * 60 * 60 * 1000,
    "30d": 30 * 24 * 60 * 60 * 1000,
    "90d": 90 * 24 * 60 * 60 * 1000,
  };
  const duration = ms[period];
  return new Date(Date.now() - duration * 2).toISOString();
}

export async function GET(req: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) return new NextResponse("Unauthorized", { status: 401 });

    const { data: userRow, error: userErr } = await supabase
      .from("users")
      .select("tenant_id")
      .eq("id", user.id)
      .single();
    if (userErr || !userRow) return NextResponse.json({ error: "User not found" }, { status: 404 });

    const tenantId = userRow.tenant_id;

    const url    = new URL(req.url);
    const period = (url.searchParams.get("period") ?? "7d") as Period;
    const since  = periodToISO(period);
    const prevSince = periodToPrevISO(period);

    // ── Messages in period ──────────────────────────────────────────
    const { data: msgs } = await adminClient
      .from("messages")
      .select("id, direction, sender, created_at")
      .eq("tenant_id", tenantId)
      .gte("created_at", since);

    const allMsgs = msgs ?? [];

    // Messages in previous period (for delta)
    const { data: prevMsgs } = await adminClient
      .from("messages")
      .select("id, direction, sender")
      .eq("tenant_id", tenantId)
      .gte("created_at", prevSince)
      .lt("created_at", since);

    const prevTotal = (prevMsgs ?? []).length;
    const currTotal = allMsgs.length;
    const totalDelta = prevTotal > 0 ? Math.round(((currTotal - prevTotal) / prevTotal) * 100) : null;

    const outbound     = allMsgs.filter((m) => m.direction === "outbound");
    const aiOutbound   = outbound.filter((m) => m.sender === "ai");
    const automationPct = outbound.length > 0 ? Math.round((aiOutbound.length / outbound.length) * 100) : 0;

    // ── Messages by day ─────────────────────────────────────────────
    const byDay: Record<string, { inbound: number; ai: number; human: number }> = {};
    for (const m of allMsgs) {
      const day = m.created_at.slice(0, 10);
      if (!byDay[day]) byDay[day] = { inbound: 0, ai: 0, human: 0 };
      if (m.direction === "inbound") byDay[day].inbound++;
      else if (m.sender === "ai")    byDay[day].ai++;
      else                           byDay[day].human++;
    }
    const messagesByDay = Object.entries(byDay)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([date, counts]) => ({ date, ...counts }));

    // ── Messages by hour (0-23) ─────────────────────────────────────
    const byHour: number[] = Array(24).fill(0);
    for (const m of allMsgs.filter((m) => m.direction === "inbound")) {
      const hour = new Date(m.created_at).getHours();
      byHour[hour]++;
    }
    const dayCount = Math.max(messagesByDay.length, 1);
    const messagesByHour = byHour.map((count, hour) => ({
      hour,
      avg: Math.round((count / dayCount) * 10) / 10,
    }));

    // ── Derivaciones en período ─────────────────────────────────────
    const { data: derivedConvs } = await adminClient
      .from("conversations")
      .select("id")
      .eq("tenant_id", tenantId)
      .eq("paused_reason", "derived_to_human")
      .gte("last_message_at", since);
    const derivations = (derivedConvs ?? []).length;

    // ── AI logs: tokens + latency ───────────────────────────────────
    const { data: aiLogs } = await adminClient
      .from("ai_logs")
      .select("prompt_tokens, completion_tokens, latency_ms, created_at")
      .eq("tenant_id", tenantId)
      .gte("created_at", since);

    const logs = aiLogs ?? [];
    const totalInput  = logs.reduce((s, l) => s + (l.prompt_tokens ?? 0), 0);
    const totalOutput = logs.reduce((s, l) => s + (l.completion_tokens ?? 0), 0);
    const costUSD = (totalInput / 1_000_000) * INPUT_COST_PER_M +
                    (totalOutput / 1_000_000) * OUTPUT_COST_PER_M;

    // Latency by day
    const latByDay: Record<string, { sum: number; count: number }> = {};
    for (const l of logs) {
      if (!l.latency_ms) continue;
      const day = l.created_at.slice(0, 10);
      if (!latByDay[day]) latByDay[day] = { sum: 0, count: 0 };
      latByDay[day].sum   += l.latency_ms;
      latByDay[day].count += 1;
    }
    const latencyByDay = Object.entries(latByDay)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([date, { sum, count }]) => ({ date, avg: Math.round(sum / count) }));

    // ── Deal status distribution ────────────────────────────────────
    const { data: convRows } = await adminClient
      .from("conversations")
      .select("deal_status")
      .eq("tenant_id", tenantId);

    const dealCounts: Record<string, number> = {};
    for (const c of convRows ?? []) {
      const s = (c as { deal_status?: string }).deal_status ?? "nuevo";
      dealCounts[s] = (dealCounts[s] ?? 0) + 1;
    }
    const dealDistribution = Object.entries(dealCounts).map(([status, count]) => ({ status, count }));

    // ── Top 5 contacts ──────────────────────────────────────────────
    const msgCountByConv: Record<string, { count: number; lastAt: string }> = {};
    for (const m of allMsgs) {
      const cid = (m as { conversation_id?: string }).conversation_id ?? "";
      if (!cid) continue;
      if (!msgCountByConv[cid]) msgCountByConv[cid] = { count: 0, lastAt: m.created_at };
      msgCountByConv[cid].count++;
      if (m.created_at > msgCountByConv[cid].lastAt) msgCountByConv[cid].lastAt = m.created_at;
    }

    // Re-fetch with conversation_id
    const { data: msgsWithConv } = await adminClient
      .from("messages")
      .select("id, direction, sender, created_at, conversation_id")
      .eq("tenant_id", tenantId)
      .gte("created_at", since);

    const msgCountByConv2: Record<string, { count: number; lastAt: string }> = {};
    for (const m of msgsWithConv ?? []) {
      const cid = m.conversation_id;
      if (!msgCountByConv2[cid]) msgCountByConv2[cid] = { count: 0, lastAt: m.created_at };
      msgCountByConv2[cid].count++;
      if (m.created_at > msgCountByConv2[cid].lastAt) msgCountByConv2[cid].lastAt = m.created_at;
    }

    const topConvIds = Object.entries(msgCountByConv2)
      .sort(([, a], [, b]) => b.count - a.count)
      .slice(0, 5)
      .map(([id]) => id);

    let topContacts: {
      id: string; contact_name: string | null; contact_phone: string;
      deal_status: string; msgCount: number; lastAt: string;
    }[] = [];

    if (topConvIds.length > 0) {
      const { data: topConvsData } = await adminClient
        .from("conversations")
        .select("id, contact_name, contact_phone, deal_status")
        .in("id", topConvIds);

      topContacts = (topConvsData ?? []).map((c) => ({
        id: c.id,
        contact_name: c.contact_name,
        contact_phone: c.contact_phone,
        deal_status: (c as { deal_status?: string }).deal_status ?? "nuevo",
        msgCount: msgCountByConv2[c.id]?.count ?? 0,
        lastAt:   msgCountByConv2[c.id]?.lastAt ?? "",
      })).sort((a, b) => b.msgCount - a.msgCount);
    }

    return NextResponse.json({
      kpis: {
        totalMessages:  currTotal,
        totalDelta,
        automationPct,
        derivations,
        tokensInput:  totalInput,
        tokensOutput: totalOutput,
        costUSD: Math.round(costUSD * 10000) / 10000,
      },
      messagesByDay,
      messagesByHour,
      dealDistribution,
      topContacts,
      latencyByDay,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[GET /api/analytics] error:", msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
