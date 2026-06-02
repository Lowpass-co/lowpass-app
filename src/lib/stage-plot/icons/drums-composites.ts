/* ============================================
   LOWPASS — Stage Plot drum kit composites (§SP1, review 5)

   Kits built from the ACTUAL designed shell icons (kick, snare
   with its "S", rack toms with X-lugs, floor toms, throne) placed
   via transforms — NOT plain circles. Cymbals are outline circles
   + bell. Layout matches the reference: 2 crash cymbals top
   corners, hi-hat drummer-left, ride drummer-right, rack toms
   top-centre, big kick centre, snare beside it, floor toms lower
   corners, throne (square) at the bottom.

   Three configs by tom/floor count, each with a left-handed twin
   (positions mirrored on x; shell ART is left upright so the
   snare "S" / kick pedal stay correct).
   ============================================ */

import { drumIcons } from './drums';
import type { IconDescriptor } from './types';

const shellBody = (name: string): string => {
  const ic = drumIcons.find((i) => i.name === name);
  if (!ic) throw new Error(`drum composite: missing shell "${name}"`);
  return ic.body;
};

/** Place a shell (authored 0 0 100 100, centred ~50,50) at (px,py), scaled. */
const place = (name: string, px: number, py: number, s: number): string => {
  const tx = +(px - 50 * s).toFixed(2);
  const ty = +(py - 50 * s).toFixed(2);
  return `<g transform="translate(${tx} ${ty}) scale(${s})">${shellBody(name)}</g>`;
};

const cymbal = (cx: number, cy: number, r: number): string =>
  `<circle cx="${cx}" cy="${cy}" r="${r}" class="lp-ico-detail"/><circle cx="${cx}" cy="${cy}" r="${+(r * 0.2).toFixed(1)}" class="lp-ico-detail"/>`;

type Shell = [name: string, px: number, py: number, s: number];
type Cym = [cx: number, cy: number, r: number];
const mx = (x: number) => 100 - x;

// Kick centre, snare to its right, throne at the bottom.
const SHARED: Shell[] = [
  ['drum-kick', 50, 49, 0.23],
  ['drum-snare', 61, 60, 0.115],
  ['drum-throne', 50, 87, 0.094],
];
const SHARED_CYM: Cym[] = [
  [20, 18, 11], // crash L
  [80, 18, 11], // crash R
  [16, 49, 10], // hi-hat (drummer's left)
  [84, 45, 11], // ride (drummer's right)
];

const CONFIGS: Array<{ key: string; label: string; w: number; toms: Shell[]; floors: Shell[] }> = [
  {
    key: '1t1f', label: '1 tom, 1 floor', w: 7.5,
    toms: [['drum-tom-hi', 50, 30, 0.13]],
    floors: [['drum-tom-floor', 73, 63, 0.158]],
  },
  {
    key: '2t1f', label: '2 tom, 1 floor', w: 7.8,
    toms: [['drum-tom-hi', 40, 30, 0.115], ['drum-tom-mid', 60, 30, 0.122]],
    floors: [['drum-tom-floor', 74, 64, 0.158]],
  },
  {
    key: '2t2f', label: '2 tom, 2 floor', w: 8,
    toms: [['drum-tom-hi', 40, 29, 0.108], ['drum-tom-mid', 60, 29, 0.115]],
    floors: [['drum-tom-floor', 28, 65, 0.144], ['drum-tom-floor', 73, 65, 0.144]],
  },
];

function kit(toms: Shell[], floors: Shell[], left: boolean): string {
  const shells = [...SHARED, ...toms, ...floors];
  const sh = shells.map(([n, x, y, s]) => place(n, left ? mx(x) : x, y, s)).join('');
  const cy = SHARED_CYM.map(([x, y, r]) => cymbal(left ? mx(x) : x, y, r)).join('');
  return sh + cy;
}

export const drumComposites: IconDescriptor[] = CONFIGS.flatMap((c) => [
  {
    name: `drum-kit-${c.key}`,
    category: 'drums' as const,
    label: `Kit · ${c.label}`,
    footprint: { width_ft: c.w, depth_ft: c.w },
    composite: true,
    keywords: ['kit', 'drums', 'right-handed', c.label],
    body: kit(c.toms, c.floors, false),
  },
  {
    name: `drum-kit-${c.key}-lh`,
    category: 'drums' as const,
    label: `Kit · ${c.label} (LH)`,
    footprint: { width_ft: c.w, depth_ft: c.w },
    composite: true,
    leftHanded: true,
    keywords: ['kit', 'drums', 'left-handed', 'lefty', c.label],
    body: kit(c.toms, c.floors, true),
  },
]);
