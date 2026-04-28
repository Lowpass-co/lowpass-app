# UX13 — List Pages Re-skin

> First prompt of Phase D (page redesigns). Migrates every existing list-archetype page onto `<DataTable>` (UX05) + `<SlideOver>` (UX03). After this prompt, no page is allowed to render its own bespoke table.

---

## 0. Context for Cursor

Read first:

1. `docs/cursor-prompts/UX_OVERHAUL_ROADMAP.md` — section 7 (Phase D rollout).
2. `docs/components/DATA_TABLE_CONTRACT.md` (UX05).
3. `docs/components/SLIDE_OVER_CONTRACT.md` (UX03).
4. UX02–UX12 (must be merged).

---

## 1. Why this prompt exists

After Phase B/C, every component and canonical entity exists. Now the actual pages get redesigned. This prompt handles all the **list** pages in one pass. UX14 handles Budget, UX15 the other spreadsheets, UX16 dashboards, UX17 documents.

Why bundle the list pages: they share the same structure (data → DataTable → SlideOver) and benefit from being migrated together — easier to confirm consistency.

---

## 2. Pages in scope

| Route | Source data | SlideOver content | Notes |
|-------|-------------|------------------|-------|
| `/tours/[id]/personnel` | `tour_personnel` joined to `persons` | PersonSlideOver (UX10) | Tour-scoped persons list |
| `/library/personnel` | `persons` | PersonSlideOver | Workspace-scoped |
| `/tours/[id]/files` | `files` table | New `FileSlideOver` (build it here) | Per-tour, also tag-filtered global view |
| `/library/deal-memos` | `deal_memos` | New `DealMemoSlideOver` | Tag = tour |
| `/library/gear` | `gear` | GearSlideOver (UX12) | Workspace-scoped |
| `/tours/[id]/hire` (Tour-scoped Gear) | `tour_gear` joined to `gear` | GearSlideOver | Filtered to current tour |
| `/library/mics` (if exists) | `gear` filtered by `category = 'mic'` | GearSlideOver | Special case of Gear |
| `/tours` | `tours` | New `TourSlideOver` (build it here) | All tours |
| `/templates` | `templates` | New `TemplateSlideOver` | |
| `/tours/[id]/rider-packs` | `rider_packs` | Existing pack editor (full page, not slide-over) — see notes | Row click navigates to pack editor, doesn't open slide-over |
| `/bugs` | already done in UX03 | leave as-is | |

If any other list-shaped page exists, classify it and add it to the migration with a brief PR note.

---

## 3. Hard rules

1. **Body content rendered via `<DataTable>`.** No bespoke table HTML remains.
2. **Each row has a slide-over** unless explicitly noted (rider packs go to a full editor instead).
3. **Filters per the DataTable column-filter API** (UX05). No bespoke filter UI.
4. **Page header** (existing): keep page title + subtitle; everything else (filter chips, search, bulk actions) goes into DataTable's toolbar.
5. **Don't change data fetching shape.** Use existing API/query functions; just feed the rows into DataTable.
6. **Visual diff is expected and welcome** — pages now look like Bug Reports, which is the intended outcome.
7. Lint + typecheck clean per page.
8. Each page = one commit.

---

## 4. Step 1 — Migrate `/tours/[id]/personnel`

1. Identify current personnel page implementation
2. Build column defs:
   - Name (with avatar if available)
   - Role (from `tour_personnel`)
   - Employment type (pill)
   - Rate (currency, formatted)
   - Email
   - Phone
   - Status (active/inactive)
3. Wire `onRowClick` → opens PersonSlideOver via `useEntityRouting().open({ kind: 'person', id: row.personId })`
4. Add filters: role, employment type, status
5. Add bulk action: "Assign role to selection"
6. Confirm visual diff is improvement

Commit: `UX13: migrate /tours/[id]/personnel to DataTable`.

---

## 5. Step 2 — Migrate `/library/personnel`

Same pattern. Workspace-scoped. Columns: Name, Last toured (date), Total tours (count), Email. Slide-over: PersonSlideOver.

Commit: `UX13: migrate /library/personnel`

---

## 6. Step 3 — Migrate `/tours/[id]/files`

