/* ============================================
   LOWPASS — Routing Calendar View

   Month-style calendar with routing dates.
   ============================================ */

'use client';

import { getDayTypeColor } from '@/lib/utils';
import { cn } from '@/lib/utils';
import type { RoutingRow } from './RoutingGrid';

export function RoutingCalendar({ rows }: { rows: RoutingRow[] }) {
  if (rows.length === 0) return null;

  const start = new Date(rows[0].date + 'Z');
  const end = new Date(rows[rows.length - 1].date + 'Z');
  const startMonth = start.getUTCFullYear() * 12 + start.getUTCMonth();
  const endMonth = end.getUTCFullYear() * 12 + end.getUTCMonth();
  const months: { year: number; month: number }[] = [];
  for (let m = startMonth; m <= endMonth; m++) {
    months.push({ year: Math.floor(m / 12), month: m % 12 });
  }

  const byDate = new Map(rows.map((r) => [r.date, r]));

  return (
    <div className="space-y-6">
      {months.map(({ year, month }) => {
        const first = new Date(Date.UTC(year, month, 1));
        const last = new Date(Date.UTC(year, month + 1, 0));
        const startDay = first.getUTCDay();
        const daysInMonth = last.getUTCDate();
        const weeks: (string | null)[][] = [];
        let week: (string | null)[] = [];
        for (let i = 0; i < startDay; i++) week.push(null);
        for (let d = 1; d <= daysInMonth; d++) {
          const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
          week.push(dateStr);
          if (week.length === 7) {
            weeks.push(week);
            week = [];
          }
        }
        if (week.length) {
          while (week.length < 7) week.push(null);
          weeks.push(week);
        }

        return (
          <div key={`${year}-${month}`}>
            <h3 className="mb-2 text-sm font-semibold text-lp-text">
              {first.toLocaleDateString('en-GB', { month: 'long', year: 'numeric' })}
            </h3>
            <div className="rounded-xl border border-lp-border overflow-hidden">
              <div className="grid grid-cols-7 border-b border-lp-border bg-lp-bg-secondary text-xs font-medium text-lp-text-tertiary">
                {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((day) => (
                  <div key={day} className="p-2 text-center">
                    {day}
                  </div>
                ))}
              </div>
              {weeks.map((week, wi) => (
                <div key={wi} className="grid grid-cols-7 border-b border-lp-border last:border-0">
                  {week.map((dateStr, di) => {
                    if (!dateStr) {
                      return <div key={di} className="min-h-[80px] bg-lp-bg-secondary/50 p-2" />;
                    }
                    const row = byDate.get(dateStr);
                    const colors = row ? getDayTypeColor(row.day_type) : null;
                    return (
                      <div
                        key={di}
                        className="min-h-[80px] border-r border-lp-border last:border-r-0 p-2"
                      >
                        <span className="text-xs font-medium text-lp-text-tertiary">
                          {new Date(dateStr + 'Z').getUTCDate()}
                        </span>
                        {row && (
                          <div
                            className={cn(
                              'mt-1 rounded px-2 py-1 text-xs',
                              colors?.bg,
                              colors?.text
                            )}
                          >
                            <div className="font-medium">{row.city || '—'}</div>
                            <div className="truncate">{row.venue_name || row.notes || ''}</div>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}
