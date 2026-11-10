/* ============================================
   LOWPASS — Parking maps: the ground frame (Nov 2026, Adam)

   Everything on a parking map is stored in METRES around one fixed point
   (the map's anchor, normally the venue): x = metres east, y = metres north.
   Sizes are therefore true at any zoom, and the 3D page (phase 2) can place
   the same items without converting anything but the anchor.

   The frame is a local equirectangular projection: within a couple of
   kilometres of the anchor its distance error is far below a centimetre per
   metre, so a 13.7 m bus is 13.7 m. Google's tiles are Web Mercator; each
   tile is placed by its corners in this frame (tileRect), so imagery and
   items share one scale.

   SCREEN: the editor draws in "scene" space, which is the ground frame with y
   flipped (SVG y runs down): sceneY = -north. A view is a centre, a scale in
   pixels per metre, and a rotation — the compass bearing that points up the
   screen (0 = north up).
   ============================================ */

export const EARTH_RADIUS_M = 6378137; // WGS84 equatorial, the Web Mercator sphere
const DEG = Math.PI / 180;

export interface LatLng {
  lat: number;
  lng: number;
}

/** A point in the ground frame: metres east (x) and north (y) of the anchor. */
export interface Pt {
  x: number;
  y: number;
}

export function toLocal(anchor: LatLng, p: LatLng): Pt {
  return {
    x: (p.lng - anchor.lng) * DEG * EARTH_RADIUS_M * Math.cos(anchor.lat * DEG),
    y: (p.lat - anchor.lat) * DEG * EARTH_RADIUS_M,
  };
}

export function toLatLng(anchor: LatLng, p: Pt): LatLng {
  return {
    lat: anchor.lat + p.y / (DEG * EARTH_RADIUS_M),
    lng: anchor.lng + p.x / (DEG * EARTH_RADIUS_M * Math.cos(anchor.lat * DEG)),
  };
}

export const dist = (a: Pt, b: Pt): number => Math.hypot(b.x - a.x, b.y - a.y);

/** Compass bearing (0 = north, clockwise) from a to b. */
export function bearing(a: Pt, b: Pt): number {
  return normDeg(Math.atan2(b.x - a.x, b.y - a.y) / DEG);
}

export const normDeg = (d: number): number => ((d % 360) + 360) % 360;

/* ── The view ─────────────────────────────────────────────── */

export interface View {
  /** Centre of the screen, ground frame. */
  cx: number;
  cy: number;
  /** Screen pixels per metre. */
  ppm: number;
  /** Compass bearing that points up the screen. 0 = north up. */
  rotation: number;
  /** The 3D page's saved camera (phase 2), if chosen. */
  cam3d?: Camera3d;
  /** The PDF's pages, in order (pages.ts). Absent = the default plan + 3D. */
  pages?: import('./pages').PdfPage[];
}

/** A 3D camera: position in the ground frame + ellipsoid height (m), and
 *  heading (compass °), pitch (° — negative looks down) and roll (°). */
export interface Camera3d {
  x: number;
  y: number;
  alt: number;
  heading: number;
  pitch: number;
  roll: number;
}

export const PPM_MIN = 0.05; // ~whole city district on screen
export const PPM_MAX = 40; // a car fills a phone

export const clampPpm = (p: number): number => Math.min(PPM_MAX, Math.max(PPM_MIN, p));

/** Ground → screen pixels, for a viewport of w × h. */
export function project(v: View, w: number, h: number, p: Pt): Pt {
  const dx = (p.x - v.cx) * v.ppm;
  const dy = (p.y - v.cy) * v.ppm;
  const r = v.rotation * DEG;
  // Rotating the map by `rotation` turns the ground the other way on screen.
  const ex = dx * Math.cos(r) - dy * Math.sin(r);
  const ny = dx * Math.sin(r) + dy * Math.cos(r);
  return { x: w / 2 + ex, y: h / 2 - ny };
}

/** Screen pixels → ground. Exact inverse of project. */
export function unproject(v: View, w: number, h: number, s: Pt): Pt {
  const ex = s.x - w / 2;
  const ny = h / 2 - s.y;
  const r = v.rotation * DEG;
  const dx = ex * Math.cos(r) + ny * Math.sin(r);
  const dy = -ex * Math.sin(r) + ny * Math.cos(r);
  return { x: v.cx + dx / v.ppm, y: v.cy + dy / v.ppm };
}

/** Zoom about a screen point (the cursor), keeping the ground under it still. */
export function zoomAt(v: View, w: number, h: number, s: Pt, factor: number): View {
  const before = unproject(v, w, h, s);
  const next = { ...v, ppm: clampPpm(v.ppm * factor) };
  const after = unproject(next, w, h, s);
  return { ...next, cx: next.cx + (before.x - after.x), cy: next.cy + (before.y - after.y) };
}

/** The SVG transform that takes scene space (x east, y SOUTH, metres) to screen. */
export function sceneTransform(v: View, w: number, h: number): string {
  return `translate(${w / 2} ${h / 2}) rotate(${-v.rotation}) scale(${v.ppm}) translate(${-v.cx} ${v.cy})`;
}

/* ── Web Mercator tiles ───────────────────────────────────── */

export interface TileKey {
  z: number;
  x: number;
  y: number;
}

