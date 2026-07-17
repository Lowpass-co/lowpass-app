# Visual smoke status — production walks, 2026-07-12 (Cowork addendum)

Companion to `visual.md`. That file records the REQUIREMENTS (mockup-graded); this file records what the Cowork production walks actually VERIFIED during the alignment pass (Stages A–D). Land in `docs/smoke-tests/` after Stage E banks; CC keeps it current per stage thereafter.

## Corrections to the smoke corpus (accuracy issues found 2026-07-12)

1. **ID collision — ADV-40/41.** `advance.md` already used ADV-40 ("Three rail cards stacked") and ADV-41 ("Venue specs render only for non-null fields") before the alignment pass assigned the same IDs to the invitation-panel tests. RENUMBER the alignment tests to **ADV-50** (day without instance shows "Start this advance" invitation, never error strings) and **ADV-51** (Start POSTs seed from default template; no auto-seed on GET). Update CC_ALIGNMENT_PASS.md references.
2. **NAV-08 missing.** `nav.md:84` says "NAV-08 is the chrome-hydration test in visual.md" — visual.md contains no NAV-08. Add it there (or move to nav.md and fix the pointer): *pills hydrate from the URL on every route; tab-nav never mutates selection.*
3. **VIS-BS-01..05 not landed.** Stage C's report says they were added; they are in neither visual.md nor budget.md. Add to visual.md §Budget Summary: BS-01 planning-state neutrality (no red net, no slammed bars, invitation line) · BS-02 seeded-state correctness (income entered → margin renders; red only on true overrun) · BS-03 neutral section bars, est-total denominator · BS-04 single money display (no duplicate top strip on Summary) · BS-05 12-col grid, no void, page ends at content.
4. **New global IDs from the P0:** **IDLE-01** — every route reaches document-complete (no held-open navigations; regression test for the v1 SW class) · **SW-01** — unauthenticated GET `/sw.js` returns JavaScript, never a redirect (middleware exclusion).

## Verified state by ID (production, deploy ≥ Stage D `7999c56`)

**PASS (walk-verified):** VIS-G-03 (Equipment emoji gone) · VIS-G-04 (pills URL-hydrated all routes; Spotify imagery live) · VIS-WS-02 (§8 status lines derive: "Rehearsals in 55 days" / "First show in 45 days" / "Ended · not settled") · VIS-WS-04 (Needs-you queue, count matches rows) · VIS-WS-05 (money stat gone) · VIS-AR-01 (hero + tabs) · VIS-AR-02/03 (tour rows w/ fingerprints, past collapsed; legacy body deleted) · VIS-TR-01 (Routing landing) · VIS-TR-02 (readiness rail Routing·Advances·Crew·Budget) · VIS-TR-04 (column order + single transit icon) · VIS-TR-05 (drive chips interstitial) · VIS-TR-07 + NAV-09..13 (grouped nav all tiers) · VIS-BG-02/03/04 (derived locks/chips, ƒ section, vendor+day cols) · BS-01/03/04/05 (Summary planning-neutral, neutral bars, no dup strip, one-row cards) · ADV-50 (invitation panel) · ROUTE-05 (grid renders all rows + chips) · IDLE-01 · Equipment orange ≈4 (hue budget) · Advance Build library neutral.

**OPEN (walk-failed or not yet built — E/F scope):**
- VIS-WS-03 — footer still "Nothing booked" with a derived next show present (E-preflight 1).
- VIS-WS-01 (partial) — Spotify images ✓; card fingerprint still small, fill mode not reaching the mount (E-preflight 2).
- VIS-AB-01 (partial) — naming/breadcrumb ✓; switcher still text tabs, segmented control is Stage E.
- Advance Build PENDING stat renders orange at zero (E-preflight 3).
- VIS-BG-01 — version bar not observed on the Expenses tab in any walk; verify it exists post-parity or flag.
- VIS-BG-05 — red-on-unfavourable unverified (needs seeded overrun).
- Title system across pages (Stage E) — Personnel/Equipment/Channel list/Routing titles still plain sans at last observation.

**UNVERIFIED LIVE (needs seeded data or deeper interaction — Adam's grading tool covers these):** VIS-G-05/06/07/08 (motion, popovers, autosave pills, review grammar) · VIS-AA-01..04 (needs a started advance) · VIS-AS-01..05 (Share surface w/ live link + packet) · VIS-AB-02..07 (drag, deal-memo flow, template prompts) · VIS-CL-01..07 (incl. venue-supplies chip, Gain column, patch mode end-to-end) · VIS-SP-01..07 · VIS-RB-01..04 (VIS-RB-05 still awaiting Adam's §6 catalog grading) · VIS-EX-01 (export shell parity) · BS-02 (seeded Summary) · LAB-01..04 / INTK-01..05 in-app flows.
