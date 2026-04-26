# UX08b — ⌘K Command Palette ("Spotlight for Lowpass")

> Cross-entity fuzzy search popover. Indexes shows, people, flights, rooms, gear, expenses, files, deal memos, budget lines. The user has called this out as a "love love love" first-class feature. **End of Phase B (component library).**

---

## 0. Context for Cursor

Read first:

1. `docs/cursor-prompts/UX_OVERHAUL_ROADMAP.md` — section 3.1 (TopBar ⌘K trigger spec).
2. UX02 (TopBar already wires the trigger via `onCommandPaletteOpen` callback).
3. UX03 (SlideOver) — palette opens slide-overs on Enter via UX08's routing layer.
4. UX08 (EntityChip + EntityRouting) — palette uses `useEntityRouting().open(...)` to open results.

---

## 1. Why this prompt exists

The user wants a Spotlight-style cross-entity search. Type a word → match across every entity in their workspace → Enter opens that entity's slide-over. This is what makes Lowpass feel like a unified database rather than a collection of pages.

---

## 2. Hard rules

1. **No new dependencies.** Use a tiny custom fuzzy matcher (provided below) rather than `fuse.js`.
2. **Keyboard-only navigation** must be the primary mode. Mouse hover works but isn't required.
3. **Type-grouped results** (Shows / People / Flights / etc) so users can scan quickly.
4. **Lazy-loaded popover** — palette code lives in its own chunk; only loads when ⌘K fires.
5. **Server-side search via `descriptor.search(query)` from UX08's registry** for entity types. For non-entity types (expenses, files, deal memos, budget lines), add new search functions.
6. **Debounced** at 150ms. Don't hammer Supabase.
7. **Workspace-scoped.** Use existing `public.get_my_workspace_id()` RLS helper. Cross-workspace data must never leak.
8. **Empty query** shows recent items (last opened entities) — store in localStorage scoped to user id.
9. **Lint + typecheck clean.**

---

## 3. Step 1 — Fuzzy matcher

File: `src/lib/search/fuzzy.ts`

A small fuzzy matcher (no library):

```ts
type FuzzyMatch = {
  score: number; // higher = better
  ranges: Array<[number, number]>; // for highlighting
};

export function fuzzyMatch(haystack: string, query: string): FuzzyMatch | null {
  // Score scheme:
  // - exact substring match: +1000
  // - consecutive char match: +50 each
  // - starts-with-word match: +30 each
  // - sequential char match: +10 each
  // - case-match bonus: +5
  // - position bonus: -position (early matches preferred)
  // Returns null if no match
}
```

Test in unit-style: `fuzzy("Britannia Row Audio", "brit row")` should beat `fuzzy("Audio Britannia Row", "brit row")` (preserves order).

---

## 4. Step 2 — Search providers

File: `src/lib/search/providers.ts`

```ts
type SearchResult = {
  id: string;
  kind: 'show' | 'person' | 'flight' | 'room' | 'gear' | 'expense' | 'file' | 'deal-memo' | 'budget-line';
  label: string;
  secondary?: string;
  metadata?: Record<string, string>;
  score: number;
  // What to do on Enter
  action: { type: 'open-entity'; kind: EntityKind; id: string } | { type: 'navigate'; href: string };
};

export async function searchAll(query: string, opts?: { limit?: number }): Promise<SearchResult[]>;
```

Implementation:
- For each entity kind in UX08's registry, call `descriptor.search(query, { limit: 10 })` in parallel
- For non-entity kinds (expense, file, deal-memo, budget-line), add per-kind search functions that hit Supabase directly
- Combine results, score with `fuzzyMatch` against `label + secondary`, sort descending, slice to `limit ?? 50`
- Group by `kind` in the consuming UI

Each search function must scope by `workspace_id` using `public.get_my_workspace_id()`. RLS handles enforcement; this is belt-and-braces.

For empty query: return recent items from localStorage (key: `lp:cmdk:recent:${userId}`, max 10).

---

## 5. Step 3 — `<CommandPalette>` component

File: `src/components/command-palette/CommandPalette.tsx` (`'use client'`)

### 5.1 API

```ts
type CommandPaletteProps = {
  open: boolean;
  onClose: () => void;
};
```

Mount once at app root (next to `<EntityRoutingProvider>`). State (open/closed) lives at root and is controlled via the same global event the TopBar's ⌘K trigger fires.

### 5.2 Layout

Centred popover, max-width 640px, max-height 480px. Background `--lp-surface`, border `--lp-border`, radius `--lp-radius-xl`, shadow `--lp-shadow-xl`. z-index `--lp-z-command-palette` (1500 — highest).

