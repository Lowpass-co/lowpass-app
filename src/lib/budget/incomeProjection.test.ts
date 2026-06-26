/* node --experimental-strip-types src/lib/budget/incomeProjection.test.ts

   Unit tests for the deal-aware income projection engine (Income Phase 3).
   Covers: VS marginal tiering (above/below threshold), non-tiered VS, floor-at-0,
   haircut, tax-off-top, the full reference formula incl withholding (applied
   downstream — asserted here for completeness), PLUS/FLAT no-overage, merch
   net×fee, VIP, and null-input guards. */

import assert from 'node:assert';
import {
  projectIncome,
  artistShare,
  DEFAULT_PROJECTION_CONFIG,
  type ProjectionInput,
  type ProjectionConfig,
} from './incomeProjection.ts';

let pass = 0;
const approx = (a: number, b: number, eps = 1e-6) => Math.abs(a - b) <= eps;
const check = (label: string, cond: boolean) => {
  assert.ok(cond, label);
  pass++;
};

const cfg: ProjectionConfig = { haircut: 0.65, taxPct: 0.08 };

const base: ProjectionInput = {
  capacity: null,
  sellThru: null,
  faceValue: null,
  dealType: null,
  dealPct: null,
  dealThreshold: null,
  dealPctAbove: null,
  dollarsPerHead: null,
  merchFeePct: null,
  vipTickets: null,
  vipPrice: null,
  preTaxGuarantee: null,
};

/* ---- 1. VS, TIERED, marginal — tickets ABOVE threshold ---------------- */
// Cap 500 × 80% = 400 tickets. Threshold 275. Face 30, tax 8% → perTicket = 27.6.
// Marginal share = 27.6 × (0.55×275 + 0.65×(400−275))
//               = 27.6 × (151.25 + 81.25) = 27.6 × 232.5 = 6417.0
// guar 2000 → overage(pre-WH) = max(0, 6417 − 2000) × 0.65 = 4417 × 0.65 = 2871.05
{
  const input: ProjectionInput = {
    ...base, capacity: 500, sellThru: 0.8, faceValue: 30, dealType: 'VS',
    dealPct: 0.55, dealThreshold: 275, dealPctAbove: 0.65, preTaxGuarantee: 2000,
  };
  const share = artistShare(input, cfg.taxPct)!;
  check('VS tiered: marginal artist share', approx(share, 6417.0));
  const out = projectIncome(input, cfg);
  check('VS tiered: pre-WH haircut overage', approx(out.preTaxOverage!, 2871.05));
  // full reference number = pre-WH × (1 − WH); WH 30% applied downstream by the P&L
  check('VS tiered: full formula incl 30% WH', approx(out.preTaxOverage! * (1 - 0.3), 2009.735));
}

/* ---- 2. VS, TIERED but tickets BELOW threshold → flat base % ---------- */
// Cap 300 × 80% = 240 ≤ 275 → share = 0.55 × 240 × 27.6 = 3643.2
{
  const input: ProjectionInput = {
    ...base, capacity: 300, sellThru: 0.8, faceValue: 30, dealType: 'VS',
    dealPct: 0.55, dealThreshold: 275, dealPctAbove: 0.65, preTaxGuarantee: 0,
  };
  check('VS below threshold: flat base %', approx(artistShare(input, cfg.taxPct)!, 3643.2));
}

/* ---- 3. VS, NON-tiered (no threshold) → flat deal_pct on all tickets --- */
// Cap 1000 × 75% = 750. Face 40, tax 8% → 36.8. share = 0.65 × 750 × 36.8 = 17940
{
  const input: ProjectionInput = {
    ...base, capacity: 1000, sellThru: 0.75, faceValue: 40, dealType: 'VS',
    dealPct: 0.65, dealThreshold: null, dealPctAbove: null, preTaxGuarantee: 5000,
  };
  check('VS non-tiered: flat share', approx(artistShare(input, cfg.taxPct)!, 17940));
  const out = projectIncome(input, cfg);
  // overage = max(0, 17940 − 5000) × 0.65 = 12940 × 0.65 = 8411
  check('VS non-tiered: overage', approx(out.preTaxOverage!, 8411));
}

/* ---- 4. VS — overage FLOORED at 0 when guarantee beats the % ----------- */
{
  const input: ProjectionInput = {
    ...base, capacity: 200, sellThru: 0.5, faceValue: 20, dealType: 'VS',
    dealPct: 0.6, preTaxGuarantee: 100000,
  };
  const out = projectIncome(input, cfg);
  check('VS floor: overage = 0 (guarantee wins)', out.preTaxOverage === 0);
}

/* ---- 5. tax-off-top changes the share (sanity on taxPct) -------------- */
{
  const input: ProjectionInput = {
    ...base, capacity: 100, sellThru: 1, faceValue: 100, dealType: 'VS', dealPct: 1,
  };
  // no tax → 100×1×100 = 10000; 8% tax → 9200
  check('tax 0%: share = gross', approx(artistShare(input, 0)!, 10000));
  check('tax 8%: share = gross × 0.92', approx(artistShare(input, 0.08)!, 9200));
}

/* ---- 6. PLUS and FLAT write NO overage (PLUS manual, FLAT no backend) -- */
{
  const vs = { ...base, capacity: 500, sellThru: 0.8, faceValue: 30, dealPct: 0.6, preTaxGuarantee: 0 };
  check('PLUS: engine writes no overage', projectIncome({ ...vs, dealType: 'PLUS' }, cfg).preTaxOverage === null);
  check('FLAT: engine writes no overage', projectIncome({ ...vs, dealType: 'FLAT' }, cfg).preTaxOverage === null);
  check('no deal type: no overage', projectIncome({ ...vs, dealType: null }, cfg).preTaxOverage === null);
}

/* ---- 7. Merch = cap × sell-thru × $/head(net) × fee% ------------------ */
// 500 × 0.8 × 4.50 × 0.20 = 360
{
  const input: ProjectionInput = { ...base, capacity: 500, sellThru: 0.8, dollarsPerHead: 4.5, merchFeePct: 0.2 };
  check('merch: net × fee', approx(projectIncome(input, cfg).merchIncome!, 360));
  // merch is deal-independent — projects with no deal type
  check('merch: independent of deal', projectIncome(input, cfg).merchIncome !== null);
}

/* ---- 8. VIP = tickets × price ----------------------------------------- */
{
  const input: ProjectionInput = { ...base, vipTickets: 10, vipPrice: 75 };
  check('VIP: tickets × price', approx(projectIncome(input, cfg).vipIncome!, 750));
}

/* ---- 9. null-input guards — no partial inputs project ----------------- */
{
  check('VS missing cap → null overage', projectIncome({ ...base, dealType: 'VS', sellThru: 0.8, faceValue: 30, dealPct: 0.6 }, cfg).preTaxOverage === null);
  check('merch missing $/head → null', projectIncome({ ...base, capacity: 500, sellThru: 0.8, merchFeePct: 0.2 }, cfg).merchIncome === null);
  check('VIP missing price → null', projectIncome({ ...base, vipTickets: 10 }, cfg).vipIncome === null);
  check('empty input → all null', (() => {
    const o = projectIncome(base, cfg);
    return o.preTaxOverage === null && o.merchIncome === null && o.vipIncome === null;
  })());
}

/* ---- 10. default config constants ------------------------------------- */
check('default config = 0.65 / 0.08', DEFAULT_PROJECTION_CONFIG.haircut === 0.65 && DEFAULT_PROJECTION_CONFIG.taxPct === 0.08);

console.log(`\n✓ incomeProjection: ${pass} checks passed`);
