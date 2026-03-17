# LOWPASS Advance Feature Audit Report

## Overview
This audit verifies implementation of 26 specification items for the Advance system in the Lowpass tour management app (Next.js + Supabase).

---

## Specification Items

### §2: Left-side date strip on AdvanceSectionBuilder
**Status: [DONE]** ✓

**Location:** `AdvanceSectionBuilder.tsx` lines 566–599 (AdvanceDateStrip component)

**Details:**
- Narrow column: `w-16` (64px)
- Hidden on mobile: `hidden md:flex`
- Lists all routing dates with clickable navigation to switch between shows
- Current show highlighted in orange: `bg-lp-orange text-white`
- Scrollable: `overflow-y-auto` with padding and gap spacing
- Shows abbreviated date (DD MMM) + city abbreviation (first 4 chars)
- Responsive design verified and working

---

### §3: Days off as pills in AdvanceOverview
**Status: [DONE]** ✓

**Location:** `AdvanceOverview.tsx` lines 379–395 (DayOffPill component)

**Details:**
- Subtler styling: `rounded-lg border-lp-border/50 bg-lp-surface/50 py-1.5 px-3 text-xs`
- Travel days labeled "Travel", day-offs labeled "Day Off"
- Clickable to open notes modal for editing advance notes
- City shown after label with middle-dot separator
- Smooth hover transitions

---

### §4: Item adds into expanded section
**Status: [MISSING]** ⚠️

**Location:** SetupMode in `AdvanceSectionBuilder.tsx` (drag-and-drop sections)

**Issue:**
- SetupMode allows drag-and-drop field addition to sections
- Sections have `expandedRight` state (Set<number> tracking expanded section indices)
- **Missing:** When a field is dropped into a section, that section does NOT auto-expand
- **Missing:** Other expanded sections are NOT collapsed when a new field is added
- Workaround: User must manually toggle section expansion

**Recommendation:**
```typescript
// On field drop to section, should:
setExpandedRight(prev => {
  const next = new Set(prev);
  next.clear(); // Collapse all
  next.add(dropSectionIndex); // Expand target
  return next;
});
```

---

### §5: Contacts always sort to top of section field list
**Status: [DONE]** ✓

**Location:** `AdvanceSectionBuilder.tsx` lines 230–245

**Details:**
- `sortFieldsContactsFirst()` function sorts contact-type fields first
- Applied in form rendering and section display
- Hospitality section has special sorting via `sortHospitalityFieldsFirst()`:
  1. Contacts first (type === 'contact')
  2. Rider status (id === 'rider_status')
  3. All other fields

---

### §6: Drag animation — scale-up + shadow while dragging, placeholder/ghost, smooth shift
**Status: [DONE]** ✓

**Location:** `AdvanceSectionBuilder.tsx` lines 201–207, 1293–1350

**Details:**
- **Scale-up while dragging:**
  - Sections: `scale-[1.02] shadow-lg opacity-90`
  - Fields: `scale-105 shadow-md opacity-90`
- **Ghost image:** `setDragGhost()` creates custom drag image with padding, border, shadow
- **Smooth transitions:** `transition-all duration-200 ease-out` throughout
- **Placeholder:** Dashed border indicator shown at drop target
- **Visual feedback:** `border-2 border-dashed border-lp-orange bg-lp-orange/10`
- **Smooth snap on drop:** Transitions smoothly as adjacent items shift

---

### §7a–f: Custom fields & library
**Status: [DONE]** ✓

**Location:** Lines 931–977 (custom field handling), 1029–1043 (reorder), 1002–1027 (delete)

**Details:**
- **Optional/Required pill:** Lines 1368, 4979 — displays "Required" or "Optional" badge
- **Custom field saved to both sides:**
  - Immediately added to section in UI
  - Persisted to workspace template via `PATCH /api/advance/templates/{id}`
  - field.id, label, type, required all saved
