# Export — Stage Plot surface · Stage A MAP (no code)

> **MAP + PLAN ONLY.** Reviewed by Adam + Claude before any build. Adds the stage
> plot as the **6th** surface in the unified export system (budget / rooming /
> payroll / routing / channel-list / **stage-plot**), into the SAME branded shell —
> NOT the old client `window.print()` / dev-pdf path.
>
> Adam's locked decisions: (1) **start again** — don't reuse the old delivery path;
> (2) content = the stage diagram **+ an "include input list" toggle** (diagram-only,
> or the classic combined stage-plot + input-list doc); (3) part of the unified
> builder (branded shell, page size, notes, templates, styling).

---

## 0. What exists today (the foundation)

The stage-plot feature is **shipped + stable** (merged `b4fb02e`; 17 smoke tests
`SP-01..SP-17` in `docs/smoke-tests/stage-plot.md`; migrations 109/110 applied). The
pieces relevant to an export:

- **`src/components/stage-plot/StageCanvas.tsx`** (1–540) — the live editor canvas.
  Renders the SVG from React state: pan/zoom (`ViewTransform`, :104), pointer handlers
  (:161–299), selection/drag/context-menu (:106–127), and `items.map()` (:365–476).
  Each item draws as a `<g data-canvas-item>`: icons via inline
  `<svg viewBox … dangerouslySetInnerHTML={{ __html: icon.body }}>` (:459), text as
  `<rect>+<text>` (:388–402), arrows as `<line>+marker` (:367–386). Positions /
  rotation / scale / colour come from the item data (`xFt`, `yFt`, `rotationDeg`,
  `scale`, `colorTint`). **This SVG is computed-on-render and bound to React/events —
  NOT extractable as-is.**
- **`src/lib/stage-plot/pdf-render.ts`** — already has a **PURE** server-safe SVG
  builder: `buildStagePlotSvg(plot, items, opts?)` (:40–101) → an SVG string from the
  data, and `buildStagePlotPdfHtml(plot, items, meta?, opts?)` (:103–137) → a full
  standalone HTML doc (its OWN header/footer shell). Used by the editor's client
  "Export PDF" button (`StagePlotEditor` :283–326, `window.print()`) and the dev-only
  `POST /api/stage-plots/dev-pdf` route (`@/lib/rider-packs/puppeteer` getBrowser;
  404 in production).
- **Icon catalog** — ~154 built-in icons as code constants in
  `src/lib/stage-plot/icons/*.ts` (canonical/drums/mics/amps/…); each is an
  `IconDescriptor` (`src/lib/types/stage-plot.ts` :51–77) with a raw-SVG `body` string
  + `viewBox` + `footprint`. `getIcon(name)` resolves built-ins; **custom icons**
  (`icon_name = 'custom_<uuid>'`) live in `stage_plot_custom_items.svg_content`
  (migration 109 :230–243) and are registered at runtime via `registerCustomIcons()`
  (`icons/index.ts` :62) into `CUSTOM_BY_NAME`. Icon route `GET /api/stage-plot/icons`
  returns workspace custom icons.
- **Data model** (migration 109 `109_stage_plot_builder.sql`): `stage_plots`
  (:67–93 — `stage_width_ft`/`stage_depth_ft`/`stage_shape`/`units`, the
  `show_grid`/`show_rulers`/`show_center_line`/… display flags, the title-bar
  `show_tm_name`/`show_tm_role`/`show_tm_phone`/`show_tm_email`/`show_logo_position`/
  `color_override`, `workspace_id`, `rider_pack_id`); `stage_plot_items` (:123–154 —
  `position_x_ft`/`position_y_ft`/`rotation_deg`/`scale`/`width_ft`/`depth_ft`,
  `icon_name`, `label`/`label_position`, `color_tint`, `layer`, `z_index`,
  `channel_list_row_id`); `stage_plot_versions`; `stage_plot_custom_items`;
  `stage_plot_share_links`. **RLS: every table scopes by `get_my_workspace_id()`.**
  Types: `StagePlotRow` / `StagePlotItemRow` / `StagePlotCustomItemRow`
  (`src/lib/types/stage-plot.ts`).
