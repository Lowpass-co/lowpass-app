/* ============================================
   LOWPASS — vitest config (F-1)

   Exists for ONE reason: the routing keyboard contract (KEY-04..07) has now
   regressed three separate times — Tab-swallowing, then arrows-open-a-popup, now
   arrows-do-nothing — because nothing tested it. Component tests run in jsdom so
   the contract is enforced by CI, not by a manual walk.

   Scoped deliberately to component/DOM tests (.test.tsx). The existing
   money harnesses (fees.test.ts, reconcileDerivedLines.test.ts) are standalone
   `node --experimental-strip-types` scripts and are NOT run here — they stay
   exactly as they are, so this adds a gate without touching the money gates.
   ============================================ */

import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import { fileURLToPath } from 'node:url';

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
  },
  test: {
    environment: 'jsdom',
    globals: true,
    include: ['src/**/*.test.tsx'],
    // The .test.ts money harnesses are run by node directly, not vitest.
    exclude: ['**/node_modules/**', '**/.next/**', '**/.claude/**'],
  },
});
