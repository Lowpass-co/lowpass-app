/* ============================================
   LOWPASS — Derived budget lines: the PLAN (pure, no I/O)

   Every automatic budget line — hotels, salaries, per diems, flights, gear
   hire — is a cached copy of a number whose owner lives in Operations. This
   module decides, for one family of those lines, what the cache must become.
   It does no I/O, so the rules below are pinned by tests rather than by hope.

   THE RULES (money repair, Oct 2026 — each one closes an audited leak):

   1. ONE LINE PER SOURCE. If the cache holds two lines for the same source
      (the old race between screens), the line with the most receipts survives
      and the others are MERGED into it — their transactions, notes,
      attachments and receipt links move across before they are removed.
      Nothing attached to a duplicate is ever dropped.

   2. RECEIPTS WIN THE ACTUAL. A line's actual is, in order:
        the user's explicit override  → left alone
        the sum of its transactions   → when it has any
        the computed source total     → otherwise
      The old reconcile wrote the computed total over the actual on every pass,
      erasing whatever receipts had set.

   3. A SOURCE THAT DISAPPEARS NEVER TAKES MONEY WITH IT. When a hotel /
      person / flight / gear row goes away:
        - a line with no transactions on a DRAFT budget is deleted;
        - anything else (receipts attached, an override, or an APPROVED budget
          whose baseline is frozen) is DETACHED: it becomes an ordinary manual
          line, editable and deletable by hand, with its spend intact.
      Previously the line was deleted — and transactions cascade on delete, so
      the receipts went with it.

   4. AN APPROVED BUDGET'S BASELINE IS FROZEN. On a locked version only the
      actual moves; proposed, label, section and currency are never written.

   5. NO WRITE WITHOUT A CHANGE. Updates are emitted only when a value differs
      at cent precision, so a reconcile with nothing to do performs no writes
      (the old pass rewrote every derived line on every page load).
   ============================================ */

export const DERIVED_FAMILIES = [
  'hotel_booking',
  'payroll',
  'payroll_per_diem',
  'flight',
  'gear',
] as const;
export type DerivedFamily = (typeof DERIVED_FAMILIES)[number];

/** The FK columns a derived line may carry back to its source. */
export const DERIVED_LINK_COLUMNS = ['hotel_id', 'flight_id', 'gear_id', 'tour_gear_id'] as const;
export type DerivedLinkColumn = (typeof DERIVED_LINK_COLUMNS)[number];
export type DerivedLinks = Partial<Record<DerivedLinkColumn, string | null>>;

/** What the source says a line should be. */
export interface DesiredLine {
  sourceId: string;
  label: string;
  /** Total in `currency`. */
  total: number;
  /** ISO code; null = the tour currency. */
  currency: string | null;
  category: string;
  legacySection: string;
  sectionId: string | null;
  quantity?: number;
  links?: DerivedLinks;
}

/** The cached line as it sits in budget_line_items. */
export interface ExistingLine {
  id: string;
  source_entity_id: string | null;
  label: string | null;
  category?: string | null;
  proposed_cost: number | string | null;
  actual_cost: number | string | null;
  actual_cost_override?: boolean | null;
  currency: string | null;
  section_id: string | null;
  quantity?: number | string | null;
  created_at?: string | null;
  hotel_id?: string | null;
  flight_id?: string | null;
  gear_id?: string | null;
  tour_gear_id?: string | null;
}

/** A line's transactions, already converted into the LINE's currency. */
export interface TxnAggregate {
  count: number;
  sum: number;
}

/** The active DRAFT version's snapshot row for a line (absent = none). */
export interface DraftSnapshot {
  proposed_cost: number | string | null;
  label: string | null;
  section_id: string | null;
  currency: string | null;
}

export interface PlanContext {
  /** Active version is APPROVED → proposed/structure frozen. */
  locked: boolean;
  /** Active DRAFT version id (null when locked or the tour has no versions). */
  draftVersionId: string | null;
  /** Convert an amount between two currencies (null = tour currency). */
  convert: (amount: number, from: string | null, to: string | null) => number;
}

export type PlanOp =
  | { kind: 'merge'; survivorId: string; loserIds: string[] }
  /** `fallback` runs when the delete is refused — a line that any approved or
   *  superseded version's snapshot references can't be deleted (212's lock
   *  trigger), so it is detached instead. */
  | { kind: 'delete'; id: string; fallback: Extract<PlanOp, { kind: 'update' }> }
  | { kind: 'update'; id: string; patch: Record<string, unknown>; mirror: MirrorRow | null }
  | { kind: 'insert'; sourceId: string; row: Record<string, unknown>; mirror: MirrorRow | null };

