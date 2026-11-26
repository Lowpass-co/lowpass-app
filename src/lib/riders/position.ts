/* ============================================
   LOWPASS — Riders: block order — pure

   A block's place is a fractional key (base-62 digits after an implied
   point): a new block between two others gets a key between theirs, so an
   insert or a move writes ONE row — never a renumbering that would clash
   with someone else editing the same rider. Keys sort as plain bytes, which
   is how the column is collated (migration 301, COLLATE "C").
   Keys never end in '0', so there is always room before any key.
   (After the midpoint scheme of the fractional-indexing library, MIT.)
   ============================================ */

const DIGITS = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz';
const ZERO = DIGITS[0];

function midpoint(a: string, b: string | null): string {
  if (b !== null && a >= b) throw new Error(`position: ${a} >= ${b}`);
  if (a.endsWith(ZERO) || (b && b.endsWith(ZERO))) throw new Error('position: trailing zero');
  if (b) {
    let n = 0;
    while ((a[n] ?? ZERO) === b[n]) n++;
    if (n > 0) return b.slice(0, n) + midpoint(a.slice(n), b.slice(n));
  }
  const da = a ? DIGITS.indexOf(a[0]) : 0;
  const db = b !== null ? DIGITS.indexOf(b[0]) : DIGITS.length;
  if (db - da > 1) return DIGITS[Math.round((da + db) / 2)];
  if (b && b.length > 1) return b.slice(0, 1);
  return DIGITS[da] + midpoint(a.slice(1), null);
}

export const isPositionKey = (k: unknown): k is string => typeof k === 'string' && /^[0-9A-Za-z]{1,64}$/.test(k) && !k.endsWith(ZERO);

/** A key strictly between a and b (null = the open end). */
export function keyBetween(a: string | null, b: string | null): string {
  return midpoint(a ?? '', b);
}

/** n keys between a and b, spread evenly (short keys for a whole document). */
export function keysBetween(a: string | null, b: string | null, n: number): string[] {
  if (n <= 0) return [];
  const mid = keyBetween(a, b);
  const left = Math.floor((n - 1) / 2);
  return [...keysBetween(a, mid, left), mid, ...keysBetween(mid, b, n - 1 - left)];
}

/** Document order: by key, then id (two people inserting at the same spot). */
export function byPosition<T extends { position: string; id: string }>(a: T, b: T): number {
  if (a.position !== b.position) return a.position < b.position ? -1 : 1;
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
}

/** The key for a block placed right after `sorted[index]` (index -1 = at the
 *  very top). Equal neighbouring keys (two people inserted at once) are
 *  stepped over, so this never throws. */
export function keyAfter(sorted: readonly { position: string }[], index: number): string {
  const prev = index >= 0 ? sorted[index]?.position ?? null : null;
  let next: string | null = null;
  for (let i = index + 1; i < sorted.length; i++) {
    if (prev === null || sorted[i].position > prev) {
      next = sorted[i].position;
      break;
    }
  }
  return keyBetween(prev, next);
}
