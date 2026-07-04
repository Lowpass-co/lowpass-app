# CC — DESIGN PASS (SINGLE OWNER ONLY). Apply DESIGN_DIRECTION_2026-07 across the app, staged.

**Preconditions:** `CC_MASTER_PASS.md` fully landed (consolidated main, rates converged, FX unified, nav fixes in). Read `docs/design/DESIGN_DIRECTION_2026-07.md` IN FULL first — it is the contract; this file is only sequencing. Acceptance per stage = the matching IDs in `docs/smoke-tests/visual.md` + `tsc` 0 · `eslint` 0 · `next build --webpack` green. Commit per stage. Verify-before-claim: name files+lines per change; open your own diff before reporting a stage done. Anything you skip gets named.

**Global cautions:** §12 of the design direction lists capability constraints that OVERRIDE any visual instruction — if a restyle would remove one, stop and flag. Budget version actions must call the SQL RPCs. Never write migrations casually; migrations are hand-pasted by Adam, idempotent, numbered ≥ next free.

## STAGE 0 — Foundations
Motion tokens `--lp-dur-{fast,base,slow}` / `--lp-ease-out` in globals.css + documented in design-tokens.md. **Emoji sweep**: replace every emoji glyph in JSX with the icon set (grep for emoji ranges; transport, locks, flags, checks). Hue-budget recolor: in-progress status → orange (update `--color-lp-status-in-progress` usage — check contrast), inheritance UI → neutral, warnings → orange, keep day-type tokens. Real avatars: user profile image in top bar; Spotify artist images in pills/cards (integration exists — find the existing artwork fetch). Persistent artist+tour picker pills in chrome on ALL tiers. SaveStatus pill replaces any remaining explicit Save buttons (routing's "Save routing" included — autosave landed in data-integrity pass; verify then remove).

## STAGE 1 — Views
**Workspace:** Spotify hero images on cards; standardized footer (`Next: <date> · <city>` + derived verb); delete the aggregate money stat; "Needs you" queue (rule-generated: advances untouched × days-to-rehearsal, unsettled ended tours, unconfirmed crew × days-to-first-show); entrance staggers + fingerprint draw-in per motion spec.
**Artist:** hero header (current app's imagery treatment + new Tours/Production/Business tabs); Business lock icon + tooltip; tour rows equal-weight for current+future, date-ordered, past collapsed; rows = name/dates/fingerprint(with week-commencing markers)/status line — NO readiness chips on rows.
**Tour landing = Routing:** de-boxed readiness rail (hairline-divided strip); grid adds Address + single transit-method icon column; full-height scroll (kill pagination footer); tab-through auto-scrolls; day-type stacking; day column tabbable + type-searchable. Delete the Overview route if the master pass hasn't already.

## STAGE 2 — Advance decomposition (the big one)
Split `AdvanceSectionBuilder.tsx` (6,054 lines) along its SETUP/FILL seam (~line 1400) into three surfaces: **Build / Advance / Share** with the segmented mode switcher. Build: left section rail + block editor + selection-driven inspector (12 field types intact, field palette, required/tm_only/venue-can-fill toggles); FIX the section drag-reorder bug during extraction (known, historical DnD console.warns mark the spots). Advance (per-day): section rail with fill counts, inline click-to-edit (existing read-view behavior), intake review banner → accept/reject queue (Review grammar). Share: venue-view preview (tm_only shown as hidden), intake link card (expiry preset, revoke, password), packet builder — remove the "with input list" duplicate line, add **custom attachments** (logos, financial info, hire lists — arbitrary files into the packet), rename button to **"Export advance"** wired to the existing export tool (single or multi-show). Deal-memo: upload → document line under the uploader + Review button → modal; add an "uploaded packs" list surface for batch review. Template save prompts apply-to-tour/selected-shows (reuse existing merge code). Flag icon gets a tooltip. Consolidate both bespoke debounce timers onto `useAutoSave`. Preserve EVERYTHING in design-direction §12 Advance list.

## STAGE 3 — Budget
Grid.tsx to Classic parity (vendor, day-type w/ pill+tick, duplicate-detection banner, phase grouping), then retire Classic. Version bar wired to the four SQL RPCs. Derived rows: lock glyph + neutral "↗ from Rooming/Payroll" chip + hover tooltip naming the source surface. Computed sections: `ƒ` chip + formula text, visually distinct, uneditable. Red on negative variance. **+ Add line** button in toolbar AND ghost row per custom section. Receipt drag-drop preserved.

## STAGE 4 — Channel list
Restyle the bespoke editor (NOT SpreadsheetGrid): stage-box stripes desaturated + footer legend; "Stage box" label; phantom = neutral filled/empty toggle dot; ownership chips owned/rented/**venue supplies**; add Sub-snake + Gain columns (schema check first — sub-snake exists via metadata/box tables; Gain likely needs a migration — flag if so); outputs sub-grid with independent numbering + stereo badges preserved; inheritance banner with BOTH paths (Override here / Edit original + propagation warning). **PATCH MODE** per design-direction §10: toolbar toggle → socket-strip surface, click-channel-click-socket, drag, conflict highlighting, "patch in order", keyboard cursor. Also fix (from the earlier inventory, don't lose): clone route dropping output/cable/gear columns.

## STAGE 5 — Stage plot
Restyle canvas chrome to system (neutral item strokes, orange = selection only, power items NEUTRAL with power-type settings kept). Channel numbers on items editable inline. Keep every existing customization control, restyled. PDF export re-skinned to match the canvas render 1:1.

## STAGE 6 — Rider
Finish the PackEditor → RiderBuilderShell migration, delete PackEditor (past its deprecation deadline). Inheritance banners with dynamic parent labels ("view tour original" at show scope, "view artist original" at tour scope). Section rail states (↘ inherited / overridden chip / mono badge for embedded channel list). Field catalog expansion BLOCKED on the advancewithme research — build the shell now, catalog later.

## STAGE 7 — Export shell
One shared PDF shell (artist/tour lockup, mono numerics, day ticks) adopted by advance export, day sheets, stage plot, channel list, rider, budget exports. Reskin, not rebuild — the Puppeteer pipeline stays.

## REPORT
Per stage: files+lines, smoke IDs satisfied (from `docs/smoke-tests/visual.md`), constraints from §12 verified intact (name how), anything skipped. Screenshots or rendered-value notes for visual claims. Floor-green per stage. Push at the end.
