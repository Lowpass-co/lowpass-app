# CC Sprint — Payroll Product Build

**Goal:** Replace Adam's Google Sheets + Apps Script payroll workflow with a real Lowpass product. Personnel rates stored in the database. Day-type auto-classified from routing data. Weekly spreadsheet view for entering advances + reviewing totals. Branded per-artist PDFs (per-person + combined all-staff) generated server-side via Puppeteer.

**Reference of source-of-truth for what this product must do:**
`docs/handover/PAYROLL_REFERENCE_GOOGLE_SCRIPT.gs`

That file is Adam's current Apps Script. Read it before writing code. Every rate rule, day-type classification rule, per-diem rule, and PDF layout decision is in there. Do not re-invent these rules — port them.

**Branch:** `feat/payroll-product` off `main` (after Polish Sprint 1 merges).

**Sub-phases run in order. Each is its own commit. Halt-and-report at ~400 LOC.**

---

## Hard rules

1. **One feature commit per sub-phase.** Halt-and-report at ~400 LOC. Split into §PXa/§PXb if a sub-phase overshoots.
2. **Lint baseline does not regress.** `tsc --noEmit` zero. `next build --webpack` green.
3. **Token discipline.** All visual values via `var(--lp-…)`. New tokens only if existing don't fit.
4. **No new deps.** Puppeteer + pdf-lib already present (Sprint 12 §10). All math is plain TS.
5. **Verify before claiming.** File:line precision in every report.
6. **Out of scope:** Rooming product build, Rider editor rebuild, Phase B.5, Phase C, Flight email tracker (parked). All queued.
7. **Internal rate visibility.** The "Lowpass rate" (internal_rate) is sensitive business info — only workspace admins can see/edit it. Per-row UI gate, not just RLS.
8. **Reuse the §10 Puppeteer pipeline.** Don't fork a new PDF rendering path. The rider PDF code at `src/lib/rider-packs/pdf-render.ts` + `src/lib/rider-packs/puppeteer.ts` is the reference.

---

## Mandatory recon (before §P1)

CC must verify these BEFORE writing any code. Report findings in the §P1 commit body.

1. **Existing `personnel_rates` table — what columns?**
   The earlier audit mentioned this table joins to `payroll_entries` in `PayrollView.tsx`. Read the actual migration that created it and report the column shape. Likely candidates: `person_id`, `tour_id`, `show_rate`, `travel_rate`, `per_diem`. Need to confirm whether `internal_rate` (the "Lowpass rate") already exists.

2. **Existing `payroll_entries` or equivalent — what columns?**
   What's persisted today? If there's a weekly payroll entry table, what does a row represent (per-person-per-week? per-person-per-day?). Report.

3. **Current `src/components/payroll/PayrollView.tsx` (or equivalent) — what does it render?**
   Find the actual file. Read it. Report what's already built so the new work extends rather than duplicates.

4. **`artists.brand_color` — does it exist?**
   Migration 100 (Sprint 12 §9) added `artists.default_logo_url`. Check if `brand_color` column also exists. If not, add in §P1 migration.

5. **Routing data shape — how is day-type derivable?**
   Read the routing data model. Identify how to map a date + person_id → "show day" / "off-travel day" / "no tour" using existing data. The spec assumes:
   - If there's a confirmed show on that date AND the person is assigned to it → SHOW DAY
   - If there's a travel entry on that date (routing.type='travel' or similar) AND person assigned → OFF/TRAVEL DAY
   - Otherwise → NO TOUR
   - "ACL Per Diem" — festival exception, $125 flat. Probably a workspace setting OR a per-tour override OR just a special case Adam manually flips. Report what's most natural given existing data.

6. **Storage bucket for payroll PDFs — does one exist?**
   Likely needs creating. Bucket name: `payroll-pdfs`. Pattern reference: `rider-assets` bucket from rider PDFs.

Halt and report if any of these uncover spec ambiguity — don't guess.

---

# §P1 — Data model + migration

Migration number: next sequential after the highest currently on main. Verify before writing.

## Schema changes

