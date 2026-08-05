/* ============================================
   LOWPASS — AI usage report (server data access, §AI-4)

   Cross-workspace AI-cost aggregation for the site-admin
   dashboard at /admin/ai-usage. Reads ai_usage_events through
   the SERVICE-ROLE client (bypasses RLS) because the dashboard
   shows ALL workspaces — see migration 114's note that no
   cross-workspace RLS exists for events.

   Costs are micro-USD (bigint, 1e6 = $1). Aggregation runs in
   JS — fine for an internal tool. Each call fetches:

     - this-month events (gte monthStartIso) → by-user / by-
       endpoint / by-day rollups + this-month total
     - last-month total (separate range query)
     - latest 100 events (recent feed)
     - workspaces (selector)
     - profiles (label resolution for the distinct user_ids)
   ============================================ */

import { createServiceSupabaseClient } from '@/lib/supabase-server';
import type {
  AiUsageByUser,
  AiUsageByEndpoint,
  AiUsageByDay,
  AiUsageRecentRow,
  AiUsageReport,
  GetAiUsageReportOpts,
} from '@/lib/ai/usage-types';

// Re-export the client-safe types + formatUsd so server callers can
// import everything from this one module. Client components must
// import from '@/lib/ai/usage-types' directly (this file pulls in the
// service-role / next-headers server client).
export type {
  AiUsageByUser,
  AiUsageByEndpoint,
  AiUsageByDay,
  AiUsageRecentRow,
  AiUsageReport,
  GetAiUsageReportOpts,
} from '@/lib/ai/usage-types';
export { formatUsd } from '@/lib/ai/usage-types';

interface RawEvent {
  id: string;
  user_id: string | null;
  endpoint: string;
  model: string;
  input_tokens: number | null;
  output_tokens: number | null;
  cache_read_tokens: number | null;
  cache_write_tokens: number | null;
  cost_usd_micros: number | null;
  status: string;
  created_at: string;
}

function tokensOf(e: {
  input_tokens: number | null;
  output_tokens: number | null;
  cache_read_tokens: number | null;
  cache_write_tokens: number | null;
}): number {
  return (
    (e.input_tokens ?? 0) +
    (e.output_tokens ?? 0) +
    (e.cache_read_tokens ?? 0) +
    (e.cache_write_tokens ?? 0)
  );
}

function shortId(id: string | null): string {
  if (!id) return 'system';
  return id.slice(0, 8);
}

