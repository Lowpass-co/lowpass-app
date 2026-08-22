/* ============================================
   LOWPASS — channel-list numbering contract (§CL-1)

   The bug this pins: Adam dragged channels and his list went
   1, 2, 5, 6, 7, 8, 9, 10 and never came back. Four writers each
   maintained row_index by convention; the invariant lived nowhere.

   Every test here asserts the same one thing from a different
   starting state — after normalise, inputs read exactly 1..N and
   outputs exactly 1..M. That is the property the writers may not
   break, so it is the property the tests state, rather than the
   individual bugs that happened to break it.

   .test.tsx (not .test.ts) because vitest.config.ts includes only
   the .test.tsx glob — the .test.ts files are the standalone
   `node --experimental-strip-types` money harnesses and must stay
   out of this run.
   ============================================ */

import { describe, expect, it } from 'vitest';
import {
  isNormalised,
  nextFreeRowIndex,
  nextRowIndex,
  normaliseRowIndexes,
  rowKindOf,
  type NumberedRow,
} from './rowNumbering';

type Row = NumberedRow & { name?: string };

const row = (id: string, row_index: number, row_kind?: string | null): Row => ({
  id,
  row_index,
  ...(row_kind === undefined ? {} : { row_kind }),
});

/** [id, row_index] pairs for one kind, in returned order. */
const shapeOf = (rows: Row[], kind: 'input' | 'output') =>
  rows.filter((r) => rowKindOf(r) === kind).map((r) => [r.id, r.row_index] as const);

const indexesOf = (rows: Row[], kind: 'input' | 'output') =>
  rows.filter((r) => rowKindOf(r) === kind).map((r) => r.row_index);

describe('rowKindOf', () => {
  it('reads a legacy NULL row_kind as input', () => {
    expect(rowKindOf(row('a', 1, null))).toBe('input');
    expect(rowKindOf(row('a', 1))).toBe('input');
    expect(rowKindOf(row('a', 1, 'input'))).toBe('input');
    expect(rowKindOf(row('a', 1, 'output'))).toBe('output');
  });
});

describe('normaliseRowIndexes — the invariant', () => {
  it('closes the gaps in Adam’s actual screenshot: 1,2,5,6,7,8,9,10', () => {
    const rows = [1, 2, 5, 6, 7, 8, 9, 10].map((n, i) => row(`i${i}`, n, 'input'));
    const out = normaliseRowIndexes(rows);
    expect(indexesOf(out, 'input')).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
    expect(isNormalised(out)).toBe(true);
  });

  it('numbers the two kinds independently — 1..N and 1..M', () => {
    const rows = [
      row('i1', 3, 'input'),
      row('i2', 7, 'input'),
      row('o1', 4, 'output'),
      row('i3', 9, 'input'),
      row('o2', 11, 'output'),
    ];
    const out = normaliseRowIndexes(rows);
    expect(shapeOf(out, 'input')).toEqual([
      ['i1', 1],
      ['i2', 2],
      ['i3', 3],
    ]);
    expect(shapeOf(out, 'output')).toEqual([
      ['o1', 1],
      ['o2', 2],
    ]);
  });

  it('renumbering one kind cannot strand the other', () => {
    /* The +1000000 collision bump in the 043 reorder RPC applied to
       the whole section but only the listed ids came back down, so
       renumbering inputs left every output at 1000001+. */
    const rows = [
      row('i1', 2, 'input'),
      row('i2', 1, 'input'),
      row('o1', 1, 'output'),
      row('o2', 2, 'output'),
    ];
    const out = normaliseRowIndexes(rows, ['i1', 'i2']);
    expect(shapeOf(out, 'input')).toEqual([
      ['i1', 1],
      ['i2', 2],
    ]);
    expect(shapeOf(out, 'output')).toEqual([
      ['o1', 1],
      ['o2', 2],
    ]);
  });

  it('is idempotent — a second pass changes nothing', () => {
    const rows = [1, 4, 9].map((n, i) => row(`i${i}`, n, 'input'));
    const once = normaliseRowIndexes(rows);
    const twice = normaliseRowIndexes(once);
    expect(twice.map((r) => [r.id, r.row_index])).toEqual(once.map((r) => [r.id, r.row_index]));
  });

  it('returns already-correct rows by identity, so React sees no change', () => {
    const rows = [row('i1', 1, 'input'), row('i2', 2, 'input')];
    const out = normaliseRowIndexes(rows);
    expect(out[0]).toBe(rows[0]);
    expect(out[1]).toBe(rows[1]);
  });

  it('never mutates the array it was given', () => {
    const rows = [row('i1', 5, 'input'), row('i2', 2, 'input')];
    const before = rows.map((r) => [r.id, r.row_index]);
    normaliseRowIndexes(rows);
    expect(rows.map((r) => [r.id, r.row_index])).toEqual(before);
  });

  it('orders inputs before outputs in the returned array', () => {
    const rows = [row('o1', 1, 'output'), row('i1', 1, 'input')];
    expect(normaliseRowIndexes(rows).map((r) => r.id)).toEqual(['i1', 'o1']);
  });

  it('handles an empty section', () => {
    expect(normaliseRowIndexes([])).toEqual([]);
    expect(isNormalised([])).toBe(true);
  });
});

