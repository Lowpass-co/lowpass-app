# UX02 — Shell Components (TopBar, LeftRail, PageShell)

> Builds the new app chrome: a global TopBar, an archetype-driven LeftRail, and a PageShell wrapper that composes them. **Components ship to a playground route only — no existing page is wired up to PageShell yet.** UX04 does that migration.

---

## 0. Context for Cursor

Read these files first, in this order:

1. `docs/cursor-prompts/UX_OVERHAUL_ROADMAP.md` — sections 3 (information architecture) and 5 (component library) are the contract. Section 3.1 specifies the TopBar, 3.2 specifies the archetype-driven LeftRail, 3.4 lists the four page archetypes that drive rail variants.
2. `docs/design-tokens.md` (created by UX01) — every value in this prompt comes from there.
3. `src/app/globals.css` — current design tokens.
4. `src/app/(app)/layout.tsx` (and any nested `layout.tsx` files) — current shell. Don't modify them in this prompt; just understand them.
5. `src/components/sidebar/*` (or wherever the existing sidebar lives) — current pattern for reference. Do not delete or modify.

Lowpass is on Next 16 + React 19 + Tailwind v4. Build runs via `next build --webpack`.

---

## 1. Why this prompt exists

The current shell is a fixed left sidebar. The roadmap moves to:

- **Top-bar** for global nav (Tours / Library / Templates / ⌘K / account top-right)
- **Archetype-driven left rail** (5 variants: spreadsheet sections, doc days, doc sections, list filters, dashboard structure)
- **PageShell** wrapper enforcing the layout contract

These components must exist before any page can be migrated to the new shell. UX04 will retrofit existing pages once they're built.

---

## 2. Hard rules

1. **No new dependencies.**
2. **Don't touch the current sidebar code.** The new components must coexist; UX04 retires the old sidebar by switching pages over to PageShell.
3. **Don't migrate any existing page** to use these components. The only consumer of UX02's components is the playground route described in §6.
4. All components are **`'use client'`** unless they have no interactivity. PageShell itself is a server component that wraps client children.
5. Components are typed end-to-end. **No `any`, no `// @ts-ignore`.**
6. Every component file lives at `src/components/shell/<ComponentName>.tsx`. One component per file.
7. Use design tokens from UX01 — no inline literals. (Hex+alpha rule applies.)
8. Lint + typecheck must exit clean. Build is not run.
9. Use existing icon library (`lucide-react`) — no new icon set.
10. Components must support **dark mode** without extra props (theming flows from `:root` / `.dark` adaptive tokens).

---

## 3. Step 1 — `<TopBar>`

File: `src/components/shell/TopBar.tsx`

### 3.1 Layout contract

```
[Logo]  [Tours ▾]  [Library]  [Templates]                    [⌘K search]  [account ▾]
```

- Height: `var(--lp-topbar-height)` (56px)
- Background: `var(--lp-bg)`
- Bottom border: 1px `var(--lp-border)`
- z-index: `var(--lp-z-sticky)`
- Position: `sticky; top: 0;`
- Content padded `0 var(--lp-content-padding-x)` left/right

### 3.2 Slots and props

```ts
type TopBarProps = {
  // Logo (left edge)
  logoHref?: string; // default '/dashboard'

  // Tours dropdown
  activeTourId?: string;
  tours: Array<{ id: string; name: string; status: 'active' | 'archived' }>;
  onTourSelect: (id: string) => void;
  onCreateTour: () => void;

  // Static nav buttons
  navItems?: Array<{ label: string; href: string; activeMatch: (pathname: string) => boolean }>;
  // default: [{ label: 'Library', href: '/library' }, { label: 'Templates', href: '/templates' }]

  // Right-edge slots
  onCommandPaletteOpen: () => void; // ⌘K opens palette (UX08b builds the palette itself)
  user: { name: string; email: string; avatarUrl?: string };
};
```

### 3.3 Behaviour

- **Tours dropdown** (left of nav items): button with active tour name + chevron. Open on click → menu listing all tours grouped by `status`, with a "New tour" footer action. Active tour shows a check. Use `--lp-z-dropdown`. Close on outside click + Escape.
- **Nav items**: render as Next `<Link>`. Active state when `item.activeMatch(usePathname())` returns true. Active style: `--lp-text` colour + 2px bottom border in `--lp-orange`. Inactive: `--lp-text-secondary`, no border, hover → `--lp-text` + `--lp-surface-hover` background.
- **⌘K trigger** (right side, before account): pill-shaped button with magnifier icon + the placeholder text "Search…" + a kbd hint "⌘K". Width fixed at 240px. On click, calls `onCommandPaletteOpen`. Also wire global keydown: `(metaKey || ctrlKey) && key === 'k'` → call `onCommandPaletteOpen`. Don't build the palette itself in this prompt — just the trigger.
- **Account button** (rightmost): avatar + name. On click → menu with "Settings", "Workspace", "Sign out". Use `--lp-z-dropdown`.

