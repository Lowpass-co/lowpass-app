# CC — D1: THE DAY + TOUR ROLES (the Daysheets/Master Tour replacement). SINGLE OWNER, BANK PER STAGE.

Adam's ruling (2026-07-19): build the day-to-day layer — "if we can easily build it so we DO replace Daysheets/Mastertour etc, then lets do that. It'll be online only but will need a lot of diff user views." Competitive context and the exact bar to beat: `docs/design/COMPETITIVE_GAMEPLAN_ATOM_2026-07-19.md` Part 1 §7 and §10. Read it first.

Runs AFTER: P0 context hydration (`CC_CONTEXT_HYDRATION_P0.md`), artist builder, and ideally M1 (settlement/finalize semantics). Does NOT depend on S1/X1.

## Design constraint (Adam, on the competitor)
"Too many places for everything. it's SO much data." ONE day surface. Tabs only where a section genuinely overflows. Assembly of data we already hold — this build should create almost no new data-entry surfaces.

## D1-1 — The Day object (read composition, no new tables)
A per-routing-row surface at `/operations/[tourId]/day/[routingId]` (and linked from routing rows + the identity band date context):
- **Venue block** via `resolveVenue()` ONLY (house rule) — name, address, phone, capacity, maps link.
- **Schedule** — merge labor calls (mig 239 registry) + advance schedule fields for that show. One timeline, source-tagged. Support an `approx` flag on times (small column on labor calls if absent — check schema first).
- **Hotel** — from rooming's hotel sheet for that night.
- **Travel** — flights/ground touching that date.
- **Day-of contacts** — tour personnel with day-relevant roles + venue contacts from the advance.
- **Notes** — per-day notes field (this is the one new writable: `routing_day_notes` or a column on routing; check what exists before adding).
- NO money on the day surface for crew-facing views; TM view may show a compact P&L chip linking to Budget. (Their 11-tab day view is the anti-pattern.)
Loader: one server composition function `loadDay(tourId, routingId)` in `src/lib/day/` — every block nullable, page renders gracefully with gaps. No client-context gating (that's the P0 lesson).

## D1-2 — Day Sheet PDF composer
Modal from the Day surface: audience templates **Standard / Crew / Driver / Band / Compact 1-pager**, section checkboxes (schedule, venue+address, hotel, contacts, arrival/parking notes, general notes), preview, Download PDF through the SHARED export shell (house rule — no bespoke PDF chrome). Template = a preset of section toggles + type scale (Driver/Big-type = larger). Competitor reference: ATOM's composer has 7 templates; ours ships 5, better set.

## D1-3 — Tour roles (schema + enforcement)
Migration (next free number ≥241 — VERIFY against main + branches per README; idempotent; down-block):
- `tour_roles`: id, workspace_id, tour_id FK, person_id FK (canonical persons), user_id nullable (linked when the person has an account), role enum: `tm | production | accountant | crew | driver | band | management`, created_at. UNIQUE(tour_id, person_id).
- Role → slice mapping lives in ONE module `src/lib/roles/slices.ts`: which blocks of the Day, and which products, each role sees. crew = day sheet slice per `docs/design/PERMISSIONS_MODEL_2026-07.md`; driver = schedule+venue+parking+hotel; band = schedule+hospitality+guest-relevant; accountant = money read; management = read-most.
- **Enforcement is server-side**: the Day loader and any role-scoped API filter by slice on the server. Where feasible bind to RLS (user_id-linked roles); tokenized access (below) is service-role + token-scoped like advance-intake. Competitor's role views are cosmetic (UI hiding); ours must not be — that's the headline differentiator. State in the report exactly which layers enforce each slice.

## D1-4 — Tokenized role links + /m/today
- Per-person tokenized link (pattern: `advance-intake/[token]` — reuse its token issuance/revocation grammar, service-role client, no signup) opening the role-scoped mobile Day: `/m/day/[token]`.
- `/m/today` (exists from LAB build) becomes role-aware: resolves the person's role on the active tour and renders their slice.
- Mobile-first, fast, offline-tolerant read (no SW navigation interception — SW v2 rule).

## D1-5 — View-as
TM/admin control (pattern: bottom-right, like the bug tool placement) listing the seven roles; selecting re-renders the current Day/product through that role's slice. This is the permissions debugger AND the demo feature. Server-checked: view-as must go through the same slice filters, not a client flag.

## Smokes
DAY-01 day surface renders all blocks for a show day with full data · DAY-02 renders gracefully with empty blocks · DAY-03 composer produces Crew + Driver PDFs with correct sections · ROLE-01 crew token link shows crew slice ONLY (assert a money field is absent in the HTML, not hidden) · ROLE-02 view-as Driver matches driver token view exactly · ROLE-03 revoked token 404s · DAY-04 /m/today renders role slice on mobile viewport.

## AMENDED 2026-07-20 — D1-6: Day surface grading response (Adam walked production; D1-1..5 smokes all PASS, then Adam graded the surface "poor")

Walk state: DAY-01/02, ROLE-01/02/03 all PASS on `e025d8c` — the enforcement story is verified byte-level (token HTML: venue+schedule present, zero money/notes markers; revoke 404s). What follows is a QUALITY stage, not rework of the architecture.

**1. Contacts block — WRONG SOURCE (Adam's ruling, data bug).** It currently renders the tour roster. Adam: "The contacts just show everyone ON the tour. The contacts are the people at the venue we grab from the deal memo or advance." Fix: the Day's contacts = **show-day contacts** — advance key-info venue contacts + deal-memo-extracted contacts for that show (promoter rep, venue production, hospitality, runner…), each as name · role/company · phone (tel:) · email (mailto:). The tour roster does NOT belong on the Day (it lives in Crew). If the show has no captured contacts yet, empty-state invitation: "No day-of contacts yet — they land here from the advance →" linking to that show's advance.

**2. Visual rebuild to the Daysheets bar (Adam supplied a Daysheets-app screenshot as the reference; ATOM's day view is the other ref).** Target information architecture, adapted to OUR design system (tokens, condensed titles, hairlines — not a clone):
- **Three-zone layout**: left = date rail (every tour day, day-type COLOR BAR on each entry, day-type + venue + city per row, search by city/venue/date, Today pinned; Day/Month/Routing view toggle at the bottom of the rail); center = **Schedule** as the dominant column (time · item rows, generous 15px type, approx chip, per-item status tick, Edit affordance for TM); right = stacked info cards:
  - **Day Type & Locations** — day-type chip + venue name + full address (maps link).
  - **Lodging** — hotel name, address, check-in/check-out dates side-by-side, phone affordance, occupant chips (who's rooming there, from rooming data).
  - **Notes** — card per note with title, body preview + "Read more", author + timestamp meta line (slice-gated per the existing notes ruling).
  - **Contacts** — per §1.
- Blocks render only when they have content OR an invitation (no permanent empty boxes). The per-day route and /m/day token view share this layout (token view = same components, slice-filtered).
- Screenshot acceptance at 1440 + 1920, per-surface visual bar per the card grammar in `docs/design/DESIGN_DIRECTION_2026-07.md`.

**3. Two defects from the Cowork walk:**
- **Assign-crash (bug):** clicking Assign with "Choose person…" unselected throws an unhandled error and crashes the page to the error boundary. Disable Assign until both selects hold values; API rejects cleanly regardless.
- The roles panel shipped **two native `<select>`s** — convert to StyledSelect (no new native selects in new code; F2 rule).

Smokes: DAY-05 (contacts = advance/deal-memo people, roster absent) · DAY-06 (layout matches the three-zone reference at both widths) · ROLE-04 (Assign with empty selection is inert, no crash). Existing ROLE smokes must stay green — the layout rebuild must not touch the slice enforcement in loadDay.

## Gates
Floor green · money harnesses untouched (day surface is read-only over money) · migration delivered as paste-SQL, wait for Adam's "pasted" · git evidence raw output · Cowork walks production per stage. Verify-before-claim: name files/lines for the slice enforcement.
