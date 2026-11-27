/* ============================================
   LOWPASS — what a money / % / count box shows and reads (Nov 2026, Adam)

   Adam: "the percentage isn't a percentage, currency isn't currency…
   percentage defaults to 0, it should just show a dash."

   A box shows its value FORMATTED when you're not in it ("US$4,500", "37%",
   "1,250") and the plain number while you type. Blank — and a 0 the
   database filled in for "not set" — shows the placeholder dash. Typing
   "$4,500", "4500", "37%" or "1 250" all read as the number.
   ============================================ */

export type AmountKind = 'money' | 'pct' | 'count';

/** Text → number. '' → null (cleared). Anything that isn't a number after
 *  dropping currency signs, letters, commas, spaces and % → 'invalid'. */
export function parseAmount(text: string): number | null | 'invalid' {
  const t = text.trim();
  if (t === '') return null;
  const negative = /^[-−(]/.test(t) || /^[A-Za-z£$€¥]*\s*[-−]/.test(t);
  const digits = t.replace(/[^0-9.]/g, '');
  if (digits === '' || digits === '.' || (digits.match(/\./g) ?? []).length > 1) return 'invalid';
  const n = Number(digits);
  if (!Number.isFinite(n)) return 'invalid';
  return negative ? -n : n;
}

/** True when the box should show its dash: null, or a 0 that means "not set". */
export function isBlankValue(v: number | null | undefined, zeroIsBlank: boolean): boolean {
  return v == null || !Number.isFinite(v) || (zeroIsBlank && v === 0);
}

/** The number as it reads at rest. */
export function formatAmount(v: number, kind: AmountKind, currency: string): string {
  if (kind === 'pct') return `${+v.toFixed(2)}%`;
  if (kind === 'count') return new Intl.NumberFormat('en-GB', { maximumFractionDigits: 2 }).format(v);
  const whole = Number.isInteger(v);
  try {
    return new Intl.NumberFormat('en-GB', {
      style: 'currency',
      currency: currency || 'GBP',
      minimumFractionDigits: whole ? 0 : 2,
      maximumFractionDigits: 2,
    }).format(v);
  } catch {
    return new Intl.NumberFormat('en-GB', { maximumFractionDigits: 2 }).format(v);
  }
}

/** The plain number shown while editing ("4500", "37.5"). */
export function editText(v: number | null | undefined, zeroIsBlank: boolean): string {
  return isBlankValue(v, zeroIsBlank) ? '' : String(+Number(v).toFixed(10));
}
