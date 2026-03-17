# Cursor Prompt: Completion Pass – Advance, Calendar, Budget, Profile

## Context

Previous Cursor pass completed: login forgot-password, post-login zoom transition, dashboard stats, Needs Attention grouping, tour wizard animations/validation, routing improvements, advance load fade + search, global calendar.

This prompt covers **everything that was NOT completed** in that pass. Work through each section in order. Preserve all existing API calls and data flow unless a fix is explicitly required.

**Stack**: Next.js (App Router), TypeScript, Tailwind CSS v4 (`@theme inline` tokens in `globals.css`), Supabase. Design tokens: `lp-orange`, `lp-bg`, `lp-surface`, `lp-border`, `lp-text`, `lp-text-secondary`, `lp-text-tertiary`, `lp-success`, `lp-warning`, `lp-error`. Dark mode via `.dark` on `<html>`.

### Implementation notes (reference for sections 1–29)

1. **Preserve all existing API calls and data flow** unless a fix is explicitly required. This is primarily a features + bugfix pass.
2. **Tailwind only** — no new CSS files.
3. **All Supabase changes**: add migrations to `database/migrations/` or note schema changes clearly in `docs/SCHEMA_CHANGES.md`.
4. **Work through sections in order** — earlier sections are higher priority.
5. **After each major section**, do a quick TypeScript check to avoid build errors accumulating.
6. Update `docs/UPDATES_PROGRESS.md` with what was completed.

---

## 1 · Dashboard

### 1a – Tours Needing Attention → replace with a useful stat
Remove the "Tours needing attention" card. Replace it with **"Upcoming shows (next 30 days)"** — a count of confirmed routing dates in the next 30 days across all tours, with a link to the calendar. Use existing routing/advance API data.

### 1b – Combined financial/advance overview
Add a **"Budget snapshot"** section to the dashboard (below the advance section). For each active tour, show a single row: Tour name | Budget status (% spent vs planned) | Net P&L (planned) | Next show date. Pull from existing `/api/budget/[tourId]/summary` or equivalent. If the endpoint doesn't exist yet, add a lightweight one. This does NOT need to replace the current advance dashboard — just augment it.

---

## 2 · Advance – Day overview strip

On the advance section builder (`AdvanceSectionBuilder.tsx` / the per-show advance page), add a **left-side date strip**:
- Narrow column (≈64px wide) on the left of the screen
- Lists all routing dates for the tour, top to bottom, each as a small pill: date (e.g. "08 Apr") + city abbreviation
- The currently-open show date is highlighted orange
- Clicking a different date navigates to that show's advance (same as clicking from the overview list)
- Strip is scrollable if the tour has many dates
- On mobile, hide the strip (horizontal scroll on the main content is fine)

---

## 3 · Advance – Days off as pills

In the advance overview (`AdvanceOverview.tsx`) where shows are listed as cards/pills, **insert day-off pills between show pills**:
- Day-off pill: smaller, subtler — show the date and "Day Off" label in `lp-text-tertiary`, no orange border
- Travel days: similarly subtle, show "Travel" with destination city if available from routing
- Show days remain as the prominent cards they are
- You can still click a day-off pill to add an advance note for it, but it should not open a full advance builder — just a simple notes modal

---

## 4 · Advance – Item adds into expanded section

When the user adds an item from the library in Setup mode, the behaviour should be:
- The section the item belongs to **automatically expands** (if not already open)
- All other sections **collapse**
- The new item is visible without the user needing to click to expand

This should already be partially done from the previous pass — verify it works and fix if not.

---

## 5 · Advance – Contacts always at top of section

Within any advance section, contact-type fields must always sort to the top of the field list, regardless of their creation order. If a section has no contacts, no change. A contact field is identified by its `field_type === 'contact'` or equivalent schema value.

---

## 6 · Advance – Drag animation

The drag-and-drop reorder of advance items currently has no animation. Add smooth drag animation:
- While dragging: the dragged item has a slight scale-up + shadow
- A **placeholder/ghost** shows where the item will land when released (dashed border, same height as the item)
- Adjacent items shift smoothly to make space (CSS transition)
- On drop: smooth snap into final position
- Use `@dnd-kit/sortable` transforms if already in use; otherwise `react-beautiful-dnd` or pure CSS transitions on the existing drag implementation

---

## 7 · Advance – Custom fields & library

### 7a – Optional/Required pill
Replace the slider/toggle for optional/required with a pill toggle matching the rest of the UI (same component as used elsewhere — two options side by side, active one filled orange).

