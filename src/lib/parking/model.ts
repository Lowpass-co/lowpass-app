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
import { PRINT_SCALES, normDeg, type Camera3d, type LatLng, type Pt, type View } from './geo';
import type { PdfPage, PrintScale } from './pages';

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
  /** Level (floor height, m, relative to the street); absent = the level it's drawn on (drawings.ts). */
  floor?: number;
}

export interface MarkerItem {
  id: string;
  kind: 'marker';
  type: MarkerType;
  label: string;
  detail: string;
  x: number;
  y: number;
  /** Height limit markers: the clear height, m (headroom checks). */
  clear?: number;
  floor?: number;
}

export interface RouteItem {
  id: string;
  kind: 'route';
  label: string;
  points: Pt[];
  floor?: number;
}

export interface AreaItem {
  id: string;
  kind: 'area';
  type: AreaType;
  label: string;
  points: Pt[];
  floor?: number;
}

export interface MeasureItem {
  id: string;
  kind: 'measure';
  a: Pt;
  b: Pt;
  floor?: number;
}

export type ParkingItem = VehicleItem | MarkerItem | RouteItem | AreaItem | MeasureItem;

/* ── Venue drawings (Nov 2026, Adam) ─────────────────────────
   A venue's PDF / JPG plan laid on the map at true scale. Source units are
   PDF points (the page as shown, /Rotate applied) or image pixels: u right,
   v DOWN from the page's top-left. drawings.ts maps them to the ground:
     ground = (x, y) + R(rotation) · (u·scale, −v·scale)
   R turns clockwise (compass sense). Only metres reach the ground frame —
   the drawing is placed by numbers, never by pixels on someone's screen. */

export interface SrcPt {
  u: number;
  v: number;
}

export interface DrawingCalibration {
  /** The dimension clicked on the drawing and what it says, metres. */
  a: SrcPt;
  b: SrcPt;
  metres: number;
  /** A second dimension, checked against the first. */
  check?: { a: SrcPt; b: SrcPt; metres: number };
}

export interface ParkingDrawing {
  id: string;
  /** The file in tour Files (file_references.id). */
  fileId: string;
  name: string;
  kind: 'pdf' | 'image';
  /** PDF page, 1-based (1 for an image). */
  page: number;
  /** The page size, source units. */
  srcW: number;
  srcH: number;
  /** The part that shows, source units. */
  crop: { u0: number; v0: number; u1: number; v1: number };
  /** Metres per source unit. */
  scale: number;
  calib: DrawingCalibration | null;
  /** Ground position of the source origin, metres. */
  x: number;
  y: number;
  /** Compass degrees, clockwise: how far the drawing's "up" is turned from north. */
  rotation: number;
  /** Matched to the satellite by two points (vs placed by hand). */
  pinned: boolean;
  /** How far the satellite disagreed with the drawing's own scale when pinned, %. */
  pinCheck: number | null;
  opacity: number;
  hidden: boolean;
  /** Inside a building: 3D cuts the roof away and shows this as the floor. */
  inside: boolean;
  /** Floor height relative to the street, metres (−5 = a basement dock). */
  floor: number;
  /** Clear height inside, metres (headroom checks). */
  clearHeight: number | null;
}

export interface ParkingMapData {
  anchor: LatLng;
  view: View;
  items: ParkingItem[];
  notes: string;
  drawings: ParkingDrawing[];
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
  /** PDF pages (pages.ts). */
  pages: 12,
  pageTitle: 60,
  /** Venue drawings per map; their units (PDF points / image px) and scale. */
  drawings: 8,
  drawingName: 120,
  srcMax: 40000,
  /** Floor heights relative to the street, m. */
  floorMin: -30,
  floorMax: 30,
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

function floorOf(o: Record<string, unknown>): { floor?: number } {
  return o.floor == null || o.floor === '' ? {} : { floor: num(o.floor, 'Level', LIMITS.floorMin, LIMITS.floorMax) };
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
        ...floorOf(o),
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
        ...(o.clear == null || o.clear === '' ? {} : { clear: num(o.clear, 'Clear height', 0.5, 20) }),
        ...floorOf(o),
      };
    }
    case 'route':
      return { id: id(o.id), kind: 'route', label: text(o.label, LIMITS.label), points: pts(o.points, 'Route', 2), ...floorOf(o) };
    case 'area': {
      if (typeof o.type !== 'string' || !AREA_TYPES.has(o.type)) fail('Unknown area type');
      return { id: id(o.id), kind: 'area', type: o.type as AreaType, label: text(o.label, LIMITS.label), points: pts(o.points, 'Area', 3), ...floorOf(o) };
    }
    case 'measure':
      return { id: id(o.id), kind: 'measure', a: pt(o.a, 'Measure start'), b: pt(o.b, 'Measure end'), ...floorOf(o) };
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
    ...(o.pages == null ? {} : { pages: parsePages(o.pages) }),
    ...(o.satellite === false ? { satellite: false } : {}),
    ...(o.level == null || o.level === '' ? {} : { level: num(o.level, 'Level', LIMITS.floorMin, LIMITS.floorMax) }),
  };
}

