# Audit Fixup — 2026-05-01

Companion to `AUDIT_2026-05-01.md`. Lists what changed in this session, which files belong to the fixup, what to commit, and what's queued as a CC sprint.

## Heads-up: working tree is dirty

When I checked out `main`, the on-disk content from `feat/product-split-phase3` stayed on the filesystem (Drive permissions blocked git's lockfile cleanup). So `git status` on `main` shows BOTH my fixup edits AND every Phase 3 file as modified/untracked. Don't `git add .` — that would commit Phase 3 content onto `main` outside the Phase 3 PR.

Files for THIS PR are listed in §1. Everything else belongs to Phase 3 (already on `feat/product-split-phase3` and tracked in PR #N when you push it).

---

## 1. Files belonging to the audit fixup PR

Modified:
```
CLAUDE.md
package.json
package-lock.json
src/app/(app)/artists/[id]/page.tsx
src/app/globals.css
```

New:
```
database/migrations/065_storage_buckets_orphan_capture.sql
docs/handover/AUDIT_2026-05-01.md
docs/handover/AUDIT_FIXUP_2026_05_01.md       ← this file
docs/handover/CC_MIGRATION_RUNNER.md
docs/handover/CC_RENTAL_DENORMALISE.md
docs/handover/CC_MIGRATION_RENUMBER.md
docs/handover/PR_VERIFICATION_2026_05_01.md
```

Cleanup needed (zero-byte test artefact bash couldn't delete):
```
database/migrations/_test_write.txt          ← rm this from your shell, it's a sandbox leftover
```

NOT part of this PR (belongs to Phase 3 — leave on the Phase 3 branch):
```
src/app/(app)/budget/[tourId]/page.tsx
src/app/(app)/budget/[tourId]/settlement/page.tsx
src/app/(app)/tours/[id]/page.tsx
src/app/api/budget/line-items/route.ts
src/components/budget/BudgetLineSlideOver.tsx
src/components/budget/BudgetTourRedirect.tsx
src/lib/search/providers.ts
src/lib/shell/rails/dashboardForTour.ts
src/types/index.ts
src/components/budget/BudgetSpreadsheetView.tsx
src/components/budget/BudgetStatsStrip.tsx
src/components/budget/BudgetSummaryTab.tsx
src/components/budget/BudgetTabNav.tsx
src/components/budget/BudgetTabPlaceholder.tsx
database/migrations/064_budget_line_items_phase_tag.sql
docs/handover/CC_PRODUCT_SPLIT_PHASE3.md
docs/handover/AGENT_HANDOVER_2026_04_30.md   ← the original handover, also untracked but belongs in main
.claude/settings.local.json                  ← local-only, gitignored anyway
```

---

## 2. Commit walkthrough

In Terminal, on the `main` branch with the dirty tree:

```bash
# 1. Make a clean branch off main for this fixup.
git checkout -b fix/audit-2026-05-01

# 2. Remove the bash-leftover sentinel.
rm database/migrations/_test_write.txt   # (you may need sudo, drive permissions)

# 3. Stage only the audit-fixup files (do NOT use git add .).
git add CLAUDE.md \
        package.json package-lock.json \
        src/app/\(app\)/artists/\[id\]/page.tsx \
        src/app/globals.css \
        database/migrations/065_storage_buckets_orphan_capture.sql \
        docs/handover/AUDIT_2026-05-01.md \
        docs/handover/AUDIT_FIXUP_2026_05_01.md \
        docs/handover/CC_MIGRATION_RUNNER.md \
        docs/handover/CC_RENTAL_DENORMALISE.md \
        docs/handover/CC_MIGRATION_RENUMBER.md \
        docs/handover/PR_VERIFICATION_2026_05_01.md

# 4. Sanity check — confirm the diff is JUST the fixup files.
git status --short
git diff --cached --stat

# 5. Commit + push.
git commit -m "chore(audit): 2026-05-01 fixup — orphan storage buckets, dead deps, palette tokens, doc refresh

- Migration 065 captures orphan storage buckets (receipts, budget-files,
  artist-assets) so fresh-clone bootstrap reproduces production.
- Removes @heroui/react and pg from package.json (zero imports).
- Adds --color-lp-tour-color-{1..6} tokens; tour calendar palette in
  src/app/(app)/artists/[id]/page.tsx now references vars.
- Refreshes CLAUDE.md: shell-v2 / shell-v1 coexistence, UX13 sweep
  noted as done, TourBreadcrumb softened, migration warnings updated.
- Writes AUDIT_2026-05-01.md (full audit), AUDIT_FIXUP_2026_05_01.md
  (this commit walkthrough), three queued CC prompts (migration runner,
  rental denormalise, migration renumber), and PR_VERIFICATION_2026_05_01
  (cross-check of the two ready feature branches against their prompts).

Made-with: Cowork Claude (audit + fixup pass)"

git push origin fix/audit-2026-05-01
```

GitHub merge link will appear in the push output — open it, smoke-check, merge.

If `git checkout -b fix/audit-2026-05-01` fails because of the index lock from the sandbox, try in Terminal:
```bash
rm -f .git/index.lock
git checkout -b fix/audit-2026-05-01
```

---

## 3. What to apply in Supabase (manual paste)

Migration 065 is idempotent — safe to paste even if some buckets / policies already exist.

1. Open Supabase SQL Editor.
2. Open `database/migrations/065_storage_buckets_orphan_capture.sql` in your editor (TextEdit handles it cleanly).
3. Cmd+A → Cmd+C → paste into SQL Editor → Run.
4. Verify with:
```sql
SELECT id FROM storage.buckets
 WHERE id IN ('receipts','budget-files','artist-assets');
-- Expect 3 rows.

SELECT polname FROM pg_policy
 WHERE polname LIKE '%budget_files_storage%' OR polname LIKE '%receipts_storage%';
-- Expect 8 rows (4 per bucket × 2 buckets; artist-assets policies were in 007).
```

---

## 4. What's queued for CC

Three prompts in `docs/handover/`:

- `CC_MIGRATION_RUNNER.md` — top-priority systemic fix. Builds a tracking table + Node runner script. Five commits. Run this BEFORE the renumber prompt — the renumber depends on the tracking table existing.
- `CC_RENTAL_DENORMALISE.md` — denormalises `workspace_id` onto `rental_inventory` / `rental_jobs` / `rental_job_items`, rewrites the one workspace_members caller, swaps RLS to canonical pattern. Three migrations + src/ changes.
- `CC_MIGRATION_RENUMBER.md` — fixes the seven duplicate migration numbers. Eight commits. **Run after the runner.**

Each prompt is self-contained and follows the established CC format (required reading → hard rules → phases with acceptance + commit messages → verify → "when done" report).

---

## 5. Two PRs already ready (separate from this fixup)

`PR_VERIFICATION_2026_05_01.md` covers:

- `feat/advance-visual-redesign` — 8 files, 2244 / 54. Verified against `CC_ADVANCE_VISUAL_REDESIGN.md`.
- `feat/product-split-phase3` — 18 files, 3002 / 227. Verified against `CC_PRODUCT_SPLIT_PHASE3.md`. Paste migration 064 into Supabase BEFORE merging.

Smoke flow + merge instructions for each are in that doc.

---

## 6. Audit findings I did NOT fix (they live on as queued work)

- `workspace_members` orphan: only one caller (`src/app/api/gear/rental-inventory/route.ts`). The `CC_RENTAL_DENORMALISE.md` prompt removes the dependency entirely, so writing a CREATE TABLE migration would be wasted work — drop the dependency, then optionally drop the table from production. Audit's "30+ callers" claim was a grep miscount; corrected here.
- The seven duplicate migration numbers — too risky for me to renumber without the runner's tracking-table backing. CC sprint covers it.
- The migration runner itself — substantial enough to deserve its own focused sprint. CC prompt is ready.
- Two budget surfaces coexisting (the dual-surface from the audit §1.2). Phase 3 doesn't delete `src/app/(app)/budget/page.tsx`. Captured as a Phase 3 follow-up in `PR_VERIFICATION_2026_05_01.md` §"PR 2 — open issue".
- 202 hardcoded hex outside allowed orange variants — most are defensible (PDF export, Google OAuth, theme.ts). The Home calendar palette was the single visual-lock violation; fixed in this commit.

---

## 7. Next session priorities

In order:
1. Merge `feat/advance-visual-redesign` (no migration; lowest risk).
2. Paste migration 064 → merge `feat/product-split-phase3`.
3. Commit + merge this audit fixup PR.
4. Hand `CC_MIGRATION_RUNNER.md` to CC.
5. Hand `CC_RENTAL_DENORMALISE.md` to CC.
6. Hand `CC_MIGRATION_RENUMBER.md` to CC (after the runner lands).
7. One-commit follow-up: thin `/budget` redirect to delete the dual-surface.
