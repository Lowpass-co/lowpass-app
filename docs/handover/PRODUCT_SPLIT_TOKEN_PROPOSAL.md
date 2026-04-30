# Product Split — Visual Token Proposal

Phase 0 deliverable. Documents the blended visual system that lands in Phase 1's shell components.

The visual reference is the three "Homepage Design Idea" HTML files Adam provided — Bloomberg-terminal aesthetic with left icon rail, JetBrains Mono numerics, brand orange accent, dense tables. Lowpass keeps Inter for body, picks up JetBrains Mono for numerics, lands at 13px base body — a deliberate blend, not a clone.

---

## §1. Typography

### Body font: Inter (existing)

Lowpass already loads Inter via `--font-sans` (Geist/Inter fallback chain in `globals.css`). No change.

### Numerics font: JetBrains Mono (NEW)

Picked up from Idea 3's nicest detail. Applied to:
- Currency values (`£42,500`, `$1.2M`)
- Dates and times (`2026-04-30`, `14:30`, `Mar 15`)
- Tabular numeric columns (estimated, actual, variance, quantities)
- Counts and IDs (`R-001`, `1 of 28`)
- Stat tile big numbers (in the new Home stat tiles)
- Anything in a tabular layout that benefits from monospaced alignment

**NOT** applied to:
- Body prose
- Headings
- Form labels and inputs
- Buttons

### Loading JetBrains Mono — no new dependency

Per the visual reference HTML files, JetBrains Mono loads via Google Fonts CDN @import:

```css
@import url('https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;500;600&display=swap');
```

That's a CSS-side load, not an npm dep. Phase 1 adds the @import to `src/app/globals.css` alongside the existing Inter import.

### Token shape

Existing tokens in `globals.css`:

```css
--font-mono: var(--font-geist-mono), "SF Mono", "Fira Code", monospace;
--lp-font-numeric: var(--font-mono);
```

Phase 1 extends:

```css
/* Promote JetBrains Mono ahead of Geist Mono in the numeric chain. */
--lp-font-numeric: 'JetBrains Mono', var(--font-geist-mono), "SF Mono", monospace;
```

`--font-mono` stays unchanged so existing Geist Mono callers (admin playgrounds, code blocks) keep their look.

### Base size: 13px (NEW)

Current Lowpass: `--lp-text-base: 14px`. Idea 3: 12px. Blend: **13px**.

```css
--lp-text-base: 13px;        /* was 14px */
--lp-text-xs: 11px;          /* was 12px */
--lp-text-sm: 12px;          /* was 13px */
--lp-text-md: 14px;          /* unchanged — used for prose */
--lp-text-lg: 16px;
--lp-text-xl: 18px;
--lp-text-2xl: 22px;
--lp-text-3xl: 28px;
--lp-text-4xl: 34px;
```

Heading scale unchanged. The shift only affects body text and small label/caption tiers.

### Density rule (CRITICAL — read this every time)

The 13px base is a default, not a mandate. Different surfaces apply density differently:

| Surface type | Body size | Numeric font | Line-height | Cell padding |
|---|---|---|---|---|
| **Tables, lists, status strips, dense data views** | 12px | `--lp-font-numeric` on numeric cells | Tight (`--lp-leading-tight`) | Compact (`--lp-space-1` to `--lp-space-2`) |
| **Detail pages, slide-overs, forms** | 13–14px | `--lp-font-numeric` on currency/dates only | Normal (`--lp-leading-normal`) | Comfortable (`--lp-space-3` to `--lp-space-4`) |
| **Headings, primary chrome** | 13–28px per scale | sans | Tight | n/a |
| **Prose (notes, descriptions)** | 14px | n/a (sans only) | Relaxed (`--lp-leading-relaxed`) | n/a |

**Default to comfortable.** Density is opt-in for surfaces where data readability + scannability matters more than breathing room. Tables/lists go dense; forms stay loose.

---

## §2. Colour tokens

The Idea 3 palette is 95% aligned with current Lowpass already. No new product-level palettes; just a few additions for dense surfaces.

### Existing tokens — keep as-is

```css
--lp-bg: #FFFFFF (light) / #0F0F0F (dark)
--lp-bg-secondary: ...
--lp-bg-tertiary: ...
--lp-surface: ...
--lp-surface-hover: ...
--lp-border: ...
--lp-border-light: ...
--lp-text: ...
--lp-text-secondary: ...
--lp-text-tertiary: ...
--color-lp-orange: #FF4500    ← brand accent (identical to Idea 3's #ff4400)
--color-lp-status-*           ← status palette (complete / not-started / in-progress / needs-review)
--color-lp-day-*              ← day-type palette (8 colours)
--color-lp-success / warning / error / info
```

