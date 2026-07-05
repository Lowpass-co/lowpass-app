# Lowpass roadmap — post-master-sprint pipeline (2026-07-04)

**STRICT RUN ORDER. Each item is one or more single-owner CC sessions and MUST NOT start until the previous item's gates are green and banked to origin. The order encodes real dependencies — skipping ahead breaks them.**

| # | Item | Spec | Depends on | Status / why this position |
|---|---|---|---|---|
| 0 | Master sprint | `CC_MASTER_SPRINT_FINISH.md` | — | ✅ COMPLETE at `d77da2b`, independently verified (32/35 claims confirmed; 3 benign discrepancies). Money correct, nav fixed |
| 1 | Sprint verification + landing | (Cowork session) | 0 | ✅ COMPLETE 2026-07-04 — this document's presence in the repo is the receipt |
| 2 | Venue SSOT | `CC_VENUE_SSOT.md` | 1 | **NEXT.** Last data-truth item. Runs BEFORE design so redesigned surfaces render through the venue resolver, and because intake prefill (item 5) reads it. ~1 session |
| 3 | **DESIGN PASS** (7 stages) | `CC_DESIGN_PASS.md` | 2 | The design update. Bank-per-stage; acceptance = `docs/smoke-tests/visual.md`. ~8–12 sessions. Blocks items 4–5, which build on its decomposed Advance surfaces |
| 4 | Labor calls | `CC_LABOR_CALLS.md` | 3 (Advance stage) | Its section block registers into the DECOMPOSED Advance builder — building it against the 6k-line monolith would be built twice |
| 5 | Intake upgrade | `CC_INTAKE_UPGRADE.md` | 2 + 3 (Share stage) | Prefill needs venue SSOT; the tech-pack path and mobile pass extend the redesigned Share surface |
| 6 | Hygiene pass | `CC_HYGIENE_PASS.md` | 3–5 | Cleanup runs LAST by definition — it dedupes and sweeps whatever the previous items finalized |
| — | Permissions build (crew links, publish gates) | `docs/design/PERMISSIONS_MODEL_2026-07.md` | unscheduled | Decision record landed; build when multi-user becomes priority. The `artist_ids` schema reservation may ride along with any earlier 2xx migration |

Adam-owned, order-independent: run the sprint's consolidated smoke list on the deploy · grade the rider field catalog (`COMPETITIVE_ADVANCEWITHME_2026-07.md` §6 — feeds design-pass rider stage) · clear the two dirty worktrees · pricing strategy vs AWM's $120 floor (pre-launch, not pre-build).

Rules that persist across every item: single owner per session · bank-per-stage pushes · migrations hand-pasted by Adam (SQL posted, wait for "pasted") · `231.HOLD` applies only after its checklist is honestly green + a soak period · the Cowork design session writes specs BETWEEN CC sessions, never during.
