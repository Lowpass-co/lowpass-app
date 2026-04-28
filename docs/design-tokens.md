# Lowpass Design Tokens

> Canonical reference for every design token. All UX-overhaul prompts assume this doc exists. Components must compose from these tokens—no ad hoc literals on new work.

## 0. Audit (as of 2026-04-26, commit `git log -1` date: Sun Apr 26 12:27:49 2026 -0700)

Scanned: `src/app/**/*.{tsx,ts,css}`, `src/components/**/*.{tsx,ts,css}`, `src/lib/**/*.{tsx,ts}`. `globals.css` excluded from “inline literal” rows (it is the source of truth, not a consumer).

| Category | Pattern / scope | Count | Notes |
|----------|-----------------|------:|--------|
| Hardcoded hex `#…` | `.ts` / `.tsx` | 236 | Colours, SVG fills, type maps (e.g. `theme.ts`, bug severity), login hero |
| `rgb(…)` / `rgba(…)` | same | 66 | Often muted overlays and shadows in components |
| `style={{` containing `#` | same | 79 | `style={{ color: '#…' }}` on branded surfaces; Bug Reports, Budget, etc. |
| `var(--lp-…)` usage | by token (top) | 448 | Most used: `--lp-border` (108), `--lp-text-tertiary` (80), `--lp-text` (64), `--lp-text-secondary` (55), `--lp-surface` (30) |
| `boxShadow:` in TS/TSX | | 2 | Rare; most shadows in CSS or Tailwind `shadow-*` |
| `box-shadow:` in TS/TSX | | 4 | String-injected or inline styles |
| `borderRadius:` in TS/TSX | | 3 | |
| `padding:` with `px` literal in `style` | | 4 | |
| `zIndex:` in TS/TSX | | 19 | |
| `z-[…]` Tailwind (stacking) | | ~59 of 78 `z-` / z-index style lines not otherwise counted | Stacking contexts vary by page |
| `fontSize:` in TS/TSX | | 4 | Login, marketing-style overrides |
| `font-size` in TS/TSX | | low | Most type from `main` / Tailwind / globals |
| `transition:` in TS/TSX | | 5+ files | Mix of `0.15s`, `250ms`, and vars |

**`var(--lp-*)` frequency (Top 10 token names, substring match)**

| Token prefix / name | Count |
|---------------------|------:|
| `--lp-border` | 108 |
| `--lp-text-tertiary` | 80 |
| `--lp-text` (includes `--lp-text-…`) | 64+ |
| `--lp-text-secondary` | 55 |
| `--lp-surface` | 30 |
| `--lp-bg-secondary` | 28 |
| `--lp-orange` (as colour ref in `var`, includes `--color-lp-*` patterns in mix) | 27 |
| `--lp-sidebar-text-muted` | 9 |
| `--lp-sidebar-border` | 8 |
| Other sidebar / dashboard / budget adaptive tokens | ≤6 each |

**Representative examples (5 each)**

1. **Hex in TS/TSX**  
   - `src/app/(auth)/login/page.tsx:183` — `background: '#0a0a0a'`, `color: '#fff'`  
   - `src/components/bug-report/types.ts` — severity hex map  
   - `src/lib/theme.ts` — status colour map  
   - `src/components/budget/BudgetRoutingMap.tsx` — map / chart colours  
   - `src/components/equipment/InventoryTab.tsx` — inline chip / status colours  

2. **`rgba` / `rgb` in TS/TSX**  
   - `src/components/bug-report/BugReportsClient.tsx` — `color-mix` / `rgba` in inline styles  
   - `src/components/budget/SummaryTab.tsx` — card / chart fills  
   - `src/components/layout/Sidebar.tsx` — border / overlay tints  
   - `src/components/calendar/CalendarView.tsx` — event colours  
   - `src/app/(app)/tours/.../AdvanceSectionBuilder.tsx` — `box-shadow: … rgba(0,0,0,0.2)` in `cssText` string  

3. **`style` with hex**  
   - `BugReportsClient.tsx` — `style={{ color: '#3b82f6' }}` (status)  
   - `Sidebar.tsx` — mixed `var(--lp-…)` and literal accents  
   - `BudgetRoutingMap.tsx` — line/banner colours  
   - `login/page.tsx` — full-bleed marketing background  
   - `ImportModal.tsx` (equipment) — borders and highlights  

4. **Inline `box-shadow` / `border-radius` in TS/TSX**  
   - `BrandedSelect` / `ContextMenu` — Tailwind + shadow classes; a few `style` shadows in modals  
   - `JobModal` / `InventoryModal` — `transition: border-color 0.15s` and radii in template strings  
   - `SlidingToggle.tsx` — `transition: 'left 250ms cubic-bezier(…)'`  
   - `ManageTourSegmentNav` — `transition: pillTransition`  
   - `AdvanceOverview` — `style={{ transition: 'cubic-bezier(0.4, 0, 0.2, 1)' }}` on SVG  

