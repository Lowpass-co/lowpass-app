# Lowpass — Cursor Build Prompts
# Work through these phases IN ORDER. Do not start Phase 2 until Phase 1 is pushed and building correctly.

---

## PHASE 1 — Navigation Architecture

### Context first — read this before writing a single line of code

This is Lowpass, a tour management tool for Tour Managers (TMs) in the live music industry. The logical hierarchy is: **Workspace → Artist → Tour → Show**. A TM always works within a specific tour. They think in shows: "the Manchester show", "the Omaha show". The primary daily use is advancing shows (gathering venue/hotel/logistics info) and managing the budget.

The current navigation is broken: artist and tour selection are buried in sidebar dropdowns, the first thing you see after login is a dashboard with a confusing arrow pointing at a tiny header dropdown, and clicking a tour sends you to the budget instead of your shows. This phase fixes the entire entry flow and transforms the sidebar into a show list — similar to how Daysheets (a day-sheet app) shows a chronological list of dates on the left with content on the right.

**Do NOT touch in this phase:** anything inside `src/app/api/`, anything inside `src/components/budget/`, anything inside `src/components/advance/` (except `AdvanceOverview.tsx` header breadcrumbs if needed), any personnel components, any Supabase queries that already exist. Layout/navigation ONLY.

---

### Step 1 — New API: `GET /api/tours/[id]/routing`

Create `src/app/api/tours/[id]/routing/route.ts`.

This is a lightweight endpoint — routing rows only, no advance data.

```
Auth pattern: createServerSupabaseClient → get user → if !user return 401
Workspace check: get profile.workspace_id from profiles table
Tour check: verify tours.id = tourId AND tours.workspace_id = profile.workspace_id, return 404 if not found
Query: SELECT id, date, day_type, city, venue_name FROM routing WHERE tour_id = tourId ORDER BY date ASC
Return: { routing: Array<{ id: string, date: string, day_type: string, city: string, venue_name: string | null }> }
Error: 500 with { error: message } on DB error
```

Follow the exact same auth/workspace pattern as every other API in this codebase — `createServerSupabaseClient`, workspace_id from profiles, workspace-scope the tour check. Keep it under 80 lines.

---

### Step 2 — Add routing data to `ArtistTourContext`

File: `src/contexts/ArtistTourContext.tsx`

Add to the context interface and implementation:
```typescript
tourRouting: Array<{ id: string; date: string; day_type: string; city: string; venue_name: string | null }>;
isRoutingLoading: boolean;
```

When `selectedTourId` changes to a non-null value: fetch `GET /api/tours/${selectedTourId}/routing`, store result in `tourRouting`. Use the same cancellable-fetch pattern already in this file (set a `cancelled = true` flag in cleanup, use `.finally()` to set loading false). When `selectedTourId` becomes null, set `tourRouting = []` and `isRoutingLoading = false`.

Do NOT change any other existing behaviour in this context — artist fetching, tour fetching, localStorage hydration, or `setSelectedArtistId`/`setSelectedTourId` functions.

---

### Step 3 — Create `TourRoutingList.tsx`

Create `src/components/layout/TourRoutingList.tsx`.

This is the show list that lives inside the sidebar. Props:
```typescript
{
  tourId: string;
  routing: Array<{ id: string; date: string; day_type: string; city: string; venue_name: string | null }>;
  mode: 'advance' | 'budget';
  collapsed: boolean; // sidebar collapsed state
}
```

**Each row is a Next.js `<Link>`** with these navigation rules:
- mode = 'advance' → href = `/tours/${tourId}/advance/${row.id}`
- mode = 'budget' → href = `/budget?tour_id=${tourId}` (budget is tour-level, all rows navigate to the same tour budget)

**Row visual (full sidebar, not collapsed):**
- Left: a 7px × 7px circle (not an icon) colored by day type:
  - `show` → `#FF4500`
  - `festival` → `#9B59B6`
  - `travel` → `#3498DB`
  - `day_off` or anything else → `var(--lp-sidebar-text-muted)`
  - day_type is a comma-separated string (e.g. "show,travel") — check if any segment matches