function srcPt(v: unknown, what: string): SrcPt {
  if (!isObj(v)) fail(`${what} must be a point on the drawing`);
  const o = v as Record<string, unknown>;
  return { u: num(o.u, `${what} across`, -LIMITS.srcMax, LIMITS.srcMax), v: num(o.v, `${what} down`, -LIMITS.srcMax, LIMITS.srcMax) };
}

/** Full precision for numbers that get multiplied up (a scale in m per PDF
 *  point is ~0.1; rounding it to 0.001 would be a 1 % error). */
function fine(v: unknown, what: string, lo: number, hi: number): number {
  if (typeof v !== 'number' || !Number.isFinite(v)) fail(`${what} must be a number`);
  if ((v as number) < lo || (v as number) > hi) fail(`${what} is out of range`);
  return v as number;
}

/** The map's venue drawings. Every field checked; at most LIMITS.drawings. */
export function parseDrawings(raw: unknown): ParkingDrawing[] {
  if (raw == null) return [];
  if (!Array.isArray(raw)) fail('drawings must be a list');
  const list = raw as unknown[];
  if (list.length > LIMITS.drawings) fail(`A map holds at most ${LIMITS.drawings} drawings`);
  const out = list.map((r): ParkingDrawing => {
    if (!isObj(r)) fail('Each drawing must be an object');
    const o = r as Record<string, unknown>;
    if (typeof o.fileId !== 'string' || !/^[0-9a-f-]{36}$/i.test(o.fileId)) fail('A drawing needs its file');
    if (o.kind !== 'pdf' && o.kind !== 'image') fail('A drawing is a PDF or an image');
    const srcW = num(o.srcW, 'Drawing width', 1, LIMITS.srcMax);
    const srcH = num(o.srcH, 'Drawing height', 1, LIMITS.srcMax);
    if (!isObj(o.crop)) fail('A drawing needs its crop');
    const c = o.crop as Record<string, unknown>;
    const crop = {
      u0: num(c.u0, 'Crop left', 0, srcW),
      v0: num(c.v0, 'Crop top', 0, srcH),
      u1: num(c.u1, 'Crop right', 0, srcW),
      v1: num(c.v1, 'Crop bottom', 0, srcH),
    };
    if (crop.u1 - crop.u0 < 1 || crop.v1 - crop.v0 < 1) fail('The crop is empty');
    let calib: DrawingCalibration | null = null;
    if (o.calib != null) {
      if (!isObj(o.calib)) fail('Calibration must be an object');
      const k = o.calib as Record<string, unknown>;
      calib = { a: srcPt(k.a, 'Dimension start'), b: srcPt(k.b, 'Dimension end'), metres: num(k.metres, 'Dimension', 0.01, 10000) };
      if (k.check != null) {
        if (!isObj(k.check)) fail('Check must be an object');
        const q = k.check as Record<string, unknown>;
        calib.check = { a: srcPt(q.a, 'Check start'), b: srcPt(q.b, 'Check end'), metres: num(q.metres, 'Check dimension', 0.01, 10000) };
      }
    }
    return {
      id: id(o.id),
      fileId: (o.fileId as string).toLowerCase(),
      name: text(o.name, LIMITS.drawingName) || 'Drawing',
      kind: o.kind as 'pdf' | 'image',
      page: Math.round(num(o.page, 'Page', 1, 500)),
      srcW,
      srcH,
      crop,
      scale: fine(o.scale, 'Drawing scale', 1e-5, 100),
      calib,
      x: num(o.x, 'Drawing position x', -LIMITS.reach * 4, LIMITS.reach * 4),
      y: num(o.y, 'Drawing position y', -LIMITS.reach * 4, LIMITS.reach * 4),
      rotation: normDeg(fine(o.rotation, 'Drawing rotation', -3600, 3600)),
      pinned: o.pinned === true,
      pinCheck: o.pinCheck == null ? null : num(o.pinCheck, 'Pin check', -1000, 1000),
      opacity: num(o.opacity ?? 0.85, 'Opacity', 0.1, 1),
      hidden: o.hidden === true,
      inside: o.inside === true,
      floor: num(o.floor ?? 0, 'Floor', LIMITS.floorMin, LIMITS.floorMax),
      clearHeight: o.clearHeight == null || o.clearHeight === '' ? null : num(o.clearHeight, 'Clear height', 0.5, 30),
    };
  });
  if (new Set(out.map((d) => d.id)).size !== out.length) fail('Two drawings share an id');
  return out;
}