5. **`zIndex` / stacking**  
   - `BrandedSelect` / portaled dropdowns: `z-[1000]` or `lp-dropdown-layer` class  
   - `FloatingBugReport.tsx` — high z for modal stack  
   - `ChannelList` / grid overlays — `z-30` / `z-50` style patterns  
   - `ImportRiderPackDialog` — `z-50` flex overlay  
   - `DayTypeDropdown.tsx` — `z-[70]` for combobox layer  

**Worst offenders (by aggregate inline-literal score: hex + rgba + `style#` + `boxShadow` + `borderRadius` + `padding` px + `zIndex` + `fontSize` + `z-[` + `transition` ms in file)**

| Rank | File | Approx. score |
|------|------|---------------:|
| 1 | `src/app/(auth)/login/page.tsx` | 74 |
| 2 | `src/components/equipment/ImportModal.tsx` | 42 |
| 3 | `src/components/equipment/InventoryTab.tsx` | 42 |
| 4 | `src/components/bug-report/BugReportsClient.tsx` | 41 |
| 5 | `src/app/(app)/tours/[id]/advance/[routingId]/AdvanceSectionBuilder.tsx` | 40 |
| 6 | `src/lib/theme.ts` | 39 |
| 7 | `src/components/bug-report/FloatingBugReport.tsx` | 19 |
| 8 | `src/components/routing/RoutingMap.tsx` | 18 |
| 9 | `src/components/layout/Sidebar.tsx` | 16 |
| 10 | `src/components/calendar/CalendarView.tsx` | 13 |

(Score is heuristic; use as triage for Phase D cleanups, not a precise metric.)

**Open questions (audit gaps)**  
- Tailwind default palette utilities (`text-red-500`, `bg-slate-700`, etc.) were not exhaustively tallied; grep targets were explicit literals and `lp` tokens.  
- Some components use `color-mix(in srgb, var(--lp-orange) …)`—prefer keeping `color-mix` in CSS, not string-built hex in JS.

---

## 1. How tokens work in this codebase

| Layer | Role |
|-------|------|
| `@import "tailwindcss";` + `@theme inline` | Registers design tokens for Tailwind v4 (e.g. `bg-lp-surface`, `--color-lp-*`). |
| `:root` | Light-mode adaptive values (`--lp-bg`, `--lp-text`, …). |
| `.dark` | Dark overrides for the same semantic names. |
| `main`, `.lp-budget`, components | Composed with CSS variables, Tailwind, and inline `style` (legacy). |