describe('normaliseRowIndexes — explicit ordering (the drag path)', () => {
  it('honours orderedIds, and only within the dragged row’s kind', () => {
    const rows = [
      row('i1', 1, 'input'),
      row('i2', 2, 'input'),
      row('i3', 3, 'input'),
      row('o1', 1, 'output'),
    ];
    /* Drag i3 to the top. The handler ships input ids only. */
    const out = normaliseRowIndexes(rows, ['i3', 'i1', 'i2']);
    expect(shapeOf(out, 'input')).toEqual([
      ['i3', 1],
      ['i1', 2],
      ['i2', 3],
    ]);
    expect(shapeOf(out, 'output')).toEqual([['o1', 1]]);
  });

  it('a MIXED ordered list still numbers each kind from 1', () => {
    /* handleDragEnd used to ship every id, inputs and outputs, as one
       flat sequence — that is what merged the two sequences and put
       a hole in the inputs wherever an output landed. Even given that
       payload the function must not produce a shared sequence. */
    const rows = [
      row('i1', 1, 'input'),
      row('o1', 2, 'output'),
      row('i2', 3, 'input'),
      row('o2', 4, 'output'),
    ];
    const out = normaliseRowIndexes(rows, ['o1', 'i1', 'o2', 'i2']);
    expect(shapeOf(out, 'input')).toEqual([
      ['i1', 1],
      ['i2', 2],
    ]);
    expect(shapeOf(out, 'output')).toEqual([
      ['o1', 1],
      ['o2', 2],
    ]);
  });

  it('rows missing from orderedIds keep their relative order and follow', () => {
    const rows = [
      row('a', 1, 'input'),
      row('b', 2, 'input'),
      row('c', 3, 'input'),
      row('d', 4, 'input'),
    ];
    const out = normaliseRowIndexes(rows, ['d', 'c']);
    expect(shapeOf(out, 'input')).toEqual([
      ['d', 1],
      ['c', 2],
      ['a', 3],
      ['b', 4],
    ]);
  });

  it('ignores ids that are not in the section — a stale drag cannot corrupt it', () => {
    const rows = [row('a', 1, 'input'), row('b', 2, 'input')];
    const out = normaliseRowIndexes(rows, ['ghost', 'b', 'a']);
    expect(shapeOf(out, 'input')).toEqual([
      ['b', 1],
      ['a', 2],
    ]);
  });

  it('ignores a duplicated id rather than numbering the row twice', () => {
    const rows = [row('a', 1, 'input'), row('b', 2, 'input')];
    const out = normaliseRowIndexes(rows, ['b', 'b', 'a']);
    expect(shapeOf(out, 'input')).toEqual([
      ['b', 1],
      ['a', 2],
    ]);
  });
});

