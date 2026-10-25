/* ============================================
   LOWPASS — server files must not import plain values from 'use client' files

   Oct 2026 outage: /artists (a SERVER component) imported `dayTypesPresent`
   from components/tour/TourFingerprint.tsx — a 'use client' module — and
   called it. A server component may RENDER a client component, but anything
   else it imports from a client module is a client reference: calling it
   throws at runtime ("Attempted to call … from the server"). tsc, lint, the
   unit tests and `next build` all passed; the page failed on every load.

   Silent until production, so: prevention. This walks every server-side file
   (no 'use client' line) under src/app and src/server, resolves each `@/` and
   relative import, and fails when a file imports a NON-COMPONENT value
   (camelCase function or ALL_CAPS constant — not a PascalCase component, not
   a type) from a 'use client' module. Move such helpers to a plain module.
   ============================================ */

import { describe, expect, it } from 'vitest';
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';

const ROOT = resolve(__dirname, '../../..');
const SRC = join(ROOT, 'src');

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (/\.(ts|tsx)$/.test(name) && !/\.test\.tsx?$|\.harness\.ts$/.test(name)) out.push(p);
  }
  return out;
}

const isClient = (src: string) => /^\s*(?:\/\*[\s\S]*?\*\/\s*|\/\/[^\n]*\n\s*)*['"]use client['"]/.test(src);

function resolveImport(from: string, spec: string): string | null {
  let base: string;
  if (spec.startsWith('@/')) base = join(SRC, spec.slice(2));
  else if (spec.startsWith('.')) base = resolve(dirname(from), spec);
  else return null;
  for (const c of [base, `${base}.ts`, `${base}.tsx`, join(base, 'index.ts'), join(base, 'index.tsx')]) {
    if (existsSync(c) && statSync(c).isFile()) return c;
  }
  return null;
}

/** Value bindings that can't be a component: camelCase or ALL_CAPS. */
const isPlainValue = (name: string) => /^[a-z_$]/.test(name) || /^[A-Z][A-Z0-9_]+$/.test(name);

function violations(): string[] {
  const out: string[] = [];
  const files = [...walk(join(SRC, 'app')), ...walk(join(SRC, 'server'))];
  const importRe = /import\s+(type\s+)?\{([^}]*)\}\s+from\s+['"]([^'"]+)['"]/g;
  for (const f of files) {
    const src = readFileSync(f, 'utf8');
    if (isClient(src)) continue;
    for (const m of src.matchAll(importRe)) {
      if (m[1]) continue; // import type { … }
      const target = resolveImport(f, m[3]);
      if (!target || !isClient(readFileSync(target, 'utf8'))) continue;
      for (const raw of m[2].split(',')) {
        const part = raw.trim();
        if (!part || part.startsWith('type ')) continue;
        const name = part.split(/\s+as\s+/)[0].trim();
        if (isPlainValue(name)) out.push(`${f.slice(ROOT.length + 1)} imports ${name} from client module ${m[3]}`);
      }
    }
  }
  return out;
}

describe('server/client boundary', () => {
  it('no server file imports a plain function or constant from a "use client" module', () => {
    expect(violations()).toEqual([]);
  });
});
