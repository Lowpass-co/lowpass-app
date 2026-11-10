/* ============================================
   LOWPASS — Parking maps: venue drawings (Nov 2026, Adam)

   A venue's own plan (PDF / JPG) laid on the map at true scale — for car
   parks the satellite can't see (the trucks inside the Velodrom, the dock
   under an arena) and for checking a drawing against the satellite.

   Pure rules, no browser:
     · where a drawing sits:  toGround / toSource / svgMatrix / footprint
     · its scale:             scaleFromDimension, then a second dimension
                              checked against it (agreement)
     · pinning to the satellite: two points on the drawing ↔ the same two on
       the map give rotation + position; the drawing keeps ITS OWN scale (a
       dimension typed off the drawing beats two clicks on a photo) and the
       satellite's disagreement is reported (pinCheck) — a big one means the
       drawing is out of date or not to scale
     · levels: an item's floor is its own, else the inside drawing it's on,
       else the street (0)
     · headroom: vehicles taller than an inside drawing's clear height, or
       than a height-limit marker at its door / over them / on a route

   Source units: PDF points or image pixels, u right, v DOWN (model.ts).
   ============================================ */

import { bearing, dist, fmtMetres, normDeg, toLocal, type LatLng, type Pt } from './geo';
import { vehicleCorners, type MarkerItem, type ParkingDrawing, type ParkingItem, type SrcPt, type VehicleItem } from './model';

const rad = (d: number) => (d * Math.PI) / 180;

type Placement = Pick<ParkingDrawing, 'x' | 'y' | 'scale' | 'rotation'>;

/** A point on the drawing → the ground (metres east / north of the anchor). */
export function toGround(d: Placement, p: SrcPt): Pt {
  const r = rad(d.rotation);
  const a = p.u * d.scale;
  const b = -p.v * d.scale; // v runs down the page; north runs up
  return { x: d.x + a * Math.cos(r) + b * Math.sin(r), y: d.y - a * Math.sin(r) + b * Math.cos(r) };
}

/** The ground → a point on the drawing. Exact inverse of toGround. */
export function toSource(d: Placement, g: Pt): SrcPt {
  const r = rad(d.rotation);
  const dx = g.x - d.x;
  const dy = g.y - d.y;
  const a = dx * Math.cos(r) - dy * Math.sin(r);
  const b = dx * Math.sin(r) + dy * Math.cos(r);
  return { u: a / d.scale, v: -b / d.scale };
}

/** SVG / canvas matrix (a b c d e f) from source units to SCENE coordinates
 *  (x east, y = −north — the frame sceneTransform() draws tiles in). */
export function svgMatrix(d: Placement): [number, number, number, number, number, number] {
  const r = rad(d.rotation);
  const s = d.scale;
  return [s * Math.cos(r), s * Math.sin(r), -s * Math.sin(r), s * Math.cos(r), d.x, -d.y];
}

/** The cropped drawing's corners on the ground: top-left, top-right, bottom-right, bottom-left. */
export function footprint(d: Placement & Pick<ParkingDrawing, 'crop'>): Pt[] {
  const { u0, v0, u1, v1 } = d.crop;
  return [
    { u: u0, v: v0 },
    { u: u1, v: v0 },
    { u: u1, v: v1 },
    { u: u0, v: v1 },
  ].map((p) => toGround(d, p));
}

/** A PDF or a JPG / PNG — what can be laid on a map. */
export function drawableKind(name: string | null, mime: string | null): 'pdf' | 'image' | null {
  const m = (mime ?? '').toLowerCase();
  const n = (name ?? '').toLowerCase();
  if (m === 'application/pdf' || n.endsWith('.pdf')) return 'pdf';
  if (m === 'image/jpeg' || m === 'image/png' || /\.(jpe?g|png)$/.test(n)) return 'image';
  return null;
}

/* ── Scale ────────────────────────────────────────────────── */

/** Metres per source unit from a dimension: two clicks + the number printed. */
export function scaleFromDimension(a: SrcPt, b: SrcPt, metres: number): number | null {
  const len = Math.hypot(b.u - a.u, b.v - a.v);
  if (!(len >= 1) || !(metres > 0)) return null;
  return metres / len;
}

/** How far a second measurement disagrees with the first, % (+ = it reads bigger). */
export function agreement(scale: number, other: number): number {
  return (other / scale - 1) * 100;
}

/** Above this, the second dimension disagrees enough to say so. */
export const CHECK_WARN_PCT = 2;
/** Above this, the satellite disagrees enough to say the drawing may be out of date / not to scale. */
export const PIN_WARN_PCT = 3;

