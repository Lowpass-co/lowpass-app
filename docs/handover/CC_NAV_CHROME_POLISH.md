# CC — Two-bar nav + budget chrome polish (#27). Build. Branch off `main`.

The two-bar nav (`CC_NAV_IA_TWO_BAR.md`) shipped; this is the polish Adam flagged in daily use. No schema.
Branch off `main` (`feat/nav-chrome-polish`).

## Build
1. **Top-bar product dropdowns feel broken** (`src/components/shell-v2/TopProductNav.tsx`). Adam: "the top
   bar nav **closes too quickly**, the **target is too small**, it should **roll out and roll back in**, and
   the **whole button** should be the target."
   - **Whole button = the hover/click target** (not just the chevron/label).
   - **Animate** the dropdown open/close — a roll/slide (not an instant pop).
   - **Hover-intent / close delay** so it doesn't snap shut when the pointer crosses a gap (a small
     open-on-hover + delayed-close, or click-to-open that stays open). Make it forgiving.
2. **Version actions from the chip** (`ProductSubBar.tsx` + `src/components/budget/versioning/
   VersionSelector.tsx`). Adam: "add access to that [version] menu from the chip too." The version chip in
   the sub-bar should open the version selector / approve-unlock-amend menu directly (not only from
   Settings) — wire the existing `VersionSelector` actions to the chip.
3. **Kill the triple-bar / "Remaining" redundancy** (`BudgetStatsStrip.tsx` + `BudgetBurnBar.tsx` + the
   sub-bar). The budget has too many stacked bars (Remaining strip + burn bar + stats). Consolidate to the
   essential one or two; remove the redundant "Remaining $X / of $Y budget" duplication where the same
   number shows twice. Keep the burn bar OR the stats strip, not both stacked — Adam's call is "kill the
   triple-bar," so collapse to a single clean status line.

## Hard rules
- **Branch off `main`. Commit + PUSH. Confirm `git log origin/<branch>`.**
- Tokens (`var(--lp-*)`) — animations via CSS transitions, no hardcoded values. Don't regress the two-bar
  IA (the persistent Bar-2 sub-tabs stay), the version state work (B1/B2), or the budget pages.
- `tsc` 0 · `eslint` 0 · `next build --webpack` green. Smoke `NAV-POL-01..` in a smoke file.
- **Verify** — name files/lines; push the hash. Adam eyeballs the feel (the dropdown roll + the forgiving
  close are the point).
