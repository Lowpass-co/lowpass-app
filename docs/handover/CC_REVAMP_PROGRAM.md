# CC — Lowpass revamp program (Adam's full-app pass, 2026-07). The backlog of record.

This captures EVERY item from Adam's app-wide review. It is **not** one CC run — it's a sequenced program.
Work the phases in order; inside a phase, each part is its own branch + commit + push + verify. **Do the
systemic Phase 1 before the per-surface Phase 2** — most "ugly / blocky / like a window / too ASCII / duplicate
chrome" complaints are ONE shared-chrome problem, and fixing it once lifts payroll, rooming, channel-list and
the matrices together.

Prereq: the venue stack (`feat/advance-venue-autofill`, parts 1–4) + the routing-city fix
(`CC_ROUTING_CITY_FIX.md`) land on `main` first. Branch everything here off the updated `main`.

> ## ⚙️ PROTOCOL (every part)
> Check the real files first (cite file:line) → build → keep the floor green (tsc 0 · eslint 0 ·
> `next build --webpack`) → for UI, hand Adam a numbered click-test (UI is verified live by Adam, don't defer
> for lack of a headless proof) → commit + PUSH + confirm `git log origin/<branch>` → report hash + evidence.
> Tokens only (`var(--lp-*)`). Don't regress merged work. Stop + flag only on a real fork.
>
> Tags: **[BUG]** broken, fix. **[DESIGN]** visual/UX. **[FEATURE]** new. **[VERIFY]** confirm in code first.
> **[DECISION]** needs Adam. **[ASSET]** needs Adam to supply. **[LOCK]** design-lock (mock→approve) before build.

---

## PHASE 0 — Bugs (fast, batchable, high-trust). Branch `feat/revamp-bugs`.
Knock these out first — low risk, high momentum. Each is a real defect Adam hit.
- [BUG] Budget · Expenses — section reorder says "cannot save reorder"; persist the reorder.
- [BUG] Budget · Expenses — changing the artist logo errors "violates row rule" (likely an RLS/CHECK or the
  hex-alpha row guard). Diagnose + fix so the logo saves.
- [BUG] Budget · Expenses — "Approve & lock" only takes effect after a manual refresh; update state optimistically.
- [BUG] Budget · Income — CAP renders as a **currency amount**; cap is a ticket **count**, no £/$.
- [BUG] Budget · Income — currency symbol shows on every cell; it should appear **only on locked cells**
  (editable = plain number). Confirm the locked-vs-editable formatting split.
- [BUG] Budget · Income — Guarantee doesn't carry into Actual; it should seed the actual value.
- [BUG] Budget · Income — Fee % is **inverted** (100% reads as $0, 0% as full). Flip the semantics so 100% = full.
- [BUG] Rooming — Nights view "in → out" dates are wrong (both show the same day); out = **next day** per night.
- [BUG] Rooming — export counts two SGL rooms as one room; each single is its own room in the count.
- [BUG] Advance — Complete / Pending / Overdue tiles don't reflect real state; wire them.
- [BUG] Advance — "Send packet" does nothing; wire it (or flag the missing backend + STOP).
- [BUG] Operations/Routing (+ others) — duplicate "Live" tag: the shell already shows Live top-right; remove the
  per-surface redundant Live pills (routing has one; audit the others).
Smoke: per-item repro (node harness for the data bugs; Adam click-test for the UI ones).

## PHASE 1 — Systemic design (fix once, lifts everything). Branch `feat/revamp-chrome`.
The recurring "ugly / blocky / little window / too ASCII / duplicate chrome / weird mono" notes are shared-shell
issues. Resolve them as shared patterns, not per-surface.
- [DESIGN] **Grids feel like a boxed window, not part of the page** (payroll, rooming, income, channel-list).
  The bordered black card container floats. Rework the shared grid chrome so grids sit ON the page surface —
  lose the heavy outer border/black box, align padding + background to the page, keep the token density. One
  shared change to the grid wrapper, applied everywhere.
- [DESIGN] **Matrix cells too blocky/ASCII** (rooming, payroll days-matrix) — soften to the app's token
  language (the income grid is the reference for "right"): proper cell padding, hairline `--lp-border-subtle`,
  the day-type/status colours, mono only for numerics — not for labels.
