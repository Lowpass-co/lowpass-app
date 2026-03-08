/* ============================================
   LOWPASS — Day Type Pills

   Horizontal row of pill buttons; multi-select.
   Selected: day type colour + ring-2 ring-lp-accent/50.
   ============================================ */

'use client';

import { getDayTypeLabel, getDayTypeColor, parseDayTypes } from '@/lib/utils';
import type { DayType } from '@/types';
import { cn } from '@/lib/utils';

const PRESET_DAY_TYPES: DayType[] = [
  'show',
  'off',
  'travel',
  'rehearsal',
  'press',
  'radio',
  'tv',
  'festival',
];

function serializeDayTypes(types: string[]): string {
  return types.filter(Boolean).join(', ');
}

export function DayTypePills({
  value,
  onChange,
  customTypes = [],
}: {
  value: string;
  onChange: (value: string) => void;
  customTypes?: string[];
}) {
  const selected = parseDayTypes(value);
  const allTypes = [...PRESET_DAY_TYPES, ...customTypes.filter((c) => !PRESET_DAY_TYPES.includes(c as DayType))];

  const toggle = (type: string) => {
    const next = selected.includes(type)
      ? selected.filter((t) => t !== type)
      : [...selected, type];
    onChange(serializeDayTypes(next));
  };

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {allTypes.map((type) => {
        const isSelected = selected.includes(type);
        const colors = getDayTypeColor(type);
        return (
          <button
            key={type}
            type="button"
            onClick={() => toggle(type)}
            className={cn(
              'rounded-full px-3 py-1 text-xs font-medium cursor-pointer transition-all duration-200',
              isSelected
                ? [colors.bg, colors.text, 'ring-2 ring-lp-accent/50 border-transparent']
                : 'bg-lp-surface-hover text-lp-text-secondary border border-lp-border hover:border-lp-border-light'
            )}
            style={{ transitionTimingFunction: 'cubic-bezier(0.4, 0, 0.2, 1)' }}
          >
            {getDayTypeLabel(type)}
          </button>
        );
      })}
    </div>
  );
}
