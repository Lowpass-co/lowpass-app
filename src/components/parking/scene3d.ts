'use client';

/* ============================================
   Parking map — the 3D scene (phase 2, Nov 2026, Adam)

   ONE builder for the live 3D page and the PDF's page 2, as <ParkingScene> is
   for the overhead plan. Google Photorealistic 3D Tiles (same Map Tiles API
   key as the satellite) rendered by CesiumJS, with the drawing on top:

     · vehicles — true-size blocks from blocks3d.ts (the overhead plan's parts,
       lifted to their real heights), at the ground height sampled from the
       mesh: the LOWEST of the vehicle's centre and corners, so a tree over a
       bus doesn't lift it onto the canopy
     · routes, areas, measurements — draped on the ground
     · markers and vehicle names — labels that stay readable through roofs,
       laid out each frame (labels3d.ts): nearest first, a label that would
       touch one already placed is hidden — no stacks over parked rows
     · venue drawings (Nov 2026): an INSIDE drawing cuts its footprint out of
       the Google mesh (ClippingPolygonCollection — the roof comes off) and
       lies there as the floor, at the street height around it + its floor
       (−5 m = a basement); vehicles and markers on it stand on it. Google's
       mesh is a shell, so the hole shows the plan, not columns or a ceiling.
       With no satellite (or no key), every drawing is a floor on a plain
       ground. Outside drawings over the satellite stay off 3D: the mesh is
       the real thing there.

   Google's terms (tile/policies): attribution shown on screen
   (showCreditsOnScreen), nothing cached by us, our objects are our own — not
   traced or extracted from the tiles.
   ============================================ */

import type * as CesiumNS from 'cesium';
import { dist, fmtMetres, tileRect, tilesCovering, toLatLng, toLocal, type Camera3d, type LatLng, type Pt } from '@/lib/parking/geo';
import { getTileSession, tileUrl } from './googleTiles';
import { areaLabel, markerSpec, vehicleSpec } from '@/lib/parking/catalogue';
import { ringAround, standingHeight, vehicleBlocks, type Block } from '@/lib/parking/blocks3d';
import { vehicleCorners, type AreaItem, type ParkingDrawing, type ParkingItem, type VehicleItem } from '@/lib/parking/model';
import { rimRuns, smoothTops, wallRing, wallSegments, type WallSegment } from '@/lib/parking/walls3d';
import { drawingsIn3d, drawingUnder, footprint, insideAt, insideFootprint, itemFloor, itemPoint, pointInPolygon, svgMatrix } from '@/lib/parking/drawings';
import type { PartKind } from '@/lib/parking/silhouettes';
import { labelBox, placeLabels, type LabelBox } from '@/lib/parking/labels3d';
import { areaColour, vehicleColour, type Palette } from './palette';
import type { CesiumModule } from './loadCesium';

type C = CesiumModule;

export function createViewer(Cesium: C, container: HTMLElement, opts: { withTiles: boolean; blank: string; sky: string }): CesiumNS.Viewer {
  const viewer = new Cesium.Viewer(container, {
    baseLayer: false,
    baseLayerPicker: false,
    geocoder: false,
    homeButton: false,
    sceneModePicker: false,
    navigationHelpButton: false,
    animation: false,
    timeline: false,
    fullscreenButton: false,
    infoBox: false,
    selectionIndicator: false,
    // The Google mesh IS the ground; without a key, a plain globe stands in.
    globe: opts.withTiles ? false : undefined,
    // So the canvas can be read back for the PDF.
    contextOptions: { webgl: { preserveDrawingBuffer: true } },
  });
  // A plain sky, no stars / sun / atmosphere: with the globe off, Cesium's
  // atmosphere painted over everything below the horizon, vehicles included
  // (seen in testing). The Google mesh covers the ground; above it, sky.
  const scene = viewer.scene;
  if (scene.skyBox) scene.skyBox.show = false;
  if (scene.skyAtmosphere) scene.skyAtmosphere.show = false;
  if (scene.sun) scene.sun.show = false;
  if (scene.moon) scene.moon.show = false;
  scene.backgroundColor = Cesium.Color.fromCssColorString(opts.sky);
  if (scene.globe) scene.globe.baseColor = Cesium.Color.fromCssColorString(opts.blank);
  // Mouse, as in Apple / Google Maps: left-drag moves, RIGHT-drag (or
  // Ctrl / middle-drag) turns and tilts, wheel / pinch zooms. Cesium's
  // default had right-drag zooming, so there was no obvious way to turn.
  // Touch: PINCH must stay in BOTH lists — Cesium hands one two-finger
  // gesture to zoom (spread) AND tilt (twist = turn, slide up/down = tilt).
  // Leaving it out of tilt (as this list once did) left phones zoom-only.
  const ctl = scene.screenSpaceCameraController;
  ctl.tiltEventTypes = [
    Cesium.CameraEventType.RIGHT_DRAG,
    Cesium.CameraEventType.PINCH,
    Cesium.CameraEventType.MIDDLE_DRAG,
    { eventType: Cesium.CameraEventType.LEFT_DRAG, modifier: Cesium.KeyboardEventModifier.CTRL },
  ];
  ctl.zoomEventTypes = [Cesium.CameraEventType.WHEEL, Cesium.CameraEventType.PINCH];
  return viewer;
}