- [DESIGN] **Mono overuse** — mono is for numerics (`.lp-mono`) only. Strip mono from labels/headings where it
  reads "weird" (Adam flagged Advance especially).
- [DESIGN] **Header formatting** on the payroll matrix (and siblings) is wrong — align to the canonical grid
  header treatment.
- [DESIGN] **Duplicate chrome** (see Artist Home in Phase 3, but the shell rule is here): the product nav should
  render once. Audit `ProductHeader`/`TopProductNav`/product-card duplication.
Smoke: before/after screenshots (Adam eyeballs); the grids read as one family and sit on the page.

## PHASE 2 — Per-surface functional upgrades. One branch per surface, in this order.

### 2a. Routing (URGENT — Adam). `feat/revamp-routing`
Already partly covered (venue-aware grid + city fix). Finish the "feel like the rest of the app" pass:
remaining restyle to Phase-1 chrome, remove the duplicate Live pill, confirm the venue-first + city work reads
clean. This is the flagship — get it right.

### 2b. Tour Personnel. `feat/revamp-personnel`
- [DESIGN] More info at a glance; more grid-like (it's a sparse list now). Denser, token-aligned rows.
- [BUG/DESIGN] Manage slide-over has **duplicate rate entry** (the single Rate field + the Show/Travel/Per-diem
  rates block). Collapse to one rates model.
- [FEATURE] Support **more rate types** (not just the fixed few) — align with what payroll needs (see 2e).
- [BUG] Role tag list is missing **BAND** — add it.
- Swap is good — leave it.

### 2c. Channel list. `feat/revamp-channel-list`
- [BUG] Not editable — make it editable on the canonical grid (dropdowns where needed: mic/DI, phantom, etc.).
- [DESIGN] Kill the "edit in rider" coupling — channel list rides as its own thing; edit it in place.
- [BUG] In the Rider surface there's no way to add OR edit a channel list — add that path (it references the
  same channel-list data).
- [VERIFY][FEATURE] Grid-based **patching menu** (dLive / LV1 style — input↔physical patch). Adam: "I'm sure we
  already built that." **Grep the codebase first** (stage-IO / patch / stage_boxes) — if it exists, wire it in;
  if not, flag scope before building.

### 2d. Stage plot. `feat/revamp-stage-plot`
- [ASSET] Drum icons are still bad — Adam has good reference images (lost to context). **Ask Adam to re-send
  the drum icon references**; rebuild the drum icon set from them. Do not proceed on drums without the assets.
- [BUG] Scale is wrong — the ft grid → canvas mapping needs fixing so a plotted kit is true-to-scale.
- [BUG] Labels default ON — change default to **OFF**.
- [DESIGN] Tick boxes in the Stage panel aren't branded — use the `.lp-checkbox` brand checkbox.
- [BUG] Export doesn't match the builder canvas — the exported PDF must represent the on-screen plot faithfully
  (this is the `buildStagePlotSvg` path from the stage-plot export work — reconcile builder vs export render).

### 2e. Payroll (restructure). `feat/revamp-payroll`
- [DESIGN] Same Phase-1 chrome fix (part of page, not a window).
- [BUG/DESIGN] "Rates & totals" doesn't look editable but should be — make the edit affordance clear.
- [FEATURE] Show **all rate types** that exist on the personnel form (not a fixed subset).
- [DESIGN] Days-matrix is cramped/small — give it room; fix header formatting.
- [DECISION→BUILD] Adam's proposed structure: **collapse the confusing three tabs into a Rates/Summary page
  with two grids** — one grid to edit rates (+ advance etc.), one grid above/below for summary/totals. Build
  this two-grid layout; retire the redundant rate-editing-in-two-places.

### 2f. Rooming. `feat/revamp-rooming`
- [DESIGN] Phase-1 chrome (blockier/prettier/modern, less ASCII) — especially the Nights view table.
- [BUG] Nights in/out dates (also in Phase 0) — out = next day.
- [DESIGN] S / D / T abbreviations → spell out (Single / Double / Triple); no reason to abbreviate.
- [DESIGN] Unassigned hotel → default the label to **city / country** when no hotel name.
- [BUG] Export room-count (also Phase 0) — two singles = two rooms.
- Cards view is fine — leave it.

