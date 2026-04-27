# Cursor Prompt — PR A0.7: Routing Page Shell

Paste this whole file into Cursor. Execute in order. Do not skip steps. Do not add scope beyond what is listed. If a step is ambiguous, STOP and ask rather than guessing.

---

## Context

The tour routing page today is a flat `<RoutingEditor>` rendered directly inside `AppShell`'s `<main>`. The editor owns:

- View tabs (Grid / Calendar / Map)
- Save button
- iCal feed modal
- After-save "what next?" modal
- Row fetch + mutation

There is **no page-level chrome**: no title bar, no subtitle, no right-rail for at-a-glance info (shows/travel/off counts, day-type legend).

This PR introduces a **RoutingPageShell** — a layout wrapper the routing page (and eventually other "routing-like" pages, e.g. the combined A1 routing+income page) plugs into. The shell owns:

- Page title / subtitle region
- Main content slot (the editor stays unchanged)
- Right-rail slot (fixed-width aside on desktop; collapsible toggle on mobile)

It also introduces the canonical **`useIsMobile`** hook (this was spec'd in the never-shipped A0.3 prompt — we subsume that portion here).

Scope is deliberately narrow:

- No changes to `RoutingEditor` logic or props.
- No changes to `TourRoutingList` (A0.5 stays its own PR).
- No changes to `dayTypeLabel` helpers (A0.6 stays its own PR).
- No new API routes.
- Right-rail fetches its own data (no cross-component sync for v1).

At the tail of this prompt we also delete two orphaned files left behind by the partial A0.4 cleanup:

- `src/components/layout/Header.tsx`
- `src/components/layout/HeaderArtistTourPicker.tsx`

Both have zero imports across `src/` and are safe to remove.

---

## Hard rules

1. **No new npm dependencies.** Everything in this PR uses React, Next, Tailwind, lucide-react — all already installed.
2. **No Supabase migrations.** Zero DB changes.
3. **No changes to `RoutingEditor.tsx`**, `RoutingGrid.tsx`, `RoutingCalendar.tsx`, `RoutingMap.tsx`, or `TourRoutingList.tsx`. If you find yourself wanting to edit any of these, STOP and ask.
4. **No route changes.** The URL `/tours/[id]/routing` stays the same.
5. **Use existing design tokens only** — `border-lp-border`, `bg-lp-surface`, `bg-lp-surface-hover`, `text-lp-text`, `text-lp-text-secondary`, `text-lp-text-tertiary`, `lp-accent`, `lp-orange`. No hex codes.
6. **SSR-safe.** The `useIsMobile` hook must not blow up during server render (no `window` access without guards).
7. **Strict TypeScript.** Zero `any`, zero `@ts-ignore`, zero unused imports. The repo uses TS strict mode.
8. **Tailwind only.** No inline styles except where the existing codebase already uses them (CSS variables like `var(--sidebar-w)`).

---

## File list (3 new, 1 edit, 2 deletions)

**New (3):**

- `src/hooks/useIsMobile.ts`
- `src/components/routing/RoutingPageShell.tsx`
- `src/components/routing/RoutingRightRail.tsx`

**Edit (1):**

- `src/app/(app)/tours/[id]/routing/page.tsx`

**Delete (2):**

- `src/components/layout/Header.tsx`
- `src/components/layout/HeaderArtistTourPicker.tsx`

---

## Step 0 — Pre-flight output (A–G)

Before writing any code, output the following. If any check fails, STOP and report.

### A. Last commit on `main`

```
git log --oneline -1
```

### B. Target files do not exist yet

```
ls src/hooks/useIsMobile.ts 2>&1
ls src/components/routing/RoutingPageShell.tsx 2>&1
ls src/components/routing/RoutingRightRail.tsx 2>&1
```

All three should say "No such file".

### C. Files to edit / delete do exist

```
ls src/app/\(app\)/tours/\[id\]/routing/page.tsx
ls src/components/layout/Header.tsx
ls src/components/layout/HeaderArtistTourPicker.tsx
```

All three must exist.

### D. Orphan check — nothing imports the two files you're about to delete

```
grep -rn "from.*components/layout/Header['\"]" src/
grep -rn "HeaderArtistTourPicker" src/ | grep -v "Header.tsx" | grep -v "HeaderArtistTourPicker.tsx"
```

Both should come back EMPTY (the only matches in file 2 should be the self-references inside the two files themselves — those don't count). If anything else imports these files, STOP.

### E. Routing API shape — verify the lite GET response

```
grep -n "export async function GET" src/app/api/tours/\[id\]/routing/route.ts | head -3
head -60 src/app/api/tours/\[id\]/routing/route.ts
```

Report the response shape. The right-rail will consume this endpoint. If the response shape is not `{ id, date, day_type, city, venue_name }[]` or similar, note the actual shape.

### F. `AppShell` main padding

```
grep -n "className=\"flex min-h-0" src/components/layout/AppShell.tsx
```

Confirm `<main>` has `px-8 py-6` (or whatever the current padding is). The shell should NOT re-apply outer padding — it lives inside this `<main>`.

### G. Existing `useIsMobile`? (sanity — should be none)

```
grep -rn "useIsMobile\|useMediaQuery\|useBreakpoint" src/hooks/ 2>&1
```

Should come back empty or "No such file or directory". If a similar hook already exists, STOP and show me — we may be able to reuse.

---

## Step 1 — Create `src/hooks/useIsMobile.ts`

Create the file with exactly this content:

```tsx
/* ============================================
   LOWPASS — useIsMobile

   Canonical responsive breakpoint hook.
   Returns true when viewport is narrower than Tailwind's `md` breakpoint
   (768px). SSR-safe: returns false on server, then syncs on mount.
   ============================================ */

'use client';

import { useEffect, useState } from 'react';

const MOBILE_MEDIA_QUERY = '(max-width: 767px)';

export function useIsMobile(): boolean {
  const [isMobile, setIsMobile] = useState<boolean>(false);

  useEffect(() => {
    if (typeof window === 'undefined') return;

    const mq = window.matchMedia(MOBILE_MEDIA_QUERY);
    const update = () => setIsMobile(mq.matches);

    update();
    mq.addEventListener('change', update);
    return () => mq.removeEventListener('change', update);
  }, []);

  return isMobile;
}
```

**Acceptance:**

- File exists at `src/hooks/useIsMobile.ts`.
- No imports unused.
- `tsc` clean.

---

## Step 2 — Create `src/components/routing/RoutingRightRail.tsx`

This is the right-rail content: at-a-glance stats + day-type legend + a disabled "Export routing" placeholder slot.

It fetches its own data from `/api/tours/[tourId]/routing`. For v1, it does NOT subscribe to edits in `RoutingEditor` — numbers are a snapshot at mount. Document this in a comment.

Create `src/components/routing/RoutingRightRail.tsx` with:

```tsx
/* ============================================
   LOWPASS — Routing Right Rail

   At-a-glance stats + day-type legend for the routing page.

   v1 known limitation: this fetches its own data from
   /api/tours/[id]/routing on mount. It does NOT reflect
   in-flight edits in RoutingEditor. Refresh the page to
   re-sync. Live sync is a follow-up (lift row state into a
   shared client parent, or use SWR/react-query).
   ============================================ */

'use client';

import { useEffect, useMemo, useState } from 'react';

type RoutingLiteRow = {
  id: string;
  date: string;
  day_type: string | null;
  city: string | null;
  venue_name: string | null;
};

type Stats = {
  shows: number;
  festivals: number;
  travel: number;
  off: number;
  rehearsal: number;
  total: number;
};

function computeStats(rows: RoutingLiteRow[]): Stats {
  const stats: Stats = {
    shows: 0,
    festivals: 0,
    travel: 0,
    off: 0,
    rehearsal: 0,
    total: rows.length,
  };
  for (const r of rows) {
    const type = (r.day_type ?? '').split(',')[0]?.trim().toLowerCase() ?? '';
    if (type === 'show') stats.shows += 1;
    else if (type === 'festival') stats.festivals += 1;
    else if (type === 'travel') stats.travel += 1;
    else if (type === 'off') stats.off += 1;
    else if (type === 'rehearsal') stats.rehearsal += 1;
  }
  return stats;
}

const LEGEND: { type: string; label: string; dotClass: string }[] = [
  { type: 'show',      label: 'Show',      dotClass: 'bg-lp-orange' },
  { type: 'festival',  label: 'Festival',  dotClass: 'bg-purple-500' },
  { type: 'travel',    label: 'Travel',    dotClass: 'bg-blue-500' },
  { type: 'rehearsal', label: 'Rehearsal', dotClass: 'bg-emerald-500' },
  { type: 'off',       label: 'Off',       dotClass: 'bg-neutral-500' },
];

export function RoutingRightRail({ tourId }: { tourId: string }) {
  const [rows, setRows] = useState<RoutingLiteRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setError(null);

    fetch(`/api/tours/${tourId}/routing`)
      .then(async (res) => {
        if (!res.ok) throw new Error(`Routing fetch failed: ${res.status}`);
        return (await res.json()) as { routing: RoutingLiteRow[] } | RoutingLiteRow[];
      })
      .then((payload) => {
        if (cancelled) return;
        const list = Array.isArray(payload) ? payload : payload.routing;
        setRows(list ?? []);
      })
      .catch((e: unknown) => {
        if (cancelled) return;
        setError(e instanceof Error ? e.message : 'Failed to load routing');
      });

    return () => {
      cancelled = true;
    };
  }, [tourId]);

  const stats = useMemo(() => (rows ? computeStats(rows) : null), [rows]);

  return (
    <aside
      aria-label="Routing summary"
      className="flex h-full w-full flex-col gap-6 border-l border-lp-border bg-lp-surface p-5"
    >
      <section>
        <h3 className="text-xs font-semibold uppercase tracking-widest text-lp-text-tertiary">
          At a glance
        </h3>
        <div className="mt-3 grid grid-cols-2 gap-3">
          <Stat label="Shows" value={stats?.shows} />
          <Stat label="Festivals" value={stats?.festivals} />
          <Stat label="Travel days" value={stats?.travel} />
          <Stat label="Off days" value={stats?.off} />
          <Stat label="Rehearsals" value={stats?.rehearsal} />
          <Stat label="Total" value={stats?.total} />
        </div>
        {error && (
          <p className="mt-3 text-xs text-red-500" role="alert">
            {error}
          </p>
        )}
      </section>

      <section>
        <h3 className="text-xs font-semibold uppercase tracking-widest text-lp-text-tertiary">
          Day types
        </h3>
        <ul className="mt-3 space-y-2">
          {LEGEND.map((item) => (
            <li key={item.type} className="flex items-center gap-2 text-sm text-lp-text">
              <span
                aria-hidden
                className={`h-2 w-2 shrink-0 rounded-full ${item.dotClass}`}
              />
              {item.label}
            </li>
          ))}
        </ul>
      </section>

      <section>
        <h3 className="text-xs font-semibold uppercase tracking-widest text-lp-text-tertiary">
          Export
        </h3>
        <button
          type="button"
          disabled
          className="mt-3 w-full rounded-md border border-lp-border bg-lp-surface-hover px-3 py-2 text-left text-sm text-lp-text-tertiary opacity-60"
          title="Coming soon"
        >
          Export routing (coming soon)
        </button>
      </section>
    </aside>
  );
}

function Stat({ label, value }: { label: string; value: number | undefined }) {
  return (
    <div className="rounded-md border border-lp-border bg-lp-surface-hover px-3 py-2">
      <div className="text-[10px] font-semibold uppercase tracking-widest text-lp-text-tertiary">
        {label}
      </div>
      <div className="mt-0.5 text-lg font-semibold tabular-nums text-lp-text">
        {value ?? '—'}
      </div>
    </div>
  );
}
```

**Notes for Cursor:**

- If `/api/tours/[id]/routing` returns something different from either `{ routing: [...] }` or a bare array, adjust the `Array.isArray` branch to match. The goal is defensive — don't crash if the shape is slightly off. Report what shape you saw in Step 0.E.
- The five built-in day types in `LEGEND` match the current `circleColor` helper in `TourRoutingList.tsx`. Do NOT try to pull from `tour.custom_day_types` in v1 — that's a follow-up.

**Acceptance:**

- File exists, compiles, renders correctly with no console warnings.
- All 6 stats render as `—` while loading, then fill in once fetch resolves.
- Error branch renders a red paragraph if fetch fails.

---

## Step 3 — Create `src/components/routing/RoutingPageShell.tsx`

The shell is a layout primitive. It takes:

- `title: string` — page title (e.g. "Routing").
- `subtitle?: string` — small secondary line under the title (e.g. the tour name or date range).
- `rightRail?: React.ReactNode` — optional right-rail content.
- `children: React.ReactNode` — main content (the editor).

Behavior:

- **Desktop (≥768px):** two-column grid, `grid-cols-[1fr_320px]`. Main content left, right-rail right. Header spans both columns.
- **Mobile (<768px):** single column. A toggle button in the header shows/hides the right-rail (renders below the content when open). No drawer or bottom sheet for v1 — just a collapsible block.
- **Right rail omitted:** if `rightRail` is `undefined` or `null`, the grid collapses to single column and no toggle button is shown, on any viewport.

Create `src/components/routing/RoutingPageShell.tsx` with:

```tsx
/* ============================================
   LOWPASS — Routing Page Shell

   Layout wrapper for the routing page.

   Desktop (≥768px):
     ┌───────────────── header ──────────────────┐
     │ main content           │   right rail     │
     │ (RoutingEditor)        │   (at a glance)  │
     └──────────────────────────────────────────┘

   Mobile (<768px):
     header (w/ toggle if rightRail present)
     main content
     [right rail inline when toggle is open]
   ============================================ */

'use client';

import { useState, type ReactNode } from 'react';
import { PanelRight, PanelRightClose } from 'lucide-react';
import { useIsMobile } from '@/hooks/useIsMobile';

export function RoutingPageShell({
  title,
  subtitle,
  rightRail,
  children,
}: {
  title: string;
  subtitle?: string;
  rightRail?: ReactNode;
  children: ReactNode;
}) {
  const isMobile = useIsMobile();
  const [mobileRailOpen, setMobileRailOpen] = useState(false);

  const hasRail = rightRail != null;
  const showRailInline = hasRail && (!isMobile || mobileRailOpen);

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {/* Header */}
      <div className="flex items-start justify-between gap-4 border-b border-lp-border pb-4">
        <div className="min-w-0">
          <h1 className="truncate text-2xl font-semibold text-lp-text">{title}</h1>
          {subtitle && (
            <p className="mt-1 truncate text-sm text-lp-text-secondary">{subtitle}</p>
          )}
        </div>
        {hasRail && isMobile && (
          <button
            type="button"
            onClick={() => setMobileRailOpen((v) => !v)}
            aria-expanded={mobileRailOpen}
            aria-controls="routing-right-rail"
            className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-md border border-lp-border bg-lp-surface text-lp-text hover:bg-lp-surface-hover"
            title={mobileRailOpen ? 'Hide summary' : 'Show summary'}
          >
            {mobileRailOpen ? (
              <PanelRightClose className="h-4 w-4" aria-hidden />
            ) : (
              <PanelRight className="h-4 w-4" aria-hidden />
            )}
          </button>
        )}
      </div>

      {/* Body */}
      {hasRail ? (
        <div
          className={
            isMobile
              ? 'flex min-h-0 flex-1 flex-col'
              : 'grid min-h-0 flex-1 grid-cols-[1fr_320px]'
          }
        >
          <div className="min-w-0 pt-6">{children}</div>
          {showRailInline && (
            <div
              id="routing-right-rail"
              className={isMobile ? 'mt-6' : 'pl-0'}
            >
              {rightRail}
            </div>
          )}
        </div>
      ) : (
        <div className="min-h-0 flex-1 pt-6">{children}</div>
      )}
    </div>
  );
}
```

**Acceptance:**

- File compiles, no unused imports.
- On desktop, right-rail sits flush against the right edge of `<main>`.
- On mobile, header toggle expands a full-width block beneath the content.
- If `rightRail` is not passed, no toggle appears and no grid column is reserved.

---

## Step 4 — Wire up the routing page

Edit `src/app/(app)/tours/[id]/routing/page.tsx`.

Current (39 lines):

```tsx
import { notFound } from 'next/navigation';
import { createServerSupabaseClient } from '@/lib/supabase-server';
import { RoutingEditor } from '@/components/routing/RoutingEditor';

export default async function RoutingPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createServerSupabaseClient();

  const { data: tour, error } = await supabase
    .from('tours')
    .select('id, start_date, end_date, custom_day_types')
    .eq('id', id)
    .single();

  if (error || !tour) {
    notFound();
  }

  return (
    <RoutingEditor
      tourId={id}
      startDate={tour.start_date ?? ''}
      endDate={tour.end_date ?? ''}
      initialCustomDayTypes={tour.custom_day_types ?? []}
    />
  );
}
```

Replace the `return` block. Also fetch the tour name for the subtitle. New version:

```tsx
import { notFound } from 'next/navigation';
import { createServerSupabaseClient } from '@/lib/supabase-server';
import { RoutingEditor } from '@/components/routing/RoutingEditor';
import { RoutingPageShell } from '@/components/routing/RoutingPageShell';
import { RoutingRightRail } from '@/components/routing/RoutingRightRail';

export default async function RoutingPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createServerSupabaseClient();

  const { data: tour, error } = await supabase
    .from('tours')
    .select('id, name, start_date, end_date, custom_day_types')
    .eq('id', id)
    .single();

  if (error || !tour) {
    notFound();
  }

  const subtitle = formatSubtitle(tour.name, tour.start_date, tour.end_date);

  return (
    <RoutingPageShell
      title="Routing"
      subtitle={subtitle}
      rightRail={<RoutingRightRail tourId={id} />}
    >
      <RoutingEditor
        tourId={id}
        startDate={tour.start_date ?? ''}
        endDate={tour.end_date ?? ''}
        initialCustomDayTypes={tour.custom_day_types ?? []}
      />
    </RoutingPageShell>
  );
}

function formatSubtitle(
  name: string | null,
  startDate: string | null,
  endDate: string | null,
): string {
  const parts: string[] = [];
  if (name) parts.push(name);
  if (startDate && endDate) {
    parts.push(`${startDate} → ${endDate}`);
  } else if (startDate) {
    parts.push(startDate);
  }
  return parts.join(' · ');
}
```

**Important:** the `select` now includes `name`. Verify that column exists on `tours`:

```
grep -n "^  name" database/migrations/*.sql | head -5
```

If the column is called something else (`title`, `tour_name`, etc.), swap accordingly and tell me in the final report.

**Acceptance:**

- Page renders. Title "Routing" appears. Subtitle shows `{name} · {start} → {end}`.
- Editor still works exactly as before (view tabs, save, modals, map all functional).
- Right-rail renders on desktop; toggle button renders on mobile.

---

## Step 5 — Delete orphaned old Header files

These files were supposed to be deleted in A0.4 but only the `localStorage` rename portion of that prompt shipped. Before deleting, re-verify nothing imports them:

```
grep -rn "from.*components/layout/Header['\"]" src/
grep -rn "HeaderArtistTourPicker" src/ | grep -v "Header.tsx" | grep -v "HeaderArtistTourPicker.tsx"
```

Both must be empty. If they are:

```
git rm src/components/layout/Header.tsx
git rm src/components/layout/HeaderArtistTourPicker.tsx
```

If EITHER grep finds a real import, STOP, don't delete, and report the import to me.

**Acceptance:**

- Both files deleted from working tree.
- `git status` shows them as deleted.
- TypeScript still compiles.

---

## Step 6 — Verification

Run all three and include the summary in your final report:

```
npx tsc --noEmit
```

```
npx eslint src/hooks/useIsMobile.ts src/components/routing/RoutingPageShell.tsx src/components/routing/RoutingRightRail.tsx 'src/app/(app)/tours/[id]/routing/page.tsx'
```

```
npx next build
```

All three must pass. For `next build`, report the final 10 lines of output.

Also do a manual sanity check by reading the final state of the 3 new files + 1 edited file and confirming:

- No `any` types.
- No unused imports.
- No `console.log` debug statements.
- No hardcoded hex colors.
- No `@ts-ignore` or `@ts-expect-error`.

---

## Final report format

Echo back exactly the following sections (fill in):

**Step 0 — Pre-flight output (A–G):** (paste outputs)

**Step 6 — Verification output:**
- `tsc --noEmit` summary (exit code + first 10 lines if errors)
- `eslint` summary (exit code + warnings/errors count)
- `next build` summary (last 10 lines)

**`git status -u --short`:** (paste)

**Any deviation from this prompt:** (if you changed anything — variable names, the API response-shape handling, the tour column name, etc. — list them)

**Final commit SHA:** (after you commit)

**Anything stopped on:** (or "nothing")

---

## Commit message

```
feat(routing): page shell + right-rail + useIsMobile hook (A0.7)

- Add RoutingPageShell: title/subtitle header + main/rightRail grid
- Add RoutingRightRail: at-a-glance stats + day type legend
- Add canonical useIsMobile hook (SSR-safe, matches Tailwind md:)
- Wire /tours/[id]/routing into the shell
- Delete orphaned Header.tsx + HeaderArtistTourPicker.tsx (A0.4 cleanup)

No API changes, no migrations, no RoutingEditor internals touched.
```
