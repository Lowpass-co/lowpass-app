/* The info-pack read's wait line and bar (PackFlow) — pure, tested. */

/** "About 30 s left" from how long reads usually take — never a fake
 *  countdown past it: then it says so. */
export function waitLine(startedAt: number, now: number, estimate: number | null): string {
  const est = estimate ?? 45;
  const elapsed = Math.max(0, Math.round((now - startedAt) / 1000));
  const left = est - elapsed;
  const fmt = (s: number) => (s < 60 ? `${s} s` : `${Math.round(s / 60)} min`);
  if (left > 0) return `About ${fmt(Math.max(5, Math.ceil(left / 5) * 5))} left`;
  return `Taking longer than usual (${fmt(elapsed)}) — still reading`;
}

/** The bar: parts read, nudged by time so it moves while parts run together. */
export function readPct(p: { done: number; total: number; startedAt: number }, now: number, estimate: number | null): number {
  const byParts = p.total ? p.done / p.total : 0;
  const byTime = Math.min(0.95, (now - p.startedAt) / 1000 / (estimate ?? 45));
  return Math.round(Math.max(4, Math.min(98, Math.max(byParts, byTime * 0.9) * 100)));
}
