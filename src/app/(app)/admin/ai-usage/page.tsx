/* ============================================
   LOWPASS — /admin/ai-usage (§AI-4)

   Site-admin AI-usage dashboard. Cross-workspace cost +
   attribution. Gate mirrors /bugs (getUserAndAdminStatus →
   notFound if not admin); reads ALL workspaces through the
   service-role client inside getAiUsageReport.

   URL state:
     ?month=YYYY-MM  (default = current UTC month)
     ?workspace=<id> (absent = all workspaces)

   4 KPI tiles + tabbed <AiUsageDashboard>. Tiles + table area
   carry stable min-heights so async content doesn't shift the
   layout (UI/UX skill).
   ============================================ */

import { notFound } from 'next/navigation';
import { getUserAndAdminStatus } from '@/lib/site-admin';
import { PageHeader } from '@/components/ui/PageHeader';
import { getAiUsageReport, formatUsd } from '@/lib/ai/usage-report';
import { AiUsageDashboard } from '@/components/admin/AiUsageDashboard';
import { AiUsageFilters } from '@/components/admin/AiUsageFilters';

export const dynamic = 'force-dynamic';

/** "YYYY-MM" → its UTC month boundaries + neighbours + label. */
function resolveMonth(monthParam: string | undefined) {
  const now = new Date();
  const fallback = `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, '0')}`;
  const valid = monthParam && /^\d{4}-\d{2}$/.test(monthParam);
  const month = valid ? monthParam! : fallback;
  const [y, m] = month.split('-').map(Number);

  const start = new Date(Date.UTC(y, m - 1, 1));
  const next = new Date(Date.UTC(y, m, 1));
  const prev = new Date(Date.UTC(y, m - 2, 1));

  const fmt = (d: Date) =>
    `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;

  // Current real-world month, for disabling forward navigation.
  const currentMonth = `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, '0')}`;

  return {
    month,
    monthStartIso: start.toISOString(),
    nextMonthIso: next.toISOString(),
    prevMonthStartIso: prev.toISOString(),
    prevMonth: fmt(prev),
    nextMonth: fmt(next),
    monthLabel: start.toLocaleDateString('en-GB', {
      month: 'long',
      year: 'numeric',
      timeZone: 'UTC',
    }),
    nextDisabled: month >= currentMonth,
  };
}

export default async function AiUsagePage({
  searchParams,
}: {
  searchParams: Promise<{ month?: string; workspace?: string }>;
}) {
  const { user, isAdmin } = await getUserAndAdminStatus();
  if (!user || !isAdmin) {
    notFound();
  }

  const sp = await searchParams;
  const workspaceId = sp.workspace || null;
  const {
    month,
    monthStartIso,
    prevMonthStartIso,
    prevMonth,
    nextMonth,
    monthLabel,
    nextDisabled,
  } = resolveMonth(sp.month);

  const report = await getAiUsageReport({
    workspaceId,
    monthStartIso,
    prevMonthStartIso,
  });

  // Nav & entry fixpack item 5 — admin/layout.tsx already wraps the whole
  // /admin tree in listAppPageShell; wrapping again in <ProductShell> here
  // double-chromed the page. Render bare content and let the layout provide
  // the shell.
  return (
    <div className="flex min-h-0 flex-1 flex-col gap-4 p-4">
        <PageHeader
          title="AI Usage"
          subtitle="Cost + attribution across all workspaces."
          actions={
            <AiUsageFilters
              month={month}
              prevMonth={prevMonth}
              nextMonth={nextMonth}
              monthLabel={monthLabel}
              workspaceId={workspaceId}
              workspaces={report.workspaces}
              nextDisabled={nextDisabled}
            />
          }
        />

        {/* KPI tiles — stable min-height so swapping months/workspaces
            doesn't reflow the page. */}
        <section
          className="grid"
          style={{
            gap: 'var(--lp-space-3)',
            gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
          }}
        >
          <StatTile label="This month" value={formatUsd(report.totalThisMonthMicros)} />
          <StatTile label="Last month" value={formatUsd(report.totalLastMonthMicros)} />
          <StatTile
            label="Top user"
            value={report.topUser ? formatUsd(report.topUser.micros) : '$0.00'}
            sub={report.topUser?.label ?? '—'}
          />
          <StatTile
            label="Top endpoint"
            value={
              report.topEndpoint ? formatUsd(report.topEndpoint.micros) : '$0.00'
            }
            sub={report.topEndpoint?.endpoint ?? '—'}
          />
        </section>

        <div style={{ minHeight: 320 }}>
          <AiUsageDashboard report={report} />
        </div>
      </div>
  );
}

function StatTile({
  label,
  value,
  sub,
}: {
  label: string;
  value: string;
  sub?: string;
}) {
  return (
    <div
      className="rounded-lg border p-4"
      style={{
        borderColor: 'var(--lp-border-strong)',
        background: 'var(--lp-surface)',
        minHeight: 104,
      }}
    >
      <div className="lp-stat-label">{label}</div>
      <div className="lp-mono lp-stat-value mt-2">{value}</div>
      {sub ? (
        <div
          className="mt-1 truncate"
          style={{ fontSize: '12px', color: 'var(--lp-text-tertiary)' }}
          title={sub}
        >
          {sub}
        </div>
      ) : null}
    </div>
  );
}
