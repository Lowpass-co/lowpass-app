# CC — Revamp long sprint (one unattended run). DON'T STOP between parts. Smoke once, at the end.

Work the whole ordered list below in one continuous run. Full per-item detail is in `CC_REVAMP_PROGRAM.md` —
this doc is the ORDER + the run rules. **Branch off `feat/revamp-bugs`** (it already carries the venue stack +
city fix + the Phase-0 Live-tag fix). Continue Phase 0 on it; stack each later part on the prior. Everything is
linear and collapses into `main` when Adam merges.

> ## ⚙️ RUN RULES (this is the point — keep going)
> - For EACH part: check the real files (cite file:line) → build → **floor green** (tsc 0 · eslint 0 ·
>   `next build --webpack`) → **commit + PUSH** → **CONTINUE to the next part immediately.**
> - **Do NOT stop to report or wait for sign-off between parts.** The single report + Adam's smoke happen ONCE,
>   at the very end. Committing + pushing each part IS the checkpoint trail.
> - **A blocked part does not halt the run.** If a part needs a missing backend, a missing asset, or a real
>   design decision (see EXCLUDED), SKIP it with a one-line note in the final report and move on.
> - **Data/logic bugs get a node-harness proof** (they're correctness — the em-dash/routing-filter class). UI
>   parts don't need a headless proof; they're verified in Adam's end smoke.
> - Only truly STOP the whole run if you'd have to break an invariant (recompute a P&L number, cross the
>   workspace/advance-sharing line, mutate `computeBudgetPnl`, drop a field silently).
> - Tokens only (`var(--lp-*)`, mono for numerics only). Don't regress merged work.

## ORDER

### Phase 0 — finish the bugs (continue on `feat/revamp-bugs`)
Each its own commit; node-harness the data ones.
1. Budget·Income — Fee % **un-invert** (100% = full, 0% = £0).
2. Budget·Income — CAP is a ticket **count**, not currency (no £/$).
3. Budget·Income — currency symbol shows **only on locked cells** (editable = plain number).
4. Budget·Income — Guarantee **seeds Actual**.
5. Budget·Expenses — section reorder **persists**.
6. Budget·Expenses — artist-logo save "violates row rule" → diagnose (RLS/CHECK) + fix.
7. Budget·Expenses — "Approve & lock" updates **optimistically** (no refresh needed).
8. Rooming — Nights in→out: out = **next day**.
9. Rooming — export room-count: two SGL = **two rooms** (fix the `roomKey` collision when `room.id` is null).
10. Advance — wire Complete/Pending/Overdue tiles to real state.
11. Advance — wire "Send packet"; **if it needs a backend that doesn't exist, SKIP + note** (don't stop).

### Phase 1 — systemic chrome (branch `feat/revamp-chrome` off Phase 0 tip) — HIGHEST LEVERAGE
12. **Grids "sit on the page", not a boxed window** — rework the shared grid wrapper (payroll, rooming,
    income, channel-list): drop the heavy black outer border/box, align bg + padding to the page. One shared
    change, applied everywhere.
13. Matrix cells less blocky/ASCII (rooming, payroll days-matrix) → the income grid's token treatment is the
    reference (`--lp-border-subtle` hairlines, proper padding, day-type/status colours).
14. **Mono only on numerics** — strip `.lp-mono` from labels/headings (Advance especially reads "weird").
15. Payroll matrix **header formatting** → canonical grid header treatment.

### Phase 2 — surfaces (branch per surface off the Phase-1 tip)
16. `feat/revamp-routing` — finish routing's "feel like the app" pass on the Phase-1 chrome (venue-first +
    city already landed; just the remaining restyle).
17. `feat/revamp-channel-list` — make it **editable on the canonical grid** (dropdowns: mic/DI, phantom…);
    decouple from "edit in rider"; add an add/edit channel-list path **inside the Rider** surface.
    **First grep for an existing patching menu** (stage-IO / patch / stage_boxes) — wire it if it exists; if
    not, note it as a follow-up (don't build a new one blind).
18. `feat/revamp-payroll` — **two-grid Rates/Summary page**: one grid to edit rates (+ advance etc.), one
    grid for summary/totals; show **all** rate types from the personnel form; make the edit affordance clear.
19. `feat/revamp-rooming` — spell out **Single/Double/Triple** (no S/D/T); unassigned hotel → default label to
    **city/country** when no name; restyle the Nights table to Phase-1 chrome.
20. `feat/revamp-personnel` — denser, more grid-like; **de-dup the rate entry** in the manage slide-over (one
    rates model); support **more rate types**; add **BAND** to the role-tag list.
21. `feat/revamp-riders` — fold the rider **manager** into the rider menu that opens on click (no separate
    blocky surface).
22. `feat/revamp-stageplot-nonassets` — the stage-plot fixes that DON'T need new art: **labels OFF by
    default**, **branded `.lp-checkbox`** tick boxes, **scale** fix (ft-grid→canvas true-to-scale), **export
    parity** (exported PDF matches the builder canvas via `buildStagePlotSvg`). **Do NOT touch the drum
    icons** (needs Adam's assets — EXCLUDED).
23. `feat/revamp-advance-polish` — drop the weird mono; fix the oversized "Complete" heading; reformat the
    venue-specs panel. (The tiles + send-packet wiring are Phase 0 #10/#11.)
24. `feat/budget-summary-pershow-labels` — the approved-summary follow-up: pass the routing join so
    `per-show-pnl` shows **real venue names** (not "Show N"); rename the brick to **"Per-show income"**
    (true net needs an allocation model — out of scope, note it).

## EXCLUDED — do NOT build; note as blocked and skip (these need Adam)
- Stage-plot **drum icon rebuild** — needs Adam's reference art. (The non-drum stage-plot fixes ARE in #22.)
- **Budget Summary cards** — already built (`feat/budget-summary-cards`), separate branch.
- **Artist Home revamp** — design-lock pending (mock in progress).
- **Files manager** — scope-map pending.
- **Advance AI parser** — scope/cost/model plan pending.
- **Operations Summary** improve-vs-demote — Adam's decision pending.
- Advance "embed the new routing render + slide-left/expand-shrink" — if it's more than a restyle, note as a
  follow-up (the quick advance polish in #23 stands regardless).

## FINAL (once — after as many parts as you can complete)
- Run the floor across the whole stack (tsc 0 · eslint 0 · `next build --webpack`).
- ONE consolidated report: a table (part · branch · hash · what landed / skipped-and-why) + node-harness
  results for every data bug + **one combined Adam click-test list** covering all the UI parts.
- Confirm `git log origin/<each-branch>` has the pushes. Note the merge order for `main`.
