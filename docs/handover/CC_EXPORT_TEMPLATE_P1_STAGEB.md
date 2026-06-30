# CC — Export Template Builder **Phase 1**. Stage B: GO. Build. Branch off `main` (after the export stack lands).

`EXPORT_TEMPLATE_BUILDER_MAP.md` reviewed + signed off (phasing + decisions). The export pipeline now
**renders working PDFs** (budget + rooming, verified 200·application/pdf). Build **Phase 1 only** — the
usable editor slice — then STOP for verify. **Commit the map** if not already on a branch.

Branch off `main` **once the export stack (`fix/export-filename-header`) is merged** (it carries the working
shell + body builders + routes); if it isn't merged yet, branch off `fix/export-filename-header`. Branch
`feat/export-template-p1`.

## Phase 1 scope — the editor, no persistence yet
Adam's reference is his daysheets tool (live preview + a settings panel). P1 delivers that *shape* with a
minimal control set; styling, image upload, persistence, and row-level overrides are P2–P4.

1. **Rename + entry.** "Export branded PDF" → **"Export…"**. It opens an **editor surface** (a wide
   modal / slide-over), NOT the tiny dialog — left/main = **live preview**, right = settings panel.
2. **`TemplateConfig` object** (presentation-only) drives the body builders. Shape (from the map): section
   **order** + **visibility**, page size, logo on/off, scope (budget). **`DEFAULT_CONFIG` must reproduce
   today's output byte-for-byte** so "no customisation" can never regress (EXP-BUD-01 / EXP-ROOM-01 stay
   green). **Parameterise `buildBudgetBodyHtml` / `buildRoomingBodyHtml`** to take the config — section
   order/visibility + page size + logo. The config → HTML is THE contract; keep it pure.
3. **Live preview (pulled into P1).** The builders are isomorphic (pure, no server-only deps), so render the
   **same body HTML in an `<iframe srcDoc>`** in the editor, driven by the live config — updates on every
   change, no PDF round-trip. The PDF route runs the **identical** builder server-side → WYSIWYG by
   construction. (This is the daysheets feel; it's why it's worth pulling forward.)
4. **Controls (P1 set only):**
   - **Section show/hide** — eye toggle per section (budget: P&L summary / income detail / expense detail;
     rooming: hotel blocks / any sub-sections). Coarse sections first (additive ids — don't break later).
   - **Drag-to-reorder** sections.
   - **Page size** A4 / Letter.
   - **Logo** on / off (+ the existing **scope** toggle for budget: Projected/Actual/Both).
   - That's it for P1 — **no fonts/colours/highlight, no image upload, no save/apply** (those are P2/P3).
5. **Wire to the route.** The "Download PDF" sends the live `TemplateConfig` to
   `POST …/export/pdf` (a `config` body / param); the route passes it to the same parameterised builder.
   Config is **per-export** in P1 (no DB).

## Hard rules
- **Branch off `main` (or `fix/export-filename-header` if unmerged). Commit + PUSH. Confirm `git log
  origin/<branch>`.**
- **`DEFAULT_CONFIG` = today's output byte-for-byte.** Presentation-only: the config can hide/reorder
  sections but can **never change the numbers** — P&L still from `computeBudgetPnl`, reconciliation
  invariant holds.
- **Shared/generic** — the config + parameterised-builder pattern must let Payroll/Routing adopt it later
  with no rework; keep `shell.ts` + the render path generic. Don't touch the render or the routing/income fix.
- **No schema in P1** (no persistence). Persistence + cross-workspace sharing (D-SHARE: workspace-scoped +
  copy-on-apply + later global tier; D-APPLY: render-time + `is_default`) are **Phase 3** — don't build them.
- Tokens; `next build --webpack`; `tsc` 0; `eslint` 0. Smoke `EXP-TPL-01..` in `budget.md`: default config
  = unchanged PDF; hide a section → it's gone from preview AND the downloaded PDF; reorder → order changes
  in both; preview matches the PDF.
- **Verify before claiming** — name files/lines; push the hash. (Render proof is Adam's download; the
  preview-matches-PDF WYSIWYG is the thing to get right.)