- Middle: short date string + city, two lines:
  - Line 1 (13px, semibold, `var(--lp-sidebar-text-heading)`): city name, truncated
  - Line 2 (11px, `var(--lp-sidebar-text-muted)`): date formatted as "11 Apr" — use `new Date(row.date + 'T12:00:00').toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })`
- Right: nothing
- Active state: when current pathname matches `/tours/${tourId}/advance/${row.id}` exactly
  - Active background: `var(--lp-sidebar-active-bg)`
  - Active date text: `#FF4500`
- Hover: `var(--lp-sidebar-hover-bg)` background
- Padding: `px-3 py-2`, rounded-md

**Collapsed sidebar (collapsed = true):**
Show only the day-type circle (centered, same colors). No text. Title attribute = `"${city} — ${date}"` for tooltip.

**Performance note:** This list can be 50–100 rows. Use a simple `<nav>` with overflow-y-auto. Do not virtualise — the list is small enough. Do not add filtering or search here; that belongs on the advance overview page.

---

### Step 4 — Rebuild `Sidebar.tsx`

The sidebar has two modes depending on whether `selectedTourId` is set. Read the existing sidebar carefully before changing it — preserve the collapse toggle, the user footer, and the Data/Equipment/Admin nav groups exactly as they are.

**MODE A — No tour selected:**
Identical to current sidebar structure. Keep Artist Overview links (Dashboard, All Tours, Advances, Performance). In the Tour Management section, show a `SidebarTourPicker` dropdown (keep existing component) + the existing tour management nav links. No changes to this mode.

**MODE B — Tour is selected (`selectedTourId` is not null):**

Replace the "Tour Management" section content with the following layout, in order:

```
[Artist name / Tour name]  ← 11px muted text breadcrumb, single line, truncated
                              e.g. "Good Neighbours / Spring Tour 2026"
[Change tour]              ← 10px orange link, calls setSelectedTourId(null) and navigates to /dashboard

[Advance] [Budget]         ← segmented toggle (see spec below)

[TourRoutingList]          ← scrollable, takes remaining height
```

**Advance/Budget segmented toggle spec:**
- Two adjacent pill buttons, full width, `gap-1`
- Active pill: background `#FF4500`, text white, font-semibold
- Inactive pill: background `var(--lp-sidebar-hover-bg)`, text `var(--lp-sidebar-text-muted)`
- Mode persists to `localStorage` key `lp-sidebar-mode`, default `'advance'`
- Store mode in component state, initialised from localStorage on mount
- In collapsed sidebar: show two icon-only buttons — `ClipboardList` icon for Advance, `Wallet` icon for Budget (same color rules)

**The show list takes the remaining vertical space** between the toggle and the Data section at the bottom. Use `flex-1 overflow-y-auto min-h-0` on its container.

**Keep the Data / Equipment / Admin groups** at the bottom of the sidebar, below the show list, exactly as they currently exist. Do not remove any of those links.

**Artist Overview links** (Dashboard, All Tours, Advances, Performance) stay at the top in both modes.

---

### Step 5 — Rebuild `DashboardArtistGate.tsx` as a proper entry flow

File: `src/components/dashboard/DashboardArtistGate.tsx`

The gate now handles three states:

**State 1 — No artist selected (`!selectedArtistId`):**
Show an artist picker page directly in the main content area. Not an arrow pointing at a header dropdown. A real UI:
- Heading: "Choose an artist to get started" (24px, bold)
- A responsive grid of artist cards (`grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4`)
- Each card (`<button>` with onClick):
  - Square image (artist.spotify_image_url if available, else a `div` with initial letter and gradient background `from-lp-bg-secondary to-lp-bg-tertiary`)
  - Artist name below the image, centered, 13px semibold
  - On click: call `setSelectedArtistId(artist.id)` — do NOT navigate; the gate will re-render into State 2
  - Hover: subtle scale(1.02) transform, ring-1 ring-lp-orange
- "Add new artist" card at the end of the grid (dashed border, `+` icon, links to `/artists/new`)
- While `!hydrated` or while artists are loading: show 6 skeleton cards (same grid, `animate-pulse` gray rectangles)

