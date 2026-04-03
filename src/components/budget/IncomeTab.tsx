'use client';

import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import dynamic from 'next/dynamic';
import { ChevronLeft, ChevronRight, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { getDayTypeColor, parseRoutingDate, firstDayType } from '@/lib/utils';
import { RoutingGrid, type RoutingRow, type TransportToNext } from '@/components/routing/RoutingGrid';
import type { PrimaryTransit } from '@/components/routing/RoutingMap';
import { BUDGET_FOLDER_STICKY_STACK_TOP } from '@/components/budget/BudgetFolderTabsNav';

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

function mapApiRoutesToGridRows(apiRows: unknown[]): RoutingRow[] {
  const rows = apiRows as Array<Record<string, unknown>>;
  return [...rows]
    .sort((a, b) => String(a.date ?? '').localeCompare(String(b.date ?? '')))
    .map((r) => {
      const city = String(r.city ?? '');
      const addrRaw = r.address != null ? String(r.address).trim() : '';
      return {
        date: String(r.date ?? ''),
        day_type: String(r.day_type ?? ''),
        city,
        address: addrRaw !== '' ? addrRaw : city,
        venue_name: r.venue_name != null ? String(r.venue_name) : '',
        notes: String(r.notes ?? ''),
        latitude: r.latitude != null ? Number(r.latitude) : undefined,
        longitude: r.longitude != null ? Number(r.longitude) : undefined,
        transport_to_next: (r.transport_to_next as TransportToNext) ?? 'default',
        venue_website: r.venue_website != null ? String(r.venue_website) : undefined,
        venue_phone: r.venue_phone != null ? String(r.venue_phone) : undefined,
        venue_capacity: r.venue_capacity != null ? Number(r.venue_capacity) : undefined,
      };
    });
}

function enumerateTourDates(startStr: string, endStr: string): string[] {
  const start = parseRoutingDate(startStr);
  const end = parseRoutingDate(endStr);
  if (start > end) return [];
  const out: string[] = [];
  const d = new Date(start);
  while (d <= end) {
    out.push(
      `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
    );
    d.setDate(d.getDate() + 1);
  }
  return out;
}

function reconcileRowsToRange(existing: RoutingRow[], startStr: string, endStr: string): RoutingRow[] {
  const dates = enumerateTourDates(startStr, endStr);
  const byDate = new Map(existing.map((r) => [r.date, r]));
  return dates.map((date) => {
    const prev = byDate.get(date);
    if (prev) return { ...prev, date };
    return {
      date,
      day_type: 'off',
      city: '',
      address: '',
      venue_name: '',
      notes: '',
      transport_to_next: 'default' as TransportToNext,
    };
  });
}

function countRowsRemovedByShrink(existing: RoutingRow[], startStr: string, endStr: string): number {
  const allowed = new Set(enumerateTourDates(startStr, endStr));
  return existing.filter((r) => !allowed.has(r.date)).length;
}

const PRIMARY_TRANSIT_OPTIONS_UNSORTED: { value: PrimaryTransit; label: string }[] = [
  { value: 'bus_trailer', label: 'Bus + Trailer (0.85× drive time)' },
  { value: 'bus_van', label: 'Bus (0.8× drive time)' },
  { value: 'car', label: 'Car (Google drive time)' },
  { value: 'flight', label: 'Flight (est. time)' },
  { value: 'van', label: 'Van (0.9× drive time)' },
];
const PRIMARY_TRANSIT_OPTIONS = [...PRIMARY_TRANSIT_OPTIONS_UNSORTED].sort((a, b) =>
  a.label.localeCompare(b.label)
);

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

/** Last comma-separated segment is often the city when full address is stored in `address`. */
function inferCityFromAddress(addr: string): string {
  const t = addr.trim();
  if (!t) return '';
  const parts = t.split(',').map((s) => s.trim()).filter(Boolean);
  return parts.length ? (parts[parts.length - 1] ?? '') : '';
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
      <div className="flex min-h-[120px] items-center justify-center text-lp-text-tertiary text-sm">
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
  const hasMultipleMonths = months.length > 1;

  return (
    <div className="flex w-full flex-col">
      {/* Month / year — centered */}
      <div className="mb-2 flex shrink-0 items-center justify-center gap-2">
        {hasMultipleMonths ? (
          <>
            <button
              type="button"
              onClick={() => setMonthIdx((i) => Math.max(0, i - 1))}
              disabled={monthIdx === 0}
              className="flex h-7 w-7 items-center justify-center rounded transition-colors disabled:opacity-20 hover:bg-lp-orange/10"
              style={{ color: '#FF4500' }}
            >
              <ChevronLeft size={16} />
            </button>
            <span className="min-w-0 text-center text-xs font-semibold uppercase tracking-wide text-lp-text">
              {monthLabel}
            </span>
            <button
              type="button"
              onClick={() => setMonthIdx((i) => Math.min(months.length - 1, i + 1))}
              disabled={monthIdx >= months.length - 1}
              className="flex h-7 w-7 items-center justify-center rounded transition-colors disabled:opacity-20 hover:bg-lp-orange/10"
              style={{ color: '#FF4500' }}
            >
              <ChevronRight size={16} />
            </button>
          </>
        ) : (
          <span className="text-xs font-semibold uppercase tracking-wide text-lp-text">{monthLabel}</span>
        )}
      </div>

      <div className="mb-1 grid shrink-0 grid-cols-7 gap-y-0.5">
        {['S', 'M', 'T', 'W', 'T', 'F', 'S'].map((d, i) => (
          <div
            key={i}
            className="py-0.5 text-center text-[11px] font-semibold uppercase tracking-wide lp-table-header-text"
          >
            {d}
          </div>
        ))}
      </div>

      <div className="grid grid-cols-7 gap-y-1 content-start">
        {cells.map((dateStr, i) => {
          if (!dateStr) return <div key={i} />;
          const row = byDate.get(dateStr);
          const primaryType = row ? firstDayType(row.day_type ?? '') : '';
          const colors = primaryType ? getDayTypeColor(primaryType) : null;
          const abbrev = primaryType ? getDayTypeAbbrev(primaryType) : null;
          const dayNum = parseRoutingDate(dateStr).getDate();

          return (
            <div key={dateStr} className="flex flex-col items-center py-0.5">
              <span className="mb-0.5 text-[11px] font-medium leading-none text-lp-text tabular-nums">{dayNum}</span>
              {abbrev && colors ? (
                <span
                  className={cn(
                    'rounded-sm px-1 py-px text-[9px] font-bold leading-none tabular-nums',
                    colors.bg,
                    colors.text
                  )}
                >
                  {abbrev}
                </span>
              ) : (
                <span className="h-3.5" />
              )}
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
  const [activeSubTab, setActiveSubTab] = useState<'routing' | 'income'>('routing');
  const [routingRows, setRoutingRows] = useState<RoutingRow[]>([]);
  const [routingAutosaveState, setRoutingAutosaveState] = useState<'idle' | 'saving' | 'error'>('idle');
  const [primaryTransit, setPrimaryTransit] = useState<PrimaryTransit>('bus_van');
  const [tourDates, setTourDates] = useState<{ start: string; end: string } | null>(null);
  const [rangeShrinkModal, setRangeShrinkModal] = useState<{
    deletedCount: number;
    nextDates: { start: string; end: string };
    reconciled: RoutingRow[];
  } | null>(null);

  const routingSnapshotRef = useRef<string | null>(null);
  const routingRowsRef = useRef<RoutingRow[]>([]);
  const committedTourDatesRef = useRef<{ start: string; end: string } | null>(null);
  routingRowsRef.current = routingRows;

  const postRoutingPayload = useCallback(
    async (rows: RoutingRow[]) => {
      const res = await fetch(`/api/tours/${tourId}/routing`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          dates: rows.map((r) => ({
            date: r.date,
            day_type: r.day_type ?? '',
            city: r.city ?? '',
            address: r.address ?? '',
            venue_name: r.venue_name ?? '',
            notes: r.notes ?? '',
            latitude: r.latitude ?? null,
            longitude: r.longitude ?? null,
            transport_to_next: r.transport_to_next ?? 'default',
            venue_website: r.venue_website ?? null,
            venue_phone: r.venue_phone ?? null,
            venue_capacity: r.venue_capacity ?? null,
          })),
        }),
      });
      if (!res.ok) throw new Error('Failed to save routing');
    },
    [tourId]
  );

  const load = useCallback(async (opts?: { silent?: boolean }) => {
    if (!tourId) return;
    const silent = opts?.silent ?? false;
    if (!silent) setLoading(true);
    setError(null);
    try {
      const [incRes, routeRes, tourRes] = await Promise.all([
        fetch(`/api/budget/income?tour_id=${tourId}`),
        fetch(`/api/tours/${tourId}/routing`),
        fetch(`/api/tours/${tourId}`),
      ]);
      const data = incRes.ok ? await incRes.json() : { income: [], routing_only: [] };
      setIncomeRows(data.income ?? []);
      setRoutingOnly(data.routing_only ?? []);
      const routeJson = routeRes.ok ? await routeRes.json() : [];
      const mapped = mapApiRoutesToGridRows(Array.isArray(routeJson) ? routeJson : []);
      setRoutingRows(mapped);
      routingSnapshotRef.current = JSON.stringify(mapped);

      if (tourRes.ok) {
        const tour = await tourRes.json();
        const s = tour?.start_date != null ? String(tour.start_date).slice(0, 10) : '';
        const e = tour?.end_date != null ? String(tour.end_date).slice(0, 10) : '';
        if (s && e) {
          const td = { start: s, end: e };
          setTourDates(td);
          committedTourDatesRef.current = td;
        } else {
          setTourDates(null);
          committedTourDatesRef.current = null;
        }
      } else {
        setTourDates(null);
        committedTourDatesRef.current = null;
      }
    } catch (err) {
      setError((err as Error)?.message ?? 'Failed to load income');
    } finally {
      if (!silent) setLoading(false);
    }
  }, [tourId]);

  useEffect(() => {
    void load();
  }, [load]);

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

  const routingByDate = useMemo(() => new Map(routingRows.map((r) => [r.date, r])), [routingRows]);

  function overlayLiveRouting(row: FullRow): FullRow {
    const live = routingByDate.get(row.routing.date);
    if (!live) return row;
    const city =
      (live.city ?? '').trim() ||
      inferCityFromAddress(String(live.address ?? '')) ||
      (row.routing.city ?? '').trim();
    return {
      ...row,
      routing: {
        ...row.routing,
        venue_name: live.venue_name ?? row.routing.venue_name,
        city: city || row.routing.city,
        day_type: live.day_type || row.routing.day_type,
      },
    };
  }

  const allRows = baseRows.map(mergeRow).map(overlayLiveRouting);

  const allRowsRef = useRef<FullRow[]>([]);
  allRowsRef.current = allRows;
  const incomeDebounceRef = useRef<Record<string, number>>({});

  /** Debounced autosave of routing grid; flush when leaving routing sub-tab or unmount if dirty */
  useEffect(() => {
    if (routingSnapshotRef.current === null) return;
    const snap = JSON.stringify(routingRows);
    if (snap === routingSnapshotRef.current) return;

    const tid = window.setTimeout(() => {
      void (async () => {
        setRoutingAutosaveState('saving');
        setError(null);
        try {
          await postRoutingPayload(routingRows);
          routingSnapshotRef.current = JSON.stringify(routingRows);
          setRoutingAutosaveState('idle');
        } catch {
          setRoutingAutosaveState('error');
          setError('Failed to save routing');
        }
      })();
    }, 700);

    return () => window.clearTimeout(tid);
  }, [routingRows, postRoutingPayload, load]);

  useEffect(() => {
    return () => {
      const snap = JSON.stringify(routingRowsRef.current);
      if (routingSnapshotRef.current !== null && snap !== routingSnapshotRef.current) {
        void postRoutingPayload(routingRowsRef.current).catch(() => {});
      }
    };
  }, [postRoutingPayload]);

  useEffect(() => {
    if (activeSubTab !== 'routing') {
      const snap = JSON.stringify(routingRowsRef.current);
      if (routingSnapshotRef.current !== null && snap !== routingSnapshotRef.current) {
        void (async () => {
          try {
            await postRoutingPayload(routingRowsRef.current);
            routingSnapshotRef.current = JSON.stringify(routingRowsRef.current);
          } catch {
            /* debounce effect will retry or user returns to routing */
          }
        })();
      }
    }
  }, [activeSubTab, postRoutingPayload, load]);

  const handleFieldChange = (routingId: string, field: keyof IncomeRow, value: number | string | null) => {
    setLocalEdits((prev) => ({ ...prev, [routingId]: { ...prev[routingId], [field]: value } }));
  };

  const saveRow = useCallback((row: FullRow) => {
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
      .then((saved) => {
        setLocalEdits((prev) => {
          const next = { ...prev };
          delete next[row.routing_id];
          return next;
        });
        setIncomeRows((prev) => {
          const idx = prev.findIndex((x) => x.routing_id === row.routing_id);
          const merged = {
            ...(idx >= 0 ? prev[idx] : row),
            ...saved,
            routing: row.routing,
          } as IncomeRow;
          if (idx >= 0) {
            const next = [...prev];
            next[idx] = merged;
            return next;
          }
          return [...prev, merged];
        });
        setRoutingOnly((prev) => prev.filter((r) => r.id !== row.routing_id));
      })
      .catch(() => setError('Failed to save'))
      .finally(() => setSavingId(null));
  }, []);

  const scheduleIncomeSave = useCallback(
    (routingId: string) => {
      window.clearTimeout(incomeDebounceRef.current[routingId]);
      incomeDebounceRef.current[routingId] = window.setTimeout(() => {
        const row = allRowsRef.current.find((r) => r.routing_id === routingId);
        if (row) saveRow(row);
        delete incomeDebounceRef.current[routingId];
      }, 600);
    },
    [saveRow]
  );

  const flushIncomeSave = useCallback(
    (row: FullRow) => {
      window.clearTimeout(incomeDebounceRef.current[row.routing_id]);
      delete incomeDebounceRef.current[row.routing_id];
      saveRow(row);
    },
    [saveRow]
  );

  useEffect(() => {
    return () => {
      Object.values(incomeDebounceRef.current).forEach((t) => window.clearTimeout(t));
    };
  }, []);

  const applyTourDateRange = useCallback(
    async (nextDates: { start: string; end: string }, reconciled: RoutingRow[]) => {
      if (!nextDates.start || !nextDates.end) return;
      if (parseRoutingDate(nextDates.start) > parseRoutingDate(nextDates.end)) {
        setError('Tour end date must be on or after start date.');
        return;
      }
      setError(null);
      setRoutingAutosaveState('saving');
      try {
        const patchRes = await fetch(`/api/tours/${tourId}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ start_date: nextDates.start, end_date: nextDates.end }),
        });
        if (!patchRes.ok) throw new Error('Failed to update tour dates');
        await postRoutingPayload(reconciled);
        setTourDates(nextDates);
        committedTourDatesRef.current = nextDates;
        setRoutingAutosaveState('idle');
        await load({ silent: true });
      } catch {
        setRoutingAutosaveState('error');
        setError('Failed to apply tour dates');
      }
    },
    [tourId, postRoutingPayload, load]
  );

  const onTourDateInputChange = (field: 'start' | 'end', value: string) => {
    const base = tourDates ?? { start: '', end: '' };
    const next = { ...base, [field]: value };
    setTourDates(next);
    if (!next.start || !next.end) return;
    if (parseRoutingDate(next.start) > parseRoutingDate(next.end)) return;

    const deleted = countRowsRemovedByShrink(routingRows, next.start, next.end);
    const reconciled = reconcileRowsToRange(routingRows, next.start, next.end);
    if (deleted > 0) {
      setRangeShrinkModal({ deletedCount: deleted, nextDates: next, reconciled });
    } else {
      void applyTourDateRange(next, reconciled);
    }
  };

  const proposedTotal = allRows.reduce((a, r) => a + r.post_tax_guarantee + r.merch_income + r.vip_income, 0);
  const actualTotal = allRows.reduce(
    (a, r) => a + (r.actual_guarantee ?? 0) + (r.actual_overage ?? 0) + (r.actual_merch ?? 0) + (r.actual_vip ?? 0),
    0
  );

  /** Calendar + map follow the routing grid so edits show before autosave completes */
  const calRows: CalRow[] = useMemo(
    () =>
      routingRows.map((r) => ({
        date: r.date,
        day_type: r.day_type,
        venue_name: r.venue_name ?? null,
        city: r.city,
      })),
    [routingRows]
  );

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
    <div className="space-y-7">
      {rangeShrinkModal && (
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="routing-shrink-title"
        >
          <div className="max-w-md rounded-xl border border-lp-border bg-lp-surface p-6 shadow-xl">
            <h3 id="routing-shrink-title" className="text-lg font-semibold text-lp-text">
              Remove routing days?
            </h3>
            <p className="mt-2 text-sm text-lp-text-secondary">
              Shortening the tour will remove {rangeShrinkModal.deletedCount} routing day
              {rangeShrinkModal.deletedCount !== 1 ? 's' : ''} outside the new date range. This cannot be
              undone.
            </p>
            <div className="mt-6 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => {
                  setRangeShrinkModal(null);
                  if (committedTourDatesRef.current) setTourDates({ ...committedTourDatesRef.current });
                }}
                className="rounded-lg border border-lp-border px-4 py-2 text-sm font-medium text-lp-text hover:bg-lp-surface-hover"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => {
                  const m = rangeShrinkModal;
                  setRangeShrinkModal(null);
                  void applyTourDateRange(m.nextDates, m.reconciled);
                }}
                className="rounded-lg bg-lp-orange px-4 py-2 text-sm font-semibold text-white hover:bg-lp-orange-hover"
              >
                Remove and update
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Second sticky row: full-bleed dashboard bg so scroll content stays beneath (z below folder header z-30) */}
      <div
        className="sticky z-[28] -mx-8 px-8 py-2 pb-3"
        style={{ top: BUDGET_FOLDER_STICKY_STACK_TOP, background: 'var(--lp-dashboard-bg)' }}
      >
        <div className="relative flex flex-wrap items-center gap-3">
          <div className="flex w-fit items-center gap-5 border-b border-lp-border/50">
            <button
              type="button"
              onClick={() => setActiveSubTab('routing')}
              className={cn(
                '-mb-px border-b-2 pb-2 text-xs font-semibold uppercase tracking-wide transition-colors',
                activeSubTab === 'routing'
                  ? 'border-lp-orange text-lp-text'
                  : 'border-transparent text-lp-text-secondary hover:text-lp-text'
              )}
            >
              Routing
            </button>
            <button
              type="button"
              onClick={() => setActiveSubTab('income')}
              className={cn(
                '-mb-px border-b-2 pb-2 text-xs font-semibold uppercase tracking-wide transition-colors',
                activeSubTab === 'income'
                  ? 'border-lp-orange text-lp-text'
                  : 'border-transparent text-lp-text-secondary hover:text-lp-text'
              )}
            >
              Income
            </button>
          </div>
          {activeSubTab === 'routing' && routingAutosaveState === 'error' && (
            <div className="ml-auto text-xs font-medium text-red-500">Routing save failed</div>
          )}
        </div>
      </div>

      {activeSubTab === 'routing' && (
        <>
          <div className="flex flex-wrap items-end gap-4">
            <div className="flex flex-wrap gap-4">
              <label className="flex flex-col gap-1">
                <span className="text-[10px] font-semibold uppercase tracking-wider lp-table-header-text">
                  Tour start
                </span>
                <input
                  type="date"
                  value={tourDates?.start ?? ''}
                  onChange={(e) => onTourDateInputChange('start', e.target.value)}
                  className="rounded-lg border border-lp-border bg-lp-surface px-2 py-1.5 text-sm text-lp-text"
                />
              </label>
              <label className="flex flex-col gap-1">
                <span className="text-[10px] font-semibold uppercase tracking-wider lp-table-header-text">
                  Tour end
                </span>
                <input
                  type="date"
                  value={tourDates?.end ?? ''}
                  onChange={(e) => onTourDateInputChange('end', e.target.value)}
                  className="rounded-lg border border-lp-border bg-lp-surface px-2 py-1.5 text-sm text-lp-text"
                />
              </label>
            </div>
            <label className="flex flex-col gap-1">
              <span className="text-[10px] font-semibold uppercase tracking-wider lp-table-header-text">
                Primary transport mode
              </span>
              <select
                value={primaryTransit}
                onChange={(e) => setPrimaryTransit(e.target.value as PrimaryTransit)}
                className="min-w-[14rem] rounded-lg border border-lp-border bg-lp-surface px-3 py-2 text-sm text-lp-text"
              >
                {PRIMARY_TRANSIT_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
            </label>
          </div>

          <div className="grid grid-cols-1 gap-5 lg:grid-cols-[minmax(260px,300px)_1fr] lg:items-stretch lg:gap-6 lg:h-[280px]">
            <div className="relative z-0 flex min-h-[220px] flex-col overflow-y-auto rounded-xl border border-lp-border bg-lp-surface p-3 shadow-sm lg:min-h-0 lg:h-full">
              <RoutingMiniCalendar routingRows={calRows} />
            </div>
            <div className="relative z-0 min-h-[220px] min-w-0 overflow-hidden rounded-xl border border-lp-border bg-lp-surface shadow-sm lg:min-h-0 lg:h-full">
              <BudgetRoutingMap rows={calRows} />
            </div>
          </div>

          <RoutingGrid
            tourId={tourId}
            rows={routingRows}
            onChange={setRoutingRows}
            updateRow={(index, updates) =>
              setRoutingRows((prev) => prev.map((r, i) => (i === index ? { ...r, ...updates } : r)))
            }
            primaryTransit={primaryTransit}
          />
        </>
      )}

      {/* ── Income table ── */}
      {activeSubTab === 'income' && (
        <div className="overflow-x-auto rounded-xl border border-lp-border bg-lp-surface">
          <table className="w-full min-w-[max(1100px,max-content)] border-collapse text-sm">
          <thead>
            <tr className="border-b border-lp-border">
              <th className="px-4 py-3 text-left text-[10px] font-semibold uppercase tracking-widest lp-table-header-text">
                Date
              </th>
              <th className="px-4 py-3 text-left text-[10px] font-semibold uppercase tracking-widest lp-table-header-text">
                Venue
              </th>
              <th className="px-4 py-3 text-left text-[10px] font-semibold uppercase tracking-widest lp-table-header-text">
                City
              </th>
              <th className="w-20 px-4 py-3 text-left text-[10px] font-semibold uppercase tracking-widest lp-table-header-text">
                Type
              </th>
              <th className="w-28 px-4 py-3 text-center text-[10px] font-semibold uppercase tracking-widest lp-table-header-text">
                <span className="block leading-tight">Pre-Tax</span>
                <span className="block leading-tight">Guarantee</span>
              </th>
              <th className="w-20 px-4 py-3 text-center text-[10px] font-semibold uppercase tracking-widest lp-table-header-text">
                WHT %
              </th>
              <th className="w-28 px-4 py-3 text-center text-[10px] font-semibold uppercase tracking-widest lp-table-header-text">
                <span className="block leading-tight">Post-Tax</span>
                <span className="block leading-tight">Guarantee</span>
              </th>
              <th className="w-24 px-4 py-3 text-center text-[10px] font-semibold uppercase tracking-widest lp-table-header-text">
                <span className="block leading-tight">Pre-Tax</span>
                <span className="block leading-tight">Overage</span>
              </th>
              <th className="w-24 px-4 py-3 text-center text-[10px] font-semibold uppercase tracking-widest lp-table-header-text">
                <span className="block leading-tight">Post-Tax</span>
                <span className="block leading-tight">Overage</span>
              </th>
              <th className="w-20 px-4 py-3 text-center text-[10px] font-semibold uppercase tracking-widest lp-table-header-text">
                Merch
              </th>
              <th className="w-20 px-4 py-3 text-center text-[10px] font-semibold uppercase tracking-widest lp-table-header-text">
                VIP
              </th>
              <th className="w-14 px-4 py-3 text-center text-[10px] font-semibold uppercase tracking-widest lp-table-header-text">
                Drop
              </th>
              <th className="min-w-[100px] px-4 py-3 text-left text-[10px] font-semibold uppercase tracking-widest lp-table-header-text">
                Notes
              </th>
            </tr>
          </thead>

          <tbody>
            {allRows.map((row) => {
              const date =
                row.routing?.date
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
                      onChange={(e) => {
                        handleFieldChange(row.routing_id, 'pre_tax_guarantee', e.target.value ? Number(e.target.value) : 0);
                        scheduleIncomeSave(row.routing_id);
                      }}
                      onBlur={() => {
                        const r = allRowsRef.current.find((x) => x.routing_id === row.routing_id);
                        if (r) flushIncomeSave(r);
                      }}
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
                      onChange={(e) => {
                        handleFieldChange(row.routing_id, 'withholding_pct', e.target.value ? Number(e.target.value) : 0);
                        scheduleIncomeSave(row.routing_id);
                      }}
                      onBlur={() => {
                        const r = allRowsRef.current.find((x) => x.routing_id === row.routing_id);
                        if (r) flushIncomeSave(r);
                      }}
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
                      onChange={(e) => {
                        handleFieldChange(row.routing_id, 'pre_tax_overage', e.target.value ? Number(e.target.value) : 0);
                        scheduleIncomeSave(row.routing_id);
                      }}
                      onBlur={() => {
                        const r = allRowsRef.current.find((x) => x.routing_id === row.routing_id);
                        if (r) flushIncomeSave(r);
                      }}
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
                      onChange={(e) => {
                        handleFieldChange(row.routing_id, 'merch_income', e.target.value ? Number(e.target.value) : 0);
                        scheduleIncomeSave(row.routing_id);
                      }}
                      onBlur={() => {
                        const r = allRowsRef.current.find((x) => x.routing_id === row.routing_id);
                        if (r) flushIncomeSave(r);
                      }}
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
                      onChange={(e) => {
                        handleFieldChange(row.routing_id, 'vip_income', e.target.value ? Number(e.target.value) : 0);
                        scheduleIncomeSave(row.routing_id);
                      }}
                      onBlur={() => {
                        const r = allRowsRef.current.find((x) => x.routing_id === row.routing_id);
                        if (r) flushIncomeSave(r);
                      }}
                    />
                  </td>

                  {/* Drop */}
                  <td className="px-4 py-2">
                    <input
                      type="number"
                      min="0"
                      className="w-full rounded-md border border-lp-border bg-transparent px-2 py-1 text-right text-xs text-lp-text tabular-nums focus:border-lp-orange focus:outline-none focus:ring-1 focus:ring-lp-orange/30"
                      value={row.drop_count ?? ''}
                      onChange={(e) => {
                        handleFieldChange(row.routing_id, 'drop_count', e.target.value === '' ? null : Number(e.target.value));
                        scheduleIncomeSave(row.routing_id);
                      }}
                      onBlur={() => {
                        const r = allRowsRef.current.find((x) => x.routing_id === row.routing_id);
                        if (r) flushIncomeSave(r);
                      }}
                    />
                  </td>

                  {/* Notes */}
                  <td className="px-4 py-2">
                    <input
                      type="text"
                      placeholder="Notes"
                      className="w-full rounded-md border border-lp-border bg-transparent px-2 py-1 text-xs text-lp-text placeholder:text-lp-text-tertiary focus:border-lp-orange focus:outline-none focus:ring-1 focus:ring-lp-orange/30"
                      value={row.notes ?? ''}
                      onChange={(e) => {
                        handleFieldChange(row.routing_id, 'notes', e.target.value || null);
                        scheduleIncomeSave(row.routing_id);
                      }}
                      onBlur={() => {
                        const r = allRowsRef.current.find((x) => x.routing_id === row.routing_id);
                        if (r) flushIncomeSave(r);
                      }}
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
              <td colSpan={6} className="px-4 py-3 text-sm font-semibold text-lp-text">
                Proposed Totals
                <span className="ml-1.5 text-sm font-normal text-lp-text-tertiary">(excl. overages)</span>
              </td>
              <td className="whitespace-nowrap px-4 py-3 text-left tabular-nums text-sm font-bold text-lp-text">
                {fmt(proposedTotal)}
              </td>
              <td colSpan={6} />
            </tr>

            {/* Actual totals row — orange highlight */}
            <tr
              className="border-t border-lp-border/60 rounded-b-xl"
              style={{ background: 'rgba(255,69,0,0.06)' }}
            >
              <td colSpan={6} className="px-4 py-3 text-sm font-semibold" style={{ color: '#FF4500' }}>
                Actual Totals
                <span className="ml-1.5 text-sm font-normal opacity-80">(incl. overages)</span>
              </td>
              <td
                className="whitespace-nowrap px-4 py-3 text-left tabular-nums text-sm font-bold"
                style={{ color: '#FF4500' }}
              >
                {fmt(actualTotal)}
              </td>
              <td colSpan={6} />
            </tr>
          </tfoot>
          </table>
        </div>
      )}

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