describe('normaliseRowIndexes — recovery from every writer’s failure mode', () => {
  it('append: MAX+1 gaps collapse', () => {
    /* appendRow took MAX(row_index)+1, so on a gappy section every
       new channel widened the gap instead of closing it. */
    const rows = [row('a', 1, 'input'), row('b', 2, 'input'), row('c', 99, 'input')];
    expect(indexesOf(normaliseRowIndexes(rows), 'input')).toEqual([1, 2, 3]);
  });

  it('delete: the hole closes', () => {
    const rows = [row('a', 1, 'input'), row('c', 3, 'input'), row('d', 4, 'input')];
    expect(indexesOf(normaliseRowIndexes(rows), 'input')).toEqual([1, 2, 3]);
  });

  it('duplicate: the copy lands next to its source, not at the end', () => {
    const rows = [
      row('a', 1, 'input'),
      row('b', 2, 'input'),
      row('b-copy', 47, 'input'),
      row('c', 3, 'input'),
    ];
    const out = normaliseRowIndexes(rows, ['a', 'b', 'b-copy', 'c']);
    expect(shapeOf(out, 'input')).toEqual([
      ['a', 1],
      ['b', 2],
      ['b-copy', 3],
      ['c', 4],
    ]);
  });

  it('recovers a section left mid-bump at 1000001+', () => {
    /* If a reorder dies between the collision bump and the renumber,
       the rows survive at +1000000. Normalise must bring them home
       rather than needing a repair by hand. */
    const rows = [
      row('a', 1000001, 'input'),
      row('b', 1000002, 'input'),
      row('o', 1000003, 'output'),
    ];
    const out = normaliseRowIndexes(rows);
    expect(shapeOf(out, 'input')).toEqual([
      ['a', 1],
      ['b', 2],
    ]);
    expect(shapeOf(out, 'output')).toEqual([['o', 1]]);
  });

  it('survives duplicate row_index values without dropping a row', () => {
    const rows = [row('a', 1, 'input'), row('b', 1, 'input'), row('c', 1, 'input')];
    const out = normaliseRowIndexes(rows);
    expect(out).toHaveLength(3);
    expect(indexesOf(out, 'input')).toEqual([1, 2, 3]);
  });

  it('survives zero and negative row_index', () => {
    const rows = [row('a', 0, 'input'), row('b', -4, 'input'), row('c', 2, 'input')];
    expect(shapeOf(normaliseRowIndexes(rows), 'input')).toEqual([
      ['b', 1],
      ['a', 2],
      ['c', 3],
    ]);
  });
});

describe('isNormalised', () => {
  it('accepts a clean section and rejects each way of being unclean', () => {
    expect(isNormalised([row('a', 1, 'input'), row('b', 2, 'input')])).toBe(true);
    expect(isNormalised([row('a', 1, 'input'), row('b', 3, 'input')])).toBe(false);
    expect(isNormalised([row('a', 1, 'input'), row('b', 1, 'input')])).toBe(false);
    expect(isNormalised([row('a', 2, 'input')])).toBe(false);
    /* Per-kind: inputs 1..N and outputs 1..M is CORRECT, not a clash. */
    expect(isNormalised([row('a', 1, 'input'), row('o', 1, 'output')])).toBe(true);
  });
});

describe('nextRowIndex / nextFreeRowIndex', () => {
  it('nextRowIndex is one past the last of that kind', () => {
    const rows = [row('a', 1, 'input'), row('b', 2, 'input'), row('o', 1, 'output')];
    expect(nextRowIndex(rows, 'input')).toBe(3);
    expect(nextRowIndex(rows, 'output')).toBe(2);
    expect(nextRowIndex([], 'input')).toBe(1);
  });

  it('nextFreeRowIndex clears the max even when the section is gappy', () => {
    /* The append paths insert BEFORE normalising, so their index has
       to be free on a section that is still broken — where
       nextRowIndex (count+1) would collide. */
    const rows = [row('a', 1, 'input'), row('b', 99, 'input')];
    expect(nextRowIndex(rows, 'input')).toBe(3);
    expect(nextFreeRowIndex(rows, 'input')).toBe(100);
    expect(nextFreeRowIndex([], 'input')).toBe(1);
  });

  it('nextFreeRowIndex is scoped to its own kind', () => {
    const rows = [row('a', 1, 'input'), row('o', 40, 'output')];
    expect(nextFreeRowIndex(rows, 'input')).toBe(2);
    expect(nextFreeRowIndex(rows, 'output')).toBe(41);
  });
});
