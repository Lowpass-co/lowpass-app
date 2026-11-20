/* ============================================
   LOWPASS — a hotel receipt → the hotel in Rooming (Nov 2026)

   Adam: "I added receipts and said they were hotels and they flowed into
   uncategorised … they should link to a day in the rooming I guess."

   Every hotel in Rooming already has ONE automatic budget line (its rooms ×
   nights, written by reconcileDerivedBudgetLines). A hotel receipt is the
   actual for that line, so it should attach there as a transaction — not
   become a new manual line beside it.

   Two ways to find the hotel, most certain first:
     1. NAME — the receipt's vendor names the hotel ("Hilton Garden Inn
        Nashville" ↔ "Hilton Garden Inn"): word containment either way, or a
        fuzzy score ≥ 0.6.
     2. DATE — the receipt is hotel-ish (category or a hotel word in the
        vendor) and its date falls inside exactly ONE hotel's stay
        (check-in … check-out, a day's grace either side for early / late
        bills). Two hotels on that date → no guess.

   Pure. Proposals only — the reviewer sees which hotel and why, and can
   change it before anything is written.
   ============================================ */

import { nameSimilarity } from '@/lib/import/dedupe';
import { aliasFor } from './receiptSection';

export interface HotelLine {
  lineId: string;
  name: string;
  city: string | null;
  /** YYYY-MM-DD; null when Rooming has no dates for it. */
  checkIn: string | null;
  checkOut: string | null;
}

export interface HotelMatch {
  lineId: string;
  reason: string;
  score: number;
}

const HOTEL_WORDS = ['hotel', 'inn', 'suites', 'lodge', 'motel', 'resort', 'hostel', 'marriott', 'hilton', 'hyatt', 'premier inn', 'travelodge', 'ibis', 'novotel', 'holiday inn', 'airbnb'];

function norm(s: string | null | undefined): string {
  return (s ?? '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

function wordsIn(haystack: string, needle: string): boolean {
  const words = new Set(norm(haystack).split(' ').filter(Boolean));
  const parts = norm(needle).split(' ').filter((w) => w.length > 1);
  return parts.length > 0 && parts.every((w) => words.has(w));
}

/** Does this receipt look like a hotel bill at all? */
export function isHotelReceipt(r: { category: string | null; vendor: string | null; description?: string | null }): boolean {
  if (r.category && aliasFor(r.category) === 'Hotels') return true;
  const text = ` ${norm([r.vendor, r.description].filter(Boolean).join(' '))} `;
  return HOTEL_WORDS.some((w) => text.includes(` ${w} `));
}

function addDays(day: string, n: number): string {
  const t = Date.parse(`${day}T00:00:00Z`) + n * 86_400_000;
  return new Date(t).toISOString().slice(0, 10);
}

export function matchHotel(
  r: { category: string | null; vendor: string | null; description?: string | null; date: string | null },
  hotels: HotelLine[],
): HotelMatch | null {
  if (!hotels.length) return null;
  const text = [r.vendor, r.description].filter(Boolean).join(' ');

  // 1. by name
  if (text.trim()) {
    let best: { h: HotelLine; score: number } | null = null;
    for (const h of hotels) {
      const contained = wordsIn(text, h.name) || (r.vendor ? wordsIn(h.name, r.vendor) : false);
      const score = contained ? 1 : nameSimilarity(norm(text), norm(h.name));
      if (!best || score > best.score) best = { h, score };
    }
    if (best && best.score >= 0.6) {
      return { lineId: best.h.lineId, score: 0.9, reason: `the hotel in Rooming: ${best.h.name}${best.h.city ? `, ${best.h.city}` : ''}` };
    }
  }

  // 2. by date — only for receipts that are plainly hotel bills
  if (!isHotelReceipt(r) || !r.date) return null;
  const day = r.date.slice(0, 10);
  const staying = hotels.filter(
    (h) => h.checkIn && h.checkOut && day >= addDays(h.checkIn, -1) && day <= addDays(h.checkOut, 1),
  );
  if (staying.length !== 1) return null;
  const h = staying[0];
  return {
    lineId: h.lineId,
    score: 0.6,
    reason: `you're at ${h.name}${h.city ? `, ${h.city}` : ''} on ${day} (Rooming)`,
  };
}
