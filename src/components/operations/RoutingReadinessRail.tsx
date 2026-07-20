'use client';

/* ============================================================
   LOWPASS — <RoutingStatLine> (routing redesign R1 · R4)

   The Routing tour-landing's header readiness. The routing redesign collapsed the
   old boxed KPI strip (<RoutingReadinessRail> + its Metric / PendingMetric cards)
   into ONE mono stat line — days · shows · advanced · committed · pending⚠ — each
   stat deep-linking where its box did, pending keeping the warning colour + the
   inline review expander. R4 deleted the now-unreferenced boxed component; only
   the stat line + its shared PendingDetail expander remain.
   ============================================================ */

import { useState } from 'react';
import Link from 'next/link';
import { parseRoutingDate } from '@/lib/utils';
import { toTitleCase } from '@/lib/text/toTitleCase';
import type { OperationsReadiness } from '@/server/operations/getOperationsReadiness';

function formatShowDate(iso: string | null): string {
  if (!iso) return '—';
  const d = parseRoutingDate(iso);
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

const CURRENCY_SYMBOL: Record<string, string> = { GBP: '£', USD: '$', EUR: '€', AUD: 'A$', CAD: 'C$' };
function abbrevCommitted(value: number, currency: string): string {
  const sym = CURRENCY_SYMBOL[currency.toUpperCase()] ?? `${currency} `;
  const abs = Math.abs(value);
  if (abs >= 1_000_000) return `${sym}${(value / 1_000_000).toFixed(1)}M`;
  if (abs >= 1_000) return `${sym}${Math.round(value / 1_000)}K`;
  return `${sym}${Math.round(value)}`;
}

/* Routing redesign R1 — the five KPI boxes collapse into ONE mono stat line
   (days · shows · advanced · committed · pending⚠). Same numbers, 90% less
   chrome; each stat deep-links where its box did, and pending keeps the warning
   colour + the inline review expander. Crew moves to the Crew nav tab (per the
   mock). */
export function RoutingStatLine({
  tourId,
  dayCount,
  readiness,
}: {
  tourId: string;
  dayCount: number;
  readiness: Pick<OperationsReadiness, 'shows' | 'advances' | 'budget' | 'pending'>;
}) {
  const { shows, advances, budget, pending } = readiness;
  const [pendingOpen, setPendingOpen] = useState(false);
  const pendingCount =
    pending.awaitingContract.length + pending.tentative.length + pending.showsWithoutVenue.length;

  const linkStyle: React.CSSProperties = { color: 'inherit', textDecoration: 'none' };
  const num: React.CSSProperties = { color: 'var(--lp-text)', fontWeight: 500 };

  return (
    <>
      <div
        className="lp-mono"
        style={{ display: 'flex', flexWrap: 'wrap', gap: 16, alignItems: 'baseline', fontSize: '12.5px', color: 'var(--lp-text-secondary)' }}
      >
        <span><b style={num}>{dayCount}</b> days</span>
        <Link href={`/operations/${tourId}/routing`} style={linkStyle}><b style={num}>{shows.count}</b> shows</Link>
        <Link href={`/advance/${tourId}`} style={linkStyle}><b style={num}>{advances.done}/{advances.total}</b> advanced</Link>
        <Link href={`/budget/${tourId}`} style={linkStyle}><b style={num}>{abbrevCommitted(budget.committed, budget.currency)}</b> committed</Link>
        {pendingCount > 0 ? (
          <button
            type="button"
            onClick={() => setPendingOpen((o) => !o)}
            aria-expanded={pendingOpen}
            data-testid="routing-pending-stat"
            style={{ border: 0, background: 'transparent', padding: 0, cursor: 'pointer', color: 'var(--color-lp-orange)', fontFamily: 'inherit', fontSize: 'inherit' }}
          >
            <b style={{ color: 'var(--color-lp-orange)', fontWeight: 500 }}>{pendingCount}</b> pending ⚠
          </button>
        ) : null}
      </div>
      {pendingOpen ? <PendingDetail tourId={tourId} pending={pending} /> : null}
    </>
  );
}

function PendingDetail({
  tourId,
  pending,
}: {
  tourId: string;
  pending: OperationsReadiness['pending'];
}) {
  const empty =
    pending.awaitingContract.length === 0 &&
    pending.tentative.length === 0 &&
    pending.showsWithoutVenue.length === 0;
  return (
    <div
      style={{
        padding: 'var(--lp-space-3) var(--lp-space-4)',
        borderTop: '1px solid var(--lp-border-subtle)',
        background: 'color-mix(in srgb, var(--color-lp-orange) 3%, transparent)',
      }}
    >
      <PendingGroup
        title="Awaiting contract"
        items={pending.awaitingContract.map((p) => ({
          key: p.id,
          primary: toTitleCase(p.display_name),
          secondary: p.role,
          href: `/operations/${tourId}/personnel`,
        }))}
      />
      <PendingGroup
        title="Tentative"
        items={pending.tentative.map((p) => ({
          key: p.id,
          primary: toTitleCase(p.display_name),
          secondary: p.role,
          href: `/operations/${tourId}/personnel`,
        }))}
      />
      <PendingGroup
        title="Shows missing venue"
        items={pending.showsWithoutVenue.map((s) => ({
          key: s.id,
          primary: formatShowDate(s.date),
          secondary: s.city ?? '—',
          href: `/operations/${tourId}/routing`,
        }))}
      />
      {empty ? (
        <div
          style={{
            fontSize: 'var(--lp-text-sm)',
            color: 'var(--lp-text-tertiary)',
            fontStyle: 'italic',
          }}
        >
          Nothing pending.
        </div>
      ) : null}
    </div>
  );
}

function PendingGroup({
  title,
  items,
}: {
  title: string;
  items: Array<{ key: string; primary: string; secondary: string; href: string }>;
}) {
  if (items.length === 0) return null;
  return (
    <div style={{ marginTop: 'var(--lp-space-2)' }}>
      <div
        className="lp-label-caps"
        style={{
          marginBottom: 'var(--lp-space-1)',
          fontSize: 'var(--lp-text-2xs)',
          color: 'var(--lp-text-secondary)',
        }}
      >
        {title} · {items.length}
      </div>
      <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
        {items.map((it) => (
          <li key={it.key}>
            <Link
              href={it.href}
              className="flex items-center"
              style={{
                gap: 'var(--lp-space-2)',
                padding: 'var(--lp-space-1) 0',
                fontSize: 'var(--lp-text-sm)',
                color: 'var(--lp-text)',
                textDecoration: 'none',
              }}
            >
              <span style={{ flex: 1, minWidth: 0 }}>
                <strong>{it.primary}</strong>{' '}
                <span style={{ color: 'var(--lp-text-tertiary)' }}>{it.secondary}</span>
              </span>
              <span
                style={{
                  fontSize: 'var(--lp-text-xs)',
                  color: 'var(--color-lp-orange)',
                  flexShrink: 0,
                }}
              >
                Open →
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
