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

---

## ALIGNMENT PASS (2026-07-08 → 07-13) — status

The alignment pass made the shipped components read as one app, staged A→F,
banked per stage to `origin/main`, single owner. Cowork walked production behind
each stage and hit `/api/debug/derivations` (F0) for ground-truth query state.

- **A** — closeout: SW-asset middleware exclude, embed-resilience seams, tourStatus consumer wiring, pill/resume split.
- **B** — nav migration: two-bar nav → one grouped row (Routing | $ Budget · ⧉ Advance | Crew · Production · Files); flat Operations subnav retired → group segmented control; artist-tier product nav removed; old code deleted.
- **C** — surface rebuilds: workspace-card status via tourStatus (day_type tokenize); artist Tours/Production trims; full-width fingerprints; routing landing (rail Routing·Advances·Crew·Budget); **Budget Summary planning-neutrality** (the wince — killed red-net/orange-slam-without-income).
- **D** — hue-budget sweep: Equipment ~40→~4 orange (toggle/chips/📦), Advance Build library neutral, exports secondary, budget kebabs verified neutral.
- **E** — typography: Barlow Condensed page-title system (`.lp-page-title` + `<PageTitle>`, adopted on 22 PageHeader pages + Routing/Rooming/Payroll/Stage-plot); advance mode switcher → segmented control.
- **F0/F1** — observability endpoint + the derivation regression fix (canonical-venue embed taken off the card/rail critical path; rail retries on empty; tour-currency money; neutral "all clear").

**Money invariants held every stage:** fees 15/15 · reconcile 52/52 (THE money gate) · provenance 18/18 · FX greps 0 · tourStatus 14/14.

**Remaining (F2, post-walk continuation):** native `<select>` → StyledSelect (~60 sites, batch by behavior class); destructive→red audit; Files + Riders page treatments; empty-state invitation sweep; four remaining hand-rolled titles (Personnel / Channel list / Advance overview / Riders); residual mono. Visual-heavy — gated on the six-page screenshot pass. After that + a green walk, the app goes to Adam for the live grading session.

---

## COMPETITIVE PHASE (2026-07-19 →) — beat ATOM before release

Master doc: `docs/design/COMPETITIVE_GAMEPLAN_ATOM_2026-07-19.md` (arena verdicts + Adam's rulings). STRICT ORDER, same rules as ever (single owner, bank-per-stage, migrations hand-pasted, harnesses green):

| # | Item | Spec | Status |
|---|---|---|---|
| C0 | Context hydration P0 (personnel hang / empty pickers / static Where·Who·What header) | `CC_CONTEXT_HYDRATION_P0.md` | queued |
| C1 | Artist builder rebuild | `CC_ARTIST_BUILDER.md` | queued |
| C2 | **M1** Money legibility + settlement | `CC_M1_MONEY_LEGIBILITY.md` | ✅ COMPLETE — chips, banner, Walk + itemized deductions (mig 243), catch-up queue, settlement PDF, inline rates, server-side Finalize. Settlement harness 21. Walked 8/9 → SET-05 fixed after walk |
| C3 | **X1** XLSX workbook export + review-queued import | `CC_X1_XLSX_WORKBOOK.md` | ✅ COMPLETE — six-sheet export (mig 244 proposals), dedupe import. Em-dash header 500 caught on walk, fixed |
| C4 | **D1** The Day + tour roles (Daysheets replacement) | `CC_DAY_AND_ROLES.md` | ✅ COMPLETE — Day object, PDF composer, tour_roles (mig 245), tokenized /m/day, View-as. ROLE smokes verified byte-level (money absent from crew HTML). §D1-6 quality stage: three-zone layout, contacts=venue people |
| C5 | **V1** Venue packet reshape | gameplan §V1 | ✅ COMPLETE — PDF-per-artifact Share, rider AI import (propose-only), one canonical rider. VP-01 screenshot walk pending Adam grade |
| C6 | **S1** Spaces / assets unification | `CC_SPACES.md` | ◐ Stages A–C COMPLETE (migs 246–250, 248 amended; unified gear; Assets surface live; zero rental_inventory writers). REMAINING: 251 finish (job_items DROP NOT NULL + Jobs picker → gear_id) + Stage D (storage→budget line, carnet/manifest exports, AI bulk import, QR scan→move) |
| — | F2 coherence slices threaded between items | above | ongoing |

Adam-owned decisions still open: confirm C2→C3→C4 order (or pull D1 forward); grade the venue-cleanup SQL run; two-tenant isolation test.
