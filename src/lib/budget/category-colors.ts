/* ============================================
   LOWPASS — Budget category color map (Phase B §B3.1)

   One color per canonical Lowpass category. Drives the
   <CategoryChip> cell + dropdown render. Background +
   border tints are derived from the base color via
   color-mix() at the consumer (chip styles in the
   component) so the map here stays narrow.

   Backed by the --color-lp-cat-* tokens in globals.css —
   per the §B3 spec, all visual values via var(--lp-...).

   Legacy / unknown categories fall back to the misc token
   (gray-blue) plus the raw value displayed verbatim.
   ============================================ */

/** Canonical category set — keep in sync with the
 *  CATEGORY_OPTIONS list in BudgetLineSlideOver.tsx. */
export const CATEGORY_OPTIONS: ReadonlyArray<{
  value: string;
  label: string;
  /** CSS var name (without `var()` wrapper) for the base
   *  color. The chip wraps this in `color-mix()` to derive
   *  the muted background + border. */
  token: string;
}> = [
  { value: 'production', label: 'Production', token: '--color-lp-cat-production' },
  { value: 'logistics', label: 'Logistics', token: '--color-lp-cat-logistics' },
  { value: 'travel', label: 'Travel', token: '--color-lp-cat-travel' },
  { value: 'crew', label: 'Crew', token: '--color-lp-cat-crew' },
  { value: 'accommodation', label: 'Accommodation', token: '--color-lp-cat-accommodation' },
  { value: 'catering', label: 'Catering', token: '--color-lp-cat-catering' },
  { value: 'marketing', label: 'Marketing', token: '--color-lp-cat-marketing' },
  { value: 'insurance', label: 'Insurance', token: '--color-lp-cat-insurance' },
  { value: 'contingency', label: 'Contingency', token: '--color-lp-cat-contingency' },
  { value: 'misc', label: 'Misc', token: '--color-lp-cat-misc' },
];

const TOKEN_BY_VALUE = new Map(CATEGORY_OPTIONS.map((o) => [o.value, o.token]));
const LABEL_BY_VALUE = new Map(CATEGORY_OPTIONS.map((o) => [o.value, o.label]));

/** Resolve the CSS variable name for a category. Unknown
 *  values fall back to the misc token. */
export function categoryToken(value: string | null | undefined): string {
  const v = (value ?? '').toLowerCase();
  return TOKEN_BY_VALUE.get(v) ?? '--color-lp-cat-misc';
}

/** Display label for a category. Unknown values return the
 *  raw value (title-cased) so legacy rows still read
 *  cleanly. */
export function categoryLabel(value: string | null | undefined): string {
  const v = (value ?? '').toLowerCase();
  const known = LABEL_BY_VALUE.get(v);
  if (known) return known;
  if (!v) return 'Uncategorised';
  // Legacy / custom — title-case the raw value
  return v.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

/** True when the value is one of the canonical options.
 *  False for legacy/custom rows whose value pre-dates the
 *  canonical set. */
export function isKnownCategory(value: string | null | undefined): boolean {
  const v = (value ?? '').toLowerCase();
  return TOKEN_BY_VALUE.has(v);
}
