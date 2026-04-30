# SQL Drift Audit — 2026-04-30

Triggered by Adam's "billing_address column not found" bug. Sweep of every layer where repo SQL and live database can drift apart, with severity + immediate fix per finding.

The pattern keeps repeating because Lowpass has no automated migration runner. SQL files in `database/migrations/` are reference-only; someone has to paste them into Supabase SQL Editor by hand. Anything written but not pasted == latent bug.

---

## §1. The smoking gun (the bug Adam just hit)

| Migration | What it does | Status |
|---|---|---|
| `035_rental_jobs_billing_details.sql` | Adds `billing_address`, `billing_email`, `billing_phone`, `billing_tax_id` to `rental_jobs` | **Not applied to prod.** PostgREST schema cache → "column not found" error. |

**Fix:** paste the migration file's SQL into Supabase SQL Editor. Idempotent (`ADD COLUMN IF NOT EXISTS`) — safe to run.

---

## §2. Other migrations almost certainly not applied

These were written on this branch (or recent feature branches) and may or may not have been pasted into prod. Treat as suspect until verified.

| Migration | Risk | Why |
|---|---|---|
| `056_set_updated_at_function.sql` | **High** | Defines `public.set_updated_at()`. Migrations 049–055 (canonical entities) all reference it as a trigger. If 056 hasn't been applied first, all the canonical-entity migrations failed at trigger-creation time, leaving partial schema. |
| `057_rental_gear_link.sql` | **Medium** | Adds `gear.rental_inventory_id` FK. Active code (`src/app/api/gear/rental-inventory/route.ts`, `GearSlideOver.tsx`) reads/writes it. Without the column, gear ↔ rental linking silently no-ops. |
| `060_roles_wiring.sql` | **High** | On PR #4, not yet on this branch. Backfills `profiles.role_id`. Without it, `is_workspace_admin()` returns FALSE for everyone, blocking admin-gated DELETEs across canonical entities. |
| `061_rls_audit.sql` | **High** | On PR #5, not yet on this branch. The comprehensive RLS sweep that closes the recurring "missing INSERT after .insert(...).select()" class of bugs. |
| `062_initial_site_admins.sql` | **Low** | On PR #4. Promotes adam@ + ben@ to site admin. Without it, neither can see Bug Reports. |
| `063_budget_receipts_storage.sql` | **High** | Written for PR #6 round 2 fix-up (F1.3). Creates `budget-receipts` storage bucket + RLS policies. Without it, drag-drop receipt upload returns "new row violates row-level security policy." |

**Fix:** paste each in number order via Supabase SQL Editor. All idempotent (drop-then-create / `IF NOT EXISTS`).

---

## §3. Tables created via direct SQL paste — never written as migration files

These tables exist in production but have **no `CREATE TABLE` statement anywhere in `database/migrations/`**. A fresh-clone bootstrap reproduces a database that's missing them.

| Table | Used by | Origin |
|---|---|---|
| `rental_inventory` | `src/components/equipment/InventoryModal.tsx`, `src/app/api/gear/rental-inventory/route.ts`, `src/lib/rental-pricing.ts` | Adam pasted CREATE TABLE directly when the Equipment module was first built |
| `rental_jobs` | `src/components/equipment/JobModal.tsx` (the one Adam just hit), `src/app/api/equipment/jobs/...` | Same |
| `rental_job_items` | `src/components/equipment/JobDetail.tsx`, `JobModal.tsx` | Same |
| `advance_dropdown_options` | Migration 020 references it but the CREATE TABLE was apparently dropped from the file at some point — need to verify against live | Likely direct-pasted; documented in PR #5's discovery report §3.1 |
| `advance_schedule_templates` | Migration 021 — same issue | Same |