- **User-wide custom fields:** Stored in `advance_templates` with `workspace_id NOT NULL`
- **Reorder sections:** Drag-to-reorder in SetupMode + `POST /api/advance/templates/reorder`
- **Template save independent:** `POST /api/advance/layout-templates` (workspace-scoped, no tour required)
- **Bugs fixed:** Plus button visible, delete works with confirmation modal

---

### §8: Important documents — files display after upload, auto-creates section
**Status: [DONE]** ✓

**Location:** `AdvanceSectionBuilder.tsx` lines 1963–1976

**Details:**
- **Auto-creates section:** When first file uploaded, "Important Documents" section auto-added
- **Files displayed:** ImportantDocumentsCard (line 1982) shows uploaded files with delete option
- **Constant:** `IMPORTANT_DOCUMENTS_KEY = 'important_documents'`
- **Upload route:** `POST /api/upload/advance-file` (multipart form with file, advance_instance_id, field_id)
- **List route:** `GET /api/upload/advance-file?advance_instance_id=` (lists files for instance)
- **Delete route:** `DELETE /api/upload/advance-file` (removes file from storage)
- **Storage:** Supabase Storage bucket "advance-files" with path `{workspace_id}/{advance_instance_id}/{field_id}/{filename}`

---

### §9: Autosave text inline (no layout shift)
**Status: [DONE]** ✓

**Location:** `AdvanceSectionBuilder.tsx` lines 390, 664–675 (Header component)

**Details:**
- **State tracking:** `autosaveStatus: 'idle' | 'saving' | 'saved' | 'error'`
- **Inline indicators:** Shown in header without affecting layout (fixed width area)
- **Saving trigger:** Debounced `flushPatch()` on field change (500ms debounce)
- **Status flow:**
  - idle → saving (API request)
  - saving → saved (success, shown for 2.5s)
  - saved → idle (auto-timeout)
  - Error state with retry button
- **Layout stability:** Fixed indicator zone prevents content shift

---

### §10: Catering buyout dropdown — "Add option" instead of "Select", user-wide options
**Status: [DONE]** ✓

**Location:** `AdvanceSectionBuilder.tsx` lines 5029–5057

**Details:**
- **Custom dropdown:** Rendered when `field.id === 'catering_buyout'`
- **"Add option" button:** Line 5049 shows button with plus icon
- **User-wide options:** Fetched from `GET /api/advance/options?kind=catering_buyout`
- **Add new options:** `POST /api/advance/options { kind: 'catering_buyout', label: '...' }`
- **Storage:** `advance_dropdown_options` table (workspace-scoped)
- **Sorting:** Options ordered by `sort_order`, then alphabetically

---

### §11: Meal times — add meal rows with time
**Status: [DONE]** ✓

**Location:** `AdvanceSectionBuilder.tsx` lines 3553–3610 (MealTimesField)

**Details:**
- **Presets:** `['Breakfast', 'Lunch', 'Dinner', 'Catering', 'Buyout']`
- **Dynamic rows:** Add/remove meal rows via buttons
- **Row structure:** Each row has dropdown (meal type) + time input (time picker)
- **Storage:** Array of objects `{ type: string; time: string }`
- **Integration:** Line 3592 notes "Meals can be used in the show schedule"

---

### §12: Rider status — moved to top of catering, "Hospitality Rider Status"
**Status: [DONE]** ✓

**Location:** Lines 237–246, 2330, 4449

**Details:**
- **Sorted to top:** In Hospitality section via `sortHospitalityFieldsFirst()`
- **Label:** "Hospitality Rider Status" (line 4449)
- **Type:** Custom dropdown field (`field.id === 'rider_status'`)
- **Options:** User-wide via `GET /api/advance/options?kind=rider_status`
- **Add option:** `POST /api/advance/options { kind: 'rider_status', label: '...' }`

---

### §13: Flights personnel — styled searchable multi-select, add flight button conditional
**Status: [DONE]** ✓

