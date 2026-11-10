'use client';

/* ============================================
   Venue drawings → pixels (Nov 2026, Adam)

   The file stays in tour Files; the browser signs it (Storage RLS applies),
   fetches the BYTES (so the canvas is same-origin — usable by the PDF export
   and 3D), and renders just the crop with pdf.js, or draws the crop of an
   image. One open document per file, cached for the session.

   Resolution: the crop's long edge ≤ 4096 px and ≤ 16 MP in all (the
   largest canvas phones reliably allow), and never more than 4 px per PDF
   point (≈ 288 dpi) — past that a CAD PDF only gets bigger, not sharper.
   ============================================ */

import { loadPdfJs } from '@/lib/pdf/loadPdfJs';
import { createClient } from '@/lib/supabase-client';
import type { ParkingDrawing } from '@/lib/parking/model';

export interface DrawingFileRef {
  id: string;
  name: string;
  kind: 'pdf' | 'image';
  bucket: string | null;
  path: string | null;
  /** Already signed (a driver link — no session to sign with). */
  url?: string;
}

type PdfViewport = { width: number; height: number };
type PdfPageProxy = {
  getViewport: (o: { scale: number; offsetX?: number; offsetY?: number }) => PdfViewport;
  render: (o: { canvasContext: CanvasRenderingContext2D; viewport: PdfViewport; background?: string }) => { promise: Promise<void> };
};
type PdfDoc = { numPages: number; getPage: (n: number) => Promise<PdfPageProxy> };
type PdfJs = { getDocument: (src: { data: Uint8Array }) => { promise: Promise<PdfDoc> } };

export type DrawingSource = { kind: 'pdf'; doc: PdfDoc } | { kind: 'image'; img: ImageBitmap };

const sources = new Map<string, Promise<DrawingSource>>();

async function fetchBytes(f: DrawingFileRef): Promise<Blob> {
  let url = f.url;
  if (!url) {
    if (!f.bucket || !f.path) throw new Error(`${f.name} has no stored file.`);
    const { data, error } = await createClient().storage.from(f.bucket).createSignedUrl(f.path, 600);
    if (error || !data?.signedUrl) throw new Error(`${f.name} couldn’t be opened (${error?.message ?? 'no link'}).`);
    url = data.signedUrl;
  }
  const r = await fetch(url);
  if (!r.ok) throw new Error(`${f.name} couldn’t be downloaded (${r.status}).`);
  return r.blob();
}

/** Open a drawing's file once per session (keyed by file + stored path, so a new version reopens). */
export function openDrawing(f: DrawingFileRef): Promise<DrawingSource> {
  const key = `${f.id}:${f.path ?? f.url?.split('?')[0] ?? ''}`;
  let p = sources.get(key);
  if (!p) {
    p = (async (): Promise<DrawingSource> => {
      const blob = await fetchBytes(f);
      if (f.kind === 'image') return { kind: 'image', img: await createImageBitmap(blob) };
      const pdfjs = await loadPdfJs<PdfJs>();
      const doc = await pdfjs.getDocument({ data: new Uint8Array(await blob.arrayBuffer()) }).promise;
      return { kind: 'pdf', doc };
    })();
    p.catch(() => sources.delete(key));
    sources.set(key, p);
  }
  return p;
}

export function pageCount(src: DrawingSource): number {
  return src.kind === 'pdf' ? src.doc.numPages : 1;
}

/** The page's size in source units: PDF points (rotation applied) or image pixels. */
export async function pageSize(src: DrawingSource, page: number): Promise<{ w: number; h: number }> {
  if (src.kind === 'image') return { w: src.img.width, h: src.img.height };
  const vp = (await src.doc.getPage(page)).getViewport({ scale: 1 });
  return { w: vp.width, h: vp.height };
}

export const RASTER_MAX_EDGE = 4096;
const RASTER_MAX_AREA = 16_000_000;
const PDF_MAX_PX_PER_PT = 4;