/* ── Placing ──────────────────────────────────────────────── */

/** Two points on the drawing ↔ the same two on the map: rotation + position
 *  at the drawing's own scale, centred on the pair's midpoint (so a small
 *  scale mismatch splits evenly instead of piling up at one end). */
export function pinDrawing(scale: number, src: [SrcPt, SrcPt], ground: [Pt, Pt]): { x: number; y: number; rotation: number; pinCheck: number } | null {
  const w = { x: (src[1].u - src[0].u) * scale, y: -(src[1].v - src[0].v) * scale };
  const g = { x: ground[1].x - ground[0].x, y: ground[1].y - ground[0].y };
  const wl = Math.hypot(w.x, w.y);
  const gl = Math.hypot(g.x, g.y);
  if (wl < 0.5 || gl < 0.5) return null; // too close together to fix a direction
  const rotation = normDeg(bearing({ x: 0, y: 0 }, g) - bearing({ x: 0, y: 0 }, w));
  const mid = { u: (src[0].u + src[1].u) / 2, v: (src[0].v + src[1].v) / 2 };
  const gm = { x: (ground[0].x + ground[1].x) / 2, y: (ground[0].y + ground[1].y) / 2 };
  const at = toGround({ x: 0, y: 0, scale, rotation }, mid);
  return { x: gm.x - at.x, y: gm.y - at.y, rotation, pinCheck: (gl / wl - 1) * 100 };
}

/** Placed by hand (no satellite to match): the crop's centre on `centre`, turned `rotation`. */
export function placeAt(d: Pick<ParkingDrawing, 'crop' | 'scale'>, centre: Pt, rotation: number): { x: number; y: number; rotation: number } {
  const mid = { u: (d.crop.u0 + d.crop.u1) / 2, v: (d.crop.v0 + d.crop.v1) / 2 };
  const at = toGround({ x: 0, y: 0, scale: d.scale, rotation }, mid);
  return { x: centre.x - at.x, y: centre.y - at.y, rotation: normDeg(rotation) };
}

/** Drawings from an earlier map at the same venue, moved into this map's frame
 *  (the two maps' anchors may differ). */
export function shiftDrawings(drawings: ParkingDrawing[], from: LatLng, to: LatLng): ParkingDrawing[] {
  const d = toLocal(to, from);
  return drawings.map((x) => ({ ...x, x: x.x + d.x, y: x.y + d.y }));
}

/* ── Inside, levels ───────────────────────────────────────── */

export function pointInPolygon(p: Pt, poly: Pt[]): boolean {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const a = poly[i];
    const b = poly[j];
    if (a.y > p.y !== b.y > p.y && p.x < ((b.x - a.x) * (p.y - a.y)) / (b.y - a.y) + a.x) inside = !inside;
  }
  return inside;
}

function segDist(p: Pt, a: Pt, b: Pt): number {
  const l2 = (b.x - a.x) ** 2 + (b.y - a.y) ** 2;
  const t = l2 ? Math.max(0, Math.min(1, ((p.x - a.x) * (b.x - a.x) + (p.y - a.y) * (b.y - a.y)) / l2)) : 0;
  return dist(p, { x: a.x + t * (b.x - a.x), y: a.y + t * (b.y - a.y) });
}

/** Distance from a point to a closed polygon's edge (0 inside). */
export function distToPolygon(p: Pt, poly: Pt[]): number {
  if (pointInPolygon(p, poly)) return 0;
  return Math.min(...poly.map((a, i) => segDist(p, a, poly[(i + 1) % poly.length])));
}

/** Distance from a point to a polyline. */
export function distToPath(p: Pt, path: Pt[]): number {
  if (path.length === 1) return dist(p, path[0]);
  return Math.min(...path.slice(1).map((b, i) => segDist(p, path[i], b)));
}

/** Where an item "is", for levels and headroom. */
export function itemPoint(i: ParkingItem): Pt {
  if (i.kind === 'vehicle' || i.kind === 'marker') return { x: i.x, y: i.y };
  const pts = i.kind === 'measure' ? [i.a, i.b] : i.points;
  return { x: pts.reduce((s, q) => s + q.x, 0) / pts.length, y: pts.reduce((s, q) => s + q.y, 0) / pts.length };
}

/** Inside drawings whose footprint holds the point, highest floor first. */
export function insideAt(drawings: ParkingDrawing[], p: Pt): ParkingDrawing[] {
  return drawings.filter((d) => d.inside && pointInPolygon(p, footprint(d))).sort((a, b) => b.floor - a.floor);
}

