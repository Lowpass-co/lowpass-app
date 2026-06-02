/* ============================================
   LOWPASS — Stage Plot drum kit composites (§SP1, review 3)

   Top-down kits matching the reference photos: the DRUMMER
   (throne) sits at the BOTTOM facing up; kick + rack toms at the
   TOP; snare centre; floor toms flanking lower; hi-hat to the
   drummer's left (page-left), ride to the right, crashes in the
   top corners. Three configs by tom count:
     1t1f — 1 rack, 1 floor
     2t1f — 2 rack, 1 floor   (the "3-tom" reference)
     2t2f — 2 rack, 2 floor   (the "4-tom" reference)

   Shells reuse the actual shell icon bodies via transforms;
   cymbals are outline circles + bell. Each config ships a
   left-handed twin (mirrored positions, un-mirrored shell art so
   the snare S / kick pedal stay upright). Split → individual
   shells (§SP9).
   ============================================ */

import { drumIcons } from './drums';
import type { IconDescriptor } from './types';

const shellBody = (name: string): string => {
  const ic = drumIcons.find((i) => i.name === name);
  if (!ic) throw new Error(`drum composite: missing shell "${name}"`);
  return ic.body;
};

const place = (name: string, px: number, py: number, s: number): string => {
  const tx = +(px - 50 * s).toFixed(2);
  const ty = +(py - 50 * s).toFixed(2);
  return `<g transform="translate(${tx} ${ty}) scale(${s})">${shellBody(name)}</g>`;
};

const cymbal = (cx: number, cy: number, r: number): string =>
  `<circle cx="${cx}" cy="${cy}" r="${r}" class="lp-ico-detail"/>` +
  `<circle cx="${cx}" cy="${cy}" r="${+(r * 0.22).toFixed(1)}" class="lp-ico-detail"/>`;

type Shell = [name: string, px: number, py: number, s: number];
type Cym = [cx: number, cy: number, r: number];

const mx = (x: number) => 100 - x;

function kit(shells: Shell[], cyms: Cym[], left: boolean): string {
  const sh = shells.map(([n, x, y, s]) => place(n, left ? mx(x) : x, y, s)).join('');
  const cy = cyms.map(([x, y, r]) => cymbal(left ? mx(x) : x, y, r)).join('');
  return sh + cy;
}

// Shared elements (RH): kick top, snare centre, throne bottom; hi-hat
// page-left, ride page-right, crashes top corners.
const SHARED: Shell[] = [
  ['drum-kick', 50, 28, 0.3],
  ['drum-snare', 50, 60, 0.16],
  ['drum-throne', 50, 85, 0.14],
];
const SHARED_CYM: Cym[] = [
  [16, 23, 9], // crash L
  [84, 23, 9], // crash R
  [13, 47, 9], // hi-hat (drummer's left)
  [87, 43, 10], // ride (drummer's right)
];

const CONFIGS: Array<{ key: string; label: string; w: number; toms: Shell[]; floors: Shell[] }> = [
  {
    key: '1t1f', label: '1 tom, 1 floor', w: 7,
    toms: [['drum-tom-hi', 50, 41, 0.16]],
    floors: [['drum-tom-floor', 71, 63, 0.2]],
  },
  {
    key: '2t1f', label: '2 tom, 1 floor', w: 7.2,
    toms: [['drum-tom-hi', 41, 41, 0.15], ['drum-tom-mid', 59, 41, 0.16]],
    floors: [['drum-tom-floor', 71, 64, 0.2]],
  },
  {
    key: '2t2f', label: '2 tom, 2 floor', w: 7.5,
    toms: [['drum-tom-hi', 41, 40, 0.15], ['drum-tom-mid', 59, 40, 0.16]],
    floors: [['drum-tom-floor', 30, 64, 0.19], ['drum-tom-floor', 71, 64, 0.19]],
  },
];

export const drumComposites: IconDescriptor[] = CONFIGS.flatMap((c) => {
  const shells = [...SHARED, ...c.toms, ...c.floors];
  return [
    {
      name: `drum-kit-${c.key}`,
      category: 'drums' as const,
      label: `Kit · ${c.label}`,
      footprint: { width_ft: c.w, depth_ft: c.w },
      composite: true,
      keywords: ['kit', 'drums', 'right-handed', c.label],
      body: kit(shells, SHARED_CYM, false),
    },
    {
      name: `drum-kit-${c.key}-lh`,
      category: 'drums' as const,
      label: `Kit · ${c.label} (LH)`,
      footprint: { width_ft: c.w, depth_ft: c.w },
      composite: true,
      leftHanded: true,
      keywords: ['kit', 'drums', 'left-handed', 'lefty', c.label],
      body: kit(shells, SHARED_CYM, true),
    },
  ];
});