```
┌──────────────────────────────────────────┐
│ 🔍 Search shows, people, flights…       ✕│  ← search input, --lp-text-md, autofocus
├──────────────────────────────────────────┤
│ SHOWS                                    │  ← group header, --lp-text-2xs caps
│  Show 1 — Glasgow Arena · 12 Aug 26     │  ← active row: --lp-orange-subtle bg, orange border
│  Show 2 — Manchester Arena · 13 Aug 26  │
│ PEOPLE                                   │
│  John Doe — FOH Engineer                 │
│ FLIGHTS                                  │
│  BA 1234 — LHR → JFK · 12 Aug 26        │
├──────────────────────────────────────────┤
│ ↑↓ navigate   ↵ open   esc close         │  ← footer hint
└──────────────────────────────────────────┘
```

Backdrop: `rgba(0,0,0,0.4)` light, `rgba(0,0,0,0.6)` dark, fade-in over `--lp-duration-slow`. Backdrop click closes palette.

### 5.3 Behaviour

- Open via prop. On open: input autofocuses; if recent items exist and query is empty, render them grouped under "RECENT".
- Type → debounced search → results render
- ↑/↓ moves selected row; visual highlight follows
- Enter → if `action.type === 'open-entity'`, call `useEntityRouting().open(...)`; if `'navigate'`, `router.push(href)`. Then close palette and add the chosen item to recent.
- Escape closes
- Cmd/Ctrl+K toggles (close if open)
- Mouse: hover sets selected row; click selects+activates

### 5.4 Result rendering

Each result row renders:
- Icon for `kind` (lucide)
- Highlighted label (bold the chars matched by fuzzy)
- Secondary text (right-aligned, smaller)
- Metadata pill (e.g. tour name for shows)

Use `--lp-text-base` for labels, `--lp-text-sm` for secondary.

### 5.5 Recent items

Keep last 10 opened entities in localStorage. Update on Enter. Render in "RECENT" group when query is empty. Show a "Clear recent" button at the bottom of the recent group.

### 5.6 Empty state

If query is non-empty and no results: "No matches for «query»" centred, `--lp-text-tertiary`.

### 5.7 Loading state

While results are pending: show a 3-line skeleton with shimmer.

---

## 6. Step 4 — Global mount + trigger wiring

In the existing app-root client component (probably `src/app/(app)/layout.tsx` or similar) where `<EntityRoutingProvider>` was mounted in UX08, add:

```tsx
const [paletteOpen, setPaletteOpen] = useState(false);
// Listen for global Cmd/Ctrl+K
useEffect(() => {
  const handler = (e: KeyboardEvent) => {
    if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
      e.preventDefault();
      setPaletteOpen(o => !o);
    }
  };
  window.addEventListener('keydown', handler);
  return () => window.removeEventListener('keydown', handler);
}, []);
```

Then expose `setPaletteOpen` via a context (or pass through props) so the TopBar's `onCommandPaletteOpen` callback wires into the same state.

---

## 7. Step 5 — Playground

Add to `/admin/shell-playground`: a "Open Command Palette" button. Also test the global ⌘K shortcut from anywhere on the page.

---

## 8. Verification

1. Lint + typecheck clean
2. ⌘K from any page opens the palette
3. Searching "brit" against demo Budget data finds "Britannia Row Audio Rental"
4. Group headers render
5. Up/Down/Enter/Escape work
6. Enter opens an entity → SlideOver appears
7. Recent items persist across reloads
8. Empty query shows recent
9. No matches state works
10. Backdrop click closes
11. Dark mode parity
12. Loading skeleton renders for slow networks

---

## 9. Acceptance criteria

- [ ] `src/lib/search/fuzzy.ts` with the matcher
- [ ] `src/lib/search/providers.ts` with `searchAll`
- [ ] `<CommandPalette>` component with full keyboard nav
- [ ] Mounted globally; ⌘K toggles it
- [ ] TopBar trigger wired to the same state
- [ ] Recent items stored in localStorage
- [ ] All 9 result kinds queryable
- [ ] No new dependencies
- [ ] Lint + typecheck clean

---

## 10. Out of scope

- ❌ Don't add scoped search (e.g. "show:" prefix). Defer.
- ❌ Don't add command-style entries ("Create new tour"). Defer to v2.
- ❌ Don't add fuzzy matching across multiple fields per entity (just label + secondary).
- ❌ Don't index file contents (just file names + tags).

---

## 11. Commit plan

```
UX08b: ⌘K Command Palette ("Spotlight for Lowpass")

- Custom fuzzy matcher in src/lib/search/fuzzy.ts
- searchAll across 9 result kinds
- <CommandPalette> with keyboard nav, recent items, group headers
- Globally mounted, ⌘K toggles
- Wired to TopBar trigger
```
