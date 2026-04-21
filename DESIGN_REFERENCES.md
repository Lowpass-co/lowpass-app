# Lowpass — Standing Design References

Paste block to include at the top of every Cursor prompt from PR A1 onward. Keeps Cursor aligned on the same visual/behavioural vocabulary. Update in place when new decisions land.

Last updated: 2026-04-21.

---

## Design references block (copy-paste to each future prompt)

```
## Design references (standing — applies to all Lowpass PRs)

Lowpass borrows from three products. When resolving ambiguity in layout, interaction, or visuals, lean on these:

1. Daysheets (daysheets.com, the tour management app) — visual + interaction vocabulary.
   - Dark mode is the hero state, not an afterthought. Theme color #0f172a.
   - "All / Me" is a single universal personal-filter toggle across every module (schedule, notes, hotels, flights, advance), not per-screen.
   - Party chips as the primary filter row on schedules: "All Parties / A Party / B Party / C Party" as a chip-row above the list, not a dropdown.
   - Mobile reaches full parity with desktop — editing, creating, and admin must all work on mobile.
   - Dense grids over card stacks for tabular data (e.g. Flight Grid).
   - Group Tags → sub-groups that personalise per-person itineraries; admins see everything, non-admins see only what pertains to their group.
   - Day Types render as colored cells on a month view; colors configurable per tour.
   - Four mobile pivots for a tour: Day / Calendar / Routing / Map.
   - Global "+" add menu on mobile (persistent FAB / add-menu) over per-screen add buttons.
   - Vocabulary: "beautiful", "clear", "modern", "speedy", "immediate response". Avoid generic "clean and spacious".

2. Xero — budget UX.
   - (a) Transaction-list pattern: inline-editable rows, per-row running totals, category tag per row, cell-level precision. Used for Lowpass's routing/income merge and per-show budget entry.
   - (b) Budget/forecast grid: rows = categories, columns = shows (or months), editable cells, column totals + row totals visible. Used for the tour-wide budget view.
   - Inline edits save on blur or Enter, not via modal dialogs.
   - Keyboard navigation: Tab moves cell-to-cell, Enter confirms and moves down.

3. Notion — context menus.
   - Every row-bearing page supports a context menu for quick actions (duplicate, delete, move, convert, etc.).
   - Trigger (i): right-click anywhere on a row → menu opens at cursor.
   - Trigger (ii): visible ⋯ (kebab) affordance on the right of the row, appears on hover, click opens the same menu.
   - Menu items keyboard-accessible (arrow keys + Enter).
   - No slash-commands or Cmd+/ shortcuts for now — easy to add later.

Explicit non-goals (from these references):
- Not copying Daysheets' travel-agent module — scope stays at tour advancing + budget + daysheet for Lowpass.
- Not replicating Xero accounting features (reconciliation, bank feeds, invoicing) — only the edit-grid patterns.
- Not copying Notion's blocks / databases / relations model — only the context-menu trigger pattern.
```

---

## Canonical Lowpass UI — the Bug Reports page

The `/bugs` page (`src/app/(app)/bugs/page.tsx` → `src/components/bug-report/BugReportsClient.tsx`) is the **reference implementation** for Lowpass's own visual + interaction language. When in doubt about how a new surface should look, copy these patterns first; only deviate if the feature demands it.

### Patterns locked in by this page

1. **Stat-card strip** — a row of 4–5 small cards at the top, each with a `lp-label-caps`-style label and a big coloured number. Background is `var(--lp-surface)` on `var(--lp-border)`.
2. **Filter row** — single-line, left-aligned. Search input first (with leading `Search` icon), then dropdowns, then action pills, then `flex-1` spacer, then primary/refresh actions on the right.
3. **`BrandedSelect`** (`src/components/ui/BrandedSelect.tsx`) — every dropdown on every branded surface. Portaled via `.lp-dropdown-layer`, rounded-xl trigger, chevron-down with rotation on open, keyboard-navigable (Arrow/Home/End/Enter/Esc), optional leading colour dot per option. **Do not use native `<select>` inside branded pages.** Dashboard and spreadsheet-grid inline-edit cells are the documented exceptions (native `<select>` is fine there until a focused replacement pass — see "Propagation" below).
4. **Pill** — status/severity chip. `rounded-full`, 11px font, tinted background (`colour + '1a'`), tinted border (`colour + '33'`), solid-colour leading dot. Re-exportable; used in both the grid rows and the detail panel header.
5. **Toggle-pill action button** — e.g. "Hide resolved". Same geometry as a filter pill; when active, background is `--lp-orange` at 10 % and text is `--lp-orange`. Shows a contextual count badge inside the pill.
6. **Slide-in detail panel** — right-anchored, `max-w-2xl`, full height. Backdrop fades in/out (opacity transition); panel slides in/out via CSS `translate-x-full → translate-x-0` on `transition-transform duration-300 ease-out`. **No framer-motion.** Parent holds a `cachedReport` so the panel can keep rendering while sliding out; `onTransitionEnd` clears the cache. Escape + backdrop click + explicit Close all close.
7. **Panel header** — pills inline at top, then bold title, then a muted meta line (e.g. "Reported {date} by {reporter}"). Right-side `X` close button.
8. **Panel body** — `Field` primitive: 11 px uppercase label, then the control. Use stacked `Field` blocks with `gap-5` instead of a sub-form.
9. **Panel footer** — destructive action bottom-left (`#ef4444` on `#ef444433` border), primary/secondary actions bottom-right. Copy state (idle / copied / error) animates via colour change, not a separate toast.
10. **Row-level context menu** — `src/components/ui/ContextMenu.tsx`. Notion-style ⋯ kebab on hover + right-click target the same menu. Items keyboard-accessible. `danger` variant is red. Portaled on `.lp-dropdown-layer` so it escapes every stacking context.

