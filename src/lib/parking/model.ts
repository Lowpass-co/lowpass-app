/* ============================================
   LOWPASS — Parking maps: the saved shape (Nov 2026, Adam)

   A map is its anchor (lat/lng), the view it was left at, the items and
   free-text notes. Items are in the ground frame (geo.ts): metres east /
   north of the anchor. Headings are compass degrees (0 = the vehicle's front
   faces north, 90 = east).

   parseMapBody() is THE gate for anything a client sends: the items go into
   a jsonb column, so every field is checked, every number bounded, every
   string trimmed and capped, and unknown fields dropped. Nothing else writes
   parking_maps.items.
   ============================================ */

import { MARKERS, VEHICLES, AREAS, PAINTS, type AreaType, type MarkerType, type PaintId, type VehicleType } from './catalogue';
import { normDeg, type Camera3d, type LatLng, type Pt, type View } from './geo';

export interface VehicleItem {
  id: string;
  kind: 'vehicle';
  type: VehicleType;
  label: string;
  x: number;
  y: number;
  heading: number;
  length: number;
  width: number;
  height: number;
  /** A paint instead of the type's colour; absent = the type's colour. */
  colour?: PaintId;
}

export interface MarkerItem {
  id: string;
  kind: 'marker';
  type: MarkerType;
  label: string;
  detail: string;
  x: number;
  y: number;
}

export interface RouteItem {
  id: string;
  kind: 'route';
  label: string;
  points: Pt[];
}

export interface AreaItem {
  id: string;
  kind: 'area';
  type: AreaType;
  label: string;
  points: Pt[];
}

export interface MeasureItem {
  id: string;
  kind: 'measure';
  a: Pt;
  b: Pt;
}

export type ParkingItem = VehicleItem | MarkerItem | RouteItem | AreaItem | MeasureItem;

export interface ParkingMapData {
  anchor: LatLng;
  view: View;
  items: ParkingItem[];
  notes: string;
}

export const LIMITS = {
  items: 300,
  points: 200,
  label: 80,
  detail: 300,
  notes: 4000,
  /** Nothing on a parking map is further than this from the venue. */
  reach: 5000,
  /** Vehicle dimension bounds, metres. */
  minSize: 0.5,
  maxLength: 40,
  maxWidth: 6,
  maxHeight: 8,
} as const;

const VEHICLE_TYPES = new Set<string>(VEHICLES.map((v) => v.type));
const MARKER_TYPES = new Set<string>(MARKERS.map((m) => m.type));
const AREA_TYPES = new Set<string>(AREAS.map((a) => a.type));
const PAINT_IDS = new Set<string>(PAINTS.map((p) => p.id));

export class ParkingInputError extends Error {}

const fail = (msg: string): never => {
  throw new ParkingInputError(msg);
};

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);

function num(v: unknown, what: string, lo: number, hi: number): number {
  if (typeof v !== 'number' || !Number.isFinite(v)) fail(`${what} must be a number`);
  if ((v as number) < lo || (v as number) > hi) fail(`${what} is out of range`);
  return Math.round((v as number) * 1000) / 1000; // millimetre precision is plenty
}

function text(v: unknown, max: number): string {
  if (v == null) return '';
  if (typeof v !== 'string') fail('Text fields must be strings');
  return (v as string).replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '').trim().slice(0, max);
}

function paint(v: unknown): PaintId {
  if (typeof v !== 'string' || !PAINT_IDS.has(v)) fail('Unknown vehicle colour');
  return v as PaintId;
}

function id(v: unknown): string {
  if (typeof v !== 'string' || !/^[A-Za-z0-9_-]{1,40}$/.test(v)) fail('Each item needs a short id');
  return v as string;
}

function pt(v: unknown, what: string): Pt {
  if (!isObj(v)) fail(`${what} must be a point`);
  const o = v as Record<string, unknown>;
  return { x: num(o.x, `${what} x`, -LIMITS.reach, LIMITS.reach), y: num(o.y, `${what} y`, -LIMITS.reach, LIMITS.reach) };
}

function pts(v: unknown, what: string, min: number): Pt[] {
  if (!Array.isArray(v)) fail(`${what} must be a list of points`);
  const a = v as unknown[];
  if (a.length < min) fail(`${what} needs at least ${min} points`);
  if (a.length > LIMITS.points) fail(`${what} has too many points`);
  return a.map((p, i) => pt(p, `${what} point ${i + 1}`));
}

