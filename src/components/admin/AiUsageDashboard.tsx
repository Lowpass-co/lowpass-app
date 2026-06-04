'use client';

/* ============================================
   LOWPASS — <AiUsageDashboard> (§AI-4)

   Client-side tabbed breakdown for the site-admin AI-usage
   dashboard. Four tabs: By user / By endpoint / By day (a
   dependency-free inline-SVG sparkline — NO charting lib) /
   Recent events.

   Tables mirror the artist-home RecentActivityTable look:
   .lp-dense, --lp-panel header, --lp-border-subtle row borders,
   uppercase 10px th. Tab bar is the orange-underline active-tab
   pattern used across the app.
   ============================================ */

import { useState } from 'react';
import type {
  AiUsageReport,
  AiUsageByUser,
  AiUsageByEndpoint,
  AiUsageByDay,
  AiUsageRecentRow,
} from '@/lib/ai/usage-types';
import { formatUsd } from '@/lib/ai/usage-types';

type Tab = 'user' | 'endpoint' | 'day' | 'recent';

const TABS: { id: Tab; label: string }[] = [
  { id: 'user', label: 'By user' },
  { id: 'endpoint', label: 'By endpoint' },
  { id: 'day', label: 'By day' },
  { id: 'recent', label: 'Recent events' },
];

export function AiUsageDashboard({ report }: { report: AiUsageReport }) {
  const [tab, setTab] = useState<Tab>('user');

  return (
    <section className="space-y-3">
      {/* Tab bar — orange-underline active tab. */}
      <div
        className="flex items-center gap-1"
        style={{ borderBottom: '1px solid var(--lp-border-subtle)' }}
      >
        {TABS.map((t) => {
          const active = t.id === tab;
          return (
            <button
              key={t.id}
              type="button"
              onClick={() => setTab(t.id)}
              className="btn-transition px-3 py-2"
              style={{
                fontSize: '13px',
                fontWeight: 600,
                color: active ? 'var(--lp-text)' : 'var(--lp-text-tertiary)',
                borderBottom: active
                  ? '2px solid var(--color-lp-orange)'
                  : '2px solid transparent',
                marginBottom: -1,
              }}
            >
              {t.label}
            </button>
          );
        })}
      </div>

      <div style={{ minHeight: 280 }}>
        {tab === 'user' ? <ByUserTable rows={report.byUser} /> : null}
        {tab === 'endpoint' ? (
          <ByEndpointTable rows={report.byEndpoint} />
        ) : null}
        {tab === 'day' ? <ByDayChart rows={report.byDay} /> : null}
        {tab === 'recent' ? <RecentTable rows={report.recent} /> : null}
      </div>
    </section>
  );
}

/* ============================================
   Tables
   ============================================ */

function TableShell({ children }: { children: React.ReactNode }) {
  return (
    <div
      className="overflow-hidden rounded-lg border"
      style={{
        borderColor: 'var(--lp-border-strong)',
        background: 'var(--lp-bg-deep)',
      }}
    >
      <table className="lp-dense w-full">{children}</table>
    </div>
  );
}

function Th({
  children,
  align,
}: {
  children: React.ReactNode;
  align?: 'left' | 'right';
}) {
  return (
    <th
      className="px-3 py-2"
      style={{
        textAlign: align ?? 'left',
        fontSize: '10px',
        fontWeight: 600,
        letterSpacing: '0.08em',
        textTransform: 'uppercase',
        color: 'var(--lp-text-tertiary)',
      }}
    >
      {children}
    </th>
  );
}

function Td({
  children,
  align,
}: {
  children: React.ReactNode;
  align?: 'left' | 'right';
}) {
  return (
    <td style={{ textAlign: align ?? 'left', verticalAlign: 'middle' }}>
      {children}
    </td>
  );
}

function HeaderRow({ children }: { children: React.ReactNode }) {
  return (
    <tr
      style={{
        background: 'var(--lp-panel)',
        borderBottom: '1px solid var(--lp-border-subtle)',
      }}
    >
      {children}
    </tr>
  );
}

function EmptyRow({ span, label }: { span: number; label: string }) {
  return (
    <tr>
      <td
        colSpan={span}
        className="px-3 py-6 text-center"
        style={{ color: 'var(--lp-text-tertiary)' }}
      >
        {label}
      </td>
    </tr>
  );
}

