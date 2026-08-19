/* ============================================
   LOWPASS — Rate-lines model (canonical flat-seven, migration 261)

   PURE bridge between the DB (rate_types + personnel_rate_lines) and the fee
   engine (fees.ts computeTotals). A person's total is computed over their
   RateLines, each = one personnel_rate_lines row married to its rate_type's
   bucket / basis / day_statuses.

   ADAM'S CANONICAL MODEL (2026-08-07): the grid is a FLAT set of always-
   editable rate columns — no per-person rate_type gating, no custom types.
     Flat day (a6) · Flat tour (a7) · Show (a1) · Travel (a2) · Rehearsal (a3)
     · Press/Radio (a9) · Per diem (a4) · Advance (a5)
   Every filled rate bills independently (sum). Weekly (a8) and custom
   workspace types are no longer loaded — their rows stay in the DB but do
   not bill (see CANONICAL_RATE_TYPE_IDS + the loader filters).

   PRESS/RADIO FALLBACK (the Dillon ruling, kept as the default): a
   promo_radio day bills the person's Press/Radio rate when one is set,
   otherwise their SHOW rate. resolvePersonLines() is the ONE place that
   resolution happens — every reader (client grids, server money paths, the
   node harness) must build lines through it.

   No 'use client', no supabase — server + client + the node harness all
   import it.
   ============================================ */

import type { DayStatus, RateBucket, RateBasis, RateLine, RateLike } from './fees';

/** The rate_types row shape this model needs (bucket / basis / day_statuses). */
export interface RateTypeMeta {
  id: string;
  name: string;
  bucket: RateBucket;
  basis: RateBasis;
  dayStatuses: DayStatus[];
  orderIndex: number;
}

/** The seeded defaults (migrations 228/229/242/261, fixed ids a1–a9). */
export const DEFAULT_RATE_TYPE_IDS = {
  show: '00000000-0000-0000-0000-0000000000a1',
  offTravel: '00000000-0000-0000-0000-0000000000a2',
  rehearsal: '00000000-0000-0000-0000-0000000000a3',
  perDiem: '00000000-0000-0000-0000-0000000000a4',
  advance: '00000000-0000-0000-0000-0000000000a5',
  /** Migration 229's Day rate — renamed 'Flat day' by 261. Same id, same basis. */
  dayRate: '00000000-0000-0000-0000-0000000000a6',
  flatTour: '00000000-0000-0000-0000-0000000000a7',
  /** Legacy Weekly (242) — NOT in the canonical set; kept for reference only. */
  weekly: '00000000-0000-0000-0000-0000000000a8',
  /** Press / Radio (261). */
  pressRadio: '00000000-0000-0000-0000-0000000000a9',
} as const;

/** The canonical loadable set, in Adam's display order. Weekly (a8) and
 *  custom workspace types are deliberately absent — filtering the catalog to
 *  this list is what retires them (reversible: their DB rows are untouched). */
export const CANONICAL_RATE_TYPE_IDS: string[] = [
  DEFAULT_RATE_TYPE_IDS.dayRate,     // Flat day
  DEFAULT_RATE_TYPE_IDS.flatTour,    // Flat tour
  DEFAULT_RATE_TYPE_IDS.show,        // Show
  DEFAULT_RATE_TYPE_IDS.offTravel,   // Travel
  DEFAULT_RATE_TYPE_IDS.rehearsal,   // Rehearsal
  DEFAULT_RATE_TYPE_IDS.pressRadio,  // Press / Radio
  DEFAULT_RATE_TYPE_IDS.perDiem,     // Per diem
  DEFAULT_RATE_TYPE_IDS.advance,     // Advance
];

/** Display order index for a canonical type id (grid column order). */
export function canonicalOrderOf(typeId: string): number {
  const i = CANONICAL_RATE_TYPE_IDS.indexOf(typeId);
  return i === -1 ? Number.MAX_SAFE_INTEGER : i;
}

/** The canonical catalog as code (mirrors the 228/229/242/261 seeds). Used by
 *  the harness + as the client-side fallback ordering; the DB rows are the
 *  runtime truth. */
