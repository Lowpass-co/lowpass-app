/* ============================================
   LOWPASS — <TourOverview> (Nov 2026, Adam)

   Where a tour opens. Three blocks, in this order:
     1. Next show — when, where, and how far its advance has got.
     2. Needs you — one line per thing to do, each a count and a link.
     3. Advance · Budget · Production — one line each, each a link.
   No charts, no activity feed. Rules: src/lib/tour/overview.ts.
   ============================================ */

import Link from 'next/link';
import { ArrowRight, CalendarClock, CheckCircle2, ClipboardList, Shapes, Table2 } from 'lucide-react';
import { PageHeader } from '@/components/ui/PageHeader';
import {
  advanceLine,
  budgetLine,
  needsYou,
  nextShow,
  productionLine,
  whenText,
  type OverviewFacts,
} from '@/lib/tour/overview';

function formatDay(iso: string): string {
  const d = new Date(`${iso.slice(0, 10)}T12:00:00Z`);
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' });
}

const card: React.CSSProperties = {
  border: '1px solid var(--lp-border)',
  borderRadius: 'var(--lp-radius-lg)',
  background: 'var(--lp-surface)',
  padding: 'var(--lp-space-4)',
};
const caps: React.CSSProperties = {
  margin: '0 0 var(--lp-space-2)',
  fontSize: 'var(--lp-text-xs)',
  fontWeight: 'var(--lp-weight-semibold)',
  letterSpacing: '0.08em',
  textTransform: 'uppercase',
  color: 'var(--lp-text-tertiary)',
};

export function TourOverview({ facts }: { facts: OverviewFacts }) {
  const t = facts.tourId;
  const next = nextShow(facts);
  const todo = needsYou(facts);

  const areas = [
    { show: facts.allow.advance, label: 'Advance', line: advanceLine(facts), href: `/advance/${t}`, Icon: ClipboardList },
    { show: facts.allow.budget, label: 'Budget', line: budgetLine(facts), href: `/budget/${t}?tab=budget`, Icon: Table2 },
    { show: facts.allow.production, label: 'Production', line: productionLine(facts), href: `/operations/${t}/riders`, Icon: Shapes },
  ].filter((a) => a.show);

  return (
    <div className="space-y-6 px-4 pt-6" style={{ paddingBottom: 'var(--lp-space-8)', maxWidth: 880 }}>
      <PageHeader title="Overview" />

      <section aria-labelledby="ov-next" style={card} data-testid="overview-next">
        <h2 id="ov-next" style={caps}>Next show</h2>
        {next ? (
          <div className="flex flex-wrap items-center justify-between" style={{ gap: 'var(--lp-space-3)' }}>
            <div style={{ minWidth: 0 }}>
              <div style={{ fontSize: 'var(--lp-text-lg)', fontWeight: 'var(--lp-weight-semibold)', color: 'var(--lp-text)' }}>
                {formatDay(next.date)} · {next.venue || next.city || 'Venue to confirm'}
                {next.venue && next.city ? <span style={{ color: 'var(--lp-text-secondary)', fontWeight: 'var(--lp-weight-regular)' }}>, {next.city}</span> : null}
              </div>
              <div style={{ marginTop: 'var(--lp-space-1)', fontSize: 'var(--lp-text-sm)', color: 'var(--lp-text-secondary)' }}>
                <CalendarClock size={14} aria-hidden style={{ display: 'inline', verticalAlign: '-2px', marginRight: 'var(--lp-space-1)' }} />
                {whenText(next.inDays)}
                {facts.allow.advance ? (
                  <>
                    {' '}· Advance {next.total ? `${next.answered} of ${next.total} answered` : 'not set up'}
                    {next.toReview ? ` · ${next.toReview} to review` : ''}
                    {/* The venue request, unless the counts already say it. */}
                    {next.requestKind === 'answered' || next.requestKind === 'done' ? '' : ` · ${next.requestLabel}`}
                  </>
                ) : null}
              </div>
            </div>
            {facts.allow.advance ? (
            <Link
              href={`/advance/${t}/${next.routingId}`}
              className="inline-flex items-center btn-transition"
              style={{
                gap: 'var(--lp-space-1)',
                padding: 'var(--lp-space-2) var(--lp-space-3)',
                fontSize: 'var(--lp-text-sm)',
                fontWeight: 'var(--lp-weight-semibold)',
                color: 'var(--lp-text-inverse)',
                background: 'var(--lp-orange)',
                borderRadius: 'var(--lp-radius-md)',
                textDecoration: 'none',
              }}
            >
              Open advance <ArrowRight size={14} aria-hidden />
            </Link>
            ) : null}
          </div>
        ) : (
          <p style={{ margin: 0, fontSize: 'var(--lp-text-sm)', color: 'var(--lp-text-secondary)' }}>
            No shows coming up.{' '}
            <Link href={`/operations/${t}/routing?import=1`}>Import a routing or tour book</Link> to add dates.
          </p>
        )}
      </section>

      <section aria-labelledby="ov-needs" style={card} data-testid="overview-needs">
        <h2 id="ov-needs" style={caps}>Needs you</h2>
        {todo.length ? (
          <ul style={{ listStyle: 'none', margin: 0, padding: 0 }}>
            {todo.map((n, i) => (
              <li key={n.id} style={{ borderTop: i ? '1px solid var(--lp-border-subtle)' : undefined }}>
                <Link
                  href={n.href}
                  className="flex items-center justify-between"
                  style={{ gap: 'var(--lp-space-3)', padding: 'var(--lp-space-2) 0', textDecoration: 'none', color: 'var(--lp-text)', fontSize: 'var(--lp-text-sm)' }}
                >
                  <span style={{ minWidth: 0 }}>{n.text}</span>
                  <span className="inline-flex items-center" style={{ gap: 'var(--lp-space-1)', color: 'var(--lp-orange)', flexShrink: 0, fontWeight: 'var(--lp-weight-medium)' }}>
                    {n.cta} <ArrowRight size={14} aria-hidden />
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        ) : (
          <p className="flex items-center" style={{ margin: 0, gap: 'var(--lp-space-2)', fontSize: 'var(--lp-text-sm)', color: 'var(--lp-text-secondary)' }}>
            <CheckCircle2 size={16} aria-hidden style={{ color: 'var(--color-lp-success)' }} /> Nothing needs you right now.
          </p>
        )}
      </section>

      <section aria-label="Advance, Budget and Production" style={{ display: 'grid', gap: 'var(--lp-space-2)' }}>
        {areas.map(({ label, line, href, Icon }) => (
          <Link
            key={label}
            href={href}
            className="flex items-center"
            style={{ ...card, padding: 'var(--lp-space-3) var(--lp-space-4)', gap: 'var(--lp-space-3)', textDecoration: 'none', color: 'var(--lp-text)' }}
          >
            <Icon size={18} aria-hidden style={{ color: 'var(--lp-text-tertiary)', flexShrink: 0 }} />
            <span style={{ fontWeight: 'var(--lp-weight-semibold)', width: 96, flexShrink: 0 }}>{label}</span>
            <span style={{ flex: 1, minWidth: 0, fontSize: 'var(--lp-text-sm)', color: 'var(--lp-text-secondary)' }}>{line}</span>
            <ArrowRight size={14} aria-hidden style={{ color: 'var(--lp-text-tertiary)', flexShrink: 0 }} />
          </Link>
        ))}
      </section>
    </div>
  );
}
