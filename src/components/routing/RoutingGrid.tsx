/* ============================================
   LOWPASS — Routing Grid View

   Table of dates with day type, city, venue, notes.
   ============================================ */

'use client';

import { getDayTypeLabel, getDayTypeColor } from '@/lib/utils';
import type { DayType } from '@/types';
import { cn } from '@/lib/utils';

export interface RoutingRow {
  date: string;
  day_type: DayType;
  city: string;
  venue_name?: string;
  notes?: string;
}

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

export function RoutingGrid({
  rows,
  onChange,
}: {
  rows: RoutingRow[];
  onChange: (rows: RoutingRow[]) => void;
}) {
  const updateRow = (index: number, updates: Partial<RoutingRow>) => {
    const next = [...rows];
    next[index] = { ...next[index], ...updates };
    onChange(next);
  };

  return (
    <div className="overflow-x-auto rounded-xl border border-lp-border">
      <table className="w-full min-w-[640px] text-sm">
        <thead>
          <tr className="border-b border-lp-border bg-lp-bg-secondary">
            <th className="px-4 py-3 text-left font-medium text-lp-text-secondary">Date</th>
            <th className="px-4 py-3 text-left font-medium text-lp-text-secondary">Day type</th>
            <th className="px-4 py-3 text-left font-medium text-lp-text-secondary">City</th>
            <th className="px-4 py-3 text-left font-medium text-lp-text-secondary">Venue</th>
            <th className="px-4 py-3 text-left font-medium text-lp-text-secondary">Notes</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => {
            const colors = getDayTypeColor(row.day_type);
            return (
              <tr
                key={row.date}
                className="border-b border-lp-border last:border-0 hover:bg-lp-surface-hover"
              >
                <td className="px-4 py-2.5 font-medium text-lp-text">
                  {new Date(row.date + 'Z').toLocaleDateString('en-GB', {
                    weekday: 'short',
                    day: '2-digit',
                    month: 'short',
                  })}
                </td>
                <td className="px-4 py-2.5">
                  <select
                    value={row.day_type}
                    onChange={(e) => updateRow(i, { day_type: e.target.value as DayType })}
                    className={cn(
                      'rounded-md border border-lp-border bg-lp-surface px-2 py-1 text-sm focus:border-lp-orange focus:outline-none focus:ring-1 focus:ring-lp-orange',
                      colors.text
                    )}
                  >
                    {DAY_TYPES.map((dt) => (
                      <option key={dt} value={dt}>
                        {getDayTypeLabel(dt)}
                      </option>
                    ))}
                  </select>
                </td>
                <td className="px-4 py-2.5">
                  <input
                    type="text"
                    value={row.city}
                    onChange={(e) => updateRow(i, { city: e.target.value })}
                    placeholder="City"
                    className="w-full min-w-[100px] rounded-md border border-lp-border bg-lp-surface px-2 py-1 text-lp-text placeholder:text-lp-text-tertiary focus:border-lp-orange focus:outline-none focus:ring-1 focus:ring-lp-orange"
                  />
                </td>
                <td className="px-4 py-2.5">
                  <input
                    type="text"
                    value={row.venue_name ?? ''}
                    onChange={(e) => updateRow(i, { venue_name: e.target.value })}
                    placeholder="Venue"
                    className="w-full min-w-[120px] rounded-md border border-lp-border bg-lp-surface px-2 py-1 text-lp-text placeholder:text-lp-text-tertiary focus:border-lp-orange focus:outline-none focus:ring-1 focus:ring-lp-orange"
                  />
                </td>
                <td className="px-4 py-2.5">
                  <input
                    type="text"
                    value={row.notes ?? ''}
                    onChange={(e) => updateRow(i, { notes: e.target.value })}
                    placeholder="Notes"
                    className="w-full min-w-[120px] rounded-md border border-lp-border bg-lp-surface px-2 py-1 text-lp-text placeholder:text-lp-text-tertiary focus:border-lp-orange focus:outline-none focus:ring-1 focus:ring-lp-orange"
                  />
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
