# CC — S1 D-2: scan → move. Re-verified against `6eab868`. Migration 255 is APPLIED.

This replaces the earlier D-2 draft, which was written before ~12 commits landed. Everything below was re-checked against current `main` this session, not inherited from the previous version.

**255 is applied and complete.** Probed, all four steps, not assumed:

```
rental_movements.gear_id             NOT NULL        ✓
rental_movements.rental_inventory_id NULLABLE        ✓
rental_inventory_id FK               ON DELETE SET NULL ✓
unique index gear_qr_token_key       exists          ✓
```

So the blocker is gone. A movement row can now be logged for a gear-native item. Do not re-paste 255.

---

## The state of play, and it is stranger than the last draft said

**A reader of `rental_movements` now exists, and there is still no writer that sets `gear_id`.**

`2c41fc8` added `src/app/api/gear/[id]/detail/route.ts:68-75`, which reads movements with `.eq('gear_id', id)`, and `GearDetailSlideOver.tsx:240-256` renders them with a label map for all five `movement_type` values. It is built, it is correct, and it will display **"No scans logged."** for every item in the workspace, permanently, until something writes a row with `gear_id` set.

The previous draft said "zero readers." That is now false — flagging it loudly because the ordering matters: the read side arrived first, so the feature *looks* shipped from the UI down and is inert from the data up. That is the same shape as the FX route, inverted.

Three more corrections to the earlier draft, all mine, all verified:

- **The `print-labels` insert does NOT throw.** I told Adam migration 255 would break that page. It won't. `page.tsx:89` never destructures the result — no `const { error } =`, no `.throwOnError()` — and supabase-js resolves with `{data: null, error}` rather than rejecting. The 23502 NOT NULL violation is **discarded**. The page renders normally and the audit trail it exists to write has silently stopped. Worse than an error, not better.
- **There are three placement writers, not two.** `src/app/api/gear/route.ts:82-83` (POST create) sets `space_id`/`container_id` from the body and is the easy one to miss.
- **255's own step-5 comment justifies the unique index by asserting "the lookup is `.eq('qr_token', ...)`".** No such lookup exists anywhere in `src/`. I wrote that justification; the index guards a query nobody has written yet. The index is still right — D2-1 is about to write that query — but the comment states as present something that is future tense. Correct it when you touch the file's docs.

Unchanged and still true: **no scan route, no `qr_token` lookup, no movement write from `/api/gear/move`, no previous-placement capture, no way to print a gear label.**

---

## D2-1 — The scan route. Build it first; the labels in the world point at it.

`src/lib/rental/qr.ts:48-50` emits `${origin}/rental/scan?t=${token}`. `src/app/(app)/rental/` contains exactly one child: `print-labels`. **The destination 404s**, and `qr.ts:26-29` describes the handler in the present tense ("The Phase 3 scan UI lives at…") which is prose, not description. Fix the comment while you're there.

Build `/rental/scan` at that exact path and query shape. If you want a better URL, this one must still resolve — labels are physical objects and cannot be re-issued.

- Resolve `?t=<token>` → `.eq('qr_token', token)` on **`gear`**, workspace-scoped. This is the first such query in the codebase and the reason 255's unique index exists.
- **Manual entry fallback, always.** Loading docks have no signal and cameras fail. Camera is the enhancement, not the mechanism.
- Show where the item currently is — and note `GearDetailSlideOver` does **not** display placement today (its `GearRow` interface at `:18-32` omits `space_id`/`container_id` even though the route `select('*')`s them). The scan surface needs location; consider fixing the slide-over in the same pass since the data already arrives.
- **Unknown token → an explicit "not found" state**, never a silent empty.
- Batch mode is the real-world need. Ship single-item first if batch isn't cheap, and say which you did.

## D2-2 — Make the move write history. One path, not a second one.

`src/app/api/gear/move/route.ts` calls `requireWrite` (`:21-22`, from P0-C5 — good) and writes exactly two things: the `gear` placement UPDATE (`:46`) and the `tour_gear` upsert + `syncDerivedBudgetRowForTour` (`:54-57`). **No movement row, and no SELECT before the UPDATE**, so the prior placement is overwritten and unrecoverable. The four `from_*`/`to_*` columns 250 added still have zero writers.

