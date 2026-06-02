/* ============================================================
   LOWPASS — Stage Plot signal & I/O (§SP-FIX-1b·3)

   Redrawn to the canonical grammar. DI + rack come DIRECTLY from
   the canonical anchors (di-mono / di-stereo / rack-4u). The rest
   are authored in footprint-proportional viewBoxes (scale fix) with
   the in-icon text removed — except "DI", a deliberate canonical
   exception. Lean set: redundant variants (active DI, 6U dup, the
   4/12 stage boxes) dropped — the generator covers specifics.
   ============================================================ */

import type { IconDescriptor } from './types';
import { canonicalIcons } from './canonical';

const canon = (name: string): IconDescriptor => {
  const ic = canonicalIcons.find((i) => i.name === name);
  if (!ic) throw new Error(`signal: missing canonical anchor "${name}"`);
  return ic;
};
const vb = (w: number, d: number): string => `0 0 ${Math.round(w * 100)} ${Math.round(d * 100)}`;

/** Stage box: frame + cols×rows grid of XLR jack circles. */
const stagebox = (W: number, H: number, cols: number, rows: number, r: number): string => {
  let s = `<rect x="4" y="4" width="${W - 8}" height="${H - 8}" rx="5"/>`;
  const mx = W * 0.14;
  const my = H * 0.26;
  const sx = cols > 1 ? (W - 2 * mx) / (cols - 1) : 0;
  const sy = rows > 1 ? (H - 2 * my) / (rows - 1) : 0;
  for (let c = 0; c < cols; c++)
    for (let rr = 0; rr < rows; rr++) {
      const cx = (cols > 1 ? mx + c * sx : W / 2).toFixed(1);
      const cy = (rows > 1 ? my + rr * sy : H / 2).toFixed(1);
      s += `<circle cx="${cx}" cy="${cy}" r="${r}" class="lp-ico-detail"/>`;
    }
  return s;
};

export const signalIcons: IconDescriptor[] = [
  canon('di-mono'),
  canon('di-stereo'),
  canon('rack-4u'),
  {
    name: 'signal-pedalboard',
    category: 'signal',
    label: 'Pedalboard',
    footprint: { width_ft: 2.2, depth_ft: 1.1 },
    viewBox: vb(2.2, 1.1),
    keywords: ['pedalboard', 'helix', 'floorboard', 'footswitch', 'guitar'],
    body:
      '<rect x="4" y="4" width="212" height="102" rx="6"/>' +
      '<rect x="16" y="16" width="104" height="26" rx="3" class="lp-ico-detail"/>' +
      '<circle cx="34" cy="76" r="11" class="lp-ico-detail"/><circle cx="74" cy="76" r="11" class="lp-ico-detail"/><circle cx="114" cy="76" r="11" class="lp-ico-detail"/>' +
      '<rect x="150" y="22" width="56" height="64" rx="3" class="lp-ico-detail"/><line x1="150" y1="40" x2="206" y2="26" class="lp-ico-detail"/>',
  },
  {
    name: 'signal-snake-analog',
    category: 'signal',
    label: 'Analog snake',
    footprint: { width_ft: 1, depth_ft: 0.7 },
    viewBox: vb(1, 0.7),
    keywords: ['snake', 'analog', 'multicore', 'fan', 'loom'],
    body:
      '<rect x="6" y="22" width="34" height="26" rx="4"/>' +
      '<line x1="40" y1="28" x2="92" y2="10" class="lp-ico-detail"/><line x1="40" y1="33" x2="94" y2="28" class="lp-ico-detail"/><line x1="40" y1="38" x2="94" y2="44" class="lp-ico-detail"/><line x1="40" y1="43" x2="92" y2="62" class="lp-ico-detail"/>',
  },
  {
    name: 'signal-snake-digital',
    category: 'signal',
    label: 'Digital snake',
    footprint: { width_ft: 0.9, depth_ft: 0.6 },
    viewBox: vb(0.9, 0.6),
    keywords: ['snake', 'digital', 'network', 'cat5', 'dante', 'stagebox'],
    // single Cat5 run + RJ45 connector (vs the analog fan).
    body:
      '<rect x="6" y="16" width="40" height="28" rx="4"/>' +
      '<line x1="46" y1="30" x2="74" y2="30" class="lp-ico-detail"/>' +
      '<rect x="74" y="24" width="12" height="12" rx="1.5" class="lp-ico-detail"/>',
  },
  {
    name: 'signal-stagebox-8',
    category: 'signal',
    label: 'Stage box 8',
    footprint: { width_ft: 0.9, depth_ft: 0.5 },
    viewBox: vb(0.9, 0.5),
    keywords: ['stagebox', 'stage', 'box', '8', 'input', 'snake', 'xlr'],
    body: stagebox(90, 50, 4, 2, 5),
  },
  {
    name: 'signal-stagebox-16',
    category: 'signal',
    label: 'Stage box 16',
    footprint: { width_ft: 1.3, depth_ft: 0.6 },
    viewBox: vb(1.3, 0.6),
    keywords: ['stagebox', 'stage', 'box', '16', 'input', 'snake', 'xlr'],
    body: stagebox(130, 60, 8, 2, 4.5),
  },
  {
    name: 'signal-switch',
    category: 'signal',
    label: 'Network switch',
    footprint: { width_ft: 1, depth_ft: 0.5 },
    viewBox: vb(1, 0.5),
    keywords: ['switch', 'network', 'ethernet', 'port', 'lan', 'rj45'],
    body:
      '<rect x="4" y="12" width="92" height="26" rx="4"/>' +
      Array.from({ length: 8 }, (_, i) => `<rect x="${12 + i * 10}" y="20" width="7" height="10" rx="1" class="lp-ico-detail"/>`).join(''),
  },
];
