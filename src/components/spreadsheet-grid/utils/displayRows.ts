import type { CellCoord, DisplayEntry, GridColumn, GridRow, SectionHeader, SelectionRange } from '../types';

export function partitionRows<T>(rows: GridRow<T>[]) {
  const top: GridRow<T>[] = [];
  const middle: GridRow<T>[] = [];
  const bottom: GridRow<T>[] = [];
  for (const r of rows) {
    if (r.isPinnedTop) top.push(r);
    else if (r.isPinnedBottom) bottom.push(r);
    else middle.push(r);
  }
  return { top, middle, bottom };
}

export function mergeWithSections<T>(
  middle: GridRow<T>[],
  sectionHeaders: SectionHeader[] | undefined
): DisplayEntry<T>[] {
  if (!sectionHeaders?.length) {
    return middle.map(r => ({ kind: 'data' as const, row: r }));
  }
  const atStart = sectionHeaders.filter(s => s.afterRowId == null);
  const afterMap = new Map<string | null, SectionHeader[]>();
  for (const s of sectionHeaders) {
    if (s.afterRowId == null) continue;
    const k = s.afterRowId;
    if (!afterMap.has(k)) afterMap.set(k, []);
    afterMap.get(k)!.push(s);
  }
  const out: DisplayEntry<T>[] = [];
  let secIdx = 0;
  for (const s of atStart) {
    out.push({
      kind: 'section',
      key: `sec-start-${secIdx++}`,
      label: s.label,
      sectionId: `h-${s.label}-${secIdx}`,
      collapsible: s.collapsible,
    });
  }
  for (const row of middle) {
    out.push({ kind: 'data', row });
    const next = afterMap.get(row.id);
    if (next) {
      for (const s of next) {
        out.push({
          kind: 'section',
          key: `sec-${row.id}-${s.label}`,
          label: s.label,
          sectionId: `h-${row.id}-${s.label}`,
          collapsible: s.collapsible,
        });
      }
    }
  }
  return out;
}

export function getRowIdsInRange(
  entries: Array<{ kind: 'data'; row: { id: string } } | { kind: 'section' }>,
  startRowId: string,
  endRowId: string
): string[] {
  const dataOnly = entries.filter(
    (e): e is { kind: 'data'; row: { id: string } } => e.kind === 'data'
  );
  const ids = dataOnly.map(e => e.row.id);
  const a = ids.indexOf(startRowId);
  const b = ids.indexOf(endRowId);
  if (a < 0 || b < 0) return [];
  const lo = Math.min(a, b);
  const hi = Math.max(a, b);
  return ids.slice(lo, hi + 1);
}

export function getColumnIdsInRange(columns: { id: string }[], startColId: string, endColId: string): string[] {
  const ids = columns.map(c => c.id);
  const a = ids.indexOf(startColId);
  const b = ids.indexOf(endColId);
  if (a < 0 || b < 0) return [];
  const lo = Math.min(a, b);
  const hi = Math.max(a, b);
  return ids.slice(lo, hi + 1);
}

export function isRectSingleColumn(r: {
  startColumnId: string;
  endColumnId: string;
}): boolean {
  return r.startColumnId === r.endColumnId;
}

function dataRowIds<T>(display: Array<DisplayEntry<T> | { kind: 'section' }>): string[] {
  return display
    .filter((e): e is Extract<DisplayEntry<T>, { kind: 'data' }> => (e as DisplayEntry<T>).kind === 'data')
    .map(e => e.row.id);
}

export function rangeFromAnchorFocus<T>(
  display: Array<DisplayEntry<T> | { kind: 'section' }>,
  columns: GridColumn<T>[],
  anchor: CellCoord,
  focus: CellCoord
): SelectionRange | null {
  const rids = dataRowIds(display);
  const cids = columns.map(c => c.id);
  const a = rids.indexOf(anchor.rowId);
  const b = rids.indexOf(focus.rowId);
  const c1 = cids.indexOf(anchor.columnId);
  const c2 = cids.indexOf(focus.columnId);
  if (a < 0 || b < 0 || c1 < 0 || c2 < 0) return null;
  const ri0 = Math.min(a, b);
  const ri1 = Math.max(a, b);
  const ci0 = Math.min(c1, c2);
  const ci1 = Math.max(c1, c2);
  return {
    startRowId: rids[ri0]!,
    endRowId: rids[ri1]!,
    startColumnId: cids[ci0]!,
    endColumnId: cids[ci1]!,
  };
}
