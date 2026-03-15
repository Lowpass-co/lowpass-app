/** localStorage key for recently visited budget tour ids (newest first, max RECENT_MAX) */
export const BUDGET_RECENT_KEY = 'lowpass_budget_recent_tours';
export const RECENT_MAX = 5;
export const RECENT_DISPLAY = 3;

export function loadRecentTourIds(): string[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = localStorage.getItem(BUDGET_RECENT_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((id): id is string => typeof id === 'string').slice(0, RECENT_MAX);
  } catch {
    return [];
  }
}

export function pushRecentTourId(tourId: string): void {
  if (typeof window === 'undefined') return;
  try {
    const prev = loadRecentTourIds();
    const next = [tourId, ...prev.filter((id) => id !== tourId)].slice(0, RECENT_MAX);
    localStorage.setItem(BUDGET_RECENT_KEY, JSON.stringify(next));
  } catch {
    // ignore
  }
}
