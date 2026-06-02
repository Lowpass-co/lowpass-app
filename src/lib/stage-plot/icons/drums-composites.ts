/* ============================================
   LOWPASS — Stage Plot drum kit composites (§SP1a·2b)

   Whole-kit cluster icons dropped as one item, then optionally
   exploded into individual pieces (§SP9 "split"). Each ships a
   left-handed twin (locked decision): the LH body is the RH body
   mirrored across x (x' = 100 - x), so hi-hat moves to the
   drummer's right and the floor tom + ride to the left.

   Top-down convention: the drummer (throne) sits upstage (toward
   the bottom of the 100x100 box) facing downstage; the kick
   points downstage. Drums are filled footprint shapes; cymbals +
   hi-hat are .lp-ico-detail outlines so they layer on top and
   read as cymbals rather than another filled shell.

   composite:true marks them splittable (§SP9); leftHanded:true
   on the mirrored twins.
   ============================================ */

import type { IconDescriptor } from './types';

export const drumComposites: IconDescriptor[] = [
  {
    name: 'drum-kit-5pc',
    category: 'drums',
    label: '5-piece kit',
    footprint: { width_ft: 6, depth_ft: 6 },
    composite: true,
    keywords: ['kit', 'full kit', 'right-handed'],
    body:
      '<circle cx="50" cy="58" r="15"/>' +
      '<circle cx="33" cy="60" r="8"/>' +
      '<circle cx="42" cy="42" r="8"/>' +
      '<circle cx="59" cy="43" r="9"/>' +
      '<circle cx="77" cy="60" r="11"/>' +
      '<circle cx="50" cy="84" r="7"/>' +
      '<circle cx="22" cy="44" r="9" class="lp-ico-detail"/>' +
      '<circle cx="22" cy="44" r="3" class="lp-ico-detail"/>' +
      '<circle cx="74" cy="34" r="12" class="lp-ico-detail"/>' +
      '<circle cx="74" cy="34" r="3" class="lp-ico-detail"/>' +
      '<circle cx="30" cy="28" r="9" class="lp-ico-detail"/>' +
      '<circle cx="30" cy="28" r="2.5" class="lp-ico-detail"/>',
  },
  {
    name: 'drum-kit-5pc-lh',
    category: 'drums',
    label: '5-piece kit (left-handed)',
    footprint: { width_ft: 6, depth_ft: 6 },
    composite: true,
    leftHanded: true,
    keywords: ['kit', 'full kit', 'lefty', 'left-handed'],
    body:
      '<circle cx="50" cy="58" r="15"/>' +
      '<circle cx="67" cy="60" r="8"/>' +
      '<circle cx="58" cy="42" r="8"/>' +
      '<circle cx="41" cy="43" r="9"/>' +
      '<circle cx="23" cy="60" r="11"/>' +
      '<circle cx="50" cy="84" r="7"/>' +
      '<circle cx="78" cy="44" r="9" class="lp-ico-detail"/>' +
      '<circle cx="78" cy="44" r="3" class="lp-ico-detail"/>' +
      '<circle cx="26" cy="34" r="12" class="lp-ico-detail"/>' +
      '<circle cx="26" cy="34" r="3" class="lp-ico-detail"/>' +
      '<circle cx="70" cy="28" r="9" class="lp-ico-detail"/>' +
      '<circle cx="70" cy="28" r="2.5" class="lp-ico-detail"/>',
  },
  {
    name: 'drum-kit-4pc',
    category: 'drums',
    label: '4-piece kit',
    footprint: { width_ft: 5.5, depth_ft: 5.5 },
    composite: true,
    keywords: ['kit', 'four piece', 'right-handed'],
    body:
      '<circle cx="50" cy="58" r="15"/>' +
      '<circle cx="33" cy="60" r="8"/>' +
      '<circle cx="48" cy="41" r="9"/>' +
      '<circle cx="77" cy="60" r="11"/>' +
      '<circle cx="50" cy="84" r="7"/>' +
      '<circle cx="22" cy="44" r="9" class="lp-ico-detail"/>' +
      '<circle cx="22" cy="44" r="3" class="lp-ico-detail"/>' +
      '<circle cx="73" cy="33" r="12" class="lp-ico-detail"/>' +
      '<circle cx="73" cy="33" r="3" class="lp-ico-detail"/>',
  },
  {
    name: 'drum-kit-4pc-lh',
    category: 'drums',
    label: '4-piece kit (left-handed)',
    footprint: { width_ft: 5.5, depth_ft: 5.5 },
    composite: true,
    leftHanded: true,
    keywords: ['kit', 'four piece', 'lefty', 'left-handed'],
    body:
      '<circle cx="50" cy="58" r="15"/>' +
      '<circle cx="67" cy="60" r="8"/>' +
      '<circle cx="52" cy="41" r="9"/>' +
      '<circle cx="23" cy="60" r="11"/>' +
      '<circle cx="50" cy="84" r="7"/>' +
      '<circle cx="78" cy="44" r="9" class="lp-ico-detail"/>' +
      '<circle cx="78" cy="44" r="3" class="lp-ico-detail"/>' +
      '<circle cx="27" cy="33" r="12" class="lp-ico-detail"/>' +
      '<circle cx="27" cy="33" r="3" class="lp-ico-detail"/>',
  },
];
