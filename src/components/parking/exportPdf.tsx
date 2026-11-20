'use client';

/* ============================================
   Parking map → PDF page 1 (Nov 2026, Adam)

   Rendered in the browser, at export time, from the same <ParkingScene> the
   editor shows — so the PDF can't disagree with the screen:

     1. each page in the map's page list (pages.ts): a plan page frames its
      area at a standard scale (the editor outlines the same frames), a 3D
      page is a camera
     2. draw the Google tiles for that frame onto a canvas (fetched now,
        never stored — the terms forbid caching)
     3. draw the scene's SVG (no images inside it) on top
     4. lay out A4 landscape with jsPDF: title, map, scale bar + ratio, north
        arrow, Google attribution, key, notes, gate GPS links

   The scale is TRUE on paper: 1 mm on the page = N mm on the ground.
   ============================================ */

import { createRoot } from 'react-dom/client';
import { flushSync } from 'react-dom';
import { jsPDF } from 'jspdf';
import {
  dist,
  fmtMetres,
  niceLength,
  tileRect,
  tileZoomFor,
  toLatLng,
  visibleTiles,
  type Camera3d,
  type LatLng,
  type Pt,
  type View,
} from '@/lib/parking/geo';
import { areaLabel, markerSpec, vehicleSpec } from '@/lib/parking/catalogue';
import { pathLength, rearClearCorners, type ParkingDrawing, type ParkingItem } from '@/lib/parking/model';
import { itemFloor } from '@/lib/parking/drawings';
import { onLevel } from './drawingLayers';
import { ParkingScene } from './ParkingScene';
import { loadCesium } from './loadCesium';
import { applyCamera, createViewer, creditsText, lookAt, populate, settle } from './scene3d';
import { defaultCamera3d } from '@/lib/parking/blocks3d';
import { PRINT_FRAME_MM, vehicleNumbers, type PrintFrame } from '@/lib/parking/print';
import { areaColour, resolvePalette, vehicleColour, type Palette } from './palette';
import { getTileSession, tilesKey, tileUrl, viewportInfo, type TileSession } from './googleTiles';

// A4 landscape, millimetres.
const PAGE = { w: 297, h: 210 };
const MARGIN = 10;
const FRAME = { x: MARGIN, y: 26, w: PRINT_FRAME_MM.w, h: PRINT_FRAME_MM.h };
const SIDE = { x: FRAME.x + FRAME.w + 6, w: PAGE.w - MARGIN - (FRAME.x + FRAME.w + 6) };
const PX_PER_MM = 8; // ≈ 203 dpi
const LABEL_SCALE = 2.2; // 12 px labels → ~9 pt on paper

export type ResolvedPage =
  | {
      kind: 'plan';
      title: string;
      frame: PrintFrame;
      rotation: number;
      /** Only this level's items and drawings (stacked levels); absent = all. */
      level?: number;
      levelLabel?: string;
      /** 'street': Google's street map under the items (pages.ts), no venue drawings. */
      base?: 'street';
    }
  | { kind: '3d'; title: string; cam: Camera3d | null; fallback: { centre: Pt; extent: number; rotation: number } };

export interface ExportInput {
  title: string;
  subtitle: string;
  anchor: LatLng;
  /** The pages, in order — resolved by the editor from pages.ts (planFrame). */
  pages: ResolvedPage[];
  items: ParkingItem[];
  notes: string;
  session: TileSession | null;
  maxZoom: number;
  attribution: string;
  /** Venue drawings, rendered: painted under the items on plan pages, in the look the plan shows. */
  drawings: ExportDrawing[];
  /** Every drawing on the map (levels, and 3D floors). */
  allDrawings: ParkingDrawing[];
  /** 3D floors: each drawing's dark look. */
  floors: ReadonlyMap<string, HTMLCanvasElement>;
  /** Satellite on (3D builds the Google city). */
  satellite: boolean;
  /** Headroom warnings (drawings.ts), printed in the key. */
  warnings: string[];
  /** Vehicle numbers, one set for the whole PDF (vehicleNumbers) — set by exportParkingPdf. */
  numbers?: ReadonlyMap<string, number>;
  /** The street-map tiles for 'street' pages — set by exportParkingPdf (null = not available). */
  street?: { session: TileSession; maxZoom: number; attribution: string } | null;
}

