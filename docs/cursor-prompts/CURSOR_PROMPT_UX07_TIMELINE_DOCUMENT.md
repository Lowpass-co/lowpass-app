# UX07 — `<TimelineDashboard>` + `<DocumentCanvas>`

> The remaining two archetype primitives. **TimelineDashboard** powers the Dashboard archetype (today-anchored rolling timeline). **DocumentCanvas** powers the Document/Builder archetype (advance, deal memos, pack editor, stage plot).

---

## 0. Context for Cursor

Read first:

1. `docs/cursor-prompts/UX_OVERHAUL_ROADMAP.md` — sections 3.4 (page archetypes), 5 (component library).
2. `docs/design-tokens.md` (UX01).
3. UX02–UX06 (must be merged).
4. `docs/daysheets-walkthrough.md` (if present) — reference for the timeline feel the user wants.

---

## 1. Why this prompt exists

After UX05 (lists) and UX06 (spreadsheets), two archetypes still lack a primitive:
- **Dashboard** needs a `<TimelineDashboard>` that anchors on today and lets the user scroll forward through the rolling tour calendar.
- **Document/Builder** needs a `<DocumentCanvas>` that hosts long-form content (advance, contracts) and builder canvases (pack editor, stage plot).

These are paired in one prompt because both are smaller than DataTable / SpreadsheetGrid and follow similar shell patterns.

---

## 2. Hard rules

1. No new dependencies.
2. Both components are headless-ish: take content/data, render with the Lowpass aesthetic. No business logic baked in.
3. TimelineDashboard scrolls horizontally; rows scroll vertically inside.
4. DocumentCanvas supports two modes: `prose` (long-form reading + editing) and `builder` (canvas with absolutely-positioned children). Section anchors work in both.
5. Use design tokens. Hex+alpha rule.
6. Lint + typecheck clean.

---

## 3. `<TimelineDashboard>`

File: `src/components/timeline/TimelineDashboard.tsx`

### 3.1 Layout

```
┌──────────────────────────────────────────────────────────────────┐
│ [< Today]  [Aug 2026]                              [filter chips]│  ← --lp-space-4 padding, sticky top
├──────────────────────────────────────────────────────────────────┤
│  Mon    Tue    Wed    Thu    Fri    Sat    Sun    Mon    …       │  ← day header strip, sticky top
│  10     11     12     13     14     15     16     17     …       │
├──────────────────────────────────────────────────────────────────┤
│ ┌─Show─┐ ┌─Off─┐ ┌─Show──────────────┐  ┌─Travel─┐ ┌─Show───┐    │  ← Row 1: shows
│ │      │ │     │ │   Multi-day card  │  │        │ │        │    │
│ └──────┘ └─────┘ └───────────────────┘  └────────┘ └────────┘    │
│ ┌Hotel─┐ …                                                        │  ← Row 2: hotels
│ ┌Flight┐ …                                                        │  ← Row 3: flights
│ ┌Tasks─┐ …                                                        │  ← Row 4: tasks/reminders
└──────────────────────────────────────────────────────────────────┘
```

- Today is anchored at the **left edge** by default
- Horizontal scroll forward through future days; backward to view past
- "Today" jump button when today is scrolled out of view
- Vertical rows are configurable per dashboard (Shows, Hotels, Flights, Tasks, etc)
- Each card spans the days it covers (multi-day shows, multi-night hotel stays)

### 3.2 API

```ts
type TimelineRow<T> = {
  id: string;
  label: string; // e.g. "Shows", "Hotels"
  icon?: LucideIcon;
  items: TimelineItem<T>[];
  collapsed?: boolean;
  height?: number; // px; default --lp-row-comfortable
};

type TimelineItem<T> = {
  id: string;
  startDate: string; // ISO date
  endDate: string;   // ISO date (inclusive)
  data: T;
  render: (data: T) => ReactNode;
  color?: string; // accent strip
  onClick?: () => void;
};

type TimelineDashboardProps<T> = {
  rows: TimelineRow<T>[];
  startDate: string; // earliest date to render
  endDate: string;   // latest date
  todayDate?: string; // override today (testing)
  dayWidth?: number;  // px per day; default 80
  onDayClick?: (date: string) => void;
};
```

### 3.3 Behaviour

- On mount: scroll today to left edge with a small left padding
- Cards: clickable (calls `onClick` if defined), span their date range, truncate label with ellipsis, show full label on hover
- Day-of-week header: sticky top of the timeline area. Today's column is highlighted (background `--lp-orange-subtle`, label "TODAY")
- Weekend columns: subtle background (`--lp-bg-secondary`)
- Month label updates as user scrolls (shows the leftmost visible month)
- Keyboard: `Home` jumps to today; `←/→` move 1 day; `Shift+←/→` move 1 week
- Mobile: switches to a vertical list (no horizontal scroll). Each day is a card stack.

### 3.4 Performance

For tour spans up to 365 days × 6 rows × 100 items, render must be smooth. Use windowing on horizontal axis (only render visible day columns + buffer).

---

## 4. `<DocumentCanvas>`

File: `src/components/document/DocumentCanvas.tsx`

### 4.1 Two modes

