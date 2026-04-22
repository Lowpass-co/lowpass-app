# Cursor Prompt — PR A0.1: AppTopBar (pill-slider top bar)

Paste this whole file into Cursor. Execute in order. Do not skip steps. Do not add scope beyond what is listed. If a step is ambiguous, stop and ask rather than guessing.

---

## Context

Lowpass is a Next.js 16.1.6 (App Router, React 19, TS strict) touring management app. Styling: Tailwind 4 with CSS variables defined in `src/app/globals.css` (`--lp-orange`, `--lp-text`, `--lp-bg`, etc.) and HeroUI components where relevant. Icons: `lucide-react`. **No framer-motion** (animations are CSS `transform` + `transition-transform` only — enforced project rule).

You are starting Phase A0 of a build plan documented in `BUILD_PLAN_AWM_PARITY.md`. This PR (A0.1) is chrome-only: build a new top bar, swap it into `AppShell`, do not touch any routes / APIs / page logic.

The old `src/components/layout/Header.tsx` stays in place for now — you will mark `HeaderArtistTourPicker` as deprecated but delete it in PR A0.4, not this one.

---

## Goal

Build `AppTopBar` — a floating "Tablet OS" top bar with three regions:

```
┌───────────────────────────────────────────────────────────────────────┐
│ [artist img] Artist / Tour ▾         [ Advance | Budget ]    🔔 ☀️ 👤 │
└───────────────────────────────────────────────────────────────────────┘
   breadcrumb (left)              mode pill (centered)          actions (right)
```

- **Breadcrumb** reuses the existing artist/tour switch logic from `HeaderArtistTourPicker.tsx`.
- **Pill slider** is a new `[Advance | Budget]` toggle. Clicking a pill navigates:
  - `Advance` → `/tours/{selectedTourId}/advance` (or `/advance?artist_id=...` if no tour selected)
  - `Budget` → `/budget?tour_id={selectedTourId}` (or `/budget` if no tour selected)