### 3.4 Mobile behaviour

Below 640px, TopBar collapses:
- Logo + ⌘K + account remain visible
- Tours dropdown becomes an icon-only chevron next to logo
- Nav items collapse into a "More" menu (kebab)

LeftRail is hidden on mobile (handled by the LeftRail component itself, not TopBar).

---

## 4. Step 2 — `<LeftRail>`

File: `src/components/shell/LeftRail.tsx`

### 4.1 Layout contract

- Width: `var(--lp-rail-width)` (240px) when expanded, `var(--lp-rail-collapsed)` (56px) when collapsed
- Background: `var(--lp-bg-secondary)`
- Right border: 1px `var(--lp-border)`
- Height: `calc(100vh - var(--lp-topbar-height))`
- Position: `sticky; top: var(--lp-topbar-height);`
- z-index: `var(--lp-z-sticky)` (one less than TopBar via stacking context)
- Hidden on mobile (`< 768px`)
- Below `1280px`: auto-collapses to icon strip; click handle at top-right edge to expand

### 4.2 Variants

The rail's contents are determined by the `variant` prop:

```ts
type LeftRailVariant =
  | { kind: 'spreadsheet'; sections: Array<{ id: string; label: string; href: string }>; activeId: string }
  | { kind: 'docDays'; days: Array<{ date: string; label: string; type?: DayType }>; activeDate: string; tourStartDate: string; tourEndDate: string }
  | { kind: 'docSections'; sections: Array<{ id: string; label: string; href: string }>; activeId: string }
  | { kind: 'list'; filters: ListFilterDef[]; savedViews?: Array<{ id: string; name: string }> }
  | { kind: 'dashboard'; tourId: string; structure: Array<{ label: string; href: string; icon: LucideIcon }> }
  | { kind: 'none' }; // hide rail entirely

type LeftRailProps = {
  variant: LeftRailVariant;
  collapsed?: boolean; // controlled
  onCollapsedChange?: (collapsed: boolean) => void;
};
```

### 4.3 Variant behaviours

**`spreadsheet`** — vertical list of section tabs.
- Each tab: padding `var(--lp-space-3) var(--lp-space-4)`, font-size `--lp-text-base`, weight 500.
- Active tab: background `var(--lp-surface)`, left border 3px `--lp-orange`, text `--lp-text`.
- Inactive: text `--lp-text-secondary`, hover background `--lp-surface-hover`.
- Use Next `<Link>`.

**`docDays`** — scrollable list covering the full tour duration.
- Render every day from `tourStartDate` to `tourEndDate` inclusive (one row per day).
- Each row: date pill (DD format) + day-of-week (Mon/Tue) + city/label (truncated).
- Day-type colour-strip on the left edge (4px wide) using `--color-lp-day-*` tokens.
- **Today** is highlighted (background `--lp-orange-subtle`, label "TODAY" in caps above the date).
- **Active day** (i.e. selected day, may differ from today): background `--lp-surface`, left border 3px `--lp-orange`.
- On mount: scroll the active day into view (centred). Use `scrollIntoView({ block: 'center' })`.
- Use a sticky "Today" jump button at the top of the rail when today is scrolled out of view.
- Click row → navigate to that day's URL (parent component supplies a function via context or each row's onClick).

**`docSections`** — same shape as `spreadsheet` but for documents without a day dimension (e.g. Pack editor sections, Stage plot pages). Visual identical to `spreadsheet`.

**`list`** — filter chips + saved views.
- Top: filter group rendered from `ListFilterDef[]` (define this type — supports text, select, dateRange, multiSelect).
- Bottom: "Saved views" section listing each view as a clickable row.
- The actual filter wiring is the consumer's job; LeftRail just renders the controls and emits change events.

**`dashboard`** — link list to top-level tour sections.
- Each item: icon (lucide) + label.
- Active when `usePathname()` starts with `item.href`.
- Use this only on Dashboard archetype pages.

**`none`** — render nothing. The PageShell adjusts its grid accordingly.

### 4.4 Collapsed state

When `collapsed === true`:
- Width = `--lp-rail-collapsed` (56px)
- Show only icons (variant decides which: `spreadsheet`/`docSections` show first letter of section, `docDays` shows DD only with day-type strip, `list` shows filter icon + saved-view count, `dashboard` shows variant icons).
- Tooltip on hover for each item showing the full label. Use `--lp-z-tooltip`.

### 4.5 Edge case — empty / loading

