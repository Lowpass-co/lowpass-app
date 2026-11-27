/* ============================================
   LOWPASS — Puppeteer launcher (Sprint 12 §10)

   Wraps the boilerplate for launching a headless Chromium
   instance via @sparticuz/chromium on Vercel (and a local
   binary path in dev). Used by the rider PDF endpoint and
   (in §11) the bundled packet PDF endpoint.

   Vercel notes:
     - @sparticuz/chromium ships a Chromium binary precompiled
       for the Vercel function runtime. Pair with
       puppeteer-core (not the full puppeteer package, which
       would bundle its own Chromium and blow the function
       size limit).
     - Cold start: ~3–5s while the binary unpacks. Warm: 1–2s.
     - Vercel Pro plan max function timeout is 60s; single
       rider renders should fit comfortably (single-digit
       seconds even cold). Bundle PDF + heavy assets may need
       monitoring — flagged in the endpoint's commit body.

   Dev notes:
     - `process.env.PUPPETEER_EXECUTABLE_PATH` lets a local
       developer point at their installed Chrome (avoids
       downloading the binary on every npm install).
     - When that env var is missing, the helper still uses
       @sparticuz/chromium so local-vs-prod parity is
       preserved by default.
   ============================================ */

import chromium from '@sparticuz/chromium';
import puppeteer, { type Browser } from 'puppeteer-core';

let cached: Browser | null = null;

/** Launch (or return a cached) browser instance. Vercel
 *  function instances are short-lived but a single instance
 *  may handle multiple requests; reusing the browser saves
 *  ~3s on warm renders. The caller is responsible for closing
 *  the page; we don't close the browser between requests. */
export async function getBrowser(): Promise<Browser> {
  if (cached && cached.connected) return cached;
  const executablePath =
    process.env.PUPPETEER_EXECUTABLE_PATH ??
    (await chromium.executablePath());
  cached = await puppeteer.launch({
    args: chromium.args,
    executablePath,
    headless: true,
    /* @sparticuz/chromium 148+ dropped the static
     * defaultViewport export; Chromium ships with its own
     * sensible defaults and Puppeteer falls back to those
     * when defaultViewport isn't passed. */
  });
  return cached;
}

/** Best-effort cleanup. Called by the endpoint on completion
 *  / error so partial-failure renders don't leak open pages
 *  across requests. */
export async function closePage(page: Awaited<ReturnType<Browser['newPage']>>): Promise<void> {
  try {
    await page.close();
  } catch {
    /* swallow — the request is already responding */
  }
}

/** May the PDF renderer load this URL? (Nov 2026 — security.) The HTML we
 *  print carries strings users typed (logo URLs, links), and this Chromium sits
 *  inside the server's network, so by default it loads NOTHING from the
 *  network: data: / about: / blob: only — every export inlines its images and
 *  fonts. `allowPrefixes` opens exact URL prefixes (the advance packet's signed
 *  Storage URLs). */
export function rendererMayLoad(url: string, allowPrefixes: readonly string[] = []): boolean {
  if (/^(data|about|blob):/i.test(url)) return true;
  return allowPrefixes.some((p) => url.startsWith(p));
}

/** Our Storage's object URLs (signed or public), as a prefix — or none. */
export function storageObjectPrefix(): string[] {
  try {
    const origin = new URL(process.env.NEXT_PUBLIC_SUPABASE_URL ?? '').origin;
    return origin.startsWith('https://') || origin.startsWith('http://') ? [`${origin}/storage/v1/object/`] : [];
  } catch {
    return [];
  }
}

/** A new page that refuses every request `rendererMayLoad` doesn't allow. */
export async function newRenderPage(browser: Browser, allowPrefixes: readonly string[] = []) {
  const page = await browser.newPage();
  await page.setRequestInterception(true);
  page.on('request', (req) => {
    if (req.isInterceptResolutionHandled()) return;
    if (rendererMayLoad(req.url(), allowPrefixes)) void req.continue();
    else void req.abort('blockedbyclient');
  });
  return page;
}
