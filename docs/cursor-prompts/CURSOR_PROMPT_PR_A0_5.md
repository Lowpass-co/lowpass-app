# Cursor Prompt — PR A0.5: TourRoutingList — Daysheets-style row redesign

Paste this whole file into Cursor. Execute in order. Do not skip steps. Do not add scope beyond what is listed. If a step is ambiguous, stop and ask rather than guessing.

Note on ordering: A0.4 (cleanup — delete old `Header.tsx` / `HeaderArtistTourPicker.tsx` + rename `lp-sidebar-mode` localStorage key) is still queued. This PR (A0.5) is a visual upgrade and is independent of A0.4 — can land in either order.

---

## Design references (standing — applies to all Lowpass PRs)

Lowpass borrows from three products. When resolving ambiguity in layout, interaction, or visuals, lean on these:

1. **Daysheets (daysheets.com, the tour management app)** — visual + interaction vocabulary.
   - Dark mode is the hero state, not an afterthought. Theme color `#0f172a`.
   - "All / Me" is a single universal personal-filter toggle across every module.
   - **Party chips** as the primary filter row on schedules: "All Parties / A Party / B Party / C Party" as a chip-row above the list.
   - Mobile reaches full parity with desktop — editing, creating, and admin must all work on mobile.
   - **Dense grids over card stacks** for tabular data.
   - Group Tags → sub-groups that personalise per-person itineraries.
   - **Day Types render with coloured accents** (vertical bar on list rows; tinted cells on month calendars).
   - Four mobile pivots for a tour: Day / Calendar / Routing / Map.
   - Global "+" add menu on mobile (persistent FAB) over per-screen add buttons.
   - Vocabulary: "beautiful", "clear", "modern", "speedy", "immediate response".

2. **Xero** — budget UX.
   - (a) Transaction-list pattern: inline-editable rows, per-row running totals, category tag per row, cell-level precision.
   - (b) Budget/forecast grid: rows = categories, columns = shows/months, editable cells, column + row totals.
   - Inline edits save on blur or Enter, not via modal dialogs.

3. **Notion** — context menus.
   - Every row-bearing page supports a context menu.
   - Trigger (i): right-click anywhere on a row → menu opens at cursor.
   - Trigger (ii): visible `⋯` kebab on row hover, click opens the same menu.
   - Menu items keyboard-accessible (arrow keys + Enter).
   - Menu structure (Daysheets-confirmed): icon on the left of each label, logical dividers grouping primary actions → cross-app actions → external links.

---

## Context

Lowpass's left-sidebar tour date list lives in `src/components/layout/TourRoutingList.tsx`. The current row visual is:

- Tiny 7×7px coloured dot on the left.
- `city` as the primary label (13px semibold).
- `date` in "19 May" short format below, muted.
- Active row = tinted background + orange date text.

Daysheets' equivalent (observed from screenshots Adam sent 2026-04-20) is much more information-dense and legible for tour managers browsing a 40-date run:

- **Coloured vertical bar on the left edge of the row** (~3px wide, full-height), not a dot. Bar colour encodes day type.
- **Day-name + date** header at the top of each row in uppercase tracked text ("TUESDAY, MAY 19").
- **Event-type label** below the header, small and muted ("Show Day", "Travel Day", "Rehearsal", "Festival").
- **Primary label** (venue name if present, else city) in medium-weight white.
- **Secondary label** (city + region) in muted text below.
- Active row: subtle darker background, no border/ring change. Vertical bar colour stays the same.

This PR ports the Daysheets pattern onto Lowpass using the data we already have. No schema changes.

---

## Current data shape (no changes)

```ts
export type TourRoutingListRow = {
  id: string;
  date: string;          // ISO, e.g. "2026-05-24"
  day_type: string;      // comma-separated, e.g. "show" | "show, press" | "travel" | "festival" | "off"
  city: string;
  venue_name: string | null;
};
```

`day_type` is free-form comma-separated. The current `circleColor` helper already handles `show`, `festival`, `travel` and a muted fallback. Extend it, don't replace it.

---

## Goal

Rewrite the row visual in `TourRoutingList.tsx` to match the Daysheets pattern described above, preserving:

- The existing data shape (no DB or API changes).
- The existing `mode` prop (already hardcoded to `"advance"` by A0.2 — leave as-is).
- The existing `collapsed` mode (72px sidebar).
- The existing `isRoutingLoading` skeleton behaviour.
- The existing `/tours/<id>/advance/<routingId>` link target.

---

## Files to modify

### `src/components/layout/TourRoutingList.tsx`

Apply the following changes. The whole file is small — rewrite in place, keep the exports, change only the rendering and helpers.

#### 1. Extend `circleColor` → rename to `dayTypeAccent` and broaden

Add support for `off` and `rehearsal`. Keep existing tokens.

