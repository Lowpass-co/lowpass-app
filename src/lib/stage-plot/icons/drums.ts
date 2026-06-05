/* ============================================================
   LOWPASS — Stage Plot drum icons (§SP-FIX-1b, canonical grammar)

   Standalone kit pieces, redrawn to the canonical style guide
   (icons/canonical.ts). kick / snare / crash are sourced DIRECTLY
   from the canonical anchors (single source of truth). The rest
   follow their grammar:
     · round drums (toms, throne) → upright circle + concentric
       hoop + radial tension lugs. Distinguished by size + lug
       count (+ legs on the floor tom).
     · cymbals (ride/china/splash) → thin TILTED ellipse + centre
       bell (+ groove rings). Never radial lugs — that's what
       separates a cymbal from a tom top-down.
     · hi-hat → two stacked thin ellipses (bottom + top cymbal).

   NOTE: the RH/LH kit composites (drums-composites.ts) are owned by
   §SP-FIX-3 and use their own frozen shell bodies — they are NOT
   affected by changes here.
   ============================================================ */

import type { IconDescriptor } from './types';
import { canonicalIcons } from './canonical';

const canon = (name: string): IconDescriptor => {
  const ic = canonicalIcons.find((i) => i.name === name);
  if (!ic) throw new Error(`drums: missing canonical anchor "${name}"`);
  return ic;
};

const RAD = Math.PI / 180;
/** n radial tension-lug ticks between rIn and rOut around (cx,cy). */
function lugs(cx: number, cy: number, rIn: number, rOut: number, n: number): string {
  let s = '';
  for (let i = 0; i < n; i++) {
    const a = (i * (360 / n) - 90) * RAD;
    const x1 = (cx + rIn * Math.cos(a)).toFixed(1);
    const y1 = (cy + rIn * Math.sin(a)).toFixed(1);
    const x2 = (cx + rOut * Math.cos(a)).toFixed(1);
    const y2 = (cy + rOut * Math.sin(a)).toFixed(1);
    s += `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" class="lp-ico-detail"/>`;
  }
  return s;
}

/** Round drum: shell circle + hoop + n lugs (centred 50,50 in 100box). */
const roundDrum = (n: number, extra = ''): string =>
  `<circle cx="50" cy="50" r="45"/><circle cx="50" cy="50" r="34" class="lp-ico-detail"/>` +
  lugs(50, 50, 42, 50, n) +
  extra;

/** Tilted cymbal: ellipse + bell, optional groove rings (centred 50,50). */
const cymbal = (bellR: number, grooves: number[] = []): string =>
  `<ellipse cx="50" cy="50" rx="45" ry="37" transform="rotate(-18 50 50)"/>` +
  grooves.map((r) => `<ellipse cx="50" cy="50" rx="${r}" ry="${(r * 0.82).toFixed(1)}" transform="rotate(-18 50 50)" class="lp-ico-detail"/>`).join('') +
  `<circle cx="50" cy="50" r="${bellR}" class="lp-ico-detail"/>`;

export const drumIcons: IconDescriptor[] = [
  // kick / snare / crash — the canonical anchors verbatim.
  { ...canon('drum-kick') },
  { ...canon('drum-snare') },
  {
    name: 'drum-tom-hi',
    category: 'drums',
    label: 'Rack tom (high)',
    footprint: { width_ft: 0.85, depth_ft: 0.85 },
    viewBox: '0 0 100 100',
    keywords: ['rack tom', '10', 'tt1'],
    body: roundDrum(6),
  },
  {
    name: 'drum-tom-mid',
    category: 'drums',
    label: 'Rack tom (mid)',
    footprint: { width_ft: 1.0, depth_ft: 1.0 },
    viewBox: '0 0 100 100',
    keywords: ['rack tom', '12', 'tt2'],
    body: roundDrum(6),
  },
  {
    name: 'drum-tom-floor',
    category: 'drums',
    label: 'Floor tom',
    footprint: { width_ft: 1.45, depth_ft: 1.45 },
    viewBox: '0 0 100 100',
    keywords: ['ft', '16', 'tt3'],
    // + three splayed legs (the floor-tom signature).
    body: roundDrum(
      8,
      '<line x1="50" y1="95" x2="50" y2="100" class="lp-ico-detail"/>' +
        '<line x1="11" y1="73" x2="6" y2="76" class="lp-ico-detail"/>' +
        '<line x1="89" y1="73" x2="94" y2="76" class="lp-ico-detail"/>',
    ),
  },
  {
    name: 'drum-hihat',
    category: 'drums',
    label: 'Hi-hat',
    footprint: { width_ft: 1.15, depth_ft: 1.15 },
    viewBox: '0 0 100 100',
    keywords: ['hh', 'hats', 'cymbal'],
    // OG concentric-circle hi-hat (top-down: cymbal disc + groove ring
    // + centre bell), box-filling for footprint accuracy.
    body:
      '<circle cx="50" cy="50" r="45"/>' +
      '<circle cx="50" cy="50" r="30" class="lp-ico-detail"/>' +
      '<circle cx="50" cy="50" r="6" class="lp-ico-detail"/>',
  },
  { ...canon('drum-crash') },
  {
    name: 'drum-ride',
    category: 'drums',
    label: 'Ride cymbal',
    footprint: { width_ft: 1.7, depth_ft: 1.7 },
    viewBox: '0 0 100 100',
    keywords: ['cymbal', '20', '22'],
    body: cymbal(9, [31, 20]),
  },
  {
    name: 'drum-china',
    category: 'drums',
    label: 'China cymbal',
    footprint: { width_ft: 1.45, depth_ft: 1.45 },
    viewBox: '0 0 100 100',
    keywords: ['cymbal', 'trash'],
    body: cymbal(7, [37, 26]),
  },
  {
    name: 'drum-splash',
    category: 'drums',
    label: 'Splash cymbal',
    footprint: { width_ft: 0.85, depth_ft: 0.85 },
    viewBox: '0 0 100 100',
    keywords: ['cymbal', '10'],
    body: cymbal(6),
  },
  {
    name: 'drum-cowbell',
    category: 'drums',
    label: 'Cowbell',
    footprint: { width_ft: 0.5, depth_ft: 0.5 },
    viewBox: '0 0 100 100',
    keywords: ['percussion', 'bell'],
    body: '<path d="M32 16 L68 16 L78 84 L22 84 Z"/>',
  },
  {
    name: 'drum-throne',
    category: 'drums',
    label: 'Drum throne',
    footprint: { width_ft: 1.4, depth_ft: 1.4 },
    viewBox: '0 0 100 100',
    keywords: ['stool', 'seat'],
    // round seat: shell circle + centre hub.
    body: '<circle cx="50" cy="50" r="44"/><circle cx="50" cy="50" r="8" class="lp-ico-detail"/>',
  },
];