/** What to write into the draft snapshot (line id is known by the executor). */
export interface MirrorRow {
  proposed_cost: number;
  label: string;
  section_id: string | null;
  category: string;
  currency: string | null;
}

export interface FamilyPlanInput {
  family: DerivedFamily;
  desired: DesiredLine[];
  existing: ExistingLine[];
  txns: Map<string, TxnAggregate>;
  snapshots: Map<string, DraftSnapshot>;
  ctx: PlanContext;
}

export const DETACHED_SUFFIX = ' (source deleted)';

/** Round to cents. NUMERIC(12,2) is what the column stores. */
export function cents(v: unknown): number {
  const n = Number(v);
  if (!Number.isFinite(n)) return 0;
  return Math.round(n * 100) / 100;
}

const sameMoney = (a: unknown, b: unknown): boolean => cents(a) === cents(b);
const normCcy = (c: string | null | undefined): string | null => {
  const t = (c ?? '').trim().toUpperCase();
  return t ? t : null;
};

/** Pick the line that survives a duplicate group: most transactions, then an
 *  override, then the oldest, then the lowest id (deterministic). */
export function pickSurvivor(lines: ExistingLine[], txns: Map<string, TxnAggregate>): ExistingLine {
  return [...lines].sort((a, b) => {
    const ta = txns.get(a.id)?.count ?? 0;
    const tb = txns.get(b.id)?.count ?? 0;
    if (ta !== tb) return tb - ta;
    const oa = a.actual_cost_override ? 1 : 0;
    const ob = b.actual_cost_override ? 1 : 0;
    if (oa !== ob) return ob - oa;
    const ca = a.created_at ?? '';
    const cb = b.created_at ?? '';
    if (ca !== cb) return ca < cb ? -1 : 1;
    return a.id < b.id ? -1 : 1;
  })[0];
}

/** Rule 2 — the actual a line should carry. Returns null = leave it alone. */
export function targetActual(
  line: Pick<ExistingLine, 'actual_cost_override'>,
  txn: TxnAggregate | undefined,
  computedInLineCurrency: number,
): number | null {
  if (line.actual_cost_override) return null;
  if (txn && txn.count > 0) return cents(txn.sum);
  return cents(computedInLineCurrency);
}

function mirrorIfChanged(
  ctx: PlanContext,
  lineId: string | null,
  snapshots: Map<string, DraftSnapshot>,
  next: MirrorRow,
): MirrorRow | null {
  if (ctx.locked || !ctx.draftVersionId) return null;
  const snap = lineId ? snapshots.get(lineId) : undefined;
  if (
    snap &&
    sameMoney(snap.proposed_cost, next.proposed_cost) &&
    (snap.label ?? '') === next.label &&
    (snap.section_id ?? null) === next.section_id &&
    normCcy(snap.currency) === normCcy(next.currency)
  ) {
    return null;
  }
  return next;
}

