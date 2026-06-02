/* ============================================
   LOWPASS — Stage Plot drum kit composites (§SP1a·2b, review 2)

   Whole-kit clusters dropped as one item, then split into pieces
   (§SP9). Per review: cymbals are BACK (hi-hat + crash + ride)
   and every config ships a LEFT-HANDED version. Three configs:
   1 tom / 1 floor, 2 tom / 1 floor, 2 tom / 2 floor.

   Shells reuse the actual shell icon bodies (kick/snare/toms/
   floor) via transforms, so a kit reads as — and splits into —
   those exact shells. Cymbals are outline circles + bell so they
   read as cymbals on top of the filled shells.

   Left-handed = the same shells placed at MIRRORED x positions
   (hi-hat to the drummer's right, floor + ride to the left). We
   mirror positions, NOT the shell art, so the snare "S" and kick
   pedal stay correctly oriented.
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

/** Outline cymbal (stroke only) + centre bell. */
const cymbal = (cx: number, cy: number, r: number): string =>
  `<circle cx="${cx}" cy="${cy}" r="${r}" class="lp-ico-detail"/>` +
  `<circle cx="${cx}" cy="${cy}" r="${+(r * 0.24).toFixed(1)}" class="lp-ico-detail"/>`;

type Shell = [name: string, px: number, py: number, s: number];
type Cym = [cx: number, cy: number, r: number];

const mx = (x: number) => 100 - x; // mirror x for left-handed

function buildKit(shells: Shell[], cyms: Cym[], left: boolean): string {
  const sh = shells.map(([n, x, y, s]) => place(n, left ? mx(x) : x, y, s)).join('');
  const cy = cyms.map(([x, y, r]) => cymbal(left ? mx(x) : x, y, r)).join('');
  return sh + cy;
}

// RH layouts (kick downstage/bottom, snare to the drummer's left,
// rack toms above, floor tom right, hi-hat far left, ride upper-right,
// crash upper-left).
const CONFIGS: Array<{ key: string; label: string; w: number; shells: Shell[]; cyms: Cym[] }> = [
  {
    key: '1t1f',
    label: '1 tom, 1 floor',
    w: 6.5,
    shells: [
      ['drum-kick', 50, 64, 0.3],
      ['drum-snare', 34, 66, 0.16],
      ['drum-tom-hi', 50, 44, 0.16],
      ['drum-tom-floor', 76, 64, 0.21],
    ],
    cyms: [
      [19, 54, 9],
      [33, 30, 8],
      [72, 34, 10],
    ],
  },
  {
    key: '2t1f',
    label: '2 tom, 1 floor',
    w: 7,
    shells: [
      ['drum-kick', 50, 65, 0.29],
      ['drum-snare', 33, 67, 0.15],
      ['drum-tom-hi', 42, 45, 0.15],
      ['drum-tom-mid', 59, 46, 0.16],
      ['drum-tom-floor', 77, 65, 0.21],
    ],
    cyms: [
      [19, 56, 9],
      [31, 31, 8],
      [74, 35, 10],
    ],
  },
  {
    key: '2t2f',
    label: '2 tom, 2 floor',
    w: 7.5,
    shells: [
      ['drum-kick', 49, 63, 0.28],
      ['drum-snare', 31, 65, 0.14],
      ['drum-tom-hi', 41, 43, 0.14],
      ['drum-tom-mid', 58, 44, 0.15],
      ['drum-tom-floor', 75, 57, 0.19],
      ['drum-tom-floor', 80, 79, 0.2],
    ],
    cyms: [
      [18, 52, 8],
      [30, 28, 7],
      [70, 31, 9],
    ],
  },
];

export const drumComposites: IconDescriptor[] = CONFIGS.flatMap((c) => [
  {
    name: `drum-kit-${c.key}`,
    category: 'drums' as const,
    label: `Kit · ${c.label}`,
    footprint: { width_ft: c.w, depth_ft: c.w },
    composite: true,
    keywords: ['kit', 'drums', 'right-handed', c.label],
    body: buildKit(c.shells, c.cyms, false),
  },
  {
    name: `drum-kit-${c.key}-lh`,
    category: 'drums' as const,
    label: `Kit · ${c.label} (LH)`,
    footprint: { width_ft: c.w, depth_ft: c.w },
    composite: true,
    leftHanded: true,
    keywords: ['kit', 'drums', 'left-handed', 'lefty', c.label],
    body: buildKit(c.shells, c.cyms, true),
  },
]);
