# Cursor Prompt — Overnight Mega-PR (Phase A0 closeout + A1 routing/income merge)

Paste this whole file into Cursor. Execute top-to-bottom. Each major section has a **Step 0 verify-first** gate so sections that have already landed are skipped cleanly without rework. If a section's verification shows the work is already complete, report that and move to the next section — do NOT re-apply.

**Time budget expectation**: this prompt rolls up five PRs' worth of work:
- §1 A0.3 — responsive top bar retry (previous paste didn't land)
- §2 A0.4 — delete orphaned `Header.tsx` + `HeaderArtistTourPicker.tsx`, rename `lp-sidebar-mode` localStorage key
- §3 A0.6 — consolidate `dayTypeLabel` helpers into `src/lib/dayType.ts`
- §4 A0.7 — generic `ContextMenu` primitive (Notion-style)
- §5 A1 — routing + income merge: combine `/tours/[id]/routing` with the per-day income grid into a single page

The sections are deliberately ordered smallest → largest so if Cursor hits a wall it still banks the cheap wins. Sections 1–4 are mechanical. Section 5 is the feature work.

**Hard rules that apply to every section:**

1. Never introduce framer-motion or any new animation library. Transitions are Tailwind `transition-*` only.
2. Never use `localStorage`, `sessionStorage`, or any browser storage except where explicitly prescribed (§2 has one migration).
3. Never change DB schema, migrations, or API routes unless the section explicitly says to.
4. Keep the existing flexible advance `advance_form_configs` JSONB system intact — no touching it in this prompt.
5. Preserve ability to paste the `routing_id` URL and land on the same place. No URL contract changes unless a section says so.
6. If a section's acceptance criteria fail, STOP that section, leave the repo clean, and report what blocked you. Do not paper over failures.

---

## Design references (standing — applies to all Lowpass PRs)

Lowpass borrows from three products. When resolving ambiguity in layout, interaction, or visuals, lean on these:

1. **Daysheets (daysheets.com, the tour management app)** — visual + interaction vocabulary.
   - Dark mode is the hero state, not an afterthought. Theme color `#0f172a`.
   - "All / Me" is a single universal personal-filter toggle across every module (schedule, notes, hotels, flights, advance), not per-screen.
   - **Party chips** are the primary schedule filter: "All Parties / A Party / B Party / C Party" as a chip-row above the list, not a dropdown.
   - Mobile reaches full parity with desktop — editing, creating, and admin all work on mobile.
   - **Dense grids over card stacks** for tabular data (Flight Grid, Rooming List).
   - Group Tags → sub-groups that personalise per-person itineraries; admins see everything, non-admins see only their group.
   - **Day Types render with coloured accents** on both list rows (3px left bar) and month-view cells.
   - Four mobile pivots for a tour: Day / Calendar / Routing / Map.
   - Global "+" add menu on mobile (persistent FAB) over per-screen add buttons.
   - Three-column day detail layout: left = date list nav, center = main day content, right = meta sidebar (Day Type & Locations / Lodging / Notes / Contacts stacked, each with a `+` adder and per-entry `⋯` menu).
   - Vocabulary: "beautiful", "clear", "modern", "speedy", "immediate response".

2. **Xero** — budget UX.
   - (a) Transaction-list pattern: inline-editable rows, per-row running totals, category tag per row, cell-level precision.
   - (b) Budget/forecast grid: rows = categories, columns = shows/months, editable cells, column + row totals.
   - Inline edits save on blur or Enter, not via modal dialogs.
   - Tab moves cell-to-cell; Enter confirms and moves down.

3. **Notion** — context menus.
   - Every row-bearing page supports a context menu.
   - Trigger (i): right-click anywhere on a row → menu opens at cursor.
   - Trigger (ii): visible `⋯` kebab on row hover, click opens the same menu.
   - Menu structure (Daysheets-confirmed): icon on the left of each label, logical dividers grouping primary actions → cross-app actions → external links.
   - Menu items keyboard-accessible (arrow keys + Enter).

---

# §1 — A0.3: AppTopBar responsive pass + mobile focus-order fix

## Step 0 — Verify whether this has already landed

Run and paste output:

```bash
# (a) useIsMobile hook exists
ls -la src/hooks/useIsMobile.ts 2>/dev/null || echo "MISSING: src/hooks/useIsMobile.ts"

# (b) Two-row mobile layout has been removed from AppTopBar
grep -n "md:hidden.*-mt-1\|md:hidden.*pb-2" src/components/layout/AppTopBar.tsx || echo "OK: no two-row mobile layout found"

# (c) Action buttons are 44×44 (h-11 w-11) not 36×36 (h-9 w-9)
grep -n "h-11 w-11\|h-9 w-9" src/components/layout/AppTopBar.tsx
```

**Decision tree:**

- (a) is NOT missing AND (b) says "OK: no two-row mobile layout found" AND (c) shows `h-11 w-11` (not `h-9 w-9`) for Bell/DarkModeToggle wrappers → **§1 already done, skip to §2**.
- Any other state → proceed to Step 1.

## Context

The current `src/components/layout/AppTopBar.tsx` renders a two-row mobile layout: breadcrumb + actions on row 1, pill on row 2. Focus order becomes **breadcrumb → bell → dark-mode → pill** — the primary nav control is reached last by keyboard users.

Target: single responsive row on all viewports. Pill is between breadcrumb and actions. Pill uses `w-40 md:w-48`. Bell and DarkModeToggle wrappers become 44×44 hit targets (`h-11 w-11`).

## Step 1 — Create `src/hooks/useIsMobile.ts`

```ts
'use client';

import { useEffect, useState } from 'react';

/**
 * Returns true when the viewport is narrower than the Tailwind `md` breakpoint (768px).
 * SSR-safe: returns `false` during server render, updates after hydration.
 */
export function useIsMobile(): boolean {
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const mq = window.matchMedia('(max-width: 767px)');
    const update = () => setIsMobile(mq.matches);
    update();
    mq.addEventListener('change', update);
    return () => mq.removeEventListener('change', update);
  }, []);

  return isMobile;
}
```

## Step 2 — Rewrite `AppTopBar.tsx` body

Keep all existing imports and props. Only the returned JSX structure changes. Single row on all viewports, zones in this order: mobile menu → New Tour CTA → breadcrumb (flex-1, truncates) → mode pill (fixed width) → bell + dark-mode (each 44×44).

Target JSX:

```tsx
return (
  <header className="sticky top-0 z-20 overflow-visible border-b border-lp-border bg-lp-bg/80 px-4 backdrop-blur-sm sm:px-6">
    <div className="flex min-h-16 items-center gap-3 py-2 lg:gap-4 lg:py-0">
      {/* Mobile menu button */}
      <button
        type="button"
        onClick={onMenuClick}
        className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg text-lp-text-secondary hover:bg-lp-bg-tertiary lg:hidden"
        aria-label="Open menu"
      >
        <Menu size={20} />
      </button>

      {/* New Tour */}
      <Link
        href="/tours/create"
        title={compactNewTour ? 'New tour' : undefined}
        aria-label={compactNewTour ? 'New tour' : undefined}
        className={cn(
          'flex shrink-0 items-center justify-center rounded-lg border border-lp-orange text-lp-orange transition-colors duration-200',
          'hover:bg-lp-orange hover:text-white dark:hover:text-black',
          compactNewTour
            ? 'h-11 w-11'
            : 'min-h-[2.75rem] gap-1.5 px-3 py-2 text-xs font-bold tracking-widest'
        )}
        style={compactNewTour ? undefined : { letterSpacing: '0.12em' }}
      >
        <Plus size={compactNewTour ? 18 : 14} strokeWidth={compactNewTour ? 2 : 2.5} className="shrink-0" />
        {!compactNewTour && <span className="whitespace-nowrap">NEW TOUR</span>}
      </Link>

      {/* Breadcrumb — flex-1, min-w-0 so truncation works inside */}
      <Suspense
        fallback={
          <div className="min-h-[2.75rem] min-w-0 flex-1 rounded-lg border border-lp-border bg-lp-bg/50" />
        }
      >
        <div className="min-w-0 flex-1">
          <AppTopBarBreadcrumb />
        </div>
      </Suspense>

      {/* Mode pill — fixed width, always in the main row */}
      <div className="shrink-0">
        <AppTopBarModePill className="w-40 md:w-48" />
      </div>

      {/* Right actions — 44×44 hit targets */}
      <div className="flex shrink-0 items-center gap-1">
        <button
          type="button"
          className="relative flex h-11 w-11 items-center justify-center rounded-lg text-lp-text-secondary hover:bg-lp-bg-tertiary hover:text-lp-text transition-colors"
          aria-label="Notifications"
        >
          <Bell size={18} />
          <span className="absolute right-2.5 top-2.5 h-2 w-2 rounded-full bg-lp-orange" />
        </button>
        <DarkModeToggle />
      </div>
    </div>
  </header>
);
```

**Two things to fix up along the way:**

1. `AppTopBarModePill` needs to accept an optional `className` prop merged onto its root `<div>` via `cn()`. If it already does, no change. If not, add `className?: string` to its props type and merge into root.
2. `AppTopBarBreadcrumb`: the artist label `<span>` and tour label `<span>` must each have `truncate` class, and their parent flex container must include `min-w-0 items-center gap-2`. Without `min-w-0` on the flex parent, truncation fails inside the `flex-1` wrapper. Only edit if missing.
3. `DarkModeToggle`: confirm it renders at ~44×44. If the internal button is `h-9 w-9`, wrap or upgrade to `h-11 w-11`. No visual regression — just touch-target improvement.

## §1 acceptance

- [ ] `npx tsc --noEmit --skipLibCheck` clean.
- [ ] `npm run lint` clean on AppTopBar.tsx / AppTopBarBreadcrumb.tsx / AppTopBarModePill.tsx / DarkModeToggle.tsx / useIsMobile.ts.
- [ ] At 1920px: single-row top bar, breadcrumb flex-1 with ellipsis when long, pill 192px, bell + dark-mode on right.
- [ ] At 768px: same layout, breadcrumb truncates aggressively.
- [ ] At 375px (iPhone SE): pill shrinks to 160px (`w-40`), breadcrumb truncates to ellipsis, no horizontal scroll on `<body>`.
- [ ] Tab order from a cold reload: artist → tour → pill Advance → pill Budget → Bell → Dark-mode toggle. Pill reached BEFORE decorative icons.
- [ ] Bell + dark-mode wrappers are 44×44 (Chrome devtools → inspect → 44px in both dimensions).
- [ ] Hamburger still opens sidebar drawer on mobile. No regression.
- [ ] Clicking Advance / Budget in pill navigates correctly and sidebar mode follows (existing behaviour unchanged).

---

# §2 — A0.4: Delete orphaned header + rename `lp-sidebar-mode` localStorage key

## Step 0 — Verify

```bash
ls src/components/layout/Header.tsx 2>/dev/null && echo "STILL EXISTS: Header.tsx" || echo "OK: Header.tsx gone"
ls src/components/layout/HeaderArtistTourPicker.tsx 2>/dev/null && echo "STILL EXISTS: HeaderArtistTourPicker.tsx" || echo "OK: HeaderArtistTourPicker.tsx gone"
git grep -n "lp-sidebar-mode" src/
git grep -n "lp-workspace-mode" src/
git grep -n "from '.*Header'" src/ | grep -v node_modules
```

**Decision tree:**

- Both `STILL EXISTS` lines say "OK: gone" AND `lp-sidebar-mode` grep returns 0 hits AND `lp-workspace-mode` grep returns at least 1 hit (in `AppTopBarModePill.tsx`) → **§2 done, skip to §3**.
- Any other state → proceed.

## Step 1 — Confirm no live imports

`git grep "from './Header'\|from '@/components/layout/Header'" src/` must return only the import INSIDE `Header.tsx` itself (self-import pulling in `HeaderArtistTourPicker`). If any other file imports `Header` or `HeaderArtistTourPicker`, STOP — don't delete, report which file.

## Step 2 — Delete files

```bash
rm src/components/layout/Header.tsx
rm src/components/layout/HeaderArtistTourPicker.tsx
```

## Step 3 — Rename localStorage key `lp-sidebar-mode` → `lp-workspace-mode` with migration

Edit `src/components/layout/AppTopBarModePill.tsx`.

Find:
```ts
const MODE_KEY = 'lp-sidebar-mode';
```

Replace with:
```ts
const MODE_KEY = 'lp-workspace-mode';
const LEGACY_MODE_KEY = 'lp-sidebar-mode';
```

Find the initial state / effect that reads from localStorage — wrap it so if the new key is absent but the legacy key exists, we copy-once then delete the legacy. Example (adapt to whatever shape the file currently uses):

```ts
useEffect(() => {
  if (typeof window === 'undefined') return;
  try {
    const current = localStorage.getItem(MODE_KEY);
    if (current !== null) return; // already migrated or never seeded
    const legacy = localStorage.getItem(LEGACY_MODE_KEY);
    if (legacy !== null) {
      localStorage.setItem(MODE_KEY, legacy);
      localStorage.removeItem(LEGACY_MODE_KEY);
    }
  } catch {
    // localStorage unavailable (privacy mode / SSR edge) — fall through
  }
}, []);
```

This effect runs once on mount, migrates if legacy exists, and cleans up. All subsequent reads/writes use `MODE_KEY` (the new name).

## §2 acceptance

- [ ] `npx tsc --noEmit --skipLibCheck` clean.
- [ ] `git grep 'lp-sidebar-mode' src/` returns **zero** hits.
- [ ] `git grep 'lp-workspace-mode' src/` returns at least one hit in `AppTopBarModePill.tsx`.
- [ ] `src/components/layout/Header.tsx` and `HeaderArtistTourPicker.tsx` do not exist.
- [ ] `npm run dev` boots clean. Open the app, toggle Advance/Budget in pill a few times → localStorage has key `lp-workspace-mode` (devtools → Application → Local Storage). `lp-sidebar-mode` key is gone.
- [ ] If a user had `lp-sidebar-mode=budget` set before this landed, simulate by manually setting it in devtools and reload — the migration copies it to `lp-workspace-mode=budget` and removes the legacy key. Pill state is preserved.

---

# §3 — A0.6: Consolidate `dayTypeLabel` helpers

## Step 0 — Verify

```bash
ls -la src/lib/dayType.ts 2>/dev/null || echo "MISSING: src/lib/dayType.ts"
git grep -n "^function dayTypeLabel" src/
git grep -n "from '@/lib/dayType'" src/
```

**Decision tree:**

- `src/lib/dayType.ts` exists AND `^function dayTypeLabel` returns zero matches AND `@/lib/dayType` import appears in at least three files → **§3 done, skip to §4**.
- Otherwise proceed.

## Step 1 — Create `src/lib/dayType.ts`

```ts
/**
 * Canonical day-type helpers for Lowpass routing rows.
 *
 * `day_type` is a free-form comma-separated string on the `routing` table
 * (e.g. "show", "show, press", "travel", "festival", "off"). These helpers
 * parse it, pick the most significant segment by priority, and return a
 * human label or the Lowpass accent colour.
 *
 * Styling helpers that return Tailwind classes (e.g. dayTypeClass,
 * dayDotClass) stay local to their components — those are per-component
 * design decisions that will be aligned in a separate pass.
 */

export function dayTypeSegments(dayType: string): string[] {
  return (dayType ?? '')
    .split(',')
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
}

export function dayTypeAccent(dayType: string): string {
  const segs = dayTypeSegments(dayType);
  if (segs.some((s) => s === 'show')) return '#FF4500';       // Lowpass brand orange
  if (segs.some((s) => s === 'festival')) return '#9B59B6';   // purple
  if (segs.some((s) => s === 'travel')) return '#3498DB';     // blue
  if (segs.some((s) => s === 'rehearsal')) return '#F59E0B';  // amber
  if (segs.some((s) => s === 'off')) return '#64748B';        // slate-500
  return 'var(--lp-sidebar-text-muted)';                      // unknown → muted
}

export function dayTypeLabel(dayType: string): string {
  const segs = dayTypeSegments(dayType);
  const priority = ['show', 'festival', 'travel', 'rehearsal', 'press', 'off'];
  const primary = priority.find((p) => segs.includes(p)) ?? segs[0];

  switch (primary) {
    case 'show': return 'Show Day';
    case 'festival': return 'Festival';
    case 'travel': return 'Travel Day';
    case 'rehearsal': return 'Rehearsal';
    case 'press': return 'Press Day';
    case 'off': return 'Off Day';
    default: return primary ? primary.charAt(0).toUpperCase() + primary.slice(1) : '';
  }
}

export function formatDateHeading(dateStr: string): string {
  // "TUESDAY, MAY 19"
  return new Date(`${dateStr}T12:00:00`)
    .toLocaleDateString('en-GB', { weekday: 'long', month: 'long', day: 'numeric' })
    .toUpperCase();
}
```

## Step 2 — Migrate consumers

**2a. `src/components/layout/TourRoutingList.tsx`**: remove local `dayTypeSegments`, `dayTypeAccent`, `dayTypeLabel`, `formatDateHeading`. Keep local `formatDateCollapsed`. Add at top: `import { dayTypeAccent, dayTypeLabel, formatDateHeading } from '@/lib/dayType';`

**2b. `src/components/advance/AdvanceShowReadView.tsx`**: remove local `dayTypeLabel` (~line 113). Keep local `dayTypeClass`. Add: `import { dayTypeLabel } from '@/lib/dayType';`. Expect a cosmetic change: off-day label flips from "Day Off" to "Off Day". That's intentional alignment.

**2c. `src/components/budget/DayViewTab.tsx`**: remove local `dayTypeLabel` (~line 56). Keep local `dayDotClass`. Add: `import { dayTypeLabel } from '@/lib/dayType';`. The render site at line ~248 uses CSS `uppercase` so title-case input renders correctly.

## §3 acceptance

- [ ] `npx tsc --noEmit --skipLibCheck` clean.
- [ ] `git grep -n "^function dayTypeLabel" src/` returns 0 hits.
- [ ] `git grep -n "^function dayTypeAccent" src/` returns 0 hits.
- [ ] `git grep -n "from '@/lib/dayType'" src/` returns exactly 3 files.
- [ ] Sidebar list still renders correct accent colours per day type.
- [ ] Advance read view: show-day badge reads "Show Day", off-day reads "Off Day".
- [ ] Budget day strip: pill text uppercase and dot colour unchanged.

---

# §4 — A0.7: Generic `ContextMenu` primitive (Notion pattern)

## Step 0 — Verify

```bash
ls -la src/components/ui/ContextMenu.tsx 2>/dev/null || echo "MISSING"
git grep -n "from '@/components/ui/ContextMenu'" src/
```

If `ContextMenu.tsx` exists AND at least one consumer imports from it → **§4 done, skip to §5**.

## Context

Notion and Daysheets both surface row-level actions via (i) right-click on the row and (ii) a hover-visible `⋯` kebab button that opens the same menu. Lowpass needs this primitive before we add it to every list in the app (routing rows, income rows, lodging rows, personnel rows, advance sections, etc.). Build the primitive once, reuse everywhere.

## Step 1 — Create `src/components/ui/ContextMenu.tsx`

Required behaviours:

- Headless — no prescribed colours. Consumers pass `items` and optional Lucide icons. The primitive styles the floating panel.
- Trigger modes (both supported simultaneously on the same wrapper):
  - Right-click anywhere inside the wrapper opens the menu at the cursor.
  - `MenuHandle` child exposes a `⋯` button; click opens the menu anchored to the button.
- Keyboard: Escape closes; Arrow up/down moves highlight; Enter activates; Tab leaves.
- Click outside closes. Scroll outside closes.
- Positioning: menu opens at click coords, clamped to viewport so it never overflows. If bottom-clamped, flips to open upward.
- Dividers: items can include `{ kind: 'divider' }`.
- Icons on the left, label in the middle, optional shortcut chip on the right.
- Destructive items render red (`text-red-600 dark:text-red-400`) and hover `bg-red-500/10`.
- Disabled items render at `opacity-50` and don't fire `onClick`.

Implementation sketch (expand with real types):

```tsx
'use client';

import { useState, useEffect, useRef, useCallback, ReactNode, MouseEvent } from 'react';
import { cn } from '@/lib/utils';
import { MoreHorizontal } from 'lucide-react';

export type ContextMenuItem =
  | { kind: 'divider'; id?: string }
  | {
      kind?: 'item';
      id: string;
      label: string;
      icon?: ReactNode;
      shortcut?: string;
      destructive?: boolean;
      disabled?: boolean;
      onClick: () => void;
    };

type Anchor = { x: number; y: number } | null;

export function ContextMenu({
  children,
  items,
  disabled = false,
  className,
}: {
  children: ReactNode;
  items: ContextMenuItem[];
  disabled?: boolean;
  className?: string;
}) {
  const [anchor, setAnchor] = useState<Anchor>(null);
  const [highlight, setHighlight] = useState<number>(-1);
  const panelRef = useRef<HTMLDivElement>(null);

  const open = useCallback((x: number, y: number) => {
    // Clamp to viewport
    const w = 240;
    const h = Math.min(items.length * 36 + 16, 480);
    const clampedX = Math.min(x, window.innerWidth - w - 8);
    const clampedY = Math.min(y, window.innerHeight - h - 8);
    setAnchor({ x: Math.max(8, clampedX), y: Math.max(8, clampedY) });
    setHighlight(-1);
  }, [items.length]);

  const close = useCallback(() => setAnchor(null), []);

  // Right-click handler on the wrapper
  const handleContextMenu = (e: MouseEvent) => {
    if (disabled) return;
    e.preventDefault();
    e.stopPropagation();
    open(e.clientX, e.clientY);
  };

  // Escape / outside-click / scroll closes
  useEffect(() => {
    if (!anchor) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { close(); return; }
      if (e.key === 'ArrowDown') {
        setHighlight((h) => {
          let next = h + 1;
          while (next < items.length && items[next]?.kind === 'divider') next++;
          return next >= items.length ? 0 : next;
        });
      }
      if (e.key === 'ArrowUp') {
        setHighlight((h) => {
          let next = h - 1;
          while (next >= 0 && items[next]?.kind === 'divider') next--;
          return next < 0 ? items.length - 1 : next;
        });
      }
      if (e.key === 'Enter' && highlight >= 0) {
        const it = items[highlight];
        if (it && it.kind !== 'divider' && !it.disabled) {
          it.onClick();
          close();
        }
      }
    };
    const onScroll = () => close();
    const onClick = (e: globalThis.MouseEvent) => {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) close();
    };
    document.addEventListener('keydown', onKey);
    document.addEventListener('scroll', onScroll, true);
    document.addEventListener('mousedown', onClick);
    return () => {
      document.removeEventListener('keydown', onKey);
      document.removeEventListener('scroll', onScroll, true);
      document.removeEventListener('mousedown', onClick);
    };
  }, [anchor, close, items, highlight]);

  return (
    <div onContextMenu={handleContextMenu} className={cn('group/menu-host relative', className)}>
      {children}
      {anchor && (
        <div
          ref={panelRef}
          role="menu"
          className="fixed z-[2500] w-60 overflow-hidden rounded-xl border border-lp-border bg-lp-surface p-1 shadow-xl"
          style={{ left: anchor.x, top: anchor.y }}
          onClick={(e) => e.stopPropagation()}
        >
          {items.map((it, i) => {
            if (it.kind === 'divider') {
              return <div key={it.id ?? `div-${i}`} className="my-1 h-px bg-lp-border" />;
            }
            const isHi = i === highlight;
            return (
              <button
                key={it.id}
                type="button"
                role="menuitem"
                disabled={it.disabled}
                onMouseEnter={() => setHighlight(i)}
                onClick={() => {
                  if (it.disabled) return;
                  it.onClick();
                  close();
                }}
                className={cn(
                  'flex w-full items-center gap-2.5 rounded-md px-2.5 py-1.5 text-left text-sm transition-colors',
                  it.disabled && 'cursor-not-allowed opacity-50',
                  !it.disabled && !it.destructive && 'text-lp-text hover:bg-lp-surface-hover',
                  !it.disabled && it.destructive && 'text-red-600 hover:bg-red-500/10 dark:text-red-400',
                  isHi && !it.disabled && !it.destructive && 'bg-lp-surface-hover',
                  isHi && !it.disabled && it.destructive && 'bg-red-500/10'
                )}
              >
                {it.icon && <span className="inline-flex h-4 w-4 shrink-0 items-center justify-center">{it.icon}</span>}
                <span className="min-w-0 flex-1 truncate">{it.label}</span>
                {it.shortcut && <span className="text-[11px] text-lp-text-tertiary">{it.shortcut}</span>}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

export function MenuHandle({
  onOpen,
  className,
  label = 'More actions',
}: {
  onOpen: (x: number, y: number) => void;
  className?: string;
  label?: string;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      onClick={(e) => {
        e.stopPropagation();
        const r = e.currentTarget.getBoundingClientRect();
        onOpen(r.right, r.bottom + 4);
      }}
      className={cn(
        'inline-flex h-7 w-7 items-center justify-center rounded-md text-lp-text-tertiary opacity-0 transition-opacity group-hover/menu-host:opacity-100 focus:opacity-100 hover:bg-lp-surface-hover hover:text-lp-text',
        className
      )}
    >
      <MoreHorizontal size={16} />
    </button>
  );
}
```

**Note**: the sketch passes `onOpen` to `MenuHandle` but the state lives in `ContextMenu`. In the final implementation, either (a) hoist `open` via context provider, or (b) expose `useContextMenuAnchor` hook from `ContextMenu.tsx` that `MenuHandle` reads, or (c) have `ContextMenu` render its own internal kebab affordance when a `showHandle` prop is true. Pick whichever is cleanest — I'd recommend (c) for v1: add `<ContextMenu items={...} showHandle> ...row content... </ContextMenu>` and the component renders the kebab absolute-positioned top-right with `group-hover/menu-host` opacity toggle. If (c), remove the exported `MenuHandle` and roll it internally.

Preferred final shape if picking (c):

```tsx
<ContextMenu items={items} showHandle>
  <div className="... your row markup ...">
    ...
  </div>
</ContextMenu>
```

The kebab `⋯` appears on the right on row hover, click opens the same menu `open()` would from right-click.

## Step 2 — Demo consumer (minimal, to prove it works)

Add ONE consumer so we can ship the primitive tested. Use the sidebar routing row.

Open `src/components/layout/TourRoutingList.tsx`. Wrap each `<Link>` in a `<ContextMenu>` with the following items:

```ts
const items: ContextMenuItem[] = [
  { id: 'advance', kind: 'item', label: 'Open advance', icon: <ClipboardList size={14} />, onClick: () => router.push(`/tours/${tourId}/advance/${row.id}`) },
  { id: 'copy-id', kind: 'item', label: 'Copy date ID', icon: <Copy size={14} />, onClick: () => navigator.clipboard?.writeText(row.id) },
  { kind: 'divider' },
  { id: 'delete-advance', kind: 'item', label: 'Clear advance data', icon: <Trash2 size={14} />, destructive: true, onClick: () => { /* call DELETE /api/tours/[id]/advance/[routingId] via existing flow */ } },
];
```

**Important**: Do NOT actually wire up the "Clear advance data" handler to make a network call in this PR. Leave it as `() => alert('TODO: wire to delete flow')` or similar and note in the PR description. The primitive is what we're proving out; wiring comes in the PR that adopts the primitive across the app.

Import `useRouter` from `next/navigation` and the Lucide icons needed. Add a `<ContextMenu items={items} showHandle>` wrapper around each row.

## §4 acceptance

- [ ] `npx tsc --noEmit --skipLibCheck` clean.
- [ ] `src/components/ui/ContextMenu.tsx` exists and exports `ContextMenu`, `ContextMenuItem` (type), and either `MenuHandle` or a `showHandle` prop.
- [ ] Right-click a sidebar routing row: menu appears at cursor, items render, Escape closes, outside click closes, scroll closes.
- [ ] Hover a sidebar row: `⋯` kebab fades in at the right edge of the row. Click kebab: same menu opens anchored below/right of the kebab.
- [ ] Arrow keys navigate items, skipping dividers. Enter activates highlighted item.
- [ ] Destructive "Clear advance data" item renders red, hovers red.
- [ ] Menu does not clip the viewport when right-clicked near the right edge or bottom edge.
- [ ] The primitive is untouched by other PRs — it's a leaf component.
- [ ] No navigation happens on right-click itself (preventDefault on contextmenu fires).

---

# §5 — A1: Routing + Income merge

## Context

Today we have:

- **`/tours/[id]/routing`** renders `<RoutingEditor>` with three sub-views (Grid / Calendar / Map) and a save button. Full-page editor for the tour's routing.
- **`/budget?tour_id=X&tab=day-view`** used to render `<DayViewTab>` — a per-day financial view combining income (Guarantee / Overage / Merch / VIP / Withholding) and expenses, with proposed vs actual columns. Currently `day-view` is mapped to `summary` in `src/app/(app)/budget/page.tsx:24` — i.e. the day-view tab exists but has been hidden behind a summary redirect. The `DayViewTab` component at `src/components/budget/DayViewTab.tsx` still works; it's just orphaned from the budget tabs router.

Adam's ask (2026-04-19):

> "Then the routing/income menu should be one page and be the top of the routing page, with the body of the income page. The actual income should match the predicted income just minus the merch and overage etc."

Interpretation:

- ONE page, at `/tours/[id]/routing`.
- Top: existing `<RoutingEditor>` (unchanged scope — it's the routing grid editor).
- Below the routing editor: a per-day income/expense section leveraging the existing `<DayViewTab>` data model + UI.
- The combined page replaces the need for the hidden `day-view` budget tab.
- The "actual income matches predicted minus merch + overage" line is a formula clarification block — see §5 Step 4 below; flag for Adam to confirm before shipping.

## Design target

The merged page uses Daysheets' three-column feel on desktop and stacks on mobile:

```
┌─ TopBar ──────────────────────────────────────────────────────┐
│ Artist > Tour    [Advance | Budget]    🔔  ☾                  │
├────────────┬──────────────────────────────────────────────────┤
│  Sidebar   │  /tours/[id]/routing                             │
│  (Daysheets│                                                  │
│   date     │  ─── Routing Editor ──────────────────────────── │
│   list     │  [Grid | Calendar | Map]   [Save]                │
│   — A0.5   │  <RoutingEditor />                               │
│   shape)   │                                                  │
│            │  ─── Income & Expenses ───────────────────────── │
│            │  [Day strip] (horizontal, same day cards)        │
│            │                                                  │
│            │  ┌─ Selected day ─────────────────┐              │
│            │  │ Income (Xero list pattern)     │              │
│            │  │  Guarantee        £800 £800  ✓ │              │
│            │  │  Overage          £200 £250 +50│              │
│            │  │  Merch            £150 £180 +30│              │
│            │  │  VIP              £100 £0 -100 │              │
│            │  │  Withholding      -£80  -£80 0 │              │
│            │  │  Total Income     £1170 £1230  │              │
│            │  ├────────────────────────────────┤              │
│            │  │ Expenses (grouped, P/L footer) │              │
│            │  └────────────────────────────────┘              │
└────────────┴──────────────────────────────────────────────────┘
```

On screens ≥ 1280px (`xl:`), a right meta-sidebar appears showing Day Type & Locations, Lodging stub, Notes stub, Contacts stub — read-only in this PR, full editability in a later PR.

## Step 0 — Verify

```bash
grep -n "IncomeAndExpensesPanel\|RoutingPageLayout" src/components/routing/ src/app/\(app\)/tours/\[id\]/routing/ 2>/dev/null
git grep -n "from '@/components/day-view/RoutingIncomePanel'" src/
```

If `RoutingIncomePanel` exists and is imported on the routing page → **§5 done, skip.**
Otherwise proceed.

## Step 1 — Extract the income/expense block from `DayViewTab` into a reusable panel

Create `src/components/day-view/RoutingIncomePanel.tsx`. Move the content of `DayViewTab` (state, fetching, selected-day rendering, income lines, expenses) into this new component. Export it as `<RoutingIncomePanel tourId={...} selectedRoutingId={...} onSelectRoutingId={...} currency={...} />`.

Key differences vs `DayViewTab`:

1. The day strip (horizontal row of day cards) is optional, controlled by a prop `showDayStrip?: boolean` (default `true`). The routing page will pass `false` because the sidebar list + a new in-page selector already gives navigation.
2. `selectedRoutingId` is controlled externally via props instead of internal state. The panel has no internal selection; it renders whichever day is passed.
3. The panel exposes a callback `onRoutingIdChange(id)` for when it needs to suggest a new selection (e.g. first load with no selection).
4. Rename the file from `DayViewTab` concept to `RoutingIncomePanel` so the intent is clear.
5. Extract the `statusChip` helper into its own local util — it's specific to this panel, no need to share.

**Don't delete `DayViewTab.tsx` yet.** Leave it in place but have it become a thin wrapper that renders `<RoutingIncomePanel>` internally with `showDayStrip={true}` and manages its own selected-routing state. This way the existing budget tab routing (the redirect to `summary`) keeps working and nothing breaks.

**API endpoints used (unchanged)**:
- `GET /api/tours/[tourId]/routing` → list of `RoutingRow`
- `GET /api/budget/income?tour_id=...` → `{ income: IncomeRow[] }`
- `GET /api/budget/line-items?tour_id=...` → `{ line_items: LineItemRow[] }`
- `GET /api/tours/[tourId]` → tour currency

Do not modify these endpoints in this PR.

## Step 2 — Lift selection state into a shared hook

Create `src/hooks/useSelectedRoutingId.ts`:

```ts
'use client';
import { useEffect, useState } from 'react';

/**
 * Manages the currently-selected routing_id for a tour, synced with URL hash.
 * Default selection = first routing id in the provided array (if any).
 * URL shape: /tours/<id>/routing#d=<routing_id>
 */
export function useSelectedRoutingId(routingIds: string[]) {
  const [selected, setSelected] = useState<string | null>(null);

  // Initial pick from hash or first routing
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const m = window.location.hash.match(/(?:^|[&#])d=([^&]+)/);
    const fromHash = m?.[1] ?? null;
    if (fromHash && routingIds.includes(fromHash)) {
      setSelected(fromHash);
    } else if (routingIds.length > 0 && !selected) {
      setSelected(routingIds[0]);
    }
  }, [routingIds, selected]);

  // Write to hash when selection changes (replace, not push — we don't want history pollution)
  useEffect(() => {
    if (typeof window === 'undefined' || !selected) return;
    const next = `#d=${selected}`;
    if (window.location.hash !== next) {
      window.history.replaceState(null, '', next);
    }
  }, [selected]);

  return [selected, setSelected] as const;
}
```

This hook is used by the merged routing page and can be reused by `DayViewTab` if we want URL-linkability there too later.

## Step 3 — Rewrite `src/app/(app)/tours/[id]/routing/page.tsx` as a client composition shell

Currently the page is server-rendered and passes props to `<RoutingEditor>`. Keep the server data-fetch and pass to a new client-side shell component:

**`src/app/(app)/tours/[id]/routing/page.tsx`** (server component):

```tsx
import { notFound } from 'next/navigation';
import { createServerSupabaseClient } from '@/lib/supabase-server';
import { RoutingPageShell } from './RoutingPageShell';

