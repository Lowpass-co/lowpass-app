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

export const ampIcons: IconDescriptor[] = [
  {
    name: 'amp-fender-twin',
    category: 'amps',
    label: 'Twin',
    footprint: { width_ft: 2.2, depth_ft: 0.9 },
    viewBox: vb(2.2, 0.9),
    keywords: ['fender', 'twin', 'combo', 'guitar', 'tube'],
    body: cab(220, 90) + knobs(220, 16, 6) + spk(72, 56, 22) + spk(148, 56, 22),
  },
  {
    name: 'amp-combo-1x12',
    category: 'amps',
    label: '1×12 combo',
    footprint: { width_ft: 1.9, depth_ft: 1.0 },
    viewBox: vb(1.9, 1.0),
    keywords: ['combo', '1x12', 'guitar', 'speaker'],
    body: cab(190, 100) + knobs(190, 16, 4) + spk(95, 60, 30),
  },
  {
    name: 'amp-combo-2x12',
    category: 'amps',
    label: '2×12 combo',
    footprint: { width_ft: 2.4, depth_ft: 1.0 },
    viewBox: vb(2.4, 1.0),
    keywords: ['combo', '2x12', 'guitar', 'speaker'],
    body: cab(240, 100) + knobs(240, 16, 5) + spk(78, 60, 26) + spk(162, 60, 26),
  },
  {
    name: 'amp-marshall-stack',
    category: 'amps',
    label: 'Full stack',
    footprint: { width_ft: 2.5, depth_ft: 1.4 },
    viewBox: vb(2.5, 1.4),
    keywords: ['marshall', 'full stack', 'head', 'cabinet', 'guitar', '4x12'],
    // head knob row + 4×12 grid (2×2).
    body: cab(250, 140) + knobs(250, 16, 5) + spk(82, 58, 22) + spk(168, 58, 22) + spk(82, 104, 22) + spk(168, 104, 22),
  },
  {
    name: 'amp-marshall-halfstack',
    category: 'amps',
    label: 'Half stack',
    footprint: { width_ft: 2.5, depth_ft: 1.2 },
    viewBox: vb(2.5, 1.2),
    keywords: ['marshall', 'half stack', 'head', 'cabinet', 'guitar'],
    // head knob row + single 4×12 (one speaker row).
    body: cab(250, 120) + knobs(250, 16, 5) + spk(82, 74, 26) + spk(168, 74, 26),
  },
  {
    name: 'amp-cab-4x12',
    category: 'amps',
    label: '4×12 cab',
    footprint: { width_ft: 2.5, depth_ft: 1.2 },
    viewBox: vb(2.5, 1.2),
    keywords: ['cabinet', '4x12', 'speaker', 'guitar'],
    body: cab(250, 120) + spk(82, 42, 24) + spk(168, 42, 24) + spk(82, 90, 24) + spk(168, 90, 24),
  },
  {
    name: 'amp-guitar-head',
    category: 'amps',
    label: 'Guitar head',
    footprint: { width_ft: 2.3, depth_ft: 0.8 },
    viewBox: vb(2.3, 0.8),
    keywords: ['head', 'amplifier', 'guitar', 'tube'],
    body: cab(230, 80) + knobs(230, 40, 7),
  },
  {
    name: 'amp-bass-head',
    category: 'amps',
    label: 'Bass head',
    footprint: { width_ft: 2.0, depth_ft: 0.9 },
    viewBox: vb(2.0, 0.9),
    keywords: ['bass', 'head', 'amplifier'],
    body: cab(200, 90) + knobs(200, 45, 6),
  },
  {
    name: 'amp-ampeg-svt',
    category: 'amps',
    label: 'SVT 8×10',
    footprint: { width_ft: 2.2, depth_ft: 1.4 },
    viewBox: vb(2.2, 1.4),
    keywords: ['ampeg', 'svt', '8x10', 'bass', 'fridge', 'cabinet'],
    // 8×10 fridge: 2 cols × 4 rows.
    body:
      cab(220, 140) +
      spk(72, 28, 15) + spk(148, 28, 15) +
      spk(72, 62, 15) + spk(148, 62, 15) +
      spk(72, 96, 15) + spk(148, 96, 15) +
      spk(72, 122, 15) + spk(148, 122, 15),
  },
  {
    name: 'amp-bass-cab-1x15',
    category: 'amps',
    label: '1×15 cab',
    footprint: { width_ft: 2.0, depth_ft: 1.4 },
    viewBox: vb(2.0, 1.4),
    keywords: ['bass', 'cabinet', '1x15', 'speaker'],
    body: cab(200, 140) + spk(100, 70, 54),
  },
  {
    name: 'amp-bass-cab-2x10',
    category: 'amps',
    label: '2×10 cab',
    footprint: { width_ft: 1.9, depth_ft: 1.4 },
    viewBox: vb(1.9, 1.4),
    keywords: ['bass', 'cabinet', '2x10', 'speaker'],
    body: cab(190, 140) + spk(95, 46, 32) + spk(95, 96, 32),
  },
  {
    name: 'amp-acoustic',
    category: 'amps',
    label: 'Acoustic combo',
    footprint: { width_ft: 1.5, depth_ft: 1.0 },
    viewBox: vb(1.5, 1.0),
    keywords: ['acoustic', 'combo', 'amplifier'],
    body: cab(150, 100) + knobs(150, 16, 3) + spk(75, 60, 28),
  },
  {
    name: 'amp-keyboard',
    category: 'amps',
    label: 'Keyboard amp',
    footprint: { width_ft: 1.6, depth_ft: 1.2 },
    viewBox: vb(1.6, 1.2),
    keywords: ['keyboard', 'combo', 'amplifier', 'keys'],
    body: cab(160, 120) + knobs(160, 18, 3) + spk(80, 72, 32),
  },
  {
    name: 'amp-modeller',
    category: 'amps',
    label: 'Modeller / Kemper',
    footprint: { width_ft: 1.6, depth_ft: 1.0 },
    viewBox: vb(1.6, 1.0),
    keywords: ['modeller', 'kemper', 'helix', 'axe-fx', 'amp', 'rack', 'profiler'],
    // control unit: display panel + big profiler knob + small knobs.
    body:
      cab(160, 100) +
      '<rect x="18" y="30" width="58" height="40" rx="4" class="lp-ico-detail"/>' +
      '<circle cx="116" cy="50" r="18" class="lp-ico-detail"/><circle cx="116" cy="50" r="3" class="lp-ico-detail"/>' +
      knobs(160, 84, 4, 2.4),
  },
];
