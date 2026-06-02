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
// Big kick centre, snare lower-left of it, throne at the bottom.
const SHARED: Shell[] = [
  ['drum-kick', 50, 43, 0.34],
  ['drum-snare', 36, 58, 0.18],
  ['drum-throne', 50, 86, 0.13],
];
// Cymbals overlap the kit at the corners; hi-hat drummer-left, ride drummer-right.
const SHARED_CYM: Cym[] = [
  [20, 20, 11], // crash L
  [80, 20, 11], // crash R
  [15, 50, 10], // hi-hat
  [85, 45, 11], // ride
];

// Rack toms sit up top (mounted over the kick); floor toms flank lower.
const CONFIGS: Array<{ key: string; label: string; w: number; toms: Shell[]; floors: Shell[] }> = [
  {
    key: '1t1f', label: '1 tom, 1 floor', w: 7.5,
    toms: [['drum-tom-hi', 50, 25, 0.19]],
    floors: [['drum-tom-floor', 73, 59, 0.23]],
  },
  {
    key: '2t1f', label: '2 tom, 1 floor', w: 7.8,
    toms: [['drum-tom-hi', 41, 24, 0.18], ['drum-tom-mid', 59, 24, 0.19]],
    floors: [['drum-tom-floor', 74, 60, 0.23]],
  },
  {
    key: '2t2f', label: '2 tom, 2 floor', w: 8,
    toms: [['drum-tom-hi', 42, 23, 0.17], ['drum-tom-mid', 58, 23, 0.18]],
    floors: [['drum-tom-floor', 27, 61, 0.21], ['drum-tom-floor', 73, 61, 0.21]],
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
