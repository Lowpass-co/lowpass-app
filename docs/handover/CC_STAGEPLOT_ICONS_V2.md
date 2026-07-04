# CC — Install stage-plot icon suite v2 (approved). INSTALL + VERIFY only. Single-owner. Off `main`.

Adam's re-done icon suite is a **final production handoff** at `design_handoff_icon_suite_v2/` (a mounted
folder; in bash: `/sessions/beautiful-brave-mayer/mnt/design_handoff_icon_suite_v2/`). The `files/*.ts` already
conform to the `IconDescriptor` contract and reuse the exact export names `icons/index.ts` imports. **The job
is installation + verification — do NOT redraw, "improve", or reformat the SVG bodies.**

**Precondition: single-owner tree (the payroll rate-types CC session must be finished).** Branch
`feat/stageplot-icons-v2` off `main` (28ad177).

## Steps
1. **Replace the 13 category files.** Copy each `.ts` in the handoff `files/` over the same-named file in
   `src/lib/stage-plot/icons/`: `amps, drums, drums-aux, keys, lighting, mics, monitors, musicians, signal,
   stands, strings, infrastructure, utility`. **Do NOT touch** `types.ts`, `categories.ts`, `index.ts`,
   `canonical.ts`, `drums-composites.ts` (not in the bundle).
2. **CSS.** Append the rules in `files/globals-additions.css` to `src/app/globals.css` next to the existing
   `.lp-stage-icon` block (~line 1526). Two things per the handoff:
   - `.lp-ico-tone` is a **NEW** class (the suite's second fill tone) — add it.
   - **Widen `.lp-ico-label`** so it applies to solid glyph *paths* (the lightning bolt on power icons), not
     just `<text>` (current rules at globals.css:1500/1505) — per the handoff snippet.
3. **Composites — Adam's call: NEW KITS ONLY.** Remove the `...drumComposites` spread at
   `src/lib/stage-plot/icons/index.ts:39` so only the v2 kits (`drum-kit-rh/-lh/-2tom-rh/-2tom-lh`, shipped in
   the new `drums.ts`) appear in the palette. **KEEP** the `kitLayout`/`KitPiece` re-export at index.ts:93
   (the editor uses it — don't break it); only drop the palette spread.
4. **Verify:**
   - Floor: `tsc` 0 · `eslint` 0 · `next build --webpack` green.
   - Dev pages: `/stage-plot-icon-preview` — every category renders in both modes; `/stage-plot-icons` audit
     compiles (it imports `canonicalIcons`/`kickTreatments` from the untouched `canonical.ts`).
   - Editor: place a mic boom stand, a riser, a drum kit, and a 24U rack → relative sizes look **ft-true**.
     This confirms the **scale fix** (#22): the v2 footprints are "full projected extent", removing the old
     manual ~1.5× scaling.
   - Existing saved plots: every prior icon name still exists in the superset, so `stage_plot_items.icon_name`
     keeps resolving — open an existing plot, confirm nothing renders blank.

## Notes
- This delivers the stage-plot **scale** fix (#22) for free (the footprint redesign). Combined with the
  already-landed labels-default-off + branded checkboxes, the only stage-plot item still deferred is
  **export-parity** (`buildStagePlotSvg`) — leave it, its own pass.
- Optional follow-ups from the README — do NOT do unless Adam asks: updating `icon-generator.ts`'s
  SYSTEM_PROMPT to the v2 grammar, and the `anchor?` rotation-pivot field.

## Final
Branch off `main`, commit + PUSH, floor green, report hash + which dev pages you verified + a note confirming
existing plots still resolve. This is presentation-only (no schema, no money) — merge whenever.
