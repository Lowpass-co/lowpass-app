# Settlement + Actuals — one truth per show (2026-08-06)

**Brief (Adam, verbatim):** "the 'Actuals' income sheet is essentially a settlement sheet but complicated. Can we work out a better way to do proposed income vs actual income. And make sure the settlement sheets are as fully fledged and pretty as ATOM's settlement sheets."

**Sources:** `src/components/settlement/SettlementWalkClient.tsx`, `src/app/(app)/budget/[tourId]/settlement/page.tsx`, `src/app/api/budget/settlement/route.ts`, `docs/design/COMPETITIVE_ATOM_INTERNALS_2026-07-19.md`, `database/migrations/003_seed_advance_templates.sql`, `docs/handover/ROADMAP_2026-07.md`. *Snapshot caveat:* `ATOM_TEMPLATE_CATALOG_2026-08-06.md`, `src/lib/settlement/loadWalk.ts`, `src/lib/settlement/walk.ts`, `src/lib/budget/actualsProvenance.ts`, the lines/PDF sub-routes and the Budget · Income grid component are not in this upload — behaviour inferred from their call sites and comments; the 22-field Settlement section is reconstructed from the brief's own enumeration plus our 9-field seed in mig 003. Verify field-by-field against the catalog before build.

---

## 1. CURRENT STATE

**The settlement surface** is `/budget/[tourId]/settlement` (`page.tsx` → `SettlementWalkClient`, M1-B, mig 243). Left: shows list where a past show without `full_and_final` gets an amber border and a "Due" tag — a proto catch-up queue with no checkboxes, no batch action, no counts. Right: the Walk — `Guarantee → itemized deductions (withholding | tax | venue_cost | commission | other) → Adjusted gross → itemized expenses → Show net → +overage +merch → Artist total → −deposit_received → Balance due → −payments (wire/check/cash/ach, paid_on) → Outstanding`, with a Full & Final checkbox (sets `full_and_final` + `status:'reconciled'`) and a per-show Export PDF. Itemized lines persist via `/api/budget/settlement/lines`; on any deductions change the client pushes Σ into `reconciled_deductions` so the income cascade carries the itemized total unchanged.

**A settlement row** (`settlement` table, upsert on `routing_id`) carries **two grains of the same five figures**: `day_of_{guarantee,overage,merch,deductions,net,tickets_sold,gross,signed_by,notes,file_url}` and `reconciled_{same + notes, reconciled_at}`, plus `deal_memo_text/file_url`, `deposit_received`, `full_and_final`, `status`. `*_net` is server-computed (`g + o + m − d`, math spec §12).

**Where proposed income lives vs where actuals land:** both in `budget_income`, one row per `routing_id`. The proposed side is the per-show columns the Budget · Income tab grid edits (guarantee, overage, merch, VIP, capacity, currency — this grid is the "Actuals" income sheet Adam means; the rail names it Income). The actual side is `actual_{guarantee,overage,merch,deductions,tickets_sold,gross,vip}` **on the same rows**, written two ways: (a) the settlement POST cascade — prefers `reconciled_*` over `day_of_*`, merge-safe upsert that never null-stomps, write-once `locked_fx_rate` (LOCK-ON-ACTUAL, missing rate → 1:1), and (b) **typed directly into the grid**, which stamps `actuals_source:'manual'`.

**Why it feels like "a settlement sheet but complicated":** the duplication is structural. Every figure the walk *derives* exists a second time as an *editable* grid cell. Two writers to one actuals layer is what forced all of Stage 5: the `resolveActualsCascade` provenance gate (cascade writes only `actuals_source` NULL/`'settlement'` rows), the per-field conflict list returned as `actuals_conflict`, the `overwrite_manual_actuals` re-POST, and the merge-safe omission rules. One number — "what did this show actually pay" — currently has **three competing homes** (`day_of_*`, `reconciled_*`, `actual_*`) and a precedence engine to referee them. The Actuals sheet *is* a settlement sheet, minus the waterfall, plus the refereeing.

## 2. THE MODEL

Adopt ATOM's Budget grammar (COMPETITIVE_ATOM doc §Budget): every income line shows **CONTRACTED** and **SETTLED**, each with an **AUTO / Manual provenance chip**. Their Show Guarantees line — "AUTO · 45 confirmed shows · itemized" — is exactly our shape.

