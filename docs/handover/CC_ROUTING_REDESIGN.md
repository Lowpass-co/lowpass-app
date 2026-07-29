# CC — ROUTING REDESIGN. Adam graded the mock: PASS with two amendments (applied). SINGLE OWNER, bank-per-stage, Vercel-success rule.

Reference implementation: `docs/design/ROUTING_REDESIGN_MOCK_2026-07-20.html` — open it in a browser and match it. Adam's verdict: "I really like it" + two changes, both already IN the mock: cross-links are modern buttons, and "Labor calls" is renamed **Schedule** (a TM's word; labor calls + advance times are what Schedule opens). Build to the mock and the numbers below; where they conflict, the mock wins visually and this doc wins behaviorally.

## What survives untouched (do not regress)
- The keyboard contract, exactly as shipped in CC_ROUTING_KEYBOARD: arrows change day type in place · Tab next cell · type-to-search venues, results FIRST, create-new LAST · Tab commits · Esc reverts · no control swallows Tab. KEY-04..07 re-run green.
- `resolveVenue()` read path, canonical-venue FK behavior, free-text venue support.
- The routing GET chokepoint + on-read freeze. Grid renders its payload as today.

## The page, top to bottom
1. **Header row:** `ROUTING` in the condensed title system + ONE mono stat line replacing the five KPI boxes: `21 days · 12 shows · 0/21 advanced · £40K committed · 2 pending⚠` — pending keeps warning color + its click-through; each stat deep-links where the old box did. Right: Calendar · Map · Export… · ＋ Add day as quiet chips. The five KPI cards are DELETED.
2. **Fingerprint strip:** unchanged component, two fixes — tooltip renders ABOVE the strip (never overlays the grid; this is also the standing fixpack item — same fix, don't do it twice), hover raises the bar to 26px, click scrolls-to/opens that day. Current-day bar gets the 2px orange outline.
3. **The ledger** (replaces the input-grid):
   - Columns: Date 118px · Day 108px · Venue 1fr · City 170px · Transit 130px · Status 88px · ⋯ 34px. `table-layout:fixed` grammar per G2-2b — columns never size to content.
   - Row height 46px, day-type tick 3px left edge, hairline dividers `rgba(255,255,255,.05)`, row hover `#17171a`.
   - **Text-until-touched:** cells render as text; click or Tab focus converts the cell to its editor (day-type = in-place arrows control; venue = the existing autocomplete; city = input). 2px orange inset ring on the focused cell (G2-2b cursor treatment). NO permanently-rendered input chrome.
   - Date `mono 12.5px` (day-name bold) · venue `14px/500` · city `13px muted` · travel-day venue/city ghosted (`--dim`, weight 400).
   - **Transit column:** mono `2h15 · 155mi`, drive-time value in the travel hue. The interleaved transit rows are DELETED. The transit-mode selector moves into the Export/settings popover.
   - **Status dots** (right, 7px): advance · hotel · crew. Grey untouched, green done, amber needs-attention. Tooltip on hover names each. Derive: advance = that routing's advance status; hotel = rooming row exists for the night; crew = day has calls/assignments. One derivation module, no per-cell queries (compute in the page loader).
4. **Row expansion** (⋯ or chevron; one open at a time; ~180ms ease):
   - Fields: Address · Country · Capacity (via resolveVenue) · Notes (editable here — this is where the Notes column went) · Transport summary.
   - **Button row** (the graded treatment): `Open day sheet` (primary orange) · `Advance this show` · `Schedule [n]` (n = call count; opens the labor page with date preselected — this satisfies the labor-discoverability fixpack the RIGHT way) · `Day budget` · `Rooming` (only when hotel attached). Secondary buttons: `#1c1c20` bg, 1px line border, 8px radius, 8×14 padding, 12.5px/500, hover border-orange + `#FF45000d` bg.
5. **Keyboard hint line** under the ledger, mono 11px dim (as mocked).

## R5 — ROUTING AS THE SPINE (Adam's ruling, added at mock sign-off)
Adam, verbatim: "When we click onto advance, instead of loading a new page, animate the routing to the left hand bar and make it scrollable, like it is in the advance atm. Same for schedule and rooming etc. The whole app should hang off the routing. The only exception REALLY is budget and production stuff."

The pattern: the routing ledger is the master; day-scoped surfaces are details. Clicking **Advance this show / Open day sheet / Schedule / Rooming** does NOT feel like page navigation — the ledger collapses into a compact left **RoutingRail** (scrollable, clickable) and the destination fills the remaining width. Clicking another day in the rail switches the detail in place. **Budget and Production remain standalone product jumps** (Day budget still leaves for the Budget product) — those are the ONLY exceptions.

Build rules:
- **ONE rail component.** The Advance surface already has a routing rail — CONVERGE onto a single `<RoutingRail>` (approx 220px: date · day-type tick · venue/city abbrev · status dot; search at top; current day highlighted with the orange outline; scroll position preserved across day switches). Do not ship a second rail beside the advance's existing one — replace theirs with the shared component in the same pass. A duplicated rail is the dual-system anti-pattern.
- **Transition:** ledger → rail collapse animated (the clicked row visually becomes its rail entry). Prefer the View Transitions API (Next's experimental viewTransition flag) with a graceful instant fallback where unsupported; if the flag proves unstable in build, a CSS-level shared-layout animation within a client-side surface is acceptable — say which you shipped and why. Target ≤250ms, ease-out, no layout jank on the detail side.
- **URLs stay real.** Every rail+detail state is a routable URL (deep-linkable, back-button works). No modal-only states.
- **Day switching in the rail must not refetch the world** — detail data only; the rail's own data is already loaded.
- Day view (D1) adopts the rail as its left zone — its existing date rail IS this rail; converge rather than keeping two implementations.

## Stages
R1 header+stats+fingerprint-tooltip · R2 ledger conversion (text-until-touched + transit column + status dots) — KEY smokes re-run IN THIS BANK · R3 expansion row + buttons + Notes migration into expansion · R4 delete dead components (KPI cards, transit rows, always-on inputs) + full-page screenshots 1440/1920 · **R5 the spine: shared RoutingRail + collapse transition + advance/day/schedule/rooming converged onto it** (biggest stage — topology-map the advance's current rail and the D1 date rail FIRST, report file:line, then converge).

## Gates
Floor green · KEY-04..07 verbatim output in R2's report · no money paths · grep: zero references to the deleted KPI-card and transit-row components · raw git evidence + Vercel success per bank. Cowork walks once at the end; Adam re-grades against the mock side-by-side.
