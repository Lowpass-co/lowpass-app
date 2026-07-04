# CC — Hygiene pass (P3). Run AFTER the P1/P2 specs land (shared files). SINGLE OWNER.

Precondition: `main`, floor green, CC_RATES_CONVERGENCE + CC_FX_UNIFY + fixpacks merged. Gates per section: `tsc` 0 · `eslint` 0 · `next build --webpack` green. Commit per section.

## 1. Delete proven-dead code
- `src/components/tours/TourBreadcrumb.tsx` — zero importers (verified; remaining hits are comment prose in `TourPhaseContextStrip.tsx`, `ProductShell.tsx`). Delete + scrub the comments that reference it.

## 2. Dedupe formatting helpers (behavior-preserving — no output changes)
- Currency: locals in `BudgetSpreadsheetView.tsx:265`, `BudgetSummaryTab.tsx:64`, `BudgetMainTable.tsx:73`, `TransactionsSection.tsx:490`, `BudgetBurnBar.tsx:54` (`formatMoney`), `CrewMyScheduleClient.tsx:45` → canonical `formatCurrency` in `src/lib/utils.ts:116`. If a local differs (rounding, symbol), preserve its behavior via an options arg — do not silently change rendered output.
- Dates: fold the ~7 local `formatDate`/`formatDateRange` re-implementations into the `lib/utils.ts` cluster. Leave the 50+ raw `toLocaleDateString` call sites alone this pass (too wide; list them).
- Debounce: migrate the 8 hand-rolled `useRef`+`setTimeout` debounces (AddPersonnelSlideOver, AdvanceShowReadView, AdvanceSectionBuilder, ArtistCreateSlideOver, ArtistEditSlideOver, ArtistNewBlock, VenueAutocomplete, PlacesAutocompleteInput) to `useDebouncedSave`/`useAutoSave` ONLY where drop-in; skip and list any with bespoke semantics.

## 3. SlideOver contract sweep — first tranche only
41 of 43 backdrop-chrome files bypass the `<SlideOver>` primitive (CLAUDE.md's "UX13 sweep done" claim is false). Convert the 5 highest-traffic first: `PersonnelDetailSlideOver.tsx`, `NewArtistSlideOver.tsx`, + pick 3 by inbound-usage grep. Per `docs/components/SLIDE_OVER_CONTRACT.md`. Visual parity required — if a conversion changes layout, stop that file and flag. List the remaining ~36 for future tranches.

## 4. CLAUDE.md corrections (single commit, verbatim edits)
- "Active project": Phase 0-3 + advance redesign MERGED; current state = post-consolidation `main` (see `CONSOLIDATION_2026-07-03.md`).
- Phantom-tables note: `rental_*` created in `092_*`, `workspace_members` in `078_*` — zero phantom tables remain.
- `_legacy/budget` exceptions: add the undocumented 4th import (`SettlementTab` @ `budget/[tourId]/settlement/page.tsx:18`).
- Remove/rewrite the "UX13 sweep target is done" sentence (false — see §3).
- Shell-v1 scope: note 28 PageShell importers remain pending Phase 4 (not just auth/share/mobile).
- `_legacy/sidebar`: already deleted — drop the paragraph.

## 5. Branch cleanup (ADAM runs these, not CC — list only)
Covered in `CONSOLIDATION_2026-07-03.md` §5-6. CC: verify the salvage branches' content landed (fixpack merged) before Adam deletes them.

## Out of scope
The 29 canonical-entity read violations (needs a descriptor read-API design first — separate discussion), fetch-wrapper introduction (new abstraction, needs Adam's sign-off), raw `toLocaleDateString` call sites.

## Verify before claiming (hard rule)
Per section: files+lines, grep proof for every "zero importers" deletion, screenshot-parity note for §3 conversions, floor-green per commit. Name what you skipped and why.