**Per show:**
- **CONTRACTED** = the deal. `budget_income` proposed columns, sourced AUTO from tour data (routing + deal terms; the advance Settlement section already captures guarantee/deal type per show). This is "proposed income". Editable, as today.
- **SETTLED** = the walk's output. Derived from the `settlement` row: `reconciled_*` when present, `day_of_*` as a fallback rendered in a distinct "day-of, unreconciled" state, nothing otherwise. **Not editable anywhere except the walk.**
- **Once `full_and_final`, only SETTLED flows to actual income.** Before settlement, forecasting uses CONTRACTED; after, SETTLED replaces (never adds to) it in every P&L/actual rollup. No double count, by construction — the two columns are different lifecycle states of one line, not two lines.
- **Chip on every line:** `AUTO` (settled figure from the walk cascade) or `Manual` (explicit override). Nearly free — `actuals_source` already holds this; the ATOM doc ranked surfacing it as steal #1.

**Kill the Actuals sheet as an editing surface.** The Income tab becomes a **read** of settlements plus manual non-show income lines:
- Show rows: CONTRACTED | SETTLED | variance | chip | settlement status. Clicking SETTLED deep-links into that show's walk. `actual_*` cells stop accepting input.
- Non-show income (tour-level merch projections, sponsorship, reimbursements, VIP — everything with no settlement source; note the cascade already never writes `actual_vip`) remains manually entered, chipped `Manual`. This is the *only* surviving manual entry, matching ATOM's Manual rows.
- The one escape hatch: a per-show **Manual override** action (kebab, confirm) that sets `actuals_source:'manual'` and flips the chip. This replaces the entire Stage 5 conflict/overwrite dialog machinery — conflicts can no longer arise from ambient grid edits because there are none.

