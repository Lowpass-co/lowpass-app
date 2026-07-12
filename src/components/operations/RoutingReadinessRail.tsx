'use client';

/* ============================================================
   LOWPASS — <RoutingReadinessRail> (Design pass §9 · TR-02)

   The readiness "rail" on the Routing tour-landing. Replaces the old four
   boxed summary cards with ONE de-boxed, hairline-divided strip
   (Shows · Crew · Conflicts · Pending) — "one strip, not four cards" ("looks
   too AI"). Pending expands inline to the awaiting-contract / tentative /
   shows-missing-venue detail (ported from the summary's PendingTasksPanel).

   Read-only readiness only. The heavier summary surface (quick actions,
   activity feed, upcoming-shows list, Edit-tour / Add-personnel slide-overs)
   lives on the relocated /operations/[tourId]/summary tab — nothing dropped.
   ============================================================ */

import { useState } from 'react';
import Link from 'next/link';
import { Route, ClipboardCheck, Users, AlertTriangle, ListChecks, DollarSign } from 'lucide-react';
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

export function RoutingReadinessRail({
  tourId,
  readiness,
}: {
  tourId: string;
  readiness: Pick<
    OperationsReadiness,
    'shows' | 'advances' | 'crew' | 'budget' | 'conflicts' | 'pending'
  >;
}) {
  const { shows, advances, crew, budget, conflicts, pending } = readiness;
  const [pendingOpen, setPendingOpen] = useState(false);
  const pendingCount =
    pending.awaitingContract.length +
    pending.tentative.length +
    pending.showsWithoutVenue.length;

  return (
    <section
      className="lp-view-tier"
      aria-label="Tour readiness"
      style={{
        borderTop: '1px solid var(--lp-border-subtle)',
        borderBottom: '1px solid var(--lp-border-subtle)',
      }}
    >
      {/* §C4 — Routing · Advances · Crew · Budget (real counts). Conflicts stays
          conditional (safety) and Pending keeps its inline review expander. */}
      <div className="flex flex-wrap items-stretch">
        <Metric
          icon={<Route size={14} strokeWidth={2} />}
          label="Routing"
          value={String(shows.count)}
          sub={
            shows.nextShowDate
              ? `next ${formatShowDate(shows.nextShowDate)}`
              : 'no shows yet'
          }
          href={`/operations/${tourId}/routing`}
          first
        />
        <Metric
          icon={<ClipboardCheck size={14} strokeWidth={2} />}
          label="Advances"
          value={`${advances.done}/${advances.total}`}
          sub={advances.total === 0 ? 'no shows yet' : advances.done === advances.total ? 'all complete' : 'complete'}
          href={`/advance/${tourId}`}
        />
        <Metric
          icon={<Users size={14} strokeWidth={2} />}
          label="Crew"
          value={String(crew.count)}
          sub="assigned"
          href={`/operations/${tourId}/personnel`}
        />
        <Metric
          icon={<DollarSign size={14} strokeWidth={2} />}
          label="Budget"
          value={abbrevCommitted(budget.committed, budget.currency)}
          sub="committed"
          href={`/budget/${tourId}`}
        />
        {conflicts.count > 0 ? (
          <Metric
            icon={<AlertTriangle size={14} strokeWidth={2} />}
            label="Conflicts"
            value={String(conflicts.count)}
            sub="cross-tour overlap"
            href={`/operations/${tourId}/personnel?filter=conflicts`}
            tone="warning"
          />
        ) : null}
        <PendingMetric
          count={pendingCount}
          open={pendingOpen}
          onToggle={() => setPendingOpen((o) => !o)}
        />
      </div>

      {pendingOpen ? (
        <PendingDetail tourId={tourId} pending={pending} />
      ) : null}
    </section>
  );
}

function Metric({
  icon,
  label,
  value,
  sub,
  href,
  tone = 'neutral',
  first = false,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  sub: string;
  href: string;
  tone?: 'neutral' | 'warning';
  first?: boolean;
}) {
  const accent =
    tone === 'warning' ? 'var(--color-lp-orange)' : 'var(--lp-text-tertiary)';
  return (
    <Link
      href={href}
      className="btn-transition flex flex-col justify-center"
      style={{
        gap: 2,
        padding: 'var(--lp-space-3) var(--lp-space-4)',
        minWidth: 128,
        textDecoration: 'none',
        color: 'var(--lp-text)',
        borderLeft: first ? 'none' : '1px solid var(--lp-border-subtle)',
      }}
    >
      <span className="flex items-center" style={{ gap: 6, color: accent }}>
        {icon}
        <span
          className="lp-label-caps"
          style={{ fontSize: 'var(--lp-text-2xs)', color: accent }}
        >
          {label}
        </span>
      </span>
      <span
        className="lp-mono"
        style={{
          fontSize: 'var(--lp-text-xl)',
          fontWeight: 'var(--lp-weight-bold)',
          color: 'var(--lp-text)',
          lineHeight: 1.1,
        }}
      >
        {value}
      </span>
      <span style={{ fontSize: 'var(--lp-text-2xs)', color: 'var(--lp-text-secondary)' }}>
        {sub}
      </span>
    </Link>
  );
}

function PendingMetric({
  count,
  open,
  onToggle,
}: {
  count: number;
  open: boolean;
  onToggle: () => void;
}) {
  const accent = count > 0 ? 'var(--color-lp-orange)' : 'var(--lp-text-tertiary)';
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-expanded={open}
      className="btn-transition flex flex-col justify-center text-left"
      style={{
        gap: 2,
        padding: 'var(--lp-space-3) var(--lp-space-4)',
        minWidth: 128,
        cursor: 'pointer',
        background: 'transparent',
        border: 'none',
        borderLeft: '1px solid var(--lp-border-subtle)',
      }}
    >
      <span className="flex items-center" style={{ gap: 6, color: accent }}>
        <ListChecks size={14} strokeWidth={2} />
        <span
          className="lp-label-caps"
          style={{ fontSize: 'var(--lp-text-2xs)', color: accent }}
        >
          Pending
        </span>
      </span>
      <span
        className="lp-mono"
        style={{
          fontSize: 'var(--lp-text-xl)',
          fontWeight: 'var(--lp-weight-bold)',
          color: 'var(--lp-text)',
          lineHeight: 1.1,
        }}
      >
        {count}
      </span>
      <span style={{ fontSize: 'var(--lp-text-2xs)', color: 'var(--color-lp-orange)' }}>
        {count === 0 ? 'all clear' : open ? 'Hide' : 'Review'}
      </span>
    </button>
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
