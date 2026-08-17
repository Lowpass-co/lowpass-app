# CC — Payroll has SIX formulas, and the rooming lines are derived from placeholder hotels

Adam, walking Good Neighbours → Coachella: *"the payroll page doesn't match the budget. I also can't add hotel prices and there are like twenty lines. There should only be one summary line with the assumed cost multiplied by rooms. This should be editable still, which would update the estimated nightly cost cell."*

Both reports are correct. The payroll one is worse than it sounds.

**Read this first, because it reframes the gates.** The money harnesses (72 / 27 / 40) pass, and they are right to pass — they test `fees.ts`, and `fees.ts` is correct. **The bug is in the callers that never reach it.** A green harness has been telling us the engine works while six different surfaces compute payroll six different ways. Do not treat harness-green as evidence for anything in this bank.

Confirm every file:line below before planning.

---

## M-1 — Six formulas. The doctrine says one.

`CLAUDE.md`: *"One counting path for money: `fees.countDayStatuses` + `effectiveStatuses`. Every reader through the SSOT; never a second formula."*

| # | Where | What it computes |
|---|---|---|
| 1 | `components/payroll/rateLinesClient.ts:53` — the payroll page | `computeTotals(all canonical types, amount ?? 0)` × effective counts |
| 2 | `server/budget/reconcileDerivedLines.ts:256` — budget derived lines | `computeTotals(rateLinesFor(ctx,id))` × effective counts |
| 3 | `api/budget/payroll/route.ts:187-189` — the persisted `total_fee` column | drops **all** `flat_once`, re-adds `body.advance_fee` |
| 4 | `api/budget/summary/route.ts:162-169` | tour-wide routing counts, **ignores painted days entirely** |
| 5 | `components/budget/TourBudgetAccordion.tsx:1028-1032` | pre-261 arithmetic, no `fees.ts` at all |
| 6 | `lib/export/payroll-data.ts:208,237` | per-week lines with `flat_once` stripped |

1 and 2 are the two surfaces Adam is comparing, and they use the same engine — so the mismatch he is seeing comes from one of the three divergences below, not from the engine.

### M-1a — Blank rate cards read £0 on the page and bill legacy in the budget

The client (`rateLinesClient.ts:42`) synthesises a row for **every** canonical rate type with `amount ?? 0`. The server (`loadRateLines.ts:156-167`) passes only rows that exist in `personnel_rate_lines` — and when there are **none**, silently falls back to the legacy columns:

```ts
const rows = ctx.linesByRateId.get(personnelRateId);
if (rows && rows.length > 0) return buildRateLines(rows, ctx.types);
const card = legacy ?? ctx.legacyByRateId.get(personnelRateId) ?? {};
```

And `payroll/page.tsx:100-116` **auto-seeds a blank rate card without seeding any rate lines.**

So: anyone auto-seeded shows **£0 on the payroll page** and bills `show_rate` + `off_rate` + `rehearsal_rate` + `advance_fee` **in the budget**. That fallback also uses different metas — per-diem as `per_active_day`, Travel billing `['off_travel']` only — so `off` and `pd_only` days behave differently again.

**This is the most likely thing Adam is looking at.** Check Coachella's roster for rate cards with zero `personnel_rate_lines` rows first.

### M-1b — Every day-status paint zeroes the advance fee

`api/budget/payroll/route.ts:187-189` drops all `flat_once` lines — that is **a5 Advance *and* a7 Flat tour** — and re-adds only `body.advance_fee`. But `usePayrollGrid.ts:108,174` never sends `advance_fee`:

```ts
body: JSON.stringify({ tour_id, personnel_id, week_start, day_statuses: statuses })
```

`Number(undefined) || 0 = 0`. So painting a day status rewrites `payroll_entries.total_fee` with the advance **removed**, and Flat tour never in it at all.

**Seven surfaces read that column:** `budget/summary/route.ts:170`, `TourBudgetAccordion.tsx:1035`, `budget-utils.ts:216,222`, `commission-context.ts:96`, `overview-utils.ts:293`, `artist-summary/route.ts:171`, `SummaryView.tsx:221`. Commission is calculated off it.

### M-1c — `/api/budget/summary` ignores painted days

`summary/route.ts:138-142` counts day types straight off `routing`, tour-wide, identically for every person. Three breaks: `press/radio/tv` fold into `offTravel` so they bill Travel when `dayTypeToPayStatus` maps them to `promo_radio`; `off` folds in too so that bucket is always 0; and there is no `assigned` count, so `computeLineAmount` falls through to `counts.active` (`fees.ts:193`) and **per-diem loses every `pd_only` day**.

This is what `SummaryView`, `TourWideCosts`, `CommissionsGrid`, the dashboard snapshot and AI alerts display.

### What to do

**Converge on `fees.ts`. Delete formulas 3, 4, 5.**

- **4 and 5 are pure deletions** — `summary/route.ts` and `TourBudgetAccordion` should read the derived budget lines that formula 2 already writes, not recompute. `TourBudgetAccordion` may be orphaned (its only entry is `TourBudgetAccordionDynamic`, which I found no consumer for) — **verify before deleting rather than assuming**, this codebase has burned people on exactly that.
- **3 is the delicate one.** `payroll_entries.total_fee` is persisted and seven surfaces read it. Either it becomes a cache written from formula 2, or those seven readers move to the derived lines and the column is dropped. **Recommend one and stop for Adam's ruling** — dropping a persisted money column is not a call to make inside a bug fix.
- **M-1a first regardless**, since it is the reported symptom: either seed rate lines when the card is seeded, or make the server path synthesise zeros the way the client does. **The second is safer** — it makes the two paths structurally identical instead of relying on a seeding step to have run.
- `PayrollSummary.tsx` is never mounted and carries a seventh stale formula. Delete it or wire it; do not leave it.