export default async function RoutingPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createServerSupabaseClient();

  const { data: tour, error } = await supabase
    .from('tours')
    .select('id, start_date, end_date, custom_day_types, currency')
    .eq('id', id)
    .single();

  if (error || !tour) notFound();

  return (
    <RoutingPageShell
      tourId={id}
      startDate={tour.start_date ?? ''}
      endDate={tour.end_date ?? ''}
      initialCustomDayTypes={tour.custom_day_types ?? []}
      tourCurrency={tour.currency ?? 'GBP'}
    />
  );
}
```

**`src/app/(app)/tours/[id]/routing/RoutingPageShell.tsx`** (client component, new):

```tsx
'use client';

import { useEffect, useState } from 'react';
import { RoutingEditor } from '@/components/routing/RoutingEditor';
import { RoutingIncomePanel } from '@/components/day-view/RoutingIncomePanel';
import { useSelectedRoutingId } from '@/hooks/useSelectedRoutingId';
import { dayTypeLabel, formatDateHeading } from '@/lib/dayType';
import { cn } from '@/lib/utils';

type DayListRow = { id: string; date: string; day_type: string; city: string; venue_name: string | null };

export function RoutingPageShell({
  tourId,
  startDate,
  endDate,
  initialCustomDayTypes,
  tourCurrency,
}: {
  tourId: string;
  startDate: string;
  endDate: string;
  initialCustomDayTypes: string[];
  tourCurrency: string;
}) {
  const [routing, setRouting] = useState<DayListRow[]>([]);
  const [routingLoading, setRoutingLoading] = useState(true);
  const [selected, setSelected] = useSelectedRoutingId(routing.map((r) => r.id));

  useEffect(() => {
    let active = true;
    setRoutingLoading(true);
    fetch(`/api/tours/${encodeURIComponent(tourId)}/routing`)
      .then((res) => (res.ok ? res.json() : []))
      .then((list) => { if (active) setRouting(Array.isArray(list) ? list : []); })
      .finally(() => { if (active) setRoutingLoading(false); });
    return () => { active = false; };
  }, [tourId]);

  const selectedDay = routing.find((r) => r.id === selected);

  return (
    <div className="space-y-8">
      <section aria-label="Routing editor">
        <header className="mb-3 flex items-center justify-between">
          <h2 className="lp-label-caps text-[11px] font-semibold tracking-widest text-lp-text-secondary">
            Routing
          </h2>
        </header>
        <RoutingEditor
          tourId={tourId}
          startDate={startDate}
          endDate={endDate}
          initialCustomDayTypes={initialCustomDayTypes}
        />
      </section>

      <section aria-label="Income and expenses" id="income">
        <header className="mb-3 flex items-center justify-between gap-3">
          <div className="min-w-0">
            <h2 className="lp-label-caps text-[11px] font-semibold tracking-widest text-lp-text-secondary">
              Income &amp; Expenses
            </h2>
            {selectedDay && (
              <p className="mt-1 text-sm text-lp-text">
                <span className="font-semibold">{formatDateHeading(selectedDay.date)}</span>
                <span className="mx-2 text-lp-text-tertiary">·</span>
                <span className="text-lp-text-secondary">{dayTypeLabel(selectedDay.day_type)}</span>
                {selectedDay.venue_name && (
                  <>
                    <span className="mx-2 text-lp-text-tertiary">·</span>
                    <span className="text-lp-text-secondary">{selectedDay.venue_name}</span>
                  </>
                )}
                {selectedDay.city && (
                  <>
                    <span className="mx-2 text-lp-text-tertiary">·</span>
                    <span className="text-lp-text-secondary">{selectedDay.city}</span>
                  </>
                )}
              </p>
            )}
          </div>
        </header>

        {/* Day strip — horizontal scroll row of day cards; same visual vocab as DayViewTab */}
        <DayStrip routing={routing} selected={selected} onSelect={setSelected} loading={routingLoading} />

        {selected && (
          <div className={cn('mt-4 grid gap-4 xl:grid-cols-[minmax(0,1fr)_320px]')}>
            <RoutingIncomePanel
              tourId={tourId}
              selectedRoutingId={selected}
              onRoutingIdChange={setSelected}
              currency={tourCurrency}
              showDayStrip={false}
            />
            <RightRailMeta tourId={tourId} selectedDay={selectedDay ?? null} />
          </div>
        )}
      </section>
    </div>
  );
}
```

Add child components in the same file (or split if you prefer — matter of taste):

**`DayStrip`**: horizontal scrolling strip of day cards. Each card = 3px accent bar + uppercase month + day number + day-type label + accent dot. Same vocabulary as A0.5's sidebar list so they feel consistent. Active card: orange background (existing `bg-lp-orange text-white border-lp-orange`). Click to select.

```tsx
function DayStrip({ routing, selected, onSelect, loading }: {
  routing: DayListRow[]; selected: string | null; onSelect: (id: string) => void; loading: boolean;
}) {
  if (loading) {
    return <div className="h-16 animate-pulse rounded-xl border border-lp-border bg-lp-surface/50" />;
  }
  if (routing.length === 0) {
    return (
      <div className="rounded-xl border border-lp-border bg-lp-surface/50 p-6 text-center text-sm text-lp-text-tertiary">
        No routing dates. Add routing above to see income and expenses.
      </div>
    );
  }
  return (
    <div className="flex gap-2 overflow-x-auto no-scrollbar pb-1">
      {routing.map((r) => (
        <DayCard key={r.id} row={r} active={r.id === selected} onClick={() => onSelect(r.id)} />
      ))}
    </div>
  );
}

