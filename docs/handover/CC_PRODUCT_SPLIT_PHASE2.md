# Product Split Phase 2 — Phase 1 Visual Fixes + Advance Migration + Reference Pattern Adoption

> Phase 1 deployed. Adam's testing surfaced three Phase 1 bugs to fix in Phase 2: typography too cosy across the board, avatar dropdown not opening, calendar widget too minimal. Beyond those fixes, Phase 2 migrates the Advance content from `/tours/[id]/advance/*` into the new `/advance/[tourId]/*` placeholders and wraps it in `<ProductShell>`. Adam attached HTML reference designs for the Advance template-builder pattern — adopt that aesthetic with the typography size correction, drop the "to-do list" framing (advance ≠ tasks), drop the evidence-photo bit.
>
> **One PR off `feat/product-split-phase1`** (or off main if Phase 1 has merged by the time CC starts — check `git fetch && git log origin/main --oneline | head -5` first).
>
> Five commits: F1 (Phase 1 visual fixes) → A (advance content migration) → B (advance visual upgrade per references) → C (Previously Played feature, stretch) → V (verify).

---

## 0. Required reading

1. `CLAUDE.md`
2. `docs/handover/CC_PRODUCT_SPLIT_PHASE1.md` — what Phase 1 shipped + the visual locks Phase 2 must inherit
3. `docs/handover/PRODUCT_SPLIT_TOKEN_PROPOSAL.md` — token system; Phase 2 corrects the size-too-small issue
4. The four uploaded reference files Adam provided in his Phase 1 feedback. Two are HTML mockups, two are React. They show the advance-template-builder pattern Adam wants adopted (with caveats — see §B). Filenames include phrases like "Advance Section - Template builder (Love this - just a bit small font wise...)" and "Love the Previously Played feature..." — search Adam's uploads.
5. `src/components/shell-v2/**` — Phase 1's new shells. Use these for the migrated advance pages.
6. `src/app/(app)/tours/[id]/advance/**` — current advance content; this is what migrates
7. `src/app/(app)/advance/**` — Phase 1's placeholder routes; this is where content lands
8. `src/components/advance/**` — existing advance components (AdvanceShowReadView, AdvanceShowContextBar, AdvanceSectionBuilder, etc.) — most stay; some get the new visual layer

---

## 1. Hard rules

1. No new dependencies.
2. All visual values via `var(--lp-…)` tokens.
3. No `any`, no `// @ts-ignore`.
4. Lint clean (75/120 baseline). Typecheck zero errors.
5. Build via `next build --webpack` only.
6. Five commits in order: F1 → A → B → C → V. C (Previously Played) is stretch — defer if scope tightens.
7. **Adam's product locks for advance** (do not relitigate):
   - **Advance is NOT a to-do list.** The reference HTMLs blend advance with task-checking; reject the to-do framing. Advance = per-show information capture (hospitality, hotel, contacts, schedule, etc.). To-dos are a future separate feature.
   - **Drop the "evidence photo" pattern** from the reference HTMLs. Phase 2 doesn't add photo capture to advance fields.
   - **Adopt the visual treatment**: dense tables, JetBrains Mono numerics, brand orange accents, Inter for body — same as Phase 1's tokens — but **bumped up in size** (see §F1.1).
   - **Previously Played feature** (§C) — keep if scope allows; the "copy/preview past advance to import" flow is high-value.

---

## F1. Phase 1 visual fixes (~1.5 hr)

These three issues from Adam's Phase 1 smoke. Land first so the Advance migration inherits the corrected visuals.

### F1.1 Typography too cosy — bump up across the board

Phase 1 set body base to 13px. Adam reports everything feels small/cramped. Recalibration:

```css
/* globals.css */
body {
  font-size: 14px;        /* was 13px in Phase 1 — bumped */
  line-height: 1.5;
}

/* Headings — bigger */
h1 { font-size: 28px; line-height: 1.2; font-weight: 600; }   /* was 24px */
h2 { font-size: 20px; line-height: 1.3; font-weight: 500; }   /* was 18px */
h3 { font-size: 16px; line-height: 1.4; font-weight: 500; }   /* was 15px */

/* Stat tiles — beefier */
.lp-stat-value { font-size: 32px; font-weight: 600; line-height: 1; }  /* was 24px */
.lp-stat-label { font-size: 11px; letter-spacing: 0.06em; text-transform: uppercase; }

/* Density utilities stay at 12px for ACTUAL tables and dense lists */
.lp-dense {
  font-size: 12px;
  line-height: 1.4;
}
/* Dense rule unchanged — only applied INSIDE tables / dense lists,
   never to body or detail pages */
```

