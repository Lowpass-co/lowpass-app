# CC Sprint 9 Extension — Phase 13 (post-smoke fixes)

Adam smoked Phases 7–10 in detail. Bugs + UX gaps surfaced. This phase ships them all in one logical batch — three commits to keep diffs reviewable.

Sprint 9 stays open until Phase 13 lands. Phase 11 + 12 (multi-rate / animations) can ship in parallel before or after.

---

## Hard rules (whole phase)

Same as Sprint 9 Extension:
1. No new dependencies. No `any`, no `// @ts-ignore`.
2. Lint baseline 75/120 — strict hold.
3. Typecheck zero. Build via `next build --webpack`.
4. Verify before claiming. Quote post-fix file:line in the report.
5. Use existing primitives (`<SlideOver>`, `<DataTable>`, etc.). Don't invent.
6. Tokens only.
7. Single commit per sub-phase (13.A, 13.B, 13.C). Three commits total.
8. Don't merge to main.

---

## 13.A — Critical bugs (ship first)

### 13.A.1 — Site-admin RPCs: column reference "id" ambiguous

**Root cause** (already diagnosed): Migration `086_admin_rpcs_and_archive.sql` has unqualified `id` in three `EXISTS` admin gates at lines 113, 184, 244. Postgres can't disambiguate between the function's `id` OUT parameter (from RETURNS TABLE) and `profiles.id`.

**Fix:** New migration `087_admin_rpcs_id_qualification_fix.sql` that DROP+CREATEs the three RPCs (return signature unchanged but body fixes the unqualified column). The DROPs are required because CREATE OR REPLACE FUNCTION can't change the body when the function has OUT parameters that match a column name.

Wait — actually, body changes don't need DROP. The body change should work via CREATE OR REPLACE. Test it; if the runtime errors with "cannot change return type", then DROP first.

Body fix in all three RPCs — change:
```sql
WHERE id = auth.uid() AND is_site_admin = TRUE
```
to:
```sql
WHERE profiles.id = auth.uid() AND profiles.is_site_admin = TRUE
```

(Or use a table alias `p_check` if cleaner — your choice.)

Verify by running the failing query manually after the migration applies — `/admin/users` should load the user list, `/admin/workspaces` should load workspaces.

### 13.A.2 — Double TopBar

**Symptom** (per Adam's screenshots): two distinct bars at the top of every page — the upper one shows "adam's Workspace · Ella Langley · Dandelion Tour '26" (legacy WorkspaceContextBar or similar), the lower one is the new Phase 7 modern TopBar with Home / Personnel / Equipment / Settings links.

**Action:**

1. Find the upper bar component. Probably one of: `src/components/shell/WorkspaceContextBar.tsx`, `src/components/shell/AppShellHeader.tsx`, `src/components/layout/AppShell.tsx`, or a wrapper in `app-page-shells.tsx`. Grep for "workspace" in shell/layout components.
2. Decide: integrate its content (workspace name + active tour pill) into the new TopBar OR remove it entirely.

**Recommendation:** integrate into the new TopBar.

New TopBar layout target (single bar):

```
[Logo] [WorkspaceSwitcher ▾]  [HomeArtist · Tour ▾]  | Home Personnel Equipment Settings | [Search] [User Pill ▾]
```

Where `[HomeArtist · Tour ▾]` is the existing artist+tour switcher (already a component) — it just needs to live inside the same bar as the new nav. Currently it's in the upper bar and the new nav is in the lower bar.

If integrating turns out to be more invasive than removing, drop the upper bar entirely. The artist+tour switcher can be relocated into the new TopBar's left section, just right of the WorkspaceSwitcher.

### 13.A.3 — Restore composite "Name | ADMIN" user pill

**Symptom:** Phase 7's new TopBar shows just a circular avatar with a small "Admin" badge inside. Adam preferred the old style: avatar + name + admin pill as a horizontal composite.

**Target shape:**
```
[avatar] Adam 'Mr Big' Rowley  [ADMIN]
```

The ADMIN pill should be OUTSIDE the user-pill box, on the LEFT of it (per Adam — "outside the profile box, maybe on the left"). So actual layout:

```
... [Search] [ADMIN] [avatar] Adam 'Mr Big' Rowley ▾
```

Where `[ADMIN]` only renders for site admins. Style: `var(--lp-bg-tertiary)` background, `var(--lp-text)` text, small uppercase. Tooltip "Site admin — visible across all workspaces" on hover.

The user pill itself (avatar + name + chevron for dropdown) keeps the post-Phase-7 dropdown content (sign out, etc.).

### 13.A.4 — `/admin` nav entry from TopBar

**Symptom:** `/admin` route exists (Phase 10) but only accessible by typing the URL.

**Action:** Add a small "Admin" link/button to the new TopBar, visible only when `isSiteAdmin`. Place it next to the Settings link in the workspace nav strip. Same active-orange-underline pattern. Pathname starts with `/admin` → active.

```
| Home Personnel Equipment Settings Admin |
```

### 13.A.5 — `/personnel` "Person not found" on Add new + Import

**Symptom (F3, F7):** clicking `+ Add new` on `/personnel` adds a blank row to the grid AND surfaces a "Person not found" error toast. Same behaviour on Import — only names land, all other fields fail with the same error.

**Action:**

1. Read `src/app/api/personnel/route.ts` POST handler. Likely the bug: handler creates a `personnel` row, then tries to fetch the row back by some ID that doesn't yet exist (e.g. fetches the new row before the INSERT commits, or fetches by `person_id` which doesn't exist on `personnel` per the convention we established in Sprint 9 §6).
2. Read `src/components/personnel/PersonnelLibraryClient.tsx` — see how the AddNew flow chains the create + the resulting row injection into the grid.
3. Fix the handler to return the newly-created row from the INSERT (use `.select().single()` after the INSERT). The grid client uses that response to update local state.

