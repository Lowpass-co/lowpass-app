# Lowpass Design Direction — 2026-07

The design system distilled from the July 2026 design arc: 10 mockup surfaces, graded by Adam via the smoke tool (`docs/design/SMOKE_TOOL_2026-07.html`, export 2026-07-04), grounded in three code capability inventories (Advance, Budget, Production tools). This document is the WHY and WHAT; `docs/handover/CC_DESIGN_PASS.md` is the HOW; `docs/smoke-tests/visual.md` is the acceptance list.

## 1. Doctrine

**Views compress, tools deepen.** Views (workspace, artist, tour landing) derive status, rank by urgency, and end every stat in a verb. Tools (Advance, Budget, Channel List, Stage Plot, Rider) are editors — their references are Notion (block editing), Figma (canvas + selection-driven inspector), and Airtable-grade grids. A redesign may reduce the *cost* of complexity (explicit modes, keyboard throughput, discoverability) but never the capability surface. The ranked "depth that must survive" lists from the code inventories are hard constraints (§12).

## 2. Hue budget (FINAL — graded pass on all surfaces)

Base is neutral dark: `--lp-bg #0F0F0F`, surfaces `#1A1A1A/#252525`, borders `#2E2E2E/#222`, text `#F5F5F5/#A3A3A3/#737373`.

- **Orange `#FF4500`** — act / attend / selected / in-progress. The only brand color. Washes ≤5% alpha, at most one per screen.
- **Green (muted `#3fa87d`)** — done / positive variance / saved.
- **Red** — destructive actions AND negative budget variance (Adam: "put red on bad variance, obviously").
- **Day-type hues** — ONLY inside date strips/fingerprints (desaturated ~50%) and as 3px ticks in day pills. Never as chips, banners, dots, or stripes elsewhere.
- Everything else is neutral: inheritance (was purple) → gray ↘ glyph; intake events → orange; warnings → orange; phantom power → filled/empty neutral dot; **power items on stage plots are NEUTRAL** (SP-04 fail — power drops are normal placements; the power-type setting is the valuable part).
- Rule of thumb: ≤2 accent hues per screen plus the strip.

## 3. Typography & numerics

Body: existing app sans. Display: Barlow Condensed 600, uppercase, tight leading — page titles, artist/tour names, card names. Micro-labels: 10–11px letterspaced caps. **Every numeric — dates, times, money, counts, distances, capacities, phone numbers — renders in `--lp-font-numeric` (JetBrains Mono).** This token already exists; it becomes law.

## 4. Iconography

**Emoji never appear in the UI.** All glyphs from the app's icon set (transport methods, locks, flags, receipts, checks). Transport column shows ONE icon = method of transit; drive time/distance live in the interstitial chip row (Adam's pin: "two bus icons? We only need one").

## 5. Chrome & navigation

- Top bar on EVERY tier carries the **persistent artist picker + tour picker pills** (Adam asked for this on both workspace and artist pins). Workspace tier shows them empty/contextual.
- **Real avatar images** — user profile picture in the top bar, Spotify artist images in artist pills and cards. No initials where an image exists.
- Breadcrumb at day level includes the show: `Charlotte Sands / USA Headline '26 / 9 Sep — EXIT/IN`.
- Tour nav (one row): `Routing | $ Budget · ⧉ Advance | Crew · Production · Files` — Routing is the landing surface; there is no Overview page.
- Workspace tabs: Artists / Personnel / Equipment. Artist tabs: Tours / Production / Business (lock icon + tooltip explaining "managers only" — the lock must explain itself).
- Save model: **autosave everywhere + SaveStatus pill** ("● Saved · just now"). No Save buttons, no ⌘S (Adam: "shouldn't it autosave?").

## 6. Motion

150–200ms ease-out; entrance staggers 40–70ms/element; fingerprint bars draw in ~20ms/bar once per load; money/counts count up once; popovers scale from their anchor (transform-origin at the anchor, tail pointing to it) in 140ms; hover = border brighten only (no scale/shadow); one looping animation max per screen (in-progress pulse); `prefers-reduced-motion` disables all. Codify as `--lp-dur-*` / `--lp-ease-*` tokens.

## 7. Core components

**TourFingerprint** — one component, three sizes (card 10px / row 14–18px / hero 32–44px). Renders from routing rows with muted day-type hues. Hover: pill lifts 3–7px + anchored popover (mono date line · day type · venue — city · advance state). Click: show days → that day's advance/grid row. Tour scale adds **week markers with week-commencing dates** (Adam AR pro). Days with two types **stack a second tick below** (Adam TR idea). Side-scrollable with wheel→horizontal; the popover is the modal-out-of-the-pill pattern on ALL sizes.

**Review grammar** — one accept/reject pattern for every "someone else touched my data" event: AI deal-memo extraction, venue intake submissions, settlement-vs-manual conflicts. Rows show old value struck → new value, per-row ✓/✕, explicit apply. Nothing external ever auto-writes.

**Inheritance banner** — neutral, ↘ glyph. Label is dynamic per scope chain (artist → tour → show): a show-level pack says "view **tour** original", a tour-level pack says "view **artist** original" (Adam RB idea). Two actions always: *Override here* (creates local copy, parent untouched) and *Edit the original* → navigates to source with a warning: "changes reflect across all inheriting shows" (Adam CL idea). Read-only-until-override stays, but the path to editing the source must be one click, not a dead end.

**Day pill** — sits immediately AFTER the date, everywhere. Neutral chip + 3px day-type tick. Grid day column is tabbable and type-searchable (type "sho" → Show day).

## 8. Status & copy vocabulary

