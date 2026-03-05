/* ============================================
   LOWPASS — Routing Kanban View

   Columns by day type, cards = routing dates.
   ============================================ */

'use client';

import { getDayTypeLabel, getDayTypeColor, parseRoutingDate } from '@/lib/utils';
import type { RoutingRow } from './RoutingGrid';
import { cn } from '@/lib/utils';

const PRESET_ORDER: string[] = [
  'show',
  'off',
  'travel',
  'rehearsal',
  'press',
  'radio',
  'tv',
  'festival',
];

function columnOrder(keys: string[]): string[] {
  const unset = keys.filter((k) => k === '');
  const preset = PRESET_ORDER.filter((k) => keys.includes(k));
  const other = keys.filter((k) => k !== '' && !PRESET_ORDER.includes(k)).sort();
  return [...unset, ...preset, ...other];
}

export function RoutingKanban({ rows }: { rows: RoutingRow[] }) {
  const byType = new Map<string, RoutingRow[]>();
  for (const row of rows) {
    const key = row.day_type ?? '';
    const list = byType.get(key) ?? [];
    list.push(row);
    byType.set(key, list);
  }
  const columnKeys = columnOrder([...byType.keys()]);

  return (
    <div className="flex gap-4 overflow-x-auto pb-4">
      {columnKeys.map((dayType) => {
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
              {dayType === '' ? 'Day type' : getDayTypeLabel(dayType)}
              <span className="ml-2 text-xs font-normal opacity-80">({items.length})</span>
            </div>
            <div className="space-y-2 p-2">
              {items.map((row) => (
                <div
                  key={row.date}
                  className="rounded-lg border border-lp-border bg-lp-surface p-3 text-sm"
                >
                  <div className="font-medium text-lp-text">
                    {parseRoutingDate(row.date).toLocaleDateString('en-GB', {
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
