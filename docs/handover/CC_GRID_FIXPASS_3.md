# CC — Grid fix pass 3 (ROOT CAUSE found via live DOM) + refinements

The GR-3 ring and A4 insertion-line "fails" that survived two passes have a
**single proven root cause**, found by inspecting the running `/grid-demo` DOM
(not a code-read — that's why they were missed twice).

## P0 — the dead `--lp-orange` token (fixes ring + insertion line + every grid orange accent)

**Proof from the live page** (active cell, dark theme):
```
lpOrangeResolvesTo: '(UNDEFINED on this element)'
computedBoxShadow: 'none'
computedOutline:   '3px none rgb(245,245,245)'   // style 'none' → invisible
inlineStyleAttr:   'box-shadow: inset 0 0 0 2px var(--lp-orange); outline: …'  // applied, but the var is dead
```
The insertion line is the same failure: the overlay div is in the DOM,
`position:fixed`, `z-index:1400`, geometry `1632×3` at the boundary — but its
`background: var(--lp-orange)` (`Grid.tsx:1655`) resolves to nothing, so it's a
**transparent** bar. z-index was never the issue.

**Cause:** `src/app/globals.css` defines the brand colour as
**`--color-lp-orange: #FF4500`** (Tailwind v4 `@theme`). There is **no
`--lp-orange`** anywhere. The grid references `var(--lp-orange)` throughout
(`grid.css` incl. `--gr-orange-22` at `:39`, `Grid.tsx` inline `selStyle` +
`DragOverlay`, `GridSlideOver`, `GridModals`). Anything using a literal hex
(`#FF450021`) survived; anything using `var(--lp-orange)` is dead.

**Fix (preferred — one line, honours the CLAUDE.md convention that
`var(--lp-orange)` is the sanctioned token):** add an alias in the `globals.css`
`:root` so the short name resolves to the Tailwind token:
```css
:root { --lp-orange: var(--color-lp-orange); }
```
This fixes the ring, the insertion line, `--gr-orange-22` and all derived
glows, and any grid button that used `var(--lp-orange)` — in one place,
without touching grid code.

**Then VERIFY on a fresh build (do not claim done from code):** re-run the same
resolution probe — `getComputedStyle($0).getPropertyValue('--lp-orange')` on a
grid cell must now return `#FF4500` (or the resolved colour), and the active
cell's `computedBoxShadow` must be a real `inset … rgb(255,69,0)` not `none`.

**While you're at it — check for OTHER dead `--lp-<colour>` tokens the grid
uses.** Grep the grid for `var(--lp-` colour names (violet, pink, the
`--lp-grid-accent-*`, any `--lp-<status>`). For each, confirm it's actually
defined in `globals.css` (as `--lp-…`, not only `--color-lp-…`). Alias any
that are undefined the same way. Report which tokens you checked and their
resolved values.

> Note: prefer the alias over sed-replacing `var(--lp-orange)` →
> `var(--color-lp-orange)` across the grid — CLAUDE.md sanctions `--lp-orange`
> as the token name, so the real defect is the missing definition, and the
> alias keeps future grid code (and the hex+alpha rule in CLAUDE.md) valid.

## Refinements from the 2026-06-08 smoke (lower priority, after P0)

- **Grid too narrow / cuts content off** (GRID-24). The panel should fill its
  container and the Item/name column should flex to absorb leftover width;
  numbers stay fixed + right-aligned. Today it clips on the right.
- **SLIDE-02 — slide status pill not colour-coded.** The grid status pill
  carries its status colour; the slide's status pill is plain. Apply the same
  status colours in the slide.
- **SLIDE-07 — emoji lock looks cheap + spacing.** Replace the `🔒` emoji on
  the locked estimate with a proper inline lock **icon** (SVG / lucide, token
  colour), and tighten the gap — the locked group sits too far from its label.
- **B1 — Expenses/Income toggle styling.** The new demo toggle is unstyled;
  make it a proper segmented control (token-clean, matches the grid chrome).
- **Settlement slide visual polish.** It computes correctly (verified: Versus
  85% of £39,800 net → £33,830, after 20% WH → £27,064) but reads plainer than
  the playbox reference (`docs/prototypes/grid-playbox.html`). Bring the
  settlement layout/spacing/typography up to the playbox render.
- **Link / routing pills don't animate on hover; the routing pill is "always
  open".** The `🔗 ROUTING → OPEN` pill (and the link pills across the sheet)
  should be a hover affordance with the same hover treatment as the `.openbtn`
  (opacity/tint transition), not a permanently-"open"-styled static chip.

## Done =
P0 fix in `globals.css`; tsc 0 · eslint 0 · `next build --webpack` green;
`grid.md` updated (GR-3 + A4 root-caused to the dead token, marked retest);
your report states the resolved value of `--lp-orange` after the fix and lists
every `--lp-<colour>` token you verified. The refinements can land in the same
PR or a follow-up — call out which you did.
