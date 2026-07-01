# CC — Export Template Builder (#8 cont.). Stage A (map + plan + PHASING only). Gated.

Adam wants the export to become a **template builder** modelled on his daysheets tool (Master Tour-style):
an in-app editor window with a **live preview** + a right-hand settings panel, where you customise the
PDF and **save it as a reusable template applied across tours + workspaces**. This is a major feature — map
it, propose a **phasing** (Phase 1 = smallest usable slice), surface the schema + architecture decisions.
**No code. Reviewed by Adam + Claude before any build.**

> Prereq: the **render fix** (`CC_EXPORT_PDF_RENDER_FIX.md`) must land first — a template builder on a
> pipeline that can't render a PDF is pointless. Assume the working shell/body builders
> (`shell.ts`, `budget-pdf.ts`, `rooming-pdf.ts`) as the foundation to parameterise.

## The target feature set (from Adam's daysheets tool — for scope, not 1:1)
- **Editor window** opens over the app: left = item/preview list, centre = **live preview** of the PDF,
  right = settings panel.
- **Sections** (per surface — budget: P&L/expense/income; rooming: hotel blocks; etc.): **show/hide** (eye
  toggle) + **drag-to-reorder**.
- **Per-section settings**: General (font family, font size, B&W, dividers), Header (logo upload +
  alignment + max-height + corner-radius, background image + opacity, header elements show/hide + align +
  reorder), Footer (toggles, "days to show", zebra stripes), Notes (title/shading/B&W/column).
- **Row/line-level styling** (the daysheets schedule-row popover): bold, highlight colour, font colour,
  text size, reorder, hide.
- **Logo + background image upload** with scaling.
- **Templates**: Save as Template, Apply, Set as Default — **shared across tours AND workspaces**.
- Distribution: download / email.

## ⛔ Stage A — MAP ONLY → `EXPORT_TEMPLATE_BUILDER_MAP.md`
1. **Template config data model.** Propose storing a template as a **JSON config** (section order +
   visibility, per-section style, header/footer config, logo/image refs, row overrides) — recommend the
   shape. Where does it live so it's **shared across tours + workspaces**? (a `export_templates` table:
   `workspace_id`, `name`, `surface` (budget/rooming/payroll/routing), `config jsonb`, `is_default`; RLS
   workspace-scoped). Map the migration (number TBD at build — 222 is the high-water; this is later).
   How does "apply to a tour" work — does the tour store a `template_id`, or is template purely a
   render-time choice? Recommend.
2. **Parameterise the body builders.** Today `buildBudgetBodyHtml` / `buildRoomingBodyHtml` are fixed.
   Map how a **config object** drives them: section order/visibility, styling, header/footer. The config →
   HTML is the core contract. Keep the **reconciliation/data invariants** (P&L still from
   `computeBudgetPnl`; the config only changes presentation, never the numbers).
3. **Live-preview editor architecture.** The preview must reflect the config without a full PDF round-trip
   per keystroke. Recommend: render the **same body HTML in an in-app preview pane** (the HTML is already
   token-based, renders in the browser) driven by the live config; the PDF route uses the identical
   builder server-side. Map the editor component, the config state, and the save flow. (This is the biggest
   build — flag the effort honestly.)
4. **Logo + image upload.** Artist logo exists (`resolveArtistLogoUrl`). Map what's needed for
   **arbitrary header/background image upload** (a bucket + an upload route, like `artist-assets`), scaling,
   and the data-URI embedding the render needs.
5. **PROPOSE A PHASING** (the key output). Recommend the smallest **Phase 1** that's genuinely useful, then
   stack. Strawman to react to:
   - **Phase 1 (usable now):** rename the dialog **"Export…"**; section **show/hide + reorder**; page size
     A4/Letter; logo on/off + the existing scope toggle. A config object + the parameterised builder, but
     **no template persistence yet** (config is per-export). This alone is a big step and de-risks the
     config→builder contract.
   - **Phase 2:** styling (fonts, B&W, highlight/colour, dividers), header/footer controls, image upload.
   - **Phase 3:** **template persistence** — save / apply / set-default, shared across tours + workspaces
     (the `export_templates` table + migration).
   - **Phase 4:** the full live-preview editor window (if Phases 1–2 used a simpler dialog).
   Recommend the split based on effort vs value; don't assume mine is right.
6. **Blast radius + reuse.** Confirm the config approach keeps the shell generic (Payroll/Routing inherit
   it), doesn't touch the data/reconciliation, respects workspace RLS (templates never leak cross-
   workspace), and reuses the render pipeline. List every surface a template config touches.

Surface the data-model + the phasing + the editor-architecture recommendation. **Then stop. No code.**

## Hard rules
- **Branch off `main` (after the render fix lands). Commit the map + PUSH. Confirm `git log origin/<branch>`.**
- Stage A is a doc — name real files/lines (the export modules, the body builders, the shell).
- The template config is **presentation only** — it must never change the budget/rooming numbers or break
  the P&L reconciliation. Workspace-scoped RLS on any template storage (financial/PII).
- Be honest about effort: this is a multi-phase initiative, not a sprint. The phasing recommendation is the
  most important part of this map.
