# UX01 — Tokens Audit + Extension

> First prompt in the UX overhaul roadmap. **Foundation only — no page changes, no component refactors, no visual output diffs on any existing page.** This prompt establishes the token system that every subsequent UX prompt (UX02–UX20) will assume exists. Without it, Cursor will keep improvising.

---

## 0. Context for Cursor

Read these files first, in this order, before doing anything:

1. `docs/cursor-prompts/UX_OVERHAUL_ROADMAP.md` — the overall plan. Pay attention to:
   - Section 2 (design principles)
   - Section 3 (information architecture, especially 3.4 page archetypes)
   - Section 5 (component library — what's getting built later)
2. `src/app/globals.css` — current token system. This is the file you will extend.
3. `src/app/(app)/bugs/page.tsx` and `src/components/bug-report/BugReportsClient.tsx` — the **visual aesthetic baseline**. The user has called out the Bug Reports page as "great" and "premium". The current Budget page has been called "ugly", "basic HTML", and "mad ugly". When in doubt about a token's value, look at how Bug Reports uses surfaces, spacing, type, and shadows, and align with that — not the Budget.

Lowpass uses Next 16 + React 19 + Tailwind v4 (with `@theme inline` in globals.css) + Supabase. Build is run with `next build --webpack` (Turbopack hangs on the user's Drive filesystem; the user is moving the project off Drive separately — this prompt does not change build config).

---

## 1. Why this prompt exists

The current token system has the basics — brand colour, surfaces, borders, text colours, status colours, sidebar metrics, and animation keyframes. What it is missing:

- **No spacing scale.** Components use raw Tailwind classes (`p-4`, `gap-2`, etc) inconsistently. Two cards on different pages have different paddings.
- **No type scale.** Type sizes are scattered: `main h1` is 22px, `lp-meta` is 12px, body is 14px, `lp-label-caps` is 11px — but there's no named scale, no line-height system, and no rule for which size is used where.
- **No z-layer system.** Only `--lp-dropdown-layer: 1000` exists. SlideOver, Modal, Toast, Tooltip, Command Palette will all need explicit layers.
- **No motion tokens.** The global timing function exists, but durations are inline literals (`200ms`, `150ms`, `250ms`) sprinkled across animations. No named durations or eases.
- **No radii scale.** Tailwind's default is fine but isn't named, so components don't agree on which radius is the "card radius" vs "input radius".
- **No shadow scale.** Shadows are inline literal `box-shadow` values across CSS. No named tiers.
- **No density-aware row heights.** DataTable (UX05) and SpreadsheetGrid (UX06) need explicit comfortable/compact heights; they don't exist yet.
- **No page-shell metrics for the new IA.** TopBar height, LeftRail width, SlideOver width are not defined. Sidebar metrics exist but they're about to be replaced.

Result: Cursor improvises. Pages drift. The user notices (the Budget vs Bug Reports gap is the canonical example).

This prompt fixes all of the above by adding tokens for everything subsequent prompts will reference. It does **not** apply those tokens to existing pages — that's a separate cleanup pass that will happen incidentally as each page gets redesigned in Phase D.

---

## 2. Hard rules

These are non-negotiable. Violating any of them blocks merge.

1. **No new dependencies.** Don't add a CSS-in-JS library, a token tool (Style Dictionary, Theo, etc), or anything else. Token system stays in `globals.css` + a Markdown reference doc.
2. **No visual diff on any existing page.** A user opening the app after this prompt should see exactly the same pixels they see now. The new tokens are additive only. Existing tokens keep their current values.
3. **Don't rename existing tokens.** `--lp-bg`, `--lp-surface`, `--lp-orange`, `--lp-dropdown-layer`, `--sidebar-width`, etc. all stay exactly as they are. Add new tokens alongside them.
4. **All new tokens are CSS custom properties on `:root`** (with `.dark` overrides where needed). They live in `src/app/globals.css`. No new CSS files.
5. **Hex+alpha syntax for transparency**, never concatenation in JSX/TSX. e.g. `#FF45001a` or `rgba(255,69,0,0.10)`, never `'var(--lp-orange)' + '1a'`. (Cursor has gotten this wrong before.)
6. **Document every new token in `docs/design-tokens.md`** with its purpose, value (light + dark), and example usage.
7. **The `/admin/design-tokens` preview page must be admin-only** (gate behind `getUserAndAdminStatus`/`isAdmin` exactly like `/bugs/page.tsx`). It is a tool for development QA, not a user-facing page.
8. **No TypeScript any. No `// @ts-ignore`. No commented-out code.** Repo-wide standards apply.
9. **Run `npm run lint` and `npm run typecheck` at the end and fix everything they flag.** Both must exit clean.
10. **Do not run `npm run build`** in your working session — the user has reported it hangs on the Drive filesystem. Lint + typecheck is sufficient verification for this prompt.

---

## 3. Step 1 — Audit current token usage

Before adding anything, produce a written audit so the user can see the current state. This goes in `docs/design-tokens.md` as the first section.

### 3.1 What to scan

Walk these directories with grep/ripgrep:

- `src/app/**/*.{tsx,ts,css}`
- `src/components/**/*.{tsx,ts,css}`
- `src/lib/**/*.{tsx,ts}`

For each of the categories below, count occurrences and produce a representative sample (5 examples each):

| Category | Pattern to find | What to record |
|----------|----------------|----------------|
| Hardcoded hex colours | `#[0-9a-fA-F]{3,8}` (excluding `globals.css`) | File, line, value |
| Hardcoded `rgb(` / `rgba(` | `rgba?\(` (excluding `globals.css`) | File, line, value |
| Inline `style={{ color: '#…' }}` | `style=\{\{[^}]*#` | File, line |
| Existing `--lp-*` token use | `var\(--lp-` | Count by token name (which tokens are most/least used) |
| Inline `box-shadow` literals | `boxShadow:` and `box-shadow:` outside globals.css | File, line, value |
| Inline `borderRadius` literals | `borderRadius:` and `border-radius:` outside globals.css | File, line, value |
| Inline `padding`/`margin` literals (px values) | `padding:\s*\d` and `margin:\s*\d` outside globals.css | File, line, value |
| Inline `transition` durations | `transition:` outside globals.css | File, line, value |
| Inline `z-index` literals | `zIndex:` and `z-index:` outside globals.css | File, line, value |
| Inline font sizes | `fontSize:` and `font-size:` outside globals.css | File, line, value |

### 3.2 Output

Write the audit to the **top of `docs/design-tokens.md`** under a section called `## 0. Audit (as of <date>)`. Use the date from `git log -1 --format=%cd`. Keep it tight — this is a snapshot, not a novel. A typical audit section should be 80–150 lines of Markdown.

The audit's purpose is to **prove the token gap is real** (so the user can see why the rest of the doc exists) and to **identify the worst offenders** (files with the most inline literals — these are the first targets for the Phase D cleanup).

End the audit with a "Worst offenders" table: top 10 files by total inline-literal count, ranked descending.

---

## 4. Step 2 — Extend the token system

Edit `src/app/globals.css`. All additions go inside the existing `@theme inline` block (for Tailwind v4 token exposure) **or** the existing `:root { … }` block (for adaptive CSS-only tokens), following the convention already in the file.

When a token is **adaptive** (light/dark), define it on `:root` and override on `.dark`. When a token is **fixed** (same in both modes), define it once on `@theme inline` so Tailwind utility classes can pick it up.

Add the following groups, in this order, with section comment banners matching the existing style (see lines 6–10 and 76–80 of current `globals.css` for the format).

### 4.1 Spacing scale

Lowpass spacing is multiples of 4px. Lock the scale:

```css
--lp-space-0:   0;
--lp-space-1:   4px;   /* tight inline gaps, icon-text */
--lp-space-2:   8px;   /* small gaps, chip padding */
--lp-space-3:   12px;  /* compact form rows */
--lp-space-4:   16px;  /* default row gap, card inner padding */
--lp-space-5:   20px;  /* between form sections */
--lp-space-6:   24px;  /* page padding, between cards */
--lp-space-8:   32px;  /* between page sections */
--lp-space-10:  40px;  /* large dashboard gaps */
--lp-space-12:  48px;  /* page top padding on hero pages */
--lp-space-16:  64px;  /* rare — major section breaks */
```

These are **not** a replacement for Tailwind's `p-4`, `gap-6` etc — those keep working. The scale exists so that custom CSS in components has a single source of truth and matches Tailwind's defaults.

### 4.2 Type scale

```css
/* Sizes — px values, not rem, so they don't drift with browser zoom */
--lp-text-2xs:    11px;  /* labels-caps existing */
--lp-text-xs:     12px;  /* meta, captions */
--lp-text-sm:     13px;  /* dense table rows */
--lp-text-base:   14px;  /* body — current default */
--lp-text-md:     15px;  /* h2 existing */
--lp-text-lg:     17px;  /* card heading */
--lp-text-xl:     20px;  /* section heading */
--lp-text-2xl:    22px;  /* h1 existing */
--lp-text-3xl:    28px;  /* page hero */
--lp-text-4xl:    34px;  /* dashboard stat */

/* Line heights — paired by usage, not by size */
--lp-leading-tight:  1.2;   /* large display, page heroes */
--lp-leading-snug:   1.3;   /* h1/h2 */
--lp-leading-normal: 1.5;   /* body, default */
--lp-leading-relaxed: 1.65; /* long-form prose, advance reading */

/* Font weights */
--lp-weight-regular:  400;
--lp-weight-medium:   500;
--lp-weight-semibold: 600;
--lp-weight-bold:     700;

/* Letter spacing (tracking) */
--lp-tracking-normal: 0;
--lp-tracking-caps:   0.1em;  /* matches existing lp-label-caps */
--lp-tracking-tight:  -0.01em; /* large display headings */
```

**Rule**: do not introduce more sizes. Components must compose from this scale. If a designer or Cursor wants 16.5px, the answer is no — round to one of `--lp-text-md` (15) or `--lp-text-lg` (17).

### 4.3 Z-layer system

Replace `--lp-dropdown-layer: 1000` with a full layer scale. **Keep `--lp-dropdown-layer` as an alias of `--lp-z-dropdown` so existing usage still works.**

```css
--lp-z-base:              0;
--lp-z-elevated:          10;   /* card-hover lift */
--lp-z-sticky:            30;   /* sticky table header, sticky nav row */
--lp-z-overlay:           50;   /* page-level scrim */
--lp-z-dropdown:          1000; /* matches existing --lp-dropdown-layer */
--lp-z-modal-backdrop:    1100;
--lp-z-modal:             1110;
--lp-z-slide-over-backdrop: 1200;
--lp-z-slide-over:        1210;
--lp-z-toast:             1300;
--lp-z-tooltip:           1400;
--lp-z-command-palette:   1500; /* highest — ⌘K can open over anything */

/* Backwards-compatible alias */
--lp-dropdown-layer:      var(--lp-z-dropdown);
```

### 4.4 Motion tokens

```css
--lp-duration-instant:  0ms;
--lp-duration-fast:     100ms;  /* hover, press feedback */
--lp-duration-base:     150ms;  /* default — buttons, inputs, tooltips */
--lp-duration-slow:     200ms;  /* fade-in/out, slide-up — matches existing animations */
--lp-duration-slower:   250ms;  /* slide-over enter, scale-in */
--lp-duration-page:     300ms;  /* page transitions */

--lp-ease-standard:    cubic-bezier(0.4, 0, 0.2, 1);  /* matches global * { transition-timing-function } */
--lp-ease-emphasized:  cubic-bezier(0.2, 0, 0, 1);    /* enter motion, slide-over */
--lp-ease-decelerate:  cubic-bezier(0, 0, 0.2, 1);    /* enter only */
--lp-ease-accelerate:  cubic-bezier(0.4, 0, 1, 1);    /* exit only */
```

**Do not change** the global `* { transition-timing-function }` rule — keep that as the default ease.

### 4.5 Radii scale

```css
--lp-radius-none: 0;
--lp-radius-xs:   2px;   /* dense inline chips, micro pills */
--lp-radius-sm:   4px;   /* checkboxes (current value), small inputs */
--lp-radius-md:   6px;   /* default — buttons, inputs, table cells */
--lp-radius-lg:   8px;   /* cards, panels */
--lp-radius-xl:   12px;  /* dialogs, popups (matches Leaflet popup wrapper at line 590) */
--lp-radius-2xl:  16px;  /* hero cards, marketing surfaces — rare */
--lp-radius-full: 9999px; /* pills, avatars */
```

### 4.6 Shadow scale (adaptive)

Light mode:

```css
:root {
  --lp-shadow-xs: 0 1px 2px rgba(0, 0, 0, 0.04);
  --lp-shadow-sm: 0 1px 3px rgba(0, 0, 0, 0.06), 0 1px 2px rgba(0, 0, 0, 0.04);
  --lp-shadow-md: 0 4px 12px rgba(0, 0, 0, 0.08);    /* matches card-hover existing */
  --lp-shadow-lg: 0 8px 24px rgba(0, 0, 0, 0.10);    /* matches card-hover hover existing */
  --lp-shadow-xl: 0 16px 40px rgba(0, 0, 0, 0.12);
  --lp-shadow-overlay: 0 0 0 1px rgba(0, 0, 0, 0.04), 0 8px 24px rgba(0, 0, 0, 0.10);
  --lp-shadow-focus-ring: 0 0 0 4px rgba(255, 69, 0, 0.22);  /* matches existing focus-visible */
}
```

Dark mode (higher opacity because shadow on `#0F0F0F` is invisible at light values):

```css
.dark {
  --lp-shadow-xs: 0 1px 2px rgba(0, 0, 0, 0.20);
  --lp-shadow-sm: 0 1px 3px rgba(0, 0, 0, 0.30);
  --lp-shadow-md: 0 4px 12px rgba(0, 0, 0, 0.40);
  --lp-shadow-lg: 0 8px 24px rgba(0, 0, 0, 0.50);    /* matches existing dark popup */
  --lp-shadow-xl: 0 16px 40px rgba(0, 0, 0, 0.60);
  --lp-shadow-overlay: 0 0 0 1px rgba(255, 255, 255, 0.06), 0 8px 24px rgba(0, 0, 0, 0.50);
  --lp-shadow-focus-ring: 0 0 0 4px rgba(255, 69, 0, 0.35);
}
```

### 4.7 Row density

For UX05 (DataTable) and UX06 (SpreadsheetGrid):

```css
--lp-row-comfortable: 44px;  /* default */
--lp-row-compact:     32px;  /* power-grid, budget */
--lp-row-tight:       28px;  /* spreadsheet maximum density */
--lp-row-cell-padding-y-comfortable: 10px;
--lp-row-cell-padding-y-compact:      6px;
--lp-row-cell-padding-y-tight:        4px;
--lp-row-cell-padding-x:              12px;  /* same across densities */
```

### 4.8 Page-shell metrics (for UX02)

```css
--lp-topbar-height:        56px;
--lp-rail-width:           240px;
--lp-rail-collapsed:       56px;
--lp-slideover-width:      480px;
--lp-slideover-width-wide: 640px;  /* for entity views with many fields */
--lp-content-padding-x:    24px;
--lp-content-padding-y:    24px;
--lp-content-max-width:    1440px; /* optional cap on ultra-wide displays */
```

**Keep `--sidebar-width`, `--sidebar-collapsed-width`, `--header-height` exactly as they are.** They are still in use by the current sidebar. UX02 will introduce the new shell alongside, then UX04 retires the old sidebar metrics.

### 4.9 Numeric / tabular

For Budget and any spreadsheet-style number column:

```css
--lp-font-numeric: var(--font-mono); /* optional — Geist Mono looks good for numbers */
```

This is opt-in. The Budget rebuild (UX14) decides whether to use it.

### 4.10 What NOT to add

- **Do not** add new colour tokens. The existing palette is sufficient. If UX02–UX08 turns out to need one, it gets added then.
- **Do not** add token aliases like `--lp-button-padding-x`. Components compose from primitives. Aliases lock-in component shapes prematurely.
- **Do not** add per-component tokens (`--lp-card-bg`, etc). Cards use `--lp-surface`, full stop.

---

## 5. Step 3 — Build the `/admin/design-tokens` preview page

Create a new page at `src/app/(app)/admin/design-tokens/page.tsx`.

### 5.1 Access control

Mirror `src/app/(app)/bugs/page.tsx` exactly:

```tsx
import { notFound } from 'next/navigation';
import { getUserAndAdminStatus } from '@/lib/site-admin';
import { DesignTokensClient } from '@/components/admin/DesignTokensClient';

export default async function DesignTokensPage() {
  const { user, isAdmin } = await getUserAndAdminStatus();
  if (!user || !isAdmin) {
    notFound();
  }
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="mb-4">
        <h1 className="text-2xl font-bold" style={{ color: 'var(--lp-text)' }}>
          Design Tokens
        </h1>
        <p className="mt-1 text-sm" style={{ color: 'var(--lp-text-secondary)' }}>
          Visual reference for every Lowpass design token. Use this page when authoring components.
        </p>
      </div>
      <DesignTokensClient />
    </div>
  );
}
```

### 5.2 Client component sections

`src/components/admin/DesignTokensClient.tsx` renders **one section per token group**. For each section:

- A heading (using `--lp-text-xl` / `--lp-leading-snug`, semibold)
- A short caption explaining the group
- A grid of swatches/samples that render the actual token value

Required sections, in order:

1. **Colours** — render every `--lp-*` colour token as a swatch with its name and resolved value. Group: brand, surface, border, text, status, day-types, sidebar, dashboard, budget. Each swatch is 80×80 with a 1px border, name above, hex value below.
2. **Spacing** — for each `--lp-space-*`, render a horizontal bar of that width filled with `--lp-orange` at `0x14` opacity. Label with name + value.
3. **Type scale** — render a sample line of text at each `--lp-text-*` size, with the name and value next to it. Sample: "The quick brown fox jumps over the lazy dog. 1234567890". Below that, a paragraph showing each line-height (`--lp-leading-*`) on the same body size.
4. **Z-layers** — render 3 stacked panels demonstrating layering. Don't go higher than `--lp-z-modal` here — too disruptive.
5. **Motion** — for each `--lp-duration-*` paired with each `--lp-ease-*`, a small box that translates 200px on hover. Click toggles the duration. Mostly a curiosity tool, but useful for picking the right motion.
6. **Radii** — render a 64×64 box for each `--lp-radius-*`. Background `--lp-surface-hover`, border `--lp-border`. Name + value below.
7. **Shadows** — render a 120×80 box for each `--lp-shadow-*`. Background `--lp-bg`, no border (so the shadow is the only visible boundary). Toggle to flip light/dark for QA against both modes.
8. **Row density** — render three sample tables (3 rows × 4 cols of fake data), one per density. Use `--lp-row-comfortable` / `-compact` / `-tight`. Header row uses `--lp-table-header-text`.
9. **Page-shell metrics** — render a scaled-down diagram of the future shell (top bar + left rail + content + slide-over). Just a static SVG-or-divs mockup with the metrics labelled.

### 5.3 Layout

The page itself uses the existing app shell (whatever `(app)` group provides) — do not introduce the new TopBar/PageShell here, since UX02 hasn't run yet. This page just lives inside the current chrome.

Within the page, the sections are stacked vertically with `--lp-space-12` between them. Each section is wrapped in a card using `--lp-surface` background, `--lp-border` border, `--lp-radius-lg` corners, `--lp-shadow-sm`.

### 5.4 Theme toggle

Top of the page, a small switcher: `Light | Dark`. It applies/removes the `.dark` class on `<html>` so the user can QA shadow scale and adaptive colours in both modes without leaving the page. Use the existing dark-mode mechanism — don't introduce a new one. (If there's already a global theme toggle, just add a hint that it controls this page too, no new toggle.)

---

## 6. Step 4 — Document everything in `docs/design-tokens.md`

Create `docs/design-tokens.md` with the following structure:

```markdown
# Lowpass Design Tokens

> Canonical reference for every design token. All UX-overhaul prompts assume this doc exists. Components must compose from these tokens — no inline literals.

## 0. Audit (as of <date>)
[output of Step 1 goes here]

## 1. How tokens work in this codebase
[short explanation: globals.css, @theme inline vs :root, light/dark, hex+alpha rule]

## 2. Colours
[every colour token, with light value and dark value (if adaptive), and one-line purpose]

## 3. Spacing
[each --lp-space-* with px value and intended use]

## 4. Type
[each --lp-text-*, --lp-leading-*, --lp-weight-*, --lp-tracking-* with use case]

## 5. Z-layers
[the layer scale + one-paragraph explanation of when to use which]

## 6. Motion
[durations + eases, with rule of thumb: when to use which]

## 7. Radii
[the scale + which surfaces use which radius]

## 8. Shadows
[scale + adaptive note]

## 9. Density
[row heights + cell paddings, with rule for picking comfortable vs compact]

## 10. Page-shell metrics
[topbar/rail/slideover/content metrics — note that these are introduced for UX02 and not yet applied]

## 11. Hex+alpha rule
[explicit rule with right + wrong example, since Cursor has gotten this wrong before]

## 12. What's deliberately NOT a token
[list: per-component tokens, button-padding aliases, additional colours — anything we said no to in this prompt]
```

Each section should be **terse**. Tables not prose where possible. The whole doc should be ~250–400 lines of Markdown. It's a reference, not a tutorial.

Add a link to this doc from the project's main `README.md` under a "Design system" heading (1 line).

---

## 7. Step 5 — Verification

Before marking the prompt done:

1. `npm run lint` — exits 0
2. `npm run typecheck` — exits 0
3. Visit `/admin/design-tokens` while signed in as a site admin — page renders, all 9 sections visible, light/dark toggle works
4. Visit `/admin/design-tokens` while signed in as a non-admin — `notFound()` (404)
5. Visit any existing page (Dashboard, Advance, Budget, Bug Reports) — **no visual diff** versus the same page on `main` before this prompt
6. `git diff src/app/globals.css` — only additions; no deletions, no edits to existing token values
7. `docs/design-tokens.md` exists, audit section is populated with real numbers, every token group has a section
8. README has the design-system link

If any of those fail, fix before committing.

---

## 8. Acceptance criteria (the user will check these)

- [ ] All token groups in §4 (4.1 → 4.9) added to `globals.css`
- [ ] No existing token renamed or revalued
- [ ] `--lp-dropdown-layer` still resolves to 1000 (backwards compat)
- [ ] `/admin/design-tokens` exists, admin-gated, and renders all 9 sections
- [ ] Theme toggle on the preview page flips light/dark for that page
- [ ] `docs/design-tokens.md` exists with audit + all 12 sections populated
- [ ] Audit identifies the top 10 worst offenders for inline literals
- [ ] README links to the design-tokens doc
- [ ] `npm run lint` and `npm run typecheck` exit clean
- [ ] No visual diff on existing pages
- [ ] No new dependencies added to `package.json`
- [ ] Hex+alpha rule respected throughout (no JS string concatenation of CSS vars)

---

## 9. Out of scope (do NOT do these in this prompt)

- ❌ Don't refactor any existing component to use the new tokens. That's a follow-up cleanup that happens incidentally during Phase D page redesigns.
- ❌ Don't build TopBar / LeftRail / PageShell. That's UX02.
- ❌ Don't build SlideOver. That's UX03.
- ❌ Don't build DataTable / SpreadsheetGrid / TimelineDashboard / DocumentCanvas. Those are UX05–UX07.
- ❌ Don't migrate existing pages. UX04 does that for the shell.
- ❌ Don't touch the budget page, channel list, or rider pack work.
- ❌ Don't add a colour token for "primary action button" — buttons compose from `--lp-orange` directly.
- ❌ Don't change build config, dependencies, or `next.config.ts`.

---

## 10. Commit plan

One commit, message:

```
UX01: tokens audit + extension foundation

- Audit current token usage in docs/design-tokens.md §0
- Add spacing, type, z-layer, motion, radii, shadow, density, page-shell metric tokens to globals.css
- Build /admin/design-tokens preview page (admin-only)
- Document tokens in docs/design-tokens.md
- No visual change to any existing page
```

After commit, push the branch. Do not merge to main without the user's review.

---

## 11. If you get stuck

If any step is ambiguous, **stop and ask in the PR description rather than guessing**. The user has explicitly said: longer prompts and considered checks beat fast turnarounds. Better to clarify than to invent a token that locks in a bad decision.

Specifically, if the audit reveals a token gap not covered by §4 (e.g. a category of inline literal we haven't categorised), document it at the bottom of `docs/design-tokens.md` under "Open questions" rather than improvising a new token group.
