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
     · markers and vehicle names — labels that stay readable through roofs
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
import { dist, fmtMetres, toLatLng, toLocal, type Camera3d, type LatLng, type Pt } from '@/lib/parking/geo';
import { areaLabel, markerSpec, vehicleSpec } from '@/lib/parking/catalogue';
import { vehicleBlocks, type Block } from '@/lib/parking/blocks3d';
import { vehicleCorners, type ParkingDrawing, type ParkingItem, type VehicleItem } from '@/lib/parking/model';
import { drawingUnder, footprint, insideAt, itemFloor, itemPoint, pointInPolygon, svgMatrix } from '@/lib/parking/drawings';
import type { PartKind } from '@/lib/parking/silhouettes';
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
  const ctl = scene.screenSpaceCameraController;
  ctl.tiltEventTypes = [
    Cesium.CameraEventType.RIGHT_DRAG,
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
    /** The map's drawings (levels + floors) and the rasters to lay as floors (the dark look). */
    drawings?: ParkingDrawing[];
    floors?: ReadonlyMap<string, HTMLCanvasElement>;
  },
): Promise<Scene3d> {
  const drawings = o.drawings ?? [];
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
  for (const v of vehicles) [{ x: v.x, y: v.y }, ...vehicleCorners(v)].forEach((at, i) => probes.push({ key: `${v.id}:${i}`, at }));
  for (const i of o.items) if (i.kind === 'marker') probes.push({ key: i.id, at: { x: i.x, y: i.y } });
  // The street around each inside drawing: its corners and edge middles, 4 m out.
  const inside = tileset ? drawings.filter((d) => d.inside) : [];
  for (const d of inside) {
    const f = footprint(d);
    const c = { x: f.reduce((a, q) => a + q.x, 0) / 4, y: f.reduce((a, q) => a + q.y, 0) / 4 };
    const ring = f.flatMap((q, i) => [q, { x: (q.x + f[(i + 1) % 4].x) / 2, y: (q.y + f[(i + 1) % 4].y) / 2 }]);
    ring.forEach((q, i) => {
      const l = Math.hypot(q.x - c.x, q.y - c.y) || 1;
      probes.push({ key: `street:${d.id}:${i}`, at: { x: q.x + ((q.x - c.x) / l) * 4, y: q.y + ((q.y - c.y) / l) * 4 } });
    });
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
    const hs = Array.from({ length: 8 }, (_, i) => heights.get(`street:${d.id}:${i}`)).filter((h): h is number => h != null);
    street.set(d.id, hs.length ? Math.min(...hs) : ground0);
  }
  // Inside drawings take the roof off: the mesh is clipped to their footprints.
  if (tileset && inside.length) {
    tileset.clippingPolygons = new Cesium.ClippingPolygonCollection({
      polygons: inside.map(
        (d) => new Cesium.ClippingPolygon({ positions: Cesium.Cartesian3.fromDegreesArray(footprint(d).flatMap((q) => [ll(q).lng, ll(q).lat])) }),
      ),
    });
  }
  // The floors: every inside drawing; with no city mesh, every drawing.
  for (const d of drawings) {
    if (d.hidden || (tileset && !d.inside)) continue;
    const img = o.floors?.get(d.id);
    if (!img) continue;
    addFloor(Cesium, viewer, o.anchor, d, img, (d.inside ? street.get(d.id) ?? ground0 : ground0) + (d.inside ? d.floor : 0) + 0.03);
  }
  /** Where an item stands: on the inside drawing under it (its street + the item's level), else `fallback`. */
  const baseFor = (it: ParkingItem, fallback: number) => {
    const under = insideAt(drawings, itemPoint(it));
    if (!under.length) return fallback;
    const d = drawingUnder(it, drawings) ?? under[0];
    return (street.get(d.id) ?? ground0) + itemFloor(it, drawings);
  };
  /** A route / area / measure lying wholly on one inside drawing is drawn on its floor, not draped on a mesh that isn't there. */
  const floorOfShape = (it: ParkingItem, pts: Pt[]): number | null => {
    const d = drawingUnder(it, drawings);
    if (!d) return null;
    return pts.every((q) => pointInPolygon(q, footprint(d))) ? (street.get(d.id) ?? ground0) + itemFloor(it, drawings) + 0.08 : null;
  };
  const groundOf = (id: string, n: number) => {
    const hs = Array.from({ length: n }, (_, i) => heights.get(`${id}:${i}`)).filter((h): h is number => h != null);
    return hs.length ? Math.min(...hs) : ground0;
  };

  const ink = Cesium.Color.fromCssColorString(o.palette.ink);
  const halo = Cesium.Color.fromCssColorString(o.palette.halo);
  const label = (text: string, size = 15): CesiumNS.LabelGraphics.ConstructorOptions => ({
    text,
    font: `700 ${size}px system-ui, sans-serif`,
    fillColor: ink,
    // A dark chip behind the text reads on sky, roofs and tarmac alike
    // (an outline looked hollow at this size).
    showBackground: true,
    backgroundColor: Cesium.Color.fromCssColorString(o.palette.chip).withAlpha(0.82),
    backgroundPadding: new Cesium.Cartesian2(6, 4),
    verticalOrigin: Cesium.VerticalOrigin.BOTTOM,
    disableDepthTestDistance: Number.POSITIVE_INFINITY,
  });
  const onGround = tileset ? Cesium.ClassificationType.CESIUM_3D_TILE : Cesium.ClassificationType.TERRAIN;

  for (const v of vehicles) {
    const g = baseFor(v, groundOf(v.id, 5));
    const base = vehicleColour(o.palette, v);
    for (const b of vehicleBlocks(v)) addBlock(Cesium, viewer, o.anchor, b, g, blockColour(Cesium, o.palette, base, b.kind), halo);
    const top = ll({ x: v.x, y: v.y });
    viewer.entities.add({
      position: Cesium.Cartesian3.fromDegrees(top.lng, top.lat, g + v.height + 1.2),
      label: label(`${v.label || vehicleSpec(v.type)?.short || 'Vehicle'} · ${fmtMetres(v.length)}`),
    });
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
    } else if (i.kind === 'area' && i.points.length > 2) {
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
      viewer.entities.add({ position: Cesium.Cartesian3.fromDegrees(mid.lng, mid.lat, (fh ?? ground0) + 2), label: label(i.label || areaLabel(i.type), 13) });
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
      viewer.entities.add({ position: Cesium.Cartesian3.fromDegrees(m.lng, m.lat, ground0 + 2), label: label(fmtMetres(dist(i.a, i.b)), 13) });
    } else if (i.kind === 'marker') {
      const at = ll(i);
      const h = baseFor(i, heights.get(i.id) ?? ground0);
      viewer.entities.add({
        position: Cesium.Cartesian3.fromDegrees(at.lng, at.lat, h + 1),
        point: {
          pixelSize: 14,
          color: Cesium.Color.fromCssColorString(o.palette.chip),
          outlineColor: ink,
          outlineWidth: 2,
          disableDepthTestDistance: Number.POSITIVE_INFINITY,
        },
        label: { ...label(`${i.label || markerSpec(i.type)?.label || ''}${i.detail ? ` · ${i.detail}` : ''}`, 13), pixelOffset: new Cesium.Cartesian2(0, -12) },
      });
    }
  }
  viewer.scene.requestRender();
  return { tileset, ground0 };
}

/** A drawing laid flat at `height`: baked north-up into a canvas (so the
 *  rectangle's texture needs no rotation), transparent outside the drawing. */
function addFloor(Cesium: C, viewer: CesiumNS.Viewer, anchor: LatLng, d: ParkingDrawing, img: HTMLCanvasElement, height: number) {
  const f = footprint(d);
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
  // Ground → canvas: x right from the west edge, y down from the north edge; then the drawing's own matrix.
  ctx.setTransform(k, 0, 0, k, -x0 * k, y1 * k);
  ctx.transform(...svgMatrix(d));
  ctx.globalAlpha = d.inside ? 1 : d.opacity;
  ctx.drawImage(img, d.crop.u0, d.crop.v0, d.crop.u1 - d.crop.u0, d.crop.v1 - d.crop.v0);
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
  const solid = b.kind === 'body' || b.kind === 'cab' || b.kind === 'hood';
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
