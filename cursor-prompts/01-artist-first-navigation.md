# Cursor Prompt 01: Artist-First Navigation

## Context

**Stack**: Next.js 16 App Router, TypeScript, Tailwind CSS v4 (`@theme inline` tokens in `globals.css`), Supabase.

**Design system**: See `DESIGN_SYSTEM.md` in project root. Key tokens: `lp-orange` (#FF4500), `lp-bg`, `lp-surface`, `lp-border`, `lp-text`, `lp-text-secondary`. Glass-morphic cards with `backdrop-blur`. Dark mode via `.dark` class on `<html>`.

**Current navigation**: Sidebar (`src/components/layout/Sidebar.tsx`) with nav groups: Dashboard, Tour Management (Tours/Advance/Calendar), Finance (Budget/Rooming), Data (Artists/Personnel/Venues), Admin (Settings/Bugs). Tours are accessed via `/tours` list page → `/tours/[id]` detail. Budget accessed via `/budget?tour_id={id}`.

**Goal**: Restructure navigation so the user picks an **artist** first, then a **tour**, and everything scopes to that context. The artist stays as a persistent header element. This replaces the current sidebar-first approach.

## What to Build

### 1. Artist Context Provider

Create `src/contexts/ArtistTourContext.tsx`:

```typescript
'use client';
import { createContext, useContext, useState, useEffect, ReactNode } from 'react';

interface ArtistTourContextType {
  selectedArtistId: string | null;
  selectedTourId: string | null;
  selectedArtist: Artist | null;
  selectedTour: Tour | null;
  setSelectedArtistId: (id: string | null) => void;
  setSelectedTourId: (id: string | null) => void;
  tours: Tour[]; // tours for the selected artist
  isLoading: boolean;
}

// Persist to localStorage keys: 'lp-selected-artist', 'lp-selected-tour'
// When artist changes, clear selected tour and fetch tours for new artist
// When tour changes, update localStorage
// Fetch artist data and tours from Supabase on mount and when IDs change
```

**Types** are already defined in `src/types/index.ts`:
- `Artist`: id, workspace_id, name, slug, spotify_image_url, branding
- `Tour`: id, workspace_id, artist_id, name, start_date, end_date, continent, currency, status, artist (optional joined)

### 2. Artist Selector in Header

Modify `src/components/layout/Header.tsx` to include an artist dropdown selector on the LEFT side of the header bar, before the page title.

**Current Header structure** (from audit): Shows page title, search, notifications, dark mode toggle.

**New Header structure**:
```
┌──────────────────────────────────────────────────────────────┐
│  [Artist Image] Good Neighbours ▾  │  Bottlerock & Miami ▾  │
│                                    │  May 2026 · 2 shows    │
└──────────────────────────────────────────────────────────────┘
```

Left side: Artist selector dropdown. Shows `spotify_image_url` as a small avatar (32px circle) + artist name. Dropdown lists all artists in workspace, filtered by Supabase query `supabase.from('artists').select('*').eq('workspace_id', profile.workspace_id).order('name')`.

Right of artist: Tour selector. Only visible when an artist is selected. Shows current tour name + date range + show count. Dropdown lists tours for the selected artist: `supabase.from('tours').select('*').eq('artist_id', selectedArtistId).order('start_date', { ascending: false })`.

Use the existing `lp-surface` background with `lp-border` border for dropdowns. Active item highlighted with `lp-orange` left border.

### 3. Simplify Sidebar

Modify `src/components/layout/Sidebar.tsx`. Remove the current navGroups structure. Replace with:

**When no artist selected:**
```
LOWPASS (logo)
+ NEW TOUR

───────────
Dashboard
Artists
Personnel
Venues
Settings
```

**When artist + tour selected:**
```
LOWPASS (logo)
+ NEW TOUR

───────────
Dashboard

TOUR
  Overview     → /tours/[id]
  Routing      → /tours/[id] (same page, scroll to routing)
  Advance      → /tours/[id]/advance
  Day View     → /tours/[id]/day        (NEW - Phase 2)
  Spreadsheet  → /tours/[id]/sheet      (NEW - Phase 2)
  Summary      → /tours/[id]/summary    (NEW - Phase 5)

FINANCE
  Budget       → /budget?tour_id=[id]
  Payroll      → (future)
  Rooming      → /rooming?tour_id=[id]
  Settlement   → /budget?tour_id=[id]&tab=settlement

DATA
  Artists
  Personnel
  Venues

ADMIN
  Settings
```

The TOUR and FINANCE sections are only visible when a tour is selected. The tour_id is automatically injected from the ArtistTourContext — the user never has to manually select a tour on the budget/rooming pages anymore.

### 4. Auto-inject tour_id into Budget and Rooming pages

Modify `src/app/(app)/budget/page.tsx`:
- If `searchParams.tour_id` is NOT present BUT `ArtistTourContext.selectedTourId` IS set, redirect to `/budget?tour_id={selectedTourId}&tab=summary`
- This eliminates the current "pick a tour" landing page when a tour is already selected via the header

Same change for `src/app/(app)/rooming/page.tsx`.

### 5. Wrap the app layout with the context provider

Modify `src/app/(app)/layout.tsx`:
- Import and wrap children with `<ArtistTourProvider>`
- The provider should be inside the existing auth check (the layout already verifies the user is authenticated)

### 6. Update AppShell to pass context

Modify `src/components/layout/AppShell.tsx`:
- Header and Sidebar should consume `useArtistTourContext()` to get the selected artist/tour
- No prop drilling — use the context hook directly in Header and Sidebar

## Files to create

1. `src/contexts/ArtistTourContext.tsx`

## Files to modify

1. `src/app/(app)/layout.tsx` — wrap with ArtistTourProvider
2. `src/components/layout/Header.tsx` — add artist + tour selectors
3. `src/components/layout/Sidebar.tsx` — restructure nav based on context
4. `src/app/(app)/budget/page.tsx` — auto-redirect when tour is in context
5. `src/app/(app)/rooming/page.tsx` — same auto-redirect

## Files to NOT modify

- Do NOT touch any budget tab components (`src/components/budget/*`)
- Do NOT touch any advance components
- Do NOT touch any API routes
- Do NOT modify the database schema
- Do NOT change the auth flow

## API calls needed (all existing endpoints)

- `GET /api/artists` or direct Supabase: `supabase.from('artists').select('*').eq('workspace_id', workspaceId)`
- `GET /api/tours` or direct Supabase: `supabase.from('tours').select('*, artist:artists(*)').eq('artist_id', artistId)`
- User's workspace_id comes from their profile (already fetched in the app layout via `/api/profile`)

## Styling rules

- Artist avatar: 32px circle, `object-cover`, border `1px solid var(--lp-border)`
- Dropdowns: `bg-lp-surface`, `border-lp-border`, `rounded-lg`, `shadow-lg`, max-height 300px with overflow-y scroll
- Active dropdown item: `border-l-2 border-lp-orange bg-lp-orange/5`
- Tour info text: artist name `text-sm font-bold text-lp-text`, tour name `text-xs text-lp-text-secondary`
- Transition: dropdowns use `transition-all duration-150`

## Do NOT

- Do NOT install any new npm packages for dropdowns — use a simple div with onClick toggle + onBlur close
- Do NOT remove the existing BudgetTourLanding/BudgetTourSelector components — they'll still work as fallback when no context is set
- Do NOT break the existing `/tours/[id]` page — it should continue to work with the URL param
- Do NOT change the current `+ NEW TOUR` button behaviour
- Do NOT add any new database tables or columns
