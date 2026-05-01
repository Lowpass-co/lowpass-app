# PR Verification — 2026-05-01

Two PRs ready off `main`. Both were "written, unrun" in the 04-30 handover; both have been run by CC since. This doc cross-checks each branch against its prompt (Hard Rule #7 verify-before-claiming) and lists the smoke flow per PR. Read once, then merge in either order — no dependency between them.

---

## PR 1 — `feat/advance-visual-redesign`

**Prompt:** `docs/handover/CC_ADVANCE_VISUAL_REDESIGN.md` (committed on the branch).
**Diff size:** 8 files, 2244 / 54 (added/removed). 2 commits.
**GitHub merge link:** `https://github.com/Lowpass-co/lowpass-app/pull/new/feat/advance-visual-redesign`

### What CC built (verified against prompt)

The two commits map cleanly to the prompt's §A and §B:

- `79dae47` — §A. Three new components (`AdvanceSubHeader`, `AdvanceShowHeader`, `AdvanceUpcomingSidebar`) + 245 lines of changes to `src/app/(app)/advance/[tourId]/[routingId]/page.tsx` to wire them.
- `4938a0c` — §B. New `AdvanceOverviewStatsStrip` (137 lines) + 73 lines of changes to `src/app/(app)/advance/[tourId]/page.tsx` to wire it.

### Per-prompt-section check

| Prompt requirement | Verified? | Evidence |
|---|---|---|
| Sub-header beneath ProductHeader: "ADVANCE / show name" + tabs + keyboard hints + Export PDF | ✓ | `AdvanceSubHeader.tsx` header comment names this exactly |
| 280px left sidebar: upcoming shows for this tour, completion %, "Copy advance from..." dropdown, active show with brand-orange left border | ✓ | `AdvanceUpcomingSidebar.tsx` is 394 lines, shape matches |
| Sticky big-header in main: H1 show name, city + date, template badge, last-edited line, Advance Progress card (X / Y sections complete framing) | ✓ | `AdvanceShowHeader.tsx` — header comment explicitly notes "Adam's lock: NO 'Mark All Complete' button. NO 'Tasks done' wording" |
| Tab nav replaces `?mode=edit` (Option A — minimum diff) | ✓ | `AdvanceSubHeader.tsx` comment: "Tab nav switches between Show (read view) and Template Builder (edit view) via ?mode=edit. Same URL pattern that's been live since UX17 — Option A" |
| Existing features preserved (Previously Played, drag-drop, custom sections, save layout, apply template, copy from show, bulk update) | ✓ | `page.tsx` still imports `AdvanceShowReadView`, `AdvanceSectionBuilderDynamic`, `PreviouslyPlayedButton`, etc. |
| No "Mark All Complete" / "Tasks Done" framing | ✓ (audit grep confirms zero hits in src/) | |
| Overview stats strip on `/advance/[tourId]`: tour progress %, shows complete, shows pending, days until first/last show | ✓ | Commit message names all five stats; component is 137 lines |

### Smoke flow (Adam, on the Vercel preview)

Spin a preview deploy from the branch (Vercel does this automatically on push to a feature branch). Then:

- [ ] Navigate to `/advance/[any tourId]/[any routingId]`. Three-zone layout renders: sub-header (ADVANCE / show name + tabs + Export), 280px sidebar with upcoming shows, main column with sticky big-header.
- [ ] Click "Template Builder" tab → URL becomes `?mode=edit`, content swaps to the section builder.
- [ ] Click "Show" tab → URL drops `?mode=edit`, content swaps back to the read view.
- [ ] In the sidebar, type into the search box → list filters.
- [ ] Click a different show in the sidebar → URL navigates, big-header updates, sidebar re-highlights.
- [ ] "Copy advance from..." dropdown → opens copy-from-show modal, picking a source still works.
- [ ] Big-header shows: show name as H1, city + date, template badge (if applied), last-edited line. Progress card reads "X / Y sections complete" — NOT "X tasks done".
- [ ] No "Mark All Complete" button anywhere.
- [ ] Previously Played sidebar (Phase 2 feature) still works on the per-show page.
- [ ] Drag-drop section reorder still works in builder mode.
- [ ] On `/advance/[tourId]` (the overview), the new stats strip renders sticky beneath ProductHeader. Five mono numbers with uppercase labels.

### Pre-merge checks

- [ ] CI green on the branch (Vercel preview deploys; no GitHub Actions on this repo per my knowledge).
- [ ] Lint baseline holds (75 / 120). Quick local check: `npm run lint` after pulling.
- [ ] Typecheck zero errors: `NODE_OPTIONS=--max-old-space-size=4096 npm run typecheck` (sandbox needed 4GB; your Mac probably needs the same with cold caches).

### If anything fails smoke

- Component-level bug → write a `CC_ADVANCE_FIXUP_3.md` prompt, hand to CC. Don't merge then patch on `main`.
- Major structural mismatch with Adam's expectation → don't merge, capture the gap in a fixup prompt.

### Merge

GitHub UI → "Squash and merge" or "Merge commit" (Adam's choice; the project doesn't have a documented standard, but past merges look like merge commits — `Merge pull request #N from ...`). Once merged, Vercel auto-deploys `main`.

---

## PR 2 — `feat/product-split-phase3`

**Prompt:** `docs/handover/CC_PRODUCT_SPLIT_PHASE3.md` (committed on the branch — 478 lines).
**Diff size:** 18 files, 3002 / 227 (added/removed). 5 commits.
**GitHub merge link:** `https://github.com/Lowpass-co/lowpass-app/pull/new/feat/product-split-phase3`

### What CC built (verified against prompt)

| Commit | Maps to prompt section |
|---|---|
| `3deb0f9` — feat(migrations): 064 — budget_line_items.phase_tag column | §A migration |
| `9eb4957` — feat(budget): migrate /tours/[id]/budget/* → /budget/[tourId]/* | §A URL move + delete legacy paths |
| `f96594b` — feat(budget): dense spreadsheet template per Adam's reference | §B BudgetSpreadsheetView |
| `5403998` — feat(budget): Summary tab — big-picture overview separated from line items | §C tabs + Summary |
| `3eb3d37` — feat(budget): phase tagging + grouping toggle | §D phase column + group-by toggle |

### Per-prompt-section check

| Prompt requirement | Verified? | Evidence |
|---|---|---|
| Migration 064 adds `phase_tag` (TEXT, nullable) with CHECK constraint, idempotent | ✓ | File header notes idempotency strategy explicitly; CHECK added inside DO $$ block to avoid pg<15 ADD CONSTRAINT IF NOT EXISTS limitation |
| Old `/tours/[id]/budget/*` deleted (138 + 63 lines) | ✓ | `git diff --stat` shows both files marked as deletions |
| `/budget/[tourId]/page.tsx` becomes the real surface (188-line change) | ✓ | Page now imports `BudgetSpreadsheetView`, `BudgetSummaryTab`, `BudgetTabNav` — was 31-line placeholder pre-Phase 3 |
| `BudgetSpreadsheetView` (~1230 lines) replaces the old `BudgetMainTable` on the Budget tab | ✓ | New file present; header explicitly cites "Adam's product locks" |
| `BudgetTabNav` with five tabs (Summary / Budget / Actuals / Reports / Settings); default = Summary | ✓ | New file (99 lines); typed `BudgetTab` union enforces |
| `BudgetSummaryTab` with macro allocation, burn rate, variance summary, top spend, recent activity | ✓ | New file (568 lines) |
| Phase grouping toggle + Phase chip column | ✓ | `f96594b` and `3eb3d37` commit messages describe the toggle + chip wiring; persists via localStorage `lp-budget-group-by:<tour-id>` |
| Existing features preserved: Receipt Inbox, Quick Add templates, status chips, multi-currency, duplicate detection | ✓ (per BudgetSpreadsheetView header naming each one) | |
| Existing categories kept (Production / Logistics / Travel / Crew / Accommodation / Catering / Marketing / Insurance / Contingency) | ✓ (header explicitly preserves them; reference HTML's category list ignored per lock) | |

### Open issue: dual-surface partially survives merge

Phase 3 deletes `src/app/(app)/tours/[id]/budget/*` (the redirected route's filesystem mount). It does NOT delete `src/app/(app)/budget/page.tsx` (the old query-string `/budget?tour_id=X` surface). After merge:

- `/tours/X/budget` → 301 → `/budget/X` → new Phase 3 page. ✓
- `/budget?tour_id=X` → still hits the old eight-tab surface backed by `_legacy/budget/`. ✗

That's a follow-up. Captured in `docs/handover/AUDIT_2026-05-01.md` §1.2 + §3.5.

Three options for the follow-up:

1. **Delete `/budget/page.tsx` entirely** and add a redirect from `/budget?tour_id=X` to `/budget/[tourId]`. Cleanest. Lose the bookmarks-with-query-string entry path but the redirect catches it.
2. **Keep `/budget/page.tsx` as a thin redirect layer** that forwards `?tour_id=X` to `/budget/X`. Same end-state without touching `next.config.ts`.
3. **Defer.** Leave the dual-surface in place, address in a Phase 3.1 fixup once Adam confirms which entry path users actually use.

Recommendation: option 2 in a one-commit follow-up PR after Phase 3 merges.

### Pre-merge: paste migration 064 into Supabase first

```sql
-- Copy the entire contents of database/migrations/064_budget_line_items_phase_tag.sql
-- into Supabase SQL Editor → Run.
```

Without 064 applied, the Phase dropdown in the line-item slide-over will 400 on save (the API route validates `phase_tag` and the column doesn't exist yet). The commit in 064 is idempotent — safe to re-run.

### Smoke flow (Adam, on the Vercel preview, AFTER 064 is applied)

- [ ] Navigate to `/budget/[any tourId]`. Five tabs render: Summary / Budget / Actuals / Reports / Settings. Active tab = Summary.
- [ ] Summary tab shows: macro allocation donut, burn rate chart, variance summary (top three over/under), top spend categories bar list, recent activity table.
- [ ] Click "Budget" tab → URL becomes `?tab=budget`, content swaps to dense spreadsheet view.
- [ ] On the Budget tab: line-item rows render dense, sticky stats above, group headers spanning columns, mono numerics, sign-coloured variance.
- [ ] Click any line → BudgetLineSlideOver opens. New "Phase" dropdown sits between Category and Vendor in a 3-up grid.
- [ ] Pick a phase (Pre-prod / Rehearsals / Show days / Wrap) → autosaves via the diff-only PATCH path.
- [ ] Group-by toggle switches between "Category" and "Phase". Choice persists per-tour via localStorage (key `lp-budget-group-by:<tour-id>`).
- [ ] Phase chip with tokenised tint renders in each row.
- [ ] Receipt Inbox sidebar still drag-drops files in.
- [ ] Quick Add templates still work.
- [ ] Multi-currency display still works.
- [ ] Duplicate detection banner still appears for likely dupes.
- [ ] Status chips still render and update.
- [ ] Settlement page (`/budget/[tourId]/settlement`) still loads.
- [ ] Old `/tours/X/budget` URL → 301 → new Phase 3 page (smoke the redirect).
- [ ] Actuals / Reports / Settings tabs render placeholder with a useful link back to Budget tab + filter.

### Pre-merge checks

- [ ] Migration 064 applied to Supabase.
- [ ] CI / Vercel preview green.
- [ ] Lint baseline 75 / 120.
- [ ] Typecheck zero errors.

### Merge

GitHub UI → merge. Vercel auto-deploys.

### Post-merge follow-up

Open a one-commit PR off the new `main` to address the dual-surface (option 2 above). Filename suggestion: `fix/budget-query-string-redirect`. Adam can write the prompt or just do it himself — the change is ~10 lines.

---

## Summary checklist

Before either merge:

- [ ] Read this doc end-to-end.
- [ ] Smoke test PR 1 on Vercel preview.
- [ ] Smoke test PR 2 on Vercel preview (after pasting migration 064).
- [ ] Decide merge order. If you want minimum risk, merge PR 1 first (no DB changes, smaller surface).
- [ ] After both merge, clean up:
  - Capture the dual-surface fix in a follow-up.
  - Delete the merged feature branches on GitHub.
  - Stop here unless something broke.

If anything in either PR's smoke flow fails, halt and surface — don't merge then patch. The handover's "verify before claiming" rule cuts both ways: I'm claiming these are good based on diff inspection, but a smoke test trumps a diff every time.
