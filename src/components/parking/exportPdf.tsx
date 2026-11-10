'use client';

/* ============================================
   Parking map → PDF page 1 (Nov 2026, Adam)

   Rendered in the browser, at export time, from the same <ParkingScene> the
   editor shows — so the PDF can't disagree with the screen:

     1. frame the DRAWING at a standard scale (printFrame — the editor outlines
      the same frame, so what's outlined is what prints)
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
  type LatLng,
  type View,
} from '@/lib/parking/geo';
import { areaLabel, markerSpec, vehicleSpec } from '@/lib/parking/catalogue';
import { pathLength, type ParkingItem } from '@/lib/parking/model';
import { ParkingScene } from './ParkingScene';
import { loadCesium } from './loadCesium';
import { applyCamera, createViewer, creditsText, lookAt, populate, settle } from './scene3d';
import { defaultCamera3d } from '@/lib/parking/blocks3d';
import { PRINT_FRAME_MM, type PrintFrame } from '@/lib/parking/print';
import { areaColour, resolvePalette, roleColour, type Palette } from './palette';
import { tilesKey, tileUrl, type TileSession } from './googleTiles';

// A4 landscape, millimetres.
const PAGE = { w: 297, h: 210 };
const MARGIN = 10;
const FRAME = { x: MARGIN, y: 26, w: PRINT_FRAME_MM.w, h: PRINT_FRAME_MM.h };
const SIDE = { x: FRAME.x + FRAME.w + 6, w: PAGE.w - MARGIN - (FRAME.x + FRAME.w + 6) };
const PX_PER_MM = 8; // ≈ 203 dpi
const LABEL_SCALE = 2.2; // 12 px labels → ~9 pt on paper

export interface ExportInput {
  title: string;
  subtitle: string;
  anchor: LatLng;
  view: View;
  /** What prints: centre + 1:N, from printFrame() — the same frame the editor outlines. */
  frame: PrintFrame;
  items: ParkingItem[];
  notes: string;
  session: TileSession | null;
  maxZoom: number;
  attribution: string;
}

export interface ExportResult {
  blob: Blob;
  fileName: string;
  scale: number;
  /** Set when page 2 (3D) couldn't be made; page 1 is still complete. */
  warning: string | null;
}

const PX_PER_MM_3D = 5; // a WebGL canvas of ~980 × 870 — enough for print, kind to laptops

