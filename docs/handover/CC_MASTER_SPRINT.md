# CC — MASTER SPRINT (one long autonomous run). Parts 1→7, in order. Branch off `main` (after Export v2.1 lands).

A single long sprint to run unattended. **Prerequisite:** the Export v2.1 batch must be merged to `main`
first (you need the shell + reworked xlsx + the v2.1 editor). Branch Part 1 off `main`; each later part
stacks on the prior branch. Work Parts **1→7 in order**.

> ## ⚙️ PER-PART PROTOCOL — do ALL FIVE steps for EVERY part. This is the point of a long unattended run.
> 1. **CHECK THE CODEBASE FIRST.** Read the REAL affected files before writing — map the area, cite the
>    files/lines you're building on. Never assume a shape; open it. (The `show`-vs-`visible`, the routing
>    `workspace_id` bug, the em-dash — all were found by reading/reproducing, not assuming.)
> 2. **BUILD** the part.
> 3. **THOROUGH SMOKE — not just `build` green.** Prove it works with a **functional reproduction**: a node
>    harness or a real code-path exercise (like the routing/excel/em-dash repros), checking the feature does
>    what's asked AND the invariants hold. `tsc` 0 · `eslint` 0 · `next build --webpack` green is the floor,
>    not the proof. Write the smoke IDs in `budget.md`.
> 4. **PUSH + REPORT** — commit, push, confirm `git log origin/<branch>` has the hash; report the hash +
>    the smoke EVIDENCE (what you reproduced, what the numbers were), not just "done".
> 5. **CONTINUE** to the next part. Only **stop + flag** if a real blocker or an ambiguity that risks an
>    invariant appears — otherwise keep going to Part 7.
>
> ## INVARIANTS (hold for every part)
> - **Presentation-only** — numbers always from `computeBudgetPnl` / pure `fees.ts`; never recompute or
>   mutate source data. Reconciliation + DEFAULT-config-byte-for-byte stay green.
> - **Read-only + workspace-RLS** on exports; a foreign-workspace tour 404s; financial/PII never leaks.
> - **Shared shell stays generic** (budget/rooming/payroll/routing/channel-list/stage-plot all reuse it).
> - Tokens (`var(--lp-*)`); no hardcoded hex.
> - Don't regress: income/versioning/receipts, the export render + fixes, the v2/v2.1 work.

---

## PART 1 — Channel List export (5th surface). ✅ DONE — `feat/export-channel-list` @ `b4bb4c5` (merge to main).
_(Built ahead of the sprint via the standalone prompt. Verified clean FF on main, 11 files, surface-only. The
spec below is retained for reference; skip to Part 2.)_
### (original spec) Branch `feat/sprint-channel-list` off `main`.
Check: `channel_list_rows` (mig 040) + outputs (098/115) + `stage_boxes`/stage-IO (043/046); the
channel-list page loaders.
Build a tabular export surface, same pattern as rooming/routing:
- `loadChannelListExportData(tourId)` (channel · source · mic/DI · stand · phantom · output/mix · notes).
- `buildChannelListBodyHtml(data, config)` — a clean branded input-list table; config-driven sections/style.
- Routes `…/channel-list/[tourId]/export/{pdf,preview}` + add `'channel-list'` to `/api/export/xlsx`.
- `ExportSurface` union + `CHANNEL_LIST_SECTION_IDS` + `DEFAULT_CHANNEL_LIST_CONFIG` + `normalizeConfig`
  branch + the shared orange `ExportButton` on the channel-list page.
- The xlsx for this surface must be CLEAN (engineers reuse it) — the v2.1 ExcelJS path.
Smoke `EXP-CHAN-01..` — table matches the channel-list page; xlsx columns clean.

