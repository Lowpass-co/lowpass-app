# Master backlog — everything Adam has raised (live tracker)

Single source of truth so nothing's lost. Status: ✅ done+verified · 🔨 in flight ·
📋 queued (ready to prompt) · 🎨 design · 🅿️ parked.

## ✅ Done + Chrome-verified (on branches/PRs)
- Income migrated to canonical `<Grid>` — renders 31 shows, edit recompute, **P&L
  parity** (merged to main).
- Rooming + Payroll matrices rebuilt on `<Grid>` (people-rows/days-cols, wide mode).
- `rowMatches` statusless-row fix (matrices + income render rows).
- Riders **Open** (404 fixed) + **Delete** (operations-nested route).
- **Grid Tab +2** fix (8d39fc0) — verified.
- **Grid copy-paste stale** fix — verified.
- **PAY-01** edits persist across tabs + **PAY-04** Summary==Rates==Days (lift +
  rate-card advance unify) — verified.
- **MTX-06** frozen Total column + **PAY-11** frozen-cell opacity — verified.
- **Grid-v2** interaction pass (formula `=1+1`, fill-handle + hover-ring affordance,
  click/Tab menus, live totals) — merged to main.
- **AI suggestions-gate** — opt-in gate (default OFF, no invasive auto-fire) + rules
  engine + `/api/ai/preferences` + `/api/budget/rules-check` — **merged to main**
  (`af93eb1`). Code-verified.

## 🔨 In flight
- **Merge:** grid-core PR (`fix/grid-core-tab-paste`) + payroll PR
  (`fix/payroll-persist-advance`) — both verified green, awaiting Adam's merge.
- **CC building:** receipt **R-001** generation fix (+ renumber existing dups + UNIQUE)
  & **riders "New rider pack"** button.

## 📋 Queued — clear, ready to prompt (no design needed)
- **Budget Phase 0 — tab/layout polish:** consistent `SUMMARY | EXPENSES | INCOME |
  SETTINGS/GLOBAL` tabs + layout cleanup. (Adam: "make budget more usable.")
- **Polish batch:**
  - MTX-03 — rooming room-code tints all blue/purple → distinct colour per room type.
  - ROOM-01 — rooming **Cards** view ugly → current visuals/buttons/dropdowns.
  - MTX-05 — payroll Days-matrix header crowding (week/date/city overlap) → spacing.
  - Budget — obvious **"Add transaction"** button (not just the row at the bottom).
  - INC-01 — income grid needs **Date · Show/Travel/Off · Venue · City** columns.

## 🎨 Design — needs spec/decisions before code
- **Grid-v2 interaction pass** (Adam approved as its own sprint item): Excel
  **fill-handle** drag-out · **click selects, click-again opens the menu** (rooming +
  payroll) · **Tab moves + auto-opens menu** · **live totals** (MTX-06 live, not
  tab-refresh — needs a Grid controlled-reseed hook) · **spreadsheet formula input** —
  typing `=1+1` evaluates to `2` (not "11"); basic arithmetic in number/money cells.
- **Income redesign:**
  - INC-03 — **Actuals → Settlement** (settlement feeds income actuals) + **projected
    merch/VIP via formula** ($/head × capacity × assumed sellout %), entered in a small
    inputs panel (top/bottom of income).
  - INC-05 — **per-show (per-row) currency** override (EU shows in EUR).
  - INC-04 — **Summary / P&L page redesign** (ugly, hard to parse).
- **Channel list decoupling (CL-01):** channel list becomes a **standalone entity
  linked to** a rider, not nested *within* one. Create one independently → link.
- **Budget versioning epic** (decisions LOCKED — see `BUDGET_VERSIONING_DESIGN.md`):
  - Phase 1 **B1 (data + state + endpoints + guards) — DONE, on main (`04c2cb1`),
    verified LIVE.** Approve→lock, proposed write→`423 VERSION_LOCKED`, actual writes
    pass, unlock→draft, rejected write leaves data untouched — all confirmed against the
    live DB. Migration 212 applied; draft v1 backfilled per tour. (Branch hygiene note:
    CC built B1 on the RAG branch; recovered via clean cherry-pick onto main, no RAG
    contamination.)
  - Phase 1 **B2 (the UI) — prompt ready: `CC_BUDGET_VERSIONING_B2.md`.** Version
    selector + Current pill, read-only-when-locked proposed cells, Unlock-or-New-Version
    modal (catches the live 423), approver-gated approve/unlock/amend controls, income
    grid → `version_income`. Amend + approver-403 get their live verification here.
  - Phase 2 — **audit trail**: cell-level edit history + **user attribution** +
    **right-click cell → history** menu.

## 🤖 AI Assistant track (2nd agent owns build; I coordinate + verify)
Strategy of record: `AI_ASSISTANT_ARCHITECTURE.md`. Three layers — A: private RAG over
own docs (pgvector, per-workspace), B: deterministic rules engine (no AI), C: "the
Community" cross-workspace anonymised aggregates (opt-in, reciprocal, k-anonymity ≥5,
needs canonical venues first). AI already live (6 Haiku endpoints + usage metering).
Build order: (1) **suggestions recommendation surface + opt-in gate + rules engine**
(`CC_AI_SUGGESTIONS_GATE.md`, in flight on `feat/ai-suggestions-gate`; also fixes the
invasive auto-fire in `LineItemDetailPanel`) → (2) private RAG → (3) canonical venues →
(4) the Community. **Route its Chrome-verify through me. Budget versioning waits on
ticket #1 (shared budget surface).**

## 🅿️ Parked / later
- **`<GridExport>`** (the big designed feature): theme-adaptive light/dark · section
  manager (show/hide, full/half-width, drag) · gridded summaries · band/venue/rental
  **supply breakdown** (incl. cable-length + stand-type counts) · movable **notes**
  section · all controls grouped. (Parked until grids smoked — grids now largely
  smoked, so this is un-parkable soon.)
- **Hot-shot device** (channel list): a Radial HotShot pedal flag on a channel that
  **+1's the XLR/cable count**; feeds the export production summary. Future feature.
- Section-gutter for budget/rooming/payroll row-group sections (left-gutter labels).
- Payroll: `internal_rate` rate-card slide; `acl_per_diem`; branded payroll PDF;
  actual-side surfaces still bake in per-week advance (post-unify follow-up).

## ❓ Open with Adam (quick confirms, not blockers)
- Confirm **Ben's £1,000 rate-card advance** is expected (his £7,000 total).
- **P0 budget crash** (Good Neighbours / South Africa) — not reproduced; watch + grab
  the console/Vercel trace if it recurs.