```ts
function dayTypeAccent(dayType: string): string {
  const segs = dayTypeSegments(dayType);
  if (segs.some((s) => s === 'show')) return '#FF4500';        // Lowpass brand orange
  if (segs.some((s) => s === 'festival')) return '#9B59B6';    // purple
  if (segs.some((s) => s === 'travel')) return '#3498DB';      // blue
  if (segs.some((s) => s === 'rehearsal')) return '#F59E0B';   // amber
  if (segs.some((s) => s === 'off')) return '#64748B';         // slate-500
  return 'var(--lp-sidebar-text-muted)';                       // unknown → muted
}
```

#### 2. Add `dayTypeLabel` helper

Humanises the first meaningful day-type segment into a short label.

```ts
function dayTypeLabel(dayType: string): string {
  const segs = dayTypeSegments(dayType);
  // Priority order so "show, press" reads as "Show Day".
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
```

#### 3. Extend the date formatter → two outputs

Replace the current `formatRowDate` with two helpers:

```ts
function formatDateHeading(dateStr: string): string {
  // "TUESDAY, MAY 19"
  return new Date(`${dateStr}T12:00:00`)
    .toLocaleDateString('en-GB', { weekday: 'long', month: 'long', day: 'numeric' })
    .toUpperCase();
}

function formatDateCollapsed(dateStr: string): string {
  // "19\nMAY" — two lines, used only in 72px collapsed mode
  const d = new Date(`${dateStr}T12:00:00`);
  const day = d.toLocaleDateString('en-GB', { day: 'numeric' });
  const month = d.toLocaleDateString('en-GB', { month: 'short' }).toUpperCase();
  return `${day}\n${month}`;
}
```

#### 4. Rewrite the row JSX

Each `<li>` becomes:

```tsx
<li key={row.id}>
  <Link
    href={href}
    title={collapsed ? title : undefined}
    className={cn(
      'group relative flex items-stretch gap-3 overflow-hidden rounded-md transition-colors',
      !collapsed && 'pr-3',
      collapsed && 'justify-center px-0 py-0',
      'hover:bg-[var(--lp-sidebar-hover-bg)]',
      isActive && 'bg-[var(--lp-sidebar-active-bg)]'
    )}
  >
    {/* Vertical accent bar — always visible, full row height */}
    <span
      className="w-[3px] shrink-0 self-stretch rounded-l-md"
      style={{ backgroundColor: accent }}
      aria-hidden
    />

    {!collapsed ? (
      <span className="min-w-0 flex-1 py-2">
        <span
          className="block text-[10px] font-semibold uppercase tracking-wider leading-tight"
          style={{ color: 'var(--lp-sidebar-text-muted)' }}
        >
          {formatDateHeading(row.date)}
        </span>
        {label && (
          <span
            className="mt-1 block text-[11px] leading-tight"
            style={{ color: accent }}
          >
            {label}
          </span>
        )}
        <span
          className="mt-1 block truncate text-[13px] font-semibold leading-tight"
          style={{ color: 'var(--lp-sidebar-text-heading)' }}
        >
          {primary}
        </span>
        {secondary && (
          <span
            className="mt-0.5 block truncate text-[11px] leading-tight"
            style={{ color: 'var(--lp-sidebar-text-muted)' }}
          >
            {secondary}
          </span>
        )}
      </span>
    ) : (
      <span
        className="flex flex-col items-center justify-center py-2 text-center leading-tight"
        style={{ color: 'var(--lp-sidebar-text-heading)' }}
      >
        {formatDateCollapsed(row.date).split('\n').map((line, i) => (
          <span key={i} className={i === 0 ? 'text-[13px] font-semibold' : 'text-[9px] font-medium uppercase tracking-wider text-[var(--lp-sidebar-text-muted)]'}>
            {line}
          </span>
        ))}
      </span>
    )}
  </Link>
</li>
```

Where, inside the `routing.map`, you compute:

```ts
const accent = dayTypeAccent(row.day_type);
const label = dayTypeLabel(row.day_type);
const primary = row.venue_name?.trim() || row.city?.trim() || '—';
const secondary = row.venue_name?.trim() ? row.city?.trim() : undefined;
const title = `${primary} — ${formatDateHeading(row.date)}`;
```

#### 5. Update the skeleton

Match the new taller row. Approximately:

```tsx
<li key={`sk-${i}`} className="flex items-stretch gap-3 overflow-hidden rounded-md pr-3">
  <span className="w-[3px] shrink-0 self-stretch rounded-l-md bg-[var(--lp-sidebar-hover-bg)]" aria-hidden />
  <div className="min-w-0 flex-1 space-y-1.5 py-2">
    <Skeleton className="h-2.5 w-24" />
    <Skeleton className="h-2.5 w-14" />
    <Skeleton className="h-3.5 w-32 max-w-full" />
    <Skeleton className="h-2.5 w-20" />
  </div>
</li>
```

Collapsed-mode skeleton stays as a single thin bar — use the same vertical-bar style, 28px tall.

