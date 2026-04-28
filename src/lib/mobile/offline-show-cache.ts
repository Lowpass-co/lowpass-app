/** Local persistence for mobile show/advance bundle (TTL 7 days). */

const PREFIX = 'lp:m-show-bundle:';

export type CachedShowBundle = {
  bundle: unknown;
  savedAt: number;
};

export function cacheShowBundle(tourId: string, routingId: string, bundle: unknown): void {
  try {
    const row: CachedShowBundle = { bundle, savedAt: Date.now() };
    localStorage.setItem(`${PREFIX}${tourId}:${routingId}`, JSON.stringify(row));
  } catch {
    /* quota */
  }
}

export function readShowBundleCache(tourId: string, routingId: string): unknown | null {
  try {
    const raw = localStorage.getItem(`${PREFIX}${tourId}:${routingId}`);
    if (!raw) return null;
    const row = JSON.parse(raw) as CachedShowBundle;
    const maxAge = 7 * 24 * 60 * 60 * 1000;
    if (Date.now() - row.savedAt > maxAge) {
      localStorage.removeItem(`${PREFIX}${tourId}:${routingId}`);
      return null;
    }
    return row.bundle;
  } catch {
    return null;
  }
}
