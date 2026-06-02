/* ============================================
   LOWPASS — Stage Plot drum kit composites (§SP1a·2b, revised)

   Whole-kit cluster icons dropped as one item, then exploded
   into the individual pieces (§SP9 split). Per review:
     - SHELLS ONLY — no cymbals/hi-hat/throne (the player adds
       cymbals themselves). Three configs by tom/floor count.
     - Each kit is COMPOSED FROM THE ACTUAL SHELL ICON BODIES
       (kick/snare/rack toms/floor tom), scaled + positioned via
       <g transform>, so a kit reads as exactly those shells and
       a split yields identical icons.

   Top-down: kick points downstage (toward the bottom of the
   box), snare to its left, rack toms above, floor tom(s) to the
   right. Left-handed kits are the same art mirrored on canvas
   (deferred — not separate icons in v1).
   ============================================ */

import { drumIcons } from './drums';
import type { IconDescriptor } from './types';

const shellBody = (name: string): string => {
  const ic = drumIcons.find((i) => i.name === name);
  if (!ic) throw new Error(`drum composite: missing shell "${name}"`);
  return ic.body;
};

/** Place a shell (authored in a 0 0 100 100 box, art centred near
 *  50,50) at (px,py) in the composite, scaled by s. */
const place = (name: string, px: number, py: number, s: number): string => {
  const tx = +(px - 50 * s).toFixed(2);
  const ty = +(py - 50 * s).toFixed(2);
  return `<g transform="translate(${tx} ${ty}) scale(${s})">${shellBody(name)}</g>`;
};

type Part = [name: string, px: number, py: number, s: number];
const kit = (parts: Part[]): string => parts.map((p) => place(...p)).join('');

export const drumComposites: IconDescriptor[] = [
  {
    name: 'drum-kit-1t1f',
    category: 'drums',
    label: 'Kit · 1 tom, 1 floor',
    footprint: { width_ft: 5.5, depth_ft: 5.5 },
    composite: true,
    keywords: ['kit', 'shells', '4 piece', 'four piece'],
    body: kit([
      ['drum-kick', 50, 60, 0.32],
      ['drum-snare', 32, 62, 0.18],
      ['drum-tom-hi', 50, 38, 0.18],
      ['drum-tom-floor', 77, 58, 0.24],
    ]),
  },
  {
    name: 'drum-kit-2t1f',
    category: 'drums',
    label: 'Kit · 2 tom, 1 floor',
    footprint: { width_ft: 6, depth_ft: 6 },
    composite: true,
    keywords: ['kit', 'shells', '5 piece', 'five piece'],
    body: kit([
      ['drum-kick', 50, 61, 0.31],
      ['drum-snare', 31, 63, 0.17],
      ['drum-tom-hi', 41, 38, 0.16],
      ['drum-tom-mid', 60, 39, 0.17],
      ['drum-tom-floor', 78, 60, 0.23],
    ]),
  },
  {
    name: 'drum-kit-2t2f',
    category: 'drums',
    label: 'Kit · 2 tom, 2 floor',
    footprint: { width_ft: 6.5, depth_ft: 6.5 },
    composite: true,
    keywords: ['kit', 'shells', '6 piece', 'six piece'],
    body: kit([
      ['drum-kick', 49, 58, 0.3],
      ['drum-snare', 30, 60, 0.16],
      ['drum-tom-hi', 40, 36, 0.15],
      ['drum-tom-mid', 58, 37, 0.16],
      ['drum-tom-floor', 75, 52, 0.2],
      ['drum-tom-floor', 80, 77, 0.21],
    ]),
  },
];
