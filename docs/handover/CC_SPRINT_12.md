# CC Sprint 12 — Rental house + deferred Sprint 12/13 closeout

Combined sprint per Adam's call. Nine phases. Larger scope than any previous sprint (~2 weeks CC time). Same long-CC-run-then-long-Adam-smoke pattern.

Branch off `feat/sprint-11-closeout-v2` HEAD (Sprint 11 still unmerged pending Adam's flight smoke). When Sprint 11 lands on main, Sprint 12 rebases.
New branch: `feat/sprint-12-rental-plus-closeout`.

---

## Hard rules (whole sprint)

1. **New dependencies allowed** (this sprint's documented exception):
   - `qrcode` — server-side QR PNG generation
   - `html5-qrcode` OR `@zxing/library` — client-side camera decode (CC picks based on bundle size + maintenance health)
   - `react-easy-crop` — image cropping (§9)
   - (Optional) `@react-email/components` — only if §8 wants typed HTML templates; can also hand-roll inline HTML
2. No `any`, no `// @ts-ignore`.
3. Lint baseline 75/120 strict hold.
4. Typecheck zero. Build via `next build --webpack`.
5. One commit per phase. Nine commits total.
6. Verify before claiming. Quote post-fix file:line in every report.
7. Project root: `/Users/lowpass/Documents/lowpass-app`.
8. Mockup sign-offs on §6 + §7 only (chrome IA + artist library — UX-significant new surfaces). Phases 1-5, 8, 9 ship continuously.
9. **Halt criteria:** anything that requires schema decisions not in this doc → STOP and ask.

---

## Context — the rental house feature

Adam's confirmations from chat:

- Tours don't need a gear list. Rental house is separate and just for Adam (internal tool for now).
- Carnet output: CSV / Google-Sheet-style is fine. Adam imports to Google Sheets → submits to broker.
- Label printing: Brother PTouch Edge thermal printer, small QR + logo. Labels printed via P-touch Editor (Adam's Mac software).
- CC_RENTAL_DENORMALISE.md carry-over folds into §1 schema foundation (do it once while we're in there).
- QR libs and image cropper are necessary exceptions to no-new-deps.

---

## §1 — Schema foundation + rental denormalise carry-over

Formalize the rental tables (currently direct-pasted per CLAUDE.md, no migration files) and apply the CC_RENTAL_DENORMALISE.md fix in one sweep.

### Migrations needed

**Migration 092 — rental schema formalization:**

```sql
-- Idempotent CREATE TABLE IF NOT EXISTS for rental_inventory, rental_jobs, rental_job_items
-- (in case the prod-only direct-pasted versions are missing any indexes / FKs)
-- ALTER TABLE IF NOT EXISTS columns as needed.
```

Verify against the production schema (Adam can paste schema dump if needed). The point is to have versioned migration files for tables that already exist in prod.

**Migration 093 — rental_inventory Carnet + scanning fields:**

```sql
ALTER TABLE public.rental_inventory
  ADD COLUMN IF NOT EXISTS country_of_origin TEXT,           -- ISO-3166 2-letter code or country name
  ADD COLUMN IF NOT EXISTS customs_hs_code TEXT,             -- Customs HS classification (optional, Carnet adds value)
  ADD COLUMN IF NOT EXISTS weight_kg NUMERIC(10, 3),         -- For Carnet
  ADD COLUMN IF NOT EXISTS value_amount NUMERIC(12, 2),      -- Replacement value for Carnet + insurance
  ADD COLUMN IF NOT EXISTS value_currency TEXT DEFAULT 'GBP',
  ADD COLUMN IF NOT EXISTS dimensions_cm JSONB DEFAULT '{}'::jsonb,  -- { l, w, h } for shipping
  ADD COLUMN IF NOT EXISTS qr_token TEXT;                    -- Stable short ID encoded in the printed QR
```

Generate `qr_token` for existing rows: 8-char base32 of the UUID (collision-safe within a workspace). UNIQUE within workspace via partial index.

**Migration 094 — rental_movements (scan audit log):**

```sql
CREATE TABLE IF NOT EXISTS public.rental_movements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  rental_inventory_id UUID NOT NULL REFERENCES public.rental_inventory(id) ON DELETE CASCADE,
  rental_job_id UUID REFERENCES public.rental_jobs(id) ON DELETE SET NULL,
  movement_type TEXT NOT NULL
    CHECK (movement_type IN ('scan_out', 'scan_in', 'mark_repair', 'mark_lost', 'manual_correction')),
  scanned_by_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS rental_movements_item_idx
  ON public.rental_movements (rental_inventory_id, created_at DESC);
CREATE INDEX IF NOT EXISTS rental_movements_job_idx
  ON public.rental_movements (rental_job_id, created_at DESC) WHERE rental_job_id IS NOT NULL;

ALTER TABLE public.rental_movements ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS rental_movements_workspace_all ON public.rental_movements;
CREATE POLICY rental_movements_workspace_all ON public.rental_movements
  FOR ALL USING (workspace_id = public.get_my_workspace_id())
  WITH CHECK (workspace_id = public.get_my_workspace_id());
```

**CC_RENTAL_DENORMALISE.md carry-over** — read that file, apply whatever schema fix it specifies (probably about removing redundant denormalized columns on rental_job_items or similar). Bundle into migration 092 if it's a structural change, or 095 if it's separate enough to warrant.

### Phase 1 commit

```
feat(rental,db): schema foundation + Carnet/scan fields + movements log + denormalise (Sprint 12 §1)
```

---

## §2 — QR generation + label printing

Generate stable QR codes for each rental_inventory item. Print-ready format for Brother PTouch Edge.

### QR encoding

Each rental_inventory row's `qr_token` (from §1) encoded as a QR pointing at `https://lowpass.co/rental/scan?t={qr_token}`. Scanning the QR opens the scan flow directly with the item pre-selected.

### Server-side QR generation

`qrcode` npm package. Generates PNG (or SVG) on the server. Cache per-item in storage bucket `rental-qr-codes` (private, signed URLs).

### Printing UX

Two paths Adam can use:

1. **Per-item download** — On each rental_inventory row, a "Download label" action. Generates a single PNG sized for the user's PTouch label tape (default 24mm width, settable). Adam imports the PNG into P-touch Editor on his Mac, drops his logo + name text alongside, prints.

2. **Bulk CSV export for mail-merge** — On the rental_inventory grid, a "Bulk export QR labels (CSV)" action. CSV columns: `item_name`, `qr_url`, `serial_number`, `category`. Adam imports the CSV into P-touch Editor's data merge feature, which then generates a label per row using a template Adam designs once.

Default the PNG size to a label-printer-friendly 384×384 pixels (for 24mm tape at 300dpi, that's about 32mm — leaves room for the logo + text alongside).

### Files

- `src/app/api/rental/[id]/qr-png/route.ts` — GET, generates PNG, sets `Content-Disposition: attachment; filename="{lp_id}.png"`
- `src/app/api/rental/qr-bulk-csv/route.ts` — GET with optional filter params, generates CSV
- Storage bucket migration if we cache: `rental-qr-codes` with workspace-scoped RLS (same pattern as personnel-files)

### Phase 2 commit

```
feat(rental): QR generation + PTouch-ready label downloads (Sprint 12 §2)
```

---

## §3 — Mobile scanning UI

`/rental/scan` route — mobile-responsive, uses device camera to decode QR codes. Adam's primary device for this is his phone, but it should also work on desktop with a webcam.

### Library choice

CC picks between `html5-qrcode` and `@zxing/library` based on:
- Bundle size impact
- Mobile camera handling reliability
- Maintenance health (last release date, open issues)

Default to `html5-qrcode` unless its maintenance has lapsed. Document the choice in the commit body.

### Flow

```
1. User opens /rental/scan on phone → page requests camera permission
2. Camera viewfinder full-screen with scan reticle
3. Detect QR → vibrate (navigator.vibrate) + audio chirp → show bottom-sheet
4. Bottom-sheet shows item details (name, photo if any, current status)
5. Three primary actions (large tap targets):
   - "Scan IN to warehouse" → marks status='in_storage', clears rental_job_id, log movement
   - "Scan OUT to job..." → opens job picker → marks status='on_job', sets rental_job_id, log movement
   - "Mark for repair" → marks status='out_for_repair', log movement
6. Optional notes field on the bottom-sheet (e.g. "left adapter behind")
7. Confirmation → scanner re-opens for next item
```

### Edge cases

- QR points to a different workspace's item → "This item isn't in your workspace." Decline.
- QR malformed / unknown → "Unrecognized QR." Decline.
- Item already in target state → "Already scanned in today. Update anyway?" → confirm.

### Files

- `src/app/(app)/rental/scan/page.tsx` — mobile-responsive scanner page
- `src/components/rental/QRScanner.tsx` — camera + decode wrapper
- `src/components/rental/ScanActionSheet.tsx` — bottom-sheet UI for the post-scan action
- `src/components/rental/JobPicker.tsx` — small modal for selecting target job
- `src/app/api/rental/scan/route.ts` — POST: { qr_token, action, target_job_id?, notes? } → updates rental_inventory + logs to rental_movements

### Phase 3 commit

```
feat(rental): mobile camera scanning + scan-in/out workflow (Sprint 12 §3)
```

---

## §4 — Job-level gear views

`/rental/jobs/[id]` — shows all gear assigned to a specific rental job. Adam's "what's on this job right now" view.

### Page contents

- Job header: name, dates, client, current status
- Stats: total items, items on site, items in transit, items missing, items returned
- Items grid (similar chrome to /equipment grid):
  - Image / Name / Serial / Status / Last scanned / Last scan location
  - Filter chips: All / On site / In transit / Returned / Missing
- Bulk actions: "Mark all returned" (with confirm modal), "Print Carnet" (→ §5), "Print Quote" (→ §5)

### Files

- `src/app/(app)/rental/jobs/[id]/page.tsx` — server component, fetches job + items
- `src/components/rental/JobItemsGrid.tsx` — div-grid (same primitive as personnel grid)
- `src/app/api/rental/jobs/[id]/bulk-return/route.ts` — POST, marks all on-site items as returned, logs movements

### Phase 4 commit

```
feat(rental): job-level gear views + bulk actions (Sprint 12 §4)
```

---

## §5 — Carnet + Quote PDFs

Adam's two key job outputs.

### Carnet — CSV export

Per Adam's confirmation: Google-Sheet-style CSV. He imports to his Sheet, submits to broker.

CSV columns (Carnet General List, Section H format):

```
Item No., Trade Description, Pieces, Weight (kg), Value (currency), Country of Origin, HS Code, Serial Number
```

One row per rental_inventory item assigned to the job. Aggregated by item type if multiple pieces (e.g. 4× identical mic shoes → one row with `Pieces=4`).

Action: `[Export Carnet CSV]` button on `/rental/jobs/[id]`. Downloads `carnet-{job_name}-{date}.csv`.

Also generate a styled HTML preview the user can copy from / print if they want a quick visual. Not required for the broker workflow.

### Quote — PDF

Job-aware quote document. Pricing comes from `rental_inventory.day_rate` (need to verify this column exists; add if not).

PDF layout:

```
┌──────────────────────────────────────────────────────────────────┐
│ Workspace logo + name           Quote                            │
│                                  Date: {today}                    │
│                                  Quote #: {sequential or hash}    │
├──────────────────────────────────────────────────────────────────┤
│ Client: {job.client}                                              │
│ Job: {job.name}                                                   │
│ Dates: {job.start_date} – {job.end_date} ({n} days)              │
├──────────────────────────────────────────────────────────────────┤
│ Item              Day rate   Days   Subtotal                      │
│ ─────────────────────────────────────────────                    │
│ Item 1            £25.00     5      £125.00                       │
│ Item 2            £40.00     5      £200.00                       │
│ ...                                                                │
│ ─────────────────────────────────────────────                    │
│ Subtotal                            £825.00                       │
│ VAT (20%)                           £165.00                       │
│ Total                               £990.00                       │
├──────────────────────────────────────────────────────────────────┤
│ Terms: {workspace-configurable boilerplate}                       │
└──────────────────────────────────────────────────────────────────┘
```

Library: use existing `jspdf` (already a dep). Manual layout — no need for fancy PDF templating.

Action: `[Export Quote PDF]` button on `/rental/jobs/[id]`. Downloads `quote-{job_name}-{date}.pdf`.

### Schema fields needed

`rental_inventory.day_rate` (NUMERIC, currency on the workspace level)
`rental_jobs.client_name`, `rental_jobs.client_email` (for quote header)

Add via migration 095 if not present.

### Phase 5 commit

```
feat(rental): Carnet CSV export + Quote PDF generation (Sprint 12 §5)
```

---

## §6 — IA fix v3 (mockup sign-off required)

Sprint 10 Phase 1 and Sprint 11 Phase 1 both tried to do this. Sprint 12 keeps the scope SMALLER than either:

### In scope

- **TourProductsStrip** — Operations · Budget · Advance tabs. Mount below existing TourHeader, above existing OperationsSubNav. Don't merge strips this time. Accept the height cost (~184px chrome on tour pages).
- **Smart back button** — `[← Back]` left of workspace switcher in TopBar. `getSmartBackHref(pathname, fallbackArtistId?)` pure function. Mounts in BOTH TopBar (shell-v1) AND ProductHeader (shell-v2).
- **Breadcrumb primitive** — `<Breadcrumb segments={...} />`. Mount on the three product summary pages: `/operations/[tourId]`, `/budget/[tourId]`, `/advance/[tourId]`. Shows `{Artist} / {Tour}`.

### Out of scope (defer further)

- TourRoutingCalendar
- AdvanceTodayButton (the "Today" jumper on Advance)

These were Sprint 11 §1's over-engineer. Park them; revisit when Adam actually uses Advance enough to need them.

### Mockup sign-off

Post the three-screenshot ASCII spec (workspace / artist / tour scope) for Adam to sign off before code. Same format as Sprint 11 §1 mockup.

### Files

- `src/lib/shell/smartBack.ts` — pure function
- `src/components/shell/BackButton.tsx`
- `src/components/shell/TourProductsStrip.tsx`
- `src/components/ui/Breadcrumb.tsx`

### Files to modify (additive only)

- `src/components/shell/TopBar.tsx` — mount `<BackButton />`
- `src/components/shell-v2/ProductHeader.tsx` — mount `<BackButton />`
- `src/components/shell-v2/WorkspaceTopBar.tsx` — mount `<BackButton />`
- `src/app/(app)/operations/[tourId]/layout.tsx` — mount `<TourProductsStrip />`
- `src/app/(app)/budget/[tourId]/layout.tsx` — mount `<TourProductsStrip />`
- `src/app/(app)/advance/[tourId]/[routingId]/layout.tsx` — mount `<TourProductsStrip />`
- `OperationsSummaryClient.tsx` / Budget summary / Advance summary — mount `<Breadcrumb />` at top of body

### Phase 6 commit

```
feat(shell): TourProductsStrip + smart back button + breadcrumb primitive (Sprint 12 §6)
```

---

## §7 — Artist library (mockup sign-off required)

Adam's mental model: artist-level surfaces are TEMPLATES that get assigned to tours.

### In scope

Four routed surfaces under `/artists/[id]/`:

- `/artists/[id]/riders` — list of rider templates for this artist
- `/artists/[id]/channel-lists` — channel list templates
- `/artists/[id]/files` — file folder management (the "build folders" pattern Adam mentioned)
- `/artists/[id]/financials` — financial templates (deal memo shapes, payroll templates)

Each is a CRUD list:
- List view: title, last updated, "Assigned to N tours"
- Detail view: editable template content + "Assign to tour..." action
- "Assign to tour" copies the template into a specific tour's instance (rider into tour.riders, channel list into tour.channel_lists, etc.)

### Schema needed

Migration 096 — artist-level template tables:

```sql
CREATE TABLE IF NOT EXISTS public.artist_riders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  artist_id UUID NOT NULL REFERENCES public.artists(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  content JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
-- Same shape for artist_channel_lists, artist_files (or use existing storage), artist_financials
-- RLS: workspace_id = get_my_workspace_id()
```

### Mockup sign-off

Post the four-section ASCII spec showing list view + detail view for each surface.

### Phase 7 commit

```
feat(artists): artist library templates — riders, channel lists, files, financials (Sprint 12 §7)
```

---

## §8 — Email polish

Sprint 10/11 email dispatcher works but uses plain text. Adam wants real HTML emails + `@lowpass.co` sender (requires domain verification in Resend).

### In scope

- Replace plain-text email bodies with simple HTML templates (inline styles, no React Email needed unless CC prefers it)
- Templates for: invite, invite_accepted, intake_submitted, conflict_detected, assignment_cancelled
- Each template: workspace logo, header, body, CTA button, footer
- Resend `from` address change to `noreply@lowpass.co` (requires Adam to verify the domain in Resend dashboard — this is documented + flagged)

### Files

- `src/lib/notifications/templates/` — one file per template, plain TS returning `{ subject, html }`
- Update `dispatcher.ts` to use the new templates

### Phase 8 commit

```
chore(notifications): HTML email templates + domain-verified sender (Sprint 12 §8)
```

Adam runs Resend domain verification separately — the code works either way, just defaults to verified-domain sender once the DNS records are in.

---

## §9 — Image upload polish

### In scope

- **Headshot cropper** — when uploading a headshot, present a square-crop UI before submission. `react-easy-crop` library.
- **PDF first-page thumbnails** — when a PDF is uploaded as a passport/visa scan, generate a small first-page preview image. Use `pdfjs-dist` (probably already transitive dep — verify) to extract the first page as a canvas → PNG.
- **Drag-drop polish** — visual feedback during drag (dashed orange outline on the drop zone, "Drop to upload" overlay). Fix any leftover drag-drop bugs from Sprint 10 Phase 2.1.
- **File size + type validation** — surface earlier in the UI (before upload), with friendly error messaging.

### Files

- `src/components/personnel/HeadShotCropper.tsx` — new
- `src/lib/files/pdfThumbnail.ts` — new
- Updates to existing UploadDropZone + Files section in PersonnelDetailSlideOver

### Phase 9 commit

```
feat(uploads): headshot cropper + PDF thumbnails + drag-drop polish (Sprint 12 §9)
```

---

## Reporting expectations

Per phase, same format as Sprint 10/11:

```
Phase N done. Commit: <hash>
Files added/modified: [list with file:line for load-bearing logic]
Migration apply note: [if any]
Verify: tsc / lint / build
Smoke: [specific items Adam should test]
Blockers: [empty if clean]
```

After Phase 9, post the full Sprint 12 wrap-up matching previous sprint formats.

---

## Out of scope (Sprint 13+)

- Full Mobile PWA `/m/*` route group (rental scan is mobile-responsive; that's enough for now)
- Stripe billing + workspace creation UI
- Per-show personnel assignment grid
- Audit log advanced filtering / visualisation
- Spotify search → genre extension
- Per-personnel `tour_personnel.tags` column
- Multi-workspace rental sharing (if/when Adam offers rental house as a B2B service)

---

## Smoke checklist scaffold

Save to `docs/handover/SPRINT_12_FINAL_SMOKE.md` for Adam's testing pass. Include sections for each phase. Adam will run when ready (probably after his flight or the next free hour).
