# CC — RUN ALL THE WAY THROUGH. Don't stop to ask "which next". Off `main` (a03d936).

Work the queue top to bottom in one run. **Do NOT stop between parts to report or ask what's next** — build,
floor green, commit + PUSH, continue. One consolidated report + smoke at the very end.

> ## 🟢 YOU ARE EMPOWERED TO DECIDE — keep moving
> For any ambiguity that does **not** touch money math or destroy saved data, **make the reasonable call and
> keep going** — note the call in the final report. Do NOT halt to ask.
> **The ONLY hard stops** (skip that item with a one-line note, then CONTINUE to the next — do not end the run):
> 1. A change to fee/P&L **money math** (`src/lib/payroll/fees.ts`, `computeBudgetPnl`, income projection).
> 2. A **data-destructive** change (e.g. retroactively blanking saved stage-plot labels).
> 3. An item explicitly listed **BLOCKED** below (needs an asset or an Adam decision).
> Everything else: decide and build. Floor stays green each commit (tsc 0 · eslint 0 · `next build --webpack`).

## QUEUE

### 1. Channel list — `feat/revamp-channel-list`
- Make it **editable on the canonical grid** (dropdowns where needed: mic/DI, phantom, etc.).
- **Decouple from the Rider** — channel list rides as its own thing; edit it in place on its own tab.
- Add an **add/edit channel-list path inside the Rider** surface (references the same channel-list data), so a
  rider can include + edit a channel list.
- **Patching menu:** grep first for an existing one (`stage-IO` / `patch` / `stage_boxes` / patch grid). If it
  exists, wire it in. If it doesn't, DON'T build a new one blind — note it as a follow-up and move on.
- Phase-1 chrome (sits on the page).

### 2. Stage plot — SAFE parts only — `feat/revamp-stageplot`
- **Labels default OFF:** default NEW items to hidden labels **at the item-creation site** — do NOT flip the
  `StageCanvas` render default (that retroactively blanks existing saved plots = a HARD STOP #2). New plots
  start labels-off; existing plots untouched.
- **Brand the tick-boxes:** the Stage-panel checkboxes → `.lp-checkbox`. Locate them first; if you genuinely
  can't find them, note it and move on (don't guess).
- **DEFER (note, don't build):** the ft-grid→canvas **scale** fix and the **export-parity** (`buildStagePlotSvg`)
  — both are risky/data-adjacent and want their own focused pass.
- **BLOCKED:** the **drum icon** rebuild — needs Adam's reference art. Skip, note.

### 3. Opportunistic chrome
Any surface you touch above that still has the boxed-window / mono-on-labels tells → apply the Phase-1 chrome
in passing. Don't chase surfaces you're not otherwise in.

## BLOCKED — do NOT build; note as blocked and keep going
- **Stage-plot drum icons** — needs Adam's art.
- **Payroll rate-types b1/b2** — Adam's money-critical decision + its own gated build (separate).
- **Operations Summary** improve-vs-demote — Adam's decision.
- **Artist Home** revamp — design-lock pending.
- **Files manager** — scope-map pending.
- **Advance AI parser** — scope/cost pending.

## FINAL (once, at the end — not between parts)
One report: table (part · branch · hash · landed / decided-and-how / skipped-why) + floor-green confirmation +
one combined Adam click-test list. Note every judgment call you made and every deferred/blocked item.