export interface ExportDrawing {
  id: string;
  name: string;
  matrix: [number, number, number, number, number, number];
  crop: ParkingDrawing['crop'];
  canvas: HTMLCanvasElement;
  opacity: number;
  blend: 'multiply' | 'normal';
  inside: boolean;
  floor: number;
  /** Inside drawings over the photo: the light copy (the part outside the
   *  building, lines on the photo), the inside outline in drawing units, and
   *  the floor colour — the inside is drawn solid, whatever the opacity. */
  light?: HTMLCanvasElement;
  insideArea?: { u: number; v: number }[] | null;
  floorColour?: string;
}

export interface ExportResult {
  blob: Blob;
  fileName: string;
  /** The first plan page's scale, for the "saved at 1:N" message. */
  scale: number | null;
  pageCount: number;
  /** Set when a 3D page couldn't be made; every other page is still complete. */
  warning: string | null;
}

/** A 3D page has no key column: the view takes the page's full width (Nov 2026, Adam). */
const FRAME_3D = { x: MARGIN, y: FRAME.y, w: PAGE.w - 2 * MARGIN, h: FRAME.h };
const PX_PER_MM_3D = 5; // a WebGL canvas of ~980 × 870 — enough for print, kind to laptops

/** Every 3D page, rendered off-screen with ONE viewer (the scene is built once). */
async function render3dImages(
  input: ExportInput,
  pages: Extract<ResolvedPage, { kind: '3d' }>[],
  palette: Palette,
): Promise<{ jpeg: string; credits: string }[]> {
  const key = input.satellite ? tilesKey() : null;
  if (!key && !input.allDrawings.length) throw new Error('no Google Map Tiles key');
  const W = Math.round(FRAME_3D.w * PX_PER_MM_3D);
  const H = Math.round(FRAME_3D.h * PX_PER_MM_3D);
  const host = document.createElement('div');
  Object.assign(host.style, { position: 'fixed', left: '-20000px', top: '0', width: `${W}px`, height: `${H}px` });
  document.body.appendChild(host);
  let viewer: ReturnType<typeof createViewer> | null = null;
  try {
    const Cesium = await loadCesium();
    viewer = createViewer(Cesium, host, { withTiles: !!key, blank: palette.blank, sky: palette.sky });
    const first = pages[0];
    const d0 = defaultCamera3d(first.fallback.centre, first.fallback.extent, first.fallback.rotation);
    lookAt(Cesium, viewer, input.anchor, d0.target, 0, d0.heading, d0.pitch, d0.range);
    const scene = await populate(Cesium, viewer, { anchor: input.anchor, items: input.items, palette, tilesKey: key, drawings: input.allDrawings, floors: input.floors });
    const shots: { jpeg: string; credits: string }[] = [];
    for (const page of pages) {
      if (page.cam) applyCamera(Cesium, viewer, input.anchor, page.cam);
      else {
        const d = defaultCamera3d(page.fallback.centre, page.fallback.extent, page.fallback.rotation);
        lookAt(Cesium, viewer, input.anchor, d.target, scene.ground0, d.heading, d.pitch, d.range);
      }
      await settle(viewer, scene.tileset, 30_000);
      viewer.render();
      shots.push({ jpeg: viewer.canvas.toDataURL('image/jpeg', 0.9), credits: creditsText(viewer) });
    }
    return shots;
  } finally {
    if (viewer && !viewer.isDestroyed()) viewer.destroy();
    host.remove();
  }
}

/** A fill light enough that its number needs dark ink. */
const isLight = (hex: string): boolean => {
  const [r, g, b] = hexToRgb(hex);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b > 150;
};
const hexToRgb = (hex: string): [number, number, number] => {
  const h = hex.replace('#', '').slice(0, 6).padEnd(6, '0');
  return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
};

async function loadTileBitmap(url: string): Promise<ImageBitmap> {
  const r = await fetch(url, { mode: 'cors', cache: 'default' });
  if (!r.ok) throw new Error(`A map tile failed to load (${r.status}).`);
  return createImageBitmap(await r.blob());
}

