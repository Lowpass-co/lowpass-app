/* ============================================
   LOWPASS — Stage Plot drum icons (§SP1, review 5)

   Core kit shells. The drum/cymbal circle FILLS the viewBox so a
   placed shell renders at its real footprint (a 22" kick ≈ 1.9 ft,
   not two-thirds of it). Footprints are real diameters in feet.
   Toms differ by X-lug count (1/2/3); snare carries an "S".
   Authored in 0 0 100 100 with no colour attrs: the shell circle
   fills + takes the brand tint; centres, X-lugs, bells and rings
   are .lp-ico-detail (stroke-only); the snare letter is
   .lp-ico-label.
   ============================================ */

import type { IconDescriptor } from './types';

const xLug = (cx: number, y = 16): string =>
  `<line x1="${cx - 4}" y1="${y - 4}" x2="${cx + 4}" y2="${y + 4}" class="lp-ico-detail"/>` +
  `<line x1="${cx + 4}" y1="${y - 4}" x2="${cx - 4}" y2="${y + 4}" class="lp-ico-detail"/>`;

export const drumIcons: IconDescriptor[] = [
  {
    name: 'drum-kick',
    category: 'drums',
    label: 'Kick drum',
    footprint: { width_ft: 1.9, depth_ft: 1.9 },
    keywords: ['bass drum', 'bd', '22'],
    body: '<circle cx="50" cy="50" r="46"/><circle cx="50" cy="50" r="6" class="lp-ico-detail"/>',
  },
  {
    name: 'drum-snare',
    category: 'drums',
    label: 'Snare',
    footprint: { width_ft: 1.2, depth_ft: 1.2 },
    keywords: ['sd', '14'],
    body: '<circle cx="50" cy="50" r="46"/><text class="lp-ico-label" x="50" y="50" text-anchor="middle" dominant-baseline="central" font-size="46">S</text>',
  },
  {
    name: 'drum-tom-hi',
    category: 'drums',
    label: 'Rack tom (high)',
    footprint: { width_ft: 0.85, depth_ft: 0.85 },
    keywords: ['rack tom', '10', 'tt1'],
    body: '<circle cx="50" cy="50" r="46"/><circle cx="50" cy="50" r="5" class="lp-ico-detail"/>' + xLug(50, 16),
  },
  {
    name: 'drum-tom-mid',
    category: 'drums',
    label: 'Rack tom (mid)',
    footprint: { width_ft: 1.0, depth_ft: 1.0 },
    keywords: ['rack tom', '12', 'tt2'],
    body: '<circle cx="50" cy="50" r="46"/><circle cx="50" cy="50" r="5" class="lp-ico-detail"/>' + xLug(40, 16) + xLug(60, 16),
  },
  {
    name: 'drum-tom-floor',
    category: 'drums',
    label: 'Floor tom',
    footprint: { width_ft: 1.4, depth_ft: 1.4 },
    keywords: ['ft', '16', 'tt3'],
    body: '<circle cx="50" cy="50" r="46"/><circle cx="50" cy="50" r="5" class="lp-ico-detail"/>' + xLug(34, 16) + xLug(50, 14) + xLug(66, 16),
  },
  {
    name: 'drum-hihat',
    category: 'drums',
    label: 'Hi-hat',
    footprint: { width_ft: 1.2, depth_ft: 1.2 },
    keywords: ['hh', 'hats', 'cymbal'],
    body: '<circle cx="50" cy="50" r="46"/><circle cx="50" cy="50" r="30" class="lp-ico-detail"/><circle cx="50" cy="50" r="5" class="lp-ico-detail"/>',
  },
  {
    name: 'drum-ride',
    category: 'drums',
    label: 'Ride cymbal',
    footprint: { width_ft: 1.7, depth_ft: 1.7 },
    keywords: ['cymbal', '20', '22'],
    body: '<circle cx="50" cy="50" r="46"/><circle cx="50" cy="50" r="10" class="lp-ico-detail"/>',
  },
  {
    name: 'drum-crash',
    category: 'drums',
    label: 'Crash cymbal',
    footprint: { width_ft: 1.4, depth_ft: 1.4 },
    keywords: ['cymbal', '16', '18'],
    body: '<circle cx="50" cy="50" r="46"/><circle cx="50" cy="50" r="7" class="lp-ico-detail"/>',
  },
  {
    name: 'drum-china',
    category: 'drums',
    label: 'China cymbal',
    footprint: { width_ft: 1.5, depth_ft: 1.5 },
    keywords: ['cymbal', 'trash'],
    body: '<circle cx="50" cy="50" r="46"/><circle cx="50" cy="50" r="30" class="lp-ico-detail"/><circle cx="50" cy="50" r="6" class="lp-ico-detail"/>',
  },
  {
    name: 'drum-splash',
    category: 'drums',
    label: 'Splash cymbal',
    footprint: { width_ft: 0.9, depth_ft: 0.9 },
    keywords: ['cymbal', '10'],
    body: '<circle cx="50" cy="50" r="44"/><circle cx="50" cy="50" r="5" class="lp-ico-detail"/>',
  },
  {
    name: 'drum-cowbell',
    category: 'drums',
    label: 'Cowbell',
    footprint: { width_ft: 0.5, depth_ft: 0.5 },
    keywords: ['percussion', 'bell'],
    body: '<path d="M30 14 L70 14 L80 86 L20 86 Z"/>',
  },
  {
    name: 'drum-throne',
    category: 'drums',
    label: 'Drum throne',
    footprint: { width_ft: 1.4, depth_ft: 1.4 },
    keywords: ['stool', 'seat'],
    body: '<rect x="10" y="10" width="80" height="80" rx="16"/><line x1="50" y1="32" x2="50" y2="68" class="lp-ico-detail"/>',
  },
];
