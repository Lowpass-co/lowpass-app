# CC Sprint — Renumber duplicate migrations

> Seven migration numbers are duplicated on `main`. A future migration runner (see `CC_MIGRATION_RUNNER.md`) will silently apply only one of each pair. This sprint fixes that — renumbering each duplicate's "later" file to the next free slot, with a paper trail.
>
> **Run this AFTER `CC_MIGRATION_RUNNER.md` lands.** The runner's `_lp_migrations` tracking table records applied filenames; this sprint changes some of those filenames; the renumber needs the runner's tracking to be in place so it can update the table atomically. Running it before the runner will produce a tracking table that's inconsistent with the directory.
>
> Out of scope: changing what any migration does. Renumbering only — the SQL inside each file is untouched. If a renumbered file's content needs fixing, that's a separate migration.

---

## 0. Required reading

1. `CLAUDE.md`
2. `database/migrations/README.md`
3. `docs/handover/SQL_DRIFT_AUDIT_2026_04_30.md` §5 — the duplicate inventory
4. `docs/handover/AUDIT_2026-05-01.md` §2.1 — confirms duplicates still present
5. `docs/handover/CC_MIGRATION_RUNNER.md` — must run first
6. Each duplicated migration pair (read both files in each pair to understand which to renumber)

---

## 1. Hard rules

1. No new dependencies.
2. **Renumber the second file in each pair, not the first.** "Second" = the one that's logically later (newer feature, smaller scope, or whichever doesn't share its name with the canonical timeline). Decisions per-pair below.
3. Never delete a migration. If you think a migration should be deleted, surface it and ask Adam.
4. Idempotent SQL — renumbering doesn't change content but preserve idempotency markers.
5. **Update `public._lp_migrations` to record the renumber** — a one-line UPDATE per renumbered file inside a single migration that runs atomically. Without this, the runner sees the new filename as "pending" and re-applies it.
6. Lint clean (75/120 baseline). Typecheck clean.
7. One commit per renumber pair (seven commits total). Plus one final commit for the tracking-table update migration.
8. Verify before claiming.

---

## A. The seven pairs and the resolution per pair

CC: read both files in each pair. Use the table below as the resolution; if a file's content surprises you (e.g. you discover the "later" file actually depends on the "earlier"), surface and ask before proceeding.

| # | Files | Renumber → | Reason |
|---|---|---|---|
| 1 | `017_budget_system.sql` + `017_024_combined_budget_system.sql` | Delete `017_budget_system.sql` (or move to `database/migrations/_legacy/`); keep `017_024_combined_budget_system.sql` as `017_budget_system.sql`? | The `017_024_combined` filename suggests this is already the merged version. Read both. If `017_budget_system.sql` is a strict subset of the combined file, **archive** it under `database/migrations/_legacy/017_budget_system_pre_combine.sql.bak` and rename `017_024_combined_budget_system.sql` → `017_budget_system.sql`. Otherwise, surface and ask. |
| 2 | `018_advance_templates_sort_order.sql` + `018_profiles_job_title_phone.sql` | Renumber `018_profiles_job_title_phone.sql` → `029_profiles_job_title_phone.sql` | Profiles work is unrelated to advance templates; the advance work likely came first chronologically. Verify against git history. |
| 3 | `019_advance_layout_templates_workspace.sql` + `019_storage_avatars_bucket.sql` | Renumber `019_storage_avatars_bucket.sql` → `030_storage_avatars_bucket.sql` | Same logic. Storage avatars is its own concern. |
| 4 | `024_profiles_extended.sql` + `024_rich_line_items.sql` | Verify which came first via git log; renumber the later one. Likely renumber `024_rich_line_items.sql` since `017_024_combined_budget_system.sql` already references the 024-era budget work. | Cross-reference required. |
| 5 | `025_personnel_roster_link.sql` + `025_storage_avatars.sql` | Renumber `025_storage_avatars.sql` → next free slot. Prefer keeping the personnel migration at 025 since 025_personnel_roster_link.sql is referenced by `017_024_combined_budget_system.sql` and `050`. | Storage migrations are typically standalone. |
| 6 | `026_line_item_links.sql` + `026_personnel_extended_profile.sql` | Renumber `026_personnel_extended_profile.sql` → next free slot. Keep budget at 026. | Budget work has more downstream references. |
| 7 | `035_bug_reports_reconcile.sql` + `035_rental_jobs_billing_details.sql` | Renumber `035_rental_jobs_billing_details.sql` → next free slot. Keep `bug_reports_reconcile` at 035 since it's part of a sequence (033 → 035 bug reports). | Bug reports is sequential; rental is standalone. |

The "next free slot" pool depends on what's used by the time you run this. Current free slots before 064: **029, 030**. After 030 is used in §A.3, the next would be at the END of the migration sequence (after the highest used number). Adam will probably prefer keeping renumbered duplicates close to the original number when possible, but if 029/030 are exhausted, fall through to whatever's free above 064.

CC: enumerate the next-free pool by:

```bash
ls database/migrations/[0-9][0-9][0-9]_*.sql | sort | sed -E 's/.*\/([0-9]{3}).*/\1/' | sort -u
```

Compare to `seq -w 1 64` → identify the gaps.

### A.1–A.7 Per-pair commits

