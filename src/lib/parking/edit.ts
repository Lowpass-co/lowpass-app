/* ============================================
   LOWPASS — Parking maps: editing rules (Nov 2026, Adam)

   Pure functions the editor calls; each returns a new item list. Kept here so
   the rules (what a drag moves, where a new bus lands, what undo restores)
   are tested without a browser.
   ============================================ */

import { normDeg, project, type Pt, type View } from './geo';
import { vehicleSpec, markerSpec, type AreaType, type MarkerType, type VehicleType } from './catalogue';
import { newItemId, nextLabel, type ParkingItem } from './model';
import { itemPoints } from './print';

const round = (n: number) => Math.round(n * 1000) / 1000;
const shift = (p: Pt, d: Pt): Pt => ({ x: round(p.x + d.x), y: round(p.y + d.y) });

/** Move one item by d metres (every point of a route / area / measure). */
export function moveItem(item: ParkingItem, d: Pt): ParkingItem {
  switch (item.kind) {
    case 'vehicle':
    case 'marker':
      return { ...item, ...shift(item, d) };
    case 'route':
    case 'area':
      return { ...item, points: item.points.map((p) => shift(p, d)) };
    case 'measure':
      return { ...item, a: shift(item.a, d), b: shift(item.b, d) };
  }
}

export function replaceItem(items: ParkingItem[], next: ParkingItem): ParkingItem[] {
  return items.map((i) => (i.id === next.id ? next : i));
}

export function removeItem(items: ParkingItem[], id: string): ParkingItem[] {
  return items.filter((i) => i.id !== id);
}

export function addVehicle(items: ParkingItem[], type: VehicleType, at: Pt, heading: number): { items: ParkingItem[]; id: string } {
  const spec = vehicleSpec(type);
  if (!spec) return { items, id: '' };
  const id = newItemId();
  return {
    id,
    items: [
      ...items,
      { id, kind: 'vehicle', type, label: nextLabel(items, spec.short), x: round(at.x), y: round(at.y), heading: normDeg(Math.round(heading)), length: spec.length, width: spec.width, height: spec.height },
    ],
  };
}

export function addMarker(items: ParkingItem[], type: MarkerType, at: Pt): { items: ParkingItem[]; id: string } {
  if (!markerSpec(type)) return { items, id: '' };
  const id = newItemId();
  return { id, items: [...items, { id, kind: 'marker', type, label: '', detail: '', x: round(at.x), y: round(at.y) }] };
}

/** A finished drawing → an item, or null if it has too few points to mean anything. */
export function finishDraft(
  items: ParkingItem[],
  kind: 'route' | 'area' | 'measure',
  points: Pt[],
  areaType: AreaType = 'crew',
): { items: ParkingItem[]; id: string } | null {
  const pts = points.map((p) => ({ x: round(p.x), y: round(p.y) }));
  // Two clicks on the same spot (a double-click finish) add nothing.
  const clean = pts.filter((p, i) => i === 0 || Math.hypot(p.x - pts[i - 1].x, p.y - pts[i - 1].y) > 0.05);
  const id = newItemId();
  if (kind === 'measure') {
    if (clean.length < 2) return null;
    return { id, items: [...items, { id, kind: 'measure', a: clean[0], b: clean[clean.length - 1] }] };
  }
  if (kind === 'route') {
    if (clean.length < 2) return null;
    return { id, items: [...items, { id, kind: 'route', label: '', points: clean }] };
  }
  if (clean.length < 3) return null;
  return { id, items: [...items, { id, kind: 'area', type: areaType, label: '', points: clean }] };
}

export function duplicateItem(items: ParkingItem[], id: string, offset: Pt): { items: ParkingItem[]; id: string } | null {
  const src = items.find((i) => i.id === id);
  if (!src) return null;
  const copy = moveItem({ ...src, id: newItemId() } as ParkingItem, offset);
  if (copy.kind === 'vehicle') {
    const prefix = vehicleSpec(copy.type)?.short ?? 'Vehicle';
    copy.label = nextLabel(items, prefix);
  }
  return { id: copy.id, items: [...items, copy] };
}

/* ── Several at once (Nov 2026, Adam) ─────────────────────────
   Cmd/Ctrl/Shift-click toggles, Shift-drag boxes, ⌘A takes everything.
   A selection is a list of ids; these work on it as one undo step. */

/** Add the id, or take it out if it's already in. */
export function toggleSelection(sel: string[], id: string): string[] {
  return sel.includes(id) ? sel.filter((s) => s !== id) : [...sel, id];
}

