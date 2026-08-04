/* ============================================
   LOWPASS — Settings · AI limits (§AI-5)

   Workspace-admin surface for the per-workspace AI budget + the
   default per-user caps, plus per-user overrides. Gate mirrors
   /settings/members: read workspace_members.role for the caller;
   non-admins get a read-only notice (not a 404) since the nav link
   is visible to everyone.

   Writes go through /api/ai-usage/{limits,overrides}, which use the
   RLS-enforcing client so the admin-only insert/update policies on
   ai_usage_limits / ai_usage_user_overrides do the real gating.
   ============================================ */

import Link from 'next/link';
import { SettingsSubNav } from '@/components/settings/SettingsSubNav';
import { PageHeader } from '@/components/ui/PageHeader';
import { createServerSupabaseClient } from '@/lib/supabase-server';
import { AiLimitsClient, type AiLimitMember } from '@/components/settings/AiLimitsClient';

export const dynamic = 'force-dynamic';

// Mirror migration 114 defaults (used when the workspace has no row yet).
const DEFAULTS = {
  monthly: 25_000_000,
  soft: 2_000_000,
  hard: 8_000_000,
};

export default async function AiLimitsPage() {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  let workspaceId: string | null = null;
  let isAdmin = false;
  if (user) {
    const { data: profile } = await supabase
      .from('profiles')
      .select('workspace_id')
      .eq('id', user.id)
      .maybeSingle<{ workspace_id: string | null }>();
    workspaceId = profile?.workspace_id ?? null;
    if (workspaceId) {
      const { data: membership } = await supabase
        .from('workspace_members')
        .select('role')
        .eq('workspace_id', workspaceId)
        .eq('user_id', user.id)
        .maybeSingle<{ role: string | null }>();
      isAdmin = membership?.role === 'admin';
    }
  }

  let limits = { ...DEFAULTS };
  let members: AiLimitMember[] = [];

  if (workspaceId) {
    const [limRes, memRes, ovRes] = await Promise.all([
      supabase
        .from('ai_usage_limits')
        .select(
          'monthly_budget_usd_micros, per_user_soft_cap_usd_micros, per_user_hard_cap_usd_micros',
        )
        .eq('workspace_id', workspaceId)
        .maybeSingle<{
          monthly_budget_usd_micros: number | null;
          per_user_soft_cap_usd_micros: number | null;
          per_user_hard_cap_usd_micros: number | null;
        }>(),
      supabase
        .from('workspace_members')
        .select('user_id, role')
        .eq('workspace_id', workspaceId)
        .returns<{ user_id: string; role: string | null }[]>(),
      supabase
        .from('ai_usage_user_overrides')
        .select('user_id, soft_cap_usd_micros, hard_cap_usd_micros')
        .eq('workspace_id', workspaceId)
        .returns<
          {
            user_id: string;
            soft_cap_usd_micros: number | null;
            hard_cap_usd_micros: number | null;
          }[]
        >(),
    ]);

    limits = {
      monthly: limRes.data?.monthly_budget_usd_micros ?? DEFAULTS.monthly,
      soft: limRes.data?.per_user_soft_cap_usd_micros ?? DEFAULTS.soft,
      hard: limRes.data?.per_user_hard_cap_usd_micros ?? DEFAULTS.hard,
    };

    const memberRows = memRes.data ?? [];
    const userIds = memberRows.map((m) => m.user_id);
    const { data: profiles } = userIds.length
      ? await supabase
          .from('profiles')
          .select('id, full_name, email')
          .in('id', userIds)
          .returns<{ id: string; full_name: string | null; email: string | null }[]>()
      : { data: [] as { id: string; full_name: string | null; email: string | null }[] };
    const profMap = new Map((profiles ?? []).map((p) => [p.id, p]));
    const ovMap = new Map((ovRes.data ?? []).map((o) => [o.user_id, o]));

    members = memberRows.map((m) => {
      const p = profMap.get(m.user_id);
      const o = ovMap.get(m.user_id);
      return {
        userId: m.user_id,
        label: p?.full_name?.trim() || p?.email || `${m.user_id.slice(0, 8)}…`,
        role: m.role ?? 'member',
        softOverrideMicros: o?.soft_cap_usd_micros ?? null,
        hardOverrideMicros: o?.hard_cap_usd_micros ?? null,
      };
    });
    members.sort((a, b) => a.label.localeCompare(b.label));
  }

  return (
    <>{/* S-3b — chrome from the (you) layout's ShellV3Mount */}
      <SettingsSubNav pathname="/settings/ai-limits" />
      <div className="mx-auto w-full max-w-3xl" style={{ padding: 'var(--lp-space-4)' }}>
        <PageHeader
          title="AI limits"
          subtitle="Budgets + per-user caps for AI features."
          className="mb-6"
        />

        {!isAdmin ? (
          <div
            className="rounded-xl border p-6 text-center"
            style={{
              borderColor: 'var(--lp-border-strong)',
              background: 'var(--lp-surface)',
            }}
          >
            <p style={{ fontSize: 14, color: 'var(--lp-text-secondary)' }}>
              AI limits are managed by workspace admins. Your usage is shown on
              the{' '}
              <Link
                href="/settings"
                style={{ color: 'var(--color-lp-orange)', fontWeight: 500 }}
              >
                Settings
              </Link>{' '}
              page.
            </p>
          </div>
        ) : (
          <AiLimitsClient
            initialLimits={{
              monthlyUsdMicros: limits.monthly,
              softUsdMicros: limits.soft,
              hardUsdMicros: limits.hard,
            }}
            members={members}
          />
        )}
      </div>
    </>
  );
}
