# Income output override — Stage-A MAP (#28, Phase B)

> **MAP ONLY. No code, no migration written yet.** This documents where the
> recompute decision lives, the minimal storage model recommended, the UX, the
> grid seam, the blast radius, and the migration number. Build is gated on
> sign-off of the storage decision below.

## Problem

After the projection fix (`fix/income-projection-outputs`, on `main` @ b401174)
the three projected outputs — **Overage** (`pre_tax_overage`), **Merch**
(`merch_income`), **VIP** (`vip_income`) — are **computed-locked**: read-only in
the grid and **recomputed by default** whenever any projection input changes
(`src/app/api/budget/income/route.ts:204-266`). That was the right fix for the
persistent-0 bug (a stray stored 0 used to freeze the formula).

But some deals can't be projected from the engine inputs: **PLUS** / **FLAT**
deals, or a one-off where the promoter has already told you the overage number.
Today there is no way to deliberately hand-enter an output — the engine clears it
(`out.preTaxOverage ?? 0`) and the grid won't let you type. **#28** adds a
per-output, explicit **manual override** that survives input edits.

## Where the recompute decision lives (the seam to gate)

`src/app/api/budget/income/route.ts`:

```
210  let preTaxOverage = numMerge(body.pre_tax_overage, existing?.pre_tax_overage);
211  let merchIncome   = numMerge(body.merch_income,   existing?.merch_income);
212  let vipIncome     = numMerge(body.vip_income,     existing?.vip_income);
...
216  const OVERAGE_INPUTS = ['capacity','est_sell_thru','face_value','deal_type','deal_pct','deal_threshold','deal_pct_above','withholding_pct','pre_tax_guarantee'];
217  const MERCH_INPUTS   = ['capacity','est_sell_thru','dollars_per_head','merch_fee_pct'];
218  const VIP_INPUTS     = ['vip_tickets','vip_price'];
219  const recomputeOverage = has(OVERAGE_INPUTS);
220  const recomputeMerch   = has(MERCH_INPUTS);
221  const recomputeVip     = has(VIP_INPUTS);
...
263  if (recomputeOverage) preTaxOverage = out.preTaxOverage ?? 0;
264  if (recomputeMerch)   merchIncome   = out.merchIncome   ?? 0;
265  if (recomputeVip)     vipIncome     = out.vipIncome     ?? 0;
```

The override gates each `recompute*` flag: **`recomputeOverage = has(OVERAGE_INPUTS) && !overageIsOverride`** (likewise merch/vip). When an output is overridden, an input edit no longer clobbers the hand-entered value; the engine still runs for the *non*-overridden outputs.

## Storage model — RECOMMENDATION (minimal): a boolean flag per output

Three options were on the table:

| Option | Shape | Verdict |
|---|---|---|
| **A. Per-output boolean flag** *(recommended)* | `overage_is_override` / `merch_is_override` / `vip_is_override` `BOOLEAN NOT NULL DEFAULT false`; the override **value lives in the existing** `pre_tax_overage` / `merch_income` / `vip_income` column | ✅ minimal; zero new value columns; the P&L + grid already read those columns unchanged |
| B. Nullable `*_override` value columns | a second number column per output | ❌ two sources of truth for one number; forces `coalesce` in the route, the grid, **and** `computeBudgetPnl` |
| C. Single `manual_outputs` jsonb | `{overage?:n, merch?:n, vip?:n}` | ❌ opaque to SQL (no index/constraint), awkward to snapshot into `budget_version_income`, overkill for exactly 3 scalars |

**Why A wins:** the materialised column (`pre_tax_overage` etc.) already *is* the
value the P&L and grid read. Keeping the override **in** that column means the
only behavioural change downstream is the **recompute gate** (route) and the
**read-only flag** (grid). `computeBudgetPnl` (`src/lib/budget/*`, reads
`pre_tax_overage`/`merch_income`/`vip_income`, verified by INC-PFX-07) needs **no
change**. The boolean is the single, explicit gate — which is exactly what
replaced the broken "is a value present?" heuristic, so it cannot reintroduce the
persistent-0 freeze: an overridden `0` is now legitimate user intent, and a
non-overridden output still recomputes from inputs.

### Columns (Option A)