export function parseItem(raw: unknown): ParkingItem {
  if (!isObj(raw)) fail('Each item must be an object');
  const o = raw as Record<string, unknown>;
  switch (o.kind) {
    case 'vehicle': {
      if (typeof o.type !== 'string' || !VEHICLE_TYPES.has(o.type)) fail('Unknown vehicle type');
      return {
        id: id(o.id),
        kind: 'vehicle',
        type: o.type as VehicleType,
        label: text(o.label, LIMITS.label),
        ...pt(o, 'Vehicle'),
        heading: normDeg(num(o.heading, 'Heading', -3600, 3600)),
        length: num(o.length, 'Length', LIMITS.minSize, LIMITS.maxLength),
        width: num(o.width, 'Width', LIMITS.minSize, LIMITS.maxWidth),
        height: num(o.height, 'Height', LIMITS.minSize, LIMITS.maxHeight),
        ...(o.colour == null || o.colour === '' ? {} : { colour: paint(o.colour) }),
      };
    }
    case 'marker': {
      if (typeof o.type !== 'string' || !MARKER_TYPES.has(o.type)) fail('Unknown marker type');
      return {
        id: id(o.id),
        kind: 'marker',
        type: o.type as MarkerType,
        label: text(o.label, LIMITS.label),
        detail: text(o.detail, LIMITS.detail),
        ...pt(o, 'Marker'),
      };
    }
    case 'route':
      return { id: id(o.id), kind: 'route', label: text(o.label, LIMITS.label), points: pts(o.points, 'Route', 2) };
    case 'area': {
      if (typeof o.type !== 'string' || !AREA_TYPES.has(o.type)) fail('Unknown area type');
      return { id: id(o.id), kind: 'area', type: o.type as AreaType, label: text(o.label, LIMITS.label), points: pts(o.points, 'Area', 3) };
    }
    case 'measure':
      return { id: id(o.id), kind: 'measure', a: pt(o.a, 'Measure start'), b: pt(o.b, 'Measure end') };
    default:
      return fail('Unknown item kind');
  }
}

export function parseView(raw: unknown): View {
  if (!isObj(raw)) fail('view must be an object');
  const o = raw as Record<string, unknown>;
  return {
    cx: num(o.cx, 'View centre x', -LIMITS.reach, LIMITS.reach),
    cy: num(o.cy, 'View centre y', -LIMITS.reach, LIMITS.reach),
    ppm: num(o.ppm, 'Zoom', 0.01, 100),
    rotation: normDeg(num(o.rotation, 'Rotation', -3600, 3600)),
    ...(o.cam3d == null ? {} : { cam3d: parseCamera3d(o.cam3d) }),
  };
}

export function parseCamera3d(raw: unknown): Camera3d {
  if (!isObj(raw)) fail('cam3d must be an object');
  const o = raw as Record<string, unknown>;
  return {
    x: num(o.x, '3D camera x', -LIMITS.reach, LIMITS.reach),
    y: num(o.y, '3D camera y', -LIMITS.reach, LIMITS.reach),
    alt: num(o.alt, '3D camera height', -500, 10000),
    heading: normDeg(num(o.heading, '3D camera heading', -3600, 3600)),
    pitch: num(o.pitch, '3D camera pitch', -90, 90),
    roll: num(o.roll, '3D camera roll', -180, 180),
  };
}

export function parseAnchor(raw: unknown): LatLng {
  if (!isObj(raw)) fail('anchor must be { lat, lng }');
  const o = raw as Record<string, unknown>;
  return { lat: num(o.lat, 'Latitude', -85, 85), lng: num(o.lng, 'Longitude', -180, 180) };
}

/** The whole map a client sends. Throws ParkingInputError with a readable message. */
export function parseMapBody(raw: unknown): ParkingMapData {
  if (!isObj(raw)) fail('Send { anchor, view, items, notes }');
  const o = raw as Record<string, unknown>;
  if (!Array.isArray(o.items)) fail('items must be a list');
  const list = o.items as unknown[];
  if (list.length > LIMITS.items) fail(`A map holds at most ${LIMITS.items} items`);
  const items = list.map(parseItem);
  if (new Set(items.map((i) => i.id)).size !== items.length) fail('Two items share an id');
  return { anchor: parseAnchor(o.anchor), view: parseView(o.view), items, notes: text(o.notes, LIMITS.notes) };
}

/* ── Helpers the editor and PDF share ─────────────────────── */

/** The four corners of a vehicle, ground frame, front-left first, clockwise. */
export function vehicleCorners(v: Pick<VehicleItem, 'x' | 'y' | 'heading' | 'length' | 'width'>): Pt[] {
  const r = (v.heading * Math.PI) / 180;
  const fx = Math.sin(r);
  const fy = Math.cos(r); // forward unit vector (north = 0°)
  const rx = Math.cos(r);
  const ry = -Math.sin(r); // right-hand unit vector
  const hl = v.length / 2;
  const hw = v.width / 2;
  const at = (f: number, s: number): Pt => ({ x: v.x + fx * f + rx * s, y: v.y + fy * f + ry * s });
  return [at(hl, -hw), at(hl, hw), at(-hl, hw), at(-hl, -hw)];
}

/** "Bus 3" — the next free number for a vehicle prefix. */
export function nextLabel(items: ParkingItem[], prefix: string): string {
  const used = new Set(items.filter((i): i is VehicleItem => i.kind === 'vehicle').map((i) => i.label));
  for (let n = 1; ; n++) if (!used.has(`${prefix} ${n}`)) return `${prefix} ${n}`;
}

/** Length of a polyline, metres. */
export function pathLength(points: Pt[]): number {
  let s = 0;
  for (let i = 1; i < points.length; i++) s += Math.hypot(points[i].x - points[i - 1].x, points[i].y - points[i - 1].y);
  return s;
}

export function newItemId(): string {
  return Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);
}