/** Pixels per source unit for a region (see the header). */
export function rasterScale(kind: 'pdf' | 'image', w: number, h: number, maxEdge = RASTER_MAX_EDGE, fill = false): number {
  const k = Math.min(maxEdge / Math.max(w, h), Math.sqrt(RASTER_MAX_AREA / (w * h)));
  // fill: a close-up for the AI fills its size whatever the source — a vector
  // PDF stays sharp, and even an upscaled photo gives finer pixels to point at.
  return fill ? k : Math.min(k, kind === 'pdf' ? PDF_MAX_PX_PER_PT : 1);
}

/** Render a region of a page (source units) to a canvas. */
export async function renderRegion(
  src: DrawingSource,
  page: number,
  r: { u0: number; v0: number; u1: number; v1: number },
  paper: string,
  maxEdge = RASTER_MAX_EDGE,
  fill = false,
): Promise<HTMLCanvasElement> {
  const w = r.u1 - r.u0;
  const h = r.v1 - r.v0;
  const k = rasterScale(src.kind, w, h, maxEdge, fill);
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(w * k));
  canvas.height = Math.max(1, Math.round(h * k));
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('This browser cannot draw the drawing.');
  // Opaque paper (--lp-map-paper): a PDF page can be transparent.
  ctx.fillStyle = paper;
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  if (src.kind === 'image') {
    ctx.drawImage(src.img, r.u0, r.v0, w, h, 0, 0, canvas.width, canvas.height);
    return canvas;
  }
  const pg = await src.doc.getPage(page);
  const viewport = pg.getViewport({ scale: k, offsetX: -r.u0 * k, offsetY: -r.v0 * k });
  await pg.render({ canvasContext: ctx, viewport }).promise;
  return canvas;
}

/** A drawing's crop, rendered (cached per file / page / crop). */
const crops = new Map<string, Promise<HTMLCanvasElement>>();
export function renderCrop(f: DrawingFileRef, d: Pick<ParkingDrawing, 'page' | 'crop'>, paper: string): Promise<HTMLCanvasElement> {
  const key = `${f.id}:${f.path ?? ''}:${d.page}:${d.crop.u0},${d.crop.v0},${d.crop.u1},${d.crop.v1}`;
  let p = crops.get(key);
  if (!p) {
    p = openDrawing(f).then((src) => renderRegion(src, d.page, d.crop, paper));
    p.catch(() => crops.delete(key));
    crops.set(key, p);
    // Keep the cache small: crops are up to 16 MP each.
    if (crops.size > 12) crops.delete(crops.keys().next().value as string);
  }
  return p;
}

export function canvasUrl(c: HTMLCanvasElement): Promise<string> {
  return new Promise((res, rej) => c.toBlob((b) => (b ? res(URL.createObjectURL(b)) : rej(new Error('The drawing could not be prepared.'))), 'image/jpeg', 0.92));
}

/** The same drawing, lightness inverted but hues kept (c + 255 − max − min per
 *  pixel): white paper → black, black lines → white, a red line stays red.
 *  Inside drawings / no satellite show this, so the plan reads like the dark
 *  map and the white selection / measure lines stay visible on it. */
export function darkCopy(src: HTMLCanvasElement): HTMLCanvasElement {
  const out = document.createElement('canvas');
  out.width = src.width;
  out.height = src.height;
  const ctx = out.getContext('2d');
  if (!ctx) return src;
  ctx.drawImage(src, 0, 0);
  const img = ctx.getImageData(0, 0, out.width, out.height);
  invertLightness(img.data);
  ctx.putImageData(img, 0, 0);
  return out;
}

export function invertLightness(px: Uint8ClampedArray): void {
  for (let i = 0; i < px.length; i += 4) {
    const r = px[i];
    const g = px[i + 1];
    const b = px[i + 2];
    const k = 255 - Math.max(r, g, b) - Math.min(r, g, b);
    px[i] = r + k;
    px[i + 1] = g + k;
    px[i + 2] = b + k;
  }
}

/** How a drawing shows: lines on the photo, or the dark copy as a floor. */
export function drawingLook(d: Pick<ParkingDrawing, 'inside'>, satelliteOn: boolean): 'lines' | 'dark' {
  return d.inside || !satelliteOn ? 'dark' : 'lines';
}
