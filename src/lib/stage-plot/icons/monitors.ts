/* ============================================================
   LOWPASS — Stage Plot monitors & IEM (§SP-FIX-1b·3)

   Redrawn to the canonical grammar. Same MVP scale fix as amps:
   each body authored in a footprint-proportional viewBox (units =
   ft × 100) instead of a square 100×100, so a 2×1.5 wedge no longer
   letterboxes to 1.5×1.5 on canvas. Footprint = one filled shape;
   speakers/faders/U-lines are .lp-ico-detail. Speaker faces point
   upstage (toward the performer) for wedges.
   ============================================================ */

import type { IconDescriptor } from './types';

const vb = (w: number, d: number): string => `0 0 ${Math.round(w * 100)} ${Math.round(d * 100)}`;
const spk = (cx: number, cy: number, r: number): string =>
  `<circle cx="${cx}" cy="${cy}" r="${r}" class="lp-ico-detail"/><circle cx="${cx}" cy="${cy}" r="${(r * 0.18).toFixed(1)}" class="lp-ico-detail"/>`;

export const monitorIcons: IconDescriptor[] = [
  {
    name: 'monitor-wedge',
    category: 'monitors',
    label: 'Wedge',
    footprint: { width_ft: 2, depth_ft: 1.5 },
    viewBox: vb(2, 1.5),
    keywords: ['floor wedge', 'monitor', 'stage monitor', 'foldback'],
    // Trapezoid foldback: wide front (downstage) edge, angled face.
    body: '<path d="M14 140 L186 140 L142 12 L58 12 Z"/>' + spk(100, 92, 40),
  },
  {
    name: 'monitor-wedge-dual',
    category: 'monitors',
    label: 'Dual wedge',
    footprint: { width_ft: 3.6, depth_ft: 1.5 },
    viewBox: vb(3.6, 1.5),
    keywords: ['dual wedge', 'double monitor', 'floor wedges', 'foldback'],
    body:
      '<path d="M14 140 L172 140 L140 12 L46 12 Z"/>' + spk(92, 92, 36) +
      '<path d="M188 140 L346 140 L314 12 L220 12 Z"/>' + spk(268, 92, 36),
  },
  {
    name: 'monitor-side-fill',
    category: 'monitors',
    label: 'Side fill',
    footprint: { width_ft: 2.5, depth_ft: 2 },
    viewBox: vb(2.5, 2),
    keywords: ['side fill', 'sidefill', 'stage speaker', 'monitor stack'],
    // PA stack: LF driver + HF horn.
    body: '<rect x="40" y="8" width="170" height="184" rx="8"/>' + spk(125, 128, 54) + spk(125, 52, 30),
  },
  {
    name: 'monitor-drum-sub',
    category: 'monitors',
    label: 'Drum sub',
    footprint: { width_ft: 1.8, depth_ft: 1.8 },
    viewBox: vb(1.8, 1.8),
    keywords: ['drum sub', 'subwoofer', 'drum fill', 'low end'],
    body: '<rect x="8" y="8" width="164" height="164" rx="9"/>' + spk(90, 90, 64),
  },
  {
    name: 'monitor-iem-pack',
    category: 'monitors',
    label: 'IEM pack',
    footprint: { width_ft: 0.4, depth_ft: 0.3 },
    viewBox: vb(0.4, 0.3),
    keywords: ['iem', 'in-ear', 'bodypack', 'shure', 'p10r', 'monitor', 'wireless'],
    body:
      '<rect x="4" y="3" width="32" height="24" rx="4"/>' +
      '<rect x="9" y="7" width="22" height="9" rx="1.5" class="lp-ico-detail"/>' +
      '<circle cx="20" cy="22" r="2.6" class="lp-ico-detail"/>',
  },
  {
    name: 'monitor-iem-rack',
    category: 'monitors',
    label: 'IEM rack',
    footprint: { width_ft: 1.7, depth_ft: 1.6 },
    viewBox: vb(1.7, 1.6),
    keywords: ['iem', 'rack', 'psm1000', 'shure', '6u', 'monitor', 'wireless', 'transmitter'],
    // rack grammar (matches the rack-4u anchor): frame + ears + U rows.
    body:
      '<rect x="5" y="5" width="160" height="150" rx="8"/>' +
      '<line x1="24" y1="10" x2="24" y2="150" class="lp-ico-detail"/><line x1="146" y1="10" x2="146" y2="150" class="lp-ico-detail"/>' +
      '<line x1="24" y1="42" x2="146" y2="42" class="lp-ico-detail"/><line x1="24" y1="80" x2="146" y2="80" class="lp-ico-detail"/><line x1="24" y1="118" x2="146" y2="118" class="lp-ico-detail"/>' +
      '<circle cx="14" cy="24" r="2.6" class="lp-ico-detail"/><circle cx="156" cy="24" r="2.6" class="lp-ico-detail"/><circle cx="14" cy="136" r="2.6" class="lp-ico-detail"/><circle cx="156" cy="136" r="2.6" class="lp-ico-detail"/>',
  },
  {
    name: 'monitor-console',
    category: 'monitors',
    label: 'Monitor console',
    footprint: { width_ft: 4, depth_ft: 2.5 },
    viewBox: vb(4, 2.5),
    keywords: ['monitor', 'console', 'mixing', 'desk', 'faders', 'stage'],
    // desk: armrest strip (back) + fader bank (front).
    body:
      '<rect x="8" y="8" width="384" height="234" rx="10"/>' +
      '<rect x="22" y="22" width="356" height="40" rx="4" class="lp-ico-detail"/>' +
      Array.from({ length: 12 }, (_, i) => {
        const x = 40 + i * 28;
        return `<line x1="${x}" y1="92" x2="${x}" y2="220" class="lp-ico-detail"/><circle cx="${x}" cy="150" r="4" class="lp-ico-detail"/>`;
      }).join(''),
  },
];
