# Agent Handover — Lowpass · 2026-04-30

> You're picking up a Cowork Claude session that ran long. Lowpass is Adam Rowley's tour-management web app — Next.js 16 / React 19 / TypeScript / Tailwind v4 / Supabase. He's mid-rebuild into a four-product split (Home / Operations / Budget / Advance), Phases 0-2 are on `main`, Phase 3 prompt is written but unrun, and there's an Advance visual fix-up queued. This doc is the dump of everything you need to be useful in five minutes.
>
> Read this top-to-bottom once. Then read `CLAUDE.md` at the repo root. Then you're ready.

---

## Roles

- **Adam Rowley** — owner. Tour manager building Lowpass for himself first, then to ship as a SaaS. Tech-savvy but not a developer. Autistic. Prefers logical, structured, **no-fluff** responses. Asks for clarification rather than guessed implementations. Wants tight, click-by-click instructions when doing technical operations he's not sure about (Terminal commands, GitHub UI, Supabase SQL Editor). Use bullet points sparingly; he's said "stop bullet-point everything" before. Lists are fine when the content is genuinely a list. Avoid "genuinely", "honestly", "straightforward". Don't use emoji.
- **You** — Cowork Claude in his desktop Cowork app. You write prompts for CC to execute, do code audits, write handover docs, give him SQL to paste, walk him through GitHub merges. You don't do long sustained coding sessions yourself — you write the brief, CC does the build.
- **CC (Claude Code)** — the terminal agent that does the big coding sweeps. Reads prompts you write into `docs/handover/CC_*.md` files. Pushes to feature branches. Ships PRs. Reports back via chat-pasted summaries.
- **Ben Rayner** — was a parallel contributor (canonical entities — flights, persons, rooms, gear). No longer active. Don't write Ben handovers; older ones are historical record.

The handoff pattern: Adam describes a problem → you write a tightly-scoped prompt → CC executes → Adam smoke-tests → fixes loop back via a fix-sprint doc. When CC reports "done", verify against the actual diff before reporting success — CC has claimed work shipped that didn't, multiple times.

---

## Stack + non-negotiables

- **Next 16 + React 19 + TypeScript 5 strict**
- **Tailwind v4** with `@theme inline` in `src/app/globals.css`
- **Supabase** (Postgres + RLS + Storage)
- **Build: `next build --webpack`**. Turbopack hangs on Adam's Google Drive filesystem. Always specify `--webpack`.
- **Lint baseline: 75 errors / 120 warnings**. Don't introduce regressions; match exactly. CLAUDE.md confirms.
- **No new dependencies** unless absolutely required. Recharts, Lucide, Phosphor, JetBrains Mono via Google Fonts CDN, MathJS, Lodash, D3 are all already in scope.
- **All visual values via `var(--lp-…)` tokens.** No hardcoded hex except: brand-orange transparent variants (`#FF45001a`) or `color-mix(in srgb, var(--lp-orange) X%, transparent)`. Never JS string-concat CSS vars — `'var(--lp-orange)' + '1a'` is broken at runtime.
- **No `any`, no `// @ts-ignore`** in any prompt or commit.
- **Supabase migrations applied by hand.** There is no migration runner. Adam pastes SQL into the Supabase SQL Editor. Always provide migrations as idempotent (`DROP IF EXISTS` / `CREATE OR REPLACE` / `ADD COLUMN IF NOT EXISTS` / `ON CONFLICT DO NOTHING`).
- **Branches over fast pushes.** Every CC sprint goes on a feature branch. PRs merge to main via GitHub UI. Vercel auto-deploys main.

---

## Where the codebase is (state of `origin/main` as of this handover)

UX01–UX22 + UX22 cleanup all merged. PR #6 (full budget redesign) merged. Product Split Phases 0, 1, 2 merged.

**Foundation (shell-v2 components live):**
- `src/components/shell-v2/{ProductRail,ProductHeader,ProductShell,ProductHeaderAvatarMenu,PhaseScaffoldPlaceholder}.tsx`
- `src/contexts/ProductContext.tsx` mounted in `(app)/layout.tsx`
- `src/lib/entitlements.ts` — `useEntitlements()` returns hardcoded all-true. When Stripe lands, swap the hook implementation; consumers don't change.