export interface Scene3d {
  tileset: CesiumNS.Cesium3DTileset | null;
  /** Ground height (ellipsoid metres) at the anchor — the default camera's target height. */
  ground0: number;
}

const rad = (d: number) => (d * Math.PI) / 180;
const deg = (r: number) => (r * 180) / Math.PI;

function blockColour(Cesium: C, p: Palette, base: string, kind: PartKind): CesiumNS.Color {
  const body = Cesium.Color.fromCssColorString(base);
  switch (kind) {
    case 'cab':
      return body.darken(0.3, new Cesium.Color());
    case 'cabin':
      return body.darken(0.22, new Cesium.Color());
    case 'wheel':
      return Cesium.Color.fromCssColorString(p.halo);
    case 'hood':
      return body.darken(0.18, new Cesium.Color());
    case 'roof':
      return body.brighten(0.35, new Cesium.Color());
    case 'glass':
    case 'mirror':
    case 'coupling':
      return Cesium.Color.fromCssColorString(p.halo);
    default:
      return body;
  }
}

/** Add the tiles and the drawing to a viewer. Resolves once ground heights are known. */
export async function populate(
  Cesium: C,
  viewer: CesiumNS.Viewer,
  o: {
    anchor: LatLng;
    items: ParkingItem[];
    palette: Palette;
    tilesKey: string | null;
    /** The map's drawings (levels + floors) and their clear-lines rasters, laid on the floors. */
    drawings?: ParkingDrawing[];
    floors?: ReadonlyMap<string, HTMLCanvasElement>;
  },
): Promise<Scene3d> {
  // Heights use EVERY drawing (a vehicle inside a hidden drawing still stands
  // on the street under the roof, not on top of it); the roof cut and the
  // floors only the shown ones.
  const drawings = o.drawings ?? [];
  const shown = drawingsIn3d(drawings);
  let tileset: CesiumNS.Cesium3DTileset | null = null;
  if (o.tilesKey) {
    tileset = await Cesium.createGooglePhotorealistic3DTileset({ key: o.tilesKey, onlyUsingWithGoogleGeocoder: true });
    tileset.showCreditsOnScreen = true;
    viewer.scene.primitives.add(tileset);
  }

  const ll = (p: Pt) => toLatLng(o.anchor, p);
  const vehicles = o.items.filter((i): i is VehicleItem => i.kind === 'vehicle');

  // One batch of height samples: each vehicle's centre + corners, each marker, the anchor.
  const probes: { key: string; at: Pt }[] = [{ key: 'anchor', at: { x: 0, y: 0 } }];
  for (const v of vehicles) {
    [{ x: v.x, y: v.y }, ...vehicleCorners(v)].forEach((at, i) => probes.push({ key: `${v.id}:${i}`, at }));
    // The ground round it: tells a canopy over the vehicle from the street (standingHeight).
    ringAround(v, Math.max(8, v.length * 0.6)).forEach((at, i) => probes.push({ key: `${v.id}:ring:${i}`, at }));
  }
  for (const i of o.items) if (i.kind === 'marker') probes.push({ key: i.id, at: { x: i.x, y: i.y } });
  // The street around each inside drawing: its corners and edge middles, 4 m out.
  const inside = tileset ? drawings.filter((d) => d.inside) : [];
  for (const d of inside) {
    const f = insideFootprint(d);
    const n = f.length;
    const c = { x: f.reduce((a, q) => a + q.x, 0) / n, y: f.reduce((a, q) => a + q.y, 0) / n };
    // ≤ 16 probes: the outline's points and edge middles, thinned on long outlines.
    const step = Math.max(1, Math.ceil((2 * n) / 16));
    const ring = f.flatMap((q, i) => [q, { x: (q.x + f[(i + 1) % n].x) / 2, y: (q.y + f[(i + 1) % n].y) / 2 }]).filter((_, i) => i % step === 0);
    ring.forEach((q, i) => {
      const l = Math.hypot(q.x - c.x, q.y - c.y) || 1;
      probes.push({ key: `street:${d.id}:${i}`, at: { x: q.x + ((q.x - c.x) / l) * 4, y: q.y + ((q.y - c.y) / l) * 4 } });
    });
  }
  // The roof height along each shown inside drawing's cut edge: its walls'
  // tops (walls3d.ts). Sampled before the cut, so the roof is still there.
  const rings = new Map<string, Pt[]>();
  for (const d of inside) {
    if (d.hidden) continue;
    const ring = wallRing(insideFootprint(d));
    rings.set(d.id, ring);
    ring.forEach((at, i) => probes.push({ key: `wall:${d.id}:${i}`, at }));
  }
  // "Flat in 3D" areas: the street height round their edge, same way.
  const flats = tileset
    ? o.items.filter((i): i is AreaItem => i.kind === 'area' && !!i.flat3d && i.points.length > 2 && i.floor == null)
    : [];
  for (const a of flats) {
    const step = Math.max(1, Math.ceil(a.points.length / 16));
    a.points.filter((_, i) => i % step === 0).forEach((at, i) => probes.push({ key: `flat:${a.id}:${i}`, at }));
  }
  const heights = new Map<string, number>();
  if (tileset) {
    const carto = probes.map((pr) => {
      const g = ll(pr.at);
      return Cesium.Cartographic.fromDegrees(g.lng, g.lat);
    });
    try {
      const sampled = await viewer.scene.sampleHeightMostDetailed(carto);
      sampled.forEach((c, i) => {
        if (c && Number.isFinite(c.height)) heights.set(probes[i].key, c.height);
      });
    } catch {
      /* no heights → everything sits at the anchor's height below */
    }
  }
  const ground0 = heights.get('anchor') ?? 0;
  // A drawing's street height: the lowest ground just outside it (the roof is not the street).
  const street = new Map<string, number>();
  for (const d of drawings) {
    const hs = Array.from({ length: 16 }, (_, i) => heights.get(`street:${d.id}:${i}`)).filter((h): h is number => h != null);
    street.set(d.id, hs.length ? Math.min(...hs) : ground0);
  }
  const flatHeight = new Map<string, number>();
  for (const a of flats) {
    const hs = Array.from({ length: 16 }, (_, i) => heights.get(`flat:${a.id}:${i}`)).filter((h): h is number => h != null);
    flatHeight.set(a.id, hs.length ? Math.min(...hs) : ground0);
  }
  // Inside drawings take the roof off, "Flat in 3D" areas take everything off
  // (Google's model has whatever was parked there baked in): the mesh is
  // clipped to their outlines.
  const cuts = [...inside.filter((d) => shown.includes(d)).map((d) => insideFootprint(d)), ...flats.map((a) => a.points)];
  if (tileset && cuts.length) {
    tileset.clippingPolygons = new Cesium.ClippingPolygonCollection({
      polygons: cuts.map((f) => new Cesium.ClippingPolygon({ positions: Cesium.Cartesian3.fromDegreesArray(f.flatMap((q) => [ll(q).lng, ll(q).lat])) })),
    });
  }
  // …and the flat satellite photo laid where a "Flat in 3D" area was cut.
  await Promise.all(flats.map((a) => addSatellitePatch(Cesium, viewer, o.anchor, a.points, (flatHeight.get(a.id) ?? ground0) + 0.02, o.palette.floor)));
  const flatAt = (p: Pt): number | null => {
    const a = flats.find((f) => pointInPolygon(p, f.points));
    return a ? flatHeight.get(a.id) ?? ground0 : null;
  };
  // The floors: every inside drawing's inside area (a floor colour under the
  // drawing's lines — drawn even before the lines are ready, so the cut-away
  // never shows as a hole); with no city mesh, every drawing.
  for (const d of shown) {
    if (tileset && !d.inside) continue;
    addFloor(Cesium, viewer, o.anchor, d, o.floors?.get(d.id) ?? null, (d.inside ? street.get(d.id) ?? ground0 : ground0) + (d.inside ? d.floor : 0) + 0.03, o.palette.floor);
  }
  // Walls on the cut edge, floor to roof, so the cut-away reads as a building
  // with its roof lifted off rather than a hole in the world.
  for (const d of shown) {
    const ring = rings.get(d.id);
    if (!ring) continue;
    const bottom = (street.get(d.id) ?? ground0) + d.floor;
    // Smoothed: a mast or cable over the edge mustn't pull a wall up it.
    const tops = smoothTops(ring.map((_, i) => heights.get(`wall:${d.id}:${i}`) ?? null));
    const walls = wallSegments(ring, tops, bottom);
    for (const w of walls) addWall(Cesium, viewer, o.anchor, w, o.palette.wall);
    // The rim: a thin light line along the wall tops, where the roof was cut.
    for (const run of rimRuns(walls)) {
      viewer.entities.add({
        polyline: {
          positions: Cesium.Cartesian3.fromDegreesArrayHeights(run.flatMap(([x, y, h]) => {
            const g = ll({ x, y });
            return [g.lng, g.lat, h + 0.05];
          })),
          width: 2,
          arcType: Cesium.ArcType.NONE,
          material: Cesium.Color.fromCssColorString(o.palette.rim),
        },
      });
    }
  }
  /** Where an item stands: on the inside drawing under it (its street + the item's level), else `fallback`. */
  const baseFor = (it: ParkingItem, fallback: number) => {
    const under = insideAt(drawings, itemPoint(it));
    if (!under.length) return flatAt(itemPoint(it)) ?? fallback;
    const d = drawingUnder(it, drawings) ?? under[0];
    return (street.get(d.id) ?? ground0) + itemFloor(it, drawings);
  };
  /** A route / area / measure lying wholly on one inside drawing is drawn on its floor, not draped on a mesh that isn't there. */
  const floorOfShape = (it: ParkingItem, pts: Pt[]): number | null => {
    const d = drawingUnder(it, drawings);
    if (!d) {
      // Wholly on one flat area: lie on the photo, not on the cut-away mesh.
      const a = flats.find((f) => pts.every((q) => pointInPolygon(q, f.points)));
      return a ? (flatHeight.get(a.id) ?? ground0) + 0.08 : null;
    }
    return pts.every((q) => pointInPolygon(q, insideFootprint(d))) ? (street.get(d.id) ?? ground0) + itemFloor(it, drawings) + 0.08 : null;
  };

  const ink = Cesium.Color.fromCssColorString(o.palette.ink);
  const halo = Cesium.Color.fromCssColorString(o.palette.halo);
  // Labels: one collection, small and quiet (a translucent chip, name only —
  // sizes are in the vehicle list / the PDF key), laid out every frame so
  // they never stack (see layoutLabels).
  const labels = viewer.scene.primitives.add(new Cesium.LabelCollection()) as CesiumNS.LabelCollection;
  const placed: PlacedLabel[] = [];
  const chip = Cesium.Color.fromCssColorString(o.palette.chip).withAlpha(0.68);
  const addLabel = (position: CesiumNS.Cartesian3, text: string, size: number, offsetY = 0) => {
    if (!text.trim()) return;
    const font = `600 ${size}px system-ui, sans-serif`;
    const label = labels.add({
      position,
      text,
      font,
      fillColor: ink,
      showBackground: true,
      backgroundColor: chip,
      backgroundPadding: new Cesium.Cartesian2(LABEL_PAD.x, LABEL_PAD.y),
      horizontalOrigin: Cesium.HorizontalOrigin.CENTER,
      verticalOrigin: Cesium.VerticalOrigin.BOTTOM,
      pixelOffset: new Cesium.Cartesian2(0, offsetY),
      disableDepthTestDistance: Number.POSITIVE_INFINITY,
    });
    placed.push({ label, position, offsetY, size: measure(text, font, size) });
  };
  const onGround = tileset ? Cesium.ClassificationType.CESIUM_3D_TILE : Cesium.ClassificationType.TERRAIN;

  for (const v of vehicles) {
    const own = Array.from({ length: 5 }, (_, i) => heights.get(`${v.id}:${i}`)).filter((h): h is number => h != null);
    const ring = Array.from({ length: 8 }, (_, i) => heights.get(`${v.id}:ring:${i}`)).filter((h): h is number => h != null);
    const g = baseFor(v, standingHeight(own, ring, ground0));
    const base = vehicleColour(o.palette, v);
    for (const b of vehicleBlocks(v)) addBlock(Cesium, viewer, o.anchor, b, g, blockColour(Cesium, o.palette, base, b.kind), halo);
    const top = ll({ x: v.x, y: v.y });
    addLabel(Cesium.Cartesian3.fromDegrees(top.lng, top.lat, g + v.height + 0.6), v.label || vehicleSpec(v.type)?.short || 'Vehicle', 13);
  }

  for (const i of o.items) {
    if (i.kind === 'route' && i.points.length > 1) {
      const fh = floorOfShape(i, i.points);
      viewer.entities.add({
        polyline: {
          positions:
            fh == null
              ? Cesium.Cartesian3.fromDegreesArray(i.points.flatMap((p) => [ll(p).lng, ll(p).lat]))
              : Cesium.Cartesian3.fromDegreesArrayHeights(i.points.flatMap((p) => [ll(p).lng, ll(p).lat, fh])),
          clampToGround: fh == null,
          ...(fh == null ? { classificationType: onGround } : {}),
          width: 9,
          material: new Cesium.PolylineArrowMaterialProperty(Cesium.Color.fromCssColorString(o.palette.route)),
        },
      });
    } else if (i.kind === 'area' && i.points.length > 2 && !i.flat3d) {
      // A Flat-in-3D area is the flattening itself (the photo patch) — no tint, no title.
      const c = Cesium.Color.fromCssColorString(areaColour(o.palette, i.type));
      const mid = ll({ x: i.points.reduce((s, p) => s + p.x, 0) / i.points.length, y: i.points.reduce((s, p) => s + p.y, 0) / i.points.length });
      const fh = floorOfShape(i, i.points);
      viewer.entities.add({
        polygon: {
          hierarchy: new Cesium.PolygonHierarchy(Cesium.Cartesian3.fromDegreesArray(i.points.flatMap((p) => [ll(p).lng, ll(p).lat]))),
          material: c.withAlpha(0.4),
          ...(fh == null ? { classificationType: onGround } : { height: fh }),
        },
      });
      addLabel(Cesium.Cartesian3.fromDegrees(mid.lng, mid.lat, (fh ?? ground0) + 2), i.label || areaLabel(i.type), 12);
    } else if (i.kind === 'measure') {
      const a = ll(i.a);
      const b = ll(i.b);
      const m = ll({ x: (i.a.x + i.b.x) / 2, y: (i.a.y + i.b.y) / 2 });
      viewer.entities.add({
        polyline: {
          positions: Cesium.Cartesian3.fromDegreesArray([a.lng, a.lat, b.lng, b.lat]),
          clampToGround: true,
          classificationType: onGround,
          width: 4,
          material: new Cesium.PolylineDashMaterialProperty({ color: Cesium.Color.fromCssColorString(o.palette.measure) }),
        },
      });
      addLabel(Cesium.Cartesian3.fromDegrees(m.lng, m.lat, ground0 + 2), fmtMetres(dist(i.a, i.b)), 12);
    } else if (i.kind === 'marker') {
      const at = ll(i);
      const h = baseFor(i, heights.get(i.id) ?? ground0);
      const position = Cesium.Cartesian3.fromDegrees(at.lng, at.lat, h + 1);
      viewer.entities.add({
        position,
        point: {
          pixelSize: 14,
          color: Cesium.Color.fromCssColorString(o.palette.chip),
          outlineColor: ink,
          outlineWidth: 2,
          disableDepthTestDistance: Number.POSITIVE_INFINITY,
        },
      });
      addLabel(position, `${i.label || markerSpec(i.type)?.label || ''}${i.detail ? ` · ${i.detail}` : ''}`, 12, -12);
    }
  }
  // Before each frame: show only the labels that fit (nearest first).
  const scene = viewer.scene;
  scene.preRender.addEventListener(() => layoutLabels(Cesium, scene, placed));
  viewer.scene.requestRender();
  return { tileset, ground0 };
}

