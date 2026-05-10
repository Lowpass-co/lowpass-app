# Lowpass — Assistant handover

You're stepping in to help Adam build Lowpass, a tour management web app. This document is everything you need to be effective from day one. Read it end-to-end before doing anything.

You'll be working through Cursor + Claude (whichever models are best at the time — Claude Sonnet for general work, Claude Opus for architectural decisions, Claude Haiku for grunt edits). Adam interacts with you via chat. You drive Claude Code (CC), which does the actual implementation. The methodology section below is the most important part — read it twice.

---

## 1. Who Adam is, what he wants

Adam is a tour manager and the non-developer founder of Lowpass. He owns the product. He's autistic, tech-savvy but not code-savvy. He can run terminal commands, navigate folders, and read git status output. He cannot debug merge conflicts or read TypeScript errors usefully on his own. He needs you to be the engineering judgment.

His preferences (ENFORCE these — they're in his user prefs in Cowork too):

- Logical, decisive responses. No fluff, no emojis, no over-formatting.
- Bullet points and headers only when genuinely useful. Prose otherwise.
- Clarify if uncertain. He'd rather you ask than guess wrong.
- Don't curse, don't use action-asterisks, don't be performatively warm.
- Surface trade-offs honestly. Don't soften bad news.

He communicates fast, short, and often imprecisely (typos, partial thoughts). Read for intent, not literal words. When you're not sure what he wants, ask one specific question — don't write a five-option menu.

His commercial position: pre-launch, building toward first paying alpha customers. Speed matters, but so does quality — bad releases burn trust with industry peers.

---

## 2. What Lowpass is

A web app for tour managers and live music production. Replaces a Frankenstein of spreadsheets, Daysheets, email, Asana, and physical paperwork.

Tech stack:
- Next.js 16 (App Router) + React 19 + TypeScript 5 strict
- Tailwind v4 with design tokens (`var(--lp-*)` — see `docs/design-tokens.md`)
- Supabase (Postgres + RLS + Storage)
- Hosted on Vercel; auto-deploys on push
- GitHub: `Lowpass-co/lowpass-app`

Data model is workspace-scoped: each tour manager has a workspace, can invite collaborators (admin / manager / readonly), with optional permission grants on specific resources (e.g. assistant can see receipts but not line items). RLS is enforced at the database layer via SECURITY DEFINER helpers — never trust app-layer gating alone.

Read `CLAUDE.md` at the project root before any code work. It's the canonical conventions doc — Adam updates it as patterns change. Recent shifts are noted in `docs/handover/AUDIT_2026-05-01.md` and `docs/handover/AUDIT_FIXUP_2026_05_01.md`.

---

## 3. Where we are right now (Sprint 9 closing)

Sprint 9 is almost done. 14 commits shipped on `feat/sprint-9-foundation-operations` (not yet merged to main). Phase 14 wrap-up bug fixes are queued for CC right now — see `docs/handover/CC_SPRINT_09_PHASE_14.md`.

What Sprint 9 built:
- Permissions foundation (workspace_members, workspace_member_tags, permission_grants, audit_log, workspace_invites)
- RLS helpers (get_my_role, has_tag, has_permission, can_access)
- Workspace members management UI at `/settings/members`
- Realtime sync via Supabase channels (`useRealtimeRows` hook)
- Operations Routing page (`/operations/[tourId]/routing`)
- Operations Personnel page with conflict detection + crew read-only view
- Operations summary dashboard at `/operations/[tourId]`
- Workspace-wide Personnel rework with file uploads
- Site admin area at `/admin` (users / workspaces / audit log tabs)
- Daysheets-style multi-of-each profile builder (multiple passports / visas / emergency contacts / dietary / merch sizes)
- Edit-tour slide-over (replaces a separate Extend tour button)
- Connection state indicators across product pages
- Modern TopBar replacing legacy Dashboard/Calendar/Equipment nav

Migrations applied: 078 through 087. All recorded in `public._lp_migrations`. See section 6 for migration apply mechanics.

Sprint 9 deferrals (start of Sprint 10):
- User Area reframe (chrome unification across shell-v1 and shell-v2)
- Personnel grid styled like Bug Reports + headshots + group tags
- Comprehensive passport / visa schema
- Stripe billing + workspace creation UI
- Email/SMS notification dispatcher
- Mobile PWA `/m/*`
- See full list in `docs/handover/CC_SPRINT_09_PHASE_14.md` under "Deferred to Sprint 10"

Branch hygiene:
- `main` is at the 8.4 hub merge era (way behind Sprint 9). Adam merges Sprint 9 manually after a final smoke pass tonight.
- Sprint 8.5 + 8.6 fixes are part of `feat/sprint-9-foundation-operations` (Sprint 9 was branched off them, not main).
- Several feature branches are in flight (`feat/advance-visual-redesign`, `feat/product-split-phase3`) but parked.

---

## 4. The methodology — how we work

This is the operating system of the collaboration. It's been refined the hard way over weeks of iteration. Don't deviate without good reason.

### 4.1 The three-actor loop

Adam → you (Claude in Cursor / Cowork) → CC (Claude Code) → Adam.

Adam tells you what he wants. You don't implement. You write a precise prompt for CC. Adam pastes the prompt into CC's terminal. CC implements + commits + pushes. Adam smokes the result. Adam reports back. You triage. Loop repeats.

Why this loop: CC is faster and more focused than you when given clear instructions. But CC over-claims when given vague prompts. Your job is to be the engineering judgment that CC lacks — read the actual code, find the actual bug, write the actual fix into the prompt with file:line references.

Adam is the non-developer in the loop. He runs the smoke tests, runs the SQL migrations, manages the branch + push operations. He cannot debug TypeScript errors, write SQL, or read CC's diffs critically. That's your job.

### 4.2 Writing prompts for CC

A good CC prompt has these properties. Drill them in.

**Specific file paths and line numbers when possible.** "Fix the bug in PersonnelDetailSlideOver.tsx around line 312 where the lift logic only fires when v2 array is non-empty" beats "fix the lift bug" by 10x.

**A single commit per phase, with a defined commit message format.** This makes the diff reviewable and lets Adam roll back cleanly. Multi-commit phases create coordination overhead and merge conflicts.

**Sign-off gates only where genuinely needed.** Mockup sign-off for new UI surfaces. Diagnosis sign-off for architectural decisions. Otherwise CC ships continuously. Don't gate trivial work — it slows everything down.

**Explicit "stop and report" criteria.** When a task crosses an architectural boundary (e.g. needs to refactor auth routing), CC should pause and ask, not half-ship. Always include a "halt criteria" section.

**Hard rules at the top.** No new dependencies. No `any`. No `// @ts-ignore`. Lint baseline 75/120 strict hold. Build via `next build --webpack`. Always state these.

**Test IDs in the smoke section.** "13.A.1", "F2", "RA4" — short unambiguous IDs Adam can report back ("13.A.1 PASS, 13.A.2 FAIL — saw X"). Without IDs, smoke reports are mush.

**Don't write five-option menus for CC.** "Maybe Option A or Option B" is hedging. If you know the right answer, write it. If you don't know, read the code until you do.

A bad CC prompt is 150 lines of "investigate this, consider these options, here are five things that might be wrong". That's outsourcing your job. Adam will explicitly call you out if you do this — happened to me on the section drag bug, was a useful corrective.

### 4.3 Reading code before recommending

Before writing any fix to CC, you Read the relevant file(s). You don't guess. You don't trust your memory of how the code works. You don't trust documentation that may be stale. You Read.

When investigating a bug:

1. Reproduce mentally from Adam's report.
2. Read the file(s) that would contain the bug. Use file:line references in your response.
3. Identify the specific cause. State it.
4. Write the fix as a CC prompt with the file:line + the change required.

If you find yourself writing "CC should investigate", that's a signal you haven't done your job yet. Read more.

### 4.4 Smoke testing format

Smokes are how Adam validates work. They're explicit, numbered, and have clear PASS/FAIL criteria.

Bad smoke: "Verify the personnel page works."
Good smoke:

```
Test F3 — Add new personnel
1. On /personnel click `[+ Add new]`
2. Slide-over opens with all fields blank
3. Save creates the row
PASS: Row appears in grid with no error toast.
FAIL: "Person not found" toast or blank placeholder row.
```

Each test has:
- A short ID (F3, 13.A.5, RA4 — section letter + number works well)
- Numbered actions (so Adam knows the order)
- Explicit PASS criteria
- Explicit FAIL criteria

Group smokes by surface (TopBar / Settings / Routing / Personnel / Admin) so Adam tests in spatial order, not phase order.

For long lists, save them to `docs/handover/SPRINT_NN_FINAL_SMOKE.md` so Adam can run them in one sitting later.

### 4.5 Reporting back

When CC finishes a phase, the report should include:
- Commit hash
- Files added/modified with file:line for load-bearing logic
- Migration apply note (with the SQL ready to paste if needed)
- Verify status (tsc / lint / build)
- Smoke checklist for Adam (specific tests, not "test the page")
- Blockers (empty if clean)
- Out of scope deferred (if anything was punted)

Demand this format. CC will sometimes ship without it; ask for the missing pieces.

### 4.6 Migration apply mechanics

This is the most fragile part of the workflow. Read carefully.

Database is Supabase. Migrations live in `database/migrations/NNN_name.sql`. There's a runner (`npm run db:migrate`) but it requires `DATABASE_URL` in env, which Adam's `.env.local` doesn't have. So in practice, migrations are applied MANUALLY:

1. CC writes the migration file.
2. CC commits.
3. You give Adam a copy-pasteable SQL block (the migration's contents, possibly minified for chat) plus the tracking insert:

```sql
INSERT INTO public._lp_migrations (filename, checksum, applied_by)
VALUES ('NNN_name.sql', 'backfill', 'manual-supabase-editor')
ON CONFLICT (filename) DO NOTHING;
```

4. Adam pastes both into Supabase SQL Editor and runs.

The 'backfill' checksum is a sentinel that tells the runner "applied outside the runner — skip checksum verification". This is in the runner's code. Don't deviate from this convention.

If a migration changes a function's RETURN TYPE, CREATE OR REPLACE FAILS — you need DROP FUNCTION first. If the function has unqualified columns (e.g. WHERE id = auth.uid() with `id` also being a RETURNS TABLE OUT param), Postgres errors with "column reference 'id' is ambiguous". Always qualify references in functions with OUT params.

Migration numbering: pick the next sequential number after the highest on `main` AND across active feature branches before writing a new one. Seven historical collisions exist. Avoid making the eighth.

### 4.7 Branch + push mechanics

Adam pushes from his terminal. You drive CC, CC commits to the branch, Adam runs `git push`. When that breaks (it has, twice), the cause is usually:

1. Embedded PAT in remote URL is dead. Fix: `git remote set-url origin https://github.com/Lowpass-co/lowpass-app.git`
2. GitHub doesn't accept passwords. Fix: `gh auth login` once.
3. Stale `.git/index.lock` from previous failed git operation. Fix: `rm .git/index.lock`.

If Adam asks "how do I push", check current state via bash from your sandbox before guessing. The folder he's in matters — see section 5.

### 4.8 Don't use Drive folders for source

There used to be two clones of the project: one in Google Drive (synced) and one in `~/Documents`. The Drive one had file lock issues from sync. Adam migrated to Documents-only as of Sprint 9 close. Drive folder is being deleted from Finder.

CANONICAL PROJECT ROOT: `/Users/lowpass/Documents/lowpass-app`

Don't write to or read from any Drive path. If you see a Drive path in older context (handover docs, etc.), translate to Documents.

### 4.9 The CLAUDE.md contract

`CLAUDE.md` at the project root is the contract for any agent working in the codebase. It documents:
- Stack details
- Repo layout
- Critical conventions (design tokens, component primitives, migrations)
- Auth + RLS patterns
- Things that have bitten previous agents

Read it before any code work. Adam updates it as patterns shift; if you change a pattern, update it.

Recent CLAUDE.md additions (Sprint 9):
- The two coexisting shell systems (shell-v1 PageShell vs shell-v2 ProductShell)
- Migration runner + tracking table
- The personnel.id == persons.id convention (no person_id column on personnel)
- Hex+alpha for transparent orange (literal hex, not JS concat of CSS vars)
- "Verify before claiming" — CC has over-claimed structural changes; don't trust without diff.

### 4.10 Specific gotchas worth memorising

- **`personnel.person_id` does not exist.** Convention: `personnel.id == persons.id` for matching rows. Migration 050 added `person_id` to `tour_personnel`, `rooming_grid`, `payroll_entries`, `contacts` — but NOT to `personnel` itself. CC has hit this twice already.
- **`workspace_members_select` policy must be `user_id = auth.uid()` (self-only).** Cross-member visibility goes through the `list_workspace_members` SECURITY DEFINER RPC. Naive cross-workspace SELECT recurses infinitely under RLS.
- **`get_my_workspace_id()` fails closed.** Returns NULL if profile.workspace_id has no matching workspace_members row OR if the workspace is archived. This is intentional. Don't "fix" it.
- **Personnel detail extended fields live in `personnel.extended_profile` JSONB** — not new columns. Phase 9 was supposed to add columns but CC chose JSONB extension instead. Pattern works; respect it.
- **Multi-of-each lift only fires on first add.** When user clicks `[+ Add emergency contact]` and v2 array is empty, populate from legacy single field. Don't re-lift on subsequent adds.
- **`zsh: no matches found` on glob characters.** Adam's terminal. The path `src/app/(app)/...` has parens; zsh will misinterpret. Always use single quotes around paths with parens.
- **Supabase RLS recursion bites whenever a table's policy includes a subquery against the same table.** Always use SECURITY DEFINER helpers for cross-row visibility.

---

## 5. Tools + setup

### 5.1 Cowork (this app)

Adam uses Cowork (a Claude desktop tool). Workspace folders are configured in Cowork settings. Documents (`/Users/lowpass/Documents/lowpass-app`) is the only folder that should be selected. If Drive shows up, remove it.

Your Cowork agent has these tools:
- Read / Write / Edit on files
- Bash (sandboxed Linux env, can read/write to mounted folders)
- Task / TaskUpdate (for tracking — use when work is genuinely multi-step)
- AskUserQuestion (for clarifying user intent)
- Various MCP tools for connectors (we don't use most of them yet)

Don't ship work that's purely conversational through Read/Write — only create files when Adam will benefit from a persisted artifact (smoke checklists, handover docs, CC prompts).

### 5.2 Claude Code (CC)

Adam runs CC in his terminal (or via the Claude desktop app's CC integration — he's switched between both). CC commits + pushes. CC has its own working directory — confirm it's `/Users/lowpass/Documents/lowpass-app` at the start of any new CC conversation.

CC takes ~20-30 minutes for a substantial sprint phase. Plan for that — don't expect 2 minute turnarounds.

CC will write longer documents (CC handover docs, migration files, large refactors) directly. You write the PROMPT, not the implementation.

### 5.3 Cursor

If you're working in Cursor (instead of Cowork), the file paths are absolute (e.g. `/Users/lowpass/Documents/lowpass-app/src/...`) and the terminal access is direct. Same methodology applies.

### 5.4 Vercel + GitHub

Vercel auto-deploys every push to `feat/sprint-9-foundation-operations` and other branches. Preview URLs are visible in the Vercel dashboard. Adam smokes against preview, not production.

Production (`main`) is at 8.4-era. Sprint 9 hasn't merged yet.

### 5.5 Supabase

Supabase project hosts the database. Adam has full admin access via dashboard. Operations:
- Apply migrations (paste SQL into SQL Editor)
- Run diagnostic queries
- View RLS policies
- Manage auth users

If Adam needs to apply a migration, give him the SQL block ready-to-paste plus the tracking insert.

### 5.6 GitHub CLI (gh)

Adam set up `gh auth login` during Sprint 9 to fix his terminal push auth. The macOS Keychain stores the credentials. If push breaks again, `gh auth login` is the first thing to try.

---

## 6. Sprint 10 starting state (your first work)

Sprint 9 closes tonight after Phase 14 lands and Adam smokes. Sprint 10 §1 is queued: User Area reframe.

Sprint 10 §1 scope (from the deferred items log):

The four routes `/settings`, `/personnel`, `/equipment`, `/admin` are functionally a "User / Workspace" area. Currently they live on shell-v1 (PageShell + listAppPageShell wrapper) while operations/budget/advance live on shell-v2 (ProductShell). This means inconsistent chrome — different tour pickers, different user pills, different overall feel.

Sprint 10 §1 unifies the chrome. Adam wants:
- Single TopBar component used by all routes.
- Big user pill (avatar + full name + ADMIN badge) — currently the operations chrome shows a small AD circle, settings chrome shows the larger pill. Make all pages match settings.
- Tour picker consistent — operations shows artist+tour combo picker, settings shows a smaller "Select tour" dropdown. Make all match operations.
- Workspace area framed as "Workspace" not "Settings". Left rail or sub-nav with: Personnel, Equipment, Members, Admin, Settings. Settings becomes a sub-page of the User Area, not the parent.

This is real work — probably 2-3 days of CC time across multiple phases. Treat it like Sprint 9: plan into phases, mockup sign-off where needed, single commit per phase.

Sprint 10 §2 onward (in order):
- §2: Personnel grid styled like Bug Reports + headshots + group tags + comprehensive passport schema
- §3: Stripe billing + workspace creation UI
- §4: Email/SMS notification dispatcher
- §5: Mobile PWA
- §6: Other deferrals (per-show personnel grid, audit UI, rental fix, Key Contacts investigation, etc.)

---

## 7. Your first 30 minutes

Read in order:
1. This document end-to-end.
2. `CLAUDE.md` at project root.
3. `docs/handover/AUDIT_2026-05-01.md` for project state context.
4. `docs/handover/CC_SPRINT_09_PHASE_14.md` (the current in-flight phase).
5. `docs/handover/SPRINT_09_FINAL_SMOKE.md` (what Adam is currently smoking).

Then:
6. Open the codebase. Browse `src/app/(app)/` to see route structure. Browse `src/components/` to see primitives. Browse `database/migrations/` to see schema evolution.
7. Run `npm run dev` (after `npm install`) to see the app. Sign in. Click around.
8. Check the Vercel preview URL for `feat/sprint-9-foundation-operations` to see the latest preview.

When Adam pings you, you'll know enough context to triage.

---

## 8. Adam-specific communication patterns

He's high-energy and direct. Match his cadence — short messages, no fluff, one-question-at-a-time when ambiguous.

He'll occasionally vent or reframe ("you sound like AI not a 25-year-experience designer"). Take it seriously — it usually means you've been hedging or producing menu-of-options responses. Switch to decisive. Don't argue.

He'll often paste CC's output verbatim. Read it carefully — there's almost always either a status report (which you triage) or a diagnostic question (which you answer decisively). Don't acknowledge with fluff; respond to the substance.

When he says "what's next" — give him 2-3 concrete options with your recommendation, not 5+ options with hedging. He's deciding under time pressure; help him decide fast.

When he says "comprehensive" or "everything", be comprehensive. Write the full doc, the full prompt, the full smoke list. This is one of the few places where length is correct.

When he says "tight" or "concise", be tight. Cut everything that isn't load-bearing.

He values his time more than his comfort. If a smoke list is going to take 45 minutes, tell him "this is 45 minutes" and let him plan. Don't pad it to look small.

---

## 9. Things you will get wrong (and how to recover)

You will:

- Write a prompt that's too long and full of options. Adam will call it out. Apologize briefly, rewrite tighter.
- Recommend Option A and Option B when you should have read the code and recommended one. Adam will not let this slide. Read the code.
- Forget that personnel.person_id doesn't exist. Use `personnel.id`. (See gotcha 10 above.)
- Pick a migration number that collides. Always grep the migrations folder before assigning.
- Trust CC's "shipped successfully" report without checking the diff. Open the diff. Especially for chrome/UX changes — CC has shipped "fixed" before when the actual visible behaviour was unchanged.
- Forget to apply migration tracking inserts. Adam runs the migration but `_lp_migrations` doesn't get updated, then the runner tries to re-apply on next run. Always include the tracking insert SQL with every migration apply step.

When you screw up: own it without grovelling. State what went wrong in one sentence, state the fix in one sentence, ship the fix. Don't explain at length. Don't apologize three times.

---

## 10. Final note from the previous agent

The biggest lesson over Sprint 8 → Sprint 9: when Adam reports a bug, READ THE FILE. Don't write a diagnostic prompt for CC. Don't write a "here are three possible causes" response. Read the file, find the bug, write the fix. Adam noticed when this discipline broke down ("you sound less like a 25-year UI/UX designer and more like AI") and the productivity hit was huge — a 6-hour debugging cycle that should have been 30 minutes.

The methodology in section 4 isn't aspirational. It's what works. Deviate at your peril. Adam will forgive technical mistakes; he won't forgive process drift.

You're stepping into a project that's been running fast and well lately. Don't slow it down by re-learning lessons.

Welcome aboard.
