/* ============================================
   LOWPASS — Budget dashboard config (P&L brick dashboard, Phase 1 — #29)

   The Summary tab is now a set of discrete, typed BRICKS the user can show/hide
   and reorder (mirrors the export template-builder section model). Phase 1 keeps
   the config IN-MEMORY (no DB) and the DEFAULT layout reproduces today's Summary
   byte-for-byte (same bricks, same order, all shown) — so nothing changes on load.
   Persistence is deferred to Phase 2.

   Pure (no I/O / no React) so the default-unchanged + normalize invariants are
   node-testable.
   ============================================ */

export type DashboardBrickId =
  | 'overview'
  | 'pnl'
  | 'sections'
  | 'variance'
  | 'top-spend'
  | 'activity';

export interface DashboardBrickConfig {
  id: DashboardBrickId;
  show: boolean;
}

export interface DashboardConfig {
  v: 1;
  bricks: DashboardBrickConfig[];
}

/** Canonical order = today's Summary, top → bottom. The DEFAULT renders exactly
 *  this, all shown — "default = unchanged". */
export const DASHBOARD_BRICK_ORDER: readonly DashboardBrickId[] = [
  'overview',
  'pnl',
  'sections',
  'variance',
  'top-spend',
  'activity',
] as const;

export const DASHBOARD_BRICK_LABELS: Record<DashboardBrickId, string> = {
  overview: 'Charts (allocation + burn rate)',
  pnl: 'P&L (net · gross income · total expenses)',
  sections: 'Section summary (expense by section)',
  variance: 'Variance (over / under budget)',
  'top-spend': 'Top spend categories',
  activity: 'Recent activity',
};

export const DEFAULT_DASHBOARD_CONFIG: DashboardConfig = {
  v: 1,
  bricks: DASHBOARD_BRICK_ORDER.map((id) => ({ id, show: true })),
};

const KNOWN = new Set<DashboardBrickId>(DASHBOARD_BRICK_ORDER);

/** Coerce an arbitrary / persisted value into a valid config: keep known bricks in
 *  the saved order, drop unknown ids, and APPEND any brick missing from the saved
 *  set (in canonical order, shown) so a new brick added in code shows up for users
 *  with an older saved layout. Mirrors the export normalizeConfig contract. */
export function normalizeDashboardConfig(raw: unknown): DashboardConfig {
  const seen = new Set<DashboardBrickId>();
  const bricks: DashboardBrickConfig[] = [];
  const rawBricks =
    raw && typeof raw === 'object' && Array.isArray((raw as { bricks?: unknown }).bricks)
      ? ((raw as { bricks: unknown[] }).bricks)
      : [];
  for (const b of rawBricks) {
    if (!b || typeof b !== 'object') continue;
    const id = (b as { id?: unknown }).id as DashboardBrickId;
    if (!KNOWN.has(id) || seen.has(id)) continue;
    seen.add(id);
    bricks.push({ id, show: (b as { show?: unknown }).show !== false });
  }
  // Append any brick the saved layout didn't mention, in canonical order.
  for (const id of DASHBOARD_BRICK_ORDER) {
    if (!seen.has(id)) bricks.push({ id, show: true });
  }
  return { v: 1, bricks };
}