export const DEFAULT_RATE_TYPES: RateTypeMeta[] = [
  { id: DEFAULT_RATE_TYPE_IDS.dayRate, name: 'Flat day', bucket: 'fee', basis: 'per_active_day', dayStatuses: [], orderIndex: 0 },
  { id: DEFAULT_RATE_TYPE_IDS.flatTour, name: 'Flat tour', bucket: 'fee', basis: 'flat_once', dayStatuses: [], orderIndex: 1 },
  { id: DEFAULT_RATE_TYPE_IDS.show, name: 'Show', bucket: 'fee', basis: 'per_day_status', dayStatuses: ['show'], orderIndex: 2 },
  // Travel bills travel days (both spellings) AND painted Off days — Adam:
  // "OFF should pay travel rate". Buckets are disjoint, so no double-billing.
  { id: DEFAULT_RATE_TYPE_IDS.offTravel, name: 'Travel', bucket: 'fee', basis: 'per_day_status', dayStatuses: ['off_travel', 'travel', 'off'], orderIndex: 3 },
  { id: DEFAULT_RATE_TYPE_IDS.rehearsal, name: 'Rehearsal', bucket: 'fee', basis: 'per_day_status', dayStatuses: ['rehearsal'], orderIndex: 4 },
  { id: DEFAULT_RATE_TYPE_IDS.pressRadio, name: 'Press / Radio', bucket: 'fee', basis: 'per_day_status', dayStatuses: ['promo_radio'], orderIndex: 5 },
  { id: DEFAULT_RATE_TYPE_IDS.perDiem, name: 'Per diem', bucket: 'per_diem', basis: 'per_assigned_day', dayStatuses: [], orderIndex: 6 },
  { id: DEFAULT_RATE_TYPE_IDS.advance, name: 'Advance', bucket: 'fee', basis: 'flat_once', dayStatuses: [], orderIndex: 7 },
];

/** One personnel_rate_lines row: which type + the amount. */
export interface RateLineRow {
  rate_type_id: string;
  amount: number | string | null;
}

/** Marry a rate_type's meta to an amount → an engine RateLine. */
export function toRateLine(meta: RateTypeMeta, amount: number | string | null): RateLine {
  return {
    bucket: meta.bucket,
    basis: meta.basis,
    amount,
    dayStatuses: meta.dayStatuses,
  };
}

const num = (v: unknown): number => Number(v) || 0;

/** Build a person's RateLines from their personnel_rate_lines rows + the
 *  rate_type catalog, THEN apply the per-person resolutions the canonical
 *  model requires. This is the ONE line-assembly path — client grids, server
 *  money readers and the node harness all come through here so they can
 *  never disagree.
 *
 *  Resolutions applied:
 *   1. PRESS/RADIO FALLBACK — when the person's Press/Radio amount is 0 (or
 *      absent), promo_radio days bill their SHOW rate instead: the Show
 *      line's dayStatuses gains 'promo_radio' and the empty a9 line drops.
 *      When a Press/Radio amount IS set, the two lines stay separate.
 *  Rows whose type isn't in the catalog are skipped (this is also what
 *  retires Weekly + custom types once the loaders filter the catalog). */
export function resolvePersonLines(rows: RateLineRow[], types: RateTypeMeta[]): RateLine[] {
  const metaById = new Map(types.map((t) => [t.id, t]));
  const amountByType = new Map(rows.map((r) => [r.rate_type_id, r.amount]));

  const pressAmount = num(amountByType.get(DEFAULT_RATE_TYPE_IDS.pressRadio));
  const pressFallsToShow = pressAmount === 0 && metaById.has(DEFAULT_RATE_TYPE_IDS.show);

  return [...types]
    .sort((a, b) => a.orderIndex - b.orderIndex)
    .filter((t) => amountByType.has(t.id))
    .filter((t) => !(pressFallsToShow && t.id === DEFAULT_RATE_TYPE_IDS.pressRadio))
    .map((t) => {
      const line = toRateLine(metaById.get(t.id)!, amountByType.get(t.id) ?? 0);
      if (pressFallsToShow && t.id === DEFAULT_RATE_TYPE_IDS.show) {
        return { ...line, dayStatuses: [...(line.dayStatuses ?? []), 'promo_radio' as DayStatus] };
      }
      return line;
    });
}

/** Back-compat alias — every caller now gets the resolved lines. */
export function buildRateLines(rows: RateLineRow[], types: RateTypeMeta[]): RateLine[] {
  return resolvePersonLines(rows, types);
}

/** Does this person have the Flat-day + specific-day-rate CONFLICT Adam asked
 *  the grid to warn on? (Both still bill — sum — but the row gets flagged.) */
export function hasStackingConflict(amountFor: (typeId: string) => number): boolean {
  const flatDay = amountFor(DEFAULT_RATE_TYPE_IDS.dayRate);
  if (flatDay === 0) return false;
  return (
    amountFor(DEFAULT_RATE_TYPE_IDS.show) !== 0 ||
    amountFor(DEFAULT_RATE_TYPE_IDS.offTravel) !== 0 ||
    amountFor(DEFAULT_RATE_TYPE_IDS.rehearsal) !== 0 ||
    amountFor(DEFAULT_RATE_TYPE_IDS.pressRadio) !== 0
  );
}

