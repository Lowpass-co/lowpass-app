/* ============================================
   LOWPASS — <TourOverview> (Nov 2026, Adam; redrawn Nov 2026)

   Where a tour opens. Full width like the app's other pages; one panel
   style throughout, rows split by hairlines:
     1. The show — "Today" when it's today, else "Next show · in N days":
        venue large, date / city / advance progress under it, one orange
        button (the only orange on the page).
     2. Needs you — each row a count (large) + what it is + a quiet arrow;
        the whole row is the link.
     3. This tour — Advance · Budget · Production, one line each.
   Wide screens: Needs you and This tour side by side under the show.
   No charts, no stat cards, no activity feed. Rules: src/lib/tour/overview.ts.
   ============================================ */

import Link from 'next/link';
import { ArrowRight, CheckCircle2, ChevronRight, ClipboardList, Shapes, Table2 } from 'lucide-react';
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
import './overview.css';

function formatDay(iso: string): string {
  const d = new Date(`${iso.slice(0, 10)}T12:00:00Z`);
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' });
}

export function TourOverview({ facts }: { facts: OverviewFacts }) {
  const t = facts.tourId;
  const next = nextShow(facts);
  const todo = needsYou(facts);

  const areas = [
    { show: facts.allow.advance, label: 'Advance', line: advanceLine(facts), href: `/advance/${t}`, Icon: ClipboardList },
    { show: facts.allow.budget, label: 'Budget', line: budgetLine(facts), href: `/budget/${t}?tab=budget`, Icon: Table2 },
    { show: facts.allow.production, label: 'Production', line: productionLine(facts), href: `/operations/${t}/riders`, Icon: Shapes },
  ].filter((a) => a.show);

  const today = next && next.inDays <= 0;

  return (
    <div className="ov-page">
      <PageHeader title="Overview" />

      <section aria-labelledby="ov-next" className={`ov-panel ov-show${today ? ' is-today' : ''}`} data-testid="overview-next">
        <h2 id="ov-next" className="lp-label-caps ov-label">
          {next ? (today ? 'Today' : `Next show · ${whenText(next.inDays)}`) : 'Next show'}
        </h2>
        {next ? (
          <div className="ov-show-body">
            <div style={{ minWidth: 0 }}>
              <div className="ov-venue">{next.venue || next.city || 'Venue to confirm'}</div>
              <div className="ov-meta">
                <span>{formatDay(next.date)}</span>
                {next.venue && next.city ? <span>{next.city}</span> : null}
                {facts.allow.advance ? (
                  <span>{next.total ? `Advance ${next.answered} of ${next.total} answered` : 'Advance not set up'}</span>
                ) : null}
                {facts.allow.advance && next.toReview ? <span className="ov-meta-strong">{next.toReview} to review</span> : null}
                {/* The venue request, unless the counts already say it. */}
                {facts.allow.advance && next.requestKind !== 'answered' && next.requestKind !== 'done' ? <span>{next.requestLabel}</span> : null}
              </div>
            </div>
            {facts.allow.advance ? (
              <Link href={`/advance/${t}/${next.routingId}`} className="ov-cta btn-transition">
                Open advance <ArrowRight size={14} aria-hidden />
              </Link>
            ) : null}
          </div>
        ) : (
          <p className="ov-empty">
            No shows coming up. <Link href={`/operations/${t}/routing?import=1`}>Import a routing or tour book</Link> to add dates.
          </p>
        )}
      </section>

      <div className="ov-columns">
        <section aria-labelledby="ov-needs" className="ov-panel" data-testid="overview-needs">
          <h2 id="ov-needs" className="lp-label-caps ov-label">Needs you</h2>
          {todo.length ? (
            <ul className="ov-rows">
              {todo.map((n) => (
                <li key={n.id}>
                  <Link href={n.href} className="ov-row" aria-label={`${n.text} — ${n.cta}`}>
                    <span className="ov-count">{n.count}</span>
                    <span className="ov-row-text">{n.what}</span>
                    <ChevronRight size={16} aria-hidden className="ov-chevron" />
                  </Link>
                </li>
              ))}
            </ul>
          ) : (
            <p className="ov-empty ov-clear">
              <CheckCircle2 size={16} aria-hidden style={{ color: 'var(--color-lp-success)' }} /> Nothing needs you right now.
            </p>
          )}
        </section>

        {areas.length ? (
          <section aria-labelledby="ov-tour" className="ov-panel">
            <h2 id="ov-tour" className="lp-label-caps ov-label">This tour</h2>
            <ul className="ov-rows">
              {areas.map(({ label, line, href, Icon }) => (
                <li key={label}>
                  <Link href={href} className="ov-row">
                    <Icon size={16} aria-hidden className="ov-area-icon" />
                    <span className="ov-row-text">
                      <span className="ov-area-label">{label}</span>
                      <span className="ov-area-line">{line}</span>
                    </span>
                    <ChevronRight size={16} aria-hidden className="ov-chevron" />
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        ) : null}
      </div>
    </div>
  );
}
