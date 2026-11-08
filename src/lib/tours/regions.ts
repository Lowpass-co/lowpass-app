/* ============================================
   LOWPASS — tour regions (Nov 2026)

   ONE list. New tour wrote 'UK' / 'EU' / 'US'…, while Edit tour offered
   'Europe' / 'North America'…, so editing a UK tour showed "—" and saving
   could write a value nothing else understands. Both editors read this.
   ============================================ */

export const REGION_OPTIONS: ReadonlyArray<{ value: string; label: string }> = [
  { value: 'UK', label: 'UK' },
  { value: 'EU', label: 'EU' },
  { value: 'US', label: 'US' },
  { value: 'AUS', label: 'AUS' },
  { value: 'ASIA', label: 'ASIA' },
  { value: 'GLOBAL', label: 'Global' },
  { value: 'OTHER', label: 'Other' },
];

/** The options, plus the tour's current value if it isn't one of them (an
 *  older tour saved as "Europe" still shows what it is). */
export function withCurrent<T extends { value: string; label: string }>(options: ReadonlyArray<T>, current: string | null | undefined): Array<{ value: string; label: string }> {
  const list: Array<{ value: string; label: string }> = [...options];
  if (current && !list.some((o) => o.value === current)) list.push({ value: current, label: current });
  return list;
}

export function regionLabel(value: string | null | undefined): string {
  if (!value) return '—';
  return REGION_OPTIONS.find((o) => o.value === value)?.label ?? value;
}
