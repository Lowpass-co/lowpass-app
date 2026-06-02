# Flight smoke — Sprint 11 + Sprint 12

One self-contained checklist covering everything that has shipped but hasn't been smoked. Designed for a single uninterrupted session.

Branch: `feat/sprint-12-rental-plus-closeout` (15+ commits ahead of main as of 2026-05-11).

Pre-flight Sprint 11 carry-over (§2–§6) is identical to `SPRINT_11_FINAL_SMOKE.md` and reproduced here so you only need one doc on the plane.

---

## §0 — Pre-flight setup

Do these BEFORE the flight (need internet + access to Vercel + Supabase). Without these, the rest of the smoke fails for the wrong reasons.

| ID | Action | PASS criteria |
|---|---|---|
| 0.1 | All migrations 090–101 applied to Supabase | `SELECT filename FROM public._lp_migrations WHERE filename LIKE '09%' OR filename LIKE '10%' ORDER BY filename;` returns 12 rows (090, 091, 092, 093, 094, 095, 098, 099, 100, 101 — plus 097 if §7 migration applied) |
| 0.2 | `CRON_SECRET` set in Vercel env | Vercel dashboard → Settings → Environment Variables — present, prod scope |
| 0.3 | `NEXT_PUBLIC_APP_ORIGIN=https://lowpass.co` set in Vercel | Required so §12.2 printed QRs encode the prod URL not a preview host |
| 0.4 | `ANTHROPIC_API_KEY` set in Vercel | Required for §12.9 AI generate. Key starts `sk-ant-api03-…`. Credit must be topped up for the generate test to pass; without credit the endpoint returns 402 (test result is then "infrastructure-pass, can't verify AI output") |
| 0.5 | `RESEND_API_KEY` set in Vercel | Required for §11.3 email triggers |
| 0.6 | Branch `feat/sprint-12-rental-plus-closeout` deployed to a Vercel preview URL OR merged to main + deployed | Without deploy, /api/* endpoints in §12.10 / §12.11 won't be testable |
| 0.7 | Bookmark the deployed preview URL on phone | Needed for §12.2 QR scan tests |

---

## §11 — Sprint 11 carry-over

Original spec: `docs/handover/SPRINT_11_FINAL_SMOKE.md`. Same test IDs preserved.

### §11.2 — Personnel intake form expansion

| ID | Action | PASS criteria |
|---|---|---|
| 11.2.1 | Generate intake link from a personnel detail slide-over → open in incognito | Form renders with all sections: Identity, Contact, Passports, Visas, Emergency contacts, Frequent flier, Dietary, Merch sizes |
| 11.2.2 | Add 2 passport rows, fill country/number/expiry, submit | "Thanks" panel. Reopen admin slide-over → v2 passport list shows both entries |
| 11.2.3 | Add 2 emergency contacts, name/relationship/phone for both, submit | Both land in admin slide-over's Emergency Contacts section |
| 11.2.4 | Add 2 frequent flier entries (different airlines), submit | Both render in admin slide-over with airline + member# + tier |
| 11.2.5 | Add a visa entry with country / type / valid_from / valid_to / notes / multi_entry, submit | All fields land correctly |
| 11.2.6 | Add 2 dietary entries (vegetarian + custom with notes), submit | Both render correctly |
| 11.2.7 | Add 2 merch sizes (t-shirt M + hoodie L), submit | Both render correctly |
| 11.2.8 | Submit with one emergency contact email malformed | Submit blocks with inline error message |
| 11.2.9 | Submit with allergies free-text | Admin slide-over Health/Medical section shows it |
| 11.2.10 | Submit a token already submitted once | "Thanks — already submitted" panel, NOT the form |
| 11.2.11 | Visit a fake/expired token | "This intake link isn't valid" panel |
| 11.2.12 | Form labelling | Title reads "Request Personnel Info Form" (NOT "User info survey") |

### §11.3 — Notification dispatcher triggers

Requires §0.2 + §0.5. Cron fires every 5 min so allow time after each action.

| ID | Action | PASS criteria |
|---|---|---|
| 11.3.1 | Accept an invite using a different email/account than the inviter | Within 5 min, inviter receives email "X accepted your invite to {workspace}". Second cron pass is a no-op |
| 11.3.2 | Submit an intake form on a token | Within 5 min, the admin who generated the token receives email "X filled in their intake form" |
| 11.3.3 | Create a `tour_personnel` row overlapping another non-cancelled assignment for the same person in the same workspace | Within 5 min, assigning manager receives email naming both tour names + overlap window |
| 11.3.4 | Check `personnel_intake_tokens.notification_email_sent_to` after dispatch | Stamped with recipient's user ID. Row not re-processed on next cron pass |
| 11.3.5 | Same check on `workspace_invites.notification_email_sent_to` | Stamped after invite_accepted email sends |
| 11.3.6 | Cancel an existing confirmed `tour_personnel` | Within 5 min, assigned person receives "Your assignment for {tour} has been cancelled" |

### §11.4 — Auto-save adoption

| ID | Action | PASS criteria |
|---|---|---|
| 11.4.1 | Open PersonnelDetailSlideOver, edit a name field, blur out | "Saved 2s ago" status pill appears. Refresh — change persists |
| 11.4.2 | Edit multiple fields rapidly | Save debounces (single PATCH after 600ms idle), not one PATCH per keystroke |
| 11.4.3 | Make changes, click Cancel | Slide-over closes. Reopen → fields reverted to pre-session values |
| 11.4.4 | Make changes, network goes offline, continue editing | Status shows "Save failed — retry". When network returns, retry succeeds |
| 11.4.5 | Repeat 11.4.1–4 on PersonnelManageSlideOver (tour personnel) | Same auto-save + cancel-revert behaviour |
| 11.4.6 | Repeat 11.4.1–4 on MemberManageSlideOver | Same |
| 11.4.7 | Open EditTourSlideOver, change name | Auto-saves on blur (safe field) |
| 11.4.8 | EditTourSlideOver — change end_date to a date BEFORE existing routing rows | Does NOT auto-save. Confirmation modal listing affected routing rows. Explicit Save required |
| 11.4.9 | EditTourSlideOver — change name (auto-saves) AND end_date (gated) → Cancel | Name reverts. Date field returns to original. No partial save lingers |
| 11.4.10 | Save status pill | Reads "Saved Xs ago" with relative time. Updates as time passes |

### §11.5 — Equipment grid Bug-Reports rework

| ID | Action | PASS criteria |
|---|---|---|
| 11.5.1 | Visit `/equipment` | New div-grid (matching personnel grid chrome). Sticky header. Columns: Image / Name / Category / Status / Serial / Last used / actions |
| 11.5.2 | Look at category badges | Audio = blue, Lights = yellow, Backline = orange, Misc = grey |
| 11.5.3 | Look at status pills | "In storage" / "On tour" / "Out for repair" — colour-coded |
| 11.5.4 | Filter chips above grid | All / Audio / Lights / Backline / Misc / In storage / On tour / Out for repair. Clicking filters the list |
| 11.5.5 | Click `[⋯]` on a row | Menu: View / Assign to tour / Delete |
| 11.5.6 | Edit equipment item, change category | Updates immediately, badge in grid reflects new colour |

### §11.6 — Polish carry-over

| ID | Action | PASS criteria |
|---|---|---|
| 11.6.1 | Open InventoryModal (Add or Edit on /equipment) | "Status" dropdown under Category/Serial. Defaults to "Available" on Add; pre-fills existing row's status on Edit. Saving persists |
| 11.6.2 | Visit `/intake/<token>` for an unsubmitted token | Heading reads "{workspace name} — Personnel info form" (NOT "User info survey"). Sections per §11.2 |
| 11.6.3 | Visit `/intake/<token>` whose `submitted_at` is set | Heading reads "Thanks — your details are in", body confirms workspace name, NO form |
| 11.6.4 | Visit `/intake/<token>` that doesn't exist or has expired | Heading reads "This personnel info form link isn't valid" |

---

## §12 — Sprint 12 smoke

### §12.1 — Rental schema (foundation only — scanning + Carnet + Quote PDF were deferred)

| ID | Action | PASS criteria |
|---|---|---|
| 12.1.1 | Verify migrations 091–095 in `public._lp_migrations` | 5 rows visible via SQL |
| 12.1.2 | `SELECT count(*) FROM public.rental_inventory WHERE qr_token IS NULL;` | Returns 0 |
| 12.1.3 | `SELECT count(*) FROM public.rental_inventory WHERE workspace_id IS NULL;` | Returns 0 |
| 12.1.4 | Open any equipment item — does data load? | No errors, item details visible |
| 12.1.5 | Try to delete an equipment item as a non-admin workspace member | DELETE blocked by RLS (admin gate from migration 095) |

### §12.2 — QR generation + label printing

Requires §0.3 (`NEXT_PUBLIC_APP_ORIGIN`) and §0.7 (preview URL on phone).

| ID | Action | PASS criteria |
|---|---|---|
| 12.2.1 | Visit `/equipment` → edit any item → scroll to bottom of modal | QR preview renders. Token text printed below the QR for human readability |
| 12.2.2 | Click "Print label" in the modal | New tab opens at `/rental/print-labels?ids=<id>` with one label visible. Browser print dialog opens |
| 12.2.3 | Select 3 items in the equipment grid → click "Print N labels" in toolbar | New tab with 3-label sheet |
| 12.2.4 | Scan a printed-from-PTouch QR with phone camera | URL resolves to `https://lowpass.co/rental/scan?t=<8-char-token>` (NOT a preview URL — confirms §0.3 set correctly) |
| 12.2.5 | After printing, verify audit log | `SELECT count(*) FROM rental_movements WHERE movement_type = 'manual_correction' AND notes LIKE 'QR label reprinted%';` returns ≥ 1 row per print run |
| 12.2.6 | Test PTouch printout quality | Scanning works on a real label, not just a screen render. Logo overlay legible |

### §12.6 — IA fix v3 (smart back button + product nav)

| ID | Action | PASS criteria |
|---|---|---|
| 12.6.1 | Visit `/artists` | Back button is disabled/absent (workspace root) |
| 12.6.2 | Visit `/artists/[id]` | Back button → `/artists` |
| 12.6.3 | Visit `/operations/[tourId]/personnel` | Back button → `/artists/[artistId]` (parent artist) |
| 12.6.4 | Same from `/budget/[tourId]/x` and `/advance/[tourId]/[routingId]` | Same — back to parent artist |
| 12.6.5 | Click "Budget" in the ProductRail while at `/operations/[tourId]/personnel` | Lands on `/budget/[tourId]/equivalent-or-root` for the SAME tour |
| 12.6.6 | TourProductsStrip is NOT visible | Per Q1 decision — strip was dropped; only rail handles cross-product nav |
| 12.6.7 | Tour-scope chrome height = TopBar (48) + ProductHeader (48) + OperationsSubNav (48) = 144px | Inspect element to confirm. 40px under the prior budget |

### §12.7 — Artist library

| ID | Action | PASS criteria |
|---|---|---|
| 12.7.1 | Visit `/artists/[id]/riders` | Lists all rider_packs where artist_id matches AND scope='artist' AND kind='rider'. Existing 4 artist-scope packs visible |
| 12.7.2 | Visit `/artists/[id]/channel-lists` | Lists rider_packs where scope='artist' AND kind='channel_list' (empty unless you've made one) |
| 12.7.3 | Visit `/artists/[id]/financials` | Stub page renders with empty-state copy |
| 12.7.4 | Visit `/artists/[id]/files` | Stub page renders with empty-state copy |
| 12.7.5 | Visit `/templates` | 404 or redirect — the page is deleted |
| 12.7.6 | Edit an artist-level rider template, save changes | If template has ≥1 tour assignment, propagate-modal appears: "This template is used on N tours. Apply this update to any of them?" |
| 12.7.7 | In the propagate modal, check 1 of 3 listed tours → confirm | Only that one tour's rider is overwritten. Other 2 stay on their snapshot |
| 12.7.8 | Cancel the propagate modal | Template saves; no tours touched |
| 12.7.9 | After propagation, check the affected tour's `tour_riders` (or per-tour rider_packs) | `propagated_from_template_at` timestamp updated |

### §12.8 — Channel list editor rebuild

#### §12.8a — Schema + mic library

| ID | Action | PASS criteria |
|---|---|---|
| 12.8a.1 | `SELECT count(*) FROM public.mic_library WHERE workspace_id IS NULL;` | Returns 100+ (102 new from migration 099 plus migration 040's seed) |
| 12.8a.2 | Try to insert a channel_list_row with `row_kind = 'invalid'` | Postgres rejects with CHECK constraint error |

#### §12.8b — Editor UI

Open a channel list in any rider for these tests.

| ID | Action | PASS criteria |
|---|---|---|
| 12.8b.1 | Visual — does it match design tokens? | Same row density as Budget SpreadsheetGrid. Section headers between inputs / outputs / aggregates |
| 12.8b.2 | Scroll horizontally — is channel # sticky? | Yes — col 1 stays put while col 2-11 scroll |
| 12.8b.3 | mic_substitute column is NOT visible in editor | Correct — dropped from UI per §8b1 |
| 12.8b.4 | Click into Position cell | BrandedSelect opens with 11 values: USL/USR/USC/DSC/DSL/DSR/OSL/OSR/SL/SR/C |
| 12.8b.5 | Click into Stand cell | BrandedSelect: LP CLAW / Short Boom / Tall Boom / Clip / Talk Stand / None |
| 12.8b.6 | Click into Cable Length cell | BrandedSelect: 6' / 10' / 15' / 25' / 50' / 100' / 150' / 300' |
| 12.8b.7 | Click into Mic/DI cell (column header reads "Mic/DI") | Dropdown lists workspace + global mics with [DYN]/[CON]/[RIB]/[DI+]/[DI-] kind badges |
| 12.8b.8 | Type "she" in the Mic/DI dropdown | Filter mode active — list narrows to entries containing "she" (Shure mics, etc.). Filter chip shows "Filter: she (N)" |
| 12.8b.9 | Type "asdfjkl" in the Mic/DI dropdown | "No matches." in italic |
| 12.8b.10 | Select a condenser mic (e.g. Shure Beta 91A) | Phantom column auto-fills `true` with a 700ms orange ring flash |
| 12.8b.11 | Select a dynamic mic (e.g. Shure SM58) | Phantom column auto-fills `false` (no flash) |
| 12.8b.12 | Tab through cells | Moves right one cell. At row end, wraps to next row's leftmost cell |
| 12.8b.13 | Shift+Tab through cells | Moves left. Wraps to previous row's rightmost cell |
| 12.8b.14 | Press Enter in a text cell | Moves down one cell in same column |
| 12.8b.15 | Edit a text cell, press Esc | Reverts to pre-edit value, blurs cell |
| 12.8b.16 | Add output rows via "Add output row" button | Output sub-table below input grid. Columns: Index / Item / Destination / Position / QTY / Notes |
| 12.8b.17 | Edit output cells | Same keyboard nav works in output grid (separate nav island) |

#### §12.8c — Inventory aggregates

| ID | Action | PASS criteria |
|---|---|---|
| 12.8c.1 | Below the output grid, 5 aggregate sub-tables render | Microphones/DIs · Mic stands · Cables · Stage boxes · Snakes/Looms |
| 12.8c.2 | Add inputs with different mics, providers, stands, cables | Aggregates update live as you edit |
| 12.8c.3 | Mic/DI aggregate groups by (name, provider) | Counts correctly |
| 12.8c.4 | Cables aggregate groups by cable_length | Counts correctly |
| 12.8c.5 | Stage boxes / Snakes pull from `stage_boxes` / `sub_snakes` tables | Already-defined boxes + snakes appear with color swatches |
| 12.8c.6 | Empty state — clear all inputs | Each aggregate shows "No <thing> yet" muted copy, doesn't hide |

### §12.9 — Rider editor rebuild

#### §12.9a — Tiptap foundation

| ID | Action | PASS criteria |
|---|---|---|
| 12.9a.1 | Open any rider pack → click "Add section" | Modal shows three options: Fields / Channel list / Rich text |
| 12.9a.2 | Pick "Rich text" → save | New section opens with empty Tiptap editor |
| 12.9a.3 | Type body content, click H2 button on selection | Selected line becomes a heading |
| 12.9a.4 | Type body content, click H3 button | Selected line becomes sub-heading |
| 12.9a.5 | Click Bullet List button | Selected line becomes bulleted list item |
| 12.9a.6 | Switch to another section + back | Content persists (via metadata.content) |
| 12.9a.7 | Reload page | Content still there |
| 12.9a.8 | Existing 4 artist-scope rider_packs still render via legacy `fields` path | No data loss |

#### §12.9b — Cover page + TOC

| ID | Action | PASS criteria |
|---|---|---|
| 12.9b.1 | Open a rider — does "Cover page" entry appear at top of section list? | Yes |
| 12.9b.2 | Click "Cover page" → main area shows cover editor | Logo upload area, title, subtitle, disclaimer fields |
| 12.9b.3 | Upload a logo | Stores in rider-assets bucket. Preview thumbnail updates |
| 12.9b.4 | Click "Use artist default" | Logo cleared on this rider. Render falls back to artists.default_logo_url |
| 12.9b.5 | Set title, subtitle, disclaimer; blur each field | Auto-saves via updatePack PATCH. SaveStatePill flashes |
| 12.9b.6 | Visit `/r/[token]` for this rider | Cover page renders as first page: logo centered, artist h1, title h2, subtitle muted, "Rider Updated — 23rd Mar '26" date, disclaimer italic |
| 12.9b.7 | TOC renders as page 2 | Each section listed with anchor link. "Page —" placeholder until §10 PDF lands |
| 12.9b.8 | Click a TOC entry | Anchors to that section in the web reader |

#### §12.9c.0 — role_tag wire-up

| ID | Action | PASS criteria |
|---|---|---|
| 12.9c0.1 | Open a tour's Personnel page → edit a member | "Role tag (for rider variables)" select appears below "Role on tour" text input |
| 12.9c0.2 | Pick "TM" → save → reopen | Tag persists |
| 12.9c0.3 | Add new member via AddPersonnelSlideOver → set Role tag → save → reopen | Tag persists on create flow too |
| 12.9c0.4 | Members not yet touched | role_tag defaults to "Other" |

#### §12.9c — Variable substitution

Pre-tag at least one tour_personnel row as `tm`, `foh`, `pm`, `mons` before these tests. Use a tour-scope rider pack.

| ID | Action | PASS criteria |
|---|---|---|
| 12.9c.1 | In a legacy text field, type `Hi {artist}, your TM is {contact.tm.name}.` → save | Substitution happens server-side on render |
| 12.9c.2 | Visit `/r/[token]` for that pack | Text reads "Hi Good Neighbours, your TM is Adam Rowley." (or whatever the data says) |
| 12.9c.3 | In a rich_text section, type `{` | Variable autocomplete pop-over appears |
| 12.9c.4 | Type "ar" after `{` | Filter narrows to {artist} etc. |
| 12.9c.5 | Arrow + Enter to insert `{artist}` | Chip renders showing resolved value "Good Neighbours" |
| 12.9c.6 | Backspace over the chip | Whole chip removed (atomic node behaviour) |
| 12.9c.7 | Save and reload | Chip persists, still resolves to current value |
| 12.9c.8 | For artist-scope pack, type `{` | Only {artist}, {rider_type}, {today} visible. Tour-scoped variables hidden |
| 12.9c.9 | Double-click an existing chip | 220ms orange pulse, then chip collapses to plain text with the live resolved value |
| 12.9c.10 | Change the underlying personnel name in another tab → reload the rider | Live chips reflect new name; converted-static text does NOT |

#### §12.9d — Advance summary section + AI

Requires §0.4 (`ANTHROPIC_API_KEY` + credit) for the generate test.

| ID | Action | PASS criteria |
|---|---|---|
| 12.9d.1 | Add an "Advance summary" section | 9 default rows seed: Schedule / Transport / Dressing Rooms / Merch / Towels / Labour / Security / Power / Audio |
| 12.9d.2 | Manually edit body text for each subject | Edits persist via auto-save |
| 12.9d.3 | Add a 10th custom row "Lighting" | Adds correctly |
| 12.9d.4 | Remove a row | Removes correctly |
| 12.9d.5 | Author 2-3 body sections (rich_text) with content | Real content for the AI to summarise |
| 12.9d.6 | Click "Generate from rider content" | Spinner 3-5s |
| 12.9d.7 | After spinner | 9 (or N) body cells populate with model-written one-liners under 90 chars each |
| 12.9d.8 | Click "Generate" again within 60s | 429 rate-limit response, no AI call made |
| 12.9d.9 | Wait 61s, click again | Generates fresh summaries |
| 12.9d.10 | No Anthropic credit in account | Endpoint returns 402 with a clear error toast (NOT silent failure) |

### §12.10 — PDF export

**STATUS: PENDING — CC working on this. Smoke tests here are speculative until CC reports back. Skip §12.10 entirely if it hasn't shipped yet by flight time.**

| ID | Action | PASS criteria |
|---|---|---|
| 12.10.1 | Visit `/api/rider-packs/<id>/pdf` (auth'd) | PDF downloads. Cover page = page 1. TOC = page 2. Body sections page 3+ |
| 12.10.2 | PDF page footer reads "Page N of M — {artist} {rider_type}" | Yes |
| 12.10.3 | TOC page numbers now resolved (not "Page —") | Yes — populated from §10 pagination |
| 12.10.4 | Visit `/api/rider-packs/<id>/pdf?token=<token>` (from a web link) | Token-gated download works without auth |
| 12.10.5 | Visit `/api/advance-packets/<tourId>/<routingId>/pdf` | Bundle PDF: rider → channel list → hire list → assets in spec order |
| 12.10.6 | Single rider render cold start | < 10s on Vercel preview |
| 12.10.7 | Bundle render | < 30s for 5-doc packet |

### §12.11 — Advance packet view

**STATUS: PENDING — final phase, not yet started. Skip if not shipped by flight time.**

| ID | Action | PASS criteria |
|---|---|---|
| 12.11.1 | Visit `/advance/[tourId]/[routingId]` | Page lists every document in the packet: tech rider, channel list, hire list, assets |
| 12.11.2 | Generate share link | Creates `advance_packet_links` row with token. URL copied to clipboard |
| 12.11.3 | Visit `https://lowpass.co/a/<token>` in incognito | Public view renders entire packet: cover → TOC → tech rider → channel list → hire list table → assets |
| 12.11.4 | Set optional password → re-open in incognito | Password gate before content |
| 12.11.5 | Click "Download bundled PDF" on the share page | PDF download via §10 endpoint |
| 12.11.6 | Click per-doc PDF buttons | Individual doc PDFs |
| 12.11.7 | `last_viewed_at` updates after a view | Yes — populated in advance_packet_links |

---

## Smoke summary

After running through everything:

- Total tests: ~110 across §11 + §12
- PASS:
- FAIL:
- N/A (intentional skips — e.g. §12.10/§12.11 if not shipped, §12.9d if no credit):
- Notes / defects:

Failures format: `<TestID> FAIL — <what you saw>` with paste of any console / network errors.

After smoke, decide:
- All green or surface-level fails → merge `feat/sprint-12-rental-plus-closeout` → main
- Structural failures in any phase → halt, log defects under that phase ID, return to me with the findings

---

## Out of scope (Sprint 13+)

These weren't built in Sprint 12 and should not be smoked:

- Mobile scanning UI (camera capture for rental QR scan)
- Carnet CSV export (rental → Google Sheets)
- Quote PDF (rental quote document)
- §9d.c drag-reorder of advance_summary rows (deferred, ~80 LOC follow-up)
- In-app preview pane for cover/TOC (PackEditor layout work)
- Mics/DIs editable aggregate notes (rider_sections.metadata is ready; wire-up commit pending)
- Per-show personnel assignment grid
- Stripe billing
- Workspace creation UI
- Audit log advanced filtering
- Spotify search → genre extension
