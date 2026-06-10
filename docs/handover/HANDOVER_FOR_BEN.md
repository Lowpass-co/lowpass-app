# Lowpass grid overhaul — handover (for Ben)

Hi Ben. This is how Adam + the AI team have been running the grid overhaul, what's
canonical, how we keep errors out, and where things stand. Read this top to
bottom; the **Coworkcd ~/Documents/lowpass-app**

**git add docs/handover/HANDOVER_FOR_[BEN.md](http://BEN.md) docs/smoke-tests/SMOKE_[QUEUE.md**](http://QUEUE.md)

**git commit -m "docs: team handover for Ben + Cowork handover + rooming smokes"**

**git push handover** at the end is written for the next Claude.

---

## 1. What the project is

We're replacing every bespoke spreadsheet/table in Lowpass with **one canonical
grid component**, used everywhere — so look + behaviour are defined once and can't
drift. "The grid view for the app, for everything": Budget, Rooming, Payroll,
Channel list, and later Income/settlements.

Two pillars hold it together:

- `**<Grid>` + `<GridSlideOver>`** (`src/components/grid/`) — the canonical
spreadsheet (keyboard nav, range select, copy/paste, undo, reorder, the
slide-over). Every tabular surface mounts this.
- `**<RoutingRail>**` (`src/components/routing/`) — the shared "days on the left"
rail (date · city · day-type pill). Anywhere days are indexed (Advance, Payroll,
Rooming) it renders identically. **Days never move to the top for one screen.**

## 2. The team + the loop

- **Adam** — product owner. Runs git + Claude Code, does the **final manual
smoke**, makes product calls, holds the true UI state in his head.
- **Ben (you)** — assistant.
- **CC = Claude Code** — the coder. Writes/edits the actual app code. **Cannot
click-test** the running app (it's auth-gated) — it only builds + type/lint-checks.
- **Claude / Cowork** — design, writes the CC build prompts, and **live-verifies
CC's work in a real browser** (see §6). This is the assistant Adam's been
talking to.

**The cycle for every surface:**

1. **Design** in chat (often visual mockups) → captured in `GRID_SURFACES_DESIGN.md`.
2. Claude writes a **gated CC prompt** (`docs/handover/CC_*.md`).
3. CC does **Stage A — map** the real schema/code (NO code), surfaces decisions →
  we answer → CC does **Stage B — build**.
4. CC self-verifies (`tsc 0 · eslint 0 · next build --webpack green`) + pushes.
5. **Claude Chrome-verifies** on the Vercel preview — the bugs CC can't see.
6. **Adam manually smokes** the bits Claude can't drive (file uploads, money flows)
  — tracked in `docs/smoke-tests/SMOKE_QUEUE.md`.
7. Merge to `main`.

## 3. What's canonical (the source-of-truth docs)

Always check these before assuming anything:

- `**docs/handover/GRID_OVERHAUL_STATUS.md`** — the live status audit (what's
BUILT vs DESIGNED vs open follow-ups). **Start here.**
- `**docs/handover/GRID_SURFACES_DESIGN.md`** — the design spec for every surface
(rooming 3-view, payroll parity + verified fee formulas, channel-list Option A,
the export builder) + the **EVERYTHING-RELATES** core principle.
- `**docs/prototypes/GRID_SPEC.md`** + `grid-playbox.html` — the canonical grid
spec + drive-able reference.
- `**docs/handover/CC_*.md**` — the build prompts (one per surface/pass).
- `**docs/handover/*_MAP.md**` — CC's Stage-A maps (budget, routing-rail, rooming)
— the verified schema before each build.
- `**docs/smoke-tests/**` — per-surface smoke checklists + `SMOKE_QUEUE.md`
(Adam's manual list).
- `**CLAUDE.md**` (repo root) — hard codebase conventions (read it; see §5).

Canonical CODE: `src/components/grid/*` (Grid, GridSlideOver, types, gridModel),
`src/components/routing/RoutingRail.tsx`, `src/lib/grid/budgetAdapter.ts` (the
adapter pattern: pure DB↔grid mapping), `src/components/budget/BudgetGridView.tsx`,
`src/components/rooming/RoomingView.tsx` (+ `useRoomingGrid`).

## 4. The thought process / mentality

- **Everything relates.** `routing` (the day model) is the **anchor**; budget,
rooming, payroll, advance are **bridges** off it. Add-a-week extends routing →
ripples to every surface + the budget. The UI should make that ripple visible.
- **Map both sides of a bridge before crossing it.** Don't write code against an
unmapped schema — that's why prompts are gated Stage-A-first.
- **Structure is persistence.** Get the topology + the canonical components right;
surfaces become "the grid + a config".
- **Restructure > rebuild.** Rooming, payroll, channel list already exist as
mature surfaces — we re-skin/restructure them onto the canonical grid, we don't
rebuild from scratch (lower risk, keeps the smart features).

## 5. How we avoid errors (hard-won)

- **Gated, map-first prompts.** Stage A maps the real tables/components + surfaces
decisions; Stage B builds only after sign-off. Caught a `source_entity_type`
CHECK drift that was the real cause of OPS-17 (payroll never reaching the budget).
- **Verify before claiming.** CC must name the exact files/lines it changed and
mark "build-verified" vs "needs-live". We never trust a "done" without it.
- **Chrome live-verification is non-negotiable.** CC reads code; it cannot see
runtime. Live checks caught: the dead `**--lp-orange`** token (the real token is
`--color-lp-orange`; an undefined var silently killed the selection ring + drag
line), the **status filter** hiding all `draft` rows, the **currency totals**
rendering in USD while cells were GBP. None were visible in code.
- **CC over-claiming guard.** CC has reported things "done" that weren't. Always
open the diff / verify the live result before merging.
- **Don't dirty real data.** When testing in the live app, clean up after (delete
test transactions, reset values).
- **Migration discipline** (`CLAUDE.md` §migrations): new migrations start at the
**200 block**, sequential, idempotent, RLS via the existing helpers, down-block.
⚠ The `npm run db:migrate` runner currently **can't auth** (`DATABASE_URL`
password) — migration 208 was applied by hand in the Supabase SQL editor. Fix
the runner or keep using the SQL-editor route.
- **Other CLAUDE.md rules:** all visual values via `var(--lp-…)` tokens (no
hardcoded hex/size/z); build **only** via `next build --webpack` (Turbopack
hangs on the Drive FS); never import from `_legacy/`; hex+alpha or `color-mix`
for orange tints (never JS string-concat of CSS vars).

## 6. Chrome access (how Claude checks work without CC being able to)

Claude has the **Claude-in-Chrome** extension paired to Adam's browser. That means
it can, on the **Vercel preview** of the working branch (Adam's logged-in session):

- navigate, screenshot, click, type;
- run JavaScript in the page (read `getComputedStyle`, resolve CSS vars, inspect
the DOM, fetch the served CSS);
- drive real interactions (open a slide, add/delete a transaction, flip a toggle)
and confirm the result.

This is the bridge over CC's blind spot. The preview URL pattern is the
branch-aliased Vercel deploy; always confirm the deploy's commit is fresh before
trusting a smoke (a stale preview wasted a whole cycle early on).

## 7. Where things stand (snapshot — see GRID_OVERHAUL_STATUS.md for live)

**Built + Chrome-verified:** canonical Grid core, **Budget** (Grid is the default
view, currency↔DISPLAY, slide txn/doc CRUD, receipts, delete affordance), the
**shared RoutingRail** (Advance retrofit), **Rooming** (3 views on the rail).
Migration 208 applied (fixed OPS-17 salary population).

**Designed + prompted, NOT built yet:** **Payroll** (next — `CC_PAYROLL.md`,
restructure + the OPS-17 fee-math fix), **Channel-list re-skin** (`CC_CHANNEL_LIST.md`,
Option A — preserve every feature: mic search, the 5 inventory counters, outputs,
stage-box/sub-snake mgmt, the stage-plot link), the **section-gutter**, and the
`**<GridExport>`** (v7 design signed off, **PARKED** until all grids are built +
Adam-smoked). Budget **Reports** tool is separate + later.

**Open follow-ups:** in `GRID_OVERHAUL_STATUS.md` (budget BUD-48 smoke, OPS
personnel items, the migrate-runner auth, the everything-relates day-model work).

---

## Cowork handover (for the next Claude)

You're continuing a multi-surface grid overhaul in Cowork mode. You have: file
tools on the connected repo, a Linux bash sandbox, Claude-in-Chrome paired to
Adam's browser, and the Vercel preview of `feat/personnel-unify` / `main`.

**Your job:** design surfaces, write **gated CC build prompts** (`docs/handover/CC_*.md`),
and **Chrome-verify CC's pushes** on the preview — because CC can't click-test the
auth-gated app. You are the runtime conscience.

**Working rules:**

- Start every session by reading `GRID_OVERHAUL_STATUS.md` (status) +
`GRID_SURFACES_DESIGN.md` (designs) + `CLAUDE.md` (conventions).
- Prompts are **gated**: Stage A (map real schema/code, no code, surface
decisions) → review → Stage B (build). Never let CC guess schema.
- Demand **verify-before-claiming** in every prompt; then **Chrome-verify
yourself** — resolve CSS vars, inspect computed styles, drive the interaction.
Don't trust "build green" as "works".
- The recurring failure mode is **runtime bugs invisible to code-read** (dead
tokens, wrong filter defaults, currency/display mismatches, schema drift). Probe
them live.
- Don't dirty Adam's real data; clean up test edits.
- Keep `GRID_OVERHAUL_STATUS.md` + `SMOKE_QUEUE.md` current as you go.

**Next pieces of work, in order:** Payroll (`CC_PAYROLL.md`) → Channel-list re-skin
(`CC_CHANNEL_LIST.md`) → section-gutter → Adam's full manual smoke → un-park
`<GridExport>` (build on channel list first). Verify the payroll **fee math against
Adam's real sheet numbers** (Richie $4,611 · Duncan $1,607 · Jake $2,250 · Adam PD
$167) — that's the OPS-17 fix and the highest-value check.

**Canonical invariants to never break:** the day model = `routing` (the anchor);
`<RoutingRail>` is days-on-left everywhere; `var(--lp-orange)` resolves (alias to
`--color-lp-orange`); migrations 200+; build via `next build --webpack`; restructure
existing surfaces, don't rebuild.