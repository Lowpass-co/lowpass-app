'use client';

import { isWeekend } from './dates';

type TimelineDayHeaderProps = {
  days: string[];
  /** Window [vs, ve] inclusive indices into `days` */
  vs: number;
  ve: number;
  dayWidth: number;
  todayYmd: string;
  onDayClick?: (date: string) => void;
};

export function TimelineDayHeader({
  days,
  vs,
  ve,
  dayWidth,
  todayYmd,
  onDayClick,
}: TimelineDayHeaderProps) {
  const n = ve - vs + 1;
  if (n <= 0) return null;
  return (
    <div
      className="flex shrink-0"
      style={{
        width: n * dayWidth,
        minWidth: n * dayWidth,
      }}
    >
      {days.slice(vs, ve + 1).map((ymd) => {
        const isToday = ymd === todayYmd;
        const weekend = isWeekend(ymd);
        const cell = new Date(ymd + 'T12:00:00');
        const wd = cell.toLocaleString(undefined, { weekday: 'short' });
        const num = cell.getDate();
        return (
          <button
            key={ymd}
            type="button"
            onClick={() => onDayClick?.(ymd)}
            className="shrink-0 border-b text-left"
            style={{
              width: dayWidth,
              minWidth: dayWidth,
              height: 52,
              padding: '4px 6px',
              borderColor: 'var(--lp-border-light)',
              background: isToday
                ? 'var(--color-lp-orange-subtle)'
                : weekend
                  ? 'var(--lp-bg-secondary)'
                  : 'var(--lp-surface)',
            }}
          >
            <div
              className="text-[10px] font-medium uppercase"
              style={{
                color: isToday ? 'var(--lp-orange)' : 'var(--lp-text-tertiary)',
                letterSpacing: 'var(--lp-tracking-caps, 0.05em)',
              }}
            >
              {isToday ? 'Today' : wd}
            </div>
            <div
              className="text-sm font-semibold tabular-nums"
              style={{ color: 'var(--lp-text)' }}
            >
              {num}
            </div>
          </button>
        );
      })}
    </div>
  );
}