Files have several complications worth noting in the prompt:

1. Build column defs: File name, Type (pill), Tag (e.g. show name, contract), Size, Uploaded by, Uploaded at
2. Build `<FileSlideOver>` at `src/components/entity/file/FileSlideOver.tsx`:
   - Sections: Preview (image / PDF inline if possible), Metadata, Tags, Linked records (which show / person / hotel this file relates to), Activity
3. Filters: type, tag, uploaded-by
4. Row click → FileSlideOver
5. Add upload affordance to the toolbar (existing logic, just relocate)

Commit.

---

## 7. Step 4 — Migrate `/library/deal-memos`

The user explicitly called out wanting deal memos as both per-show AND a global library view (matching their Google Drive structure).

1. Build `<DealMemoSlideOver>`:
   - Sections: Document (PDF preview), Show + Tour, Status (signed / pending / expired), Notes, Activity
2. DataTable columns: Title, Show, Tour, Status, Updated, Signed-on
3. Filters: status, tour, year
4. Row click → DealMemoSlideOver

Also surface deal memos within the show context — add a "Deal Memos" tab or section to each show's Advance page (UX17 will polish this; here just ensure data is queryable per show).

Commit.

---

## 8. Step 5 — Migrate `/library/gear` and `/tours/[id]/hire`

Already partially done in UX12. Confirm DataTable + filters + slide-over wiring is correct. Polish columns, add bulk actions ("Set ownership for selection", "Add to current tour").

Commit.

---

## 9. Step 6 — Migrate `/tours`

1. Build `<TourSlideOver>`:
   - Sections: Overview, Dates, Personnel summary, Budget summary, Quick actions
2. DataTable columns: Tour name, Status, Start, End, # shows, # personnel
3. Filters: status, year
4. Row click → either slide-over (quick view) OR navigate to tour overview. Pick: **slide-over for quick view, with an "Open tour" button in the slide-over header that navigates**.

Commit.

---

## 10. Step 7 — Migrate `/templates`

1. Build `<TemplateSlideOver>`: shows template content + which tours have used it
2. DataTable columns: Name, Type (pack / budget / advance), Last used, Used count
3. Filters: type
4. Row click → TemplateSlideOver

Commit.

---

## 11. Step 8 — Migrate `/tours/[id]/rider-packs`

Special case: row click navigates to the pack editor (a full page), not a slide-over. Pack editing needs the canvas.

1. DataTable columns: Pack name, Status (draft/sent/signed), Recipient, Last sent, Updated
2. Filters: status, recipient
3. Row click → `router.push(`/tours/${id}/rider-packs/${packId}`)`
4. Add a slide-over for "Pack details" anyway (sharing log, comments) — accessible via a "..." menu in the row, not on row click

Commit.

---

## 12. Verification

For each page after migration:
1. Page renders with new chrome
2. DataTable shows expected columns
3. Filters work; search works; sort works
4. Row click opens correct slide-over (or navigates for rider packs)
5. Bulk actions (where defined) work
6. Visual aesthetic matches Bug Reports
7. Dark mode parity
8. Mobile fallback (DataTable's default mobile layout)
9. Lint + typecheck clean

---

## 13. Acceptance criteria

- [ ] All 8 list pages migrated to DataTable + appropriate slide-over
- [ ] New slide-overs built: FileSlideOver, DealMemoSlideOver, TourSlideOver, TemplateSlideOver
- [ ] Filters / search / sort / bulk actions wired per page
- [ ] Visual diff is an improvement (Bug-Reports-like aesthetic everywhere)
- [ ] No bespoke table implementations remain (search the codebase to confirm — `grep -r '<table' src/`)
- [ ] Lint + typecheck clean
- [ ] No new deps

---

## 14. Out of scope

- ❌ Don't redesign Budget — UX14
- ❌ Don't redesign other Spreadsheet pages — UX15
- ❌ Don't redesign Dashboard — UX16
- ❌ Don't redesign Advance / pack editor — UX17
- ❌ Don't add new fields or features to any list

---

## 15. Commit plan

8 commits, one per page. Push incrementally so the user can review page-by-page.
