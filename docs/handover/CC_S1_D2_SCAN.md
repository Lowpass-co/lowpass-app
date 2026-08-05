# CC — S1 D-2: scan → move. The probe came back and D-2 is NOT migration-free. Read this before writing any code.

`CC_S1_STAGE_D.md` §"Order and gating" says *"D-1 and D-2 need no migration."* **That is wrong and I'm retracting it.** Adam ran the `information_schema` probe and a repo audit followed; the table 250 prepared cannot accept the row D-2 is supposed to write. Details below, all with file:line, all verified rather than inferred.

## What the probe returned

`public.rental_movements` in production:

```
id · workspace_id · rental_inventory_id · rental_job_id · movement_type
scanned_by_user_id · notes · created_at
from_space_id · to_space_id · from_container_id · to_container_id · gear_id
```

**Migration 250 IS applied** — the four `from_*`/`to_*` columns and `gear_id` are all present. That was the open question and it's answered: proceed on the schema, not on the sequencing assumptions.

## D2-0 — The blocker: you cannot log a movement for a gear-native item

`094_rental_movements.sql:27` declares:

```sql
rental_inventory_id UUID NOT NULL REFERENCES public.rental_inventory(id) ON DELETE CASCADE,
```

`250_rental_movements_where.sql:18-24` added `gear_id` as **nullable** and **never relaxed that NOT NULL**. So:

- Every insert must supply a `rental_inventory_id`.
- A `gear` row created natively — not promoted from `rental_inventory` — has `rental_inventory_id = NULL` (`057_rental_gear_link.sql:20-25` is the provenance pointer, `ON DELETE SET NULL`).
- Therefore **a movement cannot be logged against gear-native items at all.** The insert fails on the NOT NULL.

The table is still structurally rental-first despite 250's framing. There is also **no CHECK enforcing exactly one referent** — neither migration wrote one — so the dual referent is entirely unpoliced: a row may carry both, pointing at unrelated items, and nothing objects.

**This is a decision, not a mechanical fix, and I want your argument before the SQL.** My read: go **gear-first**. `gear` is canonical after Stage B (248 made the mapping total — every `rental_inventory` row has exactly one `gear` row), so the migration is: assert `gear_id` is non-NULL everywhere, make `gear_id` NOT NULL, relax `rental_inventory_id` to nullable, and keep it as legacy provenance. The alternative — a permissive `CHECK (gear_id IS NOT NULL OR rental_inventory_id IS NOT NULL)` — preserves the ambiguity D-2 then has to code around forever, and I don't think it buys anything. Argue it if you disagree.

### PROBE RETURNED 2026-08-05 — the migration is safe. Do not re-ask.

Adam ran both halves. Results:

```
gear:              total 33 · without_qr_token 0 · gear_native_no_provenance 0
rental_movements:  rows_without_gear_id 0
```

So: **every `rental_movements` row already carries a `gear_id`** — 250's backfill (`250:26-30`) resolved cleanly and `ALTER COLUMN gear_id SET NOT NULL` will paste without failing. Write it guarded anyway (`WHERE gear_id IS NULL` assertion first, so a re-paste against changed data is a loud no-op rather than a silent one), per the hand-applied migration rules.

**Two D-2 findings are downgraded by these numbers, and I want the severity stated accurately rather than inherited from my first draft:**

- All 33 gear rows have `rental_inventory_id`, so the NOT NULL blocker affects **zero rows today**. It fires the first time an item is created natively through Assets rather than promoted from rental.
- All 33 have a `qr_token` for the same reason (inherited via the 248 backfill), so D2-2 affects **zero rows today** and fires on the same trigger.

Both are landmines, not fires. They still must land before the scan flow ships — a scan surface that silently refuses the first natively-created item is worse than no scan surface — but do not describe them as currently broken.

## D2-1 — Every QR label already printed points at a 404

`src/lib/rental/qr.ts:48-50`:

```ts
buildScanUrl() → `${origin}/rental/scan?t=${token}`
```

**`/rental/scan` does not exist.** There is no `src/app/(app)/rental/scan` directory and no file matching `*scan*` anywhere under `src/app`. The whole `(app)/rental` tree is two files, both print-labels. The doc comment at `qr.ts:45-47` describes the handler in the future tense.

Physical labels with that URL are in the world. **This is the first thing to build**, and the route must match the URL that is already printed — `/rental/scan?t=<token>`, not a new path. If you want a different URL, the old one still has to resolve.

