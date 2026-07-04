'use client';

/* ============================================
   LOWPASS — <StandSelectCell> (Sprint 12 §8b1)

   Mic stand select. The §8 enum is Adam's actual touring
   inventory: LP CLAW (low-profile clamp), Short Boom, Tall
   Boom, Clip (drum/guitar clip mics), Talk Stand (vocalist
   mid-stage), or None.

   Empty value (`''`) maps to "None" semantically — same as
   the prior free-text "" default.
   ============================================ */

import { BrandedSelect } from '@/components/ui/BrandedSelect';

const STANDS = [
  { value: '',           label: '—' },
  { value: 'LP CLAW',    label: 'LP CLAW' },
  { value: 'Short Boom', label: 'Short Boom' },
  { value: 'Tall Boom',  label: 'Tall Boom' },
  { value: 'Clip',       label: 'Clip' },
  { value: 'Talk Stand', label: 'Talk Stand' },
  { value: 'None',       label: 'None' },
];

interface StandSelectCellProps {
  value: string;
  onChange: (v: string) => void;
  ariaLabel: string;
}

export function StandSelectCell({
  value,
  onChange,
  ariaLabel,
}: StandSelectCellProps) {
  return (
    <BrandedSelect
      value={value}
      onChange={onChange}
      options={STANDS}
      ariaLabel={ariaLabel}
      minWidth={0}
      size="sm"
      filterable
      className="w-full min-w-0"
      triggerClassName="min-h-8 w-full"
    />
  );
}