/* ── Labels ───────────────────────────────────────────────── */

const LABEL_PAD = { x: 5, y: 3 };

interface PlacedLabel {
  label: CesiumNS.Label;
  position: CesiumNS.Cartesian3;
  offsetY: number;
  /** On-screen size (CSS px) including the chip's padding. */
  size: { w: number; h: number };
}

let measureCtx: CanvasRenderingContext2D | null = null;
function measure(text: string, font: string, size: number): { w: number; h: number } {
  measureCtx ??= document.createElement('canvas').getContext('2d');
  let w = text.length * size * 0.6;
  if (measureCtx) {
    measureCtx.font = font;
    w = measureCtx.measureText(text).width;
  }
  return { w: w + LABEL_PAD.x * 2, h: size * 1.25 + LABEL_PAD.y * 2 };
}

const toScreen = { pt: null as CesiumNS.Cartesian2 | null };
function layoutLabels(Cesium: C, scene: CesiumNS.Scene, placed: PlacedLabel[]) {
  if (!placed.length) return;
  const cam = scene.camera.positionWC;
  const boxes: LabelBox[] = [];
  placed.forEach((p, i) => {
    toScreen.pt ??= new Cesium.Cartesian2();
    const at = Cesium.SceneTransforms.worldToWindowCoordinates(scene, p.position, toScreen.pt);
    if (!at || !Number.isFinite(at.x)) return; // behind the camera
    boxes.push(labelBox(String(i), at, p.size, p.offsetY, Cesium.Cartesian3.distance(cam, p.position)));
  });
  const shown = placeLabels(boxes);
  placed.forEach((p, i) => {
    const on = shown.has(String(i));
    if (p.label.show !== on) p.label.show = on;
  });
}

