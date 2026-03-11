'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import dynamic from 'next/dynamic';
import { ChevronLeft, ChevronRight, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { getDayTypeColor, parseRoutingDate, firstDayType } from '@/lib/utils';

const BudgetRoutingMap = dynamic(
  () => import('./BudgetRoutingMap').then((m) => ({ default: m.BudgetRoutingMap })),
  {
    ssr: false,
    loading: () => (
      <div className="h-full flex items-center justify-center text-lp-text-tertiary text-sm">
        <Loader2 className="h-4 w-4 animate-spin mr-2" />
        Loading map…
      </div>
    ),
  }
);

/** post_tax = pre_tax × (1 - withholding_pct / 100) */
function postTaxFromPreTax(preTax: number, withholdingPct: number): number {
  return preTax * (1 - withholdingPct / 100);
}

function fmt(n: number) {
  return n.toLocaleString('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

const DAY_TYPE_ABBREV: Record<string, string> = {
  show: 'SHW',
  travel: 'TRV',
  off: 'OFF',
  rehearsal: 'REH',
  press: 'PRS',
  radio: 'RAD',
  tv: 'TV',
  festival: 'FST',
};

function getDayTypeAbbrev(dayType: string): string {
  return DAY_TYPE_ABBREV[dayType] ?? dayType.slice(0, 3).toUpperCase();
}

type IncomeRow = {
  id?: string;
  routing_id: string;
  pre_tax_guarantee: number;
  withholding_pct: number;
  post_tax_guarantee: number;
  pre_tax_overage: number;
  post_tax_overage: number;
  merch_income: number;
  vip_income: number;
  drop_count: number | null;
  actual_guarantee: number | null;
  actual_overage: number | null;
  actual_merch: number | null;
  actual_vip: number | null;
  notes: string | null;
  routing?: { date: string; venue_name: string; city: string; day_type: string };
};

type RoutingOnlyRow = {
  id: string;
  date: string;
  venue_name: string | null;
  city: string;
  day_type: string;
};

type FullRow = IncomeRow & {
  routing: { date: string; venue_name: string; city: string; day_type: string };
  isNew?: boolean;
};

// ─── Read-only routing mini-calendar ────────────────────────────────────────

type CalRow = { date: string; day_type: string; venue_name: string | null; city: string };

function RoutingMiniCalendar({ routingRows }: { routingRows: CalRow[] }) {
  const months = useMemo(() => {
    const seen = new Set<string>();
    const result: { year: number; month: number }[] = [];
    for (const row of routingRows) {
      const key = row.date.slice(0, 7);
      if (!seen.has(key)) {
        seen.add(key);
        const [y, m] = key.split('-').map(Number);
        result.push({ year: y, month: m - 1 });
      }
    }
    return result.sort((a, b) => a.year * 12 + a.month - (b.year * 12 + b.month));
  }, [routingRows]);

  const [monthIdx, setMonthIdx] = useState(0);
  useEffect(() => { setMonthIdx(0); }, [routingRows]);

  if (months.length === 0) {
    return (
      <div className="flex items-center justify-center h-full text-lp-text-tertiary text-sm">
        No routing dates
      </div>
    );
  }

  const { year, month } = months[Math.min(monthIdx, months.length - 1)];
  const byDate = new Map(routingRows.map((r) => [r.date, r]));

  const first = new Date(year, month, 1);
  const startDay = first.getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();

  const cells: (string | null)[] = [];
  for (let i = 0; i < startDay; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) {
    cells.push(`${year}-${String(month + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`);
  }
  while (cells.length % 7 !== 0) cells.push(null);

  const monthLabel = first.toLocaleDateString('en-GB', { month: 'long', year: 'numeric' });

  return (
    <div className="flex flex-col h-full">

      {/* Month navigation */}
      <div className="flex items-center justify-between mb-4">
        <button
          type="button"
          onClick={() => setMonthIdx((i) => Math.max(0, i - 1))}
          disabled={monthIdx === 0}
          className="flex h-6 w-6 items-center justify-center rounded transition-colors disabled:opacity-20 hover:bg-lp-orange/10"
          style={{ color: '#FF4500' }}
        >
          <ChevronLeft size={14} />
        </button>
        <span className="text-xs font-semibold uppercase tracking-widest text-lp-text">
          {monthLabel}
        </span>
        <button
          type="button"
          onClick={() => setMonthIdx((i) => Math.min(months.length - 1, i + 1))}
          disabled={monthIdx >= months.length - 1}
          className="flex h-6 w-6 items-center justify-center rounded transition-colors disabled:opacity-20 hover:bg-lp-orange/10"
          style={{ color: '#FF4500' }}
        >
          <ChevronRight size={14} />
        </button>
      </div>

      {/* Day of week headers */}
      <div className="grid grid-cols-7 mb-1">
        {['S', 'M', 'T', 'W', 'T', 'F', 'S'].map((d, i) => (
          <div
            key={i}
            className="text-center text-[9px] font-semibold uppercase tracking-wider text-lp-text-tertiary py-1"
          >
            {d}
          </div>
        ))}
      </div>

      {/* Day cells */}
      <div className="grid grid-cols-7 gap-y-1 flex-1">
        {cells.map((dateStr, i) => {
          if (!dateStr) return <div key={i} />;
          const row = byDate.get(dateStr);
          const primaryType = row ? firstDayType(row.day_type ?? '') : '';
          const colors = primaryType ? getDayTypeColor(primaryType) : null;
          const abbrev = primaryType ? getDayTypeAbbrev(primaryType) : null;
          const dayNum = parseRoutingDate(dateStr).getDate();

          return (
            <div key={dateStr} className="flex flex-col items-center py-0.5">
              <span className="text-[9px] text-lp-text-tertiary mb-0.5 leading-none">{dayNum}</span>
              {abbrev && colors ? (
                <span
                  className={cn(
                    'text-[8px] font-bold px-1 py-px rounded-sm leading-none tabular-nums',
                    colors.bg,
                    colors.text
                  )}
                >
                  {abbrev}
                </span>
              ) : (
                <span className="h-3" />
              )}
            </div>
          );
        })}
      </div>

      {/* Legend */}
      <div className="mt-4 pt-3 border-t border-lp-border/40 flex flex-wrap gap-x-4 gap-y-1.5">
        {[
          { type: 'show', label: 'Show' },
          { type: 'travel', label: 'Travel' },
          { type: 'off', label: 'Day Off' },
          { type: 'rehearsal', label: 'Rehearsal' },
        ].map(({ type, label }) => {
          const c = getDayTypeColor(type);
          return (
            <div key={type} className="flex items-center gap-1">
              <span className={cn('h-1.5 w-1.5 rounded-full', c.dot)} />
              <span className="text-[9px] text-lp-text-tertiary">{label}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── Day-type pill for table rows ───────────────────────────────────────────

function DayTypePill({ dayType }: { dayType: string }) {
  if (!dayType) return <span className="text-lp-text-tertiary">—</span>;
  const primary = firstDayType(dayType);
  const colors = getDayTypeColor(primary);
  const abbrev = getDayTypeAbbrev(primary);
  return (
    <span
      className={cn(
        'inline-block rounded-sm px-1.5 py-px text-[10px] font-bold uppercase tracking-wide leading-none',
        colors.bg,
        colors.text
      )}
    >
      {abbrev}
    </span>
  );
}

// ─── Main IncomeTab ──────────────────────────────────────────────────────────

export function IncomeTab({ tourId }: { tourId: string }) {
  const [loading, setLoading] = useState(true);
  const [incomeRows, setIncomeRows] = useState<IncomeRow[]>([]);
  const [routingOnly, setRoutingOnly] = useState<RoutingOnlyRow[]>([]);
  const [localEdits, setLocalEdits] = useState<Record<string, Partial<IncomeRow>>>({});
  const [error, setError] = useState<string | null>(null);
  const [savingId, setSavingId] = useState<string | null>(null);

  const load = useCallback(() => {
    if (!tourId) return;
    setLoading(true);
    setError(null);
    fetch(`/api/budget/income?tour_id=${tourId}`)
      .then((r) => (r.ok ? r.json() : { income: [], routing_only: [] }))
      .then((data) => {
        setIncomeRows(data.income ?? []);
        setRoutingOnly(data.routing_only ?? []);
      })
      .catch((err) => setError(err?.message ?? 'Failed to load income'))
      .finally(() => setLoading(false));
  }, [tourId]);

  useEffect(() => load(), [load]);

  const baseRows: FullRow[] = [
    ...incomeRows.map((r) => ({
      ...r,
      routing: (r.routing ?? { date: '', venue_name: '', city: '', day_type: '' }) as FullRow['routing'],
      isNew: false,
    })),
    ...routingOnly.map((r) => ({
      id: undefined,
      routing_id: r.id,
      pre_tax_guarantee: 0,
      withholding_pct: 0,
      post_tax_guarantee: 0,
      pre_tax_overage: 0,
      post_tax_overage: 0,
      merch_income: 0,
      vip_income: 0,
      drop_count: null as number | null,
      actual_guarantee: null,
      actual_overage: null,
      actual_merch: null,
      actual_vip: null,
      notes: null,
      routing: { date: r.date, venue_name: r.venue_name ?? '', city: r.city, day_type: r.day_type },
      isNew: true,
    })),
  ].sort((a, b) => a.routing.date.localeCompare(b.routing.date));

  const mergeRow = (base: FullRow): FullRow => {
    const edits = localEdits[base.routing_id] ?? {};
    const merged = { ...base, ...edits } as FullRow;
    merged.post_tax_guarantee = postTaxFromPreTax(Number(merged.pre_tax_guarantee), Number(merged.withholding_pct));
    merged.post_tax_overage = postTaxFromPreTax(Number(merged.pre_tax_overage), Number(merged.withholding_pct));
    return merged;
  };

  const allRows = baseRows.map(mergeRow);

  const handleFieldChange = (routingId: string, field: keyof IncomeRow, value: number | string | null) => {
    setLocalEdits((prev) => ({ ...prev, [routingId]: { ...prev[routingId], [field]: value } }));
  };

  const saveRow = (row: FullRow) => {
    setSavingId(row.routing_id);
    fetch('/api/budget/income', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        routing_id: row.routing_id,
        pre_tax_guarantee: row.pre_tax_guarantee,
        withholding_pct: row.withholding_pct,
        pre_tax_overage: row.pre_tax_overage,
        merch_income: row.merch_income,
        vip_income: row.vip_income,
        drop_count: row.drop_count,
        notes: row.notes,
      }),
    })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error('Save failed'))))
      .then(() => {
        setLocalEdits((prev) => {
          const next = { ...prev };
          delete next[row.routing_id];
          return next;
        });
        load();
      })
      .catch(() => setError('Failed to save'))
      .finally(() => setSavingId(null));
  };

  const proposedTotal = allRows.reduce((a, r) => a + r.post_tax_guarantee + r.merch_income + r.vip_income, 0);
  const actualTotal = allRows.reduce(
    (a, r) => a + (r.actual_guarantee ?? 0) + (r.actual_overage ?? 0) + (r.actual_merch ?? 0) + (r.actual_vip ?? 0),
    0
  );

  // Routing rows for calendar and map (all rows, sorted by date)
  const calRows: CalRow[] = allRows.map((r) => ({
    date: r.routing.date,
    day_type: r.routing.day_type,
    venue_name: r.routing.venue_name,
    city: r.routing.city,
  }));

  if (loading) {
    return (
      <div className="flex items-center gap-2 rounded-xl border border-lp-border bg-lp-surface p-8 text-lp-text-secondary">
        <Loader2 className="h-5 w-5 animate-spin" />
        Loading income…
      </div>
    );
  }
  if (error) {
    return (
      <div className="rounded-xl border border-lp-border bg-lp-surface p-8 text-center text-red-500">
        {error}
      </div>
    );
  }

  return (
    <div className="space-y-6">

      {/* ── Top row: Calendar + Map ── */}
      <div className="grid grid-cols-[280px_1fr] gap-4 h-[320px]">

        {/* Calendar panel */}
        <div
          className="rounded-xl border border-lp-border p-5 overflow-hidden"
          style={{ background: 'rgba(255,255,255,0.03)' }}
        >
          <p className="text-[10px] font-semibold uppercase tracking-widest text-lp-text-tertiary mb-4">
            Routing Overview
          </p>
          <div className="h-[calc(100%-28px)]">
            <RoutingMiniCalendar routingRows={calRows} />
          </div>
        </div>

        {/* Map panel */}
        <div
          className="rounded-xl border border-lp-border overflow-hidden"
          style={{ background: 'rgba(255,255,255,0.02)' }}
        >
          <BudgetRoutingMap rows={calRows} />
        </div>
      </div>

      {/* ── Income table ── */}
      <div className="overflow-x-auto rounded-xl border border-lp-border bg-lp-surface">
        <table className="w-full min-w-[1100px] border-collapse text-sm">
          <thead>
            <tr className="border-b border-lp-border">
              <th className="px-4 py-3 text-left text-[10px] font-semibold uppercase tracking-widest text-lp-text-tertiary">Date</th>
              <th className="px-4 py-3 text-left text-[10px] font-semibold uppercase tracking-widest text-lp-text-tertiary">Venue</th>
              <th className="px-4 py-3 text-left text-[10px] font-semibold uppercase tracking-widest text-lp-text-tertiary">City</th>
              <th className="px-4 py-3 text-left text-[10px] font-semibold uppercase tracking-widest text-lp-text-tertiary w-20">Type</th>
              <th className="px-4 py-3 text-right text-[10px] font-semibold uppercase tracking-widest text-lp-text-tertiary w-28">Pre-Tax Guar.</th>
              <th className="px-4 py-3 text-right text-[10px] font-semibold uppercase tracking-widest text-lp-text-tertiary w-20">W/H %</th>
              <th className="px-4 py-3 text-right text-[10px] font-semibold uppercase tracking-widest text-lp-text-tertiary w-28">Post-Tax Guar.</th>
              <th className="px-4 py-3 text-right text-[10px] font-semibold uppercase tracking-widest text-lp-text-tertiary w-24">Pre-Tax Ovg.</th>
              <th className="px-4 py-3 text-right text-[10px] font-semibold uppercase tracking-widest text-lp-text-tertiary w-24">Post-Tax Ovg.</th>
              <th className="px-4 py-3 text-right text-[10px] font-semibold uppercase tracking-widest text-lp-text-tertiary w-20">Merch</th>
              <th className="px-4 py-3 text-right text-[10px] font-semibold uppercase tracking-widest text-lp-text-tertiary w-20">VIP</th>
              <th className="px-4 py-3 text-right text-[10px] font-semibold uppercase tracking-widest text-lp-text-tertiary w-14">Drop</th>
              <th className="px-4 py-3 text-left text-[10px] font-semibold uppercase tracking-widest text-lp-text-tertiary min-w-[100px]">Notes</th>
            </tr>
          </thead>

          <tbody>
            {allRows.map((row) => {
              const date = row.routing.date
                ? parseRoutingDate(row.routing.date).toLocaleDateString('en-GB', {
                    day: 'numeric',
                    month: 'short',
                    year: 'numeric',
                  })
                : '—';
              const isDirty = !!localEdits[row.routing_id];
              const isSaving = savingId === row.routing_id;

              return (
                <tr
                  key={row.routing_id}
                  className={cn(
                    'border-b border-lp-border/30 transition-colors',
                    isDirty ? 'bg-lp-orange/[0.04]' : 'hover:bg-lp-surface-hover'
                  )}
                >
                  <td className="px-4 py-2.5 text-lp-text-secondary tabular-nums text-xs whitespace-nowrap">
                    {date}
                  </td>
                  <td className="px-4 py-2.5 text-lp-text text-xs">
                    {row.routing.venue_name || <span className="text-lp-text-tertiary">—</span>}
                  </td>
                  <td className="px-4 py-2.5 text-lp-text-secondary text-xs">
                    {row.routing.city || <span className="text-lp-text-tertiary">—</span>}
                  </td>
                  <td className="px-4 py-2.5">
                    <DayTypePill dayType={row.routing.day_type} />
                  </td>

                  {/* Pre-tax guarantee */}
                  <td className="px-4 py-2">
                    <input
                      type="number"
                      step="0.01"
                      min="0"
                      className="w-full rounded-md border border-lp-border bg-transparent px-2 py-1 text-right text-xs text-lp-text tabular-nums focus:border-lp-orange focus:outline-none focus:ring-1 focus:ring-lp-orange/30"
                      value={row.pre_tax_guarantee || ''}
                      onChange={(e) =>
                        handleFieldChange(row.routing_id, 'pre_tax_guarantee', e.target.value ? Number(e.target.value) : 0)
                      }
                      onBlur={() => saveRow(row)}
                    />
                  </td>

                  {/* Withholding % */}
                  <td className="px-4 py-2">
                    <input
                      type="number"
                      step="0.01"
                      min="0"
                      max="100"
                      className="w-full rounded-md border border-lp-border bg-transparent px-2 py-1 text-right text-xs text-lp-text tabular-nums focus:border-lp-orange focus:outline-none focus:ring-1 focus:ring-lp-orange/30"
                      value={row.withholding_pct || ''}
                      onChange={(e) =>
                        handleFieldChange(row.routing_id, 'withholding_pct', e.target.value ? Number(e.target.value) : 0)
                      }
                      onBlur={() => saveRow(row)}
                    />
                  </td>

                  {/* Post-tax guarantee (computed) */}
                  <td className="px-4 py-2.5 text-right tabular-nums text-xs text-lp-text-secondary">
                    {fmt(row.post_tax_guarantee)}
                  </td>

                  {/* Pre-tax overage */}
                  <td className="px-4 py-2">
                    <input
                      type="number"
                      step="0.01"
                      min="0"
                      className="w-full rounded-md border border-lp-border bg-transparent px-2 py-1 text-right text-xs text-lp-text tabular-nums focus:border-lp-orange focus:outline-none focus:ring-1 focus:ring-lp-orange/30"
                      value={row.pre_tax_overage || ''}
                      onChange={(e) =>
                        handleFieldChange(row.routing_id, 'pre_tax_overage', e.target.value ? Number(e.target.value) : 0)
                      }
                      onBlur={() => saveRow(row)}
                    />
                  </td>

                  {/* Post-tax overage (computed) */}
                  <td className="px-4 py-2.5 text-right tabular-nums text-xs text-lp-text-tertiary">
                    {fmt(row.post_tax_overage)}
                  </td>

                  {/* Merch */}
                  <td className="px-4 py-2">
                    <input
                      type="number"
                      step="0.01"
                      min="0"
                      className="w-full rounded-md border border-lp-border bg-transparent px-2 py-1 text-right text-xs text-lp-text tabular-nums focus:border-lp-orange focus:outline-none focus:ring-1 focus:ring-lp-orange/30"
                      value={row.merch_income || ''}
                      onChange={(e) =>
                        handleFieldChange(row.routing_id, 'merch_income', e.target.value ? Number(e.target.value) : 0)
                      }
                      onBlur={() => saveRow(row)}
                    />
                  </td>

                  {/* VIP */}
                  <td className="px-4 py-2">
                    <input
                      type="number"
                      step="0.01"
                      min="0"
                      className="w-full rounded-md border border-lp-border bg-transparent px-2 py-1 text-right text-xs text-lp-text tabular-nums focus:border-lp-orange focus:outline-none focus:ring-1 focus:ring-lp-orange/30"
                      value={row.vip_income || ''}
                      onChange={(e) =>
                        handleFieldChange(row.routing_id, 'vip_income', e.target.value ? Number(e.target.value) : 0)
                      }
                      onBlur={() => saveRow(row)}
                    />
                  </td>

                  {/* Drop */}
                  <td className="px-4 py-2">
                    <input
                      type="number"
                      min="0"
                      className="w-full rounded-md border border-lp-border bg-transparent px-2 py-1 text-right text-xs text-lp-text tabular-nums focus:border-lp-orange focus:outline-none focus:ring-1 focus:ring-lp-orange/30"
                      value={row.drop_count ?? ''}
                      onChange={(e) =>
                        handleFieldChange(row.routing_id, 'drop_count', e.target.value === '' ? null : Number(e.target.value))
                      }
                      onBlur={() => saveRow(row)}
                    />
                  </td>

                  {/* Notes */}
                  <td className="px-4 py-2">
                    <input
                      type="text"
                      placeholder="Notes"
                      className="w-full rounded-md border border-lp-border bg-transparent px-2 py-1 text-xs text-lp-text placeholder:text-lp-text-tertiary focus:border-lp-orange focus:outline-none focus:ring-1 focus:ring-lp-orange/30"
                      value={row.notes ?? ''}
                      onChange={(e) => handleFieldChange(row.routing_id, 'notes', e.target.value || null)}
                      onBlur={() => saveRow(row)}
                    />
                  </td>
                </tr>
              );
            })}

            {allRows.length === 0 && (
              <tr>
                <td colSpan={13} className="px-4 py-8 text-center text-lp-text-tertiary text-sm">
                  No routing dates for this tour yet.
                </td>
              </tr>
            )}
          </tbody>

          <tfoot>
            {/* Proposed totals row */}
            <tr className="border-t-2 border-lp-border">
              <td
                colSpan={6}
                className="px-4 py-3 text-[10px] font-semibold uppercase tracking-widest text-lp-text-tertiary"
              >
                Proposed Totals
                <span className="ml-1.5 normal-case tracking-normal font-normal text-lp-text-tertiary/60">
                  (excl. overages)
                </span>
              </td>
              <td className="px-4 py-3 text-right tabular-nums text-sm font-bold text-lp-text">
                {fmt(proposedTotal)}
              </td>
              <td colSpan={6} />
            </tr>

            {/* Actual totals row — orange highlight */}
            <tr
              className="border-t border-lp-border/60 rounded-b-xl"
              style={{ background: 'rgba(255,69,0,0.06)' }}
            >
              <td
                colSpan={9}
                className="px-4 py-3 text-[10px] font-semibold uppercase tracking-widest"
                style={{ color: '#FF4500' }}
              >
                Actual Totals
                <span className="ml-1.5 normal-case tracking-normal font-normal opacity-70">
                  (incl. overages)
                </span>
              </td>
              <td
                colSpan={2}
                className="px-4 py-3 text-right tabular-nums text-sm font-bold"
                style={{ color: '#FF4500' }}
              >
                {fmt(actualTotal)}
              </td>
              <td colSpan={2} />
            </tr>
          </tfoot>
        </table>
      </div>

      {/* Save indicator */}
      {savingId && (
        <div className="flex items-center gap-2 text-xs text-lp-text-tertiary">
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
          Saving…
        </div>
      )}
    </div>
  );
}
