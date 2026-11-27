/* ============================================
   LOWPASS — Document fonts for PDFs (Nov 2026)

   The rider PDF is set in Inter (text) and Montserrat (titles + headings) —
   the app's own faces — embedded as data URIs so every Chromium (a laptop,
   or the serverless one with almost no fonts) sets it the same way. Latin
   variable fonts (fontsource, SIL OFL — licences beside them in
   public/fonts); one file per face covers every weight. Anything outside
   Latin falls back to the system font for those characters.

   Read once per server instance; a missing file degrades to '' (the system
   stack), never a failed export. The files are listed in next.config's
   outputFileTracingIncludes — read by a runtime path, the tracer can't see them.
   ============================================ */

import { readFile } from 'node:fs/promises';
import path from 'node:path';

const FACES = [
  { family: 'Inter', style: 'normal', file: 'inter-latin-wght-normal.woff2' },
  { family: 'Inter', style: 'italic', file: 'inter-latin-wght-italic.woff2' },
  { family: 'Montserrat', style: 'normal', file: 'montserrat-latin-wght-normal.woff2' },
  { family: 'Montserrat', style: 'italic', file: 'montserrat-latin-wght-italic.woff2' },
] as const;

let cached: Promise<string> | null = null;

/** `@font-face` rules for Inter + Montserrat (every weight), or '' if the
 *  files can't be read. */
export function documentFontCss(): Promise<string> {
  cached ??= Promise.all(
    FACES.map(async (f) => {
      try {
        const buf = await readFile(path.join(process.cwd(), 'public', 'fonts', f.file));
        return `@font-face{font-family:'${f.family}';font-style:${f.style};font-weight:100 900;font-display:block;src:url(data:font/woff2;base64,${buf.toString('base64')}) format('woff2');}`;
      } catch {
        return '';
      }
    }),
  ).then((rules) => rules.join(''));
  return cached;
}