/** The 2D satellite photo, laid flat over `pts` at `height` — where a "Flat
 *  in 3D" area cut Google's model away. Tiles are fetched for this view and
 *  never stored (Google's terms), like the plan's. No key / a tile that won't
 *  load → the floor colour there, never a hole. Gives up after 8 s. */
async function addSatellitePatch(Cesium: C, viewer: CesiumNS.Viewer, anchor: LatLng, pts: Pt[], height: number, floor: string) {
  const x0 = Math.min(...pts.map((q) => q.x));
  const x1 = Math.max(...pts.map((q) => q.x));
  const y0 = Math.min(...pts.map((q) => q.y));
  const y1 = Math.max(...pts.map((q) => q.y));
  const k = Math.min(2048 / Math.max(x1 - x0, y1 - y0, 1), 10); // ≤ 2048 px, ≤ 10 px per metre
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(2, Math.round((x1 - x0) * k));
  canvas.height = Math.max(2, Math.round((y1 - y0) * k));
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  const toPx = (q: Pt) => ({ x: (q.x - x0) * k, y: (y1 - q.y) * k });
  ctx.beginPath();
  pts.forEach((q, i) => (i ? ctx.lineTo(toPx(q).x, toPx(q).y) : ctx.moveTo(toPx(q).x, toPx(q).y)));
  ctx.closePath();
  ctx.clip();
  ctx.fillStyle = floor;
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  try {
    const session = await getTileSession();
    const { tiles } = tilesCovering(anchor, pts, 36);
    const drawTile = async (t: (typeof tiles)[number]) => {
      const r = await fetch(tileUrl(session, t), { mode: 'cors' });
      if (!r.ok) return;
      const img = await createImageBitmap(await r.blob());
      const rect = tileRect(anchor, t); // x east, y = −north of the tile's top
      const tl = toPx({ x: rect.x, y: -rect.y });
      ctx.drawImage(img, tl.x, tl.y, rect.w * k, rect.h * k);
    };
    await Promise.race([Promise.all(tiles.map((t) => drawTile(t).catch(() => undefined))), new Promise((res) => setTimeout(res, 8000))]);
  } catch {
    /* no imagery: the floor colour stays */
  }
  const sw = toLatLng(anchor, { x: x0, y: y0 });
  const ne = toLatLng(anchor, { x: x1, y: y1 });
  viewer.entities.add({
    rectangle: {
      coordinates: Cesium.Rectangle.fromDegrees(sw.lng, sw.lat, ne.lng, ne.lat),
      height,
      material: new Cesium.ImageMaterialProperty({ image: canvas, transparent: true }),
    },
  });
}