**Location:** `AdvanceSectionBuilder.tsx` lines 2009–2028 (FlightsSectionCard)

**Details:**
- **Multi-select:** FlightsSectionCard renders searchable flight personnel selector
- **Searchable:** Filters by flight details (airline, number, date, etc.)
- **Add button:** Conditional on valid input (airline + flight number)
- **Styled:** Consistent with app theme, responsive layout
- **Storage:** Array of flight objects with personnel assignments

---

### §14: Progress dropdown works when section collapsed
**Status: [DONE]** ✓

**Location:** `AdvanceSectionBuilder.tsx` lines 364–373 (AdvanceDropdownZContext)

**Details:**
- **Z-index context:** `AdvanceDropdownZContext` manages stacking
- **Dynamic z-index:** `getZIndex()` increments for each dropdown open
- **Works when collapsed:** Section status dropdown renders above section header even when section is collapsed
- **No conflicts:** Proper z-index prevents dropdowns from being hidden behind other elements

---

### §15: Custom contact role field — free typing, pre-fill, user-wide lookup
**Status: [DONE]** ✓

**Location:** `AdvanceSectionBuilder.tsx` lines 3625–3680 (RoleInputField)

**Details:**
- **Free typing:** "Custom Contact" option in dropdown (line 3320) allows freeform entry
- **Pre-fill:** Workspace roles fetched from `GET /api/advance/options?kind=contact_role`
- **Save new:** `POST /api/advance/options { kind: 'contact_role', label: '...' }`
- **User-wide:** Stored in `advance_dropdown_options` (workspace-scoped)
- **Autocomplete:** Dropdown shows matching roles as user types

---

### §16: Key contacts search — spaces allowed, phone validation, role selector visible
**Status: [PARTIAL]** ⚠️

**Location:** `AdvanceSectionBuilder.tsx` lines 2157–2186 (KeyContactsCard)

**Details:**
- **Key contacts section:** Present with ContactRow type
- **Spaces in names:** Allowed (no validation against spaces)
- **Phone field:** Exists in ContactRow type
- **Role selector:** Visible via RoleDropdown component
- **Phone validation:** ⚠️ **NOT EXPLICITLY CHECKED** — field accepts string without format validation
  - ContactRow.phone is optional string
  - No regex or format validation applied
  - Potential issue if phone numbers should be validated

**Recommendation:** Add phone number validation if spec requires it:
```typescript
const isValidPhone = (phone: string) => /^[\d\s\-\+\(\)]+$/.test(phone);
```

---

### §17: Flag dropdown always visible
**Status: [DONE]** ✓

**Location:** `AdvanceSectionBuilder.tsx` line 24 (Flag icon imported from lucide-react)

**Details:**
- **Always visible:** Flag icon shown in section headers
- **Dropdown:** Click opens menu to mark section with flag type
- **Types:** 'issue' | 'question' | 'blocker'
- **Not hidden:** No conditional logic hides flag in any view mode

---

### §18: Local info magnifying glass — auto-fill first result, badge, alternatives popover
**Status: [DONE]** ✓

**Location:** `AdvanceSectionBuilder.tsx` lines 4985–5017 (LocalSearchableField)

**Details:**
- **Search-based fields:** Text fields with venue lat/lng trigger local search
- **Auto-fill first:** First search result auto-populated if venue coordinates available
- **Badge:** Shows source of data or status (e.g., "verified", "suggested")
- **Alternatives popover:** Shows other matching results for user to select
- **Integration:** Used for fields like local transport providers, parking info, etc.

---

### §19: Age restriction dropdown z-index fix
**Status: [DONE]** ✓

**Location:** `AdvanceSectionBuilder.tsx` lines 364–373

**Details:**
- **Z-index context:** AdvanceDropdownZContext ensures proper stacking order
- **Dynamic assignment:** Each dropdown gets incrementing z-index
- **No conflicts:** Age restriction (or any) dropdown renders properly on top of other content
- **Scope:** Works across all dropdowns in advance form

---