/** An item's level: its own, else the (highest) inside drawing it's drawn on, else the street. */
export function itemFloor(i: ParkingItem, drawings: ParkingDrawing[]): number {
  if (i.floor != null) return i.floor;
  return insideAt(drawings, itemPoint(i))[0]?.floor ?? 0;
}

/** The inside drawing an item stands on: under it, at its level. */
export function drawingUnder(i: ParkingItem, drawings: ParkingDrawing[]): ParkingDrawing | null {
  const f = itemFloor(i, drawings);
  return insideAt(drawings, itemPoint(i)).find((d) => d.floor === f) ?? null;
}

/** The map's levels, top first: the street plus each inside drawing's floor. */
export function levelsOf(drawings: ParkingDrawing[]): number[] {
  return [...new Set([0, ...drawings.filter((d) => d.inside).map((d) => d.floor)])].sort((a, b) => b - a);
}

export function fmtFloor(f: number): string {
  return f === 0 ? '0 m' : `${f > 0 ? '+' : '−'}${fmtMetres(Math.abs(f))}`;
}

/** "Street", or the drawings on that level: "Basement dock (−5 m)". */
export function levelLabel(floor: number, drawings: ParkingDrawing[]): string {
  const names = drawings.filter((d) => d.inside && d.floor === floor).map((d) => d.name.replace(/\.(pdf|jpe?g|png)$/i, ''));
  if (floor === 0 && !names.length) return 'Street';
  return `${names.length ? names.join(' · ') : 'Level'} (${fmtFloor(floor)})`;
}

/* ── Headroom ─────────────────────────────────────────────── */

/** A height-limit marker's clear height: the number typed, else one read from
 *  its detail ("4.2 m", "4,2m") so markers drawn before the field still count. */
export function clearOf(m: MarkerItem): number | null {
  if (m.type !== 'height_limit') return null;
  if (m.clear != null) return m.clear;
  const hit = /(\d+(?:[.,]\d+)?)\s*m\b/i.exec(m.detail || m.label);
  const n = hit ? Number(hit[1].replace(',', '.')) : NaN;
  return Number.isFinite(n) && n > 0.5 && n < 20 ? n : null;
}

export interface HeadroomWarning {
  vehicleIds: string[];
  text: string;
}

const DOOR_REACH_M = 6; // a limit this close to an inside drawing guards its way in
const OVER_REACH_M = 3; // …this close to a parked vehicle is over it; to a route, on it

function names(vs: VehicleItem[]): string {
  return vs.map((v) => `${v.label || 'Vehicle'} (${fmtMetres(v.height)})`).join(', ');
}

export function headroomWarnings(items: ParkingItem[], drawings: ParkingDrawing[]): HeadroomWarning[] {
  const vehicles = items.filter((i): i is VehicleItem => i.kind === 'vehicle');
  const onDrawing = (d: ParkingDrawing) => vehicles.filter((v) => drawingUnder(v, drawings)?.id === d.id);
  const out: HeadroomWarning[] = [];
  const add = (vs: VehicleItem[], text: string) => {
    if (vs.length && !out.some((w) => w.text === text)) out.push({ vehicleIds: vs.map((v) => v.id), text });
  };

  for (const d of drawings) {
    if (!d.inside || d.clearHeight == null) continue;
    const c = d.clearHeight;
    add(
      onDrawing(d).filter((v) => v.height > c),
      `Taller than the ${fmtMetres(c)} clear height inside ${d.name}: ${names(onDrawing(d).filter((v) => v.height > c))}`,
    );
  }

  for (const m of items) {
    if (m.kind !== 'marker') continue;
    const c = clearOf(m);
    if (c == null) continue;
    const what = `${m.label || 'Height limit'} (${fmtMetres(c)})`;
    for (const d of drawings) {
      if (!d.inside || distToPolygon(m, footprint(d)) > DOOR_REACH_M) continue;
      const tall = onDrawing(d).filter((v) => v.height > c);
      add(tall, `${what} on the way into ${d.name} — taller: ${names(tall)}`);
    }
    const under = vehicles.filter((v) => v.height > c && distToPolygon(m, vehicleCorners(v)) <= OVER_REACH_M);
    add(under, `${what} over ${names(under)}`);
    for (const r of items) {
      if (r.kind !== 'route' || distToPath(m, r.points) > OVER_REACH_M) continue;
      const tall = vehicles.filter((v) => v.height > c);
      add(tall, `Route${r.label ? ` “${r.label}”` : ''} passes ${what} — taller on this map: ${names(tall)}`);
    }
  }
  return out;
}