/** Plan one family. Pure. */
export function planFamily(input: FamilyPlanInput): PlanOp[] {
  const { family, desired, existing, txns, snapshots, ctx } = input;
  const ops: PlanOp[] = [];

  // Group the cache by source id. Lines with no source id are orphans.
  const bySource = new Map<string, ExistingLine[]>();
  const orphans: ExistingLine[] = [];
  for (const l of existing) {
    if (!l.source_entity_id) {
      orphans.push(l);
      continue;
    }
    const arr = bySource.get(l.source_entity_id) ?? [];
    arr.push(l);
    bySource.set(l.source_entity_id, arr);
  }

  // Rule 1 — collapse duplicates. The merged-in transactions now belong to
  // the survivor, so its aggregate absorbs theirs for the rest of the plan.
  const survivorBySource = new Map<string, ExistingLine>();
  const effectiveTxns = new Map(txns);
  for (const [sid, group] of bySource) {
    const survivor = pickSurvivor(group, txns);
    survivorBySource.set(sid, survivor);
    if (group.length > 1) {
      const losers = group.filter((l) => l.id !== survivor.id);
      ops.push({ kind: 'merge', survivorId: survivor.id, loserIds: losers.map((l) => l.id) });
      let count = effectiveTxns.get(survivor.id)?.count ?? 0;
      let sum = effectiveTxns.get(survivor.id)?.sum ?? 0;
      for (const l of losers) {
        const t = txns.get(l.id);
        if (!t) continue;
        count += t.count;
        // Loser transactions are in the loser's currency; bring them across.
        sum += ctx.convert(t.sum, normCcy(l.currency), normCcy(survivor.currency));
      }
      effectiveTxns.set(survivor.id, { count, sum });
    }
  }

  const desiredIds = new Set(desired.map((d) => d.sourceId));

  // Rule 3 — sources that disappeared.
  const gone = [
    ...orphans,
    ...[...survivorBySource.entries()].filter(([sid]) => !desiredIds.has(sid)).map(([, l]) => l),
  ];
  for (const l of gone) {
    const t = effectiveTxns.get(l.id);
    const hasMoneyAttached = (t?.count ?? 0) > 0 || Boolean(l.actual_cost_override);
    const patch: Record<string, unknown> = {
      source_entity_type: null,
      source_entity_id: null,
    };
    for (const col of DERIVED_LINK_COLUMNS) {
      if (l[col]) patch[col] = null;
    }
    const actual = targetActual(l, t, 0);
    if (actual !== null && !sameMoney(actual, l.actual_cost)) patch.actual_cost = actual;
    let mirror: MirrorRow | null = null;
    if (!ctx.locked) {
      const label = (l.label ?? '').endsWith(DETACHED_SUFFIX) ? l.label ?? '' : `${l.label ?? ''}${DETACHED_SUFFIX}`;
      patch.label = label;
      patch.proposed_cost = 0;
      mirror = mirrorIfChanged(ctx, l.id, snapshots, {
        proposed_cost: 0,
        label,
        section_id: l.section_id ?? null,
        category: l.category ?? '',
        currency: normCcy(l.currency),
      });
    }
    const detach = { kind: 'update' as const, id: l.id, patch, mirror };
    ops.push(!hasMoneyAttached && !ctx.locked ? { kind: 'delete', id: l.id, fallback: detach } : detach);
  }

  // Desired lines: update the survivor, or insert.
  for (const d of desired) {
    const total = cents(d.total);
    const dCcy = normCcy(d.currency);
    const line = survivorBySource.get(d.sourceId);

    if (!line) {
      const proposed = ctx.locked ? 0 : total;
      const row: Record<string, unknown> = {
        category: d.category,
        label: d.label,
        quantity: d.quantity ?? 1,
        proposed_cost: proposed,
        actual_cost: total,
        currency: dCcy,
        source_entity_type: family,
        source_entity_id: d.sourceId,
        section_id: d.sectionId,
        section: d.legacySection,
        order_index: 0,
        sort_order: 0,
        ...(d.links ?? {}),
      };
      const mirror = mirrorIfChanged(ctx, null, snapshots, {
        proposed_cost: proposed,
        label: d.label,
        section_id: d.sectionId,
        category: d.category,
        currency: dCcy,
      });
      ops.push({ kind: 'insert', sourceId: d.sourceId, row, mirror });
      continue;
    }

    const patch: Record<string, unknown> = {};
    // The currency the line will be in after this pass.
    const lineCcy = ctx.locked ? normCcy(line.currency) : dCcy;
    const computed = cents(ctx.convert(total, dCcy, lineCcy));

    const actual = targetActual(line, effectiveTxns.get(line.id), computed);
    if (actual !== null && !sameMoney(actual, line.actual_cost)) patch.actual_cost = actual;

    let mirror: MirrorRow | null = null;
    if (!ctx.locked) {
      if (!sameMoney(line.proposed_cost, computed)) patch.proposed_cost = computed;
      if ((line.label ?? '') !== d.label) patch.label = d.label;
      if ((line.section_id ?? null) !== d.sectionId) patch.section_id = d.sectionId;
      if (normCcy(line.currency) !== lineCcy) patch.currency = lineCcy;
      if (d.quantity != null && Number(line.quantity ?? 1) !== d.quantity) patch.quantity = d.quantity;
      for (const [col, val] of Object.entries(d.links ?? {})) {
        if ((line[col as DerivedLinkColumn] ?? null) !== (val ?? null)) patch[col] = val ?? null;
      }
      mirror = mirrorIfChanged(ctx, line.id, snapshots, {
        proposed_cost: computed,
        label: d.label,
        section_id: d.sectionId,
        category: d.category,
        currency: lineCcy,
      });
    }

    if (Object.keys(patch).length > 0 || mirror) {
      ops.push({ kind: 'update', id: line.id, patch, mirror });
    }
  }

  return ops;
}
