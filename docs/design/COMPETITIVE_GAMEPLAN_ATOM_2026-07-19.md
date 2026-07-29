# ATOM vs Lowpass — full arena verdict + competitive gameplan (2026-07-19)

Sources: full live walk of demo.atominterstate.app (all three paid modules + Tour Book day view + Day Sheet composer + View-as + Travel + Merch), Adam's 14 annotated screenshots with verdicts, the two prior audits (`COMPETITIVE_ATOM_2026-07-18.md`, `COMPETITIVE_ATOM_INTERNALS_2026-07-19.md`), and the evidence-based Lowpass codebase topology. Adam's positioning ruling: **"a more business-focused, more premium looking tool."** Adam's bar: **"beat it in every single arena before release."**

Adam's standing rulings folded in throughout, marked ⟨A⟩.

---

## PART 1 — Arena-by-arena verdict

Scores are directional: **WIN** (we're ahead today), **LOSE** (they're ahead today), **SPLIT** (each holds part), with what closes each gap.

### 1. Visual design — SPLIT, winnable
**Them:** Saturated neon on dark, gradient hero cards, module-bound hues, glowing 3D stage plot. It photographs well and demos well. But ⟨A⟩ "somewhat polished, but very AI" — and he's right about why: gradients as decoration, glow as chrome, the calendar "way too cartoony" ⟨A⟩, a gauge-with-needle for tour health, sticker packs, "Pet of the Week." It's consumer-grade dopamine styling on business software. It reads *toy* — ⟨A⟩ "feels a little too 'toy' like."
**Us:** Restrained hue budget, Barlow Condensed + JetBrains Mono, tokenized. Post-G2-2b our grids are objectively better set (uniform 52px rows vs their ~31px; mono numerics; tile treatment). ⟨A⟩ "our budget grid is better," "payroll grid is a worse version of ours but is definitely prettier."
**The gap is not restraint vs saturation — it's finish.** Their *layout clarity* ⟨A⟩ and visual coherence ("the way it all looks visually coherent is excellent" ⟨A⟩) come from: consistent card grammar, generous section spacing, one accent per surface, info-dense headers with micro-labels. Ours still has hand-rolled titles (channel list), non-full-bleed patch matrix, and empty states that are dead ends.
**Close it with:** the F2 sweep finished to ATOM's coherence bar (empty-state invitations with next actions, consistent card grammar) while keeping our materials. Premium = their layout discipline + our restraint. Explicitly do NOT copy: gradients-as-chrome, glow, gauges, mascots.

### 2. Navigation / IA — SPLIT, winnable
**Them (what wins):** The static context header ⟨A⟩ loves: **WHERE am I** (module pill) · **WHO** (artist) · **WHAT** (tour/leg), always present, every dropdown a one-click jump. Left rail per module gives every tool a stable address. Split View (two panes, synced edits) is a genuinely good TM feature for laptop+extern-monitor life.
**Them (what loses):** ⟨A⟩ "too many places for everything. it's SO much data." True: eleven day-view tabs, five nav levels (module → rail → page → tabs → on-page TOC), the same data reachable four ways (money on the day, money in the calendar, money in Budget, money in Reports). Sprawl is their tax for breadth.
**Us:** Two-bar nav + identity band (G2-4) is *already* Where/Who/What — TopProductNav = where (product) + who (artist switcher) + what (tour switcher); identity band repeats who/what with status. The critical failure: **the pickers read "Pick an artist…" on cold load (the P0 hydration bug already spec'd in `CC_CONTEXT_HYDRATION_P0.md`).** Our static header exists; it's just broken. Fix the P0 and we have their best nav idea with less chrome.
**Close it with:** P0 fix (queued) + a nav polish slice: (a) the three context controls always populated and visually grouped left-to-right as Where·Who·What; (b) per-product dropdown jump menus already exist on Bar 1 — verify they're discoverable; (c) hold the line on ONE canonical location per object (our advantage — don't copy their four-ways-to-everything).

### 3. Money: budget + expenses — WIN, extend
**Them:** Form-based budget builder (Annual/This Leg/Custom), provenance chips (Auto/Manual) per line, named cross-module pulls ("AUTO-PULLS FROM TRAVEL"), CONTRACTED vs SETTLED columns, expense capture with Snap-&-auto-fill OCR, CC statement import, billback flags, buyout tracker. Legible, but editing is one-field-at-a-time in cards.
**Us:** SpreadsheetGrid budget with versioning, per-row locked FX, provenance harness (18 checks), reconcile harness (64), settlement math cascading to income. ⟨A⟩ "our excel approach is better."
**Verdict:** We hold the engine and the editing surface. They hold *legibility of the engine*. Steal exactly three presentation ideas: **provenance chips on our lines** (we compute this; render it), **CONTRACTED/SETTLED distinction where applicable**, **receipt→proposed-line last mile** (our OCR already stores `raw_ocr_json`; theirs proposes). Their "Tour Data Health · 12 items to review" nudge banner = our derivations endpoint given a UI.

