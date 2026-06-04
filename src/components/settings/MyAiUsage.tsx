/* ============================================
   LOWPASS — "Your AI usage this month" widget (§AI-7)

   Server component shown on /settings for every workspace member. Reads
   the caller's own month-to-date AI events (RLS scopes to their
   workspace; we filter to their user_id) + their effective soft/hard
   caps (per-user override → workspace default → migration-114 default),
   and renders calls / tokens / cost + a progress bar toward the hard
   cap with a soft-cap marker.

   Returns null when there's no workspace or no usage config, so it never
   clutters the page with an empty card.
   ============================================ */

import { createServerSupabaseClient } from '@/lib/supabase-server';
import { formatUsd } from '@/lib/ai/usage-types';

const DEFAULT_SOFT = 2_000_000;
const DEFAULT_HARD = 8_000_000;

function monthStartIso(): string {
  const now = new Date();
  return new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1),
  ).toISOString();
}

export async function MyAiUsage() {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data: profile } = await supabase
    .from('profiles')
    .select('workspace_id')
    .eq('id', user.id)
    .maybeSingle<{ workspace_id: string | null }>();
  const workspaceId = profile?.workspace_id ?? null;
  if (!workspaceId) return null;

  const monthStart = monthStartIso();
  const [evRes, limRes, ovRes] = await Promise.all([
    supabase
      .from('ai_usage_events')
      .select('cost_usd_micros, input_tokens, output_tokens')
      .eq('workspace_id', workspaceId)
      .eq('user_id', user.id)
      .gte('created_at', monthStart)
      .returns<
        { cost_usd_micros: number | null; input_tokens: number | null; output_tokens: number | null }[]
      >(),
    supabase
      .from('ai_usage_limits')
      .select('per_user_soft_cap_usd_micros, per_user_hard_cap_usd_micros')
      .eq('workspace_id', workspaceId)
      .maybeSingle<{
        per_user_soft_cap_usd_micros: number | null;
        per_user_hard_cap_usd_micros: number | null;
      }>(),
    supabase
      .from('ai_usage_user_overrides')
      .select('soft_cap_usd_micros, hard_cap_usd_micros')
      .eq('workspace_id', workspaceId)
      .eq('user_id', user.id)
      .maybeSingle<{
        soft_cap_usd_micros: number | null;
        hard_cap_usd_micros: number | null;
      }>(),
  ]);

  const events = evRes.data ?? [];
  const calls = events.length;
  const cost = events.reduce((a, r) => a + Number(r.cost_usd_micros ?? 0), 0);
  const tokens = events.reduce(
    (a, r) => a + Number(r.input_tokens ?? 0) + Number(r.output_tokens ?? 0),
    0,
  );

  const softCap =
    ovRes.data?.soft_cap_usd_micros ??
    limRes.data?.per_user_soft_cap_usd_micros ??
    DEFAULT_SOFT;
  const hardCap =
    ovRes.data?.hard_cap_usd_micros ??
    limRes.data?.per_user_hard_cap_usd_micros ??
    DEFAULT_HARD;

  const pctOfHard = hardCap > 0 ? Math.min(100, (cost / hardCap) * 100) : 0;
  const softMarkerPct = hardCap > 0 ? Math.min(100, (softCap / hardCap) * 100) : 0;
  const atHard = cost >= hardCap;
  const atSoft = !atHard && cost >= softCap;

  const barColor = atHard
    ? 'var(--color-lp-error)'
    : atSoft
      ? 'var(--color-lp-status-needs-review)'
      : 'var(--color-lp-status-complete)';

  return (
    <section
      className="rounded-xl border p-5"
      style={{ borderColor: 'var(--lp-border-strong)', background: 'var(--lp-surface)' }}
    >
      <h2 style={{ fontSize: 13, fontWeight: 600, color: 'var(--lp-text)' }}>
        Your AI usage this month
      </h2>

      <div className="mt-4 grid gap-4" style={{ gridTemplateColumns: 'repeat(3, 1fr)' }}>
        <Stat label="Calls" value={calls.toLocaleString('en-GB')} />
        <Stat label="Tokens" value={tokens.toLocaleString('en-GB')} />
        <Stat label="Cost" value={formatUsd(cost)} />
      </div>

      {/* Progress toward the hard cap, soft-cap tick overlaid. */}
      <div className="mt-5">
        <div
          className="relative overflow-hidden rounded-full"
          style={{ height: 8, background: 'var(--lp-border-subtle)' }}
        >
          <div
            style={{
              width: `${pctOfHard}%`,
              height: '100%',
              background: barColor,
              transition: 'width 200ms var(--lp-ease-standard, ease)',
            }}
          />
          {softMarkerPct > 0 && softMarkerPct < 100 ? (
            <span
              aria-hidden
              className="absolute top-0"
              style={{
                left: `${softMarkerPct}%`,
                height: '100%',
                width: 2,
                background: 'var(--lp-text-tertiary)',
              }}
              title="Soft cap"
            />
          ) : null}
        </div>
        <div
          className="mt-2 flex items-center justify-between"
          style={{ fontSize: 11, color: 'var(--lp-text-tertiary)' }}
        >
          <span>
            {formatUsd(cost)} of {formatUsd(hardCap)} limit
          </span>
          <span>Soft cap {formatUsd(softCap)}</span>
        </div>
      </div>

      {atHard ? (
        <p
          className="mt-3"
          style={{ fontSize: 13, color: 'var(--color-lp-error)', fontWeight: 500 }}
        >
          You’ve hit your AI usage limit for this month. Contact your workspace
          admin to raise it.
        </p>
      ) : atSoft ? (
        <p
          className="mt-3"
          style={{ fontSize: 13, color: 'color-mix(in srgb, var(--color-lp-status-needs-review) 85%, var(--lp-text))' }}
        >
          You’re approaching your monthly AI usage limit.
        </p>
      ) : null}
    </section>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div
        className="lp-mono"
        style={{ fontSize: 20, fontWeight: 600, color: 'var(--lp-text)', lineHeight: 1.1 }}
      >
        {value}
      </div>
      <div
        style={{
          marginTop: 2,
          fontSize: 10,
          fontWeight: 600,
          letterSpacing: '0.06em',
          textTransform: 'uppercase',
          color: 'var(--lp-text-tertiary)',
        }}
      >
        {label}
      </div>
    </div>
  );
}
