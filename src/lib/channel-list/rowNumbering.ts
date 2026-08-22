/* ============================================
   LOWPASS — channel-list row numbering (§CL-1)

   THE INVARIANT: within one section, input rows occupy row_index
   1..N with no gaps and no repeats, and output rows independently
   occupy 1..M. Nothing else is a legal state.

   Why this file exists. Migration 115 made numbering per-kind
   (UNIQUE (section_id, row_kind, row_index)) but the four writers
   that maintain row_index — append, duplicate, delete, reorder —
   each kept it by convention, and each got it wrong in a different
   way: append took MAX(row_index)+1 so it inherited whatever gaps
   already existed, duplicate re-ran a kind-blind reorder, delete
   left a hole nothing closed, and reorder renumbered 1..N across
   BOTH kinds at once so a single drag interleaved the two
   sequences. Adam's channel list read 1, 2, 5, 6, 7, 8, 9, 10 and
   nothing anywhere would ever have brought it back.

   So numbering stops being a convention. This module is the one
   definition of the target state; every writer computes it here,
   and public.normalise_channel_list_indexes (migration 267)
   computes the identical thing server-side so the persisted rows
   and the optimistic local rows can never disagree.

   KEEP THE TWO IN STEP. The sort key below —

       rows named in orderedIds first, in array order;
       then everything else by ascending row_index

   — is mirrored exactly by the SQL function's
   ORDER BY (ord IS NULL), ord, row_index. row_index is UNIQUE per
   (section, kind), so it is a total order within a kind and the
   two implementations cannot diverge on ties. If you change one,
   change the other.
   ============================================ */

export type ChannelRowKind = 'input' | 'output';

/** The minimum a row needs to take part in numbering. */
export type NumberedRow = {
  id: string;
  row_index: number;
  row_kind?: string | null;
};

/** Kind order in the returned array: inputs, then outputs. */
const KIND_ORDER: ChannelRowKind[] = ['input', 'output'];

/**
 * A row's kind, with the legacy NULL row_kind read as 'input'.
 * Rows predating Sprint 12 §8a have no row_kind; the DB default and
 * every query in channel-list.ts treat NULL as input, so this does too.
 */
export function rowKindOf(row: NumberedRow): ChannelRowKind {
  return row.row_kind === 'output' ? 'output' : 'input';
}

/**
 * Rewrite row_index so each kind reads exactly 1..N.
 *
 * @param rows        every row in the section, both kinds.
 * @param orderedIds  optional explicit ordering (a drag result).
 *                    Rows named here sort first, in the order given;
 *                    every other row of that kind keeps its relative
 *                    order and follows. Ids not present in `rows` are
 *                    ignored, so a stale drag payload cannot corrupt
 *                    the sequence.
 *
 * Returns a NEW array — inputs first, then outputs, each in its new
 * numbering order. The inputs are never mutated.
 */
export function normaliseRowIndexes<T extends NumberedRow>(
  rows: readonly T[],
  orderedIds: readonly string[] = [],
): T[] {
  const explicit = new Map<string, number>();
  orderedIds.forEach((id, i) => {
    if (!explicit.has(id)) explicit.set(id, i);
  });

  const out: T[] = [];
  for (const kind of KIND_ORDER) {
    const inKind = rows.filter((r) => rowKindOf(r) === kind);
    inKind.sort((a, b) => {
      const ao = explicit.get(a.id);
      const bo = explicit.get(b.id);
      /* Listed rows first (mirrors SQL's `(ord IS NULL)` ascending:
         false sorts before true). */
      if (ao != null && bo != null) return ao - bo;
      if (ao != null) return -1;
      if (bo != null) return 1;
      return a.row_index - b.row_index;
    });
    inKind.forEach((r, i) => {
      const next = i + 1;
      out.push(r.row_index === next ? r : { ...r, row_index: next });
    });
  }
  return out;
}

/**
 * The row_index a newly appended row of `kind` should take.
 *
 * With the invariant held this is simply "one past the last", and it
 * is free by construction. Callers that insert BEFORE normalising
 * (every append path does, so the insert cannot collide with a
 * section that is still gappy) should use nextFreeRowIndex instead.
 */
export function nextRowIndex(rows: readonly NumberedRow[], kind: ChannelRowKind): number {
  return rows.filter((r) => rowKindOf(r) === kind).length + 1;
}

/**
 * A row_index guaranteed not to collide with any existing row of
 * `kind`, whatever state the section is in. Used by the append paths,
 * which insert first and normalise second — so the insert must be
 * safe even on a section whose numbering is still broken.
 */
export function nextFreeRowIndex(rows: readonly NumberedRow[], kind: ChannelRowKind): number {
  let max = 0;
  for (const r of rows) {
    if (rowKindOf(r) !== kind) continue;
    if (r.row_index > max) max = r.row_index;
  }
  return max + 1;
}

/**
 * Does this section already satisfy the invariant? Test/diagnostic
 * helper — also the cheap check that lets a caller skip a write.
 */
export function isNormalised(rows: readonly NumberedRow[]): boolean {
  for (const kind of KIND_ORDER) {
    const seen = new Set<number>();
    let count = 0;
    for (const r of rows) {
      if (rowKindOf(r) !== kind) continue;
      count += 1;
      seen.add(r.row_index);
    }
    for (let i = 1; i <= count; i += 1) {
      if (!seen.has(i)) return false;
    }
    if (seen.size !== count) return false;
  }
  return true;
}