function ByUserTable({ rows }: { rows: AiUsageByUser[] }) {
  return (
    <TableShell>
      <thead>
        <HeaderRow>
          <Th>User</Th>
          <Th align="right">Calls</Th>
          <Th align="right">Tokens</Th>
          <Th align="right">Cost</Th>
          <Th align="right">% of total</Th>
        </HeaderRow>
      </thead>
      <tbody>
        {rows.length === 0 ? (
          <EmptyRow span={5} label="No usage this month." />
        ) : (
          rows.map((r) => (
            <tr
              key={r.userId ?? '__system__'}
              style={{ borderTop: '1px solid var(--lp-border-subtle)' }}
            >
              <Td>
                <span style={{ color: 'var(--lp-text)' }}>{r.label}</span>
              </Td>
              <Td align="right">
                <span className="lp-mono">{r.calls.toLocaleString()}</span>
              </Td>
              <Td align="right">
                <span className="lp-mono">{r.tokens.toLocaleString()}</span>
              </Td>
              <Td align="right">
                <span className="lp-mono">{formatUsd(r.micros)}</span>
              </Td>
              <Td align="right">
                <span
                  className="lp-mono"
                  style={{ color: 'var(--lp-text-tertiary)' }}
                >
                  {r.pctOfTotal.toFixed(1)}%
                </span>
              </Td>
            </tr>
          ))
        )}
      </tbody>
    </TableShell>
  );
}

function ByEndpointTable({ rows }: { rows: AiUsageByEndpoint[] }) {
  return (
    <TableShell>
      <thead>
        <HeaderRow>
          <Th>Endpoint</Th>
          <Th align="right">Calls</Th>
          <Th align="right">Avg cost/call</Th>
          <Th align="right">Total cost</Th>
        </HeaderRow>
      </thead>
      <tbody>
        {rows.length === 0 ? (
          <EmptyRow span={4} label="No usage this month." />
        ) : (
          rows.map((r) => (
            <tr
              key={r.endpoint}
              style={{ borderTop: '1px solid var(--lp-border-subtle)' }}
            >
              <Td>
                <span className="lp-mono" style={{ color: 'var(--lp-text)' }}>
                  {r.endpoint}
                </span>
              </Td>
              <Td align="right">
                <span className="lp-mono">{r.calls.toLocaleString()}</span>
              </Td>
              <Td align="right">
                <span
                  className="lp-mono"
                  style={{ color: 'var(--lp-text-tertiary)' }}
                >
                  {formatUsd(r.avgMicros)}
                </span>
              </Td>
              <Td align="right">
                <span className="lp-mono">{formatUsd(r.micros)}</span>
              </Td>
            </tr>
          ))
        )}
      </tbody>
    </TableShell>
  );
}

/* ============================================
   By day — dependency-free inline-SVG sparkline
   ============================================ */