If `variant.kind === 'spreadsheet'` and `sections.length === 0`, render a placeholder: "No sections yet" centred, in `--lp-text-tertiary`. Same shape for other variants. Never crash.

---

## 5. Step 3 — `<PageShell>`

File: `src/components/shell/PageShell.tsx`

### 5.1 Contract

`<PageShell>` is the only allowed top-level layout for any page going forward. It composes TopBar + LeftRail + main content.

```tsx
<PageShell
  topBar={<TopBar … />}
  leftRail={<LeftRail variant={…} />}
  archetype="spreadsheet" // determines content max-width and padding
>
  {children}
</PageShell>
```

```ts
type PageShellProps = {
  topBar: ReactNode;
  leftRail: ReactNode; // pass <LeftRail variant={{ kind: 'none' }} /> to hide
  archetype: 'list' | 'spreadsheet' | 'dashboard' | 'document' | 'builder';
  children: ReactNode;
};
```

### 5.2 Layout

CSS Grid:
- Rows: `var(--lp-topbar-height) 1fr`
- Cols: when rail is `none` → `1fr`; otherwise → `auto 1fr` (rail's width comes from itself)

Main content area:
- Padding: `var(--lp-content-padding-y) var(--lp-content-padding-x)` for `list`, `dashboard`, `document`
- Padding: `0` for `spreadsheet` and `builder` (they manage their own padding)
- `max-width: var(--lp-content-max-width)` for `list`, `dashboard`, `document`
- No max-width for `spreadsheet`, `builder` (they use full width)
- `overflow-y: auto` on main; `overflow-x: hidden`

### 5.3 Server vs client

PageShell itself has no interactive behaviour, so it can be a server component. Mark it as such (no `'use client'`). Its children may be client components.

---

## 6. Step 4 — Playground route

Create `src/app/(app)/admin/shell-playground/page.tsx` (admin-gated, mirroring `/bugs` exactly).

The page demonstrates each archetype with mock data:

- A tab bar at the top of the page lets admin pick which archetype to view: `list | spreadsheet | dashboard | document-days | document-sections | builder | none`
- For each, render a `<PageShell>` with the corresponding `<TopBar>` (mock tours, mock user) and `<LeftRail>` (mock data appropriate for the variant)
- Main content is just a placeholder div with the archetype name, padding, and a sample card so the layout is visible

This page is the only consumer of UX02's components in this prompt. It's the QA surface.

---

## 7. Step 5 — Verification

1. `npm run lint` — exits 0
2. `npm run typecheck` — exits 0
3. Visit `/admin/shell-playground` as admin → all 7 variants render correctly
4. Visit `/admin/shell-playground` as non-admin → 404
5. Resize the window through 1920 → 1280 → 1024 → 768 → 414. Confirm:
   - Above 1280: rail expanded
   - 1024–1280: rail collapsed to icons
   - 768–1024: rail still collapsed
   - <768: rail hidden, TopBar collapses to mobile layout
6. Toggle dark mode (existing mechanism) → all surfaces adapt
7. ⌘K shortcut from anywhere on the playground page calls `onCommandPaletteOpen` (verify with a console log placeholder — no palette yet)
8. Tab through the TopBar with keyboard — focus rings visible (using `--lp-shadow-focus-ring`)
9. **No existing page is affected.** Open Dashboard, Advance, Budget — pixel-identical to `main`.

---

## 8. Acceptance criteria

- [ ] `<TopBar>`, `<LeftRail>` (5 variants), `<PageShell>` exist at `src/components/shell/`
- [ ] All token references go through `var(--lp-…)` — no hardcoded values
- [ ] `/admin/shell-playground` exists, admin-gated, demonstrates every variant
- [ ] LeftRail `docDays` scrolls active day into view on mount, has Today jump button
- [ ] Responsive collapse points work as specified
- [ ] ⌘K trigger fires the callback; global shortcut wired
- [ ] No visual diff on existing pages
- [ ] Lint + typecheck exit clean
- [ ] No new dependencies

---

## 9. Out of scope

- ❌ Don't migrate any existing page to PageShell — UX04 does that
- ❌ Don't build the SlideOver — UX03
- ❌ Don't build the Command Palette — UX08b. Just wire the trigger to a callback.
- ❌ Don't delete or modify the existing sidebar
- ❌ Don't add new icons; use lucide
- ❌ Don't change auth, routing, or any data layer

---

## 10. Commit plan

One commit:

```
UX02: shell components (TopBar, LeftRail, PageShell)

- Add src/components/shell/{TopBar,LeftRail,PageShell}.tsx
- 5 LeftRail variants: spreadsheet, docDays, docSections, list, dashboard
- Playground at /admin/shell-playground for visual QA
- No existing page migrated yet (UX04)
- No visual diff on any existing page
```
