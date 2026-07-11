# Visual alignment audit — production walk, 2026-07-05

Walked on `lowpass-tm-software.vercel.app` (main, post-pipeline). Verdict: **the design pass shipped components, not coherence.** New pieces (fingerprints, hero cards, Build/Advance/Share, derived chips, Needs-you queue) sit inside old chrome, old nav, and old page bodies — plus two functional breaks the pipeline's build-green gates couldn't catch because they only appear at runtime with real data. That's the "half-baked" texture: every page is 40–80% new, 20–60% old, and the seams are visible.

## P0 — FUNCTIONAL BREAKS (fix before any styling)

1. **Routing grid renders EMPTY.** `/operations/[tourId]/routing` shows every row as blank placeholder inputs (Venue/City/"Select day type") and the header derives "SHOWS 0 · none upcoming" — for a tour with 11 shows whose data demonstrably exists (the page's own mini-fingerprint is colored, and the Advance list renders every venue). Render/hydration regression in the routing grid, most plausibly from the venue-resolver or grid refactor. THE core surface is unusable.
2. **Advance day content errors.** Opening a show from the Advance list: Advance mode shows "Failed to load: 404"; Build mode canvas shows "Advance not found." for the same day. Days without an `advance_instance` surface raw error strings instead of a create/seed flow. Also most rows show "Sections 0/0" — per-show seeding absent.
3. **Derived-status logic inconsistent.** Workspace cards say "NOTHING BOOKED" for artists whose own Needs-you queue says "rehearsals in 57 days"; header says "9 IN PLANNING" (appears to count ended-unsettled tours); routing header says "none upcoming" with 11 future shows. One derivation module should own status/next-show/counts — today at least three disagree.
4. **Chrome state drift.** The artist/tour picker pills randomly show empty ("Pick an artist…") while INSIDE an artist/tour page, then repopulate on other pages; browsing workspace tabs silently selected an artist+tour. Context provider isn't hydrating from the URL.

## P1 — THE NAV NEVER MIGRATED (biggest single alignment lever)

- Tour tier still runs the OLD two-bar nav: `Home / Operations / Budget / Advance` + the nine-tab sub-bar. The designed nav — `Routing | $ Budget · ⧉ Advance | Crew · Production · Files` — exists nowhere.
- Artist tier wrongly carries the product nav (with orange-filled active pills, old style) ON TOP of the new Tours/Production/Business tabs — two competing nav systems on one page.
- Artist "Tours" tab body is the ENTIRE pre-design page: ACTIVE TOUR banner, four stat boxes (saying "ACTIVE TOURS 0" beside the ACTIVE TOUR banner — the exact collision we killed), the empty "0 dates" calendar strip, and the three empty product cards. The graded design (equal-weight date-ordered tour rows with fingerprints + week markers) is entirely missing.
- Artist "Production" tab = five mostly-empty icon cards (the banned empty-card antipattern), incl. a "Financials" card that overlaps the locked Business tab's purpose.

## P2 — HUE BUDGET NOT ENFORCED (the "AI look" is back via orange overload)

Orange is everywhere as paint: Equipment's giant filled INVENTORY/JOBS toggle + orange category chip on EVERY row + orange count chip; Budget's orange kebab button on EVERY row; Advance Build's 13 orange section tiles; routing's 3 orange transport icons per row; orange Export buttons; orange stereo checkbox; orange "Remove" (destructive = should be red). When 50 things are orange, nothing is. The rule stands: orange = act/attend/selected, ~3–5 instances per screen max. Also: Equipment rows use 📦 emoji (the sweep missed it), "Not linked" is a raw unstyled native `<select>`, and phones/emails/money in several tables aren't mono (VIS-G-02).

## P3 — TYPOGRAPHY & COMPONENT PROPORTION

- Page titles ("Personnel", "Equipment", "Channel list", "Routing") are plain bold sans — the display treatment (Barlow-style condensed caps) only exists on the workspace headline. Tier titles inconsistent page to page.
- Workspace card fingerprints are postage-stamp sized (a third of card width, 4px bars) vs the graded full-width strips; routing's hero fingerprint is a tiny squished corner element with colliding date labels instead of the full-width day strip.
- Routing readiness rail shows SHOWS/CREW/PENDING boxes — spec is the hairline strip: Routing / Advances / Crew / Budget.
- Routing grid column order still DATE…DAY-sixth — spec is DAY directly after DATE; drive-time interstitial chips render as bare "—" rows.
- Standardized card footer ("Next: <date> · <city>" + verb) not implemented — footers vary.

## WHAT'S GOOD (protect these during alignment)

Budget grid is the closest to spec (derived "↗ from Rooming/Payroll" chips, lock icons, keyboard footer, single grid, Classic gone, labeled USD). Advance list masthead ("11 SHOWS · 24 DAYS", day-type stripes, neutral status pills) is right. Channel list is functionally rich (stage-box grouping, provenance "Band (owned)" chips, outputs sub-grid with stereo, patch controls exist). Build mode's section library + Field Properties inspector shipped. Last-product resume ("Resume Operations") works. Real Spotify imagery landed.

## ROOT CAUSE, HONESTLY

The design pass was verified by build gates and self-reported VIS checks — nobody LOOKED at rendered pages with real data until now. The alignment pass therefore adds a hard gate: **every changed surface gets a full-page screenshot at desktop width, attached to the report, before a stage may bank.** I (Cowork) re-walk production after each banked stage.

Fix plan and prompt: `docs/handover/CC_ALIGNMENT_PASS.md`.
