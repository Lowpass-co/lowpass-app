# Pre-UX14 Cleanup + UX14 Re-run

> Four small steps to button up loose ends from UX13 finish, then re-run UX14 (Budget rebuild) on a clean migration sequence. Do them in order. Total scope: ~30 mins of focused work.

---

## 0. Read first

1. `CLAUDE.md` at repo root.
2. `database/migrations/README.md`.
3. `docs/cursor-prompts/CURSOR_PROMPT_UX14_BUDGET_REBUILD.md` — the original UX14 prompt; you'll re-run this in step 4 with one numbering override.

---

## 1. Step 1 — Stash recovery + audit

The previous UX14 attempt was wiped during a `git reset --hard` after a bad stash pop. There's still a stash from before the reset:

```
stash@{0}: On ux01-tokens-foundation: ux13-wip-pre-partner-merge
```

**Don't apply it** — UX14 is being re-run cleanly on top of the corrected migration sequence. But the stash is potentially useful as a *reference* for what the previous UX14 attempt produced.

### 1.1 Inspect the stash

```bash
git stash list
git stash show --stat stash@{0}
git stash show -p stash@{0} | head -200
```

### 1.2 Save a reference copy

If the stash contains UX14 work (look for `BudgetClient.tsx`, `BudgetSection.tsx`, `BudgetLineSlideOver.tsx`, anything in `src/components/budget/sections/`, `src/lib/budget/`, a `*_budget_section_normalisation.sql` migration), save it as a patch you can refer to but won't accidentally apply:

```bash
git stash show -p stash@{0} > /tmp/wiped-ux14-reference.patch
echo "=== Files in the wiped UX14 work ==="
grep -E "^diff --git" /tmp/wiped-ux14-reference.patch | head -50
```

**Keep that patch file** in `/tmp/`. When you re-run UX14 in step 4, you can compare against it to make sure you don't re-discover the same schema decisions or repeat the migration-numbering mistake.

### 1.3 Drop the stash only after the patch is saved

```bash
ls -la /tmp/wiped-ux14-reference.patch    # confirm it exists and has size
git stash drop stash@{0}
```

If the stash file is empty or doesn't contain budget work, drop the stash without saving — nothing to recover.

**Commit:** none. This is investigation only.

---

## 2. Step 2 — Verify and (if needed) widen the tour-files query

UX13 finish step 5 added `src/lib/tour-files/buildTourFileVms.ts` which unions:
- `rider_assets` for the tour
- `file_references` where `linked_to_type IN ('tour', 'routing')`

The `'routing'` value is an assumption about how show-day rows are tagged in `file_references`. If your data uses a different label, files attached to shows won't appear in the tour files list.

### 2.1 Run this SQL against your dev/staging Supabase

```sql
SELECT linked_to_type, COUNT(*) AS n
FROM public.file_references
GROUP BY linked_to_type
ORDER BY n DESC;
```

You'll get something like:
```
 linked_to_type | n
----------------+-----
 advance        | 1234
 routing        |  567
 personnel      |  321
 ...            | ...
```

### 2.2 Reconcile with the query

Open `src/lib/tour-files/buildTourFileVms.ts`. Find the `.in('linked_to_type', [...])` (or equivalent filter) call.

- If the SQL output shows **only `'tour'` and `'routing'`** as the tour-related values: leave the query as-is.
- If show-related files are tagged with a **different label** (e.g. `'show'`, `'show_day'`, `'venue'`): widen the array to include those values. Document the choice with a one-line comment.
- If the SQL shows tour-related files have **no current value** matching either: investigate whether `file_references` is the right table at all — files might be reachable via a different path (e.g. `advance_files.routing_id`).

### 2.3 Commit

If you changed the query:

```
fix(tour-files): widen linked_to_type filter to match actual schema values

Verified via SELECT linked_to_type, COUNT(*) FROM file_references — show-day
attachments use '<value>' (not 'routing' as initially assumed). Widened the
union query in buildTourFileVms so the tour Files page shows them.
```

If no change needed, no commit.

---

## 3. Step 3 — Sidebar nav: expose `/tours/[id]/rider-packs` and `/tours/[id]/files`

UX13 finish landed those two routes but did not add them to the tour-shell sidebar. They're navigable only via deep links right now. Add them.

### 3.1 Find the right surface

The tour-shell left rail is rendered via the `dashboardForTour` rail helper (or similar — check `src/lib/shell/rails/`). The current set of links includes Routing / Advance / Budget / Personnel / Rooming and probably others. Add **Rider Packs** and **Files** alongside them.

```bash
ls src/lib/shell/rails/
grep -rln "rider-packs\|/files" src/lib/shell/ src/components/layout/ | head -10
```

### 3.2 Add the two entries

In whichever rail-data helper drives the tour sidebar (likely `src/lib/shell/rails/dashboardForTour.ts` or a sibling `tourSectionsNav.ts`):

- **Rider Packs** — `href: \`/tours/\${tourId}/rider-packs\``, icon: `Package` or `Layers` from lucide
- **Files** — `href: \`/tours/\${tourId}/files\``, icon: `Folder` or `Files` from lucide

Place them after Personnel/Rooming and before Channel List (or wherever feels natural in the existing order). Match the existing entry shape exactly — same prop names, same active-match function.

### 3.3 Verify

Run dev (`npm run dev`), navigate to a tour. Both new entries should appear in the left rail. Click each — should land on the correct page. Refresh on each — active state highlights correctly.

