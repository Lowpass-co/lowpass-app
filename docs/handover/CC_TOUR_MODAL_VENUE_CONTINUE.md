# CC — CONTINUE: venue routing UI → modal → advance auto-fill. Build. Stack on `feat/routing-venue-search`.

Parts 1 + Part-2-backend are merged-ready on origin (`feat/venue-lib-address` @ `eb90986`,
`feat/routing-venue-search` @ `66885bb`, verified). Continue the **remaining** work from
`CC_TOUR_MODAL_VENUE_BUILD.md`: **Part 2 UI → Part 3 modal → Part 4 advance auto-fill**, stacked in order on
`feat/routing-venue-search`.

## 🔧 PROTOCOL RECALIBRATION — read this first (it changes how you verify UI)
The "prove it with a functional repro" rule exists to stop over-claiming on **logic/data** (the em-dash bug,
the routing `workspace_id` filter, the Excel cells) — cases a node harness CAN prove. **It does NOT mean defer
all UI.** UI is verified **live, by Adam, on the preview** — that is the established loop and the only place
DOM behaviour can be proven. So for **UI-only** work:
- Map the area, build it carefully, keep the floor green (`tsc` 0 · `eslint` 0 · `next build --webpack`).
- Push to the branch and **report a numbered "Adam live-test script"** — exact clicks + expected result per
  smoke ID. That IS the verification hand-off for UI. Do not withhold the build waiting for a headless proof
  that can't exist.
- **Reserve deferral** for a genuine architectural ambiguity you cannot reason about from the code — NOT for
  "I can't click it myself." Build the specified UI; flag only real forks.

## 🟢 DE-RISK the VenueAutocomplete concern (this removes the blocker you flagged)
Library-first search is a **new, cheap path that goes IN FRONT of the existing Places picker** — it does not
rewrite it:
1. **Map `VenueAutocomplete` first** — its Places **session-token**, `onBlur`, and billing logic. Write down
   the invariant (one session token per resolved pick; no per-keystroke Places calls). **Preserve it byte-for-
   byte.**
2. Wire the flow as: **type → hit `GET /api/venues/canonical/search` (the Part-2 endpoint — cheap, no Places
   billing) → show library matches FIRST.** The existing Places/`VenueAutocomplete` path is invoked **only**
   for the "Create '<typed>' as a new venue" fallback (no library match). Net effect: **fewer** Places calls
   than today, because most picks now resolve from the library.
3. If integrating cleanly genuinely requires touching the session-token logic, STOP and flag the exact lines —
   that's the one real bridge here. Otherwise wrap, don't rewrite.

## The remaining work (full specs in `CC_TOUR_MODAL_VENUE_BUILD.md` — unchanged)
- **Part 2 UI** (`feat/routing-venue-search`, continue on it): grid headers + column order
  **Date · Venue · City · Country · Address · Day**; Tab-across / type-to-search / Enter-to-accept keyboard
  flow; library-match dropdown → link `canonical_venue_id` + auto-fill city/country/address/lat-lng/capacity +
  orange `ti-library` marker; Address editable (manual edit persists, does NOT unlink); no-match → create via
  the preserved Places path → `findOrCreateCanonicalVenue`. Smoke `ROUTE-VEN-01..` + the live-test script.
- **Part 3 modal** (branch `feat/tour-editor-modal` off Part 2): the pinned visual spec, `TourEditorProvider`
  + `useTourEditor()` shared host, `<Modal>` (add a wide size), reuse `TourCreateSlideOver` logic, embed the
  Part-2 grid on step 2, fold in edit (retire `EditTourSlideOver`'s drawer), repoint all 8 `/tours/create`
  entry points, **delete the wizard GATED on zero-importer grep**. Smoke `TOUR-MODAL-01..` + live-test script;
  the live authenticated create is Adam's click.
- **Part 4 advance auto-fill** (branch `feat/advance-venue-autofill` off Part 3): non-destructive seed of the
  advance venue-info section from the linked canonical venue; skip `locked`; never overwrite user entries;
  Direction A / workspace-private only. Smoke `ADV-VEN-01..`.

## Invariants (unchanged)
Workspace-RLS intact; `canonical_venues` stays world-read facts-only; advance stays workspace-private (no
Direction B); tokens only; reuse `<Modal>` + the context-provider pattern; preserve the Places billing
invariant. Each part: own branch (2-UI continues on `feat/routing-venue-search`), commit + PUSH, confirm
`git log origin/<branch>`, report hash + smoke IDs + the Adam live-test script. Stop only on a real fork.