### New tokens for dense surfaces

```css
/* Deeper background for table backgrounds — sits below --lp-bg
   for the "terminal pane" feel without losing dark-mode adaptiveness. */
--lp-bg-deep: #0a0a0a;                 /* dark mode only; light mode mirrors --lp-bg */

/* Panel backdrop for table headers, status strips. */
--lp-panel: #111111;                   /* dark mode; light mode = --lp-bg-secondary */

/* Two-tier border palette for dense tables. */
--lp-border-subtle: #222222;           /* dense table cell dividers (dark mode) */
--lp-border-strong: #333333;           /* card borders, modal edges (dark mode) */

/* Mono numeric content sits at a slightly cooler grey than --lp-text
   so currency columns feel deliberate. */
--lp-text-mono: #d1d5db;               /* dark mode; light mode = --lp-text */
```

Light-mode equivalents map to the existing `--lp-bg-*` and `--lp-border-*` tokens so the dense surfaces still look right when Adam toggles themes.

### What does NOT change

- No purple, no blue, no gradients introduced.
- No new product-specific accent colours. Each product (Home / Operations / Budget / Advance) reuses the existing brand orange + status palette.
- The Idea 3 mockups have a few accent colours (success green, warning amber, danger red) that already exist as `--color-lp-status-*` tokens — no additions needed.

---

## §3. Shell components — sketch only (no code yet)

Phase 1 builds these. Phase 0 documents the contract.

### `<ProductRail>`

Left icon rail, 56px wide. Always visible. Vertical stack of icon buttons:

```
┌──┐
│ H│  Home
│ O│  Operations
│ B│  Budget
│ A│  Advance
│  │
│  │  (gap)
│  │
│ S│  Settings
│ ◯│  Account avatar (bottom)
└──┘
```

API:
```ts
type ProductRailProps = {
  active: 'home' | 'operations' | 'budget' | 'advance' | 'settings' | null;
  /** Tour scope — if set, Operations/Budget/Advance icons link to scoped URLs.
   *  Otherwise they link to product overviews. */
  tourId?: string;
  user: { name: string; email: string; avatarUrl?: string | null };
};
```

Implementation notes:
- Icons via `lucide-react` (already installed) — no Phosphor dep. Lucide has direct equivalents for each rail icon (Home, Briefcase, DollarSign, ClipboardList, Settings).
- Active product gets `--color-lp-orange` background tint (8%) + full-orange icon stroke.
- Inactive icons use `--lp-text-tertiary`.
- Hover: `--lp-surface-hover`.
- Account avatar at bottom opens the account dropdown (reuses existing `AccountAvatar`).

**Replaces:** the current `<TopBar>`'s nav links section (Dashboard / Personnel / Calendar / Equipment top-level row).

### `<ProductHeader>`

Top header, 44–48px tall. Replaces the rest of the current `<TopBar>`.

```
┌────────────────────────────────────────────────────────────────────┐
│ [Artist switcher ▾]  [Tour switcher ▾]   [Search] [Notifs] [Acct] │
└────────────────────────────────────────────────────────────────────┘
```

API:
```ts
type ProductHeaderProps = {
  artists: Array<{ id: string; name: string }>;
  selectedArtistId: string | null;
  onArtistSelect: (id: string) => void;
  /** Tour switcher only renders when the current product is tour-scoped
   *  (Operations / Budget / Advance) AND an artist is selected. */
  tours?: Array<{ id: string; name: string; status: string }>;
  selectedTourId?: string;
  onTourSelect?: (id: string) => void;
  onCommandPaletteOpen: () => void;
  onSignOut: () => void;
  user: { name: string; email: string; avatarUrl?: string | null };
  isSiteAdmin?: boolean;
};
```

Implementation notes:
- Artist switcher: Foundation surface; visible across all products.
- Tour switcher: only shows in tour-scoped products. Replaces the in-page "Switch tour ▾" pill from the current Tour Hub.
- Search trigger: opens command palette (existing `<CommandPalette>` infra).
- Notifications icon: stub for v1; clicks the user's profile or a dedicated notifications panel later.
- Account: dropdown matching the current `AccountMenuContent` (Workspace / Theme / Bug reports / Sign out).