function DayCard({ row, active, onClick }: { row: DayListRow; active: boolean; onClick: () => void }) {
  const accent = dayTypeAccent(row.day_type);
  const label = dayTypeLabel(row.day_type);
  const d = new Date(`${row.date}T12:00:00`);
  const month = d.toLocaleDateString('en-GB', { month: 'short' }).toUpperCase();
  const day = d.toLocaleDateString('en-GB', { day: '2-digit' });
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'group/menu-host relative flex min-w-[92px] shrink-0 overflow-hidden rounded-lg border text-left transition-colors',
        active
          ? 'border-lp-orange bg-lp-orange text-white'
          : 'border-lp-border bg-lp-surface text-lp-text-secondary hover:bg-lp-surface-hover'
      )}
    >
      <span className="w-[3px] shrink-0 self-stretch" style={{ backgroundColor: accent }} aria-hidden />
      <span className="px-3 py-2">
        <span className="block text-[10px] font-semibold uppercase tracking-widest opacity-90">{month}</span>
        <span className="block text-base font-bold tabular-nums leading-tight">{day}</span>
        <span className="mt-1 block text-[10px] font-semibold uppercase tracking-widest opacity-80">
          {label || '—'}
        </span>
      </span>
    </button>
  );
}
```

Import `dayTypeAccent` from `@/lib/dayType`.

**`RightRailMeta`**: placeholder right-rail shown on `xl:` screens only. Stacks four sections matching Daysheets' meta sidebar, but **read-only** in this PR — we're proving the layout, not implementing the editors. Each section has a `+` button that currently opens a `alert('TODO: Phase F')` stub. Sections:

- Day Type & Locations — shows `dayTypeLabel`, primary venue + address if present.
- Lodging — shows "No lodging recorded" if no data; empty state.
- Notes — shows "No notes" empty state.
- Contacts — shows "No contacts for this tour day" empty state.

```tsx
function RightRailMeta({ selectedDay }: { tourId: string; selectedDay: DayListRow | null }) {
  if (!selectedDay) return null;
  return (
    <aside className="hidden space-y-4 xl:block">
      <MetaSection title="Day Type & Locations">
        <div className="text-sm">
          <div className="lp-chip inline-flex items-center gap-1.5 rounded-md border border-lp-border bg-lp-surface px-2 py-1 text-[11px] font-semibold uppercase tracking-widest text-lp-text" style={{ color: dayTypeAccent(selectedDay.day_type) }}>
            <span className="h-2 w-2 rounded-full" style={{ backgroundColor: dayTypeAccent(selectedDay.day_type) }} />
            {dayTypeLabel(selectedDay.day_type) || 'Untitled day'}
          </div>
          {selectedDay.venue_name && <div className="mt-2 font-semibold text-lp-text">{selectedDay.venue_name}</div>}
          {selectedDay.city && <div className="text-sm text-lp-text-secondary">{selectedDay.city}</div>}
        </div>
      </MetaSection>
      <MetaSection title="Lodging">
        <p className="text-sm text-lp-text-tertiary">No lodging recorded</p>
      </MetaSection>
      <MetaSection title="Notes">
        <p className="text-sm text-lp-text-tertiary">No notes</p>
      </MetaSection>
      <MetaSection title="Contacts">
        <p className="text-sm text-lp-text-tertiary">No contacts for this tour day</p>
      </MetaSection>
    </aside>
  );
}

function MetaSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-lp-border bg-lp-surface/50 p-4">
      <div className="mb-2 flex items-center justify-between">
        <h3 className="lp-label-caps text-[10px] font-semibold uppercase tracking-widest text-lp-text-secondary">{title}</h3>
        <button
          type="button"
          onClick={() => alert('TODO: Phase F will enable editing here')}
          className="inline-flex h-6 w-6 items-center justify-center rounded-md text-lp-text-tertiary hover:bg-lp-surface-hover hover:text-lp-text"
          aria-label={`Add to ${title}`}
        >
          +
        </button>
      </div>
      {children}
    </div>
  );
}
```

Keep the right rail behind `xl:block` so it only shows on wide desktops; on narrower screens the page stacks normally.

## Step 4 — Income formula: Reading B (status quo, confirmed by Adam 2026-04-21)

**Decision locked.** Adam confirmed Reading B. Keep the formula exactly as it exists in `DayViewTab` today:

- `proposed = post_tax_guarantee + post_tax_overage + merch_income + vip_income - withholding_deduction`
- `actual = actual_guarantee + actual_overage + actual_merch + actual_vip - withholding_deduction` (same withholding row as proposed)

Cursor: do NOT introduce a variance/split between "predicted" and "actual" semantics beyond what `DayViewTab` already does. Port the math verbatim into `RoutingIncomePanel`. Add this JSDoc comment at the top of `RoutingIncomePanel.tsx` so the formula choice is discoverable in code:

```ts
/**
 * Income formula — Reading B (confirmed by Adam 2026-04-21).
 *
 *   proposed = post_tax_guarantee + post_tax_overage + merch_income + vip_income - withholding_deduction
 *   actual   = actual_guarantee   + actual_overage   + actual_merch  + actual_vip  - withholding_deduction
 *
 * Withholding applies to both proposed and actual (same row).
 * Do not change this without an explicit product decision — it drives every
 * per-day total on the routing page.
 */
