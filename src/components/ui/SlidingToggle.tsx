/* ============================================
   LOWPASS — Sliding binary toggle

   Two options; orange pill slides to selected side.
   Spotify/Daysheets/Airtable style.
   ============================================ */

'use client';

import { cn } from '@/lib/utils';

export function SlidingToggle<T extends string>({
  value,
  onChange,
  options,
  labels,
  className,
}: {
  value: T;
  onChange: (v: T) => void;
  options: [T, T];
  /** Optional display labels; defaults to option values */
  labels?: [string, string];
  className?: string;
}) {
  const [left, right] = options;
  const [leftLabel, rightLabel] = labels ?? [left, right];
  const isLeft = value === left;

  return (
    <div
      role="group"
      aria-label="Toggle option"
      className={cn(
        'relative flex w-full rounded-xl border border-lp-border bg-lp-surface p-1',
        className
      )}
    >
      {/* Sliding pill — slides between left and right */}
      <div
        className="absolute top-1 bottom-1 w-[calc(50%-6px)] rounded-lg bg-lp-orange transition-[left] duration-200 ease-out"
        style={{ left: isLeft ? 4 : 'calc(50% + 2px)' }}
      />
      <button
        type="button"
        onClick={() => onChange(left)}
        className={cn(
          'relative z-10 flex flex-1 items-center justify-center rounded-lg py-2.5 text-sm font-medium transition-colors',
          isLeft ? 'text-white' : 'text-lp-text-secondary hover:text-lp-text'
        )}
      >
        {leftLabel}
      </button>
      <button
        type="button"
        onClick={() => onChange(right)}
        className={cn(
          'relative z-10 flex flex-1 items-center justify-center rounded-lg py-2.5 text-sm font-medium transition-colors',
          !isLeft ? 'text-white' : 'text-lp-text-secondary hover:text-lp-text'
        )}
      >
        {rightLabel}
      </button>
    </div>
  );
}