### 7b – Custom field saved to both sides
When a user creates a custom field:
- It is saved to **the section in the advance builder** (right side) — already works
- It is also added to **the library** (left side) with a ✕ icon (not a ✓, since it's not yet "in" any advance — it's in the library)
- If the item IS in the current advance, ✕ turns to ✓ as normal
- If the item is in the library but NOT in the advance and the user clicks ✕: prompt "Delete this advance field?" → on confirm, remove from section list AND delete from Supabase

### 7c – Custom fields are user-wide
Custom fields created by a user must be available across **all their tours and artists**, not just the current one. Ensure the Supabase query for library items is scoped to `workspace_id` (or `user_id`), not to a specific `tour_id` or `routing_id`.

### 7d – Re-order sections in library
In the library panel, add drag-to-reorder for the section list. Order should be persisted (add a `sort_order` column to the sections table if not present, or use an existing ordering mechanism).

### 7e – Template save independent of advance
The "Save as template" button should work even when the advance hasn't been saved yet (i.e. it should not depend on a `routing_id` being present). Save template to its own Supabase table scoped to `workspace_id`. Fix the current bug where the save button does nothing when the advance is unsaved.

### 7f – Custom section delete/plus bugs
- The **delete button** on a custom section must delete the section from the UI AND from Supabase. Fix the current bug where it does nothing.
- The **plus (+) button** on a custom section must open the "add field" input. Fix the current bug where it does nothing.
- **Notes** added to a custom section must be visible in the section — add a display area for notes below the section header.

---

## 8 · Advance – Important documents

The "Upload important documents" area at the top of the advance page currently lets you upload files but doesn't display them.

Fix:
- After upload, files appear as a list below the upload area: filename | upload date | download link | delete button
- Fetch from Supabase storage on load
- When the first document is added, automatically create an **"Important Documents"** section in the advance (if not already present). This section is always shown with a green left-border accent. Documents uploaded here are associated with this section.

---

## 9 · Advance – Autosave text layout

When autosave fires and displays "Saved!" green text next to the save indicator, it currently pushes content to a new line for ~5 seconds. Fix: the "Saved!" text should appear **inline** (sliding in from the left, same line), then fade out. No layout shift.

---

## 10 · Advance – Catering / buyout dropdown

- Change the first/placeholder option from "Select" to **"+ Add option"**
- Clicking "Add option" opens a small inline input to type a new buyout option
- The option is saved **user-wide** (across all tours) to a Supabase lookup table
- Each option in the dropdown has a small ✕ delete button (confirm before delete)
- Keep this design pattern for all similar "add your own options" dropdowns on the site

---

## 11 · Advance – Meal times

In the catering section, add an **"Add meal"** row:
- Button: `+ Add meal`
- Each meal row: meal title (dropdown of presets: Breakfast / Lunch / Dinner / Catering / Buyout, or "+ Add" for custom user-wide option) | time input (HH:MM)
- Multiple meals can be added
- Meals saved to the advance
- Meal times should be flagged as schedulable (they can appear in the show schedule — wire this up if schedule already exists, otherwise just save the data and note it for later)

---

## 12 · Advance – Rider status

Move **Rider status** to the **top** of the catering section, below the section contact. It should read **"Hospitality Rider Status"**. Give it the same "+ Add option" dropdown behaviour as the buyout menu (§10 above).

---

## 13 · Advance – Flights / "Personnel on this flight"

- Format the "Personnel on this flight" field as a styled searchable multi-select dropdown (matching the design of other dropdowns in the app — pill style, typeable to search)
- The "Add flight" button should only appear when at least one of: outbound, inbound, airline, ref, allowance fields are selected/populated. If none are selected, show only the field selectors.

---

## 14 · Advance – Progress dropdown / context menu when section collapsed

Currently, clicking the progress dropdown or three-dot context menu on a collapsed section shows nothing. Fix: these should work regardless of expanded/collapsed state. If the section needs to expand first, expand it automatically when the dropdown is opened.

---

## 15 · Advance – Custom contact selector (role field)

The custom contact selector's role input currently does nothing. Fix:
- The role field should allow free typing to set a role name
- If the contact is inside a section that already has a label (e.g. "Hospitality Contact"), pre-fill the role with "Hospitality" (but make it editable)
- The role is saved user-wide to a lookup table so it autocompletes in future

---

## 16 · Advance – Key contacts search (space + phone)

- In the Key Contacts "Add contact" search box, typing a space currently breaks the search. Fix: allow spaces in the search input.
- Phone field on contacts should only allow digits, spaces, `+`, `(`, `)`, `-`. Block other characters.
- The role selector background/box behind the role select is hidden — fix z-index/visibility so it's always visible.

---

## 17 · Advance – Flag dropdown visibility

