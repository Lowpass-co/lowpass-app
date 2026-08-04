# S1 Stage D — topology map (gate before code)

Run 2026-08-04 against `main` @ `659890a`. Stage D's own instruction is to
confirm the ground before writing code and stop if anything contradicts the
doc. **Two things contradict it and one cannot be answered from here.**

## 1. Are migrations 246–250 applied in production? — CANNOT CONFIRM

No `DATABASE_URL`/`SUPABASE_DB_URL` in this environment, no `psql`, no Vercel
CLI. There is no path from here to production schema, so any claim either way
would be the assumption the doc explicitly forbids.

`public._lp_migrations` is not maintained (CLAUDE.md), so it cannot answer this
either — even from a machine that could reach the DB.

**Paste this and send back the four rows.** Read-only, no side effects:

```sql
SELECT
  to_regclass('public.spaces')                                        AS mig_246_spaces,
  to_regclass('public.containers')                                    AS mig_246_containers,
  (SELECT count(*) FROM information_schema.columns
     WHERE table_name='gear' AND column_name IN
       ('country_of_origin','customs_hs_code','weight_kg','value_amount',
        'value_currency','dimensions_cm','qr_token','space_id','container_id'))
                                                                      AS mig_247_of_9,
  (SELECT count(*) FROM public.gear WHERE rental_inventory_id IS NOT NULL)
                                                                      AS mig_248_linked_rows,
  (SELECT count(*) FROM information_schema.columns
     WHERE table_name='rental_job_items' AND column_name='gear_id')   AS mig_249_of_1,
  (SELECT count(*) FROM information_schema.columns
     WHERE table_name='rental_movements' AND column_name IN
       ('from_space_id','to_space_id','from_container_id','to_container_id','gear_id'))
                                                                      AS mig_250_of_5;
```

Expected if all applied: two non-null regclasses, `9`, `>0`, `1`, `5`.

Indirect evidence, offered as evidence and NOT as confirmation: live code in
`src/app/api/gear/route.ts`, `gear/move/route.ts`, `gear/from-rental/route.ts`
and the Assets surface reads `space_id`/`container_id`, and Adam walked Assets
during Stage C. That makes 246/247/248 very likely applied. It says nothing
about 249 or 250.

## 2. `gear` columns after 247 — doc is WRONG about one

Actually added by 247:

```
country_of_origin  customs_hs_code  purchase_cost  day_rate  day_rate_manual
weight_kg  value_amount  value_currency  dimensions_cm  qr_token  status
last_used_at  space_id  container_id
```

**`serial_number` is NOT among them.** The doc lists it as a 247 column; it has
been on `gear` since `052_gear_canonical.sql:20`. The column exists, so D-1's
carnet can use it — this is an attribution error, not a blocker. Recorded
because the next reader will otherwise go looking in the wrong migration.

## 3. `rental_movements` after 250 — and it has ZERO readers

Added: `from_space_id`, `to_space_id`, `from_container_id`, `to_container_id`,
`gear_id`.

**`grep -rn "from_space_id\|to_space_id" src/` returns nothing.** Not one line
of application code reads or writes these columns. That is the zero-caller
hazard class from CLAUDE.md, and it is exactly what D-2 exists to close — worth
stating plainly because it also means there is no existing behaviour to
regress, and no existing shape to imitate.

## 4. Shared export shell — a structured extension, not a drop-in

`src/lib/export/template-config.ts:19`:

```ts
export type ExportSurface = 'budget' | 'rooming' | 'payroll' | 'routing'
  | 'channel-list' | 'stage-plot' | 'settlement' | 'daysheet';
```

`src/lib/export/build.ts` carries one `buildXExport()` per surface
(`buildBudgetExport:86`, `buildSettlementExport:125`, `buildDaySheetExport:174`,
`buildRoomingExport:226`, `buildPayrollExport:267`, …), each paired with a
`*-data.ts` loader and a `*-pdf.ts` renderer.

So D-1's two documents mean: two new members of the union, two loaders, two
renderers, two builders, plus routes and an entry point. Achievable and
well-precedented — but it is six-plus new files against a shared registry, not
a small addition, and every existing surface compiles against that union.

## 5. Review-queue grammar — D-4 NEEDS A MIGRATION the doc did not anticipate

`import_pending_lines` after 251 (`database/migrations/251_*.sql:47-69`):

- `receipt_id UUID REFERENCES expense_receipts(id) ON DELETE CASCADE`
- `source_ref` — human-readable origin
- `CHECK (target IN ('budget_line', 'income_actual', 'receipt_txn', 'receipt_line'))`
- a conditional CHECK: a receipt-sourced proposal must carry its receipt, a
  workbook-sourced one must not.

**A gear proposal is a new `target` value, so that CHECK must be widened**, and
251's own header records why that is not free: *"a CHECK constraint cannot be
widened with ADD COLUMN IF NOT EXISTS or ALTER ... IF NOT EXISTS. It must be
drop-and-recreate"*. The doc says D-4 "may need a `source` discriminator; check
what receipts already added" — the answer is that receipts added `receipt_id`
and widened `target`, and gear needs a further widening plus a matching
conditional CHECK. **D-4 is paste-gated**, which the doc's own gating section
did not list (it flagged only D-3 as possibly needing SQL).

## Verdict

D-1 and D-2 are unblocked on repo evidence, subject to §1.
D-3 is paste-gated as the doc expected.
**D-4 is paste-gated and the doc did not expect it.**