**Fix:** write CREATE TABLE migrations for the rental_* triplet. Spec-out in a follow-up sprint — not a 5-minute fix, since they need RLS policy decisions too. The rental_* tables are user-scoped (`user_id`), not workspace-scoped, which doesn't fit the canonical RLS audit pattern (PR #5 §3.1 documented this and deferred). Decide: denormalise a `workspace_id` column on, OR continue user-scoped + add proper user-scoped RLS via a separate audit.

---

## §4. Storage buckets referenced in code but missing or partial

Buckets need both (a) `INSERT INTO storage.buckets (id, name, public)` and (b) RLS policies on `storage.objects` filtered by `bucket_id = '<bucket>'`. Missing either causes "new row violates row-level security policy" on upload.

| Bucket | In code | Bucket created in migration | Policies in migration | Status |
|---|---|---|---|---|
| `advance-files` | yes | ✅ 016 | ✅ 016 | OK |
| `artist-assets` | yes | ❌ | ✅ 007 (policies only — bucket created via Supabase Dashboard) | **Fragile.** Works on prod where Adam created the bucket manually; a fresh-clone deploy won't have the bucket. |
| `avatars` | yes | ✅ 019/025 | ✅ 019/025 | OK |
| `budget-files` | yes (`src/app/api/expenses/...`, `BudgetMainTable.tsx`, etc.) | ❌ | ❌ | **Broken in any env where Adam hasn't manually created the bucket.** Needs migration. |
| `budget-receipts` | yes | ❌ | Written in 063 (unapplied) | **The Receipt Inbox bug.** Apply 063. |
| `bug-reports` | yes | ✅ 033 | ✅ 033 | OK |
| `deal-memos` | yes | ✅ 053 | ✅ 053 | OK |
| `personnel-files` | yes | ✅ 027 | ✅ 027 | OK |
| `receipts` | yes (separate from `budget-receipts`) | ❌ | ❌ | **Likely a stale string literal — Adam should grep callers and either route them to `budget-receipts` or delete the dead path.** |
| `rider-assets` | yes | ✅ 034 | ✅ 034 | OK |