**Replaces:** rest of `<TopBar>` (logo, tour selector, library dropdown, search trigger, account avatar).

### `<ProductShell>`

Wraps the page body. Replaces `<PageShell>`. Owns the scroll context.

```
┌──┬─────────────────────────────────────────────────────────────────┐
│  │ <ProductHeader>                                                  │
│PR├─────────────────────────────────────────────────────────────────┤
│  │ <main overflow:auto>                                             │
│  │   {children}                                                     │
│  │ </main>                                                          │
└──┴─────────────────────────────────────────────────────────────────┘
```

API:
```ts
type ProductShellProps = {
  product: 'home' | 'operations' | 'budget' | 'advance';
  tourId?: string;
  artistId?: string | null;
  /** Optional left-rail slot inside the main column (per-product
   *  navigation like the existing docSections rail). When omitted,
   *  main spans the full width. */
  productNav?: ReactNode;
  children: ReactNode;
};
```

Implementation notes:
- `<main>` keeps `overflow-y: auto` (same as current `PageShell`) so per-page sticky breadcrumbs / context strips work the same way.
- The optional `productNav` slot replaces archetype-specific rails (`docSections`, `dashboard`, etc.) with a single configurable slot. Each page passes whatever rail it wants.
- Print stylesheet hides `<ProductRail>` and `<ProductHeader>`.

**Replaces:** `<PageShell>` and the five `*AppPageShell` helper functions (`listAppPageShell`, `dashboardAppPageShell`, `documentSectionsAppPageShell`, `spreadsheetAppPageShell`, `topBarOnlyAppPageShell`). The archetype-driven rail system collapses down to "page passes the rail it wants, or omits."

---

## §4. Migration strategy for existing components

The existing `<PageShell>` + `<TopBar>` + `<LeftRail>` system stays in place during Phase 1. The new shell components ship to `/admin/shell-playground` first so Adam can eyeball them in isolation.

Phase 2 introduces the new shell to ONE product first (probably Home, since it's net-new) and validates the cutover.

Phases 3–6 migrate Operations, Budget, Advance one product at a time.

Until Phase 6 ships, both shell systems coexist. Don't try to migrate everything at once — every existing tour-internal page would conflict at the breadcrumb mount point.

---

## §5. Token proposal — concrete diff

Phase 1's first commit lands these `globals.css` additions:

```css
/* JetBrains Mono via Google Fonts CDN — no npm dep. Loads alongside
   the existing Inter @import. */
@import url('https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;500;600&display=swap');

@theme inline {
  /* Promote JetBrains Mono ahead of Geist Mono in the numeric chain. */
  --lp-font-numeric: 'JetBrains Mono', var(--font-geist-mono), "SF Mono", monospace;
}

:root {
  /* Body base shifts 14px → 13px. */
  --lp-text-base: 13px;
  --lp-text-xs: 11px;
  --lp-text-sm: 12px;

  /* New dense-surface tokens. Light-mode values mirror existing
     --lp-bg-* / --lp-border-* so theme toggle still works. */
  --lp-bg-deep: var(--lp-bg);              /* light */
  --lp-panel: var(--lp-bg-secondary);
  --lp-border-subtle: var(--lp-border-light);
  --lp-border-strong: var(--lp-border);
  --lp-text-mono: var(--lp-text);
}

.dark {
  /* Dark-mode densification. */
  --lp-bg-deep: #0a0a0a;
  --lp-panel: #111111;
  --lp-border-subtle: #222222;
  --lp-border-strong: #333333;
  --lp-text-mono: #d1d5db;
}
```

**That's the entire token diff for Phase 1.** Everything else (shell components, route migrations) builds on this foundation.

---

## §6. Acceptance for §B

- ✅ Typography section documents body font (Inter) + numeric font (JetBrains Mono) + 13px base + heading scale.
- ✅ Density rule explicit: tables/lists go dense (12px, mono on numerics); forms/details stay loose (13–14px, mono on currency/dates only).
- ✅ Colour tokens proposed without introducing purple/blue/gradient.
- ✅ Shell components sketched (`<ProductRail>`, `<ProductHeader>`, `<ProductShell>`) with API contracts but no code.
- ✅ No new dependencies. JetBrains Mono via Google Fonts CDN @import (CSS-side, not npm).
- ✅ Concrete `globals.css` diff ready for Phase 1 to land.