```

## Step 5 — Update `budget/page.tsx` to stop redirecting `day-view` to summary

Currently `src/app/(app)/budget/page.tsx:24` coerces `rawTab === 'day-view'` to `summary`. Now that the day view lives on the routing page, remove this coercion — `day-view` should be a legitimate tab again OR removed entirely. Prefer: **remove the `day-view` handling altogether and let it fall through to the default** (summary). Clean-up:

```ts
// Before:
const tab =
  rawTab === 'day-view'
    ? 'summary'
    : ((rawTab as TabId | undefined) ?? 'summary');

// After:
const tab = (rawTab as TabId | undefined) ?? 'summary';
```

If `day-view` is still referenced anywhere (e.g. `BUDGET_TABS` or an old link), leave those as-is unless they error — separate pass.

## Step 6 — Sidebar link audit

`src/components/layout/Sidebar.tsx` should still route to the routing page at `/tours/<id>/routing`. Since the Income & Expenses section now lives on the same page, update the sidebar's "Routing" entry copy if it currently says anything like "Just routing" — rename to "Routing & Income". Only do this if there's a visible text label.

Also: the workspace-mode pill's "Budget" destination `/budget?tour_id=X` continues to work and now lands on the spreadsheet-style budget tabs (Summary / Income / Production / etc.). No change needed there.

## §5 acceptance

- [ ] `npx tsc --noEmit --skipLibCheck` clean.
- [ ] `npm run lint` clean on new/modified files.
- [ ] `/tours/<tourId>/routing` renders two sections: Routing (existing editor intact, save flow intact) and Income & Expenses (day strip + selected-day panel).
- [ ] Clicking a day card in the strip updates the URL hash to `#d=<routing_id>` and scrolls/loads the income panel for that day.
- [ ] Direct navigation to `/tours/<tourId>/routing#d=<some-id>` loads with that day pre-selected.
- [ ] Income panel shows Guarantee / Overage / Merch / VIP / Withholding rows with Prop / Act / Var columns.
- [ ] Expenses section groups line items by Flights / Hotels / Transport / Production / Other; each row has status chip.
- [ ] Day P/L renders at bottom of the expenses section.
- [ ] At `xl:` (1280px+), right-rail meta sidebar renders 4 stacked sections; `+` buttons alert `TODO: Phase F`. On narrower screens, right rail is hidden and layout stacks.
- [ ] On mobile (<768px), day strip scrolls horizontally, income panel stacks.
- [ ] `src/components/budget/DayViewTab.tsx` still works as a thin wrapper rendering `<RoutingIncomePanel showDayStrip>` — no visual regression to anywhere that still uses `DayViewTab` directly.
- [ ] `src/app/(app)/budget/page.tsx` no longer special-cases `day-view`. Budget tabs route normally.
- [ ] Routing editor save button still opens the post-save modal with Advance / Budget / Dashboard links.
- [ ] `window.location.hash = '#d=nonsense'` on load → hook falls back to first routing id; no crash.
- [ ] Empty-state: tour with zero routing rows shows "No routing dates. Add routing above to see income and expenses." in both the day strip and the panel.
- [ ] Clicking a day without a show (e.g. `day_type=off`) shows the income panel with the same Income rows (likely all £0), the expense groups for that date, and the right rail with "Day Off" chip. Should not hide the panel — many off-days still have expenses (hotels, transport).