**Field/table mapping:**
| Today | Becomes |
|---|---|
| `budget_income` proposed columns | CONTRACTED, unchanged (still the grid's editable half) |
| `settlement.reconciled_*` / `day_of_*` | the *only* sources of SETTLED |
| `budget_income.actual_*` | kept as the materialized read-model of SETTLED; sole writer = the cascade (or explicit override). No schema drop — writers change, columns don't |
| `actuals_source` | drives the chip: `settlement` → AUTO, `manual` → Manual |
| `overwrite_manual_actuals` + `actuals_conflict` in `route.ts` | deprecated once grid editing is off; cascade always wins unless chip says Manual |
| `locked_fx_rate`, merge-safe upsert | unchanged — orthogonal and correct |

**Migration-shaped changes (describe only; Adam hand-pastes per pipeline rule):** (1) widen `settlement` with the deal/box-office/fee fields in §3; (2) extend the deduction `kind` set with `facility_fee | ticket_fees | cc_fees` (waterfall ordering keys off kind); (3) a `budget_income_manual_lines`-shaped home for non-show income if the current grid stores those as pseudo-show rows (verify against the Income grid, not in snapshot); (4) optional `actuals_locked_at` on `budget_income` if we want the flip auditable. Reconcile-harness (52/52, THE MONEY GATE) and provenance 18/18 must stay green through all of it — the cascade math itself does not change.

## 3. THE SETTLEMENT SURFACE — ATOM parity

**KPI strip** (their six, mapped to our data; all derivable from `loadTourSettlementWalks` output today):
- **Outstanding balance** — Σ `walk.outstanding` over all shows with a settlement.
- **Settled** — count `full_and_final`.
- **Not settled** — count past shows (`date < today`) without `full_and_final` (the current amber-border predicate, promoted to a number).
- **Awaiting payment** — `full_and_final` OR reconciled, with `walk.outstanding > 0`: settled on paper, money not landed.
- **Needs payment details** — shows whose settlement has no payment method/payee route on file. *We do not hold payee bank details today* — either add them to the settlement grain (sensitive; see open question 4) or launch the strip with five KPIs.
- **Unsettled shows N of M** — Not-settled over total shows on the tour.

**Catch-up batch queue** (ATOM: "Catch-up — 32 shows played, not settled"; steal-list #3): replace the passive amber flags with a collapsible panel above the shows list — checkbox per played-unsettled show (date · city · venue · contracted guarantee), **Select all**, **Settle N shows**. Batch semantics: for each checked show, upsert a settlement at `reconciled_guarantee = contracted guarantee`, zero deductions/expenses, chip AUTO — i.e. "it paid what the contract said". Whether that also sets `full_and_final` is open question 3. Single new batch endpoint; each row then remains individually walkable.

**Per-show sheet — the 22-field Settlement grain.** Upgrade the walk from a 5-figure net calc to the full deal shape (superset of our 9-field advance seed in mig 003: deal_type, guarantee, bonus_threshold, bonus_split, ticket_price, ticket_capacity, deposit_received, deposit_amount, settlement_notes):
- **Deal terms:** deal type (Guarantee / Guarantee + bonus / Door deal / Flat / Festival — mig 003's enum), guarantee, split %, bonus threshold(s), bonus split.
- **Box office:** capacity, tickets sold, comps, ticket price(s), **gross box office** (we already carry `*_tickets_sold` / `*_gross` from #24 — they become waterfall inputs, not informational).
- **Deductions waterfall, in order:** gross box office → facility fee → ticket fees → CC fees → taxes/withholding (kinds exist) → **net box office** → approved show expenses → **split pool** → promoter/artist split → bonus vs guarantee resolution (greater-of / plus, per deal type) → overage → **net to artist**. The existing walk (guarantee → deductions → expenses → net) becomes the degenerate flat-guarantee case of this waterfall; `computeWalk` grows, its current outputs stay bit-identical for guarantee-only deals so the settlement harness (21) holds.
- **Settle & pay:** merch, deposit(s), payments log, Full & Final, signed-by — all existing.

**The pretty printable sheet** (upgrading `/api/budget/settlement/export/pdf`):
1. **Header identity block** — artist mark (Brand & Logos library, per ATOM doc), tour name, show date · venue · city, promoter/purchaser, settlement status + settled-on date.
2. **Deal recap strip** — one line: deal type · guarantee · split · bonus threshold, plus capacity/sold/comps and gross.
3. **Waterfall table** — the full deductions cascade above, mono tabular numerals, negatives red per the app's hue budget, subtotal rules at Adjusted gross / Show net / Artist total / Balance due / Outstanding — exactly the on-screen walk, typeset.
4. **Payments & balance block** — deposits and payments with method/date, Outstanding emphatic.
5. **Signatures strip** — Tour Manager / Promoter name-signature-date pairs, day-of `signed_by` prefilled, notes footer.
Per the ATOM corrections, also emit this per-show data into the X1 XLSX workbook's Show Settlements sheet (C3, already shipped) — PDF is the terminal document, XLSX is the accountant round-trip.

## 4. BUILD ORDER

Each phase independently shippable; money gates (reconcile 52/52 · provenance 18/18 · settlement 21 · FX greps 0) green at every bank.

1. **KPI strip + catch-up batch queue — S/M, no migration.** `SettlementWalkClient.tsx`, `src/lib/settlement/loadWalk.ts` (aggregates), a batch upsert in `src/app/api/budget/settlement/route.ts` (or a sibling `batch/route.ts`). Ship five KPIs; "Needs payment details" waits on Q4. Highest perceived-competence per line of code.
2. **Provenance chips + Income tab flip to read — M, no migration.** Income grid component (locate; not in snapshot), `src/lib/budget/actualsProvenance.ts`, `route.ts`. Chip from `actuals_source`; `actual_*` cells read-only for show rows; kebab Manual-override replaces the conflict dialog; deep-link SETTLED → walk. Delete `overwrite_manual_actuals` handling last, behind the flip.
3. **22-field settlement grain + waterfall walk — L, hand-paste migration** (new settlement columns + deduction kinds). `src/lib/settlement/walk.ts` + `loadWalk.ts`, `SettlementWalkClient.tsx`, `lines/route.ts`, `route.ts`; update the mig 003 advance-template seed to match so advance and settlement speak one field vocabulary. Guarantee-only deals must reproduce today's numbers exactly.
4. **Printable sheet — M, no migration.** `export/pdf/route.ts` + shared layout with the on-screen walk; stamp Brand & Logos; extend the X1 workbook settlement sheet.
5. **Non-show income lines + retire the Actuals editing surface — M, possible hand-paste migration** (manual-lines home, `actuals_locked_at`). Income grid, `route.ts` cleanup. Only after 2 has soaked — this deletes the old write path.

## 5. OPEN QUESTIONS for Adam

1. **Where does Settlement live** — stays a Budget rail item, or becomes its own Money surface now it carries KPIs + queue + sheets? (The rail already lists Settlements as a peer of Income; ATOM makes it a full section.)
2. **Do manual actuals overrides survive at all?** Proposed: yes, but only as the explicit per-show kebab action with a Manual chip — never ambient grid typing. OK to remove the grid path entirely?
3. **Batch-settle semantics:** does one-click catch-up at contracted guarantee mark shows Full & Final, or create draft settlements still needing reconciliation? (Full & Final is faster; drafts are honest.)
4. **"Needs payment details"** requires payee/bank fields we don't store. Add them to the settlement grain (sensitive data, RLS question) or ship a five-KPI strip?
5. **The day_of grain:** keep day-of vs reconciled as two layers (current), or collapse to one settled grain with a `draft → reconciled` status once the waterfall lands? Two grains is the last remaining duplication after this spec.