Related, and it is the reason the lookup has never been exercised: **nothing in `src/` has ever done `.eq('qr_token', …)`.** Generation is complete end-to-end (SVG route, print page, preview component); consumption does not exist. Zero callers, zero readers — the hazard class `CLAUDE.md` names, and here it produced a shipped artefact pointing at nothing.

## D2-2 — New gear is unlabellable, and today's data hides it

The token trigger from 093 lives on **`rental_inventory`**. On `gear`, `qr_token` is only ever written as a request-body passthrough (`src/app/api/gear/[id]/route.ts:71`). Nothing generates one.

I checked production: **33 of 33 gear rows have a `qr_token`.** That looks fine and is misleading — all 33 are rental-derived, so they inherited tokens through the 248 backfill. The first item created natively through the Assets surface gets `qr_token = NULL` and cannot be labelled, and nothing will report that.

Give `gear` its own token generation — trigger or app-side on insert, matching 093's format so existing and new labels are indistinguishable. Backfill any NULLs in the same migration.

## D2-3 — `/api/gear/move` writes no history, and the columns 250 added have zero writers

`src/app/api/gear/move/route.ts` (63 lines) writes exactly two things:

- `gear` placement (`:46`) — `.update(placement).in('id', ids).eq('workspace_id', workspaceId)`, where `placement` comes from `'space_id' in body` semantics at `:41-45`.
- `tour_gear` upsert (`:54-56`) + `syncDerivedBudgetRowForTour(:57)`.

**No `rental_movements` row. No before-value captured.** The move is destructive to history. `from_space_id / to_space_id / from_container_id / to_container_id` are written by nothing in the codebase — 250's own header is candid that Stage D was meant to be the writer.

There is a second placement writer too: `src/app/api/gear/[id]/route.ts:59-60` (single-item `space_id`/`container_id`), likewise logging nothing.

**One write path, per the spec — so extend `/api/gear/move`, do not fork it.** Read the current placement before the update, write the movement row with both from and to, and make the single-item writer at `[id]/route.ts` go through the same helper. The scan flow then becomes a caller of that route, not a second implementation of it. If you find yourself writing a second insert, stop and say so.

## D2-4 — The audit log is write-only and its only writer is a page render

The sole `rental_movements` write in the entire codebase is `src/app/(app)/rental/print-labels/page.tsx:86-99` — a server component that inserts a `manual_correction` batch as a side effect of rendering. **A page refresh logs another batch.** Nothing anywhere SELECTs the table, so the pollution has never been visible.

Two consequences for D-2:

- Move that insert out of render (an explicit action, or drop it — a label reprint is arguably not a movement at all; say which you chose and why).
- Build the read side. `094`'s header promised a "last scanned by / when / where" column and it was never built. Movement history on the item's detail surface is what makes the whole table mean anything, and without it D-2 ships another write-only log.

Note the FK asymmetry while you're there: both `rental_inventory_id` and `gear_id` are `ON DELETE CASCADE`, so deleting either side destroys the movement record — which contradicts 094's stated intent that movements survive as historical record. `ON DELETE SET NULL` on the provenance column is the consistent choice. Flag it; fix it in the same migration if you agree.

## What D-2 actually is, restated

The spec's four bullets stand — scan surface with **manual entry fallback** (loading docks have no signal), resolve token → item → show current location → offer move, unknown token gets a clear "not found", batch mode if cheap. Nothing there changes. What changed is that three of them sit on foundations that don't exist yet: the route the labels point at, the token for new items, and a movements table that can accept a gear row.

Build order: **D2-0 migration (after the probe) → D2-1 scan route → D2-2 tokens → D2-3 move-writes-history → D2-4 read side → then the scan UI on top.** The UI is the last thing, not the first — every layer under it is currently missing or unexercised.

Smokes SPD-04/05/06 as specified, plus: SPD-04b a gear-native item (no `rental_inventory_id`) can be scanned and moved — that is the case the current schema refuses, so it is the one that proves the migration landed.

## Gates

Floor green · **money harnesses 64/21/15 untouched** — `syncDerivedBudgetRowForTour` is on the move path, so a change there is money-adjacent whether or not it looks like it; run them before and after and report both · migration idempotent with a down-block, numbered ≥255 after checking every active branch, delivered as paste-SQL for Adam and **wait for "pasted"** before the code that depends on it · every new mutating route calls `requireWrite` or the ratchet fails · Vercel deployment confirmed against your commit hash.

**Do not paste anything yourself and do not touch `231_payroll_drop_legacy_rate_columns.sql.HOLD`.**