- **Where it lives**: `/artists/[id]/(library)/stage-plots/[plotId]` (artist library,
  `<StagePlotEditorClient>`) and `/operations/[tourId]/stage-plot` (tour-scoped list →
  inline editor). Persistence: `GET/PUT /api/stage-plots/[id]`.

---

## 1. THE CRUX — server-side render (approach a vs b)

**(a) Reuse the StageCanvas SVG renderer server-side — NOT FEASIBLE.** StageCanvas's
SVG is computed from React state + bound to pan/zoom/selection/event handlers
(:104–299). There is no pure "data → SVG" function inside it to lift; extracting one
would mean rewriting the component. Rejected.

**(b) Reconstruct the SVG from the data — RECOMMENDED, and most of it ALREADY EXISTS.**
`buildStagePlotSvg(plot, items, opts?)` in `pdf-render.ts` (:40–101) is **already a
pure, server-safe** reconstruction from `StagePlotRow` + `StagePlotItemRow[]` + the
icon registry (same geometry the canvas draws: feet→px, stage box, grid/markers, each
item's icon `body` / text / rotation / scale / colour). The dev-pdf route already
prints it via the proven puppeteer pipeline.

> **Reconciling with Adam's "start again":** "start again" means **a fresh delivery
> into the unified branded shell** — NOT re-deriving the SVG geometry (re-deriving
> would duplicate ~60 lines of fiddly feet→px math and risk drifting from
> StageCanvas). **Recommendation: keep the SVG GEOMETRY (`buildStagePlotSvg`), drop
> the old HTML SHELL (`buildStagePlotPdfHtml`) + the client `window.print()` path.**
> Extract `buildStagePlotSvg` (+ its helpers) into a shared server-safe module
> (e.g. `src/lib/stage-plot/svg.ts`, or import it directly — it has no React deps),
> and a NEW unified body builder `src/lib/export/stageplot-pdf.ts` returns
> `<div class="lp-stageplot">${buildStagePlotSvg(plot, items)}</div>` for the shared
> `renderDocument()` shell to wrap. The shell provides the branded letterhead /
> footer / page size / notes / running header — the stage plot's own title bar is
> retired in the export (see §4). **If Adam prefers zero coupling to the old file,
> the fallback is a clean copy of the geometry into `stageplot-pdf.ts`** — flagged,
> but reuse is the lower-risk call since the geometry is already pure + proven.

**Why this is safe for the live editor:** `buildStagePlotSvg` is used ONLY by
pdf-render / dev-pdf — **StageCanvas does not import it** (it renders its own SVG). So
extracting/importing it cannot break the editor canvas.

---

## 2. Icon embedding (no external fetches in headless Chromium)

The icon `body` fields are already **raw inline SVG strings** — no `<img>`, no network
URLs — so they embed directly (the export inlines them exactly like `buildStagePlotSvg`
already does). Two cases:

- **Built-in icons (~154):** code constants → available server-side for free via
  `getIcon(name)`.
- **Custom icons (`icon_name = 'custom_<uuid>'`):** stored in
  `stage_plot_custom_items.svg_content`. The loader (§3) must **fetch the workspace's
  custom items + `registerCustomIcons()` BEFORE building the SVG** so `getIcon()`
  resolves them. (Same pattern the live app uses.) No data-URI step needed — they're
  SVG paths. Category colours come from the `CATEGORY_HEX` map (literal hex), so the
  exported SVG is self-contained for puppeteer (mirrors the shell's existing
  inline-token approach).

> Edge: any custom icon that referenced an external `<image href>` (uploaded raster)
> would need inlining as a data-URI per the `logo.ts` pattern — confirm at build time
> whether `svg_content` ever holds an `<image>`; if it's always vector paths (the
> AI-generated set is), nothing to do.

---

## 3. Data model + loader

`loadStagePlotExportData(plotId)` (read-only, workspace-RLS) — note the surface is
**plot-id-scoped**, not tour-scoped like the other five (a plot lives in the artist
library and/or a tour rider pack):

1. Load `stage_plots` by id (RLS-scoped) → `StagePlotRow` (+ stage dims, display
   flags, `color_override`, the TM title-bar fields).