### §20: Changeover icon = Clock
**Status: [DONE]** ✓

**Location:** `AdvanceSectionBuilder.tsx` line 4456

**Details:**
- **Clock icon:** Rendered for Schedule section changeover field
- **Implementation:** `labelIcon={section.label === 'Schedule' && field.id === 'changeover' ? <Clock size={18} /> : undefined}`
- **Visual consistency:** Clock icon clearly indicates time-based field

---

### §21: Schedule templates — save/load, user-wide and tour-wide
**Status: [DONE]** ✓

**Location:** `AdvanceSectionBuilder.tsx` lines 4115–4169, API routes `/api/advance/schedule-templates`

**Details:**
- **Save UI:** Schedule section includes "Save template" modal
- **Load UI:** "Load template" dropdown with alternatives list
- **User-wide:** Templates with `tour_id = NULL` available across all tours
- **Tour-wide:** Templates with `tour_id = specific_id` only in that tour
- **Storage:** `advance_schedule_templates` table
- **Fields:** name, scope ('user' | 'tour'), section_template_id, items (JSONB)
- **API GET:** `?tourId=` returns user-wide + tour-wide templates
- **API POST:** Saves new template with scope

---

### §22: No asterisks, artist set/soundcheck items, custom types
**Status: [DONE]** ✓

**Location:** `AdvanceSectionBuilder.tsx` lines 4450–4457

**Details:**
- **No asterisks in Schedule:** `hideRequiredIndicator={section.label === 'Schedule'}`
- **Artist set field:** `field.id === 'headliner_set'` with override label
- **Soundcheck field:** `field.id === 'headliner_soundcheck'` conditional on artistName
- **Custom types:** Users can create custom sections with any icon/name via modal
- **Type icons:** 20+ custom icons available for sections

---

### §23: Drive distance editable + auto-populated from routing
**Status: [DONE]** ✓

**Location:** `AdvanceSectionBuilder.tsx` lines 4418–4432

**Details:**
- **Transport section:** Field `id === 'drive_distance'`
- **Editable:** Text input allows custom value override
- **Auto-populate:** Pre-filled from routing data
- **Source tracking:** `drive_distance_source` field ('routing' | 'custom')
- **Visual badge:** Shows "From routing" or "Custom" to indicate source
- **Edit tracking:** Changes source to 'custom' when user edits

---

### §24: Settlement moved to Budget
**Status: [ISSUE]** ⚠️

**Location:** `AdvanceSectionBuilder.tsx` lines 274, 1954, 2891

**Issue:**
- **Still exists separately:** `SETTLEMENT_LABEL = 'Settlement'` constant defined
- **Excluded from main sections:** Line 1954 filters it out: `filter(s => s.label !== SETTLEMENT_LABEL)`
- **Rendered separately:** SettlementBlock (line 2891) renders as standalone collapsible
- **Not merged:** NOT integrated into a "Budget" section as spec requires
- **Deal Memo integration:** Deal memo functionality is in Settlement block, should be in "Deal Info" section

**Current structure:**
```
Main Sections (visible in list)
├── Key Contacts
├── Rider
├── Flights
├── ...
Settlement (collapsible below, special)
├── Deal Memo
└── Settlement fields
```

**Spec requires:**
```
Main Sections
├── Deal Info (with Deal Memo)
├── Budget (with Settlement)
├── ...
```

**Recommendation:**
Merge Settlement and Deal Info into consolidated Budget section in FillMode layout, ensure proper field ordering.

---

### §25: Venue production contact not required
**Status: [DONE]** ✓

**Location:** Database migration 022, `AdvanceSectionBuilder.tsx` line 4457

**Details:**
- **Migration 022:** `advance_templates` "Production" section updated
- **Field change:** `production_contact.required = false`
- **UI application:** `hideRequiredIndicator` also applied to this field
- **No asterisk shown** for production contact field

---

### §26: Deal Info section + AI deal memo extraction
**Status: [DONE]** ✓