**`prose` mode** — long-form rich content (advance pages, deal memo viewer, contract viewer):
- Section anchors on left rail (provided by LeftRail `docSections` variant); content scrolls vertically; clicking a section in rail scrolls to the section's anchor with smooth-scroll
- Max content width: 720px (readable line length), centred within the available space
- Supports headings, paragraphs, lists, blockquotes, callouts, attachment cards, images
- Optional inline-editable mode (consumer toggles): same layout, just makes paragraphs `contentEditable`

**`builder` mode** — drag-drop canvases (pack editor, stage plot):
- Children are absolutely positioned within a fixed-aspect canvas (e.g. 16:9 for stage plot)
- Optional grid overlay
- Zoom controls (50% / 100% / 150% / fit)
- Pan via Space+drag

### 4.2 API

```ts
type DocumentCanvasProps =
  | DocumentCanvasProseProps
  | DocumentCanvasBuilderProps;

type DocumentCanvasProseProps = {
  mode: 'prose';
  sections: Array<{ id: string; label: string }>; // for anchor scrolling
  activeSection?: string;
  onSectionChange?: (id: string) => void;
  editable?: boolean;
  children: ReactNode; // section components rendered with id={section.id}
};

type DocumentCanvasBuilderProps = {
  mode: 'builder';
  aspectRatio?: number; // default 16/9
  zoom?: number; // controlled
  onZoomChange?: (zoom: number) => void;
  showGrid?: boolean;
  children: ReactNode; // absolutely positioned children
};
```

### 4.3 Visual contract

**Prose mode**:
- Background `--lp-bg`, content area centred with `var(--lp-space-12)` top padding
- Headings: `--lp-text-3xl` (h1), `--lp-text-2xl` (h2), `--lp-text-xl` (h3), `--lp-text-lg` (h4)
- Body: `--lp-text-base`, `--lp-leading-relaxed`
- Section anchors: invisible markers; corresponding section in LeftRail highlights based on scroll position (use IntersectionObserver)

**Builder mode**:
- Background `--lp-bg-secondary` for the surrounding area, `--lp-bg` for the canvas itself
- Canvas has `--lp-border` 1px border, `--lp-radius-lg` corners, centred within available space
- Optional grid: 8×8 or 16×16 dots in `--lp-border-light`
- Zoom UI: bottom-right toolbar with `−` / `100%` / `+` / `Fit` buttons

### 4.4 Behaviour

**Prose**:
- Smooth-scroll to section on `activeSection` change
- IntersectionObserver fires `onSectionChange` as user scrolls
- If `editable`, contentEditable on prose blocks (consumer manages save)

**Builder**:
- Zoom: scroll-wheel + Cmd/Ctrl scrolls zooms canvas; pinch-to-zoom on trackpad
- Pan: hold Space + drag, or middle-mouse drag
- Children render in document order; consumer is responsible for z-stacking

---

## 5. Step 1 — Build TimelineDashboard

Implement `src/components/timeline/TimelineDashboard.tsx` + sub-components (`TimelineHeader`, `TimelineRow`, `TimelineItem`).

---

## 6. Step 2 — Build DocumentCanvas

Implement `src/components/document/DocumentCanvas.tsx` + sub-components for each mode.

---

## 7. Step 3 — Playground

Add to `/admin/shell-playground`:

**TimelineDashboard demo**:
- 90-day tour, 4 rows: Shows / Hotels / Flights / Tasks
- ~30 mock items across rows
- Today is day 30 of tour; mount-scroll-to-today should land at left edge

**DocumentCanvas prose demo**:
- 6 sections: Overview / Travel / Hotel / Venue / Show / Settlement
- ~3 paragraphs of lorem per section
- LeftRail `docSections` synced with active section

**DocumentCanvas builder demo**:
- 16:9 canvas
- 5 draggable boxes (just for visual demo; no actual drag logic in this prompt — UX17 may add for stage plot)
- Zoom/grid controls work

---

## 8. Verification

1. Lint + typecheck clean
2. Timeline scrolls horizontally; today jump button works
3. Multi-day cards span correctly
4. Prose canvas: section scroll spy works; smooth-scroll to anchor
5. Builder canvas: zoom + grid controls work
6. Mobile: timeline switches to vertical list
7. Dark mode parity

---

## 9. Acceptance criteria

- [ ] `src/components/timeline/TimelineDashboard.tsx` + sub-components
- [ ] `src/components/document/DocumentCanvas.tsx` + sub-components for both modes
- [ ] Playground demos for each
- [ ] Mobile fallback for timeline
- [ ] No new dependencies
- [ ] Lint + typecheck clean

---

## 10. Out of scope

- ❌ Migrating Tour Overview to TimelineDashboard — UX16
- ❌ Migrating Advance to DocumentCanvas — UX17
- ❌ Migrating Pack editor to DocumentCanvas builder mode — that's part of UX17 / R-series
- ❌ Stage plot drag-drop logic — defer to its own prompt (R17 / future)
- ❌ Real data wiring — playground only

---

## 11. Commit plan

```
UX07: TimelineDashboard + DocumentCanvas

- Timeline horizontal-scroll dashboard with today anchor
- DocumentCanvas prose + builder modes
- Playground demos
```