**Extend the harness with pins for each divergence** — a person with a blank rate card, a person with an advance fee whose days get painted, a `pd_only` day, and a `promo_radio` day. The harness passing through all of this is the strongest argument that its coverage, not its correctness, is the problem.

## M-2 — Rooming: twenty lines because there are twenty hotels

**Why twenty.** The rooming grid creates a **one-night placeholder hotel per uncovered night** — `api/budget/rooming/route.ts:290-302` inserts a `hotels` row named by `placeholderHotelName(city, date)` with `check_in_at` = that night. Twenty nights → twenty `hotels` rows → twenty budget lines, because `computeHotelDesired` emits one line per hotel row (`reconcileDerivedLines.ts:86-185`).

**Why the price can't be typed.** Client: `Grid.tsx:1855` blocks `est` on derived sections, with the explicit refusal at `:562-575` (*"Estimates for this line come from Rooming and can't be edited here"*). Server: `line-items/route.ts:442-447` 409s any derived-field update on a row with `hotel_id` or `room_id`.

**The "estimated nightly cost" cell does not exist.** The only nightly figure is `rooms.cost_amount`, per room row. The assumed-rate control Adam remembers is **ephemeral React state** — `RoomingMatrix.tsx:54`, `useState(0)` — never persisted, reset to 0 on every mount, and it only stamps rooms saved *after* you type it (`useRoomingGrid.ts:151`). Changing it retro-fixes nothing.

**Two writers disagree.** `computeHotelDesired` sums per distinct *room*; `GET /api/budget/hotels:200-232` overwrites the same rows with a per-*assignment* sum, so two people in one room count twice. Whichever ran last wins. **A GET that mutates is its own bug** — flag it.

### What to build

**The pattern already exists.** `lib/gear/deriveBudget.ts:13-84` is exactly the shape Adam is describing: `const total = unitCost * qty;` written as `quantity: qty, proposed_cost: total`. Follow it. Hotels currently hardcode `quantity: 1` (`reconcileDerivedLines.ts:369`) and bake nights into the cost — and the label already advertises the room count it refuses to multiply by (`:180`, using `roomCountByHotel` computed at `:114-120` and then discarded).

So: **one line, `quantity` = room-nights, unit cost editable, edit writes back to source.**

### Adam's rulings, 2026-08-14. Both settled — do not re-ask.

**1. Placeholder nights collapse into ONE estimate line. Genuinely booked hotels keep their own line.** Detail where detail exists; one line where it doesn't.

**Do not discriminate placeholders by name.** `placeholderHotelName(city, date)` is a display string, and matching on it is the substring-grep hazard `CLAUDE.md` documents — a real hotel someone names after a city and date would silently vanish into the estimate line. Add an explicit `hotels.is_placeholder boolean NOT NULL DEFAULT false`, set true by the rooming-grid insert at `api/budget/rooming/route.ts:290-302`, and backfill existing rows **by matching the generator's exact output at backfill time only**, not as a runtime rule.

**Then answer the transition**, because it decides whether this stays correct: when a placeholder becomes a real booking — someone renames it, or gives it a cost — the flag must clear and the line must split out of the estimate. Say where that happens. A placeholder that silently stays inside the summary after being booked is the same failure one layer along.

**2. The assumed nightly rate is per tour.** It is a planning assumption, not a fact about a building.

Put it on **`budget_settings`**, which is already tour-scoped and already the home for budget configuration — not on `tours`. Note that migration 264 gated `budget_settings` writes behind `can_access('page','budget.summary','write')`, so writing this figure is correctly a budget-write. Reads stay workspace-wide, which is what you want for a currency-adjacent display value.

The estimate line is then `quantity` = room-nights × `assumed_nightly_cost`, and editing the unit cost on that line writes back to `budget_settings`. That is the "editable, which would update the estimated nightly cost cell" round-trip Adam asked for — the budget line and the rooming header read the same stored number, so they cannot disagree.

**Schema gaps, all confirmed absent:** no `hotels.assumed_nightly_cost`, no tour-level rooming assumption on `tours` or `budget_settings`, no `budget_line_items.unit_cost`, no `hotels.is_placeholder`, and no path that writes a budget edit back to source. A migration is required — write it as paste-SQL and wait.

**The write-back needs an exemption in the `hotel_id` guard** at `line-items/route.ts:442`. Narrow it: unit cost may write through to the source assumption; everything else on a derived row stays refused. Do not widen the guard generally.

---

## Order

M-1a (the reported symptom, no migration) → M-1b (silent corruption of a column seven surfaces read) → M-1c → the formula deletions, after Adam rules on the persisted column → M-2, after Adam rules on both rooming questions.

## Gates

Floor green · **money harnesses 72 / 27 / 40 — and extended.** Any change to a payroll path must add pins, not merely keep the count. Report both numbers and name the pins you added · vitest 538, known RoutingEditor/pdfProbe flake, rerun once · migrations idempotent with down-blocks, paste-gated, **wait for "pasted"**.

**Legacy numbers stay bit-identical where they are correct.** Converging six formulas onto one will change figures on surfaces that were wrong — that is the point — but every change must be attributable to a named divergence above. A figure that moves for a reason you cannot name is a regression, not a fix. Report before/after totals for Coachella specifically; that is the tour Adam is looking at.
