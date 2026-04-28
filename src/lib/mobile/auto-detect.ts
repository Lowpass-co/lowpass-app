import { countryToCurrency } from '@/lib/mobile/country-currency';

/** Mirrors `TourRoutingLiteRow` — avoids importing client context from lib. */
export type RoutingDayLite = {
  id: string;
  date: string;
  city: string;
  venue_name: string | null;
};

export type AutoDetectResult = {
  routingId: string | null;
  city: string | null;
  country: string | null;
  currency: string;
};

/** YYYY-MM-DD in local calendar (browser). */
export function localTodayIso(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function addDaysIso(iso: string, delta: number): string {
  const [y, m, d] = iso.split('-').map(Number);
  const dt = new Date(y, m - 1, d + delta);
  const yy = dt.getFullYear();
  const mm = String(dt.getMonth() + 1).padStart(2, '0');
  const dd = String(dt.getDate()).padStart(2, '0');
  return `${yy}-${mm}-${dd}`;
}

/**
 * Finds routing row for `dateIso`, or closest within ±7 days.
 */
export function routingForTourDate(rows: RoutingDayLite[], dateIso: string): RoutingDayLite | null {
  const exact = rows.find((r) => r.date === dateIso);
  if (exact) return exact;
  const target = new Date(`${dateIso}T12:00:00`).getTime();
  let best: RoutingDayLite | null = null;
  let bestDiff = Infinity;
  for (const r of rows) {
    const ts = new Date(`${r.date}T12:00:00`).getTime();
    const diff = Math.abs(ts - target);
    if (diff < bestDiff) {
      bestDiff = diff;
      best = r;
    }
  }
  if (!best || bestDiff > 7 * 86400000) return null;
  return best;
}

function guessCountryFromCity(cityRaw: string | null): string | null {
  if (!cityRaw) return null;
  const c = cityRaw.toLowerCase();
  if (/london|manchester|birmingham|glasgow/.test(c)) return 'GB';
  if (/new york|los angeles|chicago|nashville/.test(c)) return 'US';
  if (/paris|lyon/.test(c)) return 'FR';
  if (/berlin|munich|hamburg/.test(c)) return 'DE';
  return null;
}

export function autoDetectForDate(
  rows: RoutingDayLite[],
  dateIso: string,
  tourDefaultCurrency: string,
  lastSubmitted?: { city: string | null; country: string | null; currency: string } | null
): AutoDetectResult {
  const row = routingForTourDate(rows, dateIso);
  const city = row?.city?.trim() || lastSubmitted?.city?.trim() || null;
  const countryGuess = guessCountryFromCity(city);
  const country = countryGuess || lastSubmitted?.country?.trim() || null;
  const fromMap = countryToCurrency(country);
  const currency =
    fromMap ?? lastSubmitted?.currency ?? tourDefaultCurrency ?? 'GBP';

  return {
    routingId: row?.id ?? null,
    city: city || null,
    country,
    currency,
  };
}

export { addDaysIso };
