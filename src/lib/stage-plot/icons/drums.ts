/* ============================================
   LOWPASS — Stage Plot drum icons (§SP1a·2)

   Top-down kit components. From directly above, drums and
   cymbals read as circles; they are differentiated by real-world
   footprint (a 22" kick out-sizes a 10" splash), the centre
   bell/lug detail, and the label — exactly how a printed kit map
   reads. Authored in the shared 0 0 100 100 viewBox with NO
   colour attributes: closed footprint shapes take the brand-tint
   fill + category stroke on canvas; centre dots, bells, legs and
   pedals sit in .lp-ico-detail so they stay unfilled.

   §SP1a·2a — core kit (this file, first pass).
   §SP1a·2b appends aux percussion + RH/LH composites.

   Footprints are in feet (drum/cymbal nominal diameter + any
   floor legs / pedal reach), e.g. a 22" kick ≈ 1.85 ft shell.
   ============================================ */

import type { IconDescriptor } from './types';

export const drumIcons: IconDescriptor[] = [
  {
    name: 'drum-kick',
    category: 'drums',
    label: 'Kick drum',
    footprint: { width_ft: 1.9, depth_ft: 2.6 },
    keywords: ['bass drum', 'bd', '22'],
    body:
      '<circle cx="50" cy="42" r="33"/>' +
      '<circle cx="50" cy="42" r="4" class="lp-ico-detail"/>' +
      '<rect x="42" y="80" width="16" height="15" rx="2" class="lp-ico-detail"/>' +
      '<line x1="50" y1="75" x2="50" y2="80" class="lp-ico-detail"/>',
  },
  {
    name: 'drum-snare',
    category: 'drums',
    label: 'Snare',
    footprint: { width_ft: 1.3, depth_ft: 1.3 },
    keywords: ['sd', '14'],
    body:
      '<circle cx="50" cy="50" r="32"/>' +
      '<circle cx="50" cy="50" r="6" class="lp-ico-detail"/>' +
      '<rect x="79" y="44" width="12" height="12" rx="2" class="lp-ico-detail"/>',
  },
  {
    name: 'drum-hihat',
    category: 'drums',
    label: 'Hi-hat',
    footprint: { width_ft: 1.2, depth_ft: 1.2 },
    keywords: ['hh', 'hats', 'cymbal'],
    body:
      '<circle cx="50" cy="50" r="30"/>' +
      '<circle cx="50" cy="50" r="20" class="lp-ico-detail"/>' +
      '<circle cx="50" cy="50" r="3.5" class="lp-ico-detail"/>',
  },
  {
    name: 'drum-ride',
    category: 'drums',
    label: 'Ride cymbal',
    footprint: { width_ft: 1.8, depth_ft: 1.8 },
    keywords: ['cymbal', '20', '22'],
    body:
      '<circle cx="50" cy="50" r="34"/>' +
      '<circle cx="50" cy="50" r="7" class="lp-ico-detail"/>',
  },
  {
    name: 'drum-crash',
    category: 'drums',
    label: 'Crash cymbal',
    footprint: { width_ft: 1.5, depth_ft: 1.5 },
    keywords: ['cymbal', '16', '18'],
    body:
      '<circle cx="50" cy="50" r="29"/>' +
      '<circle cx="50" cy="50" r="5" class="lp-ico-detail"/>',
  },
  {
    name: 'drum-china',
    category: 'drums',
    label: 'China cymbal',
    footprint: { width_ft: 1.5, depth_ft: 1.5 },
    keywords: ['cymbal', 'trash'],
    body:
      '<circle cx="50" cy="50" r="30"/>' +
      '<circle cx="50" cy="50" r="18" class="lp-ico-detail"/>' +
      '<circle cx="50" cy="50" r="5" class="lp-ico-detail"/>',
  },
  {
    name: 'drum-splash',
    category: 'drums',
    label: 'Splash cymbal',
    footprint: { width_ft: 0.9, depth_ft: 0.9 },
    keywords: ['cymbal', '10'],
    body:
      '<circle cx="50" cy="50" r="22"/>' +
      '<circle cx="50" cy="50" r="4" class="lp-ico-detail"/>',
  },
  {
    name: 'drum-tom-hi',
    category: 'drums',
    label: 'Rack tom (high)',
    footprint: { width_ft: 1.0, depth_ft: 1.0 },
    keywords: ['rack tom', '10', 'tt1'],
    body:
      '<circle cx="50" cy="50" r="26"/>' +
      '<circle cx="50" cy="50" r="5" class="lp-ico-detail"/>',
  },
  {
    name: 'drum-tom-mid',
    category: 'drums',
    label: 'Rack tom (mid)',
    footprint: { width_ft: 1.2, depth_ft: 1.2 },
    keywords: ['rack tom', '12', 'tt2'],
    body:
      '<circle cx="50" cy="50" r="30"/>' +
      '<circle cx="50" cy="50" r="5" class="lp-ico-detail"/>',
  },
  {
    name: 'drum-tom-floor',
    category: 'drums',
    label: 'Floor tom',
    footprint: { width_ft: 1.5, depth_ft: 1.5 },
    keywords: ['ft', '16', '14'],
    body:
      '<circle cx="50" cy="48" r="31"/>' +
      '<circle cx="50" cy="48" r="6" class="lp-ico-detail"/>' +
      '<line x1="23" y1="64" x2="20" y2="92" class="lp-ico-detail"/>' +
      '<line x1="77" y1="64" x2="80" y2="92" class="lp-ico-detail"/>',
  },
  {
    name: 'drum-cowbell',
    category: 'drums',
    label: 'Cowbell',
    footprint: { width_ft: 0.5, depth_ft: 0.5 },
    keywords: ['percussion', 'bell'],
    body: '<path d="M38 24 L62 24 L70 80 L30 80 Z"/>',
  },
  {
    name: 'drum-throne',
    category: 'drums',
    label: 'Drum throne',
    footprint: { width_ft: 1.4, depth_ft: 1.4 },
    keywords: ['stool', 'seat'],
    body:
      '<circle cx="50" cy="50" r="28"/>' +
      '<circle cx="50" cy="50" r="3" class="lp-ico-detail"/>',
  },
];
