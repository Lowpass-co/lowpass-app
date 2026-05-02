/* ============================================
   LOWPASS — Advance · Tour-overview stats strip (visual redesign §B)

   Sticky strip beneath <ProductHeader> on /advance/[tourId]. Five
   numbers in mono with uppercase tracked-wide labels — mirrors the
   per-show treatment Phase 3 §B.1 used for budget.

   Stats:
     TOUR PROGRESS    — completed advances / total show + festival days
     SHOWS COMPLETE   — count of complete advance instances
     SHOWS PENDING    — show / festival days that are not yet complete
     DAYS UNTIL FIRST — days from today to the first show day
     DAYS UNTIL LAST  — days from today to the last show day

   Server-renderable. Receives the routing rows + advance instances
   as props from the page; computation happens here so the file
   stays self-contained.
   ============================================ */

interface AdvanceOverviewStatsStripProps {
  shows: {
    routingId: string;
    date: string;
    dayType: string | null;
    advanceStatus: string | null;
  }[];
}

function dayDeltaFromToday(iso: string | null | undefined): number | null {
  if (!iso) return null;
  const d = new Date(`${iso.slice(0, 10)}T12:00:00Z`);
  if (Number.isNaN(d.getTime())) return null;
  const today = new Date();
  today.setUTCHours(0, 0, 0, 0);
  return Math.round((d.getTime() - today.getTime()) / 86_400_000);
}

export function AdvanceOverviewStatsStrip({
  shows,
}: AdvanceOverviewStatsStripProps) {
  const showsAndFestivals = shows.filter((s) => {
    const dt = (s.dayType ?? '').toLowerCase();
    return dt.includes('show') || dt.includes('festival');
  });
  const total = showsAndFestivals.length;
  const complete = showsAndFestivals.filter(
    (s) => (s.advanceStatus ?? '').toLowerCase() === 'complete',
  ).length;
  const pending = total - complete;
  const progressPct = total > 0 ? Math.round((complete / total) * 100) : 0;

  // Sort by date so first / last are unambiguous.
  const sortedDates = showsAndFestivals
    .map((s) => s.date)
    .filter(Boolean)
    .sort();
  const firstShowIso = sortedDates[0] ?? null;
  const lastShowIso = sortedDates[sortedDates.length - 1] ?? null;
  const daysToFirst = dayDeltaFromToday(firstShowIso);
  const daysToLast = dayDeltaFromToday(lastShowIso);

  return (
    <div
      className="lp-advance-overview-stats sticky z-10 flex flex-wrap items-center gap-x-8 gap-y-1 border-b px-6 py-2"
      style={{
        top: 0,
        background: 'var(--lp-panel)',
        borderColor: 'var(--lp-border-strong)',
        minHeight: 40,
      }}
    >
      <Stat label="Tour progress" value={total > 0 ? `${progressPct}%` : '—'} />
      <Stat label="Shows complete" value={String(complete)} />
      <Stat
        label="Shows pending"
        value={String(pending)}
        tone={pending > 0 ? 'attention' : undefined}
      />
      <Stat
        label="Days until first"
        value={formatDayDelta(daysToFirst)}
      />
      <Stat
        label="Days until last"
        value={formatDayDelta(daysToLast)}
      />
    </div>
  );
}

function formatDayDelta(delta: number | null): string {
  if (delta === null) return '—';
  if (delta === 0) return 'today';
  if (delta < 0) return `${Math.abs(delta)}d past`;
  return `${delta}d`;
}

function Stat({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone?: 'attention';
}) {
  const valueColor =
    tone === 'attention'
      ? 'var(--color-lp-status-needs-review)'
      : 'var(--lp-text)';
  return (
    <div className="flex items-baseline gap-2">
      <span
        style={{
          fontSize: '11px',
          fontWeight: 600,
          letterSpacing: '0.08em',
          textTransform: 'uppercase',
          color: 'var(--lp-text-tertiary)',
        }}
      >
        {label}
      </span>
      <span
        className="lp-mono"
        style={{
          fontSize: '15px',
          fontWeight: 600,
          color: valueColor,
          lineHeight: 1.1,
        }}
      >
        {value}
      </span>
    </div>
  );
}
