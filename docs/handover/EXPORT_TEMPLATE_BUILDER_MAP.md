# Export Template Builder — Stage-A MAP + PHASING (#8 cont.)

> **MAP + PLAN + PHASING ONLY. No code.** Reviewed by Adam + Claude before any
> build. Turns the one-shot export into a **template builder** (Master-Tour /
> daysheets style): an in-app editor with a **live preview** + a settings panel,
> saving a **reusable template applied across tours + workspaces**.
>
> **Build prereq:** the render fix (`fix/export-pdf-render`, `c0f175f`) must be on
> `main` first — a template builder on a pipeline that can't render a PDF is
> pointless. The working `shell.ts` / `budget-pdf.ts` / `rooming-pdf.ts` /
> `render.ts` are the foundation we **parameterise** (we don't rebuild them).
>
> **Headline:** this is a multi-phase initiative, not a sprint. **The phasing (§5)
> is the most important output** — Phase 1 is a genuinely useful, low-risk slice
> that de-risks the one hard contract (config → HTML); the full daysheets-style
> editor window is Phase 4.

---

## 0. What exists today (the foundation to parameterise)

The export is a clean, already-generic pipeline:

- `src/lib/export/shell.ts` — `renderDocument({ letterhead, title, subtitle, bodyHtml })`
  → a self-contained A4 HTML doc: the `:root` token block (`SHELL_CSS`), `@page`
  rules, the letterhead, shared table primitives (`.lp-tbl`, `.lp-sec-head`,
  `.lp-subtotal`, `.lp-native`). Plus `PAGE_PDF_OPTIONS` + `pdfFooterTemplate()`.
  **Currently hard-codes** A4, the font stack, and the orange accent.
- `src/lib/export/budget-pdf.ts` — `buildBudgetBodyHtml(data, { scope })`: emits a
  **fixed** sequence — P&L summary (income breakdown → expenses by section → Net)
  then detail (income-by-show, expenses-by-section). The numbers come from
  `computeBudgetPnl` (the reconciliation invariant).
- `src/lib/export/rooming-pdf.ts` — `buildRoomingBodyHtml(data)`: a **fixed**
  hotel-block sequence.
- `src/lib/export/render.ts` (render fix) — `exportPdfResponse(surface, build)`:
  the shared, error-surfaced, footer-fallback render. **Every surface goes through
  it** → the template config inherits it for free.
- `src/lib/export/budget-data.ts` / `rooming-data.ts` — read-only loaders.
- `src/components/budget/ExportDialog.tsx` — today just the scope toggle. The
  Phase-1 seed for the config UI.

**The one hard new contract:** a **`TemplateConfig` object** drives the shell CSS +
the body builders. Everything else is plumbing around it.

---

## 1. Template config data model

### The config shape (recommended)

A single JSON `TemplateConfig` — **presentation only**, version-stamped so we can
migrate it as features land:

```ts
interface TemplateConfig {
  v: 1;                                   // schema version (forward-compat)
  surface: 'budget' | 'rooming' | 'payroll' | 'routing';
  page: { size: 'A4' | 'Letter' };
  general: {
    fontFamily: 'system' | 'serif' | 'mono';   // a SMALL safe set (Phase 2)
    fontScale: number;                          // 0.85–1.2 multiplier
    monochrome: boolean;                        // B&W
    dividers: boolean;                          // section rules on/off
  };
  letterhead: {
    logo: 'artist' | 'none' | { assetId: string };  // artist | hidden | uploaded
    logoAlign: 'left' | 'center' | 'right';
    logoMaxHeight: number;                      // px
    cornerRadius: number;
    background?: { assetId: string; opacity: number };  // Phase 2/4
    elements: Array<{ id: 'artist'|'tour'|'dates'|'title'|'generated'; show: boolean; order: number; align?: string }>;
  };
  footer: { show: boolean; lowpassMark: boolean; pageNumbers: boolean; zebra: boolean };
  sections: Array<{ id: string; show: boolean; order: number; style?: SectionStyle }>;
  rowOverrides?: Record<string, RowStyle>;      // Phase 4 — keyed by stable row id
  budget?: { scope: 'projected' | 'actual' | 'both' };  // surface-specific knobs
}
```

- **`sections[].id`** are per-surface, stable ids the builder owns:
  - budget: `pnl-summary`, `income-detail`, `expense-detail` (later splittable into
    `pnl-income`, `pnl-expenses`, `pnl-net`).
  - rooming: one id per logical block, e.g. `hotel-list` (or per-hotel once we want
    per-hotel reorder — start coarse).
- The config is **surface-scoped** — a budget template can't be applied to rooming
  (the section ids differ). Enforced by `surface`.
- **Defaults:** an in-code `DEFAULT_CONFIG[surface]` reproduces today's output
  byte-for-byte → "no template" === the current export. Critical so Phase 1 can't
  regress.

### Storage — shared across tours + workspaces

A new table (**Phase 3**, not Phase 1):

```sql
CREATE TABLE public.export_templates (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id  UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  name          TEXT NOT NULL,
  surface       TEXT NOT NULL,        -- 'budget'|'rooming'|'payroll'|'routing'
  config        JSONB NOT NULL,
  is_default    BOOLEAN NOT NULL DEFAULT false,  -- the workspace default per surface
  created_by    UUID, created_at TIMESTAMPTZ DEFAULT now(), updated_at TIMESTAMPTZ DEFAULT now()
);
-- RLS: workspace-scoped (financial/PII shaping) via get_my_workspace_id().
-- A partial unique index for one default per (workspace, surface).
```

- **"Shared across tours"** = the table is **workspace-scoped, not tour-scoped** →
  every tour in the workspace sees the same templates. ✅ natural.
- **"Shared across workspaces"** is the genuinely tricky ask and a **decision for
  sign-off (D-SHARE):**
  - RLS isolates workspaces by design (no cross-workspace reads). A template that
    "follows Adam everywhere" can't just be a workspace row.
  - **Recommend:** Phase 3 ships **workspace-scoped** (covers the common case). For
    cross-workspace, add a **global tier** later: `workspace_id NULL` = a system/
    Lowpass-authored template readable by ALL workspaces (RLS: `workspace_id IS NULL
    OR workspace_id = get_my_workspace_id()`), writable only by a site admin. That
    gives "Lowpass house style" everywhere without poking holes in tenant isolation.
    A user-authored template propagating to *their other* workspaces is then a
    **copy-on-apply** ("Duplicate into this workspace"), never a shared row. Flag
    this; don't build cross-workspace in Phase 3.

### Apply-to-a-tour — render-time choice (recommended)

- **Recommend: a template is a render-time selection, NOT stored on the tour.** The
  export dialog/editor picks a template (or the workspace `is_default` for that
  surface auto-selects); the route loads that template's `config` and renders.
- **Don't** put `template_id` on `tours` — it couples tours to templates, needs a
  column per surface, and breaks if a template is deleted. The workspace `is_default`
  + a per-export override is simpler and matches "shared across tours."
- Migration number: **TBD at build time** (222 is today's high-water — receipts B2;
  this lands later, re-confirm across `main` + branches then).

---

## 2. Parameterise the body builders (the core contract)

Today `buildBudgetBodyHtml(data, { scope })` is a fixed sequence. The change:

```ts
// section id → a pure renderer over (data, sectionStyle, config)
const BUDGET_SECTIONS: Record<string, (data, style, config) => string> = {
  'pnl-summary':    renderPnlSummary,
  'income-detail':  renderIncomeDetail,
  'expense-detail': renderExpenseDetail,
};
export function buildBudgetBodyHtml(data: BudgetExportData, config: TemplateConfig): string {
  return [...config.sections]
    .filter((s) => s.show)
    .sort((a, b) => a.order - b.order)
    .map((s) => BUDGET_SECTIONS[s.id]?.(data, s.style, config) ?? '')
    .join('');
}
```

- **`scope` moves into `config.budget.scope`** (today's `opts.scope`). The scope
  toggle becomes one knob of the config — no behaviour change for "Both+Variance".
- The existing private helpers (`buildIncomeDetail`, `buildExpenseDetail`,
  the P&L tables) become the section renderers — a refactor, not a rewrite.
- **Shell CSS becomes config-driven:** `renderDocument` gains a `style` param;
  `SHELL_CSS`'s `:root` injects `config.general` (font stack from `fontFamily`,
  sizes scaled by `fontScale`, accent → grey when `monochrome`) and `@page size`
  from `config.page.size`. The shell stays **generic** (it knows nothing about
  budget/rooming — config drives it).
- **THE INVARIANT (non-negotiable):** config changes **presentation only**. The
  numbers still come from `computeBudgetPnl` (EXP-BUD-01 must still reconcile to the
  cent); section renderers read the SAME `data` they do today. A template can hide
  the income detail but can NEVER change Net. Document + smoke-guard this.

---

## 3. Live-preview editor architecture

**The key enabler: the body builders are PURE + ISOMORPHIC.** `buildBudgetBodyHtml`
+ `renderDocument` import only pure helpers (`computeBudgetPnl`, `convertToCurrency`,
`escapeHtml`) — **no server-only deps** — so they run in the browser too. Only the
**data loaders** are server-only.

So the preview needs **no PDF round-trip per keystroke**:

1. Server loads the `BudgetExportData` ONCE (a GET `…/export/data` or initial props)
   and hands it to the editor.
2. The editor holds `config` in React state. On any change it calls the SAME
   `renderDocument(buildBudgetBodyHtml(data, config))` **in the browser** and drops
   the HTML into an **`<iframe srcDoc=…>`** preview pane (the HTML is self-contained
   + token-based → renders identically to the PDF, minus Chromium's page-break
   pagination). Debounced; instant.
3. **Download/PDF** posts `config` to the export route, which runs the **identical**
   builder server-side → puppeteer (the proven pipeline). Same code both sides =
   WYSIWYG by construction.

- Editor component (Phase 4): `<ExportTemplateEditor surface data config onChange>`
  — left = section list (eye-toggle + drag-reorder, reuse the Grid's reorder idiom),
  centre = the iframe preview, right = the settings panel (general/header/footer/
  per-section). Opens over the app (a full-screen `SlideOver`/modal).
- Save flow: `POST /api/export-templates` (Phase 3) persists `{ name, surface,
  config }`; "Set as default" flips `is_default`.
- **Effort: this is the biggest single build in the initiative.** The 3-pane editor
  + drag-reorder + per-section settings + live iframe is multi-sprint. Phases 1–2
  deliberately use the **existing dialog** (not the full window) so value lands
  before this.

---

## 4. Logo + image upload

- Artist logo already works: `resolveArtistLogoUrl` → `artist-assets` bucket →
  `fetchLogoDataUri` inlines it (render fix added the 8s timeout). Config `logo:
  'artist'` reuses this as-is.
- **Arbitrary header/background upload** needs (Phase 2/4):
  - A bucket `export-assets` (workspace-scoped path `{workspace_id}/{id}.{ext}`) +
    an upload route mirroring `src/app/api/artists/[id]/image/[kind]/route.ts`
    (the proven upload pattern: 5MB cap, image MIME allowlist, RLS).
  - Config stores `{ assetId }` (a storage path), NOT a URL. At render the route
    resolves it to a **signed URL → data-URI** (extend `fetchLogoDataUri` to accept
    a storage path + sign it; private-bucket-safe, same as the render fix's logo
    handling).
  - Scaling/opacity = config (`logoMaxHeight`, `background.opacity`) applied as CSS
    in the letterhead — no image processing needed.

---

## 5. PHASING — the recommendation (the key output)

I broadly agree with the strawman, with **two refinements**: (a) pull a *light*
live preview forward to Phase 2 (it's cheap — the HTML already renders in-browser —
and "reorder with no preview" feels broken), and (b) split the heavy editor window
from persistence so each lands independently.

### Phase 1 — Config + parameterised builder, in the existing dialog *(smallest usable; de-risks the contract)*
- Introduce `TemplateConfig` + `DEFAULT_CONFIG` (default === today's output).
- Parameterise `buildBudgetBodyHtml` / `buildRoomingBodyHtml` over the config
  (section show/hide + reorder); move `scope` into the config.
- `renderDocument` gains `page.size` (A4/Letter) + `logo: artist|none`.
- Extend **`ExportDialog`**: section show/hide + reorder list, page size, logo
  toggle, + the existing scope toggle. **No persistence, no preview** — config is
  per-export, posted to the route.
- **Why first:** proves the config → HTML contract end-to-end with the least surface
  area, and immediately useful (hide the detail, reorder, Letter for US promoters).
- *Effort: ~1 sprint. Risk: low (refactor of existing pure code).*

### Phase 2 — Styling + header/footer + a light live preview *(makes it feel like a builder)*
- `general`: fontFamily (small safe set), fontScale, monochrome (B&W), dividers.
- `letterhead` element show/hide + align; `footer` toggles (mark / page numbers /
  zebra).
- **Add the live `<iframe>` preview INTO the dialog** (browser-side builder; no PDF
  round-trip). Now the dialog is a mini-builder.
- Image upload (`export-assets` bucket + route) for header logo/background.
- *Effort: ~1–2 sprints. Risk: medium (CSS-from-config; preview wiring).*

### Phase 3 — Template persistence *(save / apply / set-default, workspace-shared)*
- `export_templates` table + migration (RLS workspace-scoped) + CRUD route.
- Dialog gains: template picker, "Save as Template", "Set as Default". Workspace
  `is_default` per surface auto-selects.
- Cross-workspace = the deferred global tier / copy-on-apply (D-SHARE).
- *Effort: ~1 sprint. Risk: low–medium (standard CRUD + RLS).*

### Phase 4 — The full daysheets-style editor window *(the headline; heaviest)*
- The 3-pane over-app editor: section list w/ drag-reorder, centre live preview,
  right settings panel; per-section style; **row/line-level overrides**
  (`rowOverrides` — bold/highlight/colour/size/hide), background-image scaling.
- Replaces the dialog for power users; the dialog stays as the quick path.
- *Effort: 2–3 sprints. Risk: medium–high (the editor UX + reorder + per-row keys).*

**Net:** Phases 1–3 deliver a customisable, previewable, **saveable** export (most
of the value) before the expensive editor window. If budget is tight, **Phase 1
alone** is a real step up and self-contained.

---

## 6. Blast radius + reuse

A template config touches, in order of the render:
- **`shell.ts`** — `renderDocument` gains a `style`/`page` param → CSS from
  `config.general`/`config.page`. Stays generic (no surface knowledge). *Render
  logic unchanged from the render fix — `render.ts` is untouched.*
- **`budget-pdf.ts` / `rooming-pdf.ts`** — section-map dispatch over `config.sections`.
  Same `data`, same `computeBudgetPnl`. (Payroll/Routing builders, when built,
  adopt the same section-map shape → inherit the builder for free.)
- **The export routes** — load the chosen template's `config` (or `DEFAULT_CONFIG`),
  pass it to the builder; still go through `exportPdfResponse` (render fix). A new
  `/api/export-templates` CRUD route (Phase 3).
- **`ExportDialog` → `ExportTemplateEditor`** — the UI grows across phases.
- **NEW:** `export_templates` table (Phase 3) + `export-assets` bucket (Phase 2/4).

**Guarantees:**
- **Data/reconciliation untouched** — config is presentation-only; the numbers are
  the same `computeBudgetPnl`/loader output. EXP-BUD-01 stays green.
- **Workspace RLS** — `export_templates` + `export-assets` are workspace-scoped;
  templates never leak cross-workspace (the global tier is read-only/admin-authored,
  by explicit decision).
- **Shell stays generic** — config drives it; Payroll/Routing inherit the whole
  thing once their builders exist.
- **Render pipeline reused** — `exportPdfResponse` + `getBrowser()` unchanged.

---

## Open decisions (for sign-off before any build)
- **D-SHARE** — cross-workspace sharing: workspace-scoped + a later read-only global
  tier + copy-on-apply (recommended) vs true cross-workspace shared rows.
- **D-APPLY** — template selection is render-time + workspace `is_default`
  (recommended) vs a `template_id` stored per tour.
- **D-PREVIEW** — pull the live preview into Phase 2 (recommended) vs keep it in the
  Phase-4 editor only.
- **D-SECTIONS** — section granularity: start coarse (`pnl-summary` / `income-detail`
  / `expense-detail`) vs fine (split P&L into income/expenses/net) — recommend coarse
  in Phase 1, splittable later without a config break (ids are additive).
- **D-FONTS** — a small safe font set (system/serif/mono, recommended — embed-safe
  in Chromium) vs arbitrary font upload (heavy; defer).

## STOP

Stage-A map only. Await sign-off on the **phasing** (§5), the **config shape +
storage/sharing** (§1, D-SHARE/D-APPLY), and the **preview-architecture** call
(§3/D-PREVIEW) before building Phase 1. The render fix must be on `main` first.
