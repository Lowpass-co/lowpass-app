# CC — D-1 R3: the fallback reintroduced R2-6 on a customs document. Fix before anyone exports one.

Your override on the "stop if a write path exists" instruction was **correct and I'm endorsing it.** Both writes are real (`gear/route.ts:89`, `gear/[id]/route.ts:66`) and both are pass-throughs no UI feeds — `Gear` in `src/lib/types/gear.ts` has no `value_amount` field at all, so `updateGear`/`GearSlideOver` cannot send it even by spread. My instruction was written to catch "a UI populates this and the data is just sparse". You checked whether the *reason* held rather than whether the *letter* did, found it refuted, and said so with the evidence. That is the behaviour I want. Do it again.

D1-L4 is confirmed good — both routes reject unknown kinds naming the value, and reject empty-string ids via the truthiness check. Migration 255's gear-first argument is right and reason 3 is the one that matters: unrepresentable beats detectable.

Three things are wrong. The first blocks use of the document.

---

## R3-1 — BLOCKER. The symbol and the number are sourced independently again.

`gear-pdf.ts:125-129` prints `i.value_currency` adjacent to `resolved.amount` on **both** branches:

```ts
: `<td class="num">${esc(i.value_currency ?? '')} ${resolved.amount!.toFixed(2)}${
    resolved.source === 'purchase_cost' ? ' <sup>†</sup>' : ''
  }</td>`
```

So a purchase-cost fallback renders as **`GBP 300.00`** — where `300.00` came from `purchase_cost` and `GBP` came from `value_currency`, a different column describing a different quantity. The dagger discloses the provenance of the *number*. It says nothing about the *symbol*.

**There is no basis for assuming they agree:**

- `purchase_cost` has **no currency column anywhere in the repo.** Grep `purchase_cost_currency` / `purchase_currency` — nothing. It is a naked `NUMERIC` on both tables (`247:22`, `092:43`). It is a scalar with no unit.
- `value_currency` is free-text `TEXT DEFAULT 'GBP'` (`247:27`) and `gear/[id]/route.ts:67` will set it to any string a caller sends — no ISO-4217 validation. A row can hold `value_currency = 'USD'` over a `purchase_cost` typed in GBP years earlier, and the carnet will print `USD 300.00`.
- The codebase elsewhere treats per-row currency as a real source unit — `JobDetail.tsx:61` and `253:8` both describe each row keeping "its own value_currency as the SOURCE unit". The fallback ignores that.

This is R2-6 exactly. `resolveQuoteDisplay()` exists in `components/equipment/types.ts:219` because we already shipped £17,189.10 over a dollar figure once, and the lesson written into that comment block was: *derive the symbol from the same fact that decides the number, so a mixed pair is unrepresentable.* The fallback derives them from different facts. **On a document that goes to a customs broker**, where the declared value is the thing duty is assessed on.

**And the total is worse than the cells.** `gear-pdf.ts:158` prints `${value.toFixed(2)}` with **no currency at all**, summing `resolved.amount ?? 0` across rows that may carry different `value_currency` values and mixed declared/purchase-cost provenance. A bare mixed-unit sum on a customs document is the same hazard with the symbol dropped entirely rather than wrong.

**The fix, and take the shape from R2-6 rather than inventing one.** Extend `resolveCarnetValue` to return the currency alongside the amount and the source, so the two can never be read from different places:

- `source: 'value_amount'` → currency is `value_currency`. They describe the same quantity; that pair is sound.
- `source: 'purchase_cost'` → **the currency is unknown.** Print the figure without a symbol and let the dagger footnote carry it: the number is a purchase cost, its currency is not recorded, confirm before submission. "300, currency unrecorded" is the only defensible statement. Do not print `value_currency` next to it.
- The total: only sum rows sharing one currency. If the scoped set is mixed, or contains any fallback row, **do not emit a single total** — emit per-currency subtotals and an explicit "not summable across currencies" note. A wrong total on a carnet is worse than no total.

If you think `purchase_cost` does have a knowable currency, find the column and show me. If it doesn't, the honest document says so.

## R3-2 — The manifest didn't get the fallback

`gear-pdf.ts:51` still reads raw `value_amount`, so the **gear manifest's Value column prints empty for all 33 production rows** while the carnet now shows figures for the same items. Two documents built from one loader — explicitly so they "never disagree about what is in the truck" (`gear-data.ts:4-9`) — now disagree about what it is worth.

Apply the same resolver, with the same currency discipline from R3-1.

## R3-3 — A false fact is now a source comment

`carnet-completeness.ts:53` states that `value_currency` looks populated because `gear/route.ts:90` defaults it to `'GBP'` on create. **That is not the cause**, and two better candidates were never eliminated:

- `247:27` — `ADD COLUMN IF NOT EXISTS value_currency TEXT DEFAULT 'GBP'`. Every pre-existing row got `'GBP'` when 247 ran, no route involved.
- `248:78` — `COALESCE(ri.value_currency, 'GBP')` in the backfill INSERT, alongside `ri.value_amount` (null) and `ri.purchase_cost` at `:77`.

