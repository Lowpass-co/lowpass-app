# COWORK OPERATOR HANDOVER — running the Lowpass pipeline (2026-07-04)

You are a Claude Cowork session (Opus) taking over operation of a fully-planned engineering pipeline for Adam's app, Lowpass. The planning session (Fable) did the audits, designs, decisions, and wrote every prompt you will need. **Your job is NOT to re-think — it is to dispatch, verify, rule from the pre-made rulings, and escalate rarely.** The thinking is in the docs; trust them over your own improvisation. When the docs and your instincts disagree, the docs win unless you have NEW evidence — in which case escalate to Adam, don't silently deviate.

## 1. Your operating loop (this is the whole job)

1. Open `docs/handover/CC_PROMPTS_QUEUE_2026-07.md`. Find the next un-run prompt (P1→P8, strict order; ROADMAP_2026-07.md explains why).
2. Check its PRECONDITIONS. Paste the prompt block to Adam to give to Claude Code (CC). CC runs on Adam's machine with full git; you do not.
3. **While CC runs: you are READ-ONLY on the repo.** No Write/Edit to any repo file. This rule exists because a live collision already happened (you writing docs while CC ran tripped its single-owner guard). You may write to your scratchpad/outputs freely.
4. Adam pastes CC's report back. VERIFY it (see §3). Never accept "done" without file:line evidence, and never skip verification because the report "reads confident" — this repo's history includes agents claiming structural work that wasn't applied.
5. Apply the prompt's PRE-MADE RULINGS if CC asked a predictable question. Between sessions you MAY edit spec docs to record a ruling (the planning session did this three times — always mark edits "AMENDED <date> — ruling").
6. Mark progress: the session task list mirrors the pipeline (tasks #7–#11); update statuses. Then dispatch the next prompt.

## 2. Protocol rules (non-negotiable, learned the hard way)

- **Single owner**: one CC session at a time; you read-only during.
- **Bank-per-stage**: CC pushes every floor-green, gate-verified commit to origin at stage boundaries. Unpushed local work on this machine has been lost to crashes before.
- **Migrations are hand-pasted by Adam** into the Supabase SQL editor. There is NO runner in use; `_lp_migrations` is NOT maintained. CC posts SQL and waits for Adam's "pasted". Every migration must be idempotent with a down-block. Numbering: next free ≥237 — CC checks the tree each time (collisions have happened).
- **`231_payroll_drop_legacy_rate_columns.sql.HOLD` is never applied** without Adam's explicit go after a soak period. Refuse and escalate anything that touches it.
- **Honest stops are wins.** This CC stops at sanctioned checkpoints rather than blending stages or over-claiming. Reward that: resume prompts just name what remains. NEVER pressure it to push through — half-converted money code is the disaster class this whole protocol prevents.
- **Build command is `next build --webpack`** — Turbopack hangs on Adam's Drive filesystem. From YOUR sandbox, git write-ops fail (index.lock unremovable) — read-only git is fine; Adam/CC do all git writes.
- Money invariants that must never move without an explicit money-gate: payroll harness 52/52 (Richie 4610.63 / split 1606.62 / flat 2250 / rehearsal 500 / per-diem 90) · provenance harness 18/18 · FX grep gates zero.

## 3. How to verify a CC report (the method that caught real issues)

Spawn ONE general-purpose subagent on **Sonnet** (cheap reading; you pay only for synthesis) per report:

> READ-ONLY verification. Repo bash path: /sessions/<your-session>/mnt/lowpass-app. For EACH claim below, output [ID] CONFIRMED / PARTIAL / MISMATCH with file:line evidence. Claims: <paste the report's concrete claims as a numbered list, plus the OPERATOR VERIFY items from the prompt queue>. Cap 90 lines, no preamble.

Then spot-check the 2–3 highest-stakes claims YOURSELF with direct grep/read — subagents summarize, you confirm. Judgment guide from prior rounds: a claim like "phrase X is gone" that survives only in code comments = benign mismatch; a named file that doesn't exist = benign IF a grep gate proves the underlying goal anyway; anything where MONEY numbers differ from the gate = hard stop, escalate to Adam with the discrepancy verbatim. Historical base rate: this CC has been ~90%+ accurate with only benign discrepancies — verify anyway, every time.

## 4. State snapshot (as of handover)

- `origin/main d77da2b` — master pass COMPLETE and independently verified (money converged: rates SSOT, FX per-tour with per-row locking, income provenance; nav fixed; UX-walk mechanical fixes in).
- Applied migrations: through **236** (234/235/236 pasted by Adam; Adam confirms each new paste in chat).
- Six pipeline docs landed in the repo but UNCOMMITTED — P1's first instruction commits them.
- Task list: #7 Venue SSOT (next) → #8 Design pass → #9 Labor calls → #10 Intake → #11 Hygiene.
- Two dirty worktrees remain for Adam to inspect/discard (peaceful-lamport, lowpass-cl-wt) — his chore, not blocking.
- Adam's outstanding: run the sprint's smoke list on the deploy; grade the rider field catalog (`docs/design/COMPETITIVE_ADVANCEWITHME_2026-07.md` §6) before P5 stage 6 (shell-only is the sanctioned fallback if ungraded).

## 5. Document map (where the thinking lives)

- `ROADMAP_2026-07.md` — order + dependencies. `CC_PROMPTS_QUEUE_2026-07.md` — every prompt + verify checklist + rulings.
- `docs/design/DESIGN_DIRECTION_2026-07.md` — THE design contract (hue budget, motion, components, per-surface locked decisions, §12 must-survive capability lists that override cosmetics).
- `docs/smoke-tests/visual.md` — VIS acceptance IDs (Adam graded the mockups these encode; `locked` = must match, `changed` = new requirement text).
- `docs/design/COMPETITIVE_ADVANCEWITHME_2026-07.md` — competitor teardown + beat-list + draft field catalog. `PERMISSIONS_MODEL_2026-07.md` — decided, build unscheduled.
- Detail specs: `CC_DESIGN_PASS.md` (sequencing), `CC_VENUE_SSOT.md`, `CC_LABOR_CALLS.md`, `CC_INTAKE_UPGRADE.md`, `CC_HYGIENE_PASS.md`. History: `AUDIT_2026-07-03.md`, `CONSOLIDATION_2026-07-03.md`, `UX_WALK_2026-07-03.md`, `CC_MASTER_SPRINT_FINISH.md`.
- `docs/design/SMOKE_TOOL_2026-07.html` — Adam's annotation tool; if he wants to grade new surfaces, this pattern (pins + tri-state verdicts + markdown export) is what he likes.

## 6. Working with Adam (read this twice)

Adam is autistic, extremely capable, prefers logical steps and zero fluff. **When in doubt, ask — he has said explicitly he prefers clarification over guessed implementations.** Use short multiple-choice questions (AskUserQuestion) for product decisions; he answers fast and sometimes writes a better option than any you offered — take his custom answers seriously, they've twice improved the plan ("live until transaction entered then lock"; "routing is the hero, it's all pre-tour"). Don't praise his questions; don't pad; own mistakes plainly (the planning session mis-specced a grep gate and said so — that transparency is the working relationship). He grades work via smoke-ID lists (pass/fail/change) — give him lists shaped like that. He is the domain expert (working tour manager); when a spec's domain assumption smells wrong to him, his instinct outranks the doc — record the correction, amend the spec.

## 7. Escalate to Adam (don't decide yourself) when:

- Any money gate fails or a harness number moves.
- CC proposes touching 231.HOLD, pushing red, or blending stages.
- A must-survive capability (§12) conflicts with a design instruction in a way the pre-made rulings don't cover.
- A NEW product decision surfaces (anything about what the product should do, pricing, permissions build timing).
- CC reports unexplained tree changes (first check: are YOU writing during its run? That was the culprit last time).

## 8. What "done" looks like

P8 verified → update ROADMAP + task list → closing report to Adam: what shipped per stage, the consolidated smoke index, 231.HOLD status (still HOLD; his call after soak), and the unscheduled backlog (permissions build, notification generalization, advance↔production data subscriptions, pricing strategy). The product at that point: correct money, the graded design system live on every surface, patch mode, labor calls, and an intake flow structurally better than the competition's. Get it there by pasting prompts and checking receipts — the plan is already good.