export function moveItems(items: ParkingItem[], ids: readonly string[], d: Pt): ParkingItem[] {
  const set = new Set(ids);
  return items.map((i) => (set.has(i.id) ? moveItem(i, d) : i));
}

export function removeItems(items: ParkingItem[], ids: readonly string[]): ParkingItem[] {
  const set = new Set(ids);
  return items.filter((i) => !set.has(i.id));
}

/** One item's own centre: its position, or the mean of its points. */
function itemCentre(i: ParkingItem): Pt {
  if (i.kind === 'vehicle' || i.kind === 'marker') return { x: i.x, y: i.y };
  const pts = i.kind === 'measure' ? [i.a, i.b] : i.points;
  return { x: pts.reduce((s, q) => s + q.x, 0) / pts.length, y: pts.reduce((s, q) => s + q.y, 0) / pts.length };
}

/** What a group turns about: the mean of its items' centres. Unlike a
 *  bounding-box centre it turns with the group, so pressing ] again and
 *  again spins the group in place instead of walking it across the map. */
export function groupCentre(items: ParkingItem[], ids: readonly string[]): Pt | null {
  const set = new Set(ids);
  const cs = items.filter((i) => set.has(i.id)).map(itemCentre);
  if (!cs.length) return null;
  return { x: cs.reduce((s, q) => s + q.x, 0) / cs.length, y: cs.reduce((s, q) => s + q.y, 0) / cs.length };
}

/** Turn the selection as one block, clockwise by `by` degrees (compass
 *  sense): positions swing round the group centre, vehicles' headings turn
 *  with them — a row of buses stays a row. */
export function turnItems(items: ParkingItem[], ids: readonly string[], by: number): ParkingItem[] {
  const c = groupCentre(items, ids);
  if (!c) return items;
  const set = new Set(ids);
  const r = (by * Math.PI) / 180;
  const cos = Math.cos(r);
  const sin = Math.sin(r);
  const spin = (p: Pt): Pt => {
    const dx = p.x - c.x;
    const dy = p.y - c.y;
    return { x: round(c.x + dx * cos + dy * sin), y: round(c.y - dx * sin + dy * cos) };
  };
  return items.map((i) => {
    if (!set.has(i.id)) return i;
    switch (i.kind) {
      case 'vehicle':
        return { ...i, ...spin(i), heading: normDeg(i.heading + by) };
      case 'marker':
        return { ...i, ...spin(i) };
      case 'route':
      case 'area':
        return { ...i, points: i.points.map(spin) };
      case 'measure':
        return { ...i, a: spin(i.a), b: spin(i.b) };
    }
  });
}

/** Copies of the selection, `offset` metres away; returns the copies' ids. */
export function duplicateItems(items: ParkingItem[], ids: readonly string[], offset: Pt): { items: ParkingItem[]; ids: string[] } {
  let out = items;
  const made: string[] = [];
  for (const id of ids) {
    const r = duplicateItem(out, id, offset);
    if (r) {
      out = r.items;
      made.push(r.id);
    }
  }
  return { items: out, ids: made };
}

/** Ids of everything with a point inside a screen rectangle (corners a, b). */
export function itemsInBox(items: ParkingItem[], view: View, w: number, h: number, a: Pt, b: Pt): string[] {
  const x0 = Math.min(a.x, b.x);
  const x1 = Math.max(a.x, b.x);
  const y0 = Math.min(a.y, b.y);
  const y1 = Math.max(a.y, b.y);
  return items
    .filter((i) =>
      itemPoints([i]).some((p) => {
        const s = project(view, w, h, p);
        return s.x >= x0 && s.x <= x1 && s.y >= y0 && s.y <= y1;
      }),
    )
    .map((i) => i.id);
}

/* ── Undo ─────────────────────────────────────────────────── */

export interface History<T> {
  past: T[];
  future: T[];
}

export const HISTORY_LIMIT = 100;

/** Record `before` as an undo step (call when a change is committed). */
export function record<T>(h: History<T>, before: T): History<T> {
  return { past: [...h.past, before].slice(-HISTORY_LIMIT), future: [] };
}

export function undo<T>(h: History<T>, now: T): { h: History<T>; value: T } | null {
  if (!h.past.length) return null;
  return { h: { past: h.past.slice(0, -1), future: [now, ...h.future] }, value: h.past[h.past.length - 1] };
}

export function redo<T>(h: History<T>, now: T): { h: History<T>; value: T } | null {
  if (!h.future.length) return null;
  return { h: { past: [...h.past, now], future: h.future.slice(1) }, value: h.future[0] };
}
