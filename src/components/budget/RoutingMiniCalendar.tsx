'use client';

import { useState, useEffect, useMemo, useRef } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { cn, getDayTypeColor, parseRoutingDate, firstDayType } from '@/lib/utils';

export type CalRow = { date: string; day_type: string; venue_name: string | null; city: string };

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

export function getDayTypeAbbrev(dayType: string): string {
  return DAY_TYPE_ABBREV[dayType] ?? dayType.slice(0, 3).toUpperCase();
}

function buildMonthCells(year: number, month: number): (string | null)[] {
  const first = new Date(year, month, 1);
  const startDay = first.getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const cells: (string | null)[] = [];
  for (let i = 0; i < startDay; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) {
    cells.push(`${year}-${String(month + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`);
  }
  while (cells.length % 7 !== 0) cells.push(null);
  return cells;
}

function monthFromIso(iso: string | null | undefined): { year: number; month: number } | null {
  if (!iso || iso.length < 7) return null;
  const [y, mo] = iso.slice(0, 7).split('-').map(Number);
  if (!Number.isFinite(y) || !Number.isFinite(mo)) return null;
  return { year: y, month: mo - 1 };
}

/** Read-only month grid (Routing & Income tab). Navigate any month; tour days show badges. */
export function RoutingMiniCalendar({ routingRows }: { routingRows: CalRow[] }) {
  const [viewYear, setViewYear] = useState(() => new Date().getFullYear());
  const [viewMonth, setViewMonth] = useState(() => new Date().getMonth());

  const lastFirstDateRef = useRef<string | null>(null);
  useEffect(() => {
    if (routingRows.length === 0) {
      lastFirstDateRef.current = null;
      return;
    }
    const sorted = [...routingRows].sort((a, b) => a.date.localeCompare(b.date));
    const first = sorted[0]?.date ?? '';
    if (lastFirstDateRef.current === first) return;
    lastFirstDateRef.current = first;
    const ft = monthFromIso(first);
    if (ft) {
      setViewYear(ft.year);
      setViewMonth(ft.month);
    }
  }, [routingRows]);

  if (routingRows.length === 0) {
    return (
      <div className="flex min-h-[120px] items-center justify-center text-lp-text-tertiary text-sm">
        No routing dates
      </div>
    );
  }

  const byDate = new Map(routingRows.map((r) => [r.date, r]));
  const cells = buildMonthCells(viewYear, viewMonth);
  const monthLabel = new Date(viewYear, viewMonth, 1).toLocaleDateString('en-GB', { month: 'long', year: 'numeric' });

  const goPrev = () => {
    const d = new Date(viewYear, viewMonth - 1, 1);
    setViewYear(d.getFullYear());
    setViewMonth(d.getMonth());
  };
  const goNext = () => {
    const d = new Date(viewYear, viewMonth + 1, 1);
    setViewYear(d.getFullYear());
    setViewMonth(d.getMonth());
  };

  return (
    <div className="flex w-full flex-col">
      <div className="mb-2 flex shrink-0 items-center justify-center gap-2">
        <button
          type="button"
          onClick={goPrev}
          className="flex h-7 w-7 shrink-0 items-center justify-center rounded transition-colors hover:bg-lp-orange/10"
          style={{ color: '#FF4500' }}
          aria-label="Previous month"
        >
          <ChevronLeft size={16} />
        </button>
        <span className="min-w-0 flex-1 text-center text-xs font-semibold uppercase tracking-wide text-lp-text">
          {monthLabel}
        </span>
        <button
          type="button"
          onClick={goNext}
          className="flex h-7 w-7 shrink-0 items-center justify-center rounded transition-colors hover:bg-lp-orange/10"
          style={{ color: '#FF4500' }}
          aria-label="Next month"
        >
          <ChevronRight size={16} />
        </button>
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
              <span
                className={cn(
                  'mb-0.5 text-[11px] font-medium leading-none tabular-nums',
                  row ? 'text-lp-text' : 'text-lp-text-tertiary'
                )}
              >
                {dayNum}
              </span>
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

/**
 * Selectable date grid: navigate any month; tour/routing days show day-type badges.
 */
export function RoutingDatePickerBody({
  routingRows,
  value,
  onSelect,
}: {
  routingRows: CalRow[];
  value: string | null;
  onSelect: (iso: string) => void;
}) {
  const now = useMemo(() => new Date(), []);
  const [viewYear, setViewYear] = useState(now.getFullYear());
  const [viewMonth, setViewMonth] = useState(now.getMonth());

  const lastFirstDateRef = useRef<string | null>(null);
  useEffect(() => {
    const fromValue = monthFromIso(value);
    if (fromValue) {
      setViewYear(fromValue.year);
      setViewMonth(fromValue.month);
      return;
    }
    if (routingRows.length === 0) {
      lastFirstDateRef.current = null;
      return;
    }
    const sorted = [...routingRows].sort((a, b) => a.date.localeCompare(b.date));
    const first = sorted[0]?.date ?? '';
    if (lastFirstDateRef.current === first) return;
    lastFirstDateRef.current = first;
    const ft = monthFromIso(first);
    if (ft) {
      setViewYear(ft.year);
      setViewMonth(ft.month);
    }
  }, [value, routingRows]);

  const goPrevMonth = () => {
    const d = new Date(viewYear, viewMonth - 1, 1);
    setViewYear(d.getFullYear());
    setViewMonth(d.getMonth());
  };
  const goNextMonth = () => {
    const d = new Date(viewYear, viewMonth + 1, 1);
    setViewYear(d.getFullYear());
    setViewMonth(d.getMonth());
  };

  const byDate = new Map(routingRows.map((r) => [r.date, r]));
  const cells = buildMonthCells(viewYear, viewMonth);
  const monthLabel = new Date(viewYear, viewMonth, 1).toLocaleDateString('en-GB', { month: 'long', year: 'numeric' });
  const selectedNorm = value ? value.slice(0, 10) : null;

  return (
    <div className="w-[min(100vw-2rem,280px)] p-2">
      <div className="mb-2 flex shrink-0 items-center justify-center gap-2">
        <button
          type="button"
          onClick={goPrevMonth}
          className="flex h-7 w-7 shrink-0 items-center justify-center rounded transition-colors hover:bg-lp-orange/10"
          style={{ color: '#FF4500' }}
          aria-label="Previous month"
        >
          <ChevronLeft size={16} />
        </button>
        <span className="min-w-0 flex-1 text-center text-xs font-semibold uppercase tracking-wide text-lp-text">
          {monthLabel}
        </span>
        <button
          type="button"
          onClick={goNextMonth}
          className="flex h-7 w-7 shrink-0 items-center justify-center rounded transition-colors hover:bg-lp-orange/10"
          style={{ color: '#FF4500' }}
          aria-label="Next month"
        >
          <ChevronRight size={16} />
        </button>
      </div>
      <div className="mb-1 grid shrink-0 grid-cols-7 gap-y-0.5">
        {['S', 'M', 'T', 'W', 'T', 'F', 'S'].map((d, i) => (
          <div
            key={i}
            className="py-0.5 text-center text-[10px] font-semibold uppercase tracking-wide lp-table-header-text"
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
          const isSel = selectedNorm === dateStr;

          return (
            <button
              key={dateStr}
              type="button"
              onClick={() => onSelect(dateStr)}
              className={cn(
                'flex flex-col items-center rounded py-0.5 transition-colors hover:bg-lp-orange/10',
                isSel && 'ring-1 ring-lp-orange bg-lp-orange/10'
              )}
            >
              <span
                className={cn(
                  'mb-0.5 text-[11px] font-medium leading-none tabular-nums',
                  isSel ? 'text-lp-orange' : row ? 'text-lp-text' : 'text-lp-text-tertiary'
                )}
              >
                {dayNum}
              </span>
              {abbrev && colors ? (
                <span
                  className={cn(
                    'rounded-sm px-1 py-px text-[8px] font-bold leading-none tabular-nums',
                    colors.bg,
                    colors.text
                  )}
                >
                  {abbrev}
                </span>
              ) : (
                <span className="h-3" />
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}

export function DayTypePill({ dayType }: { dayType: string }) {
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
