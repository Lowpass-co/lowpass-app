'use client';

/* ============================================
   LOWPASS — <MicDiSelectCell> (Sprint 12 §8b1)

   Combined Mic + DI picker. Replaces the prior separate
   Mic and DI / cable columns. The mic_library entry's
   `type` ('dynamic' | 'condenser' | 'ribbon' | 'di_active'
   | 'di_passive') drives a small KIND BADGE rendered
   next to the trigger label so Adam can scan the column
   without expanding.

   onPick fires with the selected MicLibraryEntry (or null
   if cleared), letting the parent row read
   `default_phantom` and auto-fill the Phantom column. The
   parent should also flash-animate the Phantom cell so
   the auto-fill is visible.

   Empty value renders as "—" (none) — early-draft rows
   often have a name but no mic yet.

   This is a thin wrapper over BrandedSelect; the spec asks
   for a "mic_library autocomplete" but the existing
   BrandedSelect already does ArrowUp/Down + Enter + Esc
   keyboard nav. Type-ahead is the only missing piece;
   landing in §8b2 alongside the cross-cell keyboard nav
   matrix.
   ============================================ */

import type { MicLibraryEntry } from '@/lib/rider-packs/types';
import { BrandedSelect, type BrandedSelectOption } from '@/components/ui/BrandedSelect';

const KIND_BADGE: Record<MicLibraryEntry['type'], { label: string; tone: string }> = {
  dynamic:    { label: 'DYN', tone: 'var(--lp-text-secondary)' },
  condenser:  { label: 'CON', tone: 'var(--color-lp-orange)' },
  ribbon:     { label: 'RIB', tone: 'var(--lp-text-secondary)' },
  di_active:  { label: 'DI+', tone: 'var(--color-lp-orange)' },
  di_passive: { label: 'DI',  tone: 'var(--lp-text-secondary)' },
};

interface MicDiSelectCellProps {
  value: string;
  mics: MicLibraryEntry[];
  onPick: (entry: MicLibraryEntry | null, rawName: string) => void;
  ariaLabel: string;
}

export function MicDiSelectCell({
  value,
  mics,
  onPick,
  ariaLabel,
}: MicDiSelectCellProps) {
  /* Build options from the library. Each option's label
     prepends a tone-coded kind tag so Adam can scan
     dynamic vs condenser vs DI at a glance. */
  const options: BrandedSelectOption[] = [
    { value: '', label: '—' },
    ...mics.map((m) => ({
      value: m.name,
      label: `[${KIND_BADGE[m.type].label}] ${m.name}`,
    })),
  ];

  /* If the row already carries a free-text mic that isn't in
     the library (legacy data or workspace-specific custom),
     surface it so the picker doesn't show empty. */
  const trimmed = value.trim();
  const inLibrary = trimmed === '' || mics.some((m) => m.name === trimmed);
  if (!inLibrary) {
    options.splice(1, 0, { value: trimmed, label: `${trimmed} (custom)` });
  }

  const currentEntry = mics.find((m) => m.name === value) ?? null;
  const badge = currentEntry ? KIND_BADGE[currentEntry.type] : null;

  return (
    <div className="flex items-center gap-1 min-w-0">
      {badge ? (
        <span
          aria-hidden
          className="shrink-0 inline-flex items-center justify-center rounded"
          style={{
            padding: '1px 4px',
            fontSize: '9px',
            fontWeight: 700,
            letterSpacing: '0.04em',
            color: 'var(--lp-text-inverse)',
            background: badge.tone,
            minWidth: 22,
            textAlign: 'center',
          }}
        >
          {badge.label}
        </span>
      ) : null}
      <div className="min-w-0 flex-1">
        <BrandedSelect
          value={value}
          onChange={(v) => {
            const picked = mics.find((m) => m.name === v) ?? null;
            onPick(picked, v);
          }}
          options={options}
          ariaLabel={ariaLabel}
          minWidth={0}
          size="sm"
          className="w-full min-w-0"
          triggerClassName="min-h-8 w-full"
          /* Sprint 12 §8b4 — type-to-filter mode. The mic
             library is ~100 entries; jump-to-match makes
             reaching Sennheiser past 17 Shure rows tedious.
             All other BrandedSelect mounts stay on the
             default (filterable=false). */
          filterable
        />
      </div>
    </div>
  );
}