```sql
-- 1. personnel_rates extension: internal_rate (the "Lowpass rate" per the Apps Script)
-- Only add this column if it doesn't already exist per the recon.
ALTER TABLE public.personnel_rates
  ADD COLUMN IF NOT EXISTS internal_rate NUMERIC(10, 2);

COMMENT ON COLUMN public.personnel_rates.internal_rate IS
  'Workspace-internal rate (Adam''s "Lowpass rate"). Used in combined all-staff PDFs for internal P&L. Sensitive — UI gates visibility to workspace admins.';

-- 2. payroll_advances — per-person-per-week advance amount
-- Replaces the column K reading from the Google Sheet.
CREATE TABLE IF NOT EXISTS public.payroll_advances (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id  uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  tour_id       uuid NOT NULL REFERENCES public.tours(id) ON DELETE CASCADE,
  person_id     uuid NOT NULL REFERENCES public.persons(id) ON DELETE CASCADE,
  week_start    date NOT NULL,  -- Sunday of the week
  amount        NUMERIC(10, 2) NOT NULL DEFAULT 0,
  notes         text,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tour_id, person_id, week_start)
);

CREATE INDEX IF NOT EXISTS pa_tour_week_idx ON public.payroll_advances(tour_id, week_start);
CREATE INDEX IF NOT EXISTS pa_workspace_idx ON public.payroll_advances(workspace_id);

ALTER TABLE public.payroll_advances ENABLE ROW LEVEL SECURITY;
CREATE POLICY pa_select ON public.payroll_advances FOR SELECT USING (workspace_id = public.get_my_workspace_id());
CREATE POLICY pa_insert ON public.payroll_advances FOR INSERT WITH CHECK (workspace_id = public.get_my_workspace_id());
CREATE POLICY pa_update ON public.payroll_advances FOR UPDATE USING (workspace_id = public.get_my_workspace_id())
  WITH CHECK (workspace_id = public.get_my_workspace_id());
CREATE POLICY pa_delete ON public.payroll_advances FOR DELETE USING (workspace_id = public.get_my_workspace_id() AND public.is_workspace_admin());

-- 3. artists.brand_color — only add if recon confirms it doesn't exist
ALTER TABLE public.artists
  ADD COLUMN IF NOT EXISTS brand_color text DEFAULT '#FF4500';

COMMENT ON COLUMN public.artists.brand_color IS
  'Hex color used for branded outputs (payroll PDFs, rider PDFs). Defaults to Lowpass orange.';

-- 4. Storage bucket for payroll PDFs
INSERT INTO storage.buckets (id, name, public)
VALUES ('payroll-pdfs', 'payroll-pdfs', false)
ON CONFLICT (id) DO NOTHING;

-- Workspace-scoped storage RLS via path prefix payroll-pdfs/{workspaceId}/{tourId}/{week}/{filename}
```

Write a matching `_apply_NNN_supabase.sql` paste-block in the same commit.

## TypeScript types

