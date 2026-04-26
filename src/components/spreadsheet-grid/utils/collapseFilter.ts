import type { DisplayEntry } from '../types';

export function filterCollapsed<T>(entries: DisplayEntry<T>[], collapsed: Set<string>): DisplayEntry<T>[] {
  if (!collapsed.size) return entries;
  const out: DisplayEntry<T>[] = [];
  let hide = false;
  for (const e of entries) {
    if (e.kind === 'section') {
      hide = collapsed.has(e.sectionId);
      out.push(e);
    } else if (!hide) {
      out.push(e);
    }
  }
  return out;
}
