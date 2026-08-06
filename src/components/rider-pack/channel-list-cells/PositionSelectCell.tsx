'use client';

/* ============================================
   LOWPASS — <PositionSelectCell> (Sprint 12 §8b1)

   Stage-position select with the Sprint 12 §8 enum. Replaces
   the prior free-text + datalist input on the channel list
   editor.

   Empty value (`''`) renders as "—" (none) — common enough
   in early drafts that forcing a position would slow Adam
   down.
   ============================================ */

import { BrandedSelect } from '@/components/ui/BrandedSelect';

const POSITIONS = [
  { value: '', label: '—' },
  { value: 'USL', label: 'USL' },
  { value: 'USR', label: 'USR' },
  { value: 'USC', label: 'USC' },
  { value: 'DSC', label: 'DSC' },
  { value: 'DSL', label: 'DSL' },
  { value: 'DSR', label: 'DSR' },
  { value: 'OSL', label: 'OSL' },
  { value: 'OSR', label: 'OSR' },
  { value: 'SL',  label: 'SL'  },
  { value: 'SR',  label: 'SR'  },
  { value: 'C',   label: 'C'   },
];

interface PositionSelectCellProps {
  value: string;
  onChange: (v: string) => void;
  ariaLabel: string;
  /** Forwarded to BrandedSelect — fired after a keyboard Enter
   *  commit so the channel grid can advance focus to the next
   *  cell (§8b4 keyboard-contract parity with the mic picker). */
  onEnterCommit?: () => void;
}

export function PositionSelectCell({
  value,
  onChange,
  ariaLabel,
  onEnterCommit,
}: PositionSelectCellProps) {
  return (
    <BrandedSelect
      value={value}
      onChange={onChange}
      options={POSITIONS}
      ariaLabel={ariaLabel}
      onEnterCommit={onEnterCommit}
      minWidth={0}
      size="sm"
      filterable
      className="w-full min-w-0"
      triggerClassName="min-h-8 w-full"
    />
  );
}
