/* ============================================
   PDF reading survives the production bundle (Oct 2026).

   pdf-parse runs pdf.js, which loads its worker from a path it works out at
   runtime ("./pdf.worker.mjs" beside legacy/build/pdf.mjs). Bundled by webpack,
   or shipped by Vercel without that file, EVERY server-side PDF read fails
   ("Setting up fake worker failed") — info packs, schedule import, rider
   extraction, receipts — while dev and these tests pass, because neither
   bundles. The failure surfaced as a generic "Couldn't read this file".

   Second miss (same day): pdf.js also loads @napi-rs/canvas at runtime to
   polyfill DOMMatrix; without it, Node 20 (what Vercel appears to run here)
   fails with "DOMMatrix is not defined". Found by running a standalone build (traced files only) in
   isolation under Node 20 — the only faithful local stand-in for Vercel.

   Tests can't run the Vercel bundle, so this pins the two config facts that
   make it work, and that the worker file is where the config says — an
   upgrade that moves it fails here, not in production.
   ============================================ */

import { describe, it, expect } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import nextConfig from '../../next.config';

const WORKER = './node_modules/pdfjs-dist/legacy/build/pdf.worker.mjs';

describe('PDF reading in the production bundle', () => {
  it('pdf-parse and the canvas polyfill are left as Node packages, not bundled', () => {
    expect(nextConfig.serverExternalPackages ?? []).toEqual(expect.arrayContaining(['pdf-parse', '@napi-rs/canvas']));
  });

  it('the pdf.js worker and the canvas polyfill (+ its Linux binary) ship with the API routes', () => {
    const inc = nextConfig.outputFileTracingIncludes ?? {};
    expect(inc['/api/**/*'] ?? []).toEqual(
      expect.arrayContaining([WORKER, './node_modules/@napi-rs/canvas/**/*', './node_modules/@napi-rs/canvas-linux-x64-gnu/**/*']),
    );
  });

  it('the canvas package pdf-parse asks for is installed, with the Linux build Vercel runs', () => {
    const parse = JSON.parse(readFileSync(join(process.cwd(), 'node_modules/pdf-parse/package.json'), 'utf8')) as { dependencies?: Record<string, string> };
    expect(parse.dependencies?.['@napi-rs/canvas']).toBeTruthy();
    expect(existsSync(join(process.cwd(), 'node_modules/@napi-rs/canvas/package.json'))).toBe(true);
    // Installed as an optional dependency for the build machine's platform;
    // Vercel builds on linux-x64 glibc, the same as CI.
    if (process.platform === 'linux' && process.arch === 'x64') {
      expect(existsSync(join(process.cwd(), 'node_modules/@napi-rs/canvas-linux-x64-gnu'))).toBe(true);
    }
  });

  it('the worker is where pdf.js looks for it, for the pdf.js pdf-parse uses', () => {
    expect(existsSync(join(process.cwd(), WORKER))).toBe(true);
    const pdf = readFileSync(join(process.cwd(), 'node_modules/pdfjs-dist/legacy/build/pdf.mjs'), 'utf8');
    expect(pdf).toContain('"./pdf.worker.mjs"');
    const parse = JSON.parse(readFileSync(join(process.cwd(), 'node_modules/pdf-parse/package.json'), 'utf8')) as { dependencies?: Record<string, string> };
    const own = JSON.parse(readFileSync(join(process.cwd(), 'node_modules/pdfjs-dist/package.json'), 'utf8')) as { version: string };
    // pdf-parse must resolve the same top-level pdfjs-dist the trace ships.
    expect(existsSync(join(process.cwd(), 'node_modules/pdf-parse/node_modules/pdfjs-dist'))).toBe(false);
    expect(parse.dependencies?.['pdfjs-dist']).toBe(own.version);
  });
});