---

# Final Output

Per-section, Cursor reports:

- The Step 0 verification output (pasted verbatim).
- Whether the section ran or was skipped as already-done.
- If ran: files touched + any deviations from the spec.

Then a global summary at the end:

```
§1 A0.3 — <ran | skipped>
§2 A0.4 — <ran | skipped>
§3 A0.6 — <ran | skipped>
§4 A0.7 — <ran | skipped>
§5 A1   — <ran | skipped | blocked on income-formula decision>
```

Then a final verification block:

```bash
npx tsc --noEmit --skipLibCheck
npm run lint

# File tree sanity
ls src/hooks/useIsMobile.ts src/lib/dayType.ts src/components/ui/ContextMenu.tsx src/components/day-view/RoutingIncomePanel.tsx src/app/\(app\)/tours/\[id\]/routing/RoutingPageShell.tsx

# Dead code should be gone
ls src/components/layout/Header.tsx src/components/layout/HeaderArtistTourPicker.tsx 2>&1 | grep -v "No such file" || echo "OK: old header files deleted"

# localStorage key migration
git grep -n 'lp-sidebar-mode' src/
git grep -n 'lp-workspace-mode' src/

# Duplicate helpers removed
git grep -n "^function dayTypeLabel" src/
git grep -n "from '@/lib/dayType'" src/
```