We proved `gear_native_no_provenance = 0` — **all 33 rows are rental-derived**, so they arrived via 248 and the create route has plausibly never run for any of them. 248 fits the observed shape (purchase_cost populated, value_amount null, currency 'GBP') exactly; the route explains it only by coincidence.

The conclusion you drew from it was still right — the currency was never evidence of a partial write. But correct the comment. A wrong causal claim in the source is worse than no comment: the next reader inherits it as established, and this codebase's own notes are the thing agents trust most.

## R3-4 — The test claims more than it proves (not blocking, but fix the framing)

`carnet-completeness.test.tsx:138-155`. The valuable assertion is real and I want it kept:

```ts
expect(r.incomplete.some((g) => g.missing.includes('value_amount'))).toBe(false);
```

Two corrections to how it was described:

- *"every remaining gap is HS-code-driven"* is false on the test's own fixture — `:145` sets `country_of_origin: i < 2 ? null : 'AU'`, and `:153` asserts two rows carry an origin gap. Every **row** has an HS gap; not every **gap** is HS-driven.
- *"33 rows shaped like production"* — it is `Array.from({length: 33})` with `purchase_cost: 300` hardcoded. It proves the predicate behaves correctly given that shape; it does not prove production has that shape, and it would pass identically at length 5. The 33 is decorative. That's fine for a unit test — just don't let the framing imply a production guarantee, because the next person reads "33 shaped like production" as an assertion about production.

Also: `gear-pdf.ts` has **no test file at all**, so the dagger/legend conditional at `:139-144` — the thing that makes the disclosure honest — is uncovered. R3-1 changes that code; cover it in the same bank.

---

## Migration 255 — sound, one gap. Do not re-cut it; add one step.

Reviewed line by line. Numbering verified independently: 244–255 contiguous, no duplicate, 255 is next free. Steps 1–4 are right, the assert-before-alter is the correct instinct, and the FK asymmetry reasoning is correct.

**The gap: step 5 creates a UNIQUE index without asserting uniqueness first.**

```sql
CREATE UNIQUE INDEX IF NOT EXISTS gear_qr_token_key
  ON public.gear (qr_token) WHERE qr_token IS NOT NULL;
```

If any two `gear` rows share a token this fails — and because the Supabase SQL editor autocommits per statement rather than wrapping the script, **steps 1–4 would already be committed.** Partial application of a hand-pasted migration is the exact failure mode `database/migrations/README.md` exists to prevent, and the file's own philosophy (step 1) is to assert rather than assume. Step 5 doesn't.

Collision is unlikely — 8 hex chars, 33 rows — but "unlikely" is what step 1 declined to accept about `gear_id`, correctly. Add a symmetric assert before the index:

```sql
DO $$
DECLARE v_dupes BIGINT;
BEGIN
  SELECT count(*) INTO v_dupes FROM (
    SELECT qr_token FROM public.gear
    WHERE qr_token IS NOT NULL AND btrim(qr_token) <> ''
    GROUP BY qr_token HAVING count(*) > 1
  ) d;
  IF v_dupes > 0 THEN
    RAISE EXCEPTION 'ABORT: % duplicate qr_token value(s) on gear. Resolve before pasting 255 — the scan lookup is .eq(qr_token,...) and a duplicate resolves to the wrong item.', v_dupes;
  END IF;
END $$;
```

Two smaller notes, neither worth blocking on:

- **Step 4 is not a true no-op on re-paste.** It finds the constraint by name, DROPs it, and re-ADDs it — so a second paste briefly drops the FK and rebuilds it. Correct in outcome, but the header's "re-running is a no-op" overstates it. Either guard on the existing `delete_rule` being `SET NULL` and skip, or amend the header. I'd amend the header; the drop/recreate is harmless inside the DO block, which rolls back as a unit on failure.
- **`gear_qr_token_biu` is named for BEFORE INSERT OR UPDATE but fires on INSERT only.** Fine as designed — regenerating on update would orphan printed labels — but rename it `_bi`, or the next reader assumes an UPDATE path exists that doesn't.

**Adam pastes 255 once that assert is added. Nothing that depends on it ships before he confirms.**

## Deployment

`8262ebf` is not confirmable from here — I have browser access to the Vercel dashboard but the deployment list hadn't rendered when I read it, and I will not report green off a stale view again (that error is already on the record twice this project). Adam eyeballs the top of the deployments list for `8262ebf`. Until then the bank is landed-not-verified, and the migration is unpasted regardless, so nothing depending on it is live.

## Order

R3-1 (blocker — currency) → R3-2 (manifest parity) → R3-3 (one comment) → R3-4 (test framing + `gear-pdf` coverage) → the 255 assert. Then D2-1.

## Gates

Floor green · `carnet-completeness` and a new `gear-pdf` test both covering the no-symbol-on-fallback rule and the mixed-currency total refusal · money harnesses untouched · **D2-1 does not start until 255 is pasted and Adam has said so.**