### 4. Money: settlement — SPLIT, winnable fast
**Them:** Deal-type chips (Flat, Vs %, +%, Promoter Profit, +Bonus, Door, Zero vs %, Co-Promote, Escalating), the **Walk panel** (Guarantee → −Withholding → Adjusted Gross → −Show expenses → Show Net → +Bonus +Merch → Artist Total → −Deposit → Balance Due) computing live beside the form, payment logging (Wire/Check/Cash/ACH), Full-&-Final flag, withholding "Auto from city," settlement drop-zone (PDF/Excel/photo → parsed). The **catch-up queue** (32 played-not-settled as checkbox batch). ⟨A⟩ "the settlement is great."
**Us:** Settlement math exists and cascades correctly; no walk visualization, no deal-type grammar, single generic deductions number, no settlement document, no payment tracking, no catch-up surface.
**Close it with:** the Settlement build (P1): walk panel on our settlement surface, itemized deductions, deal-type chips, Full-&-Final state, catch-up queue, settlement PDF + XLSX. Our engine already computes the middle of the walk — this is mostly presentation + a few columns.

### 5. Money: payroll — WIN
⟨A⟩ "worse version of ours but prettier." Their pretty = rate inline in the left block + tighter chrome. Ours post-G2-2b is metrically superior and has the day-type override pay engine (their banner nags you to label days; ours *pays differently* per person-day override — deeper). **Steal:** rate inline in the matrix left block; a **Finalize/lock** state per period (they have it, we don't — accountants need commitment semantics). Keep: everything else ours.

### 6. Advance + venue exchange — WIN, but reshape the venue-facing side
**Them:** Advance is a *tracker* (calendar of shows, status chips, "Tap to advance") over a *content CMS* (versioned rider content, per-tab saves, AI rider-PDF import, on-page TOC) rendering into a **venue portal** (click-around web pages).
**Us:** Advance is a *builder* (Build/Advance/Share, 12 field types, templates, per-show depth) with **no-signup token intake** + pending-answer review — best-in-class; both competitors force venue accounts.
⟨A⟩ ruling: **"Nobody wants to click round an app. They want a PDF of each thing and then somewhere to enter their information. thats it."**
**Close it with:** V1 "Venue Packet" reshape: the share surface leads with **downloadable PDFs per artifact** (production rider, stage plot, channel list, hospitality, day sheet) + **one short intake form** for what we need back. The portal remains as the wrapper, not the experience. Their AI rider-import (PDF → parsed into fields) is worth matching — we already have deal-memo and tech-pack extraction; rider import is the same pattern pointed at our own rider builder.
⟨A⟩ also ruled: rider grouped under advance is fine **as long as it's viewable from artist level too** — we already have artist-level Production surfaces; ensure the rider is reachable both places, one canonical record.

### 7. Day-to-day ops (the Daysheets/Master Tour arena) — LOSE today; GREENLIT to win
**Them:** This is their real moat-in-progress. Day view = venue+hotel cards with practical links (Uber from venue, bus parking, laundromat), schedule with APPROX chips, weather + what-to-wear, per-day tabs (Money, Set List, Guest List, Laundry, Files, Notes), map. The **Day Sheet PDF composer**: seven audience templates (Standard, Big Type, **Driver**, **Crew**, **Band/Artist**, Family, Compact 1-pager), section toggles, inline schedule edit, Download PDF. Plus **View-as** (nine roles, live) and mobile-first "Your Corner"/Driver views. ⟨A⟩: "The thing it's doing which I like but never planned for is REPLACING daysheets… It does make me really want to use it."
**Us:** We have the *data*: routing, labor calls day sheet + `/m/today` (LAB build), rooming, travel CRUD, contacts, per-diem buckets, venue resolver. We lack: the aggregated day object as a surface, the PDF composer, role-scoped views.
⟨A⟩ ruling: **build it. Online only, many user views.**
**Close it with:** D1 (the biggest new build — Part 3). Crucially the PERMISSIONS_MODEL doc already reserves the crew day-sheet slice and tokenized links — the architecture anticipated this.

### 8. Assets / gear — SPLIT; ruled
Their Spaces→Containers→Items with weight rollup, AI bulk import, carnet export vs our two disconnected inventories (canonical `gear` + `rental_*`) where the carnet fields already exist but are stranded on the rental side. ⟨A⟩ ruled: **unify under Spaces.** Spec'd separately (S1). Their merch→storage→budget flow ("storage costs of the trailer flow into the tour from the assets tab" ⟨A⟩) is the wiring standard to hit: tour_gear already syncs derived budget lines for `hired_to_client` — extend that pattern to storage costs.

### 9. AI — SPLIT, and theirs is over-extended
**Them:** AI everywhere — contacts file-drop parsing, rider import, receipt snap-fill, CC statement import, settlement doc parsing, merch Gmail scan, "ATOM Knows" lore cards. ⟨A⟩: "mostly excellent but sometimes it's all a bit deep, complex and unnecessary."
**Us:** Two live metered Claude pipelines (tech-pack → intake review; deal-memo extract) with the review-queue grammar — architecturally *better* (never auto-writes; TM approves). Missing: receipt last-mile, rider import, contact-sheet import.
**Close it with:** point the existing review-queue pattern at three more inputs (receipts → proposed budget line; rider PDF → rider fields; contact sheet → person records). Skip: Gmail scanning, lore cards, auto-anything-without-review. Our pitch: *AI drafts, you approve — nothing writes itself into your money.*

### 10. Multi-user / permissions — LOSE today, architecture ready
**Them:** Role-on-tour chips at contact creation, nine-role View-as switcher, role-scoped mobile views, "assign a job and it tells you what they can see" ⟨A⟩ ("should be deeper" ⟨A⟩).
**Us:** workspace roles (admin/manager/readonly), invites, RLS throughout, PERMISSIONS_MODEL decision record (crew slice, tokenized links, vault) — but no tour-scoped roles, no role views, no impersonation.
**Close it with:** D1 carries this: tour-role assignment (TM / PM / accountant / crew / driver / band / mgmt), each role = a defined slice, **View-as** switcher for the TM (it's the permissions debugger and the sales demo in one), deeper than ATOM by binding roles to RLS rather than UI hiding. Their depth is cosmetic (labels gate views); ours can be real (rows gate at the database).

### 11. Documents / exports — LOSE, cheap to flip
Them: XLSX-first accounting workbook with **round-trip import** + duplicate flagging, per-audience day sheets, settlement/expense XLSX, carnet PDF. Us: 8 PDFs, 0 XLSX. Close: X1 (workbook export→import), settlement + per-diem docs, day-sheet PDFs via D1, carnet via S1. The round-trip is the strategic one — the business manager's Excel is the real integration surface for a "business-focused" product.

### 12. Onboarding / education — LOSE, different answer
Them: ATOM 101 panel, 710-term Touring Dictionary, per-widget "?" chips, guided empty states. Charming but part of the toy feel.
Us: nothing yet. Don't copy the dictionary. **Our answer is the empty-state invitation sweep (F2) + a first-run "build your tour" rail** (artist → tour → routing → crew → budget), professional tone. A premium tool teaches by making the next action obvious, not by being cute.

### 13. Things NOT to build (hold the line)
Community/social (⟨A⟩ rejected), stickers/pets/lore cards, Globe/Tour Album/Weather-as-module (weather belongs ON the day, where they also put it), Driver HOS/ELD depth, Parking satellite annotator (clever, niche — revisit post-launch), Merch module (integrate atVenu-style *imports* into settlement instead, later), Split View (nice-to-have; browser tabs exist), leg concept (our tour scoping is fine; a "leg" is a saved date-range filter if ever needed — don't fork the schema).

---

## PART 2 — Strengths ledger

**Ours to keep and to say out loud:** money correctness (64-check harness, locked FX, provenance) — nobody else can prove this; spreadsheet editing where accountants live; advance depth + no-signup venue intake; day-type override pay engine; RLS-real permissions; restrained professional visual system; SSOT discipline (one path per fact) vs their four-doors-to-everything.

**Theirs we neutralize by building:** day-sheet replacement + role views (D1), settlement walk + queue + docs (M1), XLSX round-trip (X1), venue PDF packet (V1), spaces (S1), provenance/nudge legibility (M1), inline payroll rates + finalize (M1).

**Theirs we refuse:** sprawl, toy chrome, form-based money editing, AI-without-review, social.

**Positioning sentence** (for the site, the deck, and every design decision): *ATOM is the tour's group chat with tools; Lowpass is the tour's back office. When real money moves, you want the one that proves its math.* Business-focused ⟨A⟩, accountant-credible, premium in the sense of "instrument," not "arcade."

---

## PART 3 — The gameplan (build order)

Already queued ahead of this plan: **P0 context hydration** (`CC_CONTEXT_HYDRATION_P0.md`) → **Artist builder** (`CC_ARTIST_BUILDER.md`). Then:

### M1 — Money legibility + settlement (2–3 CC sessions)
The fastest arena flips; all presentation on proven math.
1. Provenance chips (Auto/Manual/Locked-FX) on budget lines; "N items to review" nudge banner fed by `/api/debug/derivations`-class checks (as a user-facing, non-admin surface).
2. Settlement: walk panel, deal-type chips, itemized deductions (schema: replace single `deductions` with typed lines), payment log, Full-&-Final state, catch-up queue, settlement PDF.
3. Payroll: rate inline in matrix left block; Finalize/lock per period.
Gates: reconcile 64/64 untouched (presentation-only where possible; deduction itemization extends harness FIRST).

### X1 — XLSX round-trip (1 session)
Tour Accounting Workbook export (budget + expenses + settlements + per-diem + payroll statements, options like theirs) and **import with duplicate flagging** through the existing review-queue grammar. This is the "business manager" feature.

### D1 — The Day + role views (the Daysheets replacement; the big one, 3–4 sessions, spec to be written as `CC_DAY_AND_ROLES.md`)
1. **Day object**: aggregate surface per routing row — venue (via `resolveVenue`), schedule (labor calls + advance schedule fields), hotel (rooming), travel, contacts-of-day, notes, per-diem flag. One canonical composition, no new data entry — assembly of what we hold. ⟨A⟩'s complaint about ATOM ("too many places") is the design constraint: ONE day surface, tabs only where a section genuinely overflows.
2. **Day Sheet PDF composer**: audience templates (Standard / Crew / Driver / Band / Compact), section toggles, through the shared export shell. Match their composer, out-premium their output.
3. **Tour roles + slices**: tour-scoped role assignment; role → slice mapping enforced in RLS/queries (crew slice per PERMISSIONS_MODEL; driver = schedule+venue+parking notes+hotel; band = schedule+hospitality+guest list; accountant = money read).
4. **View-as** switcher for TM/admin.
5. **`/m/today` per role** — the existing mobile page becomes the role-scoped daily view; tokenized links for no-account crew (our no-signup advantage, applied inward).
Sequencing note: D1 depends on P0 (context) and benefits from M1's finalize semantics; it does NOT depend on S1/X1.

### V1 — Venue packet reshape (1 session)
Share surface leads with per-artifact PDFs + one intake form ⟨A⟩ ruling; rider-PDF AI import into our rider builder; rider reachable from artist tier and advance ⟨A⟩.

### S1 — Spaces unification (already ruled; spec to be written as `CC_SPACES.md`)
Spaces → Containers → Items over unified gear+rental; weight/value rollups; carnet + gear manifest export (fields exist in 093); storage-cost → budget line wiring (extend the tour_gear derived-line pattern). AI bulk import via review queue.

### F2-finish — the coherence pass (parallel, small slices)
Empty-state invitations everywhere, StyledSelect sweep, last hand-rolled titles, patch matrix full-bleed — to ATOM's layout-clarity bar, our materials.

**Sequence:** P0 → Artist builder → M1 → X1 → D1 → V1 → S1, F2 threaded between. M1/X1 before D1 because they're small, flip whole arenas, and D1's specs (role slices, day composition) deserve a dedicated write-up I should produce next once Adam confirms the sequence.

### What "beat them in every arena" then looks like
Visual: their clarity, our restraint — premium instrument. Nav: their static header (fixed by P0), our one-place-per-thing. Money: our engine + their legibility + docs they don't have (XLSX round-trip both ways). Settlement: their walk + our math + a real document. Payroll: already ours; add finalize. Advance: our depth + their tracker calendar + PDF-first venue exchange (their portal becomes their weakness per ⟨A⟩'s ruling). Day-to-day: matched surface, *stronger* permissions (RLS-real vs cosmetic). Assets: their model, unified properly (they have no rental-house business line — we do). AI: their coverage, our review-gate trust story. Education: professional invitations, not a dictionary.

---

## Appendix — walk notes not previously recorded
Day view tabs: Overview · Schedule · Venue · Hotel · Travel · Money · Set List · Guest List · Laundry · Files · Notes. Schedule times carry APPROX chips. Hotel card links: Uber-from-venue, bus parking + logistics, find laundromat. Weather + "what to wear" with icon row. Day Sheet composer as described (7 templates, toggles, inline edit, Download PDF). Travel: Board/Flights/Ground/Hotels/Tools; board = per-day hotel/flight/drive cards ("68 hotels" chip). Merch: Booth calendar ("Tap to start count", CAP chips), Inventory, Signs, Heat map; Gmail scan + atVenu/settlement import + camera count-from-photo. View-as roles: Crew, Band, Driver, Artist, Vendor, Tour Accountant, Production Manager, Business Manager, Management. Contacts modal: role-on-tour chips, "Paste info block — ATOM will parse & fill", Who/Travel/Notes tabs, pronouns/DOB/address. Settings: light/dark, 12/24h, "ATOM Knows" lore toggle, Home Board toggle. Demo fragility: session drops to login on deep-links after idle; day URLs are `/app/tourbook/day/YYYY-MM-DD`.