/** The legacy rate columns expressed as rate-line ROWS against the CANONICAL
 *  type ids. This is the M-1a bridge: it lets the server's transitional
 *  fallback build its lines through the SAME catalog metas the client uses,
 *  instead of `ratesToLines`' hand-rolled ones.
 *
 *  Why that mattered. `ratesToLines` bills per-diem `per_active_day` and gives
 *  Travel only `['off_travel']`. The canonical catalog bills per-diem
 *  `per_assigned_day` and gives Travel `['off_travel','travel','off']`. So a
 *  card with no `personnel_rate_lines` rows counted `off` and `pd_only` days
 *  DIFFERENTLY from every other card on the same tour, silently, in the budget
 *  only — the payroll page synthesises zeros for such a card and displays £0.
 *
 *  For LEGACY data the two are identical (no 'off' or 'pd_only' days exist, so
 *  active == assigned and the extra Travel statuses never fire) — that is the
 *  money invariant, pinned in reconcile.harness.ts. */
export function legacyRowsToCanonicalRows(
  rate: RateLike,
  advanceFee: number | string | null = 0,
): RateLineRow[] {
  return [
    { rate_type_id: DEFAULT_RATE_TYPE_IDS.show, amount: rate.show_rate ?? 0 },
    { rate_type_id: DEFAULT_RATE_TYPE_IDS.offTravel, amount: rate.off_rate ?? 0 },
    { rate_type_id: DEFAULT_RATE_TYPE_IDS.rehearsal, amount: rate.rehearsal_rate ?? 0 },
    { rate_type_id: DEFAULT_RATE_TYPE_IDS.perDiem, amount: rate.per_diem ?? 0 },
    { rate_type_id: DEFAULT_RATE_TYPE_IDS.advance, amount: advanceFee ?? 0 },
  ];
}

/** THE server-side fallback body, as a pure function: a card's legacy columns
 *  → RateLines through the canonical catalog. `rateLinesFor` calls exactly this
 *  when a person has no `personnel_rate_lines` rows.
 *
 *  It lives HERE rather than inline in `loadRateLines.ts` for one reason: the
 *  node harness cannot import `loadRateLines.ts` (it carries an extensionless
 *  value import that `--experimental-strip-types` will not resolve), and a
 *  fallback nothing can pin is how M-1a stayed invisible in the first place. */
export function linesFromLegacyCard(
  rate: RateLike,
  advanceFee: number | string | null,
  types: RateTypeMeta[],
): RateLine[] {
  return resolvePersonLines(legacyRowsToCanonicalRows(rate, advanceFee), types);
}

/** Reference: build the five DEFAULT lines directly from the legacy column
 *  values. Used by the reconciliation gate — proving this equals
 *  ratesToLines(rate, advance) means switching the read source moves no money.
 *  (Uses the legacy metas: per diem per_active_day, off_travel only — this is
 *  the LEGACY equivalence proof, deliberately frozen.) */
export function defaultLinesFromLegacy(rate: RateLike, advanceFee: number | string | null = 0): RateLine[] {
  const legacyMetas: RateTypeMeta[] = [
    { id: DEFAULT_RATE_TYPE_IDS.show, name: 'Show', bucket: 'fee', basis: 'per_day_status', dayStatuses: ['show'], orderIndex: 0 },
    { id: DEFAULT_RATE_TYPE_IDS.offTravel, name: 'Off / Travel', bucket: 'fee', basis: 'per_day_status', dayStatuses: ['off_travel'], orderIndex: 1 },
    { id: DEFAULT_RATE_TYPE_IDS.rehearsal, name: 'Rehearsal', bucket: 'fee', basis: 'per_day_status', dayStatuses: ['rehearsal'], orderIndex: 2 },
    { id: DEFAULT_RATE_TYPE_IDS.perDiem, name: 'Per diem', bucket: 'per_diem', basis: 'per_active_day', dayStatuses: [], orderIndex: 3 },
    { id: DEFAULT_RATE_TYPE_IDS.advance, name: 'Advance', bucket: 'fee', basis: 'flat_once', dayStatuses: [], orderIndex: 4 },
  ];
  const amountFor = (id: string): number | string | null => {
    switch (id) {
      case DEFAULT_RATE_TYPE_IDS.show: return rate.show_rate ?? 0;
      case DEFAULT_RATE_TYPE_IDS.offTravel: return rate.off_rate ?? 0;
      case DEFAULT_RATE_TYPE_IDS.rehearsal: return rate.rehearsal_rate ?? 0;
      case DEFAULT_RATE_TYPE_IDS.perDiem: return rate.per_diem ?? 0;
      case DEFAULT_RATE_TYPE_IDS.advance: return advanceFee ?? 0;
      default: return 0;
    }
  };
  const rows: RateLineRow[] = legacyMetas.map((t) => ({ rate_type_id: t.id, amount: amountFor(t.id) }));
  return resolvePersonLines(rows, legacyMetas);
}