Every status line = verb + time anchor, derived from routing: "Tour running · day 12 of 24" / "Rehearsals in 65 days" / "First show in 52 days" / "Planning · dates not locked" / "Ended 13 Jun · not settled" / "Off the road". Mood words banned.

**Workspace card footer (standardized):** left side always `Next: Wed 9 Sep · Nashville` (or "Nothing booked"), right side the derived action verb (Start advances → / Plan a tour → / Confirm crew →). Same shape on every card.

## 9. View tiers — locked decisions from grading

**Workspace:** Cards use **Spotify hero images** (integration exists). Kill the aggregate money stat — cross-artist totals are meaningless to a TM. Real profile picture top-right. "Needs you" queue replaces the activity feed (passed). Card layout per §8.

**Artist:** Hero header — big artist imagery like the current app's blurred hero, merged with the new tab row ("make the page look more hero. I like the header of the current artist page ish"). **All non-past tours render with equal visual weight, date-ordered**; past tours collapse to settled/one-line. Tour rows: name, dates, fingerprint with week markers, one status line — readiness chips live INSIDE the tour, not on rows. Business tab: proper lock icon + self-explaining tooltip.

**Tour (Routing landing):** Readiness rail stays in content but gets de-boxed — one hairline-divided strip, not four cards ("looks too AI"). Grid gains: **Address column**, single transit-method icon column, full-height scrollable grid (no "21 more days" footer), tab-through auto-scrolls, day-type stacking. Keep: black/orange alternating selection treatment, drive chips as neutral interstitial rows, DATE→DAY column order.

## 10. Tool surfaces — locked decisions from grading

**Advance — modes renamed `Build / Advance / Share`.** Section picker moves to a LEFT rail in Build (matching current app muscle memory) with the new visuals; the drag-reorder bug gets fixed as part of the decomposition. Deal-memo flow: upload attaches a document line under the uploader per day with a "Review" button; review opens as a modal; a separate "uploaded packs" surface lists all pending reviews. Template save prompts: "apply to whole tour / selected shows?" (change-merge code already exists). Breadcrumb includes the show. The ⚑ flag needs a tooltip or dies. No ⌘S; ⌘D only where grid semantics exist.

**Budget:** red on bad variance; a prominent **+ Add line** button (toolbar, right of search, plus an inline ghost row at the bottom of each custom section); everything else passed.

**Channel list:** Ownership gets a third state: **Venue supplies** (neutral chip). Columns: add **Sub-snake** and **Gain**; "Box" label becomes "Stage box". Channel numbers render with gaps explained (section grouping) — no unexplained jumps. Inheritance per §7 (edit-source path with propagation warning).

**Channel list — PATCH MODE (new feature, specced in this pass):** a `Patch` toggle in the toolbar opens a dLive/LV1-style patch surface: stage boxes and sub-snakes render as vertical socket strips (A1–A16, B1–B8…, sockets show current assignment); unpatched channels queue in a left list; click channel → click socket to patch (or drag); conflicts highlight; "patch in order" bulk action auto-assigns the queue sequentially; patching writes `stage_box`/`row_index` on `channel_list_rows` (tables for boxes/sub-snakes already exist). Keyboard: arrows move socket cursor, Enter assigns highlighted channel. Same hue budget: orange = selected channel/socket, stripes = box colors.

**Stage plot:** power items neutral (keep the power-type/amperage settings — loved); channel numbers on items editable; keep ALL current customization controls, restyled; **the PDF export must look like the canvas render** (Adam: "make sure the export looks like the render").

**Rider:** dynamic parent labels (§7). Field catalog needs major expansion — final packs should have advance-grade depth but stay scannable by venue/rep. **Research task: study advancewithme's templates** before building the catalog (flagged, not yet done — needs a web-research session).

## 11. Exports — one shell

Every PDF (advance export, day sheets, stage plot, channel list, rider pack, budget) shares one export shell: artist/tour lockup header, mono numerics, day-type ticks, the same neutral-dark-or-print-light treatment. The Review-mode button says **"Export advance"** (not "day sheet") and offers one show or multiple. The existing export tool is good — this is a reskin to match the system, not a rebuild.

## 12. Depth that must survive (from the code inventories — hard constraints)

Advance: 12 field types + properties panel · drag-reorder · save-as-template + apply w/ merge modes (replace/fill_blanks) · venue intake w/ additive never-clobber merge · deal-memo extraction w/ review-before-write · tm_only/status/assignee/flags layer · packet w/ password links. Budget: version safety in SQL RPCs (UI must call them) · derived-line edit locks · locked_fx write-once · fixed overhead eval order · 6 payroll rate-type semantics · additive templates. Production: stage-plot↔channel FK (multi-link) · channel grid interaction depth · artist→tour→show inheritance w/ gated overrides · icon grammar v2 · independent output numbering · soft-hide columns · share tokens w/ password. Full inventories: session transcript 2026-07-03/04 (subagent reports).

## 13. Flags & open items

- **Multi-user/permissions:** DECIDED 2026-07-04 — see `PERMISSIONS_MODEL_2026-07.md` (schema-reserved artist scoping, crew day-sheet slice via tokenized links, vault = owner+managers fixed). Build remains unscheduled.
- **Advance ↔ Production integration** (decided: spec it): advance sections may subscribe to production data read-only ("from Production" becomes true). Roadmap after the Advance decomposition.
- **advancewithme research** — DONE 2026-07-04: see `COMPETITIVE_ADVANCEWITHME_2026-07.md` (teardown, beat-list, and the draft field catalog §6 that unblocks VIS-RB-05 pending Adam's grading). Note: no public field taxonomy exists on their site; catalog drafted from confirmed categories + industry practice.
- Smoke-tool note: verdict buttons required scripts loaded; if reused, add a loading guard.