function ByDayChart({ rows }: { rows: AiUsageByDay[] }) {
  const maxMicros = rows.reduce((m, r) => Math.max(m, r.micros), 0);
  const hasData = maxMicros > 0 && rows.length > 0;

  // Viewbox geometry — bars across a 100×40 box, scaled to width
  // via preserveAspectRatio="none". One bar per day.
  const VB_W = 100;
  const VB_H = 40;
  const n = rows.length || 1;
  const gap = n > 1 ? 0.4 : 0;
  const barW = (VB_W - gap * (n - 1)) / n;

  const maxDay = rows.reduce<AiUsageByDay | null>(
    (best, r) => (best === null || r.micros > best.micros ? r : best),
    null,
  );

  return (
    <div
      className="rounded-lg border p-4"
      style={{
        borderColor: 'var(--lp-border-strong)',
        background: 'var(--lp-bg-deep)',
      }}
    >
      <div className="mb-3 flex items-baseline justify-between">
        <span
          style={{
            fontSize: '11px',
            fontWeight: 600,
            letterSpacing: '0.08em',
            textTransform: 'uppercase',
            color: 'var(--lp-text-tertiary)',
          }}
        >
          Daily spend, this month
        </span>
        <span style={{ fontSize: '12px', color: 'var(--lp-text-tertiary)' }}>
          Max day{' '}
          <span className="lp-mono" style={{ color: 'var(--lp-text)' }}>
            {formatUsd(maxMicros)}
          </span>
          {maxDay && maxDay.micros > 0 ? (
            <span className="lp-mono"> · {maxDay.date.slice(5)}</span>
          ) : null}
        </span>
      </div>

      {hasData ? (
        <svg
          width="100%"
          height={48}
          viewBox={`0 0 ${VB_W} ${VB_H}`}
          preserveAspectRatio="none"
          role="img"
          aria-label="Daily AI spend sparkline"
          style={{ display: 'block' }}
        >
          {rows.map((r, i) => {
            const h = maxMicros > 0 ? (r.micros / maxMicros) * VB_H : 0;
            const x = i * (barW + gap);
            const y = VB_H - h;
            return (
              <rect
                key={r.date}
                x={x}
                y={y}
                width={barW}
                height={h}
                fill="var(--color-lp-orange)"
                opacity={r.micros > 0 ? 0.85 : 0}
              >
                <title>{`${r.date} · ${formatUsd(r.micros)}`}</title>
              </rect>
            );
          })}
        </svg>
      ) : (
        <div
          className="flex items-center justify-center"
          style={{ height: 48, color: 'var(--lp-text-tertiary)', fontSize: 13 }}
        >
          No spend recorded this month.
        </div>
      )}

      <div
        className="mt-2 flex justify-between"
        style={{ fontSize: '10px', color: 'var(--lp-text-tertiary)' }}
      >
        <span className="lp-mono">{rows[0]?.date.slice(5) ?? ''}</span>
        <span className="lp-mono">
          {rows[rows.length - 1]?.date.slice(5) ?? ''}
        </span>
      </div>
    </div>
  );
}

/* ============================================
   Recent events
   ============================================ */

function StatusChip({ status }: { status: string }) {
  const map: Record<string, { tone: string; label: string }> = {
    ok: { tone: 'var(--color-lp-status-complete)', label: 'ok' },
    error: { tone: 'var(--color-lp-error)', label: 'error' },
    blocked_cap: {
      tone: 'var(--color-lp-status-needs-review)',
      label: 'blocked',
    },
  };
  const { tone, label } = map[status] ?? {
    tone: 'var(--lp-text-tertiary)',
    label: status,
  };
  return (
    <span
      className="inline-flex items-center rounded-full px-2 py-0.5"
      style={{
        fontSize: '10px',
        fontWeight: 600,
        letterSpacing: '0.04em',
        color: tone,
        background: `color-mix(in srgb, ${tone} 12%, transparent)`,
      }}
    >
      {label}
    </span>
  );
}

function formatTime(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString('en-GB', {
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function RecentTable({ rows }: { rows: AiUsageRecentRow[] }) {
  return (
    <TableShell>
      <thead>
        <HeaderRow>
          <Th>Time</Th>
          <Th>User</Th>
          <Th>Endpoint</Th>
          <Th>Model</Th>
          <Th align="right">Tokens</Th>
          <Th align="right">Cost</Th>
          <Th align="right">Status</Th>
        </HeaderRow>
      </thead>
      <tbody>
        {rows.length === 0 ? (
          <EmptyRow span={7} label="No recent events." />
        ) : (
          rows.map((r) => (
            <tr
              key={r.id}
              style={{ borderTop: '1px solid var(--lp-border-subtle)' }}
            >
              <Td>
                <span
                  className="lp-mono"
                  style={{ color: 'var(--lp-text-secondary)' }}
                >
                  {formatTime(r.createdAt)}
                </span>
              </Td>
              <Td>
                <span style={{ color: 'var(--lp-text)' }}>{r.userLabel}</span>
              </Td>
              <Td>
                <span className="lp-mono" style={{ color: 'var(--lp-text)' }}>
                  {r.endpoint}
                </span>
              </Td>
              <Td>
                <span
                  className="lp-mono"
                  style={{ color: 'var(--lp-text-tertiary)' }}
                >
                  {r.model}
                </span>
              </Td>
              <Td align="right">
                <span className="lp-mono">{r.tokens.toLocaleString()}</span>
              </Td>
              <Td align="right">
                <span className="lp-mono">{formatUsd(r.micros)}</span>
              </Td>
              <Td align="right">
                <StatusChip status={r.status} />
              </Td>
            </tr>
          ))
        )}
      </tbody>
    </TableShell>
  );
}
