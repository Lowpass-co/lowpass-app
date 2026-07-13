# CC — ALIGNMENT PASS. Make the shipped pieces into ONE app. Staged, bank-per-stage, SINGLE OWNER.

Source of truth: `docs/design/VISUAL_ALIGNMENT_AUDIT_2026-07-05.md` (production walk findings) + `docs/design/DESIGN_DIRECTION_2026-07.md` (the contract) + `docs/smoke-tests/visual.md`. The design pass shipped components; this pass ships coherence. Strict stage order — functional breaks before styling, nav before pages, pages before polish.

**NEW HARD GATE (applies to every stage): before a stage banks, take a full-page screenshot of EVERY surface the stage changed (desktop ~1440, real data, dev server) and attach/reference them in the report. "Build green" is no longer sufficient evidence for visual work — the audit exists because self-reported VIS checks diverged from rendered reality.** Floor gates as always (`tsc` 0 · `eslint` 0 · `next build --webpack`). Money invariants untouched (harness 52/52 · provenance 18/18 · FX greps 0 — run at Stage A and Stage F to prove no drift).

## STAGE A — P0 functional repairs (no styling in this stage)
1. **Routing grid empty-render**: `/operations/[tourId]/routing` rows render as blank inputs and header derives "SHOWS 0 · none upcoming" for a tour with 11 shows whose data renders fine on the Advance list. Diagnose the grid's data path (suspect: venue-resolver refactor or grid rewrite changed the routing GET payload shape the grid binds to). State the root cause in one sentence in the report. Regression smoke ROUTE-05: grid renders N populated rows for a tour with N routing rows.
2. **Advance day 404s**: opening a show yields "Failed to load: 404" (Advance mode) / "Advance not found." (Build canvas). Days without an `advance_instance` must get a graceful create/seed flow ("Start this advance" applying the tour's default template), never raw error strings; if instances SHOULD exist and don't, fix the seeding. Also investigate "Sections 0/0" on most rows. Smoke ADV-40: opening any listed day never shows an error string.
3. **One derivation module**: create/consolidate `src/lib/derive/tourStatus.ts` — nextShow (Show Day-filtered), status line (verb + time anchor per DESIGN_DIRECTION §8), counts (in-planning = future tours only; on-tour-now; ended-unsettled). Workspace cards, workspace header stats, artist page, routing header ALL consume it. Kills: "NOTHING BOOKED" beside "rehearsals in 57 days", "9 IN PLANNING" counting ended tours, "none upcoming" with 11 future shows. Smoke DRV-01..03.
4. **Chrome state hydration**: the artist/tour picker pills must hydrate from the URL on every route (artist page ⇒ artist filled; tour page ⇒ both filled; workspace ⇒ contextual/empty) and never mutate selection as a side-effect of tab navigation. Root-cause the drift (ArtistTourContext vs URL). Smoke NAV-08.
5. **Dev-note leak on Files**: the string "Non-registry slide-over: FileSlideOver is rendered by this page locally…" renders TO USERS on `/operations/[tourId]/files`. Remove it; grep for sibling leaked implementation notes rendered as JSX text.
6. **Riders landing kind-filter bug**: the Rider packs list shows `kind='stage_plot'` packs (observed: "CS | Headline USA Stage Plot" as the only "rider"). Filter by kind; smoke RID-05.
Bank → push → screenshots of routing grid + one advance day + workspace.

## STAGE B — Nav migration (the designed IA, everywhere)
1. **Tour tier**: replace the two-bar Home/Operations/Budget/Advance + nine-tab system with the designed single nav row: `Routing | $ Budget · ⧉ Advance | Crew · Production · Files` (hairline dividers; icons on the two products; active = orange underline, NOT filled pills). Crew groups Tour Personnel/Payroll/Rooming; Production groups Channel list/Stage plot/Riders; sub-tabs render INSIDE those sections (segmented control), Summary content folds into the Routing landing header. URLs unchanged (redirect map only where a grouped landing needs one).
2. **Artist tier**: REMOVE the product nav entirely — chrome is workspace-crumb + pills + account; the page's own Tours/Production/Business tabs are the only nav. Tour access is through tour rows/pills.
3. **Workspace tier**: keep Artists/Personnel/Equipment tabs; picker pills contextual.
4. Breadcrumb at advance-day level includes the show (`Charlotte Sands / USA Headline '26 / 9 Sep — EXIT/IN`).
Bank → push → screenshots: one page per tier showing the chrome.

## STAGE C — Page-body alignment (the graded designs, for real)
1. **Artist / Tours tab**: delete the old body (ACTIVE TOUR banner, 4 stat boxes, "0 dates" calendar strip, 3 product cards). Build the graded body: equal-weight date-ordered tour rows (current+future) with row-scale fingerprints + week-commencing markers + one derived status line each; past tours collapsed to one settled/unsettled line. VIS-AR-02/03.
2. **Artist / Production tab**: replace the empty card grid with a compact asset list (riders/channel lists/stage plots/files with counts + last-edited, one row each); kill the "Financials" card (its contents belong to Business).
3. **Workspace cards**: fingerprints to full card width (graded proportions); standardized footer left "Next: <date> · <city>" (from the derivation module) right derived verb. VIS-WS-01..03.
4. **Routing landing**: full-width hero day-strip (mono day numbers, muted hues, non-colliding labels, hover popover, click→row), hairline readiness rail (Routing / Advances / Crew / Budget — from the derivation module + real advance counts), grid column order DATE·DAY·VENUE·CITY·ADDRESS·NOTES·TRANSIT (one neutral method icon), drive-time chips as real interstitial rows, full-height scroll. VIS-TR-02..06.
5. **Budget Summary — full rebuild (promoted from long-tail; Adam-flagged).** The page's chart semantics must be designed for every data state, not just a mid-tour one:
   - **Planning state** (no income, no actuals): NEUTRAL framing — "Projected position" with the est total in normal text; NO red net, NO full-width slammed bars. Red is reserved for real overrun (actuals > estimate) or negative settled net. A single quiet line: "No income entered yet — add income →" (invitation pattern).
   - Bars scale against a sensible denominator (est total), colored by the hue budget: neutral bars, green favourable, red unfavourable — never orange-as-bar-fill.
   - One 12-col grid: KPI strip (Projected / Committed / Spent / Remaining — mono, labeled currency) → sections breakdown → per-show income + overheads side by side. No floating cards, no 60% void; the page ends where content ends.
   - Kill the duplicated top money strip on this tab (the KPI strip replaces it); one Export, one Customize, both secondary style.
   - Empty sub-cards use the invitation pattern ("Set overhead % in Settings →"), never bare gray text.
   VIS-BS-01..05 (new IDs: planning-state neutrality, denominator sanity, hue budget on bars, single money strip, no void).
Bank → push → screenshots of all five (Summary in BOTH planning-state and a seeded with-income state).

## STAGE D — Hue-budget enforcement sweep (mechanical, page by page)
Inventory every orange element per page; each keeps orange ONLY if it is: the single primary action, active/selected state, or an attention signal. Everything else → neutral. Known offenders from the audit: Equipment (filled INVENTORY/JOBS toggle → segmented neutral w/ orange underline; per-row category chips → neutral; 📦 emoji → icon set; count chip), Budget (per-row orange kebab → neutral, orange on hover), Advance Build (13 orange library tiles → neutral tiles, orange on drag/hover), routing transport icons (one neutral method icon), Export buttons (secondary style; ONE primary per page), stereo checkbox (neutral filled), Remove/destructive (red), PENDING zero (neutral when zero — orange only when >0). Also: native `<select>` elements (stage-plot link picker) → styled component; mono sweep for phones/emails/serials/money in Personnel/Equipment tables (VIS-G-02). Target per screen: ≤5 orange elements. Report a before/after orange-count per page.
Bank → push → screenshots of Equipment, Budget, Build, Routing.

## STAGE E — Typography + title system
One page-title component: display treatment (condensed caps per DESIGN_DIRECTION §3) + subtitle, used by EVERY page (Personnel, Equipment, Channel list, Routing, Budget tabs, Advance, Venues, Settings). Tier headline hierarchy consistent (workspace > page > section). Micro-label caps consistent. Advance mode switcher styled as the segmented control (not text tabs).
Bank → push → screenshots of six pages.

## STAGE F — Long-tail sweep + re-verify
Venues, Settings, Rooming, Payroll, Stage plot pages: apply title system, hue budget, mono rule, empty-state pattern (invitation + one verb, never raw error text, never bare "—"). Two pages get explicit treatments (Adam-flagged):
- **Files**: full-width `<DataTable>` hub, not a floating card — columns Name/Type/Tag/Uploaded by/Date/Size, an Upload button (primary) + full-page drag-drop zone, per-row slide-over preview. Empty state: "Nothing here yet — drop files or Upload →". Dev-note leak already removed in Stage A; confirm no other JSX-rendered implementation notes survive.
- **Riders landing**: kind-filtered pack list (bug fixed Stage A) rendered as proper rows: pack name, scope chip (artist ↘ / tour / show), inheritance state, sections count, last-sent, updated — plus "New rider pack" and a quiet link to the artist's Production masters. LAST SENT empty renders as "never sent", not "—". Re-run money harnesses (52/52, 18/18) + FX greps to prove the pass moved zero money. Update `docs/smoke-tests/visual.md` with the new IDs (ROUTE-05, ADV-40, DRV-01..03, NAV-08, per-page orange counts). Final consolidated report with the full screenshot set.

## Out of scope
New features (labor calls/intake/patch already shipped — don't rework), §B design ideas not yet graded (product-card content, first-run checklist), mobile `/m/*`, exports (already on the shared shell — spot-check one PDF only).

## REPORT format
Per stage: root causes (one sentence each for Stage A), files+lines, screenshot references per surface, orange before/after counts (Stage D), smoke IDs landed, harness outputs (A & F). The Cowork session re-walks production after each banked stage — expect independent verification against the screenshots.

---

## Smoke-ID note (alignment pass F3)

`ADV-40` in this document = the alignment test "opening any listed day never
shows an error string" (Stage A / §A2). The two pre-existing right-rail visual
checks that previously held ADV-40/41 in `docs/smoke-tests/advance.md` were
renumbered to **ADV-50 / ADV-51** to end the collision.

## Alignment pass — status (as of F3)

Stages A–E complete + Cowork-verified; F0 (debug endpoint) + F1 (derivation
regression fix) banked. F2 polish (native-select → StyledSelect ~60 sites,
destructive→red audit, Files/Riders page treatments, empty-state invitation
sweep, the four remaining hand-rolled titles) is the scoped continuation for
after the green production walk — it is visual-heavy and gated on the six-page
screenshot pass. Money invariants held all pass: fees 15/15 · reconcile 52/52 ·
provenance 18/18 · FX greps 0 · tourStatus 14/14.