**Hex + alpha in JS/TS:** use full literals (`#FF45001a`, `rgba(255,69,0,0.1)`), never `var(--x) + '1a'`. See [§11](#11-hexalpha-rule).

---

## 2. Colours (existing; not renamed)

| Group | Tokens (semantic) | Light | Dark (where adaptive) |
|-------|-------------------|-------|------------------------|
| Core | `--lp-bg`, `--lp-bg-secondary`, `--lp-bg-tertiary` | #FFFFFF / greys | #0F0F0F / dark greys |
| Surface | `--lp-surface`, `--lp-surface-hover` | cards / panels | |
| Border | `--lp-border`, `--lp-border-light` | hairlines | |
| Text | `--lp-text`, `--lp-text-secondary`, `--lp-text-tertiary`, `--lp-text-inverse` | body hierarchy | |
| Table header | `--lp-table-header-text` + `.lp-table-header-text` | #471300 | muted |
| Brand | `--color-lp-orange*`, `color-mix` subtle washes | in `@theme` | |
| Status / day / sidebar / dashboard / budget | As in `globals.css` `@theme` and `:root` / `.dark` | see file | see file |

The `/admin/design-tokens` preview page lists every `--lp-` / `--color-lp-` group used in the UI.

---

## 3. Spacing

| Token | Value | Use |
|-------|------:|-----|
| `--lp-space-0` | 0 | Collapse / no gap |
| `--lp-space-1` | 4px | Tight inline, icon+label |
| `--lp-space-2` | 8px | Small gaps, chips |
| `--lp-space-3` | 12px | Compact form rows |
| `--lp-space-4` | 16px | Default card padding, row gap |
| `--lp-space-5` | 20px | Between form sections |
| `--lp-space-6` | 24px | Page padding, between cards |
| `--lp-space-8` | 32px | Section gaps |
| `--lp-space-10` | 40px | Large dashboard gaps |
| `--lp-space-12` | 48px | Hero top padding |
| `--lp-space-16` | 64px | Rare major breaks |

Tailwind `p-4` / `gap-6` remain valid; the scale is the shared vocabulary for new custom CSS.

---

## 4. Type

| Token | Value | Use |
|-------|------:|-----|
| `--lp-text-2xs` | 11px | Uppercase label caps (matches `.lp-label-caps`) |
| `--lp-text-xs` | 12px | Meta, captions (`.lp-meta`) |
| `--lp-text-sm` | 13px | Dense tables |
| `--lp-text-base` | 14px | Body (`main` default) |
| `--lp-text-md` | 15px | `h2` weight 600 |
| `--lp-text-lg` | 17px | Card title |
| `--lp-text-xl` | 20px | Section heading |
| `--lp-text-2xl` | 22px | Page `h1` |
| `--lp-text-3xl` | 28px | Hero |
| `--lp-text-4xl` | 34px | Stat / marketing |
| **Line height** | `--lp-leading-tight` … `relaxed` | See preview page |
| **Weight** | `--lp-weight-regular` … `bold` | 400–700 |
| **Tracking** | `--lp-tracking-caps`, `tight` | caps / display |

**Rule:** no one-off 16.5px; pick 15 or 17.

---

## 5. Z-layers

| Token | Z | When |
|------|---|------|
| `--lp-z-base` | 0 | Default flow |
| `--lp-z-elevated` | 10 | Card hover, small lift |
| `--lp-z-sticky` | 30 | Sticky header / subnav |
| `--lp-z-overlay` | 50 | Page scrim, inline overlay |
| `--lp-z-dropdown` | 1000 | Portaled menus, popovers |
| `--lp-z-modal-backdrop` | 1100 | |
| `--lp-z-modal` | 1110 | Dialog content |
| `--lp-z-slide-over-backdrop` | 1200 | |
| `--lp-z-slide-over` | 1210 | |
| `--lp-z-toast` | 1300 | |
| `--lp-z-tooltip` | 1400 | |
| `--lp-z-command-palette` | 1500 | ⌘K over everything |
| **Alias** | `--lp-dropdown-layer` = `var(--lp-z-dropdown)` | Resolves to **1000**; legacy / docs compatibility |

The `.lp-dropdown-layer` class in `globals.css` still uses `z-index: 1000` (unchanged) so no visual regression.

---

## 6. Motion

| Token | Value |
|-------|--------|
| `--lp-duration-instant` … `--lp-duration-page` | 0, 100, 150, 200, 250, 300ms |
| `--lp-ease-standard` | `cubic-bezier(0.4, 0, 0.2, 1)` (same family as `* { transition-timing-function }`) |
| `--lp-ease-emphasized` / `decelerate` / `accelerate` | per prompt |

**Rule of thumb:** hovers 100–150ms, fade/slide 200ms, slide-overs 250ms, full page 300ms.

---

## 7. Radii

| Token | Value | Typical use |
|-------|------:|-------------|
| `--lp-radius-xs` | 2px | Micro chips |
| `--lp-radius-sm` | 4px | Checkboxes, small controls |
| `--lp-radius-md` | 6px | Default controls |
| `--lp-radius-lg` | 8px | Cards, panels |
| `--lp-radius-xl` | 12px | Popovers, Leaflet-style |
| `--lp-radius-2xl` | 16px | Hero / marketing |
| `--lp-radius-full` | 9999px | Pills, avatars |

---

## 8. Shadows

| Token | Role |
|-------|------|
| `--lp-shadow-xs` … `--lp-shadow-xl` | Elevation tiers |
| `--lp-shadow-overlay` | Modal / panel edge + drop |
| `--lp-shadow-focus-ring` | Focus ring (pairs with `outline` rules) |

**Light** defined on `:root` (second `:root` UX01 block). **Dark** overrides in `.dark { … }` with higher rgba opacity. Preview both on `/admin/design-tokens` via the Light / Dark control.

---

## 9. Density (rows / tables)

| Token | Value |
|-------|--------|
| `--lp-row-comfortable` / `compact` / `tight` | 44 / 32 / 28px |
| `--lp-row-cell-padding-y-*` | 10 / 6 / 4px |
| `--lp-row-cell-padding-x` | 12px |

**Comfortable:** default list views. **Compact:** power grids (Budget, channel list). **Tight:** maximum-density spreadsheet (future `SpreadsheetGrid`).

---

## 10. Page shell metrics (UX02 — not yet applied in layout)

Defined in `@theme inline`: `--lp-topbar-height`, `--lp-rail-width`, `--lp-rail-collapsed`, `--lp-slideover-width`, `--lp-slideover-width-wide`, `--lp-content-padding-x` / `y`, `--lp-content-max-width`, `--lp-search-trigger-width` (the ⌘K search pill in TopBar — UX02).

Existing `--sidebar-width`, `--sidebar-collapsed-width`, `--header-height` remain for the current shell.

---

## 11. Hex+alpha rule

- **Do:** `background: #FF45001a;` or `rgba(255, 69, 0, 0.1)`.
- **Don’t:** `` `${'var(--lp-orange)'}1a` `` or any runtime concatenation of a CSS var with alpha suffix in TSX.

`color-mix(in srgb, var(--lp-orange) 14%, transparent)` is OK in CSS.

---

## 12. What is deliberately *not* a token

- Per-component background aliases (`--lp-card-bg`); use `--lp-surface`.
- `--lp-button-padding-x`-style component shortcuts; build from spacing scale.
- New brand colours in UX01; existing palette is sufficient until a later prompt proves otherwise.

---

**Preview:** [Design Tokens (admin)](/admin/design-tokens) — site admins only, `getUserAndAdminStatus` + `notFound` for others.