**State 2 — Artist selected, no tour (`selectedArtistId && !selectedTourId`):**
Show a tour picker:
- Back button (`←`) top-left that calls `setSelectedArtistId(null)`
- Artist name as heading
- List (not grid) of tours for this artist, from `ArtistTourContext.tours` (already filtered by artist_id in the context)
- Each tour row (`<button>`): tour name (bold) + date range ("Jan 2026 – Apr 2026") + status badge
  - Status badge colors: planning=amber, active=green, completed=gray, cancelled=red
  - On click: call `setSelectedTourId(tour.id)` AND navigate to `/tours/${tour.id}/advance` using `useRouter().push()`
- "New tour" button linking to `/tours/create`
- Empty state if no tours: "No tours yet for this artist. Create one."
- Show at most 20 tours (they're already filtered by artist and there won't be many)

**State 3 — Both selected:** Render `{children}` as currently.

Keep the loading skeleton for `!hydrated`. Remove the SVG arrow entirely.

---

### Step 6 — Simplify `HeaderArtistTourPicker.tsx`

The header should show current context as a readable breadcrumb, not a dropdown when a tour is active.

**When `selectedArtistId && selectedTourId`:**
Display: `[32px artist image] [Artist Name] / [Tour Name]`
- Artist image: spotify_image_url or initial, 32px, rounded-md
- Text: "Artist Name / Tour Name", 14px, semibold, `var(--lp-text)`
- Clicking the artist name: opens a small inline dropdown to change artist (can reuse `StyledSelect` or a simple popover)
- Clicking the tour name: opens a small inline dropdown to change tour (same pattern)
- When changing artist: call `setSelectedArtistId`, clear tour, navigate to `/dashboard`
- When changing tour: call `setSelectedTourId`, navigate to `/tours/${newTourId}/advance`

**When `selectedArtistId && !selectedTourId`:** Show artist image + name + "/ Choose tour →" (orange text, clicking navigates to `/dashboard`)

**When `!selectedArtistId`:** Show "Choose artist →" in orange, clicking navigates to `/dashboard`. Remove the old `StyledSelect` dropdown from the header — selection now happens on the dashboard page.

Remove the "New artist" button from the header (it clutters the header; it belongs on the artists management page).

---

### Step 7 — Update `SidebarTourPicker.tsx` redirect

The `redirectAfterTourSwitch` function currently sends users to `/budget?tour_id=X`. Change it so that when switching tours, the redirect goes to `/tours/${newTourId}/advance`. This ensures clicking a tour always lands on the show list, not the budget.

---

### Phase 1 — What NOT to do
- Do not create any new pages (no `/select` route, no `/onboarding` route)
- Do not change any API routes
- Do not add animations beyond simple CSS transitions already in the codebase
- Do not add any new npm packages
- Do not change the collapse/expand toggle behaviour
- Do not touch the user footer (avatar, name, account menu) at the bottom of the sidebar
- Do not change Rooming or Payroll links (leave them in the nav for now — those pages exist and are used)
- Run `npx tsc --noEmit --skipLibCheck` before committing. Fix all TypeScript errors. Do not suppress with `// @ts-ignore`

---

## PHASE 2 — Show Advance Read View

### Context

The advance read view (`src/components/advance/AdvanceShowReadView.tsx`) already exists and renders all advance section data. The problems: (1) the most important info (hotel, key contacts) requires scrolling to find, (2) it's visually dense, (3) there's no print/export, (4) it shows settlement data which belongs only in the budget.

The TM opens this page on show day to find: where is the hotel, who do I call at the venue, what's the load-in time. They should not need to scroll to get those answers.

**Do NOT change:** `AdvanceSectionBuilder.tsx`, `AdvanceSectionBuilderDynamic.tsx`, `AdvanceSectionBuilder`'s data entry form, any API routes, the `AdvanceOverview.tsx` (tour-wide advance list), or any budget/settlement components.

---

### Step 1 — Sticky header redesign