### 2g. Riders. `feat/revamp-riders`
- [DESIGN] The rider **manager** is blocky/old and feels unnecessary as a separate thing — fold it into the
  rider menu that opens on click (build the manage affordance into the rider detail, not a separate surface).

## PHASE 3 — Big pieces (design-lock or scope-map FIRST, then build).
These are features/redesigns too large to blind-build. Each needs a mock or Stage-A map approved before code.
- [LOCK] **Budget · Summary → customizable card dashboard** (Adam: "full overhaul, customizable with cards").
  This is issue #29 — a Stage-A map exists (`CC_PNL_DASHBOARD_STAGEA.md`). Adam + Claude lock the card design
  (mock → approve) → then build Phase 1 (bricks, show/hide/reorder) → later persistence. Presentation-only over
  `computeBudgetPnl`.
- [LOCK][FEATURE] **Artist Home revamp** (see notes): kill duplicate chrome (Ops/Budget/Advance appears 3×);
  move routing to the TOP (not the middle); keep New Releases; replace the rest with better info/nav — likely
  customizable cards (converges with the workspace/artist design iteration already in flight). Design-lock the
  card set with Adam first.
- [FEATURE][DESIGN] **Files → real file manager**: cards act as folders; rows = files with editable context
  (notes, tags); assign files to people/shows so they surface under the show in Advance (and vice versa — tech
  packs, deal memos); searchable. Scope-map first (data model for file↔show/person links) — flag as a
  Stage-A before build.
- [DECISION][FEATURE] **Advance AI parser** (big): ingest 1–N riders, infer which show each belongs to, add it,
  flag low-confidence; for each AI-filled field, show the **source quote highlighted** where the AI got it.
  This needs a design + cost + model plan (RAG/extraction, provenance highlighting) — Stage-A map + Adam
  sign-off before build. Do NOT start blind.
- [DESIGN] **Advance detail pass** (smaller, can go without a full lock): swap the out-of-date left routing list
  for the **new routing render** (full-focus on landing, slides left + expand/shrink on click); drop the weird
  mono; "Complete" heading is oversized vs siblings — normalize; reformat the venue-specs panel on the right.
  (The Complete/Pending/Overdue + Send-packet wiring is Phase 0.)

## PHASE 4 — Deferred / confirmed-fine (no action unless Adam changes his mind)
- Operations · Summary — Adam: "not useful, I'd never use this, I always navigate elsewhere." **Decision:**
  either (a) make it a genuinely useful at-a-glance/action surface, or (b) demote it (don't default to it).
  [DECISION] — ask Adam which before spending effort; don't polish a page he won't use.
- Work Home — cards / activity / resume-budget all fine. No change.
- Budget · Settings — mostly fine; the only real ask is **FX rate should be live** (why enter manually) —
  this converges with the Live FX work already on `main`; wire the settings FX to the live rate rather than a
  manual field. [VERIFY] against the merged Live FX.
- Channel-list, Files "fine" items — captured above.

---

## Needs from Adam before the relevant part can build
- [ASSET] Stage-plot **drum icon reference images** (2d) — re-send; lost to context.
- [LOCK] Card designs for **Budget Summary** and **Artist Home** (Phase 3) — mock → approve with Claude first.
- [DECISION] Operations Summary — improve vs demote (Phase 4).
- [DECISION] Advance **AI parser** — confirm scope + cost model (Phase 3) before any build.
- [SCOPE] Files manager data model (Phase 3) — Stage-A map for review.

## Suggested order
Phase 0 (bugs) → Phase 1 (systemic chrome) → 2a routing → 2c channel-list + 2e payroll + 2f rooming (the grid
family, now on the Phase-1 chrome) → 2b personnel → 2d stage plot (once drum assets arrive) → 2g riders →
Phase 3 locked pieces (summary cards, artist home, files, AI parser) as each design/scope is approved.