**Fix priorities:**
1. Apply migration 063 (immediate budget receipt unblocker).
2. Write a migration for `budget-files` bucket + policies (mirror 016's pattern).
3. Audit the `receipts` bucket string in code — figure out if it's stale or if it's a legit separate bucket that needs its own migration.
4. Optional cleanup: backfill 007 with an `INSERT INTO storage.buckets` so a fresh-clone reproduces `artist-assets` without manual Dashboard work.

---

## §5. Duplicate migration numbers

Seven migrations share numbers with another file. The migration runner doesn't know which to apply first; whichever lands first wins, the other is skipped or errors.

| Number | Files | Resolution |
|---|---|---|
| `017` | `017_budget_system.sql` + `017_024_combined_budget_system.sql` | The `017_024` file is the canonical merged version. Delete `017_budget_system.sql` (or move to `_legacy/`). |
| `018` | `018_advance_templates_sort_order.sql` + `018_profiles_job_title_phone.sql` | Renumber one to `029`-ish (next free after 028). |
| `019` | `019_advance_layout_templates_workspace.sql` + `019_storage_avatars_bucket.sql` | Renumber one. |
| `024` | `024_profiles_extended.sql` + `024_rich_line_items.sql` | Renumber one. |
| `025` | `025_personnel_roster_link.sql` + `025_storage_avatars.sql` | Renumber one. |
| `026` | `026_line_item_links.sql` + `026_personnel_extended_profile.sql` | Renumber one. |
| `035` | `035_bug_reports_reconcile.sql` + `035_rental_jobs_billing_details.sql` | Renumber one. |

**Fix:** dedicated cleanup PR. **Don't bundle into another sprint** — renumbering is risky and needs its own review. Until then, anyone manually running migrations needs to apply both files at each duplicate number.

---

## §6. ALTER TABLE migrations — drift candidates

Any "ADD COLUMN IF NOT EXISTS" migration applied OUT OF ORDER or never applied causes the same symptom as `billing_address`. Verify each by querying `information_schema.columns` for the relevant table:

```sql
SELECT column_name, data_type
FROM information_schema.columns
WHERE table_schema = 'public' AND table_name = '<TABLE>'
ORDER BY ordinal_position;
```

Compare to the column list in the corresponding migration. If the live table is missing columns the migration adds, paste the migration SQL.

The full list of ALTER TABLE migrations to verify:

```
008_routing_address.sql
009_routing_lat_lng_transport.sql
010_tour_custom_day_types.sql
011_advance_system_enhancements.sql
012_tour_calendar_token.sql
013_tours_default_advance_template.sql
015_routing_venue_extended.sql
023_deal_info_section_tm_only.sql
024_profiles_extended.sql
024_rich_line_items.sql
028_rental_inventory_day_rate_manual.sql
035_rental_jobs_billing_details.sql   ← Adam's bug
057_rental_gear_link.sql
```

Quick verification query (run in Supabase SQL Editor) — surfaces any ADD-COLUMN migration where a column declared in the file is missing from the live table:

```sql
-- Replace TABLE_NAME with each table touched by the migrations above.
-- Or just spot-check the high-risk ones (rental_jobs, rental_inventory, gear, profiles, advance_instances).
SELECT column_name FROM information_schema.columns
WHERE table_schema = 'public' AND table_name = 'rental_jobs'
ORDER BY ordinal_position;
```

If `billing_address` is missing → apply 035. If `billing_address` is present but `rental_inventory_id` is missing on `gear` → apply 057. Same pattern.

---

## §7. Action plan (in priority order)

1. **Right now (Adam, 60 seconds):** paste the SQL from §1 into Supabase SQL Editor. Unblocks "Create Job" in Equipment.
2. **This week (Adam, 5 minutes per migration):** apply the §2 list — 056, 057, 060, 061, 062, 063 — in number order via Supabase SQL Editor. Each is idempotent.
3. **This week (Adam, 10 minutes):** run §6's verification query against `rental_jobs`, `rental_inventory`, `gear`, `profiles`, `advance_instances`, `routing`, `tours`. Confirm no other ADD-COLUMN migrations are unapplied.
4. **Next sprint:** §5 duplicate-number cleanup. Standalone PR. Renumber the seven dupes; verify against the prod migration history table (if Lowpass tracks one).
5. **Next sprint:** §3 — write CREATE TABLE migrations for `rental_inventory` / `rental_jobs` / `rental_job_items` so fresh-clone bootstrap reproduces them. Coordinate with the user-scoped RLS decision deferred in PR #5 §3.1.
6. **Next sprint:** §4 — audit `budget-files` and `receipts` bucket usage. Add migrations for buckets that should be tracked; delete dead callers for buckets that shouldn't.

---

## §8. Why this keeps happening (the systemic root cause)

Every drift bug Adam has hit traces back to one of three patterns:

1. **Direct-SQL-paste workflow.** Migration files are advisory; nothing enforces that they get run. Whatever's in `database/migrations/` is reference, not runtime.
2. **No verification step.** No "fresh clone → apply all migrations → does the app work?" CI pipeline. The first time anyone notices a missing column is when a feature breaks.
3. **No migration-runner state in prod.** Postgres has `pg_extension` and Supabase has its own internal state, but Lowpass doesn't track which `database/migrations/*.sql` files have been applied.

**Short-term fix (this sprint):** apply §1 + §2's pending migrations. That gets us back to "code matches DB" baseline.

**Medium-term fix (next sprint or two):** add a tiny migration runner. Could be as simple as a `_lp_migrations` table that tracks applied filenames + a `npm run db:migrate` script that diffs the directory against the table and applies the missing files in order. Existing tools like `node-pg-migrate`, `dbmate`, or `sqitch` would work too. Without this, every new migration is another roulette spin.

**Long-term fix:** automate via Supabase's CLI (`supabase db push`) or move to a fully versioned schema tool. Either way, get the human out of the loop on "did you remember to paste that SQL?"