The sticky header at the top of `AdvanceShowReadView.tsx` currently shows date, day type, venue name, city. Keep all of that. Add:
- A "Print" button (top right, icon + label) — `window.print()` is sufficient for MVP
- An "Edit advance" button (already exists — keep it, just ensure it's in the header)
- Remove any settlement-specific fields or links from this header
- Height should be compact — one row only

---

### Step 2 — Key Info block (new, insert at top of content)

Directly below the sticky header, before any section cards, insert a "Key Info" block that surfaces the most critical advance data without requiring the user to scroll through sections.

Extract this data from the existing `advanceData` (the JSONB field data already loaded by the component). The Key Info block shows:

**Hotel (from whichever advance section has `template_id` matching a section labelled "Hotel" or "Accommodation"):**
- Hotel name (look for a field with label containing "hotel name" or "property name", case-insensitive)
- Address (field label containing "address")
- Check-in / check-out (fields containing "check in" / "check out")
- Notes (field containing "notes" or "parking")

**Key contacts (from any section):**
- Promoter contact (field type = `contact` where the contact's `role` field contains "promoter", case-insensitive)
- Venue contact (field type = `contact` where role contains "venue" or "production")
- Tour Manager if present

**Rules for this extraction:**
- Do this client-side in the component — do not add a new API call
- The advance data structure is `data[section_template_id][field_id] = value`
- Match section labels and field labels with `.toLowerCase().includes()` — loose matching is fine, this is display-only
- If a field value is empty/null/blank, skip it — do not show empty rows
- If no hotel data found: do not render the hotel sub-block (do not show an empty card)
- If no key contacts found: do not render the contacts sub-block
- If neither found: skip the Key Info block entirely (fall straight into section cards)

**Visual:**
- Two-column layout on desktop, single column on mobile
- Left column: Hotel card (light background `var(--lp-surface)`, rounded-lg, padding 16px)
- Right column: Key Contacts (same card style, one card per contact person)
- Each contact: person name (bold), role (small muted), phone (with `tel:` link), email (with `mailto:` link)
- This block has a label "Key Info" in small caps above it (`var(--lp-text-tertiary)`, 10px)

---

### Step 3 — Section cards visual cleanup

The existing section cards render all fields. Make the following changes:
- Remove any section whose label contains "settlement", "Settlement", or whose fields are all currency/financial types and the section label doesn't relate to production/tech. (Settlement data belongs in the budget only.)
- For each section card, the header should show: section label (left) + a simple status badge (right): "Complete", "In Progress", or "Not started" based on `section.status`. Colors: Complete = green dot, In Progress = amber dot, Not started = `var(--lp-text-tertiary)` dot.
- The "Edit" link on each section card should link to: `/tours/${tourId}/advance/${routingId}?mode=edit` (this already exists, just verify it's present on every card)
- Fields with empty values remain hidden (this should already be the case — verify and keep)

---

### Step 4 — Print styles

Add a `<style>` block at the top of `AdvanceShowReadView.tsx` (or in a `<style jsx global>` if preferred) with `@media print` rules:
```css
@media print {
  /* Hide sidebar, header, edit buttons, print button */
  aside, header, nav, button { display: none !important; }
  /* Reset margins for print */
  body { margin: 0; }
  /* Show all content, expand everything */
  .advance-read-view { padding: 0; }
}
```
Give the root div of `AdvanceShowReadView` a className `advance-read-view`.

---

### Phase 2 — What NOT to do
- Do not change the edit mode (`AdvanceSectionBuilder`)
- Do not add a PDF generation library — `window.print()` is enough for now
- Do not add new API calls — all extraction is from already-loaded data
- Do not change the routing/page structure
- Do not change the advance overview page (`/tours/[id]/advance`)
- Run `npx tsc --noEmit --skipLibCheck` before committing

---

## PHASE 3 — Budget Fixes & Settlement Cleanup

### Context

There are four specific bugs to fix and one structural cleanup. Do them all in one commit.

**Do NOT change:** API routes (except where specifically instructed), advance components, navigation components from Phase 1.

---

### Fix 1 — Hotel room rate is read-only (BUG)

File: `src/components/spreadsheet-view/HotelsGrid.tsx`

In the expanded room assignments table, `rate_per_night` is rendered as a `<SpreadsheetCurrencyAmount>` (read-only display). It must be editable.

Replace the `<SpreadsheetCurrencyAmount amount={a.rate_per_night} currency={currency} />` cell with an `<InlineEditCell>` configured as:
```typescript
<InlineEditCell
  value={a.rate_per_night}
  type="currency"
  currency={currency}
  onSave={async (v) => {
    const rate = typeof v === 'number' ? v : parseFloat(String(v));
    if (isNaN(rate)) return;
    await fetch('/api/budget/hotels/assignments', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: a.id, rate_per_night: rate }),
    });
    // Update local state: find the hotel, find the assignment, update rate_per_night
    setHotels(prev => prev.map(h =>
      h.id === hotelId
        ? { ...h, room_assignments: h.room_assignments.map(ra => ra.id === a.id ? { ...ra, rate_per_night: rate } : ra) }
        : h
    ));
  }}
/>
```
The `hotel_booking_id` / `hotelId` is in scope from the outer `.map((h) => ...)`. Check the existing PATCH handler at `src/app/api/budget/hotels/assignments/route.ts` — it already supports updating `rate_per_night` via PATCH with `{ id, rate_per_night }`. No API changes needed.

---

### Fix 2 — Settlement inputs have no currency indicator (BUG)

File: `src/components/budget/SettlementTab.tsx`

Every `<input type="number">` in the settlement form (day_of_guarantee, day_of_overage, day_of_merch, day_of_deductions, reconciled_guarantee, etc.) currently has no currency indicator. The TM does not know if they're entering GBP or USD.

Wrap each such input in a relative-positioned container and add a currency label:
```html
<div class="relative">
  <span class="absolute left-3 top-1/2 -translate-y-1/2 text-xs text-lp-text-tertiary pointer-events-none font-mono">
    {cc}
  </span>
  <input ... class="... pl-10" />   ← add pl-10 (or pl-12 if cc is 4 chars) to existing className
</div>
```
Use the existing `cc` variable which is already computed as the uppercased tour currency. Apply this to every settlement number input field. Do not change the label text, the onChange handlers, or the form save logic.

---

### Fix 3 — Settlement document upload storage error (BUG)

File: `src/app/api/budget/settlement/upload/route.ts`

The bucket name is `budget-receipts`. This bucket now exists (the user has created it in Supabase). However verify the upload path and error handling:
- If `uploadError.message?.includes('Bucket not found')`, return a clear 503 with `{ error: 'Storage bucket "budget-receipts" not found in Supabase. Create it in the Supabase dashboard.' }` — same friendly error pattern as the personnel files bucket.
- Do NOT change any other logic in this file.

---

### Fix 4 — TransportationTab TypeScript errors

File: `src/components/budget/TransportationTab.tsx`

There are two TypeScript errors at lines ~388 and ~396:
```
Argument of type '(r: Partial<LineItem> | null) => { proposed_cost: number | null; ... }'
is not assignable to parameter of type 'SetStateAction<Partial<LineItem> | null>'
```

Fix by explicitly typing the state updater callback. Change the `setState(r => ...)` calls to use a properly-typed function:
```typescript
setState((prev: Partial<LineItem> | null) => prev ? { ...prev, proposed_cost: val } : null)
```
Do not change the component logic, just fix the type annotations.

---

### Fix 5 — Remove Rooming from Tour Summary

File: `src/app/(app)/tours/[id]/overview/page.tsx` (and any overview client component that renders a rooming section)

The user never uses the rooming summary on the tour overview page. Find the rooming section/card and remove it entirely. If there is a rooming tab or link in the tour overview, remove it. Do not touch the `/tours/[id]/rooming` page itself — just its presence on the overview page.

---

### Phase 3 — What NOT to do
- Do not refactor the settlement tab into a new component
- Do not move settlement out of the budget tabs — it stays in the budget, just cleaner
- Do not change any Supabase schema
- Do not touch the advance components
- Run `npx tsc --noEmit --skipLibCheck` before committing. All four TypeScript errors (including the two in Transportation) must be gone.

---

## PHASE 4 — Loading States & Visual Polish

### Context

Two problems: (1) Every section reflows layout when data loads — the page "jumps" as content appears. (2) The visual density is high — too many things competing for attention. This phase adds skeletons and tightens the visual language.

**Do this phase last.** The navigation (Phase 1) and advance view (Phase 2) must be working first, because skeleton shapes need to match the real content.

**Do NOT change:** Any API routes, any data logic, any Supabase queries, any form logic.

---

### Step 1 — Skeleton pattern

Create `src/components/ui/Skeleton.tsx`:
```typescript
export function Skeleton({ className }: { className?: string }) {
  return (
    <div
      className={cn('animate-pulse rounded-md bg-lp-surface', className)}
    />
  );
}
```
Use `cn` from `@/lib/utils`. This is the only skeleton primitive — use it everywhere.

---

### Step 2 — Sidebar routing list skeleton

In `TourRoutingList.tsx` (created in Phase 1):
When `tourRouting` is empty and `isRoutingLoading` is true, render 8 skeleton rows instead of the empty list:
```
[7px circle skeleton] [two-line text skeleton: 80px wide + 50px wide]
```
This prevents the sidebar from collapsing to zero height while routing loads.

---

### Step 3 — Advance read view skeleton

In `AdvanceShowReadView.tsx`:
While the advance data is loading (add a `loading` state, true until the fetch resolves):
- Show skeleton blocks in place of the Key Info block (two cards, approx 120px tall each)
- Show skeleton blocks for 3 section cards (each ~80px tall, full width)
- Keep the sticky header visible with real data (tour/date already available from page props)

Use `Skeleton` component. Shapes must closely match the real content dimensions — a skeleton that looks nothing like the content makes the reflow feel worse, not better.

---

### Step 4 — Budget accordion skeleton

In `TourBudgetAccordion.tsx`:
The P&L header bar currently loads after data arrives. Provide a skeleton for the P&L bar while `summary` is loading:
- Three skeleton blocks side-by-side: `h-12 flex-1` each, `rounded-xl`

For each accordion section row: when the section is loading its detail data (expanded but not yet loaded), show a skeleton table with 3 rows instead of a spinner. Same height as typical content.

---

### Step 5 — Visual density reduction

Make the following targeted adjustments across the app:

**Typography hierarchy (apply globally via `src/app/globals.css`):**
- Page headings (`<h1>` within main content, not sidebar): 22px, weight 700
- Section headings (`<h2>`, section card titles): 15px, weight 600
- Body text: 14px, weight 400
- Metadata / secondary labels: 12px, weight 400, `var(--lp-text-secondary)`
- All-caps labels (like "ADVANCE", "BUDGET" toggle): 11px, weight 700, letter-spacing 0.1em
These override the current values — check `globals.css` for existing `h1`/`h2` rules and update, don't add duplicates.

**Spacing:**
- `main` padding in `AppShell.tsx` is currently `px-6 py-6`. Change to `px-8 py-6` (slightly more horizontal breathing room).
- Cards and panels: ensure consistent `p-5` internal padding (not p-4 in some and p-6 in others). Audit the advance section cards and budget accordion cards and standardise.

**Color:**
- `#FF4500` orange stays as the sole accent color. Do not add new accent colors.
- Status indicators only: green = `#22C55E`, amber = `#F59E0B`, red = `#EF4444` (only for status badges, not for UI chrome)
- All borders use `var(--lp-border)`. Do not hardcode border colors anywhere.

**Remove visual noise:**
- In the sidebar: remove the custom LP logo SVG path that replaces icons for active nav items. Replace with a simple orange background + white icon for active state — the custom SVG path is inconsistent and confusing.
- In the advance section cards: if a section has zero fields with values, do not render the card at all (already partially implemented — verify and enforce).

---

### Step 6 — Load time: ArtistTourContext pre-fetch

Currently `ArtistTourContext` fetches artists, then when an artist is selected fetches tours, then when a tour is selected fetches routing. These happen in sequence. On a slow connection this means 3 sequential round trips before the sidebar shows content.

Optimise: when artists load and there is a `selectedArtistId` from localStorage, immediately fire the tours fetch and routing fetch in parallel — don't wait for the user to "re-select" the artist. The data is coming from localStorage on hydration, so we know the artist and tour IDs immediately. Adjust the `useEffect` dependencies so that if `hydrated` becomes true and `selectedArtistId` is already set, the tours fetch fires immediately (it may already do this — verify). Same for routing: if `hydrated && selectedTourId`, fire the routing fetch immediately on mount.

---

### Phase 4 — What NOT to do
- Do not install `framer-motion` or any animation library
- Do not change page layouts substantially — this is polish, not restructure
- Do not add loading spinners where skeletons are specified
- Do not change any business logic
- Do not change the dark mode toggle or theme system
- Run `npx tsc --noEmit --skipLibCheck` before committing