- Read current `space_id`/`container_id` for the affected ids **before** the update, then insert one `rental_movements` row per item with both from and to, `gear_id` set, and `rental_inventory_id` left NULL for gear-native items (255 makes that legal now).
- **Extend this route; do not fork it.** The scan flow becomes a caller. If you find yourself writing a second insert, stop and say so.
- Route the single-item writer at `src/app/api/gear/[id]/route.ts:59-60,74` through the same helper, and the create path at `src/app/api/gear/route.ts:82-83` if a placement-on-create should count as a movement (argue it either way — I don't think it should, but say which you chose).
- The moment this lands, the slide-over's Movements section starts showing real rows. That is the acceptance signal.

**Two things to fix in `[id]/route.ts` while you are in it, both flagged adversarially rather than assumed:**

- `:74` is `.update(payload).eq('id', id)` with **no `.eq('workspace_id', …)`**, unlike `/move` which double-guards. It relies entirely on RLS. Add the predicate — defence in depth costs nothing and the asymmetry between two sibling routes is itself a smell.
- `:71` passes `qr_token` straight from the request body with no validation. With 255's unique index live, a caller can now set an arbitrary token or provoke a 23505. Either drop the passthrough (the trigger generates tokens; nothing should be setting them by hand) or validate format and handle the collision. **I lean to dropping it** — say if you disagree.

## D2-3 — `print-labels` is silently broken, unreachable, and rental-only. Decide its fate.

`src/app/(app)/rental/print-labels/page.tsx`:

- Its insert (`:86-99`) omits `gear_id` and now silently no-ops against 255. Untouched since its original commit.
- It fires on **server-component render**, so a refresh logs another `manual_correction` batch — a page view recorded as a physical movement.
- It reads `rental_inventory` only (`:64`), so gear-native items cannot be labelled.
- **Nothing links to it.** The only referrer is `QRPreview.tsx:58`, and `QRPreview` has zero importers. Reachable only by typing the URL.

My read: a label reprint is not a movement, so the insert should go entirely rather than be repaired. But this is Adam's call on whether reprints need an audit trail at all — surface it, don't decide it silently. If it stays, it moves out of render into an explicit action and sets `gear_id`.

## D2-4 — 255 guarantees every gear row has a token, and nothing can print it

The `gear_qr_token_bi` trigger now fills `qr_token` on every insert. Meanwhile: `print-labels` reads `rental_inventory`; there is no `/api/gear/[id]/qr.svg`; `renderRentalQrSvg` has exactly one caller, reachable only for inventory ids. So **every gear item has a label that cannot be rendered.**

A gear-side QR route + a label sheet driven from the Assets surface. Reuse `renderRentalQrSvg` rather than writing a second renderer, and generate `buildScanUrl` from the gear token so the printed URL matches what D2-1 resolves.

## D2-5 — The slide-over is mounted in one place, and it is the wrong one

`GearDetailSlideOver` is imported and rendered **only** from `src/components/rider-pack/ChannelListEditor.tsx:35,848`, via the channel-list gear chip. `AssetsClient.tsx` and the Equipment grid do not mount it. The gear-management UI cannot reach the gear detail panel.

Mount it from Assets. Cheap, and it is where the movement history and location this sprint produces will actually be looked at.

---

## Order

D2-1 (the 404 the labels point at) → D2-2 (the writer the reader is waiting for) → D2-5 (make it visible) → D2-4 (labels) → D2-3 (Adam's ruling first). No migration should be needed for any of it; if you think one is, argue it before writing it, and number it after re-checking every branch immediately before committing — two agents are numbering into the same space and 256–260 landed while 255 was in flight.

## Gates

Floor green · **money harnesses — the counts moved, do not use the old ones.** As of the 2026-08-09 handoff they are `src/lib/payroll/reconcile.harness.ts` **72**, `src/lib/payroll/fees.test.ts` **27**, `src/lib/settlement/reconcile.harness.ts` **40** (was 64/21/15 before the canonical flat-seven rates model and the settlement waterfall landed). Vitest is **538 tests / 30 files**, with a known flake in the RoutingEditor + pdfProbe suites — rerun once before reporting. Run all three harnesses either side of this bank and report both numbers: `syncDerivedBudgetRowForTour` is on the move path, so this is money-adjacent even though it looks like inventory · every new mutating route calls `requireWrite` or the ratchet fails · **an authenticated smoke before you claim any of this works.** Two production incidents this week (`getClaims` for `getUser`, and a `profiles.full_name` that does not exist) both passed tsc, eslint, a green build and 533 tests, because none of those run with a session or against the real schema. "Returns 200" would have passed both — the outage was a 200 with an empty body. Assert on content.

Smokes: SPD-04 scan → move writes a movement with correct from/to · SPD-04b **a gear-native item (no `rental_inventory_id`) can be scanned and moved** — the case the schema refused before 255, so it is the one that proves it landed · SPD-05 unknown token handled · SPD-06 the item's location reflects the move everywhere it is shown, including the slide-over.
