# Branch consolidation — 2026-07-03 (Adam executes; git ops don't work from the Cowork sandbox)

## State (verified by content-diff, not commit-count)

- `main` @ tip has absorbed **everything** from the CC_CONSOLIDATION_MERGE program. All revamp/export/sprint/income/versioning branches are `N/0` (fully merged).
- **`feat/data-integrity-pass`** (current): 9 commits strictly ahead of `main` (0 behind → fast-forward-able).
- **`feat/rates-ssot-part-a`**: 4 commits ahead, BUT its entire content is contained in `feat/data-integrity-pass` — `git diff feat/rates-ssot-part-a feat/data-integrity-pass -- <part-a files>` shows only 9 extra doc lines in `docs/smoke-tests/operations.md` on dip. **Redundant. Do not merge it separately.**
- 17 untracked/modified files sit on the working tree (migration `232_fix_day_rate_ssot_seed.sql`, 16 `docs/handover/CC_*.md`, modified `CLAUDE.md`).

## Steps (in order)

1. Review `git diff CLAUDE.md` — keep or discard the local edit deliberately (don't commit it blind).
2. Commit the untracked files on `feat/data-integrity-pass`. **Migration 232 must not stay untracked** — it's a precondition link in the 230→231 chain (drift audit, Top Risk #4).
3. `git checkout main && git merge feat/data-integrity-pass` → should fast-forward. Then `tsc --noEmit`, `eslint`, `next build --webpack` green. Push.
4. Delete the redundant live branch: `git branch -D feat/rates-ssot-part-a` (and `feat/rates-ssot-and-rider-features` — already merged, 1/0).
5. Mass-delete fully-merged branches:
   `git branch --merged main | grep -vE '^\*|main' | xargs -n1 git branch -d`
   (`-d` refuses anything unmerged, so this is safe.)
6. Stranded-branch verdicts (subagent-verified against main's tree; keep the 4 SALVAGE branches until CC_SALVAGE_FIXPACK.md lands, then delete):

| Branch | Verdict | Evidence |
|---|---|---|
| fix/connection-hydration-touch | **SALVAGE** | ConnectionIndicator still seeds `online` from `navigator.onLine` in useState init (#418 hydration repro); `/touch` still 401/500s; RollbackConfirmModal `params.delete('version')` race unfixed |
| claude/thirsty-swartz | **SALVAGE (reimplement — 877 behind)** | N+1 still live in `api/tours/[id]/advance/copy/route.ts:155`; layout-templates dup `template_label` write; no guard on routing-save advance cascade |
| feat/nav-redesign-artist-tour-hubs | **SALVAGE one commit (80a4738)** | single-artist post-auth auto-skip missing on main (root always redirects to `/artists` picker) |
| feat/sprint-11-closeout | **PARTIAL** | Advance "Today" button + mini routing-calendar (`findTodayShow.ts`, `AdvanceTodayButton.tsx`) have no main equivalent; nav chrome superseded |
| fix/advance-status-tokens | **PARTIAL (tiny)** | `AdvanceSectionBuilder.tsx` ~2862 still hardcodes `bg-gray-500`/`bg-emerald-500` vs `--color-lp-status-*` |
| claude/nostalgic-khorana-144dcb | DEAD | main ships `src/components/equipment/exportJobPdf.ts` (equivalent branded PDF) |
| chore/account-rental-redirect | DEAD | main's `/account/rental/page.tsx` already `redirect('/equipment')` |
| claude/peaceful-lamport-fa620f | DEAD | renumbering superseded by 200-block clean-break; rental denorm shipped as `095_*` |
| feat/receipts-overhaul-stagea, feat/versioning-state-fix-stagea | DEAD | their doc files exist byte-identical on main |
| feat/export-{stageplot-map, template-builder-stagea, stage-a-map}, feat/income-actuals-{stage-a, enrichment-stagea} | DEAD (doc-only) | planning docs never landed on main; cherry-pick the .md files only if you still want them |

7. After all of the above: `main` is the single line of development. Update CLAUDE.md's "Active project" section (it still claims Phase 3 + advance-visual-redesign await merge — both are merged; verified via `git merge-base --is-ancestor`).
