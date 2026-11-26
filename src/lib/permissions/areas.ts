/* ============================================
   LOWPASS — Tour access: areas, levels, presets (Nov 2026, Adam)

   THE list of what a workspace Member can be given on a tour. The
   database holds the same ten areas in the CHECK on
   `public.tour_access.area` (migration 292) — `areas.test.tsx` fails if
   the two drift. Design: docs/handover/PERMISSIONS_DESIGN_2026_11.md.

   Admins and managers are never looked up here: they can do everything
   on every tour. Only `readonly` members ("Member" on screen) are
   limited, and only by `tour_access` rows.
   ============================================ */

export const AREAS = [
  'advance',
  'production',
  'parking',
  'logistics',
  'files',
  'schedule',
  'budget',
  'receipts',
  'payroll',
  'income',
] as const;

export type Area = (typeof AREAS)[number];
export type Level = 'view' | 'edit';
export type AreaLevel = Level | 'none';

/** Area → level on one tour. Absent = none. */
export type TourAccess = Partial<Record<Area, Level>>;

export const AREA_LABELS: Record<Area, string> = {
  advance: 'Advance',
  production: 'Production',
  parking: 'Parking',
  logistics: 'Logistics',
  files: 'Files',
  schedule: 'Schedule',
  budget: 'Budget',
  receipts: 'Receipts',
  payroll: 'Payroll',
  income: 'Income',
};

export const AREA_HINTS: Record<Area, string> = {
  advance: 'Advance answers, info packs, venue asks, local crew calls',
  production: 'Riders, channel list, stage plot, tour gear',
  parking: 'Parking maps and driver links',
  logistics: 'Crew list, hotels & rooming, travel',
  files: 'Tour Files',
  schedule: 'Dates & routing',
  budget: 'Budget lines, sections, versions',
  receipts: 'Receipts and their files',
  payroll: 'Payroll and rate cards',
  income: 'Deals, income, settlements, commissions',
};

/** Areas that carry money — shown with a warning when granted. */
export const MONEY_AREAS: ReadonlySet<Area> = new Set(['budget', 'receipts', 'payroll', 'income']);

export function isArea(v: unknown): v is Area {
  return typeof v === 'string' && (AREAS as readonly string[]).includes(v);
}

export function isLevel(v: unknown): v is Level {
  return v === 'view' || v === 'edit';
}

/* ---------- Presets ---------- */

export const PRESETS = ['crew', 'production', 'accounts', 'tour_manager'] as const;
export type Preset = (typeof PRESETS)[number];

export const PRESET_LABELS: Record<Preset, string> = {
  crew: 'Crew',
  production: 'Production',
  accounts: 'Accounts',
  tour_manager: 'Tour manager',
};

export const PRESET_ACCESS: Record<Preset, TourAccess> = {
  crew: { schedule: 'view', advance: 'view', production: 'view', parking: 'view', files: 'view' },
  production: {
    schedule: 'edit',
    advance: 'edit',
    production: 'edit',
    parking: 'edit',
    files: 'edit',
    logistics: 'view',
  },
  accounts: { budget: 'edit', receipts: 'edit', payroll: 'edit', income: 'edit' },
  tour_manager: Object.fromEntries(AREAS.map((a) => [a, 'edit'])) as TourAccess,
};

/** The preset whose access equals `access` exactly, else null ("Custom"). */
export function presetFor(access: TourAccess): Preset | null {
  for (const p of PRESETS) {
    const want = PRESET_ACCESS[p];
    if (AREAS.every((a) => (want[a] ?? null) === (access[a] ?? null))) return p;
  }
  return null;
}

/* ---------- Combining rows ---------- */

export type TourAccessRow = { tour_id: string | null; area: string; level: string };

/** Effective access on one tour from a member's rows: the "all tours"
 *  row and the tour's own row combine, the higher level wins. Mirrors
 *  `private.tours_i_can` — never decide access from anything else. */
export function accessForTour(rows: readonly TourAccessRow[], tourId: string): TourAccess {
  const out: TourAccess = {};
  for (const r of rows) {
    if (r.tour_id !== null && r.tour_id !== tourId) continue;
    if (!isArea(r.area) || !isLevel(r.level)) continue;
    if (out[r.area] !== 'edit') out[r.area] = r.level;
  }
  return out;
}

export function can(access: TourAccess, area: Area, level: Level = 'view'): boolean {
  const have = access[area];
  if (!have) return false;
  return level === 'view' || have === 'edit';
}

export const FULL_ACCESS: TourAccess = PRESET_ACCESS.tour_manager;

/* ---------- Legacy page grants → areas (migration 292 copies these) ----------
   `permission_grants` resource ids (Sprint 9) and the area each now lives
   in. null = no tour area (artist / home pages: members see tour items
   only). The SQL in 292 uses the same table; the parity test checks it. */
export const LEGACY_RESOURCE_AREA: Record<string, Area | null> = {
  'home.dashboard': null,
  'artist.home': null,
  'artist.tours': null,
  'artist.contracts': null,
  'operations.routing': 'schedule',
  'operations.personnel': 'logistics',
  'operations.personnel.compensation': 'payroll',
  'operations.personnel.my_schedule': null,
  'operations.channel_list': 'production',
  'operations.stage_plot': 'production',
  'operations.payroll': 'payroll',
  'operations.rooming': 'logistics',
  'operations.files': 'files',
  'operations.riders': 'production',
  'budget.line_items': 'budget',
  'budget.receipts': 'receipts',
  'budget.payroll': 'payroll',
  'budget.deal_memos': 'income',
  'budget.commissions': 'income',
  'budget.summary': 'budget',
  advance: 'advance',
};

/* ---------- One line for the members list ---------- */

/** A member's tour access in one line, for their card on Team & roles:
 *  "All tours · Edit: Advance · View: Schedule, Production" — or "No tour
 *  access yet". Several tours are counted, not named (the panel lists them). */
export function summariseAccess(rows: readonly TourAccessRow[]): string {
  const valid = rows.filter((r) => isArea(r.area) && isLevel(r.level));
  if (!valid.length) return 'No tour access yet';
  const all = valid.some((r) => r.tour_id === null);
  const tourCount = new Set(valid.filter((r) => r.tour_id !== null).map((r) => r.tour_id)).size;
  const where = all ? 'All tours' : `${tourCount} ${tourCount === 1 ? 'tour' : 'tours'}`;
  const best = new Map<Area, Level>();
  for (const r of valid) {
    const a = r.area as Area;
    if (best.get(a) !== 'edit') best.set(a, r.level as Level);
  }
  const list = (level: Level) => AREAS.filter((a) => best.get(a) === level).map((a) => AREA_LABELS[a]);
  const edit = list('edit');
  const view = list('view');
  return [where, edit.length ? `Edit: ${edit.join(', ')}` : null, view.length ? `View: ${view.join(', ')}` : null].filter(Boolean).join(' · ');
}

/** A Tour manager's rows in one line — only WHICH tours matter (298: every
 *  area on them is edit, whatever the rows say). */
export function summariseTours(rows: readonly TourAccessRow[]): string {
  if (!rows.length) return 'No tours yet';
  if (rows.some((r) => r.tour_id === null)) return 'All tours · everything';
  const n = new Set(rows.map((r) => r.tour_id)).size;
  return `${n} ${n === 1 ? 'tour' : 'tours'} · everything`;
}
