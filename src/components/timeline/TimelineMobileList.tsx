'use client';

import { isWeekend, ymdToMonthTitle } from './dates';
import type { TimelineItem, TimelineRow } from './types';

type TimelineMobileListProps<T> = {
  rows: TimelineRow<T>[];
  days: string[];
  todayYmd: string;
  onDayClick?: (d: string) => void;
};

function itemOnDay<T>(it: TimelineItem<T>, d: string): boolean {
  return d >= it.startDate && d <= it.endDate;
}

export function TimelineMobileList<T>({
  rows,
  days,
  todayYmd,
  onDayClick,
}: TimelineMobileListProps<T>) {
  return (
    <div className="space-y-3 p-2">
      {days.map((ymd) => {
        const isToday = ymd === todayYmd;
        const weekend = isWeekend(ymd);
        return (
          <div
            key={ymd}
            className="overflow-hidden rounded-lg border"
            style={{
              borderColor: 'var(--lp-border)',
              background: isToday
                ? 'var(--color-lp-orange-subtle)'
                : weekend
                  ? 'var(--lp-bg-secondary)'
                  : 'var(--lp-surface)',
            }}
          >
            <button
              type="button"
              onClick={() => onDayClick?.(ymd)}
              className="w-full border-b px-3 py-2 text-left"
              style={{ borderColor: 'var(--lp-border-light)' }}
            >
              <div
                className="text-xs font-semibold uppercase"
                style={{ color: isToday ? 'var(--lp-orange)' : 'var(--lp-text-tertiary)' }}
              >
                {ymdToMonthTitle(ymd)} · {ymd}
                {isToday && ' · TODAY'}
              </div>
            </button>
            <div className="space-y-2 p-2">
              {rows.map((r) => {
                if (r.collapsed) return null;
                const rowItems = r.items.filter((it) => itemOnDay(it, ymd));
                if (rowItems.length === 0) return null;
                return (
                  <div key={r.id}>
                    <div
                      className="mb-1 text-[10px] font-bold tracking-wide"
                      style={{ color: 'var(--lp-text-tertiary)' }}
                    >
                      {r.label}
                    </div>
                    {rowItems.map((it) => (
                      <div
                        key={it.id}
                        onClick={it.onClick}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' || e.key === ' ') it.onClick?.();
                        }}
                        role={it.onClick ? 'button' : undefined}
                        tabIndex={it.onClick ? 0 : undefined}
                        className="mb-1.5 overflow-hidden text-ellipsis rounded border px-2 py-1.5 text-sm last:mb-0"
                        style={{
                          borderColor: 'var(--lp-border-light)',
                          borderLeftWidth: 3,
                          borderLeftColor: it.color ?? 'var(--lp-orange)',
                          color: 'var(--lp-text)',
                        }}
                      >
                        {it.render(it.data)}
                      </div>
                    ))}
                  </div>
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
}