#### 6. Spacing

Outer `<ul>`: change `space-y-0.5` → `space-y-1` (rows are taller now, needs slightly more breathing room). No other spacing changes.

---

## Hard rules — do not break

1. Do **not** add any new dependencies. `cn` from `@/lib/utils`, `Skeleton` from `@/components/ui/Skeleton`, `Link` from `next/link`, `usePathname` from `next/navigation` — all already imported.
2. Do **not** change the data shape or prop signature of `TourRoutingList`. Consumers (`Sidebar.tsx`) must not need edits.
3. Do **not** touch `Sidebar.tsx`, `AppTopBar*.tsx`, routing/API files, or any page files.
4. Do **not** introduce CSS keyframe animations or `framer-motion`. Transitions are Tailwind `transition-colors` only.
5. Do **not** remove the accent bar in collapsed mode — it's the only colour cue users get when the sidebar is 72px wide. The bar becomes the primary affordance.
6. Do **not** change the hover/active colour tokens (`--lp-sidebar-hover-bg` / `--lp-sidebar-active-bg`). Visual differentiation comes from the bar + typography, not from tinting the active row differently.
7. Do **not** truncate the date heading or the event-type label — they're short enough to fit at 260px sidebar. Only `primary` and `secondary` get `truncate`.
8. Do **not** apply the new pattern elsewhere in the app yet (AdvanceOverview rows, etc.). This PR is scoped to the sidebar list only.

---

## Acceptance criteria (run through each before finishing)

- [ ] `npx tsc --noEmit --skipLibCheck` is clean.
- [ ] `npm run lint` on `TourRoutingList.tsx` is clean.
- [ ] `npm run dev` boots with no console errors.
- [ ] With a tour selected that has mixed `day_type` values (show, travel, festival, off), each sidebar row shows:
  - A 3px full-height coloured bar on the left.
  - "TUESDAY, MAY 19" style heading in small uppercase tracked text.
  - A day-type label ("Show Day", "Travel Day", "Festival", etc.) in the matching accent colour.
  - Primary = venue name when present, else city.
  - Secondary = city when both venue and city are present; absent otherwise.
- [ ] Accent colour mapping is correct: `show` → orange, `festival` → purple, `travel` → blue, `rehearsal` → amber, `off` → slate.
- [ ] Comma-separated day types resolve by the priority order defined in `dayTypeLabel` — `"show, press"` renders as "Show Day" in orange.
- [ ] The currently-active routing day (match by URL `/tours/<tourId>/advance/<routingId>`) has a subtly darker background and no other visual change. The accent bar colour stays the same.
- [ ] Hovering any non-active row tints the background using `--lp-sidebar-hover-bg`.
- [ ] Collapse the sidebar to 72px: each row now shows just a thin vertical bar + centered "19 / MAY" two-line stack. Bar colour still matches day type. Tooltip on hover matches `primary — TUESDAY, MAY 19`.
- [ ] Expand back to 260px: full row layout returns. No layout jump / flicker.
- [ ] Loading skeleton renders four stacked shimmer bars per row plus the inert vertical bar. No layout shift when real data arrives.
- [ ] Rows with an unknown or missing `day_type` render with the muted fallback colour and no event-type label line (the `label` falsy branch).
- [ ] `git grep -n 'circleColor' src/` → **no hits**. (Renamed to `dayTypeAccent`.)

---

## Verification commands (run after implementation)

```bash
npx tsc --noEmit --skipLibCheck
npm run lint
git grep -n 'circleColor' src/
git grep -n 'dayTypeAccent\|dayTypeLabel\|formatDateHeading' src/
```

Paste output into the PR description. First grep should return empty; second grep should show all three helpers defined in `TourRoutingList.tsx`.

---

## Out of scope for this PR (explicitly defer)

- Applying the same row pattern to `AdvanceOverview.tsx` table rows → **future PR** once we settle the overview page redesign.
- Party-chip system (ADMIN / BAND / CREW / PRINCIPAL coloured badges) → **Phase C** (personnel/groups).
- Right-rail meta sidebar on the advance detail page (Day Type & Locations / Lodging / Notes / Contacts stack) → **separate PR**, likely part of Phase A1 or Phase F.
- Context-menu (right-click + `⋯`) on sidebar rows → **separate PR** once we ship a generic `ContextMenu` primitive. Don't add it here.
- Adding a country / region field to routing rows → schema change, out of scope.
- Collapsed-mode accent-bar icon variants (e.g. plane icon for travel days) → optional polish, defer.

---

## Output format expected from Cursor

1. Diff of `src/components/layout/TourRoutingList.tsx` (only file touched).
2. Output of `npx tsc --noEmit --skipLibCheck` (should be empty = success).
3. Output of the two `git grep` verification commands.
4. A short note on any deviations from the prompt with justification.

Then stop. Do not auto-continue into A0.4 or any other PR.
