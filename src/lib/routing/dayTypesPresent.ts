/* ============================================
   LOWPASS — which day types appear in some tour strips (for the strip key)

   Plain module on purpose (NO 'use client'). It used to live in
   components/tour/TourFingerprint.tsx, a client module — and the workspace
   page (a SERVER component) called it to build the key. A server component
   can render a client component but cannot CALL a function exported from a
   client module, so /artists threw on every load in production (Oct 2026).
   ============================================ */

import { DAY_TYPE_TOKEN } from '@/lib/routing/dayType';

/** Fixed key order. */
export const LEGEND_ORDER = ['show', 'festival', 'travel', 'off', 'rehearsal', 'press', 'radio', 'tv'] as const;

/** The day types that actually appear across some strips (first type of each
 *  day, known types only — unknown/custom read as "off" — in a fixed order). */
export function dayTypesPresent(strips: Array<Array<{ dayType: string }>>): string[] {
  const seen = new Set<string>();
  for (const s of strips) {
    for (const d of s) {
      const t = (d.dayType || '').split(',')[0]?.trim().toLowerCase() || 'off';
      seen.add(DAY_TYPE_TOKEN[t] ? t : 'off');
    }
  }
  return LEGEND_ORDER.filter((t) => seen.has(t));
}
