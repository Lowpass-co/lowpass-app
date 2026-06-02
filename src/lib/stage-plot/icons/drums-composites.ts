/* ============================================
   LOWPASS — Stage Plot drum kit composites (§SP1, review 4)

   Clean top-down kits matching the reference: 2 crash cymbals at
   the top corners, hi-hat drummer-left, ride drummer-right, rack
   toms top-centre, big kick centre, snare just below, floor toms
   at the lower corners, throne (square) at the bottom. Drums are
   filled circles (brand tint); cymbals are outline circles + bell.
   Three configs by tom/floor count, each with a left-handed twin
   (mirrored x).

   Placed at 180° by default (see addItem) so the kit faces the
   audience on a stage plot — drummer upstage, kick downstage.
   ============================================ */

import type { IconDescriptor } from './types';

const drum = (cx: number, cy: number, r: number): string =>
  `<circle cx="${cx}" cy="${cy}" r="${r}"/><circle cx="${cx}" cy="${cy}" r="${+(r * 0.16).toFixed(1)}" class="lp-ico-detail"/>`;
const cymbal = (cx: number, cy: number, r: number): string =>
  `<circle cx="${cx}" cy="${cy}" r="${r}" class="lp-ico-detail"/><circle cx="${cx}" cy="${cy}" r="${+(r * 0.2).toFixed(1)}" class="lp-ico-detail"/>`;
const throne = (cx: number, cy: number, s: number): string =>
  `<rect x="${cx - s}" y="${cy - s}" width="${s * 2}" height="${s * 2}" rx="2"/>`;

type Circle = [cx: number, cy: number, r: number];

const SHARED_DRUMS: Circle[] = [
  [50, 46, 17], // kick
  [50, 68, 9], // snare
];
const SHARED_CYM: Circle[] = [
  [20, 17, 12], // crash L
  [80, 17, 12], // crash R
  [15, 50, 11], // hi-hat
  [85, 46, 12], // ride
];

const CONFIGS: Array<{ key: string; label: string; w: number; toms: Circle[]; floors: Circle[] }> = [
  { key: '1t1f', label: '1 tom, 1 floor', w: 7.5, toms: [[50, 29, 10]], floors: [[74, 66, 12]] },
  { key: '2t1f', label: '2 tom, 1 floor', w: 7.8, toms: [[41, 29, 9], [59, 29, 10]], floors: [[74, 67, 12]] },
  { key: '2t2f', label: '2 tom, 2 floor', w: 8, toms: [[41, 28, 9], [59, 28, 10]], floors: [[26, 67, 11], [74, 67, 11]] },
];

const mx = (c: Circle): Circle => [100 - c[0], c[1], c[2]];

function kit(toms: Circle[], floors: Circle[], left: boolean): string {
  const drums = [...SHARED_DRUMS, ...toms, ...floors];
  const cyms = SHARED_CYM;
  const t = left ? throne(50, 87, 5) : throne(50, 87, 5);
  const ds = (left ? drums.map(mx) : drums).map((c) => drum(...c)).join('');
  const cs = (left ? cyms.map(mx) : cyms).map((c) => cymbal(...c)).join('');
  return ds + cs + t;
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