- **Actions** reuse existing notifications bell + `DarkModeToggle` + user menu icon from `Header.tsx`. "New Tour" button stays in the breadcrumb region for now (we'll reassess in A0.3).

---

## Files to create

### 1. `src/components/layout/AppTopBar.tsx`

```tsx
'use client';

/* ============================================
   LOWPASS — App Top Bar
   Floating pill-slider top bar. Replaces Header.tsx.
   Two-axis nav: top = mode (Advance/Budget), sidebar = shows.
   ============================================ */

import { Suspense } from 'react';
import Link from 'next/link';
import { Bell, Menu, Plus } from 'lucide-react';
import { DarkModeToggle } from './DarkModeToggle';
import { AppTopBarBreadcrumb } from './AppTopBarBreadcrumb';
import { AppTopBarModePill } from './AppTopBarModePill';
import { useArtistTourContext } from '@/contexts/ArtistTourContext';
import { cn } from '@/lib/utils';

interface AppTopBarProps {
  onMenuClick?: () => void;
}

export function AppTopBar({ onMenuClick }: AppTopBarProps) {
  const { selectedArtistId, hydrated } = useArtistTourContext();
  const compactNewTour = hydrated && !!selectedArtistId;

  return (
    <header className="sticky top-0 z-20 overflow-visible border-b border-lp-border bg-lp-bg/80 px-4 backdrop-blur-sm sm:px-6">
      <div className="flex min-h-16 items-center gap-3 py-2 lg:gap-4 lg:py-0">
        {/* Mobile menu button */}
        <button
          type="button"
          onClick={onMenuClick}
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-lp-text-secondary hover:bg-lp-bg-tertiary lg:hidden"
          aria-label="Open menu"
        >
          <Menu size={20} />
        </button>

        {/* New Tour button (compact when artist selected) */}
        <Link
          href="/tours/create"
          title={compactNewTour ? 'New tour' : undefined}
          aria-label={compactNewTour ? 'New tour' : undefined}
          className={cn(
            'flex shrink-0 items-center justify-center rounded-lg border border-lp-orange text-lp-orange transition-colors duration-200',
            'hover:bg-lp-orange hover:text-white dark:hover:text-black',
            compactNewTour
              ? 'h-9 w-9'
              : 'min-h-[2.75rem] gap-1.5 px-3 py-2 text-xs font-bold tracking-widest'
          )}
          style={compactNewTour ? undefined : { letterSpacing: '0.12em' }}
        >
          <Plus size={compactNewTour ? 18 : 14} strokeWidth={compactNewTour ? 2 : 2.5} className="shrink-0" />
          {!compactNewTour && <span className="whitespace-nowrap">NEW TOUR</span>}
        </Link>

        {/* Breadcrumb */}
        <Suspense
          fallback={
            <div className="min-h-[2.75rem] flex-1 rounded-lg border border-lp-border bg-lp-bg/50 sm:max-w-[min(100%,28rem)]" />
          }
        >
          <AppTopBarBreadcrumb />
        </Suspense>

        {/* Mode pill (centered on wider screens) */}
        <div className="ml-auto hidden shrink-0 md:block">
          <AppTopBarModePill />
        </div>

        {/* Right actions */}
        <div className="flex shrink-0 items-center gap-1">
          <button
            type="button"
            className="relative flex h-9 w-9 items-center justify-center rounded-lg text-lp-text-secondary hover:bg-lp-bg-tertiary hover:text-lp-text transition-colors"
            aria-label="Notifications"
          >
            <Bell size={18} />
            <span className="absolute right-1.5 top-1.5 h-2 w-2 rounded-full bg-lp-orange" />
          </button>
          <DarkModeToggle />
        </div>
      </div>

      {/* Mobile: pill below on narrow screens */}
      <div className="md:hidden -mt-1 pb-2 flex justify-center">
        <AppTopBarModePill />
      </div>
    </header>
  );
}
```

### 2. `src/components/layout/AppTopBarBreadcrumb.tsx`

Extract the breadcrumb from `HeaderArtistTourPicker.tsx` **verbatim** — copy the file, rename the exported function to `AppTopBarBreadcrumb`, no behavior changes. This lets us delete `HeaderArtistTourPicker` cleanly in PR A0.4 without regressions.

```tsx
'use client';

/* ============================================
   LOWPASS — AppTopBar breadcrumb
   Artist / Tour chooser for the top bar.
   Behavior copy of HeaderArtistTourPicker;
   that file is deprecated and deleted in PR A0.4.
   ============================================ */

// (Copy the full body of HeaderArtistTourPicker.tsx here, exported as
//  `export function AppTopBarBreadcrumb()` instead of
//  `export function HeaderArtistTourPicker()`. Do NOT modify logic.)
```

### 3. `src/components/layout/AppTopBarModePill.tsx`

```tsx
'use client';

/* ============================================
   LOWPASS — AppTopBar mode pill
   [Advance | Budget] pill slider.
   Persists active pill to 'lp-sidebar-mode' localStorage
   (shared key with Sidebar — rename deferred to A0.4).
   ============================================ */

import { useEffect, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { useArtistTourContext } from '@/contexts/ArtistTourContext';
import { cn } from '@/lib/utils';

type Mode = 'advance' | 'budget';

const MODE_KEY = 'lp-sidebar-mode';

function resolveModeFromPath(pathname: string | null): Mode | null {
  if (!pathname) return null;
  if (pathname.startsWith('/budget')) return 'budget';
  if (pathname.includes('/advance')) return 'advance';
  return null;
}

export function AppTopBarModePill() {
  const router = useRouter();
  const pathname = usePathname();
  const { selectedTourId, selectedArtistId, hydrated } = useArtistTourContext();

  // Initial mode: url wins > localStorage > default 'advance'
  const [mode, setMode] = useState<Mode>(() => {
    if (typeof window === 'undefined') return 'advance';
    const fromPath = resolveModeFromPath(window.location.pathname);
    if (fromPath) return fromPath;
    const stored = window.localStorage.getItem(MODE_KEY);
    return stored === 'budget' ? 'budget' : 'advance';
  });

  // Keep mode in sync with URL changes (covers sidebar clicks etc.)
  useEffect(() => {
    const fromPath = resolveModeFromPath(pathname);
    if (fromPath && fromPath !== mode) setMode(fromPath);
  }, [pathname, mode]);

  // Persist user-initiated changes
  useEffect(() => {
    if (typeof window === 'undefined') return;
    window.localStorage.setItem(MODE_KEY, mode);
  }, [mode]);

  const go = (next: Mode) => {
    setMode(next);
    const artistQ = selectedArtistId ? `?artist_id=${selectedArtistId}` : '';
    if (next === 'advance') {
      router.push(selectedTourId ? `/tours/${selectedTourId}/advance` : `/advance${artistQ}`);
    } else {
      router.push(selectedTourId ? `/budget?tour_id=${selectedTourId}` : '/budget');
    }
  };

  // Skeleton while hydrating
  if (!hydrated) {
    return <div className="h-10 w-48 rounded-full bg-lp-surface/60" aria-hidden />;
  }

  return (
    <div
      role="tablist"
      aria-label="Section"
      className="relative flex h-10 w-48 items-center rounded-full border border-lp-border bg-lp-surface p-1 shadow-sm"
    >
      {/* Animated indicator */}
      <div
        aria-hidden
        className={cn(
          'absolute top-1 bottom-1 w-[calc(50%-0.25rem)] rounded-full bg-lp-orange shadow-sm transition-transform duration-200 ease-out',
          mode === 'advance' ? 'translate-x-0' : 'translate-x-full'
        )}
        style={{ left: '0.25rem' }}
      />
      <button
        type="button"
        role="tab"
        aria-selected={mode === 'advance'}
        aria-pressed={mode === 'advance'}
        onClick={() => go('advance')}
        className={cn(
          'relative z-10 flex-1 rounded-full px-3 py-1.5 text-xs font-semibold tracking-wide transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-lp-orange focus-visible:ring-offset-2 focus-visible:ring-offset-lp-bg',
          mode === 'advance' ? 'text-white' : 'text-lp-text-secondary hover:text-lp-text'
        )}
      >
        Advance
      </button>
      <button
        type="button"
        role="tab"
        aria-selected={mode === 'budget'}
        aria-pressed={mode === 'budget'}
        onClick={() => go('budget')}
        className={cn(
          'relative z-10 flex-1 rounded-full px-3 py-1.5 text-xs font-semibold tracking-wide transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-lp-orange focus-visible:ring-offset-2 focus-visible:ring-offset-lp-bg',
          mode === 'budget' ? 'text-white' : 'text-lp-text-secondary hover:text-lp-text'
        )}
      >
        Budget
      </button>
    </div>
  );
}
```

---

## Files to modify

### 4. `src/components/layout/AppShell.tsx`

Replace the import + usage of `Header` with `AppTopBar`. Keep the rest of the file (Sidebar, ArtistTourScopeGuard, OverviewArtistQuerySync, main, mobile overlay) untouched.

```diff
- import { Header } from '@/components/layout/Header';
+ import { AppTopBar } from '@/components/layout/AppTopBar';
```

```diff
-        <Header onMenuClick={() => setMobileMenuOpen(!mobileMenuOpen)} />
+        <AppTopBar onMenuClick={() => setMobileMenuOpen(!mobileMenuOpen)} />
```

### 5. `src/components/layout/HeaderArtistTourPicker.tsx`

Add a `@deprecated` JSDoc at the top of the exported function, pointing to `AppTopBarBreadcrumb`. Do **not** delete the file — it still ships so that anything that still imports it keeps working until A0.4.

```tsx
/**
 * @deprecated Use `AppTopBarBreadcrumb` from `./AppTopBarBreadcrumb` instead.
 * Scheduled for removal in PR A0.4.
 */
export function HeaderArtistTourPicker() { /* ... existing body unchanged ... */ }
```

### 6. `src/components/layout/Header.tsx`

Add a `@deprecated` JSDoc at the top of the exported function, pointing to `AppTopBar`. Do **not** delete.

```tsx
/**
 * @deprecated Use `AppTopBar` from `./AppTopBar` instead.
 * Scheduled for removal in PR A0.4.
 */
export function Header({ title, subtitle, onMenuClick }: HeaderProps) { /* ... existing body unchanged ... */ }
```

---

## Design tokens (must use, do not hard-code hex)

Use the existing Tailwind utilities backed by CSS variables:

- Backgrounds: `bg-lp-bg`, `bg-lp-surface`, `bg-lp-bg-tertiary`
- Borders: `border-lp-border`
- Text: `text-lp-text`, `text-lp-text-secondary`, `text-lp-text-tertiary`
- Accent: `bg-lp-orange`, `text-lp-orange`, `border-lp-orange`

Shadow + glass: `shadow-sm` + `bg-lp-bg/80` + `backdrop-blur-sm` (matches the existing `Header.tsx` pattern — intentional to keep the "floating" feel).

Spacing: 4px base, so `p-1`, `gap-1`, `gap-3`, `gap-4` (not arbitrary values).

Pill sizing: height `h-10` (40px), width `w-48` (192px). Inner padding `p-1` (4px). Indicator uses `calc(50%-0.25rem)` to match.

---

## Hard rules — do not break

1. **No framer-motion.** Animations use CSS `transform` + `transition-transform` only.
2. **Do not modify** `Sidebar.tsx` in this PR. The existing in-sidebar Advance/Budget toggle stays live — we delete it in A0.2. Both controls use the same `lp-sidebar-mode` localStorage key, so they stay in sync.
3. **Do not modify** any route files, API routes, or page content. A0.1 is chrome-only.
4. **Do not add** new dependencies to `package.json`.
5. **Do not rename** the `lp-sidebar-mode` key yet (rename is A0.4 cleanup).
6. **Preserve behavior** of `HeaderArtistTourPicker` exactly — `AppTopBarBreadcrumb` is a byte-for-byte copy with the function renamed.

---

## Acceptance criteria (run through each before finishing)

- [ ] `npx tsc --noEmit --skipLibCheck` is clean.
- [ ] `npm run lint` is clean (or at least does not add new errors).
- [ ] `npm run dev` boots with no console errors on load.
- [ ] Visit `/dashboard` — top bar renders with breadcrumb, pill, right actions.
- [ ] Visit `/tours/<any-tour>/advance` — pill shows **Advance** active.
- [ ] Visit `/budget` — pill shows **Budget** active.
- [ ] Visit `/budget?tour_id=<any>` — pill shows **Budget** active.
- [ ] Click **Budget** pill while on `/advance` — router navigates to `/budget?tour_id=<selected>` if tour selected, `/budget` otherwise.
- [ ] Click **Advance** pill while on `/budget` — router navigates to `/tours/<selected>/advance` if tour selected, `/advance?artist_id=<selected>` otherwise.
- [ ] Pill animation is smooth (transform transition, not opacity flicker).
- [ ] On mobile viewport (< 768px), pill moves below the top row (keeps breadcrumb readable).
- [ ] Keyboard tab order: menu → new tour → breadcrumb → pill buttons → notifications → dark mode. Focus ring visible on each.
- [ ] `aria-pressed` on each pill button reflects active state.
- [ ] Reload mid-use — pill state restored from localStorage (matches URL if URL wins).
- [ ] Open the sidebar's existing Advance/Budget toggle — clicking there also updates the top-bar pill (both read the same localStorage key and both resync off pathname).
- [ ] Dark mode toggle still works and the top bar restyles correctly (CSS-variable driven).
- [ ] No regression on any existing page — all other nav, pages, API calls unchanged.

---

## Verification commands (run after implementation)

```bash
npx tsc --noEmit --skipLibCheck
npm run lint
WATCHPACK_POLLING=true npm run dev   # smoke-test in browser
```

Paste the tail of each command's output into the PR description.

---

## Out of scope for this PR (explicitly defer)

- Removing the sidebar's Advance/Budget toggle → **PR A0.2**
- Deciding Rooming/Payroll/Personnel/Venues/Equipment/Calendar/Settings placement (kebab vs secondary nav group) → **PR A0.3**
- Deleting `HeaderArtistTourPicker.tsx` and `Header.tsx` → **PR A0.4**
- Renaming `lp-sidebar-mode` localStorage key → **PR A0.4** (with migration)
- Any PDF / share / template / realtime work → **Phase A+**

---

## Output format expected from Cursor

When done, report:
1. File tree diff (list of files created/modified).
2. The output of `npx tsc --noEmit --skipLibCheck` (must be empty = success).
3. A short note on any deviations from the prompt with justification.

Then stop. Do not auto-continue into A0.2 — I'll review A0.1 first and kick off A0.2 separately.