## PART 2 — Stage Plot export (6th surface). Branch `feat/sprint-stage-plot` off Part 1.
**Decisions (locked by Adam):** start fresh (don't reuse the old `dev-pdf`/`pdf-render.ts`); content =
the diagram with an **"include input list" toggle** (toggle on = diagram + the channel/input list beneath =
the combined doc; diagram-only otherwise). Unified shell.
Check: `StageCanvas.tsx` (it's **SVG**), `stage_plot_items` + `stage_plots` (mig 109/110), the icon catalog
+ `/api/stage-plot/icons`. First confirm the stage-plot **editor is complete enough to export** (it was
parked-then-built); if it's clearly half-finished, flag it and still build what renders.
- **Render approach — RESOLVED by the Stage-A map (`EXPORT_STAGEPLOT_MAP.md`), signed off:** a pure,
  server-safe `buildStagePlotSvg(plot, items)` ALREADY EXISTS at `pdf-render.ts:40–101` (React-free,
  reconstruct-from-data, currently used by dev-pdf). **Extract it to a new server-safe module
  (`stageplot-svg.ts`), point the new export at it, wrap in the unified shell, then DELETE the rest of the
  old `pdf-render.ts` + the `dev-pdf` route.** `StageCanvas` does NOT import it, so the extraction can't
  touch the live editor. Reuse + retire — do not leave a parallel copy. Icons inline (built-ins = code
  constants; custom = `stage_plot_custom_items.svg_content` via `registerCustomIcons()` pre-build) — no
  external fetches in Chromium.
- **Signed-off map decisions:** shell letterhead supersedes the plot's own title bar (TM contact → header
  notes); Excel = input-list-only when that section is on, no-op for diagram-only; routes key on `plotId`.
- `loadStagePlotExportData(plotId)`, the two sections (`stage-diagram` + `input-list`), the route + button
  (mount on `/artists/[id]/stage-plots/[plotId]` + `/operations/[tourId]/stage-plot`).
- Excel: plot has no Excel form → Excel exports the input list only (or disabled for diagram-only).
Smoke `EXP-PLOT-01..` — the diagram renders to PDF; the input-list toggle adds/removes the table.

## PART 3 — Two-bar nav + budget chrome polish (#27). Branch `feat/sprint-nav` off Part 2.
Check: `shell-v2/TopProductNav.tsx`, `ProductSubBar.tsx`, `ProductHeader.tsx`,
`budget/versioning/VersionSelector.tsx`, `budget/BudgetStatsStrip.tsx` + `BudgetBurnBar.tsx`.
- **Top-bar dropdowns:** whole button = the hover/click target; **animate** open/close (roll/slide);
  **forgiving close** (hover-intent / delay) — they currently snap shut too fast with a too-small target.
- **Version actions from the chip:** the sub-bar version chip opens the `VersionSelector` approve/unlock/
  amend menu directly (not only from Settings).
- **Kill the triple-bar / "Remaining" redundancy:** collapse the stacked Remaining strip + burn bar + stats
  into a single clean status line; remove the duplicated "Remaining $X / of $Y".
Smoke `NAV-POL-01..` — dropdown stays open across the gap; chip opens the version menu; one status line.

## PART 4 — P&L → brick dashboard, **Phase 1** (#29). Branch `feat/sprint-dashboard` off Part 3.
Check: `budget/BudgetSummaryTab.tsx`, `api/budget/summary/route.ts`, `computeBudgetPnl.ts` (the PnL pairs +
`incomeBreakdown` = the brick data palette).
Phase 1 = the editor *shape*, no persistence:
- Render today's Summary content as **discrete bricks** (typed cards reading `computeBudgetPnl`):
  `pnl-net`, `gross-income`, `total-expenses`, `expense-by-section`, `variance`, `per-show-pnl`, `burn-rate`
  — derive from what `computeBudgetPnl` already returns.
- **Show/hide + drag-reorder** the bricks (mirror the export template-builder's section model — familiar,
  proven). A `DashboardConfig` (in-memory in P1, no DB). **Presentation-only** — bricks NEVER recompute;
  numbers from `computeBudgetPnl`. DEFAULT layout = today's Summary content, unchanged.
- Defer persistence/save-as-template to Phase 2 (note it).
Smoke `DASH-01..` — default layout = today's Summary; hide/reorder a brick changes the view; Net unchanged.

## PART 5 — Routing **Map view** (completes the v2.1 stretch). Branch `feat/sprint-routing-map` off Part 4.
Check: the v2.1 routing export (`routing-pdf.ts`, the List/Calendar/Map/Both toggle already wired to a
placeholder) + the routing lat/lng (mig 009).
- Render a **static route map** for the Map / Both views: plot the routing stops (lat/lng already loaded) +
  the legs. **Cost-hardened — NO per-render live Google calls**; use a static-map image (a static-map URL
  built once, or a cached/self-rendered SVG of the points on a simple basemap). If a paid static-map key
  is needed, **render a clean SVG dot-and-line map from the lat/lng instead** (no external dependency) and
  flag that a richer basemap is a later upgrade.
Smoke `EXP-ROUTE-MAP-01` — Map/Both renders the stops + legs (not a placeholder); no live API calls.

## PART 6 — Live FX (#currency 2.5). Branch `feat/sprint-live-fx` off Part 5. **MAP-THEN-BUILD + FLAG.**
Adam's spec: "currency should be **live until the transaction/actual, then it LOCKS** — RED until fixed,
then blue/locked." Check: `budget/fxRates.ts` + `budget/fx.ts` + `budget_fx_rates` (mig 216) +
**the existing `/api/budget/exchange-rate/route.ts`** (a live-rate source ALREADY EXISTS — use it, no new
FX vendor) + the income actual/settlement path (`income/route.ts`, the actuals).
- **Map your approach first** (a short note at the top of the commit): the lock trigger + storage.
- **Build (conservative):** a per-show FX rate that is **LIVE (from the exchange-rate route) + shown RED**
  while the show is projected/un-settled, and **LOCKS to the rate at lock-time + shown blue** once the
  show's **actual/settlement lands** (the natural "transaction date"). Store the locked rate on the row so
  it never moves after. Missing rate → 1:1 (never zero). `computeBudgetPnl` keeps totalling in tour
  currency; the locked rate feeds it for settled shows, the live rate for projected.
- **FLAG the lock-trigger assumption explicitly for Adam** (lock-on-actual vs lock-on-show-date) — it's a
  product call; build the lock-on-actual version and surface the choice in your report.
Smoke `FX-LIVE-01..` — a projected show shows a live red rate; entering its actual locks the rate (blue);
the P&L total uses the locked rate after; missing rate = 1:1.

## PART 7 — Opportunistic cleanup. Branch `feat/sprint-cleanup` off Part 6.
- **Delete `src/components/_legacy/sidebar/`** — confirmed zero CODE importers (only docs reference it);
  re-verify with a grep, then remove.
- Remove any other **confirmed-dead** export code (e.g. a lingering retired `ExportDialog` if Part-A/v2.1
  fully replaced it) — **grep importers first; only delete with zero importers.**
- Do NOT touch the documented leaky `src/_legacy/budget/` (load-bearing per CLAUDE.md).
Smoke: `tsc`/`eslint`/`build` green after each deletion (proves nothing imported it).

---

## Final
- Each part: branch as named, commit + PUSH, report the hash + smoke evidence, continue. Stacked branches FF.
- Migrations: Parts 1–6 add NO migration (config in `export_templates.config` jsonb; Live FX stores the
  locked rate — if it genuinely needs a column on `budget_income`, re-confirm the next free number [224 is
  high-water] and add it idempotent with a down-block; otherwise jsonb/existing columns).
- If you finish all 7, report a single summary table (part · branch · hash · what landed · smoke evidence)
  + the two flags (stage-plot render approach used; Live FX lock-trigger assumption).