### 3.4 Commit

```
UX13 follow-up: add Rider Packs + Files to tour shell left rail

Routes existed after UX13 finish step 4-5 but weren't navigable from the
sidebar. Adds two entries to the tour-scoped rail data helper.
```

---

## 4. Step 4 — Re-run UX14 (Budget rebuild) on the clean migration sequence

**Override on the original UX14 prompt:** the migration MUST be numbered **053** (next sequential after `052_gear_canonical.sql` in the now-clean migration directory). The previous attempt picked 050 which collided with the renumbered Person migration.

### 4.1 Numbering rule for this run

Before writing a single line of migration SQL, run this to confirm the current ceiling:

```bash
ls database/migrations/[0-9][0-9][0-9]_*.sql | sort | tail -5
```

You should see `052_gear_canonical.sql` as the highest. **Therefore your budget migration filename is `053_budget_section_normalisation.sql`.** Header inside the file must include `-- Migration 053`.

If for any reason the listing shows something higher than 052, pick the next number above the highest. Do not pick a number already in use, even on another branch.

### 4.2 Run the original UX14 prompt

Read and execute: `docs/cursor-prompts/CURSOR_PROMPT_UX14_BUDGET_REBUILD.md`.

Apply every section as written **EXCEPT**:

- §4 "Schema audit" — when you create the migration file, name it `database/migrations/053_budget_section_normalisation.sql` (NOT `050_*` as the prompt's example suggests if you've memoised the previous attempt). Header: `-- Migration 053`.
- §10 "Out of scope" — keep all of those out of scope.

Everything else in the UX14 prompt stands: the eight Budget sections, derived rows from canonical Flight/Person/Room/Gear entities, `<BudgetLineSlideOver>` using the `<SlideOver>` primitive, multi-currency totals via the static FX table in `src/lib/budget/fx.ts`, the math scratchpad with "Set as Actual" affordance, the legacy budget code moved to `src/_legacy/budget/`, etc.

### 4.3 Cross-reference against the wiped UX14 patch (optional)

If you saved `/tmp/wiped-ux14-reference.patch` in step 1.2, you can spot-check decisions you make against the previous attempt:

```bash
grep -A 30 "BudgetSection.tsx" /tmp/wiped-ux14-reference.patch | head -50
grep -A 30 "BudgetClient.tsx" /tmp/wiped-ux14-reference.patch | head -50
```

The previous attempt produced working code; if you find yourself making the same shape choices, that's good (consistency). If you find yourself making different choices, that's also fine — just verify they're better, not worse.

**Don't `git apply` the patch.** It'll re-introduce the old migration number (050) and the duplicate gear migration. Use it only as reference.

### 4.4 Verification before commit

```bash
npm run lint
npm run typecheck
```

Both must exit clean. **Don't run `npm run build`** — Turbopack hangs on Drive (per CLAUDE.md). Test manually via `npm run dev` instead:

- Navigate to `/tours/[id]/budget`
- Confirm all eight sections render with the correct columns
- Edit a cell, confirm optimistic update + persisted save
- Click a budget row → `<BudgetLineSlideOver>` opens via `<SlideOver>` primitive (NOT rolled-own chrome)
- Try editing a derived row (one linked to a flight or hotel) — should be read-only with a "linked to..." indicator
- Resize to mobile — slide-over becomes a bottom sheet

### 4.5 Commit plan

Three commits per the original UX14 prompt §14:

1. `UX14: Budget — schema migration (053), section types, column defs`
2. `UX14: Budget — page composition, sections, totals, currency`
3. `UX14: Budget — slide-over with math scratchpad; retire legacy budget code`

---

## 5. Hard rules across all four steps

1. **No new dependencies** anywhere.
2. **Use the `<SlideOver>` primitive** for `<BudgetLineSlideOver>`. Don't roll your own chrome — the four entity slide-overs already paid that tax in UX13 finish.
3. **All visual values via `var(--lp-…)` tokens.** Hex+alpha for orange tints, never JS string concatenation.
4. **Workspace-scoped via existing RLS helpers** (`public.get_my_workspace_id()`, `public.is_workspace_admin()`).
5. **Migration MUST be 053.** Read `database/migrations/README.md`. The two prior collisions are documented as historical precedent — don't be the third.
6. **No `any`. No `// @ts-ignore`. No commented-out code.**
7. **Lint + typecheck clean** before each commit.

---

## 6. Acceptance criteria

- [ ] Stash from `ux01-tokens-foundation` either inspected and dropped, or saved to `/tmp/wiped-ux14-reference.patch`
- [ ] `file_references.linked_to_type` values verified; query in `buildTourFileVms.ts` widened if needed
- [ ] Tour shell left rail now shows Rider Packs + Files entries linking to correct routes
- [ ] UX14 budget migration named `053_budget_section_normalisation.sql` with `-- Migration 053` header
- [ ] All UX14 prompt acceptance criteria from §12 of the original prompt met
- [ ] `<BudgetLineSlideOver>` uses `<SlideOver>` primitive
- [ ] Old budget code in `src/_legacy/budget/`
- [ ] Lint + typecheck clean

---

## 7. End

After this, the codebase is at a clean checkpoint: UX01–UX14 complete on a single migration sequence, all entity slide-overs use the primitive, four canonical entities + budget all wired together. UX15 (other spreadsheets — Payroll, Channel List, Routing) is the natural next step.

If anything's ambiguous, stop and ask Adam in chat. He'd rather clarify than have you guess.
