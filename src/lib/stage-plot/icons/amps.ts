/* ============================================================
   LOWPASS — Stage Plot amps & cabinets (§SP-FIX-1b·2)

   Redrawn to the canonical grammar (icons/canonical.ts), anchored
   on amp-combo-1x12. Two MVP problems fixed:

   1. SCALE — every amp was authored in a square 100×100 viewBox, so
      on canvas (preserveAspectRatio="meet" into a footprint-sized
      box) a wide 2.2×0.9 Twin letterboxed down to a ~0.9ft square.
      Now each body is authored in a viewBox whose aspect EQUALS the
      footprint (units = ft × 100), so it fills its real footprint.
   2. TEXT — the M / B / SVT / A / KB / MOD letter labels are gone
      (canonical rule 6); amps are identified by cabinet shape +
      speaker count + knob row instead.

   Convention: top-down, the speaker face points DOWNSTAGE (bottom);
   control knobs sit along the upstage (top) edge. Cabinet = the one
   filled footprint shape; knobs/speakers/screens are .lp-ico-detail.
   Footprints are real-world feet (refined in §SP-FIX-2).
   ============================================================ */

import type { IconDescriptor } from './types';

/** Outer cabinet filling a W×H viewBox. */
const cab = (W: number, H: number): string => `<rect x="3" y="3" width="${W - 6}" height="${H - 6}" rx="7"/>`;

/** A row of n control knobs at height y, spread across the width. */
const knobs = (W: number, y: number, n: number, r = 2.6): string => {
  const m = Math.max(16, W * 0.1);
  const span = W - 2 * m;
  let s = '';
  for (let i = 0; i < n; i++) {
    const x = n === 1 ? W / 2 : m + (span * i) / (n - 1);
    s += `<circle cx="${x.toFixed(1)}" cy="${y}" r="${r}" class="lp-ico-detail"/>`;
  }
  return s;
};

/** A speaker: cone circle + centre dust cap. */
const spk = (cx: number, cy: number, r: number): string =>
  `<circle cx="${cx}" cy="${cy}" r="${r}" class="lp-ico-detail"/><circle cx="${cx}" cy="${cy}" r="${(r * 0.18).toFixed(1)}" class="lp-ico-detail"/>`;

const vb = (w: number, d: number): string => `0 0 ${Math.round(w * 100)} ${Math.round(d * 100)}`;

// Lean built-in set (Adam: "only need one or two amps"). Specific
// models — Twin, SVT, Kemper, etc. — come from the §SP-FIX-1b·5
// Claude generator, seeded with this grammar.
export const ampIcons: IconDescriptor[] = [
  {
    name: 'amp-combo-1x12',
    category: 'amps',
    label: 'Guitar combo',
    footprint: { width_ft: 1.9, depth_ft: 1.0 },
    viewBox: vb(1.9, 1.0),
    keywords: ['combo', '1x12', '2x12', 'guitar', 'speaker', 'twin', 'amp'],
    body: cab(190, 100) + knobs(190, 16, 4) + spk(95, 60, 30),
  },
  {
    name: 'amp-cab-4x12',
    category: 'amps',
    label: 'Amp cab / stack',
    footprint: { width_ft: 2.5, depth_ft: 1.2 },
    viewBox: vb(2.5, 1.2),
    keywords: ['cabinet', '4x12', 'stack', 'speaker', 'guitar', 'bass', 'svt', 'amp'],
    body: cab(250, 120) + spk(82, 42, 24) + spk(168, 42, 24) + spk(82, 90, 24) + spk(168, 90, 24),
  },
];
