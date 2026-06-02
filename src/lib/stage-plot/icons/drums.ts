/* ============================================
   LOWPASS — Stage Plot drum icons (§SP1a·2)

   Top-down kit components. From above every drum/cymbal is a
   circle, so they are made distinct by RIM FURNITURE, not just
   size: drums carry lugs/legs/pedals, cymbals carry only a bell
   (+ ride groove ring), and the throne is a square seat. Quick
   read:
     kick      large circle + front spur legs + pedal
     snare     circle + "S" + throw-off
     rack toms 1 X-lug (high), 2 X-lugs (mid)
     floor tom circle + 3 splayed legs
     cymbals   circle + centre bell, NO rim furniture
               (ride adds a groove ring; china an inner ring)
     throne    rounded square seat

   Authored in the shared 0 0 100 100 viewBox with NO colour
   attrs: closed footprint shapes flood-fill with the brand tint
   + category stroke on canvas; bells, lugs, legs, pedals and the
   "S" sit in .lp-ico-detail / .lp-ico-label so they stay
   stroke-only (or filled, for the label) and are never
   flood-filled. Footprints are real-world feet.

   §SP1a·2a — core kit. §SP1a·2b appends aux percussion + RH/LH
   composites.
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
      '<circle cx="50" cy="44" r="32"/>' +
      '<circle cx="50" cy="44" r="4" class="lp-ico-detail"/>' +
      '<line x1="30" y1="70" x2="18" y2="93" class="lp-ico-detail"/>' +
      '<line x1="70" y1="70" x2="82" y2="93" class="lp-ico-detail"/>' +
      '<rect x="43" y="82" width="14" height="13" rx="2" class="lp-ico-detail"/>',
  },
  {
    name: 'drum-snare',
    category: 'drums',
    label: 'Snare',
    footprint: { width_ft: 1.3, depth_ft: 1.3 },
    keywords: ['sd', '14'],
    body:
      '<circle cx="50" cy="50" r="32"/>' +
      '<text class="lp-ico-label" x="50" y="50" text-anchor="middle" dominant-baseline="central" font-size="34">S</text>' +
      '<rect x="79" y="44" width="13" height="12" rx="2" class="lp-ico-detail"/>',
  },
  {
    name: 'drum-tom-hi',
    category: 'drums',
    label: 'Rack tom (high)',
    footprint: { width_ft: 1.0, depth_ft: 1.0 },
    keywords: ['rack tom', '10', 'tt1'],
    body:
      '<circle cx="50" cy="50" r="28"/>' +
      '<circle cx="50" cy="50" r="4" class="lp-ico-detail"/>' +
      '<line x1="44" y1="20" x2="52" y2="28" class="lp-ico-detail"/>' +
      '<line x1="52" y1="20" x2="44" y2="28" class="lp-ico-detail"/>',
  },
  {
    name: 'drum-tom-mid',
    category: 'drums',
    label: 'Rack tom (mid)',
    footprint: { width_ft: 1.2, depth_ft: 1.2 },
    keywords: ['rack tom', '12', 'tt2'],
    body:
      '<circle cx="50" cy="50" r="31"/>' +
      '<circle cx="50" cy="50" r="4" class="lp-ico-detail"/>' +
      '<line x1="32" y1="22" x2="40" y2="30" class="lp-ico-detail"/>' +
      '<line x1="40" y1="22" x2="32" y2="30" class="lp-ico-detail"/>' +
      '<line x1="60" y1="22" x2="68" y2="30" class="lp-ico-detail"/>' +
      '<line x1="68" y1="22" x2="60" y2="30" class="lp-ico-detail"/>',
  },
  {
    name: 'drum-tom-floor',
    category: 'drums',
    label: 'Floor tom',
    footprint: { width_ft: 1.5, depth_ft: 1.5 },
    keywords: ['ft', '16', 'tt3'],
    body:
      '<circle cx="50" cy="46" r="31"/>' +
      '<circle cx="50" cy="46" r="5" class="lp-ico-detail"/>' +
      '<line x1="24" y1="64" x2="18" y2="94" class="lp-ico-detail"/>' +
      '<line x1="50" y1="77" x2="50" y2="96" class="lp-ico-detail"/>' +
      '<line x1="76" y1="64" x2="82" y2="94" class="lp-ico-detail"/>',
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
      '<circle cx="50" cy="50" r="5" class="lp-ico-detail"/>',
  },
  {
    name: 'drum-ride',
    category: 'drums',
    label: 'Ride cymbal',
    footprint: { width_ft: 1.8, depth_ft: 1.8 },
    keywords: ['cymbal', '20', '22'],
    body:
      '<circle cx="50" cy="50" r="34"/>' +
      '<circle cx="50" cy="50" r="23" class="lp-ico-detail"/>' +
      '<circle cx="50" cy="50" r="8" class="lp-ico-detail"/>',
  },
  {
    name: 'drum-crash',
    category: 'drums',
    label: 'Crash cymbal',
    footprint: { width_ft: 1.5, depth_ft: 1.5 },
    keywords: ['cymbal', '16', '18'],
    body:
      '<circle cx="50" cy="50" r="29"/>' +
      '<circle cx="50" cy="50" r="6" class="lp-ico-detail"/>',
  },
  {
    name: 'drum-china',
    category: 'drums',
    label: 'China cymbal',
    footprint: { width_ft: 1.5, depth_ft: 1.5 },
    keywords: ['cymbal', 'trash'],
    body:
      '<circle cx="50" cy="50" r="30"/>' +
      '<circle cx="50" cy="50" r="19" class="lp-ico-detail"/>' +
      '<circle cx="50" cy="50" r="6" class="lp-ico-detail"/>',
  },
  {
    name: 'drum-splash',
    category: 'drums',
    label: 'Splash cymbal',
    footprint: { width_ft: 0.9, depth_ft: 0.9 },
    keywords: ['cymbal', '10'],
    body:
      '<circle cx="50" cy="50" r="21"/>' +
      '<circle cx="50" cy="50" r="4" class="lp-ico-detail"/>',
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
      '<rect x="22" y="22" width="56" height="56" rx="12"/>' +
      '<line x1="50" y1="34" x2="50" y2="66" class="lp-ico-detail"/>',
  },
];
