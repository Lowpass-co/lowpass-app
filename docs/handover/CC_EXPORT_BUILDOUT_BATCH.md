# CC — Export build-out BATCH (autonomous, sequenced). Do Parts A→D in order, each its own commit + push.

This is a **long sequenced batch** to run unattended. Phase-1 of the template builder
(`feat/export-template-p1`) has landed: the **"Export…"** editor surface, the `TemplateConfig` object,
the parameterised `buildBudgetBodyHtml` / `buildRoomingBodyHtml`, live `<iframe srcDoc>` preview, and
section show/hide + reorder + page size + logo. The render pipeline works (budget + rooming return real
PDFs). Build out the rest of the export feature in **four parts, in order**.

> **How to run this batch (read first):**
> - Do **Part A, then B, then C, then D** — each is a **separate commit + push + a short report** before
>   you start the next. Do NOT blur them into one commit. Each stacks on the prior branch.
> - After EACH part: `next build --webpack` green · `tsc` 0 · `eslint` 0 · `git log origin/<branch>` shows
>   the commit · the part's smoke IDs in `budget.md`. Report the hash + what landed, then continue.
> - If a part hits a real blocker or an ambiguity that risks the invariants below, **stop and flag it** —
>   don't guess across it. Otherwise keep going through D.
> - **Invariants that hold for ALL four parts** (repeat them to yourself each part):
>   1. **Presentation only.** A template config can hide/reorder/restyle, but can **NEVER change the
>      numbers.** Budget P&L stays from `computeBudgetPnl`; payroll totals from the pure `fees.ts`; the
>      reconciliation smokes (EXP-BUD-01 etc.) stay green.
>   2. **`DEFAULT_CONFIG` reproduces today's output byte-for-byte** — "no customisation" never regresses.
>   3. **Shell stays generic.** `shell.ts` + `render.ts` + the contentDisposition helper are shared; don't
>      fork them per surface. New surfaces are a body builder + loader + route + button, config-aware.
>   4. **Read-only + workspace RLS.** Exports never mutate; a foreign-workspace tour 404s; financial/PII
>      (payroll, rates) never leaks cross-workspace.
>   5. **Don't touch** the render internals (`page.pdf`, `getBrowser`), the routing/income fix, or the
>      income/versioning/receipts work.
>   6. Tokens (`var(--lp-*)`) everywhere; no hardcoded hex.

---

## PART A — Phase 2: the styling layer (branch `feat/export-template-p2`, off `feat/export-template-p1`)
Make the editor *feel* like Adam's daysheets tool. Extend `TemplateConfig` + the parameterised builders +
the editor panel with the **styling controls** (the daysheets General / Header / Footer / Notes panels).
All presentation-only; `DEFAULT_CONFIG` unchanged output.

**A1 — General styling.** Add to the config + a "General" settings section + the live preview:
- **Font family** (a small **embed-safe** set — system/sans, a serif, a mono; whatever renders in headless
  Chromium without external font loads — inline the font stack, no network @font-face).
- **Font size** (a scale %, e.g. 85–120%).
- **Black & white** toggle (strip all colour → greyscale for cheap printing).
- **Dashed dividers** between sections (toggle).
- **Hide location/section boxes** (toggle — borderless variant).

**A2 — Header controls.** A "Header" settings section driving the letterhead in `shell.ts` (via config, not
by forking the shell):
- **Show header** toggle.
- **Logo:** on/off, **alignment** (left/center/right), **max-height** (slider), **corner-radius** (slider).
- **Background image:** upload (see A4) + **opacity** slider (the daysheets faded-photo header).
- **Header elements** (Artist / Tour name / Date / Day-type-or-subtitle): per-element **show/hide** +
  **align** + **drag-to-reorder**.

**A3 — Footer + Notes styling.**
- **Footer:** show/hide; display toggles (page numbers, generated-on, a tour/summary line); column width.
- **Notes/free-text sections** (where a surface has them): show title, shading on/off, B&W, column width.

**A4 — Image upload (logo + background).** Artist logo already exists (`resolveArtistLogoUrl`); add
**arbitrary header-logo + background-image upload**: a storage bucket (mirror `artist-assets`) + an upload
route + the **base64 data-URI embedding** the render needs (the render fetches the image → data-URI; a
private bucket is fine since the server fetches it). Scaling handled by the header controls (A2). Keep the
8s logo-fetch timeout pattern (already in `logo.ts`) for any image fetch so a slow host can't hang the
function.

**A5 — Live preview reflects all of it.** Every A1–A4 control updates the `<iframe srcDoc>` preview live;
the PDF route uses the identical config + builder → WYSIWYG. **Smoke `EXP-TPL2-01..`**: each control changes
both the preview AND the downloaded PDF; B&W greyscales both; DEFAULT_CONFIG still = the P1 output.

> **Part A note:** this is the biggest part. If it's getting large, split A4 (image upload) into its own
> commit on the same branch — but still finish A1–A3 + A5 before Part B.

---

## PART B — Payroll export surface (branch `feat/export-payroll`, off Part A's branch)
The third of the four surfaces, **config-aware from birth** (inherits the P1+P2 template system).
Per `EXPORT_MAP.md §3C` + Adam's spec: **master run sheet + per-person statements, one multi-page PDF.**

