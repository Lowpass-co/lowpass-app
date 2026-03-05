/* ============================================
   LOWPASS — Routing Kanban View

   Columns by day type, cards = routing dates.
   ============================================ */

'use client';

import { getDayTypeLabel, getDayTypeColor } from '@/lib/utils';
import type { DayType } from '@/types';
import type { RoutingRow } from './RoutingGrid';
import { cn } from '@/lib/utils';

const DAY_TYPES: DayType[] = [
  'show',
  'off',
  'travel',
  'rehearsal',
  'press',
  'radio',
  'tv',
  'festival',
];

export function RoutingKanban({ rows }: { rows: RoutingRow[] }) {
  const byType = new Map<DayType, RoutingRow[]>();
  for (const dt of DAY_TYPES) byType.set(dt, []);
  for (const row of rows) {
    const list = byType.get(row.day_type) ?? [];
    list.push(row);
    byType.set(row.day_type, list);
  }

  return (
    <div className="flex gap-4 overflow-x-auto pb-4">
      {DAY_TYPES.map((dayType) => {
        const items = byType.get(dayType) ?? [];
        const colors = getDayTypeColor(dayType);
        return (
          <div
            key={dayType}
            className="w-64 shrink-0 rounded-xl border border-lp-border bg-lp-bg-secondary/50"
          >
            <div
              className={cn(
                'rounded-t-xl px-3 py-2 text-sm font-semibold',
                colors.bg,
                colors.text
              )}
            >
              {getDayTypeLabel(dayType)}
              <span className="ml-2 text-xs font-normal opacity-80">({items.length})</span>
            </div>
            <div className="space-y-2 p-2">
              {items.map((row) => (
                <div
                  key={row.date}
                  className="rounded-lg border border-lp-border bg-lp-surface p-3 text-sm"
                >
                  <div className="font-medium text-lp-text">
                    {new Date(row.date + 'Z').toLocaleDateString('en-GB', {
                      weekday: 'short',
                      day: '2-digit',
                      month: 'short',
                    })}
                  </div>
                  {row.city && (
                    <div className="mt-1 text-lp-text-secondary">{row.city}</div>
                  )}
                  {row.venue_name && (
                    <div className="mt-0.5 truncate text-xs text-lp-text-tertiary">
                      {row.venue_name}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}
