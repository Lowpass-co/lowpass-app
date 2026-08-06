'use client';

/* ============================================
   LOWPASS — <CableLengthSelectCell> (Sprint 12 §8b1)

   Cable length select. The §8 enum is the touring stock-room
   spread: 6′ / 10′ / 15′ / 25′ / 50′ / 100′ / 150′ / 300′.

   Stored on `channel_list_rows.cable_length` (TEXT) so the
   options round-trip verbatim. Feeds the Cables inventory
   aggregate in §8b3.
   ============================================ */

import { BrandedSelect } from '@/components/ui/BrandedSelect';

const LENGTHS = [
  { value: '',     label: '—' },
  { value: "6'",   label: "6′" },
  { value: "10'",  label: "10′" },
  { value: "15'",  label: "15′" },
  { value: "25'",  label: "25′" },
  { value: "50'",  label: "50′" },
  { value: "100'", label: "100′" },
  { value: "150'", label: "150′" },
  { value: "300'", label: "300′" },
];

interface CableLengthSelectCellProps {
  value: string | null;
  onChange: (v: string | null) => void;
  ariaLabel: string;
  /** Forwarded to BrandedSelect — fired after a keyboard Enter
   *  commit so the channel grid can advance focus to the next
   *  cell (§8b4 keyboard-contract parity with the mic picker). */
  onEnterCommit?: () => void;
}

export function CableLengthSelectCell({
  value,
  onChange,
  ariaLabel,
  onEnterCommit,
}: CableLengthSelectCellProps) {
  return (
    <BrandedSelect
      value={value ?? ''}
      onChange={(v) => onChange(v === '' ? null : v)}
      options={LENGTHS}
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