2. Load `stage_plot_items` for the plot → `StagePlotItemRow[]` (sorted by
   `layer`/`z_index`).
3. Load the workspace's `stage_plot_custom_items` → `registerCustomIcons()` (so
   custom `icon_name`s resolve).
4. Resolve the artist (for the shell letterhead) — the plot links via
   `rider_pack_id → rider_packs.tour_id/artist_id`; load the artist name + logo
   (`resolveArtistLogoUrl`, same as the other loaders).
5. **If "include input list" is on:** also load the channel/input list via the
   **channel-list export loader** — `loadChannelListExportData` from the 5th surface
   (`feat/export-channel-list`). The plot's items even carry `channel_list_row_id`
   FKs, so the two are natively linked. (Dependency note: this combine needs the
   channel-list surface merged first, or its loader cherry-picked.)

**Routes:** the surface keys on a **plotId**, not a tourId, so the routes differ from
the other five:
- `POST /api/stage-plots/[id]/export/pdf` + `…/preview` (auth → workspace-RLS on the
  plot → `buildStagePlotExport` → shared `renderDocument` → puppeteer; the shared
  `renderPdfBuffer` + RFC-5987 filename + total-guard from `render.ts`).
- The editor (`ExportTemplateEditor`) currently keys on `tourId`; it needs a small
  generalisation to a `{ surface, idKind: 'tour' | 'plot', id }` shape (or a parallel
  `plotId` prop) so the preview/pdf POSTs hit `/api/stage-plots/[id]/export/...`.
  Flag: this is the one editor change beyond "add a surface to the union".

---

## 4. The combine model (diagram-only vs combined)

Map to the existing **section show/hide** model — two coarse sections:

- `stage-diagram` — the SVG plot (default ON).
- `input-list` — the channel/input list beneath the diagram (default **OFF** →
  diagram-only by default; toggling it on gives the classic combined doc).

`buildStagePlotBodyHtml(data, config)` dispatches over `config.sections`:
`stage-diagram` → `buildStagePlotSvg(...)`; `input-list` → reuse
`buildChannelListBodyHtml`-style rendering (or import the channel-list input renderer)
beneath a `lp-page-break`. This gives diagram-only / combined cleanly with the
established model, and the "include input list" toggle is just the `input-list`
section's visibility. (Channel-list-ONLY stays the separate 5th surface.)

**Title-bar reconciliation:** the stage plot has its OWN title bar
(`show_tm_name`/role/phone/email/logo, `color_override`). In the unified export the
**shell letterhead supersedes it** — recommend NOT drawing the plot's internal title
bar in the export SVG (pass an `opts.titleBar: false` to `buildStagePlotSvg`, or strip
it). Surface the TM contact + version label via the shell instead: the **header notes
block** (Part D `header.notes`) or the subtitle. This keeps every export branded
consistently. `color_override` → could map to a future accent, but for v1 the shell's
branding wins; flag as a follow-up if Adam wants the per-plot accent.

---

## 5. Customisation + format