The flag dropdown in a section is hidden until the section is expanded. Fix: it should always be visible (or at minimum visible on section header hover).

---

## 18 · Advance – Local info magnifying glass

When the user clicks the magnifying glass icon in Local Info:
1. Automatically select the **first result** and fill the field
2. Show a small "Auto-filled from Google" badge next to the field (clickable)
3. Clicking the badge opens a popover/dropdown with alternative options for the same query
4. The field remains manually editable regardless
5. Fix the current bug where selecting a location from the dropdown doesn't fill the field

---

## 19 · Advance – Age restriction dropdown z-index

Clicking the age restriction dropdown while a dropdown below it is open causes it to render beneath the lower dropdown. Fix z-index so each open dropdown is always on top.

---

## 20 · Advance – Changeover icon in Schedule

In the Schedule section, the changeover item should use a **clock icon** (Lucide `Clock`), not a text label.

---

## 21 · Advance – Schedule templates

- Add a "Save as template" button to the Schedule section
- Templates are saved user-wide (all tours) AND can be saved tour-wide (this tour only)
- A "Load template" button/dropdown lets you apply a saved template to the current show's schedule
- Templates include all schedule items and their order

---

## 22 · Advance – Schedule: no asterisks, add artist set/soundcheck items

- Remove any `*` markers from schedule items
- Add default schedule item types: `"{Artist Name} Set"` and `"{Artist Name} Soundcheck"` — these should reference the tour's artist name dynamically
- Allow custom schedule item types (same "+ Add option" pattern as §10)

---

## 23 · Advance – Drive distance editable + auto-populated

The drive distance field should:
- Auto-populate from routing data (already calculated drive distance between cities)
- Be manually editable (override the auto value)
- Show a small "From routing" label if auto-populated, "Custom" if manually overridden

---

## 24 · Advance – Settlement moved to Budget

Settlement is currently in the advance section. Move it to the Budget area of the app (it belongs with financial data). Add it as a tab in the budget page if not already there.

---

## 25 · Advance – Venue production contact not required

Remove the "required" validation from the Venue Production Contact field. It should be optional.

---

## 26 · Advance – Deal Info section

Add a **"Deal Info"** section type to the advance (available in the library):
- Fields: Guarantee | Guest list (number + details) | Transport from promoter | Backline provisions | Notes
- Marked as TM-view-only (add a `tm_only: true` flag — for now just visually distinguish it with a lock icon; enforcement comes later)
- Deal info values should be referenceable in the budget (e.g. guarantee auto-fills the budget income row for that show)
- Add a drag-drop area for the **deal memo file** (PDF/image) associated with this section — stored in Supabase storage

### AI deal memo reader
Add an **"Upload deal memo"** button in the Deal Info section. When a file is uploaded:
1. User selects document type from a dropdown: Deal Memo | Tech Rider | Flight Ticket | Hotel Confirmation | Other
2. Multiple files can be uploaded at once, but all must be the same type in one batch
3. Send the file(s) to an AI extraction endpoint (`/api/advance/extract-deal-memo`)
4. The endpoint uses the Anthropic API (Claude) to extract: guarantee, guest list, transport, backline, key contacts, show date, venue
5. Pre-fill the Deal Info fields with the extracted data, with a "Review extracted data" confirmation step before saving

---

## 27 · Profile editor

At the bottom of the sidebar where the user's name appears:
- Clicking the name/avatar should slide up a small popover with: **Log out** | **Edit profile**
- "Edit profile" opens a profile page/modal with fields: Display name | Profile picture (upload) | Email | Phone | Passport number (optional, stored encrypted) | Day rate | Per diem rate
- This profile data is also accessible from the Personnel area of the app
- Fix the current bug where the user's name is displayed in lowercase — capitalise it properly (title case or as-entered)
- Personnel added to tours can be directed to an "edit your profile" link to fill in their own details

---

## 28 · Calendar view fixes

- The calendar view must show **all shows across all tours**, colour-coded by tour
- Tour and artist **toggles** (already partially done — verify they work)
- Clicking a show opens an **info card** with: date, venue, city, tour name, links to Advance and Budget for that show
- The calendar must **not** redirect to the routing editor on click — fix this bug
- Festivals counted as show days (already done in routing — ensure calendar picks this up too)

---

## 29 · Sidebar profile area

When the user clicks their name at the bottom of the sidebar:
- A small panel slides up with: user avatar (initials fallback) | full name | Log out button | Edit profile link
- This is the entry point to the profile editor (§27)

---

## Implementation notes

Same as the **Implementation notes (reference for sections 1–29)** at the top of this document. Keep following them through section 29.