/** Page 2: the 3D view, rendered off-screen from the same scene builder as the live 3D page. */
async function render3dImage(input: ExportInput, palette: Palette): Promise<{ jpeg: string; credits: string }> {
  const key = tilesKey();
  if (!key) throw new Error('no Google Map Tiles key');
  const W = Math.round(FRAME.w * PX_PER_MM_3D);
  const H = Math.round(FRAME.h * PX_PER_MM_3D);
  const host = document.createElement('div');
  Object.assign(host.style, { position: 'fixed', left: '-20000px', top: '0', width: `${W}px`, height: `${H}px` });
  document.body.appendChild(host);
  let viewer: ReturnType<typeof createViewer> | null = null;
  try {
    const Cesium = await loadCesium();
    viewer = createViewer(Cesium, host, { withTiles: true, blank: palette.blank, sky: palette.sky });
    const def = defaultCamera3d({ x: input.frame.cx, y: input.frame.cy }, Math.max(input.frame.wM, input.frame.hM) * 0.7, input.view.rotation);
    lookAt(Cesium, viewer, input.anchor, def.target, 0, def.heading, def.pitch, def.range);
    const scene = await populate(Cesium, viewer, { anchor: input.anchor, items: input.items, palette, tilesKey: key });
    if (input.view.cam3d) applyCamera(Cesium, viewer, input.anchor, input.view.cam3d);
    else lookAt(Cesium, viewer, input.anchor, def.target, scene.ground0, def.heading, def.pitch, def.range);
    await settle(viewer, scene.tileset, 30_000);
    viewer.render();
    return { jpeg: viewer.canvas.toDataURL('image/jpeg', 0.9), credits: creditsText(viewer) };
  } finally {
    if (viewer && !viewer.isDestroyed()) viewer.destroy();
    host.remove();
  }
}

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
export async function renderMapImage(input: ExportInput, palette: Palette, fontFamily: string): Promise<{ jpeg: string; scale: number; view: View }> {
  const { scale } = input.frame;
  const W = Math.round(FRAME.w * PX_PER_MM);
  const H = Math.round(FRAME.h * PX_PER_MM);
  const view: View = { ...input.view, cx: input.frame.cx, cy: input.frame.cy, ppm: (PX_PER_MM * 1000) / scale };

  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('This browser cannot draw the map.');
  ctx.fillStyle = palette.blank;
  ctx.fillRect(0, 0, W, H);

  if (input.session) {
    const z = tileZoomFor(input.anchor.lat, view.ppm, 1, input.session.tileScale, input.maxZoom);
    const keys = visibleTiles(input.anchor, view, W, H, z, 8);
    const bitmaps = await pool(keys, 8, (k) => loadTileBitmap(tileUrl(input.session!, k)));
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

  const svg = sceneSvg({
    view,
    width: W,
    height: H,
    items: input.items,
    tiles: [],
    palette: { ...palette, blank: 'transparent' },
    grid: !input.session,
    labelScale: LABEL_SCALE,
    fontFamily,
  });
  ctx.drawImage(await svgToImage(svg), 0, 0, W, H);
  return { jpeg: canvas.toDataURL('image/jpeg', 0.9), scale, view };
}

function gpsLink(p: LatLng): string {
  return `https://www.google.com/maps/search/?api=1&query=${p.lat.toFixed(6)},${p.lng.toFixed(6)}`;
}

export async function exportParkingPdf(input: ExportInput): Promise<ExportResult> {
  const palette = resolvePalette();
  const fontFamily = getComputedStyle(document.body).fontFamily || 'Helvetica, Arial, sans-serif';
  const { jpeg, scale, view } = await renderMapImage(input, palette, fontFamily);

  const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
  // Print ink follows the LIGHT tokens (paper is white), as exportJobPdf does.
  const ink: [number, number, number] = [17, 24, 39]; // --lp-text (#111827)
  const grey: [number, number, number] = [107, 114, 128]; // --lp-text-secondary (#6B7280)
  const link: [number, number, number] = [255, 69, 0]; // --lp-orange
  doc.setTextColor(...ink);

  // Title
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(16);
  doc.text(input.title, MARGIN, 15);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.setTextColor(...grey);
  doc.text(`${input.subtitle}   ·   Scale 1:${scale.toLocaleString('en-GB')} at A4`, MARGIN, 21);

  // Map
  doc.addImage(jpeg, 'JPEG', FRAME.x, FRAME.y, FRAME.w, FRAME.h);
  doc.setDrawColor(...ink);
  doc.setLineWidth(0.3);
  doc.rect(FRAME.x, FRAME.y, FRAME.w, FRAME.h);

  // Scale bar (bottom left, on a white plate)
  const maxM = (40 * scale) / 1000;
  const L = niceLength(maxM);
  const barMm = (L * 1000) / scale;
  const bx = FRAME.x + 4;
  const by = FRAME.y + FRAME.h - 7;
  doc.setFillColor(255, 255, 255);
  doc.rect(bx - 2, by - 5.5, barMm + 16, 9, 'F');
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
  // White plate; arrow points at north, the N sits at its tip.
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

  // Google attribution (bottom right of the imagery, never covered)
  if (input.session) {
    const att = `Google Maps${input.attribution ? ` · ${input.attribution}` : ''}`;
    doc.setFontSize(6);
    const tw = Math.min(doc.getTextWidth(att) + 3, FRAME.w - 60);
    doc.setFillColor(255, 255, 255);
    doc.rect(FRAME.x + FRAME.w - tw, FRAME.y + FRAME.h - 4, tw, 4, 'F');
    doc.setTextColor(...ink);
    doc.text(att, FRAME.x + FRAME.w - 1.5, FRAME.y + FRAME.h - 1.2, { align: 'right', maxWidth: tw - 2 });
  }

  // Key
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
  const areas = input.items.filter((i) => i.kind === 'area');
  const routes = input.items.filter((i) => i.kind === 'route');
  const measures = input.items.filter((i) => i.kind === 'measure');

  if (vehicles.length) {
    heading('Vehicles');
    for (const v of vehicles) {
      if (v.kind !== 'vehicle') continue;
      const s = vehicleSpec(v.type);
      row(roleColour(palette, s?.role ?? 'bus'), v.label || s?.short || 'Vehicle', `${s?.label ?? ''} · ${v.length} × ${v.width} m`);
    }
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
    for (const a of areas) if (a.kind === 'area') row(areaColour(palette, a.type), a.label || areaLabel(a.type));
    for (const rt of routes) if (rt.kind === 'route') row(palette.route, rt.label || 'Route', fmtMetres(pathLength(rt.points)));
    for (const m of measures) if (m.kind === 'measure') row(null, `Measured: ${fmtMetres(dist(m.a, m.b))}`);
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

  const stamp = new Date().toLocaleString('en-GB', { dateStyle: 'medium', timeStyle: 'short' });
  const footer = (extra: string) => {
    doc.setFontSize(6.5);
    doc.setTextColor(...grey);
    doc.text(`Drawn to scale in Lowpass · exported ${stamp}${extra}`, MARGIN, PAGE.h - 4);
  };
  footer(input.session ? ' · Imagery: Google Maps' : '');

  // Page 2 — the same drawing in 3D, true-size vehicles on Google's 3D city.
  let warning: string | null = null;
  if (input.session) {
    try {
      const shot = await render3dImage(input, palette);
      doc.addPage('a4', 'landscape');
      doc.setTextColor(...ink);
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(16);
      doc.text(`${input.title} · 3D`, MARGIN, 15);
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(9);
      doc.setTextColor(...grey);
      doc.text(input.subtitle, MARGIN, 21);
      doc.addImage(shot.jpeg, 'JPEG', FRAME.x, FRAME.y, FRAME.w, FRAME.h);
      doc.setDrawColor(...ink);
      doc.setLineWidth(0.3);
      doc.rect(FRAME.x, FRAME.y, FRAME.w, FRAME.h);
      const att = `Google${shot.credits ? ` · ${shot.credits}` : ''}`;
      doc.setFontSize(6);
      const tw = Math.min(doc.getTextWidth(att) + 3, FRAME.w - 20);
      doc.setFillColor(255, 255, 255);
      doc.rect(FRAME.x + FRAME.w - tw, FRAME.y + FRAME.h - 4, tw, 4, 'F');
      doc.setTextColor(...ink);
      doc.text(att, FRAME.x + FRAME.w - 1.5, FRAME.y + FRAME.h - 1.2, { align: 'right', maxWidth: tw - 2 });
      // How to read it.
      doc.setFontSize(9);
      doc.setFont('helvetica', 'bold');
      doc.text('Reading this view', SIDE.x, FRAME.y + 3);
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(8);
      doc.text(
        doc.splitTextToSize(
          'Every vehicle is drawn at its true length, width and height, where it parks, beside the real buildings. A perspective view has no single scale, so there is no scale bar here: each vehicle is labelled with its length. Measure on page 1.',
          SIDE.w,
        ) as string[],
        SIDE.x,
        FRAME.y + 8,
      );
      footer(' · 3D imagery: Google');
    } catch (e) {
      warning = `The PDF has no 3D page: ${e instanceof Error ? e.message : 'the 3D view failed'}.`;
    }
  }

  const blob = doc.output('blob');
  const safe = (s: string) => s.replace(/[\\/:*?"<>|]+/g, '-').trim();
  return { blob, fileName: `${safe(`Parking — ${input.title.replace(/^Parking — /, '')}`)}.pdf`, scale, warning };
}