Update `src/lib/types/payroll.ts` (or create if doesn't exist):

```ts
export interface PersonnelRates {
  id: string;
  person_id: string;
  tour_id: string;
  show_rate: number | null;
  travel_rate: number | null;
  internal_rate: number | null;  // "Lowpass rate" — admin-only
  per_diem: number | null;
}

export interface PayrollAdvance {
  id: string;
  workspace_id: string;
  tour_id: string;
  person_id: string;
  week_start: string;   // ISO date, Sunday of week
  amount: number;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export type DayType =
  | 'show_day'
  | 'off_travel_day'
  | 'acl_per_diem'     // festival exception
  | 'no_tour';

export interface PayrollDay {
  date: string;          // ISO date
  city: string | null;
  venue: string | null;
  day_type: DayType;
  rate: number;          // computed rate for this day
  per_diem: number;      // computed per diem for this day
  day_total: number;     // rate + per_diem
}

export interface PayrollWeek {
  week_start: string;
  week_label: string;    // "W/C 23rd Mar — 29th Mar"
  person_id: string;
  person_name: string;
  person_role: string | null;
  days: PayrollDay[];    // 7 entries (Sun-Sat)
  subtotal: number;      // sum of day_totals
  advance: number;
  total_due: number;     // subtotal - advance
  currency: string;
}
```

## §P1 reporting

```
Phase P1 done. Commit: <hash>
Migration added: <number>
Recon findings:
  - personnel_rates current columns: [list]
  - payroll_entries current columns: [list or "does not exist"]
  - artists.brand_color status: [present / added in this migration]
  - PayrollView.tsx current behaviour: [summary]
  - Day-type derivation source: [routing.type field shape]
Files added:
  - database/migrations/NNN_payroll_product.sql
  - database/migrations/_apply_NNN_supabase.sql
  - src/lib/types/payroll.ts (if new)
Files modified: [list]
Verify: tsc=0, lint baseline, build green
Adam's apply step: paste _apply_NNN_supabase.sql into Supabase
Blockers: [empty if clean]
```

---

# §P2 — Personnel rates UI

The rates UI extends the existing personnel slide-over (`PersonnelDetailSlideOver.tsx` for workspace-level, `PersonnelManageSlideOver.tsx` for tour-personnel — recon to confirm which is correct).

## Per-person defaults vs per-tour overrides

The Apps Script stores rates per-person in a SUMMARY sheet but allows overriding per-tour. The Lowpass model:

- `personnel_rates` is keyed on `(person_id, tour_id)` — so rates are PER PERSON PER TOUR.
- No "default rates" at the person level. Each tour assignment gets its own rates.
- A "Copy from previous tour" affordance speeds up the assignment workflow.

If the recon shows `personnel_rates` is keyed differently, adapt.

## UI placement

In the tour-personnel slide-over (`PersonnelManageSlideOver.tsx`), add a "Rates" section:

```
RATES
  Show rate:      [£ 200.00 ]
  Travel rate:    [£ 100.00 ]
  Per diem:       [£ 50.00  ]
  
  ─── Admin only ───
  Internal rate:  [£ 350.00 ]     ⓘ Hidden from non-admin members
```

- Currency prefix derived from `tour.currency` (uses the existing `budgetCurrencySymbol` helper).
- Inline edit with the existing `useAutoSave` primitive.
- Internal rate row is only rendered if the current user is a workspace admin (`is_workspace_admin()`). Non-admins don't see the row at all.
- "Copy from previous tour" button at the top of the Rates section: dropdown of the person's other tours → on select, pulls those rates into the current tour's row (editable before save).

## API

Update `/api/tours/[id]/personnel/[memberId]` PATCH to accept the 4 rate fields. Server validates positive numbers and that internal_rate writes require admin role.

New endpoint: `GET /api/persons/[id]/rates-history` — returns previous tour rates for the Copy affordance.

## §P2 reporting

Standard format. Include:
- Confirmation that internal_rate row is admin-gated (test: log in as non-admin, verify row absent)
- Currency prefix matches tour.currency
- Auto-save behaviour matches §B0 pattern

---

# §P3 — Payroll grid foundation

The main UI surface. Lives at `/operations/[tourId]/payroll/page.tsx` (already mounted with PayrollView per the recon — extend or rebuild).

## Grid layout

Rows = personnel on this tour. Columns = days of selected week + summary columns.

```
Week:  [W/C 23rd Mar — 29th Mar  ▾]  ← Week picker

NAME             ROLE   SUN 23  MON 24  TUE 25  WED 26  THU 27  FRI 28  SAT 29  SUBTOTAL  ADVANCE  TOTAL DUE
Adam Rowley      TM     OFF/TRV TRAVEL  SHOW    SHOW    SHOW    SHOW    OFF/TRV £1,250    £0       £1,250
                        £100    £100    £200    £200    £200    £200    £100
                        +£50    +£50    +£50    +£50    +£50    +£50    +£50    pd subtotal £350

Richie Taylor    PM     OFF/TRV TRAVEL  SHOW    SHOW    SHOW    SHOW    OFF/TRV £980      £200     £780
                        ...

[Totals row pinned at bottom]
```

Day cells render:
- Top: day type abbreviated ("SHOW", "TRV", "OFF", "—")
- Middle: rate amount (e.g. £200)
- Bottom: per diem (+£50) — only if day type qualifies
- Background tint by day type (green = show, amber = travel, gray = no tour)

Day type is **derived** from routing data per the recon — not stored separately. The Apps Script does this via cell keyword matching; here we do it via SQL/TS logic against the existing routing model.

## Week picker

Top-left of the page. Default to current week. Arrow controls + jump-to-date picker. Selected week drives the entire grid.

## Day-type classification logic

Per the Apps Script (lines 530-555 of the reference file):

```ts
function classifyDay(date: string, person: PersonRoutingForDate): DayType {
  // Order matters — first match wins.
  if (person.hasShowOnDate(date)) return 'show_day';
  if (person.hasTravelOnDate(date)) return 'off_travel_day';
  if (person.isAclPerDiemException(date)) return 'acl_per_diem';
  return 'no_tour';
}
```

The exact "hasShowOnDate" / "hasTravelOnDate" implementation depends on the existing routing data shape — confirmed in §P1 recon.

ACL Per Diem exception: $125 flat per day per the script. Need a way to flag a date as ACL. Options:
- Workspace setting with a list of date ranges
- Per-tour override
- Manual flag on routing row

Simplest for v1: a manual flag on routing row (`routing.is_acl_perdiem boolean`). Add to §P1 migration if pursued.

If recon surfaces a better model, adapt.

## Per-diem rules

Per the script:
- Show Day → per_diem applied
- Off/Travel Day → per_diem applied
- ACL Per Diem → flat $125 (per-tour-override OR workspace constant)
- No Tour → per_diem NOT applied (rate = 0 too)

Implement as pure functions in `src/lib/payroll/compute.ts`. Heavy testing in the function file as inline comments per Apps Script comment style.

## Read-only first

§P3 ships the grid READ-ONLY. Day types and totals are computed from existing data + rates. No editing yet. Advances default to 0.

## Reuse density toggle pattern

Mount `BudgetDensityToggle`-style component at the top of the payroll page. Same density tokens scale rows. Reuse `createDensity` factory from §B5.

## §P3 reporting

Standard format. Include:
- Day-type classification logic location (path:line)
- Per-diem rules location (path:line)
- Reuse of density factory confirmed

---

# §P4 — Advance inline editing + week persistence

§P3 was read-only. §P4 makes the grid edit-capable for advances.

## Inline edit

Click an Advance cell → inline numeric input → save via PATCH `/api/tours/[id]/payroll/advances`. Creates or updates the `payroll_advances` row for that (tour, person, week).

Currency prefix on input. Auto-save on blur.

Total Due recomputes immediately as `subtotal - advance`.

## Week persistence (small but worth flagging)

The selected week persists in localStorage as `lowpass:payroll:lastWeek` so navigating away and back doesn't reset to current week.

## Bulk advance entry

Adam mentioned that advances are pretty static per person. Add a "Copy last week's advances" button at the top of the grid: pulls the previous week's advance row for each person and pre-fills this week. User can edit per-row before saving.

## §P4 reporting

Standard format. Include smoke: edit an advance, reload, confirm persistence; week persistence works; copy-last-week pre-fills.

---

# §P5 — Per-person weekly PDF generation

Reuse the Sprint 12 §10 Puppeteer pipeline.

## Endpoint

`POST /api/tours/[id]/payroll/[weekStart]/pdf?personId=<uuid>` — generates a single-person PDF, returns the buffer.

Auth-gated workspace check. Rate limit per the §SAFE pattern: 1 call per 3 seconds per (tour, week, person).

## HTML composition

New file: `src/lib/payroll/pdf-render.ts`.

Structure mirrors the Apps Script's `pageBody_` function (lines 670-705 of the reference). Key elements:

- **Header:** artist banner image (if `artists.default_logo_url` exists AND is a `_header` variant) OR artist name text in `brand_color`
- **Title:** "Weekly Invoice Breakdown" + week badge (brand color background)
- **Person section:** `<h2>` Name + role
- **Table:** Date / City / Venue / Type / Rate / Per Diem / Total
- **Totals block:** Subtotal / Advance / Total Due (Total Due in brand color)
- **Footer:** artist logo (`artists.default_logo_url`, sized 80px wide)

## CSS

Reuse the brand-color tinting helpers from the Apps Script (lines 770-795 — `tintHex_` function). Port to a TS utility in `src/lib/payroll/colors.ts`:

```ts
export function tintHex(hex: string, pct: number): string {
  // hex + pct% toward white. pct = 0 → original, pct = 1 → white.
}
```

Apply to:
- Table header bg: `tintHex(brand, 0.85)` (~15% opacity)
- Table header border: `tintHex(brand, 0.65)`
- Totals top border: solid brand color
- Total Due text: brand color

## Download / share affordance

In the payroll grid header, add a "Generate PDFs" dropdown:
- "Per-person PDFs (downloads ZIP)" — calls the endpoint for each person, zips on client, downloads
- "All-staff combined PDF" — covered in §P6

Alternative: a "PDF" icon button on each person row → downloads that person's PDF.

Both affordances are useful. Implement both.

## §P5 reporting

Standard format. Smoke: generate one PDF, verify branding (artist color + logo), table rows, totals.

---

# §P6 — Combined all-staff PDF

Reuses the §P5 pipeline with two key differences:

## Differences from per-person

1. **Single multi-page PDF** with one section per person (page break between sections).
2. **Uses internal_rate when available** — the "Lowpass rate" substitution. Per the script lines 590-595:
   ```
   useLowpass = true: showRate = (rates.internal_rate > 0) ? rates.internal_rate : rates.show_rate
   ```
3. **Admin only.** Combined PDF contains internal rates, sensitive business info. Endpoint admin-gated, UI affordance hidden for non-admins.

## Endpoint

`POST /api/tours/[id]/payroll/[weekStart]/pdf/combined` — returns single PDF buffer covering all personnel on this tour for this week.

Use `pdf-lib` (already a dep from §10) to concatenate per-person renders, OR generate the whole multi-section HTML in one Puppeteer pass. Single Puppeteer pass is simpler — use that approach.

## §P6 reporting

Standard format. Smoke: generate combined PDF, verify each person is a section, verify internal rate substitution happens (compare to per-person PDF for the same person — internal rate row should differ).

---

## Sprint summary

After all 6 sub-phases ship:

- **§P1:** data model with rates + advances + brand color
- **§P2:** rates UI in personnel slide-over with admin-gated internal rate
- **§P3:** weekly payroll grid, read-only, day-type auto-classified, density toggle reused
- **§P4:** inline advance editing + week persistence + copy-last-week
- **§P5:** per-person PDF generation, branded per artist
- **§P6:** combined all-staff PDF with internal rate substitution

Total estimated LOC: ~2000 across 6 commits. ~1-1.5 weeks of CC time.

After Adam smokes + signs off each sub-phase, merge `feat/payroll-product` to main. Next sprint: Rooming product build.

---

## Open question to confirm at sprint start

**ACL Per Diem exception model.** The Apps Script handles this via cell-keyword matching ("ACL PER DIEM" text in a date cell, $125 amount). In Lowpass, options are:

- **A — per-routing-row flag:** add `routing.is_acl_perdiem boolean` to the §P1 migration. Adam manually toggles per show date.
- **B — workspace constant + manual override per tour:** workspace stores the rule ($125 flat per day for festival), tour-level override list of dates.
- **C — derive from venue:** if `venue.name = 'Austin City Limits'` or similar known festivals, auto-apply. Most magical, least transparent.

CC should propose during §P1 recon based on what fits existing data best. If unclear, halt and ask Adam.

---

## Resume prompt for CC (after Polish Sprint 1 merges to main)

```
New sprint. Full spec in docs/handover/CC_PAYROLL_PRODUCT_BUILD.md.

Reference for what the payroll product MUST do:
docs/handover/PAYROLL_REFERENCE_GOOGLE_SCRIPT.gs

That file is Adam's current Google Apps Script. Every rate rule, day-type classification, per-diem rule, and PDF layout decision is in there. Read it before §P1.

Branch: feat/payroll-product off main (after Polish Sprint 1 merges).

Six sub-phases in order:
  §P1 — Data model + migration
  §P2 — Personnel rates UI (with admin-gated internal rate)
  §P3 — Payroll grid foundation, read-only
  §P4 — Advance inline editing + week persistence
  §P5 — Per-person PDF generation (Puppeteer + brand color)
  §P6 — Combined all-staff PDF with internal rate substitution

Halt-and-report at 400 LOC per sub-phase. Standard report format: hash, files (path:line), verify (tsc/lint/build), smoke instructions for Adam, blockers.

§P1 has mandatory recon. Report findings in commit body before extending schema.

Open question — ACL Per Diem exception model — needs answer in §P1 recon. Propose based on existing routing data shape; halt if unclear.

Out of scope: Rooming, Rider rebuild, Phase B.5, Phase C, Flight email tracker.
```