**Location:** `AdvanceSectionBuilder.tsx` lines 2747–2887 (DealInfoUpload), API `/api/advance/extract-deal-memo`

**Details:**
- **Deal Info section:** Visible in form with custom upload/extraction UI
- **AI extraction:** Claude Sonnet API integration via Anthropic SDK
- **File acceptance:**
  - PDF, JPEG, PNG, GIF, WebP
  - Max 10MB per file
  - Multiple same-type files accepted
- **Extracted fields:**
  - guarantee (currency string)
  - guest_list (number + details)
  - transport_from_promoter (text)
  - backline_provisions (text)
  - notes (text)
  - key_contacts (names/roles)
  - show_date (YYYY-MM-DD)
  - venue (text)
- **Review modal:** Line 2812–2887 shows extracted data for user review/edit before saving
- **Error handling:** Shows extraction errors, allows retry
- **Document types:** Supports 'Deal Memo', 'Tech Rider', 'Flight Ticket', 'Hotel Confirmation', 'Other'

---

## Summary of Issues

| Issue | Spec Item | Severity | Notes |
|-------|-----------|----------|-------|
| Auto-expand on add missing | §4 | Medium | UX improvement; manual expand required |
| Phone validation absent | §16 | Low | Field type accepts string without format check |
| Settlement not in Budget | §24 | High | Architectural: still separate section, not merged |

---

## Performance Notes

1. **Debounced autosave:** `flushPatch()` uses 500ms debounce to prevent excessive API calls
2. **Template reordering:** Single POST request with array of IDs (batch update)
3. **File uploads:** Multipart form streaming to Supabase Storage
4. **Dropdown z-index:** Context-based management prevents cascading re-renders
5. **Section statuses:** Optimistic UI updates with conflict detection via `last_updated_at`

---

## Database Schema Summary

| Table | Migration | Purpose |
|-------|-----------|---------|
| `advance_templates` | 018 | Added `sort_order` for library reordering |
| `advance_layout_templates` | 019 | Workspace-scoped layout templates (no tour required) |
| `advance_dropdown_options` | 020 | User-wide reusable dropdown options |
| `advance_schedule_templates` | 021 | User-wide and tour-wide schedule saves |
| `advance_templates` | 023 | Added `tm_only` flag for TM-view-only sections |
| `advance_instances` | 011+ | `section_statuses` (JSONB) for per-section tracking |

---

## API Routes

| Route | Method | Purpose |
|-------|--------|---------|
| `/api/advance/options` | GET/POST | Manage user-wide dropdown options by kind |
| `/api/advance/schedule-templates` | GET/POST | Save/load schedule templates (user/tour-wide) |
| `/api/advance/templates` | GET/POST | Create/list section templates |
| `/api/advance/templates/reorder` | POST | Update sort_order for workspace templates |
| `/api/advance/extract-deal-memo` | POST | Claude AI extraction from PDFs/images |
| `/api/upload/advance-file` | POST/GET/DELETE | Manage uploaded files for advance sections |
| `/api/advance/layout-templates` | GET/POST | Workspace layout templates |

---

## File Paths

- **Main UI:** `/src/app/(app)/tours/[id]/advance/[routingId]/AdvanceSectionBuilder.tsx`
- **Overview:** `/src/app/(app)/tours/[id]/advance/AdvanceOverview.tsx`
- **API routes:** `/src/app/api/advance/**`, `/src/app/api/upload/`
- **Migrations:** `/database/migrations/018–026_*.sql`

---

## Conclusion

**Completion rate:** 23 of 26 items fully done, 2 partial, 1 issue with architecture.

The implementation is comprehensive and well-structured. Main gaps:
1. Auto-expand/collapse on section field add (UX refinement)
2. Phone validation for Key Contacts
3. Settlement should be merged into Budget section (architectural change)

All API integrations, database schema, and business logic are solid. The autosave system, drag-and-drop animations, and custom field management are robust.