const PRINT_SCALE_SET = new Set<number>(PRINT_SCALES);

function printScale(v: unknown): PrintScale {
  if (typeof v !== 'number' || !PRINT_SCALE_SET.has(v)) fail('Unknown print scale');
  return v as PrintScale;
}

/** The PDF's page list (pages.ts). Every field checked; at most LIMITS.pages. */
export function parsePages(raw: unknown): PdfPage[] {
  if (!Array.isArray(raw)) fail('pages must be a list');
  const list = raw as unknown[];
  if (list.length > LIMITS.pages) fail(`A PDF holds at most ${LIMITS.pages} pages`);
  const pages = list.map((r): PdfPage => {
    if (!isObj(r)) fail('Each page must be an object');
    const o = r as Record<string, unknown>;
    const base = { id: id(o.id), title: text(o.title, LIMITS.pageTitle) || 'Page' };
    if (o.kind === '3d') return { ...base, kind: '3d', cam: o.cam == null ? null : parseCamera3d(o.cam) };
    if (o.kind !== 'plan') fail('Unknown page kind');
    const lv = o.level == null || o.level === '' ? {} : { level: num(o.level, 'Page level', LIMITS.floorMin, LIMITS.floorMax) };
    if (o.fit === true) return { ...base, kind: 'plan', fit: true, scale: o.scale === 'auto' || o.scale == null ? 'auto' : printScale(o.scale), ...lv };
    return {
      ...base,
      ...lv,
      kind: 'plan',
      fit: false,
      cx: num(o.cx, 'Page centre x', -LIMITS.reach, LIMITS.reach),
      cy: num(o.cy, 'Page centre y', -LIMITS.reach, LIMITS.reach),
      rotation: normDeg(num(o.rotation, 'Page rotation', -3600, 3600)),
      scale: printScale(o.scale),
    };
  });
  if (new Set(pages.map((p) => p.id)).size !== pages.length) fail('Two pages share an id');
  return pages;
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

/** Degrees, kept to 1e-7 (≈ 1 cm). NEVER num(): its 0.001 is a millimetre in
 *  metres but ~111 m in degrees — the anchor used to be saved that coarse, so
 *  every drawing jumped up to ~55 m against the imagery on reload (Nov 2026). */
function deg(v: unknown, what: string, lo: number, hi: number): number {
  if (typeof v !== 'number' || !Number.isFinite(v)) fail(`${what} must be a number`);
  if ((v as number) < lo || (v as number) > hi) fail(`${what} is out of range`);
  return Math.round((v as number) * 1e7) / 1e7;
}

export function parseAnchor(raw: unknown): LatLng {
  if (!isObj(raw)) fail('anchor must be { lat, lng }');
  const o = raw as Record<string, unknown>;
  return { lat: deg(o.lat, 'Latitude', -85, 85), lng: deg(o.lng, 'Longitude', -180, 180) };
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
  return { anchor: parseAnchor(o.anchor), view: parseView(o.view), items, notes: text(o.notes, LIMITS.notes), drawings: parseDrawings(o.drawings) };
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