Same fix likely applies to Import — the bulk insert path probably fetches each row back individually after insert, hitting the same "not found" race.

Verify by clicking `+ Add new` after fix → row appears with placeholder data, NO error toast, slide-over opens with the new row's fields editable.

### 13.A.6 — Personnel detail Files section missing

**Symptom (F6):** Detail slide-over has Files section in the spec, but no upload area renders.

**Action:** Read `src/components/personnel/PersonnelDetailSlideOver.tsx` — find the Files section. Either:
- The component import is missing
- A conditional render is hiding it (gated on a permission / feature flag that's false)
- It's a TODO that was never completed

If TODO: build the section. Reuse `src/components/personnel/PersonnelFilesSection.tsx` if it exists; if not, build it. File upload via `<input type="file">` + drag-drop. Lists files for this personnel.id from `/api/personnel/[id]/documents` GET. POST to upload, DELETE for admin-only delete.

### 13.A.7 — Operations summary conflicts card showing 0 when conflicts exist

**Symptom (E2):** Card shows "0 conflicts" but the personnel page shows 2 conflict warnings.

**Action:** Read `src/app/(app)/operations/[tourId]/page.tsx` — find the conflicts count computation. Probably calling `check_personnel_conflicts_batch` with the wrong canonical_person_ids (e.g. an empty array, or only canonical_person_ids that aren't NULL when the test data has NULL canonical_person_ids).

Adam's data likely has tour_personnel rows where `persons.canonical_person_id IS NULL` (canonical_persons not backfilled). For those, the batch function returns nothing — but the email-fallback `check_personnel_conflicts_by_email_batch` should be called too.

Fix: the count query should sum results from BOTH RPCs (canonical + email). Currently probably only calling one.

### 13.A.8 — Operations summary: card titles

**Symptom (E2):** Cards show only icon + "overview" — not actual titles like "Shows" / "Crew" / "Conflicts" / "Pending tasks".

**Action:** Read `src/components/operations/summary/OperationsSummaryClient.tsx` — find the card renderer. Add explicit titles per card. Below the title, the existing detail line ("next 21 Mar", "21 Mar–14 Apr", etc.).

### 13.A.9 — Extend tour: refresh after save

**Symptom (E5):** After saving extended dates, the tour header still shows the old dates until hard refresh.

**Action:** In `src/components/operations/summary/ExtendTourSlideOver.tsx`, after the successful PATCH, call `router.refresh()` (Next.js App Router) to invalidate the server component cache. The server component re-fetches and re-renders with new dates.

If using a different approach (e.g. SWR / React Query), invalidate the relevant query key.

### 13.A.10 — Personnel filter expansion

**Symptom (E2):** `/personnel` page has only the conflicts filter. Adam wants more.

**Action:** Add filter chips to the `/personnel` header for:
- All
- Conflicts (existing)
- Issues (passport expiring within 180 days OR visa expired)
- Recently updated (last 7 days)
- Untouched (last_updated > 90 days ago)

Reuse the existing filter chip pattern from elsewhere in the app (e.g. tour list filter chips if they exist). Click → adds query param → filter applies.

### 13.A.11 — Manage personnel: date input labels

**Symptom (F2):** Date inputs in the Manage slide-over have no labels — just date pickers with placeholder text.

**Action:** In `src/components/operations/personnel/PersonnelManageSlideOver.tsx`, the inputs at lines around 235-285 have `<label htmlFor="lp-personnel-starts">Start date</label>` / `<label htmlFor="lp-personnel-ends">End date</label>` already per CC's spec. Verify they render visibly (not `display: none` or similar). If they DO render, the issue might be the labels are too far from the inputs visually — adjust the label styling to be more obvious.

If labels aren't there, add them.

### 13.A.12 — Bulk delete on personnel grid

**Symptom (F7):** Adam imported test data, can only delete one by one.

**Action:** Add row-selection checkboxes to the personnel grid. Above the grid, when ≥1 row is selected, show a `[Delete N selected]` button. Confirm modal explains the cascade. POST `/api/personnel/bulk-delete` with the selected IDs.

Note: there's already an `/api/personnel/bulk-delete/route.ts` per the earlier grep — wire it up if it's empty, or use it directly if it works.

### 13.A.13 — Import: import all fields not just names

**Symptom (F7):** Import only takes names, errors on all other fields with "person not found".

**Action:** Read `src/app/api/personnel/import/route.ts`. Same root cause as 13.A.5 — the create flow has a fetch-back race or column mismatch. Fix per 13.A.5's logic.

Verify by importing a test CSV with name + email + phone + role columns → all fields populate.

### 13.A.14 — Connection state on Operations/Budget/Advance product headers

**Symptom (C1 nice-to-have):** Live pill on Routing/Personnel works after Phase 7 fix. Adam wants the same indicator on Operations summary, Budget pages, Advance pages — NOT just sub-pages.

**Action:** Build a small `<ConnectionIndicator>` component (or refactor the existing Realtime indicator) that mounts in the ProductHeader for Operations / Budget / Advance. Three states:

- **Live** — green pill, "Live"
- **Connecting** — amber pill, "Connecting…"  
- **Offline** — red pill, "Offline — refresh to reconnect"
- **Save failed** — red pill, "Save failed — last edit not stored. Retry?"

The Save-failed state is fired by a global error boundary catching POST/PATCH/DELETE failures. Toast pattern won't work here — Adam wants persistent visibility.

This is a polish item; ship 13.A.1 through 13.A.13 first; 13.A.14 can roll into 13.B if time-pressed.

### 13.A — Single commit at end

```
fix(admin,topbar,personnel,operations): Sprint 9 Phase 13.A critical bugs
```

Apply migration 087 manually via Supabase SQL Editor + tracking insert.

---

## 13.B — Personnel rework v2 (Daysheets-style profile)

### 13.B.1 — Comprehensive profile sections

Adam's spec (paraphrased): Personnel detail panel should be Daysheets-quality. Optional add-as-needed sections, not a single rigid form. Multiple of each: passports, frequent flier, dietary, merch sizes, emergency contacts.

**Sections to support:**

- **Identity** (existing) — full name, preferred name, pronouns, date of birth
- **Contact** — primary email, primary phone, plus optional Add another email, Add another phone
- **Emergency contacts** — list with `[+ Add emergency contact]`. Each entry: name, relationship, phone, email
- **Travel — Passports** — list with `[+ Add passport]`. Each entry: country, number, given names, surname, date of issue, date of expiry, place of birth, photo upload
- **Travel — Frequent flier** — list with `[+ Add airline]`. Each entry: airline, member number, tier (basic/silver/gold/platinum dropdown)
- **Travel — Visas** — list with `[+ Add visa]`. Each entry: country, type, valid from, valid to, photo upload, notes
- **Travel — Home airport** — single field
- **Dietary** — list with `[+ Add dietary requirement]`. Each entry: type (vegetarian / vegan / gluten-free / kosher / halal / custom) + free-text "additional notes"
- **Merch sizes** — list with `[+ Add size]`. Each entry: garment type (t-shirt / hoodie / jacket / pants / shoes) + size (XS / S / M / L / XL / XXL / custom)
- **Pay** (admin/manager only — gated) — standard rates per day type, commission rates per territory
- **Files** — uploaded documents with download + admin-only delete
- **Notes** — free-text textarea, admin-only edit
- **Tours** — read-only summary of tour_personnel rows

Sections are collapsible. PERSONAL + CONTACT open by default. Others collapsed.

**Schema changes** — migration `088_personnel_profile_v2.sql`:

The existing `personnel.extended_profile` JSONB stores everything per Phase 9's CC implementation. Extend its expected shape to support arrays of each:

```ts
type PersonnelExtendedProfile = {
  identity?: { ... };  // existing
  contact?: { ... };
  emergency_contacts?: Array<{
    name: string;
    relationship: string;
    phone: string;
    email?: string;
  }>;
  passports?: Array<{
    country: string;
    number: string;
    given_names: string;
    surname: string;
    date_of_issue: string;
    date_of_expiry: string;
    place_of_birth?: string;
    photo_path?: string;  // path in personnel-files bucket
  }>;
  frequent_flier?: Array<{
    airline: string;
    member_number: string;
    tier?: 'basic' | 'silver' | 'gold' | 'platinum';
  }>;
  visas?: Array<{
    country: string;
    type: string;
    valid_from: string;
    valid_to: string;
    photo_path?: string;
    notes?: string;
  }>;
  home_airport?: string;
  dietary?: Array<{
    type: 'vegetarian' | 'vegan' | 'gluten_free' | 'kosher' | 'halal' | 'custom';
    notes?: string;
  }>;
  merch_sizes?: Array<{
    garment: 't_shirt' | 'hoodie' | 'jacket' | 'pants' | 'shoes';
    size: string;
  }>;
};
```

JSONB validation can stay loose (no strict CHECK constraint); UI enforces shape.

No new columns needed. The migration is informational + may add an index on `(extended_profile->'passports'->0->>'date_of_expiry')` if we want fast "expiring soon" queries (probably not needed v1; per-row scan is fine for small workspaces).

### 13.B.2 — Profile completeness indicator

**Per-row in grid:** show a small ring/donut visual + percentage on each personnel row. Red < 30%, amber 30–70%, green > 70%.

**Calculation:** weighted score against required + optional fields. Rough weights:
- Identity (full name, DOB) — 20% (required)
- Contact (email, phone) — 15% (required)
- At least 1 passport with valid expiry — 15%
- At least 1 emergency contact — 15%
- Home airport — 5%
- At least 1 dietary entry — 5% (or explicit "no requirements" flag)
- At least 1 merch size — 5%
- At least 1 frequent flier entry — 5%
- Visas (counts only if needed) — defer
- Pay (rates set) — 15% (admin/manager view only)

**Tooltip on hover** lists missing fields specifically. Click the indicator → opens detail panel scrolled to first missing section.

### 13.B.3 — Personnel grid styling like Bug Reports

Reference: `src/components/bug-report/BugReportsClient.tsx`.

Visual elements to mirror:
- Row hover state
- Status badges
- Section grouping
- Action menu pattern (row-level [⋯])

Don't copy the actual bug-report data model — just the visual chrome.

### 13.B — Single commit at end

```
feat(personnel): Daysheets-style profile builder + completeness indicator (Sprint 9 §13.B)
```

---

## 13.C — UX consolidation polish

### 13.C.1 — Extend tour folded into Edit tour

**Symptom (E6):** Currently `[Extend tour]` is a separate button on Operations summary.

**Action:** Add a `[Edit tour]` button (or similar — `[Tour settings]`?) that opens a slide-over with all tour-level settings:
- Name
- Start date
- End date (the Extend tour functionality)
- Currency
- Other tour-level settings as they exist

Drop the `[Extend tour]` standalone button. The slide-over handles both creation-time edit and date extension.

If "Edit tour" already exists somewhere else, link to it from the summary; don't duplicate.

### 13.C.2 — Operations sub-nav: Operations entry as direct link to summary

Currently the OperationsSubNav doesn't have an "Operations" / "Summary" entry — just the sub-pages. Add a "Summary" or "Overview" entry as the first sub-nav item that links to `/operations/[tourId]` (the new summary page from Phase 8).

When path is `/operations/[tourId]` with no sub-page → "Summary" is active.

### 13.C — Single commit at end

```
chore(ui): Sprint 9 Phase 13.C consolidation polish
```

---

## Reporting expectations

Per sub-phase:

```
Phase 13.X done. Commit: <hash>
Files added/modified: [list with file:line for load-bearing logic]
Migration apply note: [if any]
Verify: tsc zero, lint X/Y under baseline, build green
Smoke: [list of specific items Adam should test]
Blockers: [empty if clean]
```

After Phase 13.C, post the final Sprint 9 wrap-up listing all 12+ phases' commits + total migrations applied.

---

## Out of scope (genuinely Sprint 10)

- Workspace creation UI ("+ Create workspace" stays hidden)
- Email/SMS notification dispatcher (audit_log rows being written; Sprint 10 reads them)
- Stripe billing
- Rental-inventory route fix per CC_RENTAL_DENORMALISE.md
- Audit log advanced filtering / visualisation
- Per-show personnel assignment grid
- Visa expiry semantic handling (per-country rules)
- Mobile PWA