- **Page size / branding / notes / templates / styling** — inherited from the unified
  config/editor for free (it's a surface like any other). The stage diagram is
  fixed-geometry SVG, so `general.fontScale`/`monochrome` apply to the surrounding
  doc; the SVG itself scales to the page width.
- **Format (Excel):** the diagram has no tabular form. **Recommend:** in Excel mode,
  export the **input list only** (reuse the channel-list xlsx sheet) when `input-list`
  is shown; when the plot is **diagram-only**, **disable Excel** for this surface (the
  editor already hides the styling groups for Excel — add: for surface `stage-plot`
  with no input-list section, grey/disable the Excel format option with a note "the
  diagram exports as PDF only"). Don't emit a meaningless one-cell sheet.
- **Page orientation:** stages are wide — flag a likely follow-up to allow **landscape**
  (the shell is portrait-only today; `@page { size: A4 landscape }` is a small shell
  addition). Note it; don't block on it.

---

## 6. Retire the old path

- **Client `window.print()` export** (`StagePlotEditor` :283–326 `exportPdf()` →
  `buildStagePlotPdfHtml` + new window + `window.print()`): **retire** — replace the
  editor's "Export PDF" button with the shared orange `<ExportButton surface=
  "stage-plot" …>` opening the unified editor. This removes the dependency on
  `buildStagePlotPdfHtml`'s HTML shell.
- **`buildStagePlotPdfHtml` (the HTML shell, :103–137):** becomes unused once the
  client button is swapped → can be deleted in the same PR (or left dead-but-harmless;
  recommend delete to avoid two shells). **`buildStagePlotSvg` (the geometry) is KEPT
  + reused.**
- **`POST /api/stage-plots/dev-pdf`** (dev-only, 404 in prod): **leave alone** per
  Adam's note ("retire/leave the old dev path alone"). It's a dev harness; it can keep
  using the geometry. No production impact.
- **Won't break the editor:** the editor canvas (StageCanvas) is independent of both
  `buildStagePlotSvg` and `buildStagePlotPdfHtml`. Only the editor's export BUTTON
  changes (swap the handler). Verify: `StagePlotEditor` is the only client importer of
  `buildStagePlotPdfHtml`.

---

## 7. Blast radius

- **Geometry extraction** — move/import `buildStagePlotSvg` (+ its pure helpers:
  feet→px, the stage-box/grid/marker drawing) into a server-safe module. Risk: LOW —
  it's already pure + React-free; StageCanvas doesn't use it. Confirm no `'use client'`
  / browser-only imports leak in (it shouldn't; it builds a string).
- **Custom icon resolution server-side** — must load `stage_plot_custom_items` +
  `registerCustomIcons()` before building. Risk: LOW (same call the app uses); ensure
  it's per-request (workspace-scoped), not a stale module-global.
- **Channel-list dependency** — the combine reuses `loadChannelListExportData` /
  the input renderer from the 5th surface. Sequence: land channel-list first (or
  cherry-pick its loader). Flag.
- **Editor plotId generalisation** — the editor keys on `tourId`; needs a `plotId`
  path for the stage-plot routes (§3). One focused change; keep it generic so a future
  artist-library surface can reuse it.
- **Workspace-RLS** — the plot routes scope on `stage_plots.workspace_id` (NOT a tour
  workspace check); a foreign plot 404s. Stage plots can be artist-library OR
  tour-scoped — the loader keys on the plot id + RLS, so both contexts work.
- **Shared shell stays generic** — this is a 6th surface; `shell.ts` / `render.ts`
  unchanged except the (optional) landscape `@page` follow-up. The SVG body is opaque
  to the shell, like every other body.

---

## RECOMMENDATIONS (for sign-off)

1. **Render = approach (b), reusing the pure `buildStagePlotSvg` geometry** (extract
   to a server-safe module), wrapped by the unified shell via a new
   `stageplot-pdf.ts`. Retire the old HTML shell + client print, keep the geometry.
   (Fallback if Adam wants zero coupling: clean-copy the geometry — flagged.)
2. **Icons embed inline** (built-ins = constants; custom = DB `svg_content` +
   `registerCustomIcons()` pre-build). No external fetches. Confirm custom SVGs are
   vector-only (no `<image>`); inline-as-data-URI only if any raster slips in.
3. **Combine = two sections** (`stage-diagram` default on, `input-list` default off);
   the "include input list" toggle is the `input-list` section visibility; reuse the
   channel-list loader/renderer. The plot's own title bar is **off** in the export —
   the shell letterhead + a header notes block carry TM contact + version.
4. **Excel** = input-list-only when included; **disabled for diagram-only**.
5. **Routes key on plotId** (`/api/stage-plots/[id]/export/{pdf,preview}`) — the one
   editor generalisation (a `plotId` path) is the notable non-trivial change.
6. **Sequencing**: the combine depends on the **channel-list surface** (5th) landing
   first. The stage-plot feature itself is complete/stable, so the export is **not**
   premature — but its smoke set `SP-01..SP-17` hasn't been bulk-run; worth a pass
   alongside the export.

## STOP

Stage-A map only. Await sign-off on: the **render approach (reuse-geometry vs
clean-copy)**, the **title-bar reconciliation** (shell supersedes the plot's title
bar), the **Excel decision** (input-list-only / disabled), the **plotId route +
editor generalisation**, and the **channel-list-first sequencing** before building.