Expected:

- tsc + lint: clean.
- `ls` on new files: all exist.
- Old header files: gone.
- `lp-sidebar-mode`: 0 hits.
- `lp-workspace-mode`: ≥1 hit in `AppTopBarModePill.tsx`.
- `^function dayTypeLabel`: 0 hits.
- `@/lib/dayType` imports: ≥3 files.

Stop after printing the summary + verification. Do not auto-continue into any other PR. Do not start Phase A PDF work.

---

# Standing out-of-scope for this mega prompt

- Phase A PDF export (puppeteer) — separate PR.
- Phase B realtime + share link — separate.
- Phase C personnel / groups / party chips wiring — separate (chip color system is already defined in the design references block above).
- Phase D versioning / undo — separate.
- Phase E templates — separate.
- Phase F scheduling — separate; the right-rail in §5 has `+` stubs that will be wired here.
- Phase G venues, Phase H activity log, etc. — separate.
- Mobile drawer polish beyond §1's minimum — separate.
- Colour alignment of `dayDotClass` / `dayTypeClass` across components — separate (flagged in §3 out-of-scope).
- Income formula: locked to Reading B (§5 Step 4). Any future change is a separate PR.
- Wiring the context-menu "Clear advance data" item to the actual DELETE flow — separate PR.
- Any change to advance detail page `/tours/[id]/advance/[routingId]` — separate (the Daysheets three-column redesign lives there and is a big enough PR to justify its own prompt).

