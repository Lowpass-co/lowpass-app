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

import type { IconDescriptor } from './types';

/* FROZEN shell bodies — the kit composites are owned by §SP-FIX-3
   (composite/individual toggle redesign). Decoupled from drums.ts so
   the §SP-FIX-1b standalone-piece redraw can't restyle or break them.
   These are the pre-FIX-1b 0 0 100 100 bodies (centred ~50,50, which
   place() assumes). Delete this map when §SP-FIX-3 rebuilds composites. */
const FROZEN_SHELLS: Record<string, string> = {
  'drum-kick':
    '<circle cx="50" cy="44" r="32"/><circle cx="50" cy="44" r="4" class="lp-ico-detail"/>' +
    '<line x1="30" y1="70" x2="18" y2="93" class="lp-ico-detail"/><line x1="70" y1="70" x2="82" y2="93" class="lp-ico-detail"/>' +
    '<rect x="43" y="82" width="14" height="13" rx="2" class="lp-ico-detail"/>',
  'drum-snare':
    '<circle cx="50" cy="50" r="32"/>' +
    '<text class="lp-ico-label" x="50" y="50" text-anchor="middle" dominant-baseline="central" font-size="34">S</text>' +
    '<rect x="79" y="44" width="13" height="12" rx="2" class="lp-ico-detail"/>',
  'drum-tom-hi':
    '<circle cx="50" cy="50" r="28"/><circle cx="50" cy="50" r="4" class="lp-ico-detail"/>' +
    '<line x1="44" y1="20" x2="52" y2="28" class="lp-ico-detail"/><line x1="52" y1="20" x2="44" y2="28" class="lp-ico-detail"/>',
  'drum-tom-mid':
    '<circle cx="50" cy="50" r="31"/><circle cx="50" cy="50" r="4" class="lp-ico-detail"/>' +
    '<line x1="32" y1="22" x2="40" y2="30" class="lp-ico-detail"/><line x1="40" y1="22" x2="32" y2="30" class="lp-ico-detail"/>' +
    '<line x1="60" y1="22" x2="68" y2="30" class="lp-ico-detail"/><line x1="68" y1="22" x2="60" y2="30" class="lp-ico-detail"/>',
  'drum-tom-floor':
    '<circle cx="50" cy="50" r="31"/><circle cx="50" cy="50" r="5" class="lp-ico-detail"/>' +
    '<line x1="28" y1="22" x2="36" y2="30" class="lp-ico-detail"/><line x1="36" y1="22" x2="28" y2="30" class="lp-ico-detail"/>' +
    '<line x1="46" y1="20" x2="54" y2="28" class="lp-ico-detail"/><line x1="54" y1="20" x2="46" y2="28" class="lp-ico-detail"/>' +
    '<line x1="64" y1="22" x2="72" y2="30" class="lp-ico-detail"/><line x1="72" y1="22" x2="64" y2="30" class="lp-ico-detail"/>',
  'drum-throne':
    '<rect x="22" y="22" width="56" height="56" rx="12"/><line x1="50" y1="34" x2="50" y2="66" class="lp-ico-detail"/>',
};

const shellBody = (name: string): string => {
  const b = FROZEN_SHELLS[name];
  if (!b) throw new Error(`drum composite: missing frozen shell "${name}"`);
  return b;
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
  ['drum-kick', 50, 49, 0.32],
  ['drum-snare', 61, 60, 0.16],
  ['drum-throne', 50, 87, 0.13],
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
    toms: [['drum-tom-hi', 50, 30, 0.18]],
    floors: [['drum-tom-floor', 73, 63, 0.22]],
  },
  {
    key: '2t1f', label: '2 tom, 1 floor', w: 7.8,
    toms: [['drum-tom-hi', 40, 30, 0.16], ['drum-tom-mid', 60, 30, 0.17]],
    floors: [['drum-tom-floor', 74, 64, 0.22]],
  },
  {
    key: '2t2f', label: '2 tom, 2 floor', w: 8,
    toms: [['drum-tom-hi', 40, 29, 0.15], ['drum-tom-mid', 60, 29, 0.16]],
    floors: [['drum-tom-floor', 28, 65, 0.2], ['drum-tom-floor', 73, 65, 0.2]],
  },
];

function kit(toms: Shell[], floors: Shell[], left: boolean): string {
  const shells = [...SHARED, ...toms, ...floors];
  const sh = shells.map(([n, x, y, s]) => place(n, left ? mx(x) : x, y, s)).join('');
  const cy = SHARED_CYM.map(([x, y, r]) => cymbal(left ? mx(x) : x, y, r)).join('');
  return sh + cy;
}

/* ── §SP-FIX-3 — individual-mode layout ──────────────────────────
   Splitting a composite kit into individual pieces places real piece
   icons (kick/snare/toms/cymbals/hi-hat/ride/throne) at canonical
   offsets in feet from the kit centre, derived from the composite art
   positions. Left-handed mirrors the x offsets. */
export interface KitPiece {
  iconName: string;
  dxFt: number;
  dyFt: number;
}

const CYM_ICONS: ReadonlyArray<[string, number, number]> = [
  ['drum-crash', 20, 18],
  ['drum-crash', 80, 18],
  ['drum-hihat', 16, 49],
  ['drum-ride', 84, 45],
];

/** Resolve a composite icon name → its individual-piece layout. */
export function kitLayout(name: string): { footprintFt: number; pieces: KitPiece[] } | null {
  const lh = name.endsWith('-lh');
  const key = name.replace(/^drum-kit-/, '').replace(/-lh$/, '');
  const cfg = CONFIGS.find((c) => c.key === key);
  if (!cfg) return null;
  const raw: Array<[string, number, number]> = [
    ['drum-kick', 50, 49],
    ['drum-snare', 61, 60],
    ['drum-throne', 50, 87],
    ...cfg.toms.map(([n, x, y]) => [n, x, y] as [string, number, number]),
    ...cfg.floors.map(([n, x, y]) => [n, x, y] as [string, number, number]),
    ...CYM_ICONS.map(([n, x, y]) => [n, x, y] as [string, number, number]),
  ];
  const w = cfg.w;
  const pieces = raw.map(([icon, px, py]) => {
    const x = lh ? 100 - px : px;
    return { iconName: icon, dxFt: +(((x - 50) / 100) * w).toFixed(2), dyFt: +(((py - 50) / 100) * w).toFixed(2) };
  });
  return { footprintFt: w, pieces };
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
