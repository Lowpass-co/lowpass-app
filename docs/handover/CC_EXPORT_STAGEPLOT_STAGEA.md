# CC — Export: **Stage Plot** surface. Stage A (map + plan only). Gated. Branch off `main` (after v2.1).

Add the stage plot as an export surface in the unified system. **Adam's decisions (LOCKED):**
- **Start again** — do NOT reuse the old `src/lib/stage-plot/pdf-render.ts` / `dev-pdf` path; build the
  export fresh into the **unified branded shell** (same system as budget/rooming/etc.). Retire/leave the old
  dev path alone.
- **Content = the stage diagram, with an "include input list" toggle.** Diagram only = the plot; toggle on =
  the **combined stage-plot + input-list doc** (the diagram, then the channel/input list beneath — the
  classic doc venues + engineers want). (Channel-list-ONLY is the separate channel-list export surface.)
- Part of the unified builder: branded shell, page size, notes, templates, the styling controls.

**Stage A is a map + plan only — no code — reviewed by Adam + Claude before build.**

## ⛔ Stage A — MAP ONLY → `EXPORT_STAGEPLOT_MAP.md`
1. **THE crux — render the stage plot server-side.** The plot is **SVG** (`StageCanvas.tsx`), drawn
   client-side from `stage_plot_items` (positions, labels, rotation, scale, colour) + the icon catalog.
   The export route runs server-side (puppeteer). Map the options + recommend:
   - **(a) Reuse the SVG renderer server-side** — extract the pure SVG-generation from `StageCanvas` into a
     server-safe function that takes the plot data → an SVG string → embed in the shell HTML → puppeteer
     prints it. (Cleanest if the SVG gen is separable from React/interaction.)
   - **(b) Reconstruct the SVG from the data** in a new export builder (`stageplot-pdf.ts`) — draw the stage
     box + each item from `stage_plot_items` + the icon set independently.
   - Note the **icon assets** (the 154-icon catalog + AI-generated custom icons) — how they're referenced
     (inline SVG paths? image data-URIs?) and how the export embeds them so they render in headless
     Chromium (no external fetches — inline/data-URI, per the logo pattern).
2. **Data model.** `stage_plots` (title/subtitle/version_label, stage dims, brand colour),
   `stage_plot_items` (the placed gear + routing/labels), `stage_plot_custom_items`, the icon catalog. Map
   `loadStagePlotExportData(plotId)` (read-only, workspace-RLS). Note the plot lives under
   `/artists/[id]/stage-plots/[plotId]` and `/operations/[tourId]/stage-plot` — where the Export… button
   mounts.
3. **The combine.** "Include input list" → pull the channel/input list (the same loader the channel-list
   export uses) and render it beneath the diagram. Map this as two sections — **`stage-diagram` +
   `input-list`** — so the existing section show/hide model gives diagram-only vs combined cleanly.
4. **Customisation + format.** Page size, branding (the stage plot has its own title bar — reconcile with
   the shell letterhead), notes. **Excel:** the diagram has no Excel form → Excel mode exports the input
   list only (or is disabled for plot-only). Recommend.
5. **Retire the old path.** Confirm what the existing `dev-pdf` / `pdf-render.ts` + the client-side "Export
   PDF" in the stage-plot editor do, and that retiring/bypassing them for the unified export won't break the
   editor. Flag if the stage-plot builder itself is incomplete/parked enough that the export is premature.
6. **Blast radius.** The icon catalog, the SVG renderer extraction (don't break the live editor canvas),
   workspace-RLS, the shared shell staying generic.

Surface the **render-approach (a vs b)** + the icon-embedding plan + the combine model with
recommendations. **Then stop. No code.**

## Hard rules
- **Branch off `main` (after v2.1). Commit the map + PUSH. Confirm `git log origin/<branch>`.**
- Stage A is a doc — name real files/lines (`StageCanvas.tsx`, migration 109, the icon route, the existing
  pdf-render).
- Read-only; workspace-RLS; the unified shell stays generic (this is a 6th surface). Don't break the live
  stage-plot editor when extracting the SVG renderer.