---

# Appendix A — Data shapes Cursor should assume (read, don't invent)

Already in the codebase (`src/components/budget/DayViewTab.tsx`):

```ts
type RoutingRow = {
  id: string;
  date: string;
  day_type: string;
  venue?: { name?: string | null; city?: string | null; country?: string | null } | null;
  venue_name?: string | null;
  city?: string | null;
  country?: string | null;
};

type IncomeRow = {
  routing_id: string;
  pre_tax_guarantee: number;
  withholding_pct: number;
  post_tax_guarantee: number;
  pre_tax_overage: number;
  post_tax_overage: number;
  merch_income: number;
  vip_income: number;
  actual_guarantee: number | null;
  actual_overage: number | null;
  actual_merch: number | null;
  actual_vip: number | null;
};

type LineItemRow = {
  id: string;
  routing_id: string | null;
  category: string;
  label: string;
  proposed_cost: number;
  actual_cost: number;
  status?: string | null;
};
```

Reuse these types in `RoutingIncomePanel.tsx`. Do not redefine.

---

# Appendix B — If anything is ambiguous

Stop. Report. Do NOT invent behaviour. Adam prefers clarification to guesswork (see his user preferences). When in doubt:

- Formula decisions → always defer to the JSDoc-flagged block.
- Visual density decisions → default to the Daysheets reference (airier over denser).
- Context-menu wiring → leave as stub, note in PR description.
- Any schema or API change needed to complete a task → STOP, do not perform, report instead.