The density rule still applies: tables and lists go 12px via `.lp-dense`; body / detail pages / forms / cards stay at 14px. The bug Adam saw was the 13px body shrinking everything; bumping body to 14px while keeping `.lp-dense` for tables-only fixes it.

Audit any place that pinned `font-size: 13px` or `text-xs` (Tailwind's 12px) on detail-page elements that shouldn't have shrunk. Those bump to 14px / `text-sm`.

### F1.2 Avatar dropdown not opening

Adam clicks the avatar in the new `<ProductHeader>`, nothing happens. Find the wiring:
- Is `onClick` actually handling state toggle?
- Is the dropdown component conditionally rendered with `display: none` when closed (so the click target works) vs. unmounted entirely?
- Is z-index sufficient for the dropdown to layer above other elements?
- Is the click-outside handler closing it instantly?

Most likely fix: the `<ProductHeader>` has a `setOpen(true)` handler but `setOpen` is undefined/wrong, OR the dropdown's mounted but positioned offscreen.

Open the dropdown when clicked. Show: Personnel / Templates / Venues / Rental / Settings / Bug reports (admin-gated) / Sign out. Close on click-outside or escape.

### F1.3 Calendar widget too minimal

Adam's words: "Calendar is cool but a BIT minimal." Currently shows 30 days with day-type colour cells. Beef it up:

- **Month header** above the strip (e.g. "April 2026") that updates as user scrolls/paginates
- **Day name + number** in each cell (already kind-of there but tighten readability with bigger numbers)
- **Show title + venue** on hover (tooltip) AND as a tiny line beneath the day number on cells where there's a show — not just colour
- **Colour-coded by tour** (subtle stripe at top of cell) when this artist has multiple tours — disambiguates "is this Tour A or Tour B's show?"
- **Click target**: still routes to `/advance/[tourId]/[routingId]` — that part works
- **Width**: should fill the section container, currently feels stuck in a fixed-width zone

Reference: the calendar cells in Adam's "Previously Played" HTML reference are richer than what shipped — pull patterns from there.

### F1.4 Acceptance for §F1

- [ ] `globals.css` body base is 14px; headings + stat values upsized; `.lp-dense` still 12px for tables only
- [ ] Avatar dropdown opens on click, shows all entries (Personnel/Templates/Venues/Rental/Settings/Bug reports/Sign out), closes on click-outside/escape
- [ ] Calendar widget has month header, day labels, show title + venue per show day, tour-colour stripe when multi-tour, fills available width
- [ ] Existing pages (post-Phase-1 redirects to placeholders) render cleanly at the new size
- [ ] Lint + typecheck clean

### F1.5 Commit

```
fix(phase1): typography upsize, avatar dropdown, calendar enrichment

Phase 1 shipped at 13px base; Adam's smoke flagged everything as
"a biiit small". Recalibration:
- Body base 13 → 14. Headings, stat values, section labels bumped
  proportionally. .lp-dense stays at 12px for tables/lists only.
- Avatar dropdown wiring fixed. Click toggles, click-outside +
  escape close. Entries: Personnel/Templates/Venues/Rental/
  Settings/Bug reports (admin)/Sign out.
- Calendar widget: month header, day labels, show title + venue
  per show day, tour-colour stripe for multi-tour artists.

Made-with: Claude Code (product split Phase 2)
```

---

## A. Advance content migration (~3 hr)

Move advance content out of `/tours/[id]/advance/*` into `/advance/[tourId]/*` and wrap in `<ProductShell>`.

### A.1 Routes

- `/tours/[id]/advance/page.tsx` → `/advance/[tourId]/page.tsx` (overview)
- `/tours/[id]/advance/[routingId]/page.tsx` → `/advance/[tourId]/[routingId]/page.tsx` (per-show)
- The `[product]/[tourId]` placeholder pages from Phase 1 get replaced by the real content

### A.2 Shell wrapping

Each migrated page wraps in `<ProductShell active="advance" artistId={artistId} tourId={tourId} productName="Advance">`. The shell provides:
- Left product rail (active = Advance)
- Top header with artist + tour switchers
- Scroll context

Inside the shell, the existing `<AdvanceShowContextBar>` from UX22 phase 2 stays — it's the per-show context. The previous `<TourBreadcrumb>` from PR #3 retires (the new ProductHeader replaces it).

### A.3 Internal links

Audit and update every internal link that points to `/tours/[id]/advance/*` → `/advance/[id]/*`:
- `next/link` href values
- `router.push()` / `router.replace()` calls
- API route response redirects

Phase 1's `next.config.ts` 301 redirects catch any URLs that miss this sweep, but in-app links should point at the canonical new URLs.

### A.4 Components inventory

These stay (and inherit the new typography from F1.1):
- `<AdvanceShowReadView>`
- `<AdvanceShowContextBar>`
- `<AdvanceSectionBuilder>` (the 5,361-line edit view)
- `<ApplyAdvanceTemplateSlideOver>`
- `<BulkStatusUpdateSlideOver>`
- `<AdvanceFlightsPanel>`

These move from `src/components/advance/` to stay where they are (Foundation can't claim them; they're advance-specific). Adjust imports across the migrated routes.

### A.5 Acceptance for §A

- [ ] `/advance/[tourId]` renders the advance overview (UX22 Phase 1's redesign — DataTable show list with day-type strips, status pills, ⋯ menu) inside `<ProductShell>`
- [ ] `/advance/[tourId]/[routingId]` renders the per-show advance with `<AdvanceShowContextBar>` and existing read/edit modes inside `<ProductShell>`
- [ ] Internal links throughout the codebase point to the new URLs
- [ ] 301 redirects from `/tours/[id]/advance/*` still work (Phase 1's config) — verify by hitting an old URL
- [ ] All UX22 features still work: drag-drop reorder, copy from previous show, custom sections, bulk status update, layout templates apply
- [ ] Lint + typecheck clean

### A.6 Commit

```
feat(advance): migrate /tours/[id]/advance/* → /advance/[tourId]/*

Advance content moves into the product silo. Both overview and
per-show pages now wrap in <ProductShell> with active=advance.
Existing UX22 components (AdvanceShowReadView, ContextBar,
SectionBuilder, ApplyTemplateSlideOver, BulkStatusUpdate) carry
forward unchanged — they get the F1.1 typography upgrade for free.

Internal links audited and updated. Phase 1's 301 redirects still
catch any missed external links. TourBreadcrumb retires for advance
pages (ProductHeader replaces it).

Made-with: Claude Code (product split Phase 2)
```

---

## B. Advance visual upgrade per references (~2 hr)

Adam attached HTML mockups + React snippets showing the advance template-builder aesthetic he wants adopted. Apply the patterns with the typography size correction baked in (so the references' 12px feel becomes ~14px feel) and the to-do/evidence-photo elements stripped.

### B.1 What to adopt from the references

- **Dense table layout** for section editor rows (sticky header, borderless or hairline-bordered cells, hover state)
- **JetBrains Mono numerics** for any numeric/timestamp fields (already enforced via `.lp-mono` from Phase 1)
- **Section template browser** — left sidebar listing template categories, right pane with field editor. The reference HTMLs structure this nicely.
- **Field-type icons** for each field (text / number / contact / linked-asset / etc.) — visual differentiation in the field list
- **Drag-handle column** for reordering fields within a section

### B.2 What to drop

- **Checkbox/to-do styling on field rows.** Adam: "advance is NOT a to-do list." Field rows are data-entry, not check-off-when-done. Don't render checkboxes per row.
- **Evidence photo capture.** Adam explicitly excluded this from advance.
- **Any auth or live-data UI** in the references that was demo-only.

### B.3 Where to apply

- `<AdvanceSectionBuilder>` — the edit view's section/field configuration UI. This is where the template-builder aesthetic lives most naturally.
- `<AdvanceShowReadView>`'s section cards — adopt the denser table style for fields-with-values display
- `<ApplyAdvanceTemplateSlideOver>` — the picker's field-list section can use the new field-type-icon treatment

### B.4 Acceptance for §B

- [ ] Section editor adopts dense-table layout per references (no checkboxes, no evidence photos)
- [ ] Field-type icons render in the field list
- [ ] Drag-handle column for reordering
- [ ] JetBrains Mono on numeric/timestamp fields throughout
- [ ] Read view section cards inherit the dense field-table style
- [ ] All existing edit/read functionality still works (don't break the substance to apply the style)
- [ ] Lint + typecheck clean

### B.5 Commit

```
feat(advance): apply reference template-builder aesthetic with typography corrections

Adopts the dense-table layout, JetBrains Mono numerics, field-type
icons, drag-handle reorder column from Adam's reference HTMLs.
Strips the to-do checkbox styling and evidence-photo capture
(advance ≠ tasks per Adam). Typography uses Phase 2's corrected
14px base instead of the references' 12px so it doesn't feel cramped.

Applied to: AdvanceSectionBuilder, AdvanceShowReadView section
cards, ApplyAdvanceTemplateSlideOver field list.

Made-with: Claude Code (product split Phase 2)
```

---

## C. Previously Played feature (~2 hr — STRETCH, defer if scope tight)

Adam's words on the reference: "Love the 'Previously Played' feature. Being able to copy/preview that advance to import would be sick."

### C.1 Feature shape

On the per-show advance page (`/advance/[tourId]/[routingId]`), add a sidebar or slide-over showing **other shows at this same venue across the workspace's tour history**. For each:
- Date + tour + venue match indicator (exact venue match vs. same city, etc.)
- Hover/click → preview that past advance
- "Import" button → copies that past show's section data into current show (creates new sections + fields from the source's values, doesn't overwrite existing data)

### C.2 Implementation sketch

- New API route: `GET /api/advance/previously-played?venueId=X&tourId=Y` returns past shows at venue X across the workspace's tours, excluding tour Y (the current one)
- Detection: same venue_id (best), or same city + similar venue_name (fuzzy fallback) — confirm in audit which venue matching the schema supports cleanly
- Import flow: PATCH the current show's advance data with `{ ...current, [section_id]: source.section_data }` per section the user picks (one-by-one or all-at-once)
- UI: collapsible right-rail or `<SlideOver>` opened from a "Previously played" button in the show context bar

### C.3 Acceptance for §C

- [ ] Per-show advance page has a "Previously played" affordance (button/link/sidebar)
- [ ] Clicking surfaces past shows at the same venue
- [ ] Each past show is previewable (read-only view of its sections)
- [ ] "Import" copies one or more sections into current show without overwriting existing data
- [ ] Toast confirms successful import
- [ ] Lint + typecheck clean

### C.4 Commit

```
feat(advance): Previously Played sidebar — preview + import past advance for same venue

Adam's stretch ask from the Phase 2 reference. On a per-show
advance page, surfaces other shows at the same venue from the
workspace's tour history. Click to preview; click Import to copy
selected sections into the current show.

Detection: same venue_id (preferred), city + name fuzzy match
fallback. Import is additive (doesn't overwrite existing fields).

Made-with: Claude Code (product split Phase 2)
```

---

## V. Verify (~30 min)

### V.1 Phase 1 fixes (F1)

1. Open `/artists/[id]` — typography is comfortable, not cosy. Stat tile values are big and readable.
2. Click avatar — dropdown opens, shows all entries, closes on click-outside.
3. Calendar — month header visible, show title + venue on cells with shows, tour-colour stripe for multi-tour artists.

### V.2 Advance migration (A)

4. Visit `/advance/[any-tour-id]` — overview renders inside `<ProductShell>` with all UX22 features (DataTable, day-type strips, status filter chips, ⋯ menu).
5. Click a show row → routes to `/advance/[tour]/[routing]` per-show page inside `<ProductShell>`.
6. Per-show page: ContextBar shows; read view + edit toggle work; drag-drop reorder works; custom section create/edit/delete works; copy from previous show works; bulk status update works.
7. Hit `/tours/[id]/advance` in URL bar → 301s to `/advance/[id]` cleanly.

### V.3 Visual upgrade (B)

8. Edit view section editor: dense-table layout, no checkboxes, field-type icons, drag handles, JetBrains Mono on numerics.
9. Read view section cards: dense field tables, mono on numerics.
10. ApplyTemplateSlideOver field list: field-type icons present.

### V.4 Previously Played (C, if shipped)

11. Per-show advance page → "Previously played" affordance visible.
12. Click → surfaces past shows at this venue.
13. Click Import → sections copy in.

### V.5 No regressions

14. Lint + typecheck clean. `next build --webpack` succeeds.
15. Budget + Operations placeholder pages still render (haven't broken Phase 1's other product silos).
16. Mobile PWA at `/m/*` still works.

---

## When done

```
Product Split Phase 2 done.
Commits: <F1-sha>, <A-sha>, <B-sha>, [<C-sha>], <V no-code>.
- F1: Phase 1 typography upsize (14px body, bigger headings/stats),
  avatar dropdown wiring fixed, calendar widget enriched (month
  header, show titles + venues, tour-colour stripes).
- A: /tours/[id]/advance/* migrated to /advance/[tourId]/* inside
  <ProductShell>. UX22 features intact. Internal links updated.
  TourBreadcrumb retired on advance.
- B: Reference template-builder aesthetic applied to
  AdvanceSectionBuilder + AdvanceShowReadView section cards.
  Dense tables, field-type icons, drag handles, JetBrains Mono
  numerics. To-do checkbox styling and evidence-photo capture
  excluded per Adam.
- C [if shipped]: Previously Played sidebar — preview past shows
  at same venue + import sections into current show.
- Lint + typecheck clean. Built via next build --webpack. Phases 3
  (Budget) and 4 (Operations) can ship in any order; they don't
  depend on each other once Foundation's in place.
```

If §C runs out of scope, surface in the report and we'll queue it as a follow-up sprint. The migration (§A) and visual upgrade (§B) are non-negotiable; F1 is the smallest and lands first.
