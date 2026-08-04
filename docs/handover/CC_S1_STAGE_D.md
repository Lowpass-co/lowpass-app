# CC — S1 Stage D: the Assets payoff. Manifests + carnet, QR movement, storage costs, AI import.

Stages A–C landed (migrations 246–250, unified `gear`, Assets surface live, ~33 items). Stage D is what those tables were built for. Four slices, ordered safest-first; each is independently useful and independently shippable.

**Topology first, as always.** Before code, confirm: which of migrations 246–250 are actually applied in production (Adam pastes by hand — do not assume), the exact column names on `gear` after 247, the shape of `rental_movements` after 250, the shared export shell's entry points, and the review-queue grammar as it now stands after receipts extended it. Report file:line and stop if anything contradicts this doc.

**Carry the P0 conventions:** every new mutating route calls `requireWrite` (the ratchet will fail CI otherwise), every AI path proposes and never writes, and confirm the Vercel deployment maps to your commit before claiming a bank is live.

---

## D-1 — Gear manifest + ATA carnet export (do this first: data already exists, pure read)

Migration 093 put the customs fields on `rental_inventory` and 247 moved them up to `gear`: `country_of_origin`, `customs_hs_code`, `weight_kg`, `value_amount`, `value_currency`, `dimensions_cm`, `serial_number`. Nothing new is needed to produce both documents.

**Gear manifest** — the internal document. Grouped by space → container → item, with per-container and per-space weight subtotals and a grand total. Columns: item, manufacturer/model, serial, qty, weight, value. Scope selector: whole workspace, one space, or one tour's gear (via `tour_gear`). Through the **shared export shell**, PDF + XLSX.

**ATA carnet general list** — the customs document, and the differentiator. Be precise about what this is: **we generate the general list / schedule of goods that a carnet application requires, not the carnet itself** — carnets are issued by a chamber of commerce. Say that in the UI. Over-claiming here is a real-world liability.

Columns, in carnet order: item number · trade description (make/model, serial) · number of pieces · weight (kg) · value with currency · country of origin · HS code. Totals row for pieces, weight and value.

**Rows with missing `country_of_origin`, `customs_hs_code` or `value_amount` are the whole problem in practice** — an incomplete list is refused at the counter. So: a pre-export completeness check listing exactly which items are missing which fields, with a link to fix each, and a clear "N of 33 items incomplete" summary. Allow export anyway (a partial list is still useful for filling in) but mark the gaps visibly in the document. **Do not silently emit blanks.**

Smokes: SPD-01 manifest weights roll up correctly per container/space/total · SPD-02 carnet list contains every required column and flags incomplete rows · SPD-03 tour-scoped manifest matches the tour's gear.

## D-2 — QR scan → move (closes the loop migration 250 opened)

`gear.qr_token` exists (from 093, moved up in 247) and 250 gave `rental_movements` its `from_space_id / to_space_id / from_container_id / to_container_id`. The scan flow is what makes those columns mean anything — migration 094's own header promised a "where" the table couldn't answer until now.

- A scan surface (`/assets/scan` or a modal) taking a `qr_token` — from a camera where available, and **always with a manual entry fallback**, because venue loading docks have no signal and cameras fail.
- Resolve token → item → show where it currently is → offer **move**: to a space, a container, or a tour.
- On confirm, write a `rental_movements` row with both from and to, and update the item's placement. One write path, reusing the existing move logic from Stage C's move flow — do not fork it.
- **Unknown token** → clear "not found" state, never a silent failure.
- Batch mode is the real-world need: scan several, move them together. Build it if it's cheap; if it isn't, ship single-item first and say so.

Smokes: SPD-04 scan → move writes a movement with correct from/to · SPD-05 unknown token handled · SPD-06 the item's location reflects the move everywhere it's displayed.

## D-3 — Storage costs → budget line (Adam's own example: "the storage costs of the trailer flow into the tour")

Migration 246 gave `spaces` a `monthly_cost_amount` and `cost_currency`. The wiring must extend the **existing** derivation, not add a second: `syncDerivedBudgetRowForTour` in `src/app/api/gear/[id]/route.ts` already writes `budget_line_items` with `source_entity_type='gear'`, keyed on (gear_id, tour_id), for `hired_to_client` ownership. Same pattern, new source type.

**The design question, and the rule: no automatic allocation.** A locker serving three tours must not silently charge all three, and splitting it arbitrarily is worse. So a space cost reaches a tour only by **explicit assignment** — "charge this space to tour X, from date A to date B, at this rate" — producing one derived budget line on that tour. Unassigned spaces are workspace overhead and touch no tour.

Consequences to honour: changing the assignment or the rate re-derives the line; removing the assignment removes it; the line is `Auto` provenance (M1-A chips) and is not hand-editable on the budget side — the space is the source of truth. Currency conversion goes through the **existing** FX path (`/api/budget/exchange-rate`, now working — it was dead until this week).

**Money gates apply: 64/21/15 before and after.** A new derived line type must not move any existing computation.

Smokes: SPD-07 assigning a space to a tour creates one derived line with the right amount · SPD-08 changing the rate re-derives · SPD-09 unassigning removes it · SPD-10 an unassigned space touches no tour.

## D-4 — AI bulk import (largest; do last)

Drop a CSV/XLSX gear list, a supplier invoice, or a photo of a flight-case label sheet → proposed gear items → review → accept.

**Reuse the review-queue grammar receipts extended** (`import_pending_lines` + the proposal/apply route pair + `dedupe.ts`). This is the third consumer; do not create a fourth grammar. Same rules as receipts: everything lands as proposals, every field editable before accept, duplicates flagged against existing gear (name + serial) and default-skipped, accepted rows write through the existing gear create path.

Metering via `withAiUsage` with a per-batch cap, as receipts does. Images and PDFs both — and note the receipts lesson: **an image-only PDF is the common real-world case**, so test with one rather than a generated text PDF.

Smokes: SPD-11 CSV proposes rows, nothing written until accept · SPD-12 duplicate against existing serial flags and skips · SPD-13 photo/PDF path proposes · SPD-14 reject leaves no rows.

---

## Order and gating
D-1 → D-2 → D-3 → D-4. D-1 and D-2 need no migration. D-3 may need one (the space→tour assignment) — write it as paste-SQL and stop. D-4 may need a `source` discriminator on the proposals table; check what receipts already added before adding another.

Run the sequence without stopping between slices unless something contradicts the topology map or a money gate moves. Bank and push each slice. Report once at the end with the coverage/harness/deployment evidence, plus screenshots of the carnet list and the scan flow.