export function lngLatToTile(p: LatLng, z: number): { x: number; y: number } {
  const n = 2 ** z;
  const x = ((p.lng + 180) / 360) * n;
  const s = Math.sin(Math.max(-85.0511, Math.min(85.0511, p.lat)) * DEG);
  const y = (0.5 - Math.log((1 + s) / (1 - s)) / (4 * Math.PI)) * n;
  return { x, y };
}

function tileToLngLat(x: number, y: number, z: number): LatLng {
  const n = 2 ** z;
  const lng = (x / n) * 360 - 180;
  const lat = Math.atan(Math.sinh(Math.PI * (1 - (2 * y) / n))) / DEG;
  return { lat, lng };
}

/** A tile's rectangle in SCENE space (x east, y south), metres. */
export function tileRect(anchor: LatLng, t: TileKey): { x: number; y: number; w: number; h: number } {
  const nw = toLocal(anchor, tileToLngLat(t.x, t.y, t.z));
  const se = toLocal(anchor, tileToLngLat(t.x + 1, t.y + 1, t.z));
  return { x: nw.x, y: -nw.y, w: se.x - nw.x, h: nw.y - se.y };
}

/** Ground metres per 256-px tile pixel at zoom z, at this latitude. */
export const metresPerTilePixel = (lat: number, z: number): number =>
  (2 * Math.PI * EARTH_RADIUS_M * Math.cos(lat * DEG)) / (256 * 2 ** z);

/**
 * The tile zoom whose pixels are at least as dense as the screen's.
 * `density` = device pixels per CSS pixel × tile pixels per 256-px cell
 * (2 for Google's scaleFactor2x + highDpi tiles cancels a 2× screen).
 */
export function tileZoomFor(lat: number, ppm: number, dpr: number, tileScale: number, maxZoom: number): number {
  const want = (2 * Math.PI * EARTH_RADIUS_M * Math.cos(lat * DEG) * ppm * dpr) / (256 * tileScale);
  const z = Math.ceil(Math.log2(Math.max(1, want)));
  return Math.max(1, Math.min(maxZoom, z));
}

export const MAX_TILES = 120;

/** Tiles covering a w × h viewport (any rotation), nearest-first, capped. */
export function visibleTiles(anchor: LatLng, v: View, w: number, h: number, z: number, pad = 0): TileKey[] {
  const corners = [
    { x: -pad, y: -pad },
    { x: w + pad, y: -pad },
    { x: w + pad, y: h + pad },
    { x: -pad, y: h + pad },
  ].map((s) => lngLatToTile(toLatLng(anchor, unproject(v, w, h, s)), z));
  const n = 2 ** z;
  const x0 = Math.max(0, Math.floor(Math.min(...corners.map((c) => c.x))));
  const x1 = Math.min(n - 1, Math.floor(Math.max(...corners.map((c) => c.x))));
  const y0 = Math.max(0, Math.floor(Math.min(...corners.map((c) => c.y))));
  const y1 = Math.min(n - 1, Math.floor(Math.max(...corners.map((c) => c.y))));
  const centre = lngLatToTile(toLatLng(anchor, { x: v.cx, y: v.cy }), z);
  const out: TileKey[] = [];
  for (let x = x0; x <= x1; x++) for (let y = y0; y <= y1; y++) out.push({ z, x, y });
  out.sort((a, b) => Math.hypot(a.x + 0.5 - centre.x, a.y + 0.5 - centre.y) - Math.hypot(b.x + 0.5 - centre.x, b.y + 0.5 - centre.y));
  return out.slice(0, MAX_TILES);
}

/** Ground bounds of a viewport (for Google's viewport/attribution call). */
export function viewBounds(anchor: LatLng, v: View, w: number, h: number): { north: number; south: number; east: number; west: number } {
  const ll = [
    { x: 0, y: 0 },
    { x: w, y: 0 },
    { x: w, y: h },
    { x: 0, y: h },
  ].map((s) => toLatLng(anchor, unproject(v, w, h, s)));
  return {
    north: Math.max(...ll.map((p) => p.lat)),
    south: Math.min(...ll.map((p) => p.lat)),
    east: Math.max(...ll.map((p) => p.lng)),
    west: Math.min(...ll.map((p) => p.lng)),
  };
}

/* ── Scale ────────────────────────────────────────────────── */

/** A round scale-bar length (1, 2, 5 × 10ⁿ m) no longer than maxMetres. */
export function niceLength(maxMetres: number): number {
  if (!(maxMetres > 0)) return 0;
  const p = 10 ** Math.floor(Math.log10(maxMetres));
  for (const m of [5, 2, 1]) if (m * p <= maxMetres) return m * p;
  return p;
}

/** Print scales offered on the PDF, 1:N. */
export const PRINT_SCALES = [100, 200, 250, 500, 750, 1000, 1250, 1500, 2000, 2500, 5000, 10000] as const;

/** The largest print scale (most detail) at which `metresWide` fits `mmWide` of paper. */
export function printScaleFor(metresWide: number, mmWide: number): number {
  const need = (metresWide * 1000) / mmWide;
  return PRINT_SCALES.find((s) => s >= need) ?? PRINT_SCALES[PRINT_SCALES.length - 1];
}

export function fmtMetres(m: number): string {
  if (m >= 1000) return `${(m / 1000).toFixed(m >= 10000 ? 0 : 1)} km`;
  if (m >= 100) return `${Math.round(m)} m`;
  return `${m.toFixed(1).replace(/\.0$/, '')} m`;
}
