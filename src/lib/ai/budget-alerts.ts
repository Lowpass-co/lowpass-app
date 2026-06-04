/* ============================================================
   LOWPASS — AI budget email alerts (CC_AI_USAGE_TRACKING §AI-6)

   `withAiUsage()` calls maybeFireBudgetAlerts() fire-and-forget after
   every successful AI call. This reads the workspace's ai_usage_limits,
   sums month-to-date spend, and emails the workspace's alert recipients
   (or its admins) when spend first crosses 50 / 80 / 100% of the monthly
   budget — once per threshold per month.

   Dedup: each threshold has a last_NN_alert_sent_at column. A threshold
   counts as "already sent this month" when its stamp is >= the current
   month start, so month rollover resets it lazily with no cron.

   Recipients: ai_usage_limits.alert_recipients if non-empty, else the
   workspace's admin members (profiles.email). No row / no budget / no
   RESEND_API_KEY → no-op. Never throws (the caller doesn't await it).

   Reuses the notifications wrapShell for the email chrome + the same
   RESEND_FROM_ADDRESS as the rest of the app.
   ============================================================ */

import { Resend } from 'resend';
import type { SupabaseClient } from '@supabase/supabase-js';
import { wrapShell } from '@/lib/notifications/templates';
import { formatUsd } from '@/lib/ai/usage-types';

const FROM_ADDRESS =
  process.env.RESEND_FROM_ADDRESS ?? 'Lowpass <notifications@lowpass.co>';

function monthStartIso(): string {
  const now = new Date();
  return new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1),
  ).toISOString();
}

interface LimitsRow {
  monthly_budget_usd_micros: number | null;
  alert_at_percent_50: boolean | null;
  alert_at_percent_80: boolean | null;
  alert_at_percent_100: boolean | null;
  alert_recipients: string[] | null;
  last_50_alert_sent_at: string | null;
  last_80_alert_sent_at: string | null;
  last_100_alert_sent_at: string | null;
}

async function sumMonthSpend(
  svc: SupabaseClient,
  workspaceId: string,
  monthStart: string,
): Promise<number> {
  const { data } = await svc
    .from('ai_usage_events')
    .select('cost_usd_micros')
    .eq('workspace_id', workspaceId)
    .gte('created_at', monthStart);
  return (data ?? []).reduce(
    (acc: number, r: { cost_usd_micros: number | null }) =>
      acc + Number(r.cost_usd_micros ?? 0),
    0,
  );
}

/** alert_recipients if set, else the emails of the workspace's admins. */
async function resolveRecipients(
  svc: SupabaseClient,
  workspaceId: string,
  configured: string[] | null,
): Promise<string[]> {
  if (configured && configured.length > 0) return configured;
  const { data: admins } = await svc
    .from('workspace_members')
    .select('user_id')
    .eq('workspace_id', workspaceId)
    .eq('role', 'admin');
  const ids = (admins ?? []).map((a: { user_id: string }) => a.user_id);
  if (ids.length === 0) return [];
  const { data: profiles } = await svc
    .from('profiles')
    .select('email')
    .in('id', ids);
  return (profiles ?? [])
    .map((p: { email: string | null }) => p.email)
    .filter((e): e is string => !!e);
}

function alertHtml(
  pct: number,
  spentMicros: number,
  budgetMicros: number,
  workspaceName: string,
): string {
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? '';
  const link = appUrl ? `${appUrl}/admin/ai-usage` : '/admin/ai-usage';
  return `
    <p><strong>${workspaceName}</strong> has used <strong>${formatUsd(spentMicros)}</strong> of its <strong>${formatUsd(budgetMicros)}</strong> monthly AI budget — that's <strong>${pct}%</strong>.</p>
    <p>${
      pct >= 100
        ? 'The budget is spent. New AI calls are blocked once a user hits their hard cap or the workspace budget is exhausted.'
        : 'You may want to review usage before the budget runs out.'
    }</p>
    <p><a href="${link}">Open the AI usage dashboard →</a></p>
  `;
}

export async function maybeFireBudgetAlerts(
  svc: SupabaseClient,
  workspaceId: string,
): Promise<void> {
  try {
    const apiKey = process.env.RESEND_API_KEY;
    if (!apiKey) return;

    const { data: lim } = await svc
      .from('ai_usage_limits')
      .select(
        'monthly_budget_usd_micros, alert_at_percent_50, alert_at_percent_80, alert_at_percent_100, alert_recipients, last_50_alert_sent_at, last_80_alert_sent_at, last_100_alert_sent_at',
      )
      .eq('workspace_id', workspaceId)
      .maybeSingle<LimitsRow>();

    // No configured limits row → no alert config to act on (the stamp
    // columns live on this row, so without it we couldn't dedup anyway).
    if (!lim) return;
    const budget = Number(lim.monthly_budget_usd_micros ?? 0);
    if (budget <= 0) return;

    const monthStart = monthStartIso();
    const spent = await sumMonthSpend(svc, workspaceId, monthStart);
    const pct = (spent / budget) * 100;

    // Highest crossed threshold not yet alerted THIS month.
    const tiers = [
      { p: 50, enabled: lim.alert_at_percent_50 !== false, col: 'last_50_alert_sent_at' as const, last: lim.last_50_alert_sent_at },
      { p: 80, enabled: lim.alert_at_percent_80 !== false, col: 'last_80_alert_sent_at' as const, last: lim.last_80_alert_sent_at },
      { p: 100, enabled: lim.alert_at_percent_100 !== false, col: 'last_100_alert_sent_at' as const, last: lim.last_100_alert_sent_at },
    ];
    let toFire: (typeof tiers)[number] | null = null;
    for (const t of tiers) {
      if (!t.enabled || pct < t.p) continue;
      const sentThisMonth = !!t.last && t.last >= monthStart;
      if (sentThisMonth) continue;
      toFire = t; // ascending loop → last assignment is the highest crossed
    }
    if (!toFire) return;

    // Stamp BEFORE sending so a slow/duplicate concurrent call can't
    // double-fire (at-most-once bias; a send failure just skips this tick).
    await svc
      .from('ai_usage_limits')
      .update({ [toFire.col]: new Date().toISOString() })
      .eq('workspace_id', workspaceId);

    const recipients = await resolveRecipients(svc, workspaceId, lim.alert_recipients);
    if (recipients.length === 0) return;

    const { data: ws } = await svc
      .from('workspaces')
      .select('name')
      .eq('id', workspaceId)
      .maybeSingle<{ name: string | null }>();
    const wsName = ws?.name ?? 'Your workspace';

    const resend = new Resend(apiKey);
    await resend.emails.send({
      from: FROM_ADDRESS,
      to: recipients,
      subject: `${wsName} AI budget at ${toFire.p}%`,
      html: wrapShell(alertHtml(toFire.p, spent, budget, wsName)),
    });
  } catch (err) {
    // Fire-and-forget — never surface to the AI response path.
    console.error('[ai-budget-alert] failed', err);
  }
}