/** A wall's face: see-through, most at the top (where the rim marks the cut)
 *  and least at the floor, so the walls read as the building's edge without
 *  boxing the floor in (Nov 2026, Adam: "a little less dark, a little more
 *  transparent … very blocky"). One small canvas, shared; the tone comes
 *  from the material's colour. */
let wallFace: HTMLCanvasElement | null = null;
function wallGradient(): HTMLCanvasElement {
  if (wallFace) return wallFace;
  const c = document.createElement('canvas');
  c.width = 2;
  c.height = 64;
  const ctx = c.getContext('2d');
  if (ctx) {
    const g = ctx.createLinearGradient(0, 0, 0, 64);
    g.addColorStop(0, 'rgba(255,255,255,0.3)');
    g.addColorStop(1, 'rgba(225,225,225,0.72)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 2, 64);
  }
  wallFace = c;
  return c;
}

/** One wall from `w.bottom` up to the roof, toned by the way it faces.
 *  UNLIT (flat): an entity wall is lit by the sun at the clock's time, so on
 *  a winter afternoon in London every wall facing away from it went near
 *  black. The facing tone (`w.shade`) is the only shading. */
function addWall(Cesium: C, viewer: CesiumNS.Viewer, anchor: LatLng, w: WallSegment, colour: string) {
  const a = toLatLng(anchor, w.a);
  const b = toLatLng(anchor, w.b);
  const base = Cesium.Color.fromCssColorString(colour);
  // Alpha just under 1 keeps the material in the translucent pass (the
  // gradient carries the real see-through).
  const tone = new Cesium.Color(base.red * w.shade, base.green * w.shade, base.blue * w.shade, 0.99);
  viewer.scene.primitives.add(
    new Cesium.Primitive({
      geometryInstances: new Cesium.GeometryInstance({
        geometry: new Cesium.WallGeometry({
          positions: Cesium.Cartesian3.fromDegreesArray([a.lng, a.lat, b.lng, b.lat]),
          minimumHeights: [w.bottom, w.bottom],
          maximumHeights: [w.topA, w.topB],
          vertexFormat: Cesium.MaterialAppearance.MaterialSupport.TEXTURED.vertexFormat,
        }),
      }),
      appearance: new Cesium.MaterialAppearance({
        material: Cesium.Material.fromType('Image', { image: wallGradient(), color: tone }),
        materialSupport: Cesium.MaterialAppearance.MaterialSupport.TEXTURED,
        flat: true,
        faceForward: true,
        translucent: true,
      }),
      asynchronous: false,
    }),
  );
}

/** A drawing laid flat at `height`: baked north-up into a canvas (so the
 *  rectangle's texture needs no rotation), transparent outside it. An inside
 *  drawing is a FLOOR only over its inside area (`floor` colour under the
 *  drawing's clear lines); the rest of the sheet isn't laid in 3D — the city
 *  mesh is there. `img` = the clear-lines raster of the crop (null = not
 *  ready: the floor alone). */
function addFloor(Cesium: C, viewer: CesiumNS.Viewer, anchor: LatLng, d: ParkingDrawing, img: HTMLCanvasElement | null, height: number, floor: string) {
  const f = d.inside ? insideFootprint(d) : footprint(d);
  const x0 = Math.min(...f.map((q) => q.x));
  const x1 = Math.max(...f.map((q) => q.x));
  const y0 = Math.min(...f.map((q) => q.y));
  const y1 = Math.max(...f.map((q) => q.y));
  const k = Math.min(2048 / Math.max(x1 - x0, y1 - y0), 12); // ≤ 2048 px, ≤ 12 px per metre
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(2, Math.round((x1 - x0) * k));
  canvas.height = Math.max(2, Math.round((y1 - y0) * k));
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  // Ground → canvas: x right from the west edge, y down from the north edge.
  const toPx = (q: Pt) => ({ x: (q.x - x0) * k, y: (y1 - q.y) * k });
  ctx.beginPath();
  f.forEach((q, i) => (i ? ctx.lineTo(toPx(q).x, toPx(q).y) : ctx.moveTo(toPx(q).x, toPx(q).y)));
  ctx.closePath();
  ctx.save();
  ctx.clip();
  if (d.inside) {
    ctx.fillStyle = floor;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
  }
  if (img) {
    ctx.setTransform(k, 0, 0, k, -x0 * k, y1 * k);
    ctx.transform(...svgMatrix(d));
    ctx.globalAlpha = d.inside ? 1 : d.opacity;
    ctx.drawImage(img, d.crop.u0, d.crop.v0, d.crop.u1 - d.crop.u0, d.crop.v1 - d.crop.v0);
  }
  ctx.restore();
  const sw = toLatLng(anchor, { x: x0, y: y0 });
  const ne = toLatLng(anchor, { x: x1, y: y1 });
  viewer.entities.add({
    rectangle: {
      coordinates: Cesium.Rectangle.fromDegrees(sw.lng, sw.lat, ne.lng, ne.lat),
      height,
      material: new Cesium.ImageMaterialProperty({ image: canvas, transparent: true }),
    },
  });
}

function addBlock(Cesium: C, viewer: CesiumNS.Viewer, anchor: LatLng, b: Block, ground: number, colour: CesiumNS.Color, outline: CesiumNS.Color) {
  const g = toLatLng(anchor, b.at);
  const position = Cesium.Cartesian3.fromDegrees(g.lng, g.lat, ground + (b.z0 + b.z1) / 2);
  // Cesium's heading is from EAST, clockwise; ours is a compass bearing from north.
  const orientation = Cesium.Transforms.headingPitchRollQuaternion(position, new Cesium.HeadingPitchRoll(rad(b.heading - 90), 0, 0));
  const solid = b.kind === 'body' || b.kind === 'cab' || b.kind === 'hood' || b.kind === 'cabin';
  viewer.entities.add({
    position,
    orientation,
    box: {
      dimensions: new Cesium.Cartesian3(b.length, b.width, Math.max(0.02, b.z1 - b.z0)),
      material: colour,
      outline: solid,
      outlineColor: outline,
    },
  });
}

/* ── Camera ───────────────────────────────────────────────── */

export function applyCamera(Cesium: C, viewer: CesiumNS.Viewer, anchor: LatLng, cam: Camera3d) {
  const g = toLatLng(anchor, cam);
  viewer.camera.setView({
    destination: Cesium.Cartesian3.fromDegrees(g.lng, g.lat, cam.alt),
    orientation: { heading: rad(cam.heading), pitch: rad(cam.pitch), roll: rad(cam.roll) },
  });
}

/** Look at a ground point from a heading / pitch (degrees) and range (m). */
export function lookAt(Cesium: C, viewer: CesiumNS.Viewer, anchor: LatLng, target: Pt, height: number, heading: number, pitch: number, range: number) {
  const g = toLatLng(anchor, target);
  viewer.camera.lookAt(Cesium.Cartesian3.fromDegrees(g.lng, g.lat, height), new Cesium.HeadingPitchRange(rad(heading), rad(pitch), range));
  viewer.camera.lookAtTransform(Cesium.Matrix4.IDENTITY);
}

/** The point on the ground the camera is looking at (centre of the screen),
 *  falling back to a point `fallbackRange` ahead when the centre is sky. */
export function pivot(Cesium: C, viewer: CesiumNS.Viewer, fallbackRange = 150): CesiumNS.Cartesian3 {
  const scene = viewer.scene;
  const centre = new Cesium.Cartesian2(scene.canvas.clientWidth / 2, scene.canvas.clientHeight / 2);
  const hit = scene.pickPositionSupported ? scene.pickPosition(centre) : undefined;
  if (hit && Number.isFinite(hit.x)) return hit;
  const ray = viewer.camera.getPickRay(centre);
  if (ray) {
    if (scene.globe) {
      const onGlobe = scene.globe.pick(ray, scene);
      if (onGlobe) return onGlobe;
    } else {
      const hitEllipsoid = Cesium.IntersectionTests.rayEllipsoid(ray, Cesium.Ellipsoid.WGS84);
      if (hitEllipsoid) return Cesium.Ray.getPoint(ray, hitEllipsoid.start);
    }
  }
  return Cesium.Cartesian3.add(
    viewer.camera.position,
    Cesium.Cartesian3.multiplyByScalar(viewer.camera.direction, fallbackRange, new Cesium.Cartesian3()),
    new Cesium.Cartesian3(),
  );
}

/** Orbit the camera around what it's looking at: turn by `dHeading`, tilt by
 *  `dPitch` (degrees), or set the heading outright (north up = 0). */
export function orbit(
  Cesium: C,
  viewer: CesiumNS.Viewer,
  o: { dHeading?: number; dPitch?: number; heading?: number },
  /** Reuse a pivot across a held turn — picking it renders a depth pass. */
  around?: CesiumNS.Cartesian3,
) {
  const cam = viewer.camera;
  const target = around ?? pivot(Cesium, viewer);
  const range = Cesium.Cartesian3.distance(cam.position, target);
  const heading = o.heading != null ? rad(o.heading) : cam.heading + rad(o.dHeading ?? 0);
  // Never flat on the ground, never past straight down.
  const pitch = Math.max(rad(-89), Math.min(rad(-5), cam.pitch + rad(o.dPitch ?? 0)));
  cam.lookAt(target, new Cesium.HeadingPitchRange(heading, pitch, range));
  cam.lookAtTransform(Cesium.Matrix4.IDENTITY);
  viewer.scene.requestRender();
}

/** Left-drag / one finger MOVES the map: the ground point you grabbed stays
 *  under the pointer, and nothing else happens (Nov 2026, Adam: "a click and
 *  tiny drag moved me from the O2 in London to the ALPS").
 *
 *  Why Cesium's own drag did that: in 3D its left-drag spins the whole GLOBE
 *  about the Earth's centre. With the Google mesh as the only ground (globe
 *  off), a drag that starts on sky, a gap in the mesh, or near the horizon
 *  has no nearby ground to hold, so a few pixels became degrees of the
 *  planet — and inertia carried it further. So:
 *    - Cesium's left-drag spin and its inertia are switched off;
 *    - a drag only starts on picked ground (a drag from the sky does nothing);
 *    - each step moves the camera along the ground's plane at the grab point,
 *      and a step longer than the camera is high above that plane is dropped
 *      (that is a pointer at the horizon, not a drag);
 *    - the camera can't be dragged more than `maxRadius` metres from the venue.
 *  Turning / tilting (right-drag, Ctrl-drag, two fingers) and zoom are Cesium's
 *  as before. Returns a cleanup.
 *
 *  What counts as "ground" for the grab (Nov 2026, Adam: "click and drag on
 *  3D no longer allows navigation"): the floors of inside drawings and the
 *  Flat-in-3D satellite patches are TRANSLUCENT rectangles (their canvases are
 *  transparent outside the shape), and Cesium's `pickPosition` ignores the
 *  translucent pass unless `pickTranslucentDepth` is on — so a drag that
 *  started on a floor found no ground and did nothing, and at a venue with an
 *  inside drawing the floor is most of the view. So translucent depth is
 *  picked, and anything still unpicked (a transparent pixel, a gap) is caught
 *  on the level plane at the venue's street height `ground0`. A pointer above
 *  the horizon still grabs nothing. */
export function enableGroundPan(Cesium: C, viewer: CesiumNS.Viewer, anchor: LatLng, ground0 = 0, maxRadius = 3000): () => void {
  const scene = viewer.scene;
  const cam = viewer.camera;
  const ctl = scene.screenSpaceCameraController;
  ctl.rotateEventTypes = [];
  ctl.translateEventTypes = [];
  ctl.inertiaSpin = 0;
  ctl.inertiaTranslate = 0;
  ctl.maximumZoomDistance = maxRadius * 2;

  const venue = Cesium.Cartesian3.fromDegrees(anchor.lng, anchor.lat, 0);
  scene.pickTranslucentDepth = true;
  const street = Cesium.Cartesian3.fromDegrees(anchor.lng, anchor.lat, ground0);
  const streetPlane = Cesium.Plane.fromPointNormal(street, Cesium.Ellipsoid.WGS84.geodeticSurfaceNormal(street, new Cesium.Cartesian3()));
  const handler = new Cesium.ScreenSpaceEventHandler(scene.canvas);
  let grab: { point: CesiumNS.Cartesian3; plane: CesiumNS.Plane } | null = null;

  // A "hit" kilometres away is the far horizon, not something to hold.
  const near = (p: CesiumNS.Cartesian3 | undefined): p is CesiumNS.Cartesian3 =>
    !!p && Number.isFinite(p.x) && Cesium.Cartesian3.distance(p, venue) <= maxRadius * 1.5;

  handler.setInputAction((e: { position: CesiumNS.Cartesian2 }) => {
    grab = null;
    let hit: CesiumNS.Cartesian3 | undefined = scene.pickPositionSupported ? scene.pickPosition(e.position) : undefined;
    if (!near(hit)) {
      const ray = cam.getPickRay(e.position);
      hit = ray ? Cesium.IntersectionTests.rayPlane(ray, streetPlane) : undefined;
    }
    if (!near(hit)) return;
    const normal = Cesium.Ellipsoid.WGS84.geodeticSurfaceNormal(hit, new Cesium.Cartesian3());
    grab = { point: hit, plane: Cesium.Plane.fromPointNormal(hit, normal) };
  }, Cesium.ScreenSpaceEventType.LEFT_DOWN);

  handler.setInputAction((e: { endPosition: CesiumNS.Cartesian2 }) => {
    if (!grab) return;
    const ray = cam.getPickRay(e.endPosition);
    if (!ray) return;
    const at = Cesium.IntersectionTests.rayPlane(ray, grab.plane);
    if (!at) return; // pointing above the horizon
    const step = Cesium.Cartesian3.subtract(grab.point, at, new Cesium.Cartesian3());
    const high = Math.abs(Cesium.Plane.getPointDistance(grab.plane, cam.positionWC));
    if (Cesium.Cartesian3.magnitude(step) > Math.max(5, high)) return;
    const next = Cesium.Cartesian3.add(cam.position, step, new Cesium.Cartesian3());
    const nextGround = Cesium.Ellipsoid.WGS84.scaleToGeodeticSurface(next, new Cesium.Cartesian3());
    if (nextGround && Cesium.Cartesian3.distance(nextGround, venue) > maxRadius) return;
    cam.position = next;
    scene.requestRender();
  }, Cesium.ScreenSpaceEventType.MOUSE_MOVE);

  const stop = () => {
    grab = null;
  };
  handler.setInputAction(stop, Cesium.ScreenSpaceEventType.LEFT_UP);
  handler.setInputAction(stop, Cesium.ScreenSpaceEventType.PINCH_START);

  return () => {
    if (!handler.isDestroyed()) handler.destroy();
  };
}

export function readCamera(viewer: CesiumNS.Viewer, anchor: LatLng): Camera3d {
  const c = viewer.camera.positionCartographic;
  const at = toLocal(anchor, { lat: deg(c.latitude), lng: deg(c.longitude) });
  const round = (n: number, k = 100) => Math.round(n * k) / k;
  return {
    x: round(at.x),
    y: round(at.y),
    alt: round(c.height),
    heading: round(((deg(viewer.camera.heading) % 360) + 360) % 360),
    pitch: round(Math.max(-90, Math.min(90, deg(viewer.camera.pitch)))),
    roll: round(((deg(viewer.camera.roll) + 540) % 360) - 180),
  };
}

/** Wait until the visible tiles have loaded (or give up after `ms`). */
export function settle(viewer: CesiumNS.Viewer, tileset: CesiumNS.Cesium3DTileset | null, ms: number): Promise<void> {
  return new Promise((resolve) => {
    const start = performance.now();
    let quiet = 0;
    const tick = () => {
      viewer.scene.requestRender();
      const done = !tileset || tileset.tilesLoaded;
      quiet = done ? quiet + 1 : 0;
      if (quiet > 20 || performance.now() - start > ms) return resolve();
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  });
}

/** The data attribution currently on screen (Google's credits), as one line. */
export function creditsText(viewer: CesiumNS.Viewer): string {
  const el = (viewer as unknown as { creditDisplay?: { container?: HTMLElement } }).creditDisplay?.container ?? viewer.bottomContainer;
  return (el?.textContent ?? '').replace(/\s+/g, ' ').replace(/Data attribution/gi, '').trim();
}