### Propagation rules

When building a new page or refactoring an existing one:

- **Always use** `BrandedSelect` instead of native `<select>` on any page that belongs to the branded app surface (advance, budget, routing settings, personnel, tours, etc.).
- **Always use** the slide-in detail panel pattern when a list row drills into a per-item editor (no modal dialogs, no pushed routes for simple edits).
- **Always use** `ContextMenu` for row actions (duplicate, delete, move, export, etc.). Right-click wiring comes in the next pass of ContextMenu; the kebab trigger is the baseline.
- **Budget / advance pages**: migrate native `<select>` → `BrandedSelect` in a non-destructive pass when touching those files for other reasons. Do not mass-rewrite inline-edit cells in spreadsheet grids (`InlineEditCell`, `SpreadsheetCurrencyAmount`, etc.) in the same PR — that's its own focused change.
- **Never** introduce new dropdown components. If `BrandedSelect` can't do what you need, extend it.

### Explicit non-goals (on this page's pattern)

- Not a modal. No centred dialogs. If a control needs to be modal, it has to justify it.
- Not framer-motion. Every animation here is pure Tailwind/CSS. Keep it that way.
- Not a toast system. Inline state (saved / saving / failed) is preferred for single-action feedback.

---

## Where each reference applies

| Area | Daysheets | Xero | Notion |
|---|---|---|---|
| Top-bar + global nav | ✅ (dark mode, speed vocabulary) | — | — |
| Routing / income page (A1) | ✅ (party chips, dark mode) | ✅ (a) transaction list | ✅ (right-click row) |
| Budget module | — | ✅ (a) + (b) | ✅ (right-click category/row) |
| Advance questionnaire (E0–E6) | ✅ (field types, personal filter) | — | ✅ (context menu on section/field) |
| Rider / Labor Call / Daysheet templates (E2–E4) | ✅ (day types, party chips, mobile parity) | — | ✅ (right-click row) |
| Scheduling / calendar (F) | ✅ (Day/Calendar/Routing/Map, coloured day types) | — | ✅ (right-click event) |
| Personnel / groups (C) | ✅ (Group Tags, visibility layer) | — | ✅ (right-click person) |
| Activity log (H) | — | — | — (own pattern) |

---

## Gaps — things we still can't cite specifically

The `daysheets-walkthrough.md` §6 documents 18 gaps. The biggest ones that would bite:

1. **Daysheet page layout** — time column + rows? Grouped slots? Kanban? Not determinable from marketing.
2. **Row structure** of a schedule entry (time / icon / title / sublabel / party chip / assignee avatar stack).
3. **Inline edit vs modal** pattern — not confirmed by copy.
4. **Context menu behaviour in Daysheets** — not documented. Lowpass is taking Notion's pattern, not Daysheets'.
5. **Exact colour palette** beyond theme-color #0f172a.
6. **Typography / font stack** — undisclosed.
7. **Specific keyboard shortcut list** — claimed, not published.
8. **Group Tags visual chip appearance** — badge? coloured dot? stacked label?
9. **Add menu dropdown structure** — screenshot alt text only.

**Unblock options:**
- (A) Adam sends screenshots of key Daysheets views (day sheet, flight grid, schedule + party chips, context menu if any, personnel view). Fastest.
- (B) Headless-browser walk of daysheets.com via Chrome MCP to scrape App Store / Play Store screenshot captions that are JS-rendered. Partial unblock.
- (C) Get access to a Daysheets trial account and do an authed walk the same way we did for advancewithme.live. Most thorough but slowest.

Preferred order: (A) → (B) if (A) doesn't cover the gaps. (C) only if the product direction changes and we need forensic detail on a specific flow.