`budget_income` (draft / proposed source) **and** `budget_version_income`
(snapshot mirror — versioning tax, mirror everything per migration 217's pattern):

```
overage_is_override BOOLEAN NOT NULL DEFAULT false
merch_is_override   BOOLEAN NOT NULL DEFAULT false
vip_is_override     BOOLEAN NOT NULL DEFAULT false
```

### Route behaviour (Option A)

- **Recompute gate:** `recomputeOverage = has(OVERAGE_INPUTS) && !overage_is_override` (×3).
- **Set override:** body carries `overage_is_override: true` + the typed
  `pre_tax_overage` → persist both; skip recompute for that output. `post_tax_overage`
  still derives via `postTaxFromPreTax(preTaxOverage, withholdingPct)` — **decision
  for sign-off:** does WH still apply to an overridden pre-WH overage? Recommend
  **yes** (the column's meaning is unchanged — you're overriding the pre-WH figure),
  but confirm with Adam.
- **Clear override ("revert to formula"):** body carries `overage_is_override: false`
  → set flag false **and** immediately recompute from current inputs (so the cell
  doesn't sit on a stale manual value).

## Grid seam — the real grid-core work

`src/components/budget/BudgetIncomeGrid.tsx`:

- `PROJECTED_OUTPUT_COLS = new Set(['overage','merch','vip'])` (:53) — currently
  rendered via `cMoney(id,label)` = `{...money(id), ro:true}` (:306, :325/329/333),
  i.e. **column-level** read-only.
- Override is **per-row-per-output**, so a blanket column `ro:true` no longer fits.
  The grid needs a **per-cell** read-only predicate for these three columns:
  overridden cell → editable; non-overridden → read-only (ƒ). **Precedent exists**
  — `isVersionLocked(key)` already gates editability per-cell in `Grid.tsx`, so the
  grid model can carry a per-cell `ro` resolver the same way. Designing that
  predicate (or a `cellReadOnly?(rowUid,colId)` opt-in prop) is the main grid-core
  change; everything else is route + migration.
- `toGridUpdate` (:192-194) already maps `overage→pre_tax_overage`,
  `merch→merch_income`, `vip→vip_income`, so the edit→PATCH path is in place; it
  needs to also send the `*_is_override` flag when the user sets/clears an override.
- The grid's computability blanks (`overageComputable`/`merchComputable`/
  `vipComputable`, :261-263/404-406) must treat an overridden output as **always
  shown** (it's a real user value, never "—").

### UX (per the #28 spec)

- **Right-click a read-only output cell → "Override formula"** → warning modal
  ("this output will stop tracking the formula; the P&L uses your number") → cell
  becomes editable **and** visually flagged **distinct from ƒ** (e.g. a `✎` glyph /
  "manual" tint, not the computed ƒ header).
- **Right-click an overridden cell → "Revert to formula?"** → confirm → clear flag
  → recompute. The grid already has the context-menu + confirm-modal primitives
  (`GridMenu`, `confirmRef`).

## Blast radius (must-not-break)

1. **Don't reintroduce persistent-0.** The gate is the explicit boolean, not value
   presence — a non-overridden output still recomputes by default (INC-PFX-04
   stays green). An overridden `0` is intentional.
2. **Overrides live on the draft and lock with versioning.** Add the 3 booleans to
   `budget_version_income` too; the version create/copy path (migration 212 +
   `budget_version_rollback` RPC, 219) must carry them into the snapshot. When a
   version is Current/locked, overrides are read-only like every other proposed
   cell — `isVersionLocked` already enforces this; no special-casing.
3. **`computeBudgetPnl` reads the final value** from `pre_tax_overage` /
   `merch_income` / `vip_income` — unchanged under Option A (the override lives in
   those columns). INC-PFX-07 parity holds.
4. **Actuals view unaffected** — actuals never lock and use separate
   `actual_*` columns; override is a **projected**-view concept only.
5. **`post_tax_overage`** is derived, not stored as an override — see the WH
   decision above.

## Migration number

Highest migration on `main` **and** across all active feature branches = **219**
(`219_budget_version_rollback.sql`). Next is **`220_income_output_overrides.sql`**
— adds the 3 booleans to `budget_income` + `budget_version_income`. A single
migration suffices (no second table needed; **221 not required**). Additive,
nullable-with-default, idempotent (`ADD COLUMN IF NOT EXISTS`), down-block at the
end — same shape as 217.

## Smoke IDs (to land with the build, not now)

- **INC-OVR-01** — right-click Overage on a PLUS/FLAT show → Override formula →
  warning → cell editable + flagged distinct from ƒ; typed value persists.
- **INC-OVR-02** — with an override set, editing an input (Cap/Face/Deal%) does
  **not** clobber the manual output; the *other* (non-overridden) outputs still
  recompute.
- **INC-OVR-03** — Revert to formula → confirm → cell goes read-only ƒ and
  recomputes from current inputs.
- **INC-OVR-04** — an overridden output snapshots into the version on lock and is
  read-only in a locked/Current version; the P&L (`computeBudgetPnl`) uses the
  override value.

## STOP

This is the Stage-A map only. Await sign-off on (a) Option A vs B/C and (b) the
WH-on-overridden-overage decision before writing migration 220 + the route/grid
changes.
