/* ============================================
   LOWPASS — PDF page 1 → PNG, server-side (RC-4)

   WHY THIS EXISTS: Claude Vision is images-only, so until now a PDF receipt was
   stored and flagged for manual entry. That left the feature working on the
   MINORITY of real receipts — hotel folios, bus invoices and production bills
   almost always arrive as PDFs. Rendering page 1 puts them back on the Vision path.

   HOW, and why not something else:
     • The repo ALREADY runs headless Chromium on Vercel (puppeteer-core +
       @sparticuz/chromium, managed by src/lib/rider-packs/puppeteer.ts) for the
       rider-pack and advance-packet PDFs. Reusing that browser means no new
       native dependency and no second binary to keep alive in a lambda.
     • pdf.js renders INSIDE that page, where a real <canvas> exists. Running
       pdf.js in bare Node would need a canvas polyfill (node-canvas / @napi-rs)
       — a native build, on a platform where native builds are the thing most
       likely to break a deploy.
     • Chromium's own PDF viewer is not screenshot-able headlessly, so "just open
       the PDF and screenshot it" is not an option despite sounding simpler.

   pdfjs-dist v6 ships ESM ONLY. An ES module does not populate global scope, so
   it cannot simply be pasted into a <script> and read off `window`. Both the main
   bundle and its worker are therefore read off disk, turned into data: URLs, and
   dynamically imported inside the page, which then assigns the namespace to
   window. Nothing is fetched at runtime — no CDN, no network inside the render.

   FAILURE IS NOT FATAL. Every path returns null rather than throwing; the caller
   keeps the store-and-flag fallback, so a PDF we cannot rasterize still lands as
   a saved receipt awaiting manual entry. Losing a receipt is the one outcome this
   feature must never produce.
   ============================================ */

import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { getBrowser, closePage } from '@/lib/rider-packs/puppeteer';

/** Cap the rendered edge — Vision doesn't need more, and it bounds memory. */
const MAX_EDGE_PX = 1600;
/** A single page render should be quick; don't hold a lambda open. */
const RENDER_TIMEOUT_MS = 20_000;

interface Bundles {
  /** data: URL of the pdf.js ESM bundle. */
  lib: string;
  /** data: URL of its worker — v6 requires a real worker, not a fake one. */
  worker: string;
}
let cachedBundles: Bundles | null = null;

function toDataUrl(src: string): string {
  return `data:text/javascript;base64,${Buffer.from(src, 'utf8').toString('base64')}`;
}

/** pdf.js + worker, read from node_modules once per lambda instance. */
async function pdfJsBundles(): Promise<Bundles | null> {
  if (cachedBundles) return cachedBundles;
  try {
    const require_ = createRequire(import.meta.url);
    const [lib, worker] = await Promise.all([
      readFile(require_.resolve('pdfjs-dist/legacy/build/pdf.min.mjs'), 'utf8'),
      readFile(require_.resolve('pdfjs-dist/legacy/build/pdf.worker.min.mjs'), 'utf8'),
    ]);
    cachedBundles = { lib: toDataUrl(lib), worker: toDataUrl(worker) };
    return cachedBundles;
  } catch {
    return null;
  }
}

/**
 * Render page 1 of a PDF to a base64 PNG.
 * Returns null on ANY failure — the caller falls back to store-and-flag.
 */
export async function renderPdfFirstPageToPng(pdf: Buffer): Promise<string | null> {
  const bundles = await pdfJsBundles();
  if (!bundles) return null;

  let page: Awaited<ReturnType<Awaited<ReturnType<typeof getBrowser>>['newPage']>> | null = null;
  try {
    const browser = await getBrowser();
    page = await browser.newPage();
    await page.setContent('<!doctype html><html><body></body></html>');

    /* Dynamically import the ESM bundle from a data: URL and hang the namespace
       on window. addScriptTag resolves when the tag is ADDED, not when the module
       has executed, so wait for the assignment before evaluating. */
    await page.addScriptTag({
      content: `import * as lib from "${bundles.lib}"; window.pdfjsLib = lib;`,
      type: 'module',
    });
    await page.waitForFunction('window.pdfjsLib !== undefined', { timeout: RENDER_TIMEOUT_MS });

    const dataUrl = await page.evaluate(
      async (b64: string, maxEdge: number, workerUrl: string) => {
        type PdfJs = {
          GlobalWorkerOptions: { workerSrc: string };
          getDocument: (o: { data: Uint8Array }) => { promise: Promise<PdfDoc> };
        };
        type PdfDoc = { getPage: (n: number) => Promise<PdfPage> };
        type PdfPage = {
          getViewport: (o: { scale: number }) => { width: number; height: number };
          render: (o: { canvasContext: CanvasRenderingContext2D; viewport: unknown }) => { promise: Promise<void> };
        };
        const w = window as unknown as { pdfjsLib?: PdfJs };
        const lib = w.pdfjsLib;
        if (!lib) return null;

        // v6 needs a REAL worker; point it at the injected data: URL.
        lib.GlobalWorkerOptions.workerSrc = workerUrl;

        const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
        const doc = await lib.getDocument({ data: bytes }).promise;
        const pdfPage = await doc.getPage(1);

        const base = pdfPage.getViewport({ scale: 1 });
        const scale = Math.min(maxEdge / Math.max(base.width, base.height), 2);
        const viewport = pdfPage.getViewport({ scale: scale > 0 ? scale : 1 });

        const canvas = document.createElement('canvas');
        canvas.width = Math.ceil(viewport.width);
        canvas.height = Math.ceil(viewport.height);
        const ctx = canvas.getContext('2d');
        if (!ctx) return null;
        // White ground — receipts are usually black-on-white and a transparent
        // PNG reads as black-on-black to Vision.
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, canvas.width, canvas.height);

        await pdfPage.render({ canvasContext: ctx, viewport }).promise;
        return canvas.toDataURL('image/png');
      },
      pdf.toString('base64'),
      MAX_EDGE_PX,
      bundles.worker,
    );

    if (typeof dataUrl !== 'string' || !dataUrl.startsWith('data:image/png;base64,')) return null;
    return dataUrl.slice('data:image/png;base64,'.length);
  } catch {
    return null;
  } finally {
    if (page) await closePage(page).catch(() => {});
  }
}

/** True when the upload is a PDF we should try to rasterize. */
export function isPdf(mediaType: string | null | undefined): boolean {
  return (mediaType ?? '').toLowerCase() === 'application/pdf';
}

export const PDF_RENDER_TIMEOUT_MS = RENDER_TIMEOUT_MS;