- **`loadPayrollExportData(tourId)`** — mirror the payroll page's loaders: `tour_personnel` roster +
  `personnel_rates` (`show_rate`/`off_rate`/`rehearsal_rate`/`rate_type`) + the day counts; totals via the
  **pure `fees.ts`** math (don't re-derive). Read-only.
- **`buildPayrollBodyHtml(data, config)`**:
  - **Run sheet** — one table, every person: role, rate(s), # show/off/rehearsal days, **total**, grand
    total. Config drives section visibility/order/styling like the others.
  - **Per-person statements** — one page each (name, their schedule, rate breakdown, amount due), appended
    after the run sheet → **one multi-page PDF** (no zip).
  - **EXCLUDE `personnel_rates.internal_rate`** from BOTH the run sheet and statements (D5 — it's the
    company's cost, never shown to crew). Note the currency.
- **Route** `POST /api/payroll/[tourId]/export/pdf` (or wherever payroll routes live) — same pattern as
  budget/rooming: auth → workspace-RLS → load → `buildPayrollBodyHtml(config)` → `shell.renderDocument` →
  render → stream, filename via the shared contentDisposition helper.
- **UI** — "Export…" on the payroll surface, the same editor (sections: run sheet / statements; the styling
  panel from Part A).
- **Smoke `EXP-PAY-01..`**: run sheet totals match the Payroll tab; statements paginate one-per-person;
  **internal rate never appears**; foreign-workspace tour gated.

---

## PART C — Routing export surface (branch `feat/export-routing`, off Part B's branch)
The fourth surface, config-aware. Per Adam: **dates / cities / venues (the tour routing), with an OPTIONAL
per-day advance summary — NOT daysheets** (he uses Master Tour for daysheets; don't rebuild those).

- **`loadRoutingExportData(tourId)`** — the `routing` table (date, city, venue, address, capacity,
  day_type), ordered by date. The **optional advance summary** pulls best-effort from
  `advance_instances.data` (free-form) — a config toggle, **off by default** (D7).
- **`buildRoutingBodyHtml(data, config)`** — one row per routing day (date · city · venue · day-type;
  address/capacity as config-toggleable columns); include show + travel/off days (all days — D7); the
  advance summary block per day only when the toggle is on. Config drives columns/visibility/styling.
- **Route** `POST /api/routing/[tourId]/export/pdf` — same pattern.
- **UI** — "Export…" on the routing surface; the toggle for the advance summary lives in the editor.
- **Smoke `EXP-ROUTE-01..`**: all routing days listed; advance summary appears only when toggled; foreign
  tour gated.

> After Part C: **all four surfaces** (budget, rooming, payroll, routing) export branded PDFs through the
> one shared shell + template system. That's the feature complete *except* template persistence (Part D).

---

## PART D — Phase 3: template persistence (branch `feat/export-template-persist`, off Part C's branch)
Save / apply / set-default templates, **shared across a workspace's tours**, per the signed-off decisions.

- **Migration** (re-confirm the next-free number across `main` + all active branches at write time — likely
  ~223): **`export_templates`** — `id`, `workspace_id`, `surface` (budget|rooming|payroll|routing), `name`,
  `config jsonb`, `is_default boolean`, timestamps. **RLS: workspace-scoped** (`workspace_id =
  get_my_workspace_id()`); a **partial unique index** for one default per (workspace, surface). Idempotent,
  down-block.
- **D-SHARE (locked):** templates are **workspace-scoped** (shared across all that workspace's tours).
  **NOT cross-tenant shared rows** (that breaks RLS isolation). Add a **read-only GLOBAL tier**
  (`workspace_id NULL`, admin-authored = Lowpass house styles) visible to all, and **copy-on-apply** (using
  a global/another template copies its config into a workspace-owned row — never a shared mutable row).
- **D-APPLY (locked):** **render-time selection + a workspace `is_default` per surface** — the export uses
  the chosen template's config, defaulting to the workspace default; the tour does NOT store a template_id.
- **CRUD route** `/api/export/templates` (GET list for surface, POST save, PATCH rename/set-default, DELETE)
  — all **workspace-scoped, RLS-enforced**; the global tier is read-only (no client writes to `workspace_id
  NULL`). 
- **UI** — in the editor: a **template picker** (Save as Template / Apply / Set as Default / the global +
  workspace lists), mirroring the daysheets template menu. Applying a template loads its `config` into the
  live editor (copy-on-apply for global).
- **Smoke `EXP-TPL3-01..`**: save a template → it lists for that surface in that workspace only (RLS — a
  second workspace can't see it); set default → a new export of that surface opens with it; apply a global
  template → its config copies in + is editable; the default partial-unique index never allows two defaults.

---

## Final hard rules (all parts)
- **Each part: branch as named, commit + PUSH, confirm `git log origin/<branch>`, report the hash, THEN
  continue.** Stacked branches FF on the prior.
- **Verify before claiming** per part — name files/lines; for anything visual, state that Adam's download is
  the final eye but the **preview-matches-PDF** WYSIWYG and the **numbers-unchanged** invariants are yours
  to prove. Reconciliation + DEFAULT_CONFIG-byte-for-byte are non-negotiable.
- Don't regress: the income/versioning/receipts work, the routing/income export fix, the render pipeline,
  or the P1 editor. `tsc` 0 · `eslint` 0 · `next build --webpack` green at every commit.
- Migration numbers: re-confirm free at write time (Part D only has one). Collisions have bitten — check
  `main` + all active branches.