**New routes shipped:**
- `/artists/[id]` — Home (artist-scoped overview: hero, stat tiles, calendar widget, three product cards, recent activity)
- `/advance/[tourId]` and `/advance/[tourId]/[routingId]` — full Advance migration with ProductShell + Previously Played sidebar
- `/operations/[tourId]/*` — placeholders for Operations (content not migrated yet — Phase 4)
- `/budget/[tourId]/*` — placeholders for Budget (content not migrated yet — Phase 3 prompt written, unrun)
- `/personnel`, `/templates`, `/venues`, `/account/rental` — workspace-level Foundation routes accessed via avatar dropdown

**Old routes still on disk** (`src/app/(app)/tours/[id]/budget/*`, etc.) — unreachable via URL because Phase 1's `next.config.ts` redirects fire before filesystem routes. Phases 3-4 will port their content into the placeholders.

**Migrations applied to live DB** (per Adam's confirmation): up to 063 (`budget-receipts` storage bucket + RLS). 064 (budget_line_items.phase_tag) is in the queued Phase 3 prompt — not yet applied.

---

## Active product direction — the four-product split

This is the architectural shift Adam's living through. Internalise it.

**Four products:**

1. **Home** — artist-scoped overview dashboard at `/artists/[id]`. Cross-product stats, calendar widget showing the artist's next 30 days across all tours, three product cards (Operations / Budget / Advance) with a single "what's hot" metric each, recent activity table. NOT a tour-launcher — Adam explicitly didn't want tours listed inside product cards.
2. **Operations** — tour management. Riders, routing, channel list, rooming, files, personnel, gear, payroll. Tour-wide view, not show-by-show. URL: `/operations/[tour-id]/...`. Phase 4 builds this — not yet started.
3. **Budget** — financial. Line items, settlement, multi-currency, receipts, exports. URL: `/budget/[tour-id]/...`. Phase 3 prompt written; budget redesign from PR #6 already on main but still at old URLs awaiting migration.
4. **Advance** — per-day execution. Venue advance, sections, fields, drag-drop reorder, custom sections, Previously Played sidebar. URL: `/advance/[tour-id]/[routing-id]`. Live as of Phase 2.

**Tier-pricing eventually.** Right now `useEntitlements()` returns all-true. When Stripe integration lands, that hook reads from a `subscriptions` table. Don't add tier-gating logic yet; the abstraction's already in place.

**Schema:** Artist → Tour → Day for Advance + Budget. Operations stays tour-wide; can link items to days but the lens is managerial.

**Each leg = its own tour.** No multi-leg detection within a tour. Phase computation is linear: Pre-Prod → Rehearsals → Show Days → Wrap.

---

## Adam's product locks (recurring; never relitigate)

These come up enough that they deserve a top-level reference:

1. **Advance is NOT a to-do list.** No "Mark All Complete" button. No "Tasks Done" framing. Use "Advance Progress" + "X of Y sections complete". No checkbox-on-fields styling. The reference HTMLs from third-party tools sometimes blend advance with task-checking — reject that framing.
2. **Drop the "evidence photo" capture pattern** from any reference HTML. Phase 2 didn't add photo capture to advance fields; future phases shouldn't either.
3. **Keep Lowpass's existing budget categories** (Production, Logistics, Travel, Crew, Accommodation, Catering, Marketing, Insurance, Contingency). Don't replace with reference HTMLs' category lists.
4. **Phase tagging on budget line items is additive.** Default grouping is by Category (existing). Phase grouping (Pre-Prod / Rehearsals / Show Days / Wrap) is a toggle. Items without a phase tag fall into "Unscoped".
5. **Preserve existing features when applying visual upgrades.** Receipt Inbox, Quick Add templates, duplicate detection, multi-currency, PDF/XLSX export, Settlement, Previously Played — none of these get torn down to apply the new visual.
6. **Don't try to merge structural rebuilds with feature changes** in the same prompt unless explicit. Visual fix-ups should preserve substance; substance changes should be their own prompt.
7. **No new dependencies** unless absolutely required.
8. **Verify before claiming.** Phase 1 of the original nav redesign claimed components shipped that didn't exist on `main`. Hard Rule #7 in recent prompts is "Verify before claiming — open files, confirm content matches the assertion, before reporting work done."

---

## Visual system — the locked decisions

Adam went through three rounds of HTML mockups (Bloomberg-terminal-style designs from a tool called Variant) and landed on a blend.

**Tokens (in `globals.css` from Phase 1):**
- `--lp-bg`, `--lp-surface`, `--lp-border`, etc. (existing Lowpass)
- `--lp-bg-deep` (#0a0a0a, table backgrounds)
- `--lp-panel` (#111111, table headers + strip backgrounds)
- `--lp-border-subtle` (#222222, dense table cell borders)
- `--lp-border-strong` (#333333, card edges)
- `--lp-text-mono` (#d1d5db, monospace numeric content)
- `--lp-mono-font: 'JetBrains Mono', ui-monospace, monospace`

**Typography:**
- Body base: **14px** (was bumped from 13px after Adam said "too cosy")
- Headings: H1 28px / H2 20px / H3 16px, weight 500
- Stat tile values: 32px weight 600 via `.lp-stat-value`
- Stat labels: 11px uppercase tracking-wider via `.lp-stat-label`
- **Tables and lists go dense at 12px** via `.lp-dense` utility class
- **Numerics use JetBrains Mono** via `.lp-mono` utility (currency, dates, IDs, counts, timestamps)
- Body font stays Inter

**Colours:**
- Brand orange: `#FF4500` (Lowpass) — identical to Variant's `#ff4400` (no migration needed)
- Status tokens: `--color-lp-status-{not-started,in-progress,needs-review,complete,rejected}`
- Day tokens: `--color-lp-day-{show,festival,travel,off,rehearsal,press,radio,tv}`
- **No purple, no blue, no gradients.** The Variant references used both; Lowpass doesn't.

**Density rule** (worth memorising):
- Tables, lists, status strips, dense data views → 12px via `.lp-dense`
- Detail pages, forms, slide-overs, prose → 13–14px with breathing room
- Headings and primary chrome → 14–28px per the heading scale

---

## Open work / what's next

In likely priority order:

1. **Advance Visual Redesign** (`docs/handover/CC_ADVANCE_VISUAL_REDESIGN.md`) — written, unrun. Phase 2 missed the structural redesign Adam expected from his reference HTML (280px sidebar with upcoming shows, sticky big-header, tab nav replacing `?mode=edit`). This fix-up adds it. Single PR off main, three commits.

2. **Phase 3 Budget Migration** (`docs/handover/CC_PRODUCT_SPLIT_PHASE3.md`) — written, unrun. Migrates `/tours/[id]/budget/*` to `/budget/[tourId]/*` with ProductShell, applies dense spreadsheet template per Adam's reference HTML, adds Summary tab, adds phase tagging. Six commits + Migration 064.

3. **Phase 4 Operations Migration** — not yet written. The biggest remaining product silo. Absorbs riders, routing, channel list, rooming, files, personnel, payroll, hire, gear, plus the Operations landing page (replaces today's Tour Hub). Substantial sprint — likely needs to be split into sub-phases.

4. **Migration runner** — overdue. Adam pastes SQL into Supabase by hand, no tracking table. Causes drift; we hit "060 was applied as direct SQL but no migration file" multiple times. Future sprint should add `_lp_migrations` tracking + `npm run db:migrate` script.

5. **Schema reconciliation** — three rental tables (`rental_inventory`, `rental_jobs`, `rental_job_items`) have no `CREATE TABLE` in any migration. Direct-pasted at some point. Fresh-clone bootstrap doesn't reproduce them.

6. **Migration number duplicates** (017, 018, 019, 024, 025, 026, 035 have two files each). Future migration runner would silently skip half.

The combined doc `CC_ADVANCE_FIXUP_AND_PHASE3_COMBINED.md` has both queued sprints in one file for easy paste-to-CC.

---

## Prompting patterns — the format that works

Every CC prompt I've written has the same shape. Mimic this when you write yours.

### Filename + location

`docs/handover/CC_<DESCRIPTIVE_NAME>.md`. Names like `CC_PRODUCT_SPLIT_PHASE3.md`, `CC_ADVANCE_VISUAL_REDESIGN.md`, `CC_BUDGET_HUB_FIXUP_2.md`. Numbered phases use `_PHASE<N>`; fix-ups use `_FIXUP` or numbered (`_FIXUP_2`).

### Required structure

```
# <Sprint name>

> Intro paragraph: what shipped before this, what this delivers,
> what's deliberately out of scope. Adam's product locks restated.

---

## 0. Required reading

1. CLAUDE.md
2. <relevant prior prompts/handover docs>
3. <current code files CC needs to read>
4. <reference uploads if any>
5. <relevant migration files>

---

## 1. Hard rules

1. No new dependencies.
2. All visual values via var(--lp-…) tokens. Brand orange via hex+alpha
   or color-mix; never JS string concat.
3. No any, no // @ts-ignore.
4. Lint clean (75/120 baseline). Typecheck zero errors.
5. Build via `next build --webpack` only.
6. <commit count> commits in order: <named phases>.
7. Adam's product locks (do not relitigate): <specifics>.
8. Verify before claiming. (For sprints CC has previously hallucinated work on.)

---

## A. <Phase A name> (~<estimated time>)

### A.1 <subsection>

<concrete code sketch + file paths + what changes>

### A.2 <subsection>

...

### A.N Acceptance for §A

- [ ] <observable outcome>
- [ ] <observable outcome>
- [ ] Lint + typecheck clean

### A.M Commit

```
<commit message in Conventional Commits format>

<wrapped prose: what changed, why, what's preserved>

Made-with: Claude Code (<sprint name>)
```

---

## B. <Phase B>...

(repeat for each phase)

---

## V. Verify (~30 min)

### V.1 <category>

1. <step>
2. <step>

### V.M No regressions

- [ ] Lint + typecheck clean. Built via next build --webpack.
- [ ] <other product silos still work>

---

## When done

```
<sprint summary>
Commits: <A-sha>, <B-sha>, ...
- A: <what>
- B: <what>
- Lint + typecheck clean.
```

If <some risk>, surface in the report rather than guessing.
```

### Patterns inside

- **Hard rule #7 is "Adam's product locks"** — restate them in every prompt. Saves CC from re-asking. Lock list lives in §1 of the prompt.
- **Verification phase = manual smoke checklist for Adam.** Numbered items. Each one has an observable outcome ("X renders", "Y persists across reload"). CC reports back what passed and failed.
- **Each commit has a copy-paste-ready Conventional-Commits message** in the prompt. CC literally pastes it.
- **Estimate hours per phase.** Helps Adam scope. Total typically 5-15 hours per sprint.
- **Migration files are idempotent.** Always.
- **Time-box stretch features** ("Stretch — defer if scope tightens"). Marks them clearly so CC drops them when budget runs out.

---

## Recurring problems and gotchas

- **CC over-claims.** Phase 2's §B claimed it applied the reference template-builder aesthetic; it added field-type icons and mono numerics but not the structural redesign. Now we always include "Verify before claiming" as Hard Rule #7 and write specific structural acceptance criteria CC can't fudge.
- **RLS policies missing on workspace-scoped tables.** Default-deny means a Supabase write succeeds with no error but the row never exists. Hit this on advance_templates, rider_folders, rider_packs, rider_sections, rider_assets — five separate fix-up sprints. Lesson: when a save claims success but the data isn't there, pg_policy diagnostic FIRST. The audit migration `061_rls_audit.sql` swept every workspace-scoped table; new tables added since then need the same four-policy treatment.
- **`is_workspace_admin()` returned FALSE for everyone** before Migration 060 backfilled `profiles.role_id`. Any RLS policy that gates writes behind it silently locks out the legitimate user. Migration 060 fixed it; new admin-gated policies should still be cautious.
- **Migration files exist in repo but never get applied to Supabase.** Adam pastes by hand. Always provide migrations as a copy-paste-ready idempotent block when asking him to apply, AND tell him explicitly to paste it. Never assume he ran the SQL just because the file exists.
- **Drive folder permission issues** sometimes break local `git fetch` from the workspace bash sandbox. Adam can `git pull` himself in Terminal as a workaround. The sandbox can usually `git push` fine, just not always fetch.
- **Phase X3** of the original nav redesign claimed Tour Hub components shipped that didn't exist. CC's audit found "none of the components existed on this branch." Hard Rule #7 was added because of this.

---

## Workflow patterns

**When Adam asks you to write a prompt:**
1. Confirm scope verbally first. He'll usually clarify with 1-2 short answers. Don't write the prompt until you've locked the scope.
2. Read existing prompts in `docs/handover/` for similar work to mirror structure.
3. Read relevant code files to ground the implementation sketch.
4. Write the prompt. File path: `docs/handover/CC_<NAME>.md`.
5. Tell Adam the prompt's saved with a `computer://` link and a 2-3 line summary of what it does.
6. Don't run CC yourself. He hands it to CC.

**When CC reports back:**
1. Verify against the actual diff if the report mentions structural shipping. CC has fudged this before.
2. Push the branch to origin if CC didn't (sometimes CC commits locally but doesn't push). Workspace bash: `cd /sessions/clever-trusting-keller/mnt/lowpass-app && git push origin <branch>`.
3. Tell Adam the GitHub link to open the PR (`https://github.com/Lowpass-co/lowpass-app/pull/new/<branch>`).
4. After he merges, walk through the smoke checklist. He'll send screenshots if anything's off.

**When applying SQL:**
1. If the migration file exists on disk, check whether it was applied to live DB by reading it via `git show origin/main:database/migrations/XXX.sql` and confirming with Adam.
2. If applying multiple migrations, write a combined idempotent SQL bundle to `docs/handover/PENDING_MIGRATIONS_BUNDLE.sql` (or similar) and give him the file path.
3. Open in TextEdit, Cmd+A, Cmd+C, paste in Supabase SQL Editor → Run. Don't paste from chat (chat content sometimes gets pasted alongside).

**When merging PRs:**
1. Adam clicks the merge button himself. You don't have GitHub write access from the agent.
2. If a branch isn't on origin (CC committed locally but didn't push), push from workspace bash with `git push origin <branch>`.
3. After merge, Vercel auto-deploys main. ~2-5 min.
4. Drive folder doesn't auto-sync. Tell Adam the changes are deployed but his local Drive folder won't reflect main until something pulls. He doesn't usually need to pull (he tests on prod).

**When Adam says "I tested, here's what's broken":**
1. Listen. Don't propose fixes immediately.
2. If he sends a screenshot, look at the URL bar (often the URL itself is the diagnostic).
3. Distinguish between "the page renders the wrong thing" (code bug, write a fix-up prompt) and "the page renders the right thing but Adam doesn't recognise it" (UX clarity bug, explain instead of fixing code).
4. If multiple issues, group by severity (critical bugs / visual issues / nice-to-haves) and write a single fix-up prompt covering them.

---

## The first thing to do when you arrive

1. Open this file. Read it.
2. Open `CLAUDE.md` at the repo root. Read it.
3. Open the most recent prompt in `docs/handover/` (currently `CC_ADVANCE_FIXUP_AND_PHASE3_COMBINED.md` is the active queue).
4. Confirm with Adam where things are. He'll either say "test results from X are…" or "next thing is…" — that's your starting context.

If anything in this doc reads as out of date (the date in the filename is when it was written), check `git log origin/main --oneline | head -20` for the latest commits and ask Adam what's shipped since.

Don't try to be clever. Adam's preferences are explicit and he'll correct you the moment you drift. The fastest path to being useful is: write tight prompts in the format above, ask before guessing, and verify before claiming.

Welcome.