export async function getAiUsageReport(
  opts: GetAiUsageReportOpts,
): Promise<AiUsageReport> {
  const { workspaceId, monthStartIso, prevMonthStartIso } = opts;
  const supabase = createServiceSupabaseClient();

  // ── This-month events (full rows for aggregation) ────────────────
  let thisMonthQuery = supabase
    .from('ai_usage_events')
    .select(
      'id, user_id, endpoint, model, input_tokens, output_tokens, cache_read_tokens, cache_write_tokens, cost_usd_micros, status, created_at',
    )
    .gte('created_at', monthStartIso)
    .order('created_at', { ascending: false });
  if (workspaceId) thisMonthQuery = thisMonthQuery.eq('workspace_id', workspaceId);

  // ── Last-month events (cost only, for the comparison total) ──────
  let lastMonthQuery = supabase
    .from('ai_usage_events')
    .select('cost_usd_micros')
    .gte('created_at', prevMonthStartIso)
    .lt('created_at', monthStartIso);
  if (workspaceId) lastMonthQuery = lastMonthQuery.eq('workspace_id', workspaceId);

  // ── Recent feed (latest 100, this workspace or all) ──────────────
  let recentQuery = supabase
    .from('ai_usage_events')
    .select(
      'id, user_id, endpoint, model, input_tokens, output_tokens, cache_read_tokens, cache_write_tokens, cost_usd_micros, status, created_at',
    )
    .order('created_at', { ascending: false })
    .limit(100);
  if (workspaceId) recentQuery = recentQuery.eq('workspace_id', workspaceId);

  const [
    { data: thisMonthRaw },
    { data: lastMonthRaw },
    { data: recentRaw },
    { data: workspacesRaw },
  ] = await Promise.all([
    thisMonthQuery,
    lastMonthQuery,
    recentQuery,
    supabase.from('workspaces').select('id, name').order('name'),
  ]);

  const thisMonthEvents = (thisMonthRaw ?? []) as RawEvent[];
  const recentEvents = (recentRaw ?? []) as RawEvent[];

  // ── Resolve labels for every distinct user_id we'll show ─────────
  const userIds = new Set<string>();
  for (const e of thisMonthEvents) if (e.user_id) userIds.add(e.user_id);
  for (const e of recentEvents) if (e.user_id) userIds.add(e.user_id);

  const labelById = new Map<string, string>();
  if (userIds.size > 0) {
    const { data: profilesRaw } = await supabase
      .from('profiles')
      // INCIDENT 2026-08-05 №2 — profiles has `name`, not `full_name` (that's
      // persons). Alias keeps the row shape; the contract test pins it.
      .select('id, full_name:name, email')
      .in('id', Array.from(userIds));
    for (const p of (profilesRaw ?? []) as {
      id: string;
      full_name: string | null;
      email: string | null;
    }[]) {
      const label =
        (p.full_name && p.full_name.trim()) ||
        (p.email && p.email.trim()) ||
        shortId(p.id);
      labelById.set(p.id, label);
    }
  }

  const labelFor = (userId: string | null): string => {
    if (!userId) return 'system';
    return labelById.get(userId) ?? shortId(userId);
  };

  // ── Totals ───────────────────────────────────────────────────────
  const totalThisMonthMicros = thisMonthEvents.reduce(
    (sum, e) => sum + (e.cost_usd_micros ?? 0),
    0,
  );
  const totalLastMonthMicros = (
    (lastMonthRaw ?? []) as { cost_usd_micros: number | null }[]
  ).reduce((sum, e) => sum + (e.cost_usd_micros ?? 0), 0);

  // ── By user ──────────────────────────────────────────────────────
  const userAgg = new Map<
    string,
    { userId: string | null; calls: number; tokens: number; micros: number }
  >();
  for (const e of thisMonthEvents) {
    const key = e.user_id ?? '__system__';
    const row =
      userAgg.get(key) ??
      { userId: e.user_id, calls: 0, tokens: 0, micros: 0 };
    row.calls += 1;
    row.tokens += tokensOf(e);
    row.micros += e.cost_usd_micros ?? 0;
    userAgg.set(key, row);
  }
  const byUser: AiUsageByUser[] = Array.from(userAgg.values())
    .map((r) => ({
      userId: r.userId,
      label: labelFor(r.userId),
      calls: r.calls,
      tokens: r.tokens,
      micros: r.micros,
      pctOfTotal:
        totalThisMonthMicros > 0
          ? (r.micros / totalThisMonthMicros) * 100
          : 0,
    }))
    .sort((a, b) => b.micros - a.micros);

  // ── By endpoint ──────────────────────────────────────────────────
  const endpointAgg = new Map<
    string,
    { calls: number; micros: number }
  >();
  for (const e of thisMonthEvents) {
    const row = endpointAgg.get(e.endpoint) ?? { calls: 0, micros: 0 };
    row.calls += 1;
    row.micros += e.cost_usd_micros ?? 0;
    endpointAgg.set(e.endpoint, row);
  }
  const byEndpoint: AiUsageByEndpoint[] = Array.from(endpointAgg.entries())
    .map(([endpoint, r]) => ({
      endpoint,
      calls: r.calls,
      micros: r.micros,
      avgMicros: r.calls > 0 ? r.micros / r.calls : 0,
    }))
    .sort((a, b) => b.micros - a.micros);

  // ── By day (one entry per day from month start up to today) ──────
  const dayAgg = new Map<string, number>();
  for (const e of thisMonthEvents) {
    const date = e.created_at.slice(0, 10);
    dayAgg.set(date, (dayAgg.get(date) ?? 0) + (e.cost_usd_micros ?? 0));
  }
  const byDay: AiUsageByDay[] = [];
  const monthStart = new Date(monthStartIso);
  const todayIso = new Date().toISOString().slice(0, 10);
  for (let i = 0; i < 31; i++) {
    const d = new Date(monthStart);
    d.setUTCDate(monthStart.getUTCDate() + i);
    if (d.getUTCMonth() !== monthStart.getUTCMonth()) break;
    const iso = d.toISOString().slice(0, 10);
    byDay.push({ date: iso, micros: dayAgg.get(iso) ?? 0 });
    if (iso >= todayIso) break;
  }

  // ── Top user / endpoint ──────────────────────────────────────────
  const topUser =
    byUser.length > 0
      ? { userId: byUser[0].userId, label: byUser[0].label, micros: byUser[0].micros }
      : null;
  const topEndpoint =
    byEndpoint.length > 0
      ? { endpoint: byEndpoint[0].endpoint, micros: byEndpoint[0].micros }
      : null;

  // ── Recent feed ──────────────────────────────────────────────────
  const recent: AiUsageRecentRow[] = recentEvents.map((e) => ({
    id: e.id,
    createdAt: e.created_at,
    userLabel: labelFor(e.user_id),
    endpoint: e.endpoint,
    model: e.model,
    tokens: tokensOf(e),
    micros: e.cost_usd_micros ?? 0,
    status: e.status,
  }));

  const workspaces = (
    (workspacesRaw ?? []) as { id: string; name: string | null }[]
  ).map((w) => ({ id: w.id, name: w.name ?? w.id.slice(0, 8) }));

  return {
    totalThisMonthMicros,
    totalLastMonthMicros,
    topUser,
    topEndpoint,
    byUser,
    byEndpoint,
    byDay,
    recent,
    workspaces,
  };
}