For each pair, the commit follows the same shape:

1. Rename the file in git: `git mv 018_profiles_job_title_phone.sql 029_profiles_job_title_phone.sql`.
2. Update the file's header comment to reflect the new number (`-- Migration 029` instead of `-- Migration 018`).
3. Add a top-of-file note: `-- Renumbered from 018 → 029 on 2026-05-01 to resolve duplicate migration numbers. Original applied as 018 in production; the runner's tracking-table update in MNNN handles the rename atomically.`
4. Verify nothing else in `database/migrations/*.sql` references the old number (none should, but check).
5. Commit:

```
chore(migrations): renumber 018_profiles_job_title_phone.sql → 029

Resolves the 018 duplicate. Production has both files applied as
'018_profiles_job_title_phone.sql' and '018_advance_templates_sort_order.sql';
the runner cannot disambiguate. This commit renumbers the profiles work
to 029 (next free slot) so the directory is unambiguous.

The _lp_migrations tracking-table rename happens in MNNN. Until that
migration runs, the runner will see 029_profiles_job_title_phone.sql as
"pending" — apply MNNN before the next runner invocation.

Made-with: Claude Code (migration renumber sprint)
```

Repeat for each pair.

---

## B. Tracking-table rename migration (~20 min)

After all seven renames are committed, write one migration that updates `public._lp_migrations` to match.

### B.1 Filename

`database/migrations/NNN_rename_duplicate_migrations_in_tracking.sql` (next free after the renumbers).

### B.2 SQL

```sql
-- ============================================
-- LOWPASS — Rename duplicate migrations in tracking table
-- Migration NNN
--
-- The seven duplicate-numbered migrations (017, 018, 019, 024, 025, 026,
-- 035) were renumbered on 2026-05-01. Production has the OLD filenames
-- recorded in public._lp_migrations. This migration renames them so
-- the tracking table matches the directory.
--
-- Idempotent: every rename is gated on the OLD filename existing AND
-- the NEW filename NOT existing. Re-running is a no-op.
-- ============================================

UPDATE public._lp_migrations
SET filename = '029_profiles_job_title_phone.sql'
WHERE filename = '018_profiles_job_title_phone.sql'
  AND NOT EXISTS (
    SELECT 1 FROM public._lp_migrations
    WHERE filename = '029_profiles_job_title_phone.sql'
  );

-- repeat for each pair, gated on existence checks for both old + new
```

### B.3 Acceptance

- [ ] Every renamed file's old name no longer appears in `_lp_migrations`.
- [ ] Every renamed file's new name appears exactly once.
- [ ] `npm run db:migrate -- --dry-run` reports zero pending after Adam pastes this migration.
- [ ] Idempotent.

### B.4 Commit

```
chore(migrations): NNN — rename duplicate-numbered files in _lp_migrations

The seven renumbered migrations from §A need their filename in
public._lp_migrations updated so the runner sees them as already-applied
(under their new names). Without this, the runner would re-attempt them
and most would error on "already exists".

Idempotent — every UPDATE is gated on the old-filename existing AND
the new-filename NOT existing.

Made-with: Claude Code (migration renumber sprint)
```

---

## V. Verify (~20 min)

### V.1 Directory state

```bash
ls database/migrations/[0-9][0-9][0-9]_*.sql | sort | sed -E 's/.*\/([0-9]{3}).*/\1/' | sort | uniq -c | awk '$1 > 1'
```

Expected: empty output (no duplicates).

### V.2 Tracking table state (Adam)

```sql
-- Old duplicates should not appear:
SELECT filename FROM public._lp_migrations
WHERE filename IN (
  '018_profiles_job_title_phone.sql',
  '019_storage_avatars_bucket.sql',
  '024_rich_line_items.sql',
  '025_storage_avatars.sql',
  '026_personnel_extended_profile.sql',
  '035_rental_jobs_billing_details.sql'
);
-- Expect: 0 rows

-- New names should appear:
SELECT filename FROM public._lp_migrations
WHERE filename IN (
  '029_profiles_job_title_phone.sql',
  '030_storage_avatars_bucket.sql',
  -- (etc. — list every new filename from §A)
);
-- Expect: one row per renamed file
```

### V.3 Runner smoke

```bash
DATABASE_URL=... npm run db:migrate -- --dry-run
```

Expected: "No pending migrations." If anything appears pending, the renames missed something — surface in the report.

---

## When done

```
Migration renumber done.
Commits: <hashes> (seven renumbers + one tracking update)
- 018 → 029, 019 → 030, 024 → ..., 025 → ..., 026 → ..., 035 → ...
- 017 pair: ARCHIVED 017_budget_system.sql to _legacy/, kept combined.
- Tracking table updated in migration NNN.

Adam's paste loop:
- Migration NNN (the tracking update) — paste in Supabase SQL Editor
  AFTER pulling the renumber commits but BEFORE running the runner.
- Then `npm run db:migrate -- --dry-run` to confirm zero pending.

Directory state: zero duplicate numbers.
Tracking table state: every renamed file appears exactly once under new
                      name; old name is gone.
```

If you discover a pair where the resolution rule in the table doesn't fit (e.g. an "earlier" file imports from the "later" one — would be a real surprise), halt and surface. Don't guess at the renumber direction.
