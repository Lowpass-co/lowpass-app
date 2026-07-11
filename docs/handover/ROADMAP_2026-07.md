# Lowpass roadmap — post-master-sprint pipeline (2026-07-04)

**STRICT RUN ORDER. Each item is one or more single-owner CC sessions and MUST NOT start until the previous item's gates are green and banked to origin. The order encodes real dependencies — skipping ahead breaks them.**

| # | Item | Spec | Depends on | Status / why this position |
|---|---|---|---|---|
| 0 | Master sprint | `CC_MASTER_SPRINT_FINISH.md` | — | ✅ COMPLETE at `d77da2b`, independently verified (32/35 claims confirmed; 3 benign discrepancies). Money correct, nav fixed |
| 1 | Sprint verification + landing | (Cowork session) | 0 | ✅ COMPLETE 2026-07-04 — this document's presence in the repo is the receipt |
| 2 | Venue SSOT | `CC_VENUE_SSOT.md` | 1 | ✅ **COMPLETE** — `resolveVenue()` + on-read freeze + `/venues` propagation UI + export/packet paths converted. VEN-06..10 |
| 3 | **DESIGN PASS** (7 stages) | `CC_DESIGN_PASS.md` | 2 | ✅ **COMPLETE** — foundations + views + TourFingerprint · Advance decomposed (Build/Advance/Share, drag bug fixed, shared review grammar) · Budget parity + Classic retired · Channel list + Patch mode · Stage plot · Rider · shared Export shell. Design-polish remainders swept |
| 4 | Labor calls | `CC_LABOR_CALLS.md` | 3 (Advance stage) | ✅ **COMPLETE** — migration 239; genuine block REGISTRY (not label-match); never-clobber 7/7; day sheet + /m/today + tour Labor tab + templates. LAB-01..04 |
| 5 | Intake upgrade | `CC_INTAKE_UPGRADE.md` | 2 + 3 (Share stage) | ✅ **COMPLETE** — migration 240; STORE-PENDING write-path (never-clobber at accept); prefill w/ provenance; metered tech-pack AI extraction; mobile-first page; idempotent cron reminders. INTK-01..05 |
| 6 | Hygiene pass | `CC_HYGIENE_PASS.md` | 3–5 | ✅ **COMPLETE** — TourBreadcrumb deleted; dedupe (behavior-preserving); SlideOver ~24/26; CLAUDE.md corrected to pipeline reality; salvage branches verified |

**PIPELINE COMPLETE at `origin/main 666603f` (2026-07-05).** Money gates green throughout: `reconcile.harness.ts` **52/52** (THE MONEY GATE — engine reproduces legacy exactly) · `fees.test.ts` 15/15 · provenance 18/18 · FX grep 0. Migrations applied: 237 (venue) · 238 (channel gain) · 239 (labor) · 240 (intake pending+reminders). `231.HOLD` NEVER applied — still awaiting Adam post-soak.
| — | Permissions build (crew links, publish gates) | `docs/design/PERMISSIONS_MODEL_2026-07.md` | unscheduled | Decision record landed; build when multi-user becomes priority. The `artist_ids` schema reservation may ride along with any earlier 2xx migration |

Adam-owned, order-independent: run the sprint's consolidated smoke list on the deploy · grade the rider field catalog (`COMPETITIVE_ADVANCEWITHME_2026-07.md` §6 — feeds design-pass rider stage) · clear the two dirty worktrees · pricing strategy vs AWM's $120 floor (pre-launch, not pre-build).

Rules that persist across every item: single owner per session · bank-per-stage pushes · migrations hand-pasted by Adam (SQL posted, wait for "pasted") · `231.HOLD` applies only after its checklist is honestly green + a soak period · the Cowork design session writes specs BETWEEN CC sessions, never during.
