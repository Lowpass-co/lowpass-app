/* ============================================
   LOWPASS — Parking maps: editing rules (Nov 2026, Adam)

   Pure functions the editor calls; each returns a new item list. Kept here so
   the rules (what a drag moves, where a new bus lands, what undo restores)
   are tested without a browser.
   ============================================ */

import { normDeg, type Pt } from './geo';
import { vehicleSpec, markerSpec, type AreaType, type MarkerType, type VehicleType } from './catalogue';
import { newItemId, nextLabel, type ParkingItem } from './model';

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