async function pool<T, R>(list: T[], n: number, fn: (t: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(list.length);
  let i = 0;
  await Promise.all(
    Array.from({ length: Math.min(n, list.length) }, async () => {
      while (i < list.length) {
        const k = i++;
        out[k] = await fn(list[k]);
      }
    }),
  );
  return out;
}

function sceneSvg(props: Parameters<typeof ParkingScene>[0]): string {
  const host = document.createElement('div');
  const root = createRoot(host);
  flushSync(() => root.render(<ParkingScene {...props} />));
  const svg = host.innerHTML;
  root.unmount();
  return svg;
}

function svgToImage(svg: string): Promise<HTMLImageElement> {
  return new Promise((res, rej) => {
    const img = new Image();
    img.onload = () => res(img);
    img.onerror = () => rej(new Error('The map overlay could not be drawn.'));
    img.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
  });
}

/** Render the map frame as a JPEG data URL at a true print scale. */
export async function renderMapImage(
  input: ExportInput,
  page: Extract<ResolvedPage, { kind: 'plan' }>,
  palette: Palette,
  fontFamily: string,
): Promise<{ jpeg: string; scale: number; view: View }> {
  const { scale } = page.frame;
  const W = Math.round(FRAME.w * PX_PER_MM);
  const H = Math.round(FRAME.h * PX_PER_MM);
  const view: View = { cx: page.frame.cx, cy: page.frame.cy, ppm: (PX_PER_MM * 1000) / scale, rotation: page.rotation };

  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('This browser cannot draw the map.');
  ctx.fillStyle = palette.blank;
  ctx.fillRect(0, 0, W, H);

  // A street page draws Google's street map; every other plan page its satellite photo.
  const street = page.base === 'street';
  const src = street ? (input.street ? { session: input.street.session, maxZoom: input.street.maxZoom } : null) : input.session ? { session: input.session, maxZoom: input.maxZoom } : null;
  if (src) {
    const z = tileZoomFor(input.anchor.lat, view.ppm, 1, src.session.tileScale, src.maxZoom);
    const keys = visibleTiles(input.anchor, view, W, H, z, 8);
    const bitmaps = await pool(keys, 8, (k) => loadTileBitmap(tileUrl(src.session, k)));
    ctx.save();
    // = sceneTransform(view, W, H)
    ctx.translate(W / 2, H / 2);
    ctx.rotate((-view.rotation * Math.PI) / 180);
    ctx.scale(view.ppm, view.ppm);
    ctx.translate(-view.cx, view.cy);
    keys.forEach((k, i) => {
      const r = tileRect(input.anchor, k);
      ctx.drawImage(bitmaps[i], r.x, r.y, r.w * 1.002, r.h * 1.002);
      bitmaps[i].close();
    });
    ctx.restore();
  }

  // Venue drawings, under the items (the plan's look: lines multiplied onto
  // the photo, or the dark copy as the floor). Not on a street page — it's
  // for getting there, and a floor would cover the road names.
  for (const d of street ? [] : input.drawings) {
    ctx.save();
    ctx.translate(W / 2, H / 2);
    ctx.rotate((-view.rotation * Math.PI) / 180);
    ctx.scale(view.ppm, view.ppm);
    ctx.translate(-view.cx, view.cy);
    ctx.transform(...d.matrix);
    const cw = d.crop.u1 - d.crop.u0;
    const ch = d.crop.v1 - d.crop.v0;
    if (d.inside && d.light && d.insideArea?.length) {
      // As on screen: the sheet as lines on the photo at its opacity, then the
      // inside outline as a SOLID floor with the drawing on it.
      ctx.globalAlpha = d.opacity;
      ctx.globalCompositeOperation = 'multiply';
      ctx.drawImage(d.light, d.crop.u0, d.crop.v0, cw, ch);
      ctx.globalAlpha = 1;
      ctx.globalCompositeOperation = 'source-over';
      ctx.beginPath();
      d.insideArea.forEach((q, i) => (i ? ctx.lineTo(q.u, q.v) : ctx.moveTo(q.u, q.v)));
      ctx.closePath();
      ctx.clip();
      if (d.floorColour) {
        ctx.fillStyle = d.floorColour;
        ctx.fill();
      }
      ctx.drawImage(d.canvas, d.crop.u0, d.crop.v0, cw, ch);
    } else {
      ctx.globalAlpha = d.opacity;
      ctx.globalCompositeOperation = d.blend === 'multiply' ? 'multiply' : 'source-over';
      ctx.drawImage(d.canvas, d.crop.u0, d.crop.v0, cw, ch);
    }
    ctx.restore();
  }

  const svg = sceneSvg({
    view,
    width: W,
    height: H,
    items: input.items,
    tiles: [],
    palette: { ...palette, blank: 'transparent' },
    grid: !src,
    labelScale: LABEL_SCALE,
    numbers: input.numbers,
    forPrint: true,
    fontFamily,
  });
  ctx.drawImage(await svgToImage(svg), 0, 0, W, H);
  return { jpeg: canvas.toDataURL('image/jpeg', 0.9), scale, view };
}

function gpsLink(p: LatLng): string {
  return `https://www.google.com/maps/search/?api=1&query=${p.lat.toFixed(6)},${p.lng.toFixed(6)}`;
}

/** Where the export is, for the editor's "Making your PDF" screen. */
export interface ExportProgress {
  step: string;
  done: number;
  total: number;
}

export async function exportParkingPdf(input: ExportInput, onProgress?: (p: ExportProgress) => void): Promise<ExportResult> {
  const steps = input.pages.length + (input.pages.some((p) => p.kind === '3d') ? 1 : 0);
  const say = (step: string, done: number) => onProgress?.({ step, done, total: steps });
  say('Getting the map ready', 0);
  // One numbering for every page and level: the badges and the key agree everywhere.
  input = { ...input, numbers: vehicleNumbers(input.items) };
  // Street-map pages need their own Google session (roadmap tiles + their credit).
  if (input.pages.some((p) => p.kind === 'plan' && p.base === 'street')) input = { ...input, street: await streetTiles(input.anchor) };
  if (!input.pages.length) throw new Error('Add at least one page.');
  const palette = resolvePalette();
  const fontFamily = getComputedStyle(document.body).fontFamily || 'Helvetica, Arial, sans-serif';

  // 3D pages first (one off-screen viewer for all of them); a failure there
  // drops only the 3D pages, with a warning.
  const pages3d = input.pages.filter((p): p is Extract<ResolvedPage, { kind: '3d' }> => p.kind === '3d');
  let shots: { jpeg: string; credits: string }[] | null = null;
  let warning: string | null = null;
  if (pages3d.length) {
    say(pages3d.length > 1 ? `Building the 3D views (${pages3d.length})` : 'Building the 3D view', 0);
    if (!input.session && !input.allDrawings.length) warning = 'The PDF has no 3D pages: map imagery isn’t set up.';
    else {
      try {
        shots = await render3dImages(input, pages3d, palette);
      } catch (e) {
        warning = `The PDF has no 3D pages: ${e instanceof Error ? e.message : 'the 3D view failed'}.`;
      }
    }
  }
  const printable = input.pages.filter((p) => p.kind === 'plan' || shots);
  if (!printable.length) throw new Error(warning ?? 'Nothing to print.');

  const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
  // Print ink follows the LIGHT tokens (paper is white), as exportJobPdf does.
  const ink: [number, number, number] = [17, 24, 39]; // --lp-text (#111827)
  const grey: [number, number, number] = [107, 114, 128]; // --lp-text-secondary (#6B7280)
  const link: [number, number, number] = [255, 69, 0]; // --lp-orange
  const stamp = new Date().toLocaleString('en-GB', { dateStyle: 'medium', timeStyle: 'short' });
  const total = printable.length;
  let firstScale: number | null = null;
  let shotIndex = 0;

  const header = (pageTitle: string, sub: string) => {
    doc.setTextColor(...ink);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(16);
    doc.text(total > 1 || pageTitle !== 'Plan' ? `${input.title} · ${pageTitle}` : input.title, MARGIN, 15, { maxWidth: PAGE.w - 2 * MARGIN });
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);
    doc.setTextColor(...grey);
    doc.text(sub, MARGIN, 21);
  };
  const footer = (n: number, extra: string) => {
    doc.setFontSize(6.5);
    doc.setTextColor(...grey);
    doc.text(`Drawn to scale in Lowpass · exported ${stamp}${extra}`, MARGIN, PAGE.h - 4);
    if (total > 1) doc.text(`Page ${n} of ${total}`, PAGE.w - MARGIN, PAGE.h - 4, { align: 'right' });
  };
  const frameBox = (f: { x: number; y: number; w: number; h: number } = FRAME) => {
    doc.setDrawColor(...ink);
    doc.setLineWidth(0.3);
    doc.rect(f.x, f.y, f.w, f.h);
  };
  const credit = (att: string, f: { x: number; y: number; w: number; h: number } = FRAME) => {
    doc.setFontSize(6);
    const tw = Math.min(doc.getTextWidth(att) + 3, f.w - 60);
    doc.setFillColor(255, 255, 255);
    doc.rect(f.x + f.w - tw, f.y + f.h - 4, tw, 4, 'F');
    doc.setTextColor(...ink);
    doc.text(att, f.x + f.w - 1.5, f.y + f.h - 1.2, { align: 'right', maxWidth: tw - 2 });
  };

  const base3d = pages3d.length ? 1 : 0;
  for (let n = 0; n < printable.length; n++) {
    const page = printable[n];
    say(`Page ${n + 1} of ${printable.length} · ${page.title}`, base3d + n);
    if (n > 0) doc.addPage('a4', 'landscape');

    if (page.kind === '3d') {
      const shot = shots![shotIndex++];
      header(page.title, input.subtitle);
      // Full width (no key column), and the how-to-read note once, on the first 3D page only.
      doc.addImage(shot.jpeg, 'JPEG', FRAME_3D.x, FRAME_3D.y, FRAME_3D.w, FRAME_3D.h);
      frameBox(FRAME_3D);
      credit(`Google${shot.credits ? ` · ${shot.credits}` : ''}`, FRAME_3D);
      if (shotIndex === 1) {
        doc.setFontSize(7);
        doc.setTextColor(...grey);
        doc.text('3D: every vehicle at its true length, width and height, where it parks. A perspective has no single scale — measure on a plan page.', MARGIN, FRAME_3D.y + FRAME_3D.h + 3.4, { maxWidth: PAGE.w - 2 * MARGIN });
      }
      footer(n + 1, ' · 3D imagery: Google');
      continue;
    }

    // A page for one level shows that level's items and drawings only.
    const lv = page.level;
    const pin: ExportInput =
      lv == null
        ? input
        : { ...input, items: input.items.filter((i) => itemFloor(i, input.allDrawings) === lv), drawings: input.drawings.filter((d) => onLevel(d, lv)) };
    const { jpeg, scale, view } = await renderMapImage(pin, page, palette, fontFamily);
    firstScale ??= scale;
    header(page.title, `${input.subtitle}${page.levelLabel ? `   ·   ${page.levelLabel}` : ''}   ·   Scale 1:${scale.toLocaleString('en-GB')} at A4`);
    doc.addImage(jpeg, 'JPEG', FRAME.x, FRAME.y, FRAME.w, FRAME.h);
    frameBox();

    // Scale bar (bottom left, on a white plate)
    const maxM = (40 * scale) / 1000;
    const L = niceLength(maxM);
    const barMm = (L * 1000) / scale;
    const bx = FRAME.x + 4;
    const by = FRAME.y + FRAME.h - 7;
    doc.setFillColor(255, 255, 255);
    doc.rect(bx - 2, by - 5.5, barMm + 16, 9, 'F');
    doc.setDrawColor(...ink);
    for (let i = 0; i < 4; i++) {
      if (i % 2 === 0) doc.setFillColor(...ink);
      else doc.setFillColor(255, 255, 255);
      doc.rect(bx + (barMm / 4) * i, by, barMm / 4, 1.6, 'FD');
    }
    doc.setFontSize(7);
    doc.setTextColor(...ink);
    doc.text('0', bx, by - 1.2, { align: 'center' });
    doc.text(fmtMetres(L), bx + barMm, by - 1.2, { align: 'center' });

    // North arrow (top right): north on the page is rotated by -rotation.
    const r = (view.rotation * Math.PI) / 180;
    const nx = FRAME.x + FRAME.w - 10;
    const ny = FRAME.y + 10;
    const dir = { x: -Math.sin(r), y: -Math.cos(r) };
    const perp = { x: -dir.y, y: dir.x };
    doc.setFillColor(255, 255, 255);
    doc.circle(nx, ny, 7.5, 'F');
    doc.setFillColor(...ink);
    const tip = { x: nx + dir.x * 2.6, y: ny + dir.y * 2.6 };
    const tail = { x: nx - dir.x * 5, y: ny - dir.y * 5 };
    doc.triangle(tip.x, tip.y, tail.x + perp.x * 1.6, tail.y + perp.y * 1.6, tail.x - perp.x * 1.6, tail.y - perp.y * 1.6, 'F');
    doc.setFontSize(7);
    doc.setFont('helvetica', 'bold');
    doc.text('N', nx + dir.x * 5.2, ny + dir.y * 5.2 + 1.2, { align: 'center' });
    doc.setFont('helvetica', 'normal');

    const streetPage = page.base === 'street';
    const drawn = streetPage ? [] : [...new Set(pin.drawings.map((d) => d.name))];
    const google = streetPage ? input.street ?? null : input.session ? { attribution: input.attribution } : null;
    const credits = [
      google ? `Google Maps${google.attribution ? ` · ${google.attribution}` : ''}` : null,
      drawn.length ? `Drawing${drawn.length > 1 ? 's' : ''}: ${drawn.join(', ')} (venue)` : null,
    ].filter(Boolean);
    if (credits.length) credit(credits.join(' · '));

    drawKey(doc, pin, palette, { ink, grey, link });
    footer(n + 1, `${google ? (streetPage ? ' · Map: Google Maps' : ' · Imagery: Google Maps') : ''}${drawn.length ? ' · Drawings: the venue’s' : ''}`);
  }

  const blob = doc.output('blob');
  const safe = (t: string) => t.replace(/[\\/:*?"<>|]+/g, '-').trim();
  return { blob, fileName: `${safe(`Parking — ${input.title.replace(/^Parking — /, '')}`)}.pdf`, scale: firstScale, pageCount: total, warning };
}

/** A Google street-map (roadmap) session for the street pages, with its data
 *  credit. Null when imagery isn't set up or Google refuses — the page then
 *  prints on the plain grid, and the PDF still comes out. */
async function streetTiles(anchor: LatLng): Promise<ExportInput['street']> {
  if (!tilesKey()) return null;
  try {
    const session = await getTileSession('roadmap');
    const d = 0.01;
    const info = await viewportInfo(session, 16, { north: anchor.lat + d, south: anchor.lat - d, east: anchor.lng + d, west: anchor.lng - d }, anchor).catch(() => ({ copyright: '', maxZoom: 21 }));
    return { session, maxZoom: Math.min(info.maxZoom, 21), attribution: info.copyright };
  } catch {
    return null;
  }
}

/** The right-hand column of a plan page: key, how to get there, notes. */
function drawKey(
  doc: jsPDF,
  input: ExportInput,
  palette: Palette,
  c: { ink: [number, number, number]; grey: [number, number, number]; link: [number, number, number] },
) {
  const { ink, grey, link } = c;
  let y = FRAME.y + 3;
  const line = (h: number) => {
    y += h;
  };
  const heading = (t: string) => {
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9);
    doc.setTextColor(...ink);
    doc.text(t, SIDE.x, y);
    doc.setFont('helvetica', 'normal');
    line(5);
  };
  const row = (colour: string | null, main: string, sub?: string) => {
    if (y > PAGE.h - 18) return;
    if (colour) {
      doc.setFillColor(...hexToRgb(colour));
      doc.rect(SIDE.x, y - 2.8, 3, 3.2, 'F');
    }
    doc.setFontSize(8);
    doc.setTextColor(...ink);
    const lines = doc.splitTextToSize(main, SIDE.w - 5) as string[];
    doc.text(lines, SIDE.x + 5, y);
    line(lines.length * 3.6);
    if (sub) {
      doc.setFontSize(7);
      doc.setTextColor(...grey);
      const sl = doc.splitTextToSize(sub, SIDE.w - 5) as string[];
      doc.text(sl, SIDE.x + 5, y - 0.6);
      line(sl.length * 3.2);
    }
    line(1);
  };

  const vehicles = input.items.filter((i) => i.kind === 'vehicle');
  const markers = input.items.filter((i) => i.kind === 'marker');
  const areas = input.items.filter((i) => i.kind === 'area' && !i.flat3d);
  const routes = input.items.filter((i) => i.kind === 'route');
  const measures = input.items.filter((i) => i.kind === 'measure');

  if (vehicles.length) {
    heading('Vehicles');
    // Numbered like the badges on the plan, in number order: one line each
    // ("7  Truck 7 · Truck · 16.5 m"), two columns when the list is long.
    const num = (id: string) => input.numbers?.get(id) ?? 0;
    const list = vehicles.filter((v): v is Extract<ParkingItem, { kind: 'vehicle' }> => v.kind === 'vehicle').sort((a, b) => num(a.id) - num(b.id));
    const cols = list.length > 22 ? 2 : 1;
    const colW = SIDE.w / cols;
    const perCol = Math.ceil(list.length / cols);
    const top = y;
    let bottom = y;
    list.forEach((v, i) => {
      const col = Math.floor(i / perCol);
      const ry = top + (i % perCol) * 3.6;
      if (ry > PAGE.h - 18) return;
      const x = SIDE.x + col * colW;
      const s = vehicleSpec(v.type);
      const fill = vehicleColour(palette, v);
      doc.setFillColor(...hexToRgb(fill));
      doc.circle(x + 1.7, ry - 1.1, 1.7, 'F');
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(num(v.id) > 99 ? 4.5 : 5.5);
      doc.setTextColor(...(isLight(fill) ? ink : ([255, 255, 255] as [number, number, number])));
      doc.text(String(num(v.id)), x + 1.7, ry - 0.45, { align: 'center' });
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(7);
      doc.setTextColor(...ink);
      const name = v.label || s?.short || 'Vehicle';
      const detail = cols === 1 ? ` · ${s?.short ?? ''} · ${fmtMetres(v.length)}` : ` · ${fmtMetres(v.length)}`;
      const text = doc.splitTextToSize(name + detail, colW - 5)[0] as string;
      doc.text(text, x + 4.5, ry);
      bottom = Math.max(bottom, ry);
    });
    y = bottom + 3.6;
    if (list.some((v) => rearClearCorners(v))) row(palette['area-no-go'], 'Red hatching: keep clear', 'Ramp, tail lift or rear doors open here');
    line(2);
  }
  if (markers.length) {
    heading('On the ground');
    for (const m of markers) {
      if (m.kind !== 'marker') continue;
      row(null, `${markerSpec(m.type)?.label ?? 'Marker'}${m.label ? `: ${m.label}` : ''}`, m.detail || undefined);
    }
    line(2);
  }
  if (areas.length || routes.length || measures.length) {
    heading('Areas and routes');
    for (const a of areas) if (a.kind === 'area' && !a.flat3d) row(areaColour(palette, a.type), a.label || areaLabel(a.type));
    for (const rt of routes) if (rt.kind === 'route') row(palette.route, rt.label || 'Route', fmtMetres(pathLength(rt.points)));
    for (const m of measures) if (m.kind === 'measure') row(null, `Measured: ${fmtMetres(dist(m.a, m.b))}`);
    line(2);
  }

  if (input.warnings.length) {
    heading('Headroom — check before they go in');
    for (const w of input.warnings) row(palette['area-no-go'], w);
    line(2);
  }

  const gates = markers.filter((m) => m.kind === 'marker' && m.type === 'gate');
  heading(gates.length ? 'Get there' : 'Venue');
  const targets = gates.length
    ? gates.map((g) => ({ name: g.kind === 'marker' && g.label ? g.label : 'Gate', at: toLatLng(input.anchor, g as { x: number; y: number }) }))
    : [{ name: 'Venue', at: input.anchor }];
  for (const t of targets) {
    if (y > PAGE.h - 18) break;
    doc.setFontSize(8);
    doc.setTextColor(...ink);
    doc.text(`${t.name}: ${t.at.lat.toFixed(6)}, ${t.at.lng.toFixed(6)}`, SIDE.x, y);
    line(3.6);
    doc.setTextColor(...link);
    doc.textWithLink('Open in Google Maps', SIDE.x, y, { url: gpsLink(t.at) });
    line(5);
  }

  if (input.notes.trim() && y < PAGE.h - 24) {
    line(1);
    heading('Notes');
    doc.setFontSize(8);
    doc.setTextColor(...ink);
    const lines = doc.splitTextToSize(input.notes.trim(), SIDE.w) as string[];
    const room = Math.max(1, Math.floor((PAGE.h - 14 - y) / 3.6));
    doc.text(lines.slice(0, room), SIDE.x, y);
  }
}
