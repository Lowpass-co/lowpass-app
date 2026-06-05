/* ============================================
   LOWPASS — Stage Plot PDF (dev endpoint) (§SP7)

   POST { plot, items, meta?, opts? } → branded PDF, rendered via
   the shared Puppeteer pipeline. Dev-only (404 in production) and
   auth-free so the dev editor can export without DB/login. The
   production endpoint (auth-gated, loads from DB) reuses the same
   buildStagePlotPdfHtml builder.
   ============================================ */

import { closePage, getBrowser } from '@/lib/rider-packs/puppeteer';
import { buildStagePlotPdfHtml } from '@/lib/stage-plot/pdf-render';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

export async function POST(request: Request): Promise<Response> {
  if (process.env.NODE_ENV === 'production') {
    return new Response('Not found', { status: 404 });
  }
  let body: { plot?: unknown; items?: unknown; meta?: unknown; opts?: { bw?: boolean; paper?: 'A4' | 'Letter'; orientation?: 'landscape' | 'portrait' } };
  try {
    body = await request.json();
  } catch {
    return new Response('Bad JSON', { status: 400 });
  }
  const plot = body.plot as Parameters<typeof buildStagePlotPdfHtml>[0];
  const items = (body.items ?? []) as Parameters<typeof buildStagePlotPdfHtml>[1];
  if (!plot?.widthFt) return new Response('Missing plot', { status: 400 });

  const opts = body.opts ?? {};
  const html = buildStagePlotPdfHtml(
    plot,
    items,
    {
      title: plot.name,
      timestamp: new Date().toISOString().slice(0, 16).replace('T', ' '),
      version: 'draft',
      ...(body.meta as object),
    },
    opts,
  );

  const browser = await getBrowser();
  const page = await browser.newPage();
  try {
    await page.setContent(html, { waitUntil: 'load', timeout: 15_000 });
    const buffer = await page.pdf({
      format: opts.paper ?? 'A4',
      landscape: (opts.orientation ?? 'landscape') === 'landscape',
      printBackground: true,
      margin: { top: '12mm', right: '12mm', bottom: '12mm', left: '12mm' },
    });
    return new Response(new Uint8Array(buffer), {
      status: 200,
      headers: { 'Content-Type': 'application/pdf', 'Content-Disposition': 'inline; filename="stage-plot.pdf"', 'Cache-Control': 'no-store' },
    });
  } finally {
    await closePage(page);
  }
}
