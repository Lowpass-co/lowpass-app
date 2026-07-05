/* ============================================
   LOWPASS — last-product-used per tour (Nav & entry fixpack, item 1)

   A tour has three product surfaces (Operations / Budget / Advance). When a
   user re-opens a tour we want to land on the one they last worked in rather
   than hardwiring Budget. ProductShell records the current product on mount
   (<RememberTourProduct>); the openTour() call site + the workspace "Resume"
   button read it here to resolve the href, falling back to Operations for a
   never-visited tour.

   localStorage-backed + client-only — every accessor guards `window` so this
   module is safe to import from server components (the functions simply no-op
   / return the fallback during SSR).
   ============================================ */

export const TOUR_PRODUCTS = ['operations', 'budget', 'advance'] as const;
export type TourProduct = (typeof TOUR_PRODUCTS)[number];

const storageKey = (tourId: string) => `lp:lastProduct:${tourId}`;

function isTourProduct(v: unknown): v is TourProduct {
  return typeof v === 'string' && (TOUR_PRODUCTS as readonly string[]).includes(v);
}

/** Persist the product a tour was last opened in. No-op on the server. */
export function rememberTourProduct(tourId: string, product: TourProduct): void {
  if (typeof window === 'undefined' || !tourId) return;
  try {
    window.localStorage.setItem(storageKey(tourId), product);
  } catch {
    /* private-mode / quota — remembering is best-effort */
  }
}

/** The product a tour was last opened in, or null if unknown / server-side. */
export function getRememberedProduct(tourId: string): TourProduct | null {
  if (typeof window === 'undefined' || !tourId) return null;
  try {
    const v = window.localStorage.getItem(storageKey(tourId));
    return isTourProduct(v) ? v : null;
  } catch {
    return null;
  }
}

/** Href to open a tour on its last-used product; `fallback` (default
 *  Operations) when nothing is remembered or on the server. */
export function tourHref(tourId: string, fallback: TourProduct = 'operations'): string {
  const product = getRememberedProduct(tourId) ?? fallback;
  return `/${product}/${tourId}`;
}
