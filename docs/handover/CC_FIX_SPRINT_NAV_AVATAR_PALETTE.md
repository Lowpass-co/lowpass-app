# Fix Sprint — Daily-Use Nav + Avatar + ⌘K Palette

> Single session. Three steps in order. Three separate commits. Don't bundle.
>
> Read `CLAUDE.md` and `database/migrations/README.md` before starting.

---

## Why this prompt exists

The UX overhaul recovery + delivery (Phases 2–9) restored the foundation but left three regressions that hit daily use:

1. **TopBar nav is too thin.** When the legacy `Sidebar.tsx` was retired in `b9317e3`, the TopBar's `DEFAULT_NAV` only inherited Library + Templates — Dashboard / Personnel / Calendar / Equipment / etc. were dropped without replacement. Operators lost one-click access to their primary daily destinations.
2. **Account avatar shows a broken-image icon (`[?]`)** instead of the user's photo or initials.
3. **⌘K does nothing.** UX08b Command Palette was never built. The trigger button toasts "not built yet" or no-ops.

This sprint fixes all three. After it lands, the app feels like a working tour-management surface again, not just a re-architected one.

---

## Hard rules (every step)

1. **No new dependencies.** No npm installs.
2. **All visual values via `var(--lp-…)` tokens.** Hex+alpha for orange tints (`#FF45001a` or `color-mix`), never JS string concatenation of CSS vars.
3. **Use the `<SlideOver>` primitive** for any slide-over.
4. **No `any`. No `// @ts-ignore`. No commented-out code.**
5. **`npm run lint` and `npm run typecheck` must exit clean** vs the 75/121 baseline before each commit.
6. **Don't run `npm run build`** during dev — Turbopack hangs on Drive.
7. **Three commits, in order: A → B → C.** Each pushable independently.
8. **Workspace-scoped queries via existing RLS helpers** (`public.get_my_workspace_id()`, `public.is_workspace_admin()`).

---

## Step A — TopBar nav expansion (~30 min)

### Target structure

Top bar (left → right):
1. Lowpass logo → `/dashboard` (existing)
2. Tours dropdown (existing — workspace tour switcher)
3. **Dashboard** (`/dashboard`)
4. **Personnel** (`/personnel`)
5. **Calendar** (`/calendar`)
6. **Equipment** (`/equipment`)
7. **Library** dropdown
8. ⌘K trigger (existing — fixed in Step C)
9. Account button (existing — fixed in Step B)

**Library dropdown contents** (vertical list when open):
- Rider Packs (`/rider-packs`)
- Deal Memos (`/library/deal-memos`)
- Gear (`/gear`)
- Templates (`/templates`)
- Performance (`/performance`)
- Venues (`/venues`)

### Responsive collapse

- **Below 1024px:** Calendar + Equipment move INTO the Library dropdown (with a small divider above the existing items)
- **Below 640px:** existing mobile collapse — only Logo / Tours-icon / Library / ⌘K / Account visible

### Implementation

Edit `src/components/shell/TopBar.tsx`:

1. Replace `DEFAULT_NAV` with two arrays:

```ts
const WORKSPACE_NAV: Array<{ label: string; href: string; activeMatch: (p: string) => boolean }> = [
  { label: 'Dashboard', href: '/dashboard', activeMatch: (p) => p === '/dashboard' || p === '/' },
  { label: 'Personnel', href: '/personnel', activeMatch: (p) => p.startsWith('/personnel') },
  { label: 'Calendar', href: '/calendar', activeMatch: (p) => p.startsWith('/calendar') },
  { label: 'Equipment', href: '/equipment', activeMatch: (p) => p.startsWith('/equipment') },
];

const LIBRARY_MENU_ITEMS: Array<{ label: string; href: string; activeMatch: (p: string) => boolean }> = [
  { label: 'Rider Packs', href: '/rider-packs', activeMatch: (p) => p.startsWith('/rider-packs') },
  { label: 'Deal Memos', href: '/library/deal-memos', activeMatch: (p) => p.startsWith('/library/deal-memos') },
  { label: 'Gear', href: '/gear', activeMatch: (p) => p.startsWith('/gear') },
  { label: 'Templates', href: '/templates', activeMatch: (p) => p.startsWith('/templates') },
  { label: 'Performance', href: '/performance', activeMatch: (p) => p.startsWith('/performance') },
  { label: 'Venues', href: '/venues', activeMatch: (p) => p.startsWith('/venues') },
];
```

2. Render `WORKSPACE_NAV` as direct nav links (same pattern as the current Library/Templates links).

3. Replace the existing Library link with a dropdown button. Pattern parallels the Tours dropdown — button toggles a popover with the menu items. Use `--lp-z-dropdown` for the popover layer.

4. Library button's active state: highlights when `usePathname()` matches any of the dropdown items' `activeMatch` (or any of the responsive-collapsed Calendar/Equipment items).

5. Responsive collapse via `useViewportWidth` hook (already in the file). Below 1024px, prepend `{ ...WORKSPACE_NAV[2], group: 'workspace' }, { ...WORKSPACE_NAV[3], group: 'workspace' }` to the Library menu items with a divider, and hide them from the top bar.

6. **Don't change** the Tours dropdown, ⌘K button, or Account chip — those stay as-is for this step.

### Acceptance

- [ ] Dashboard / Personnel / Calendar / Equipment visible at desktop widths (>1024px)
- [ ] Library dropdown opens, shows 6 items, click navigates correctly
- [ ] Active state lights up the right top-level item on `/dashboard`, `/personnel`, `/calendar`, `/equipment`, `/rider-packs`, `/library/deal-memos`, `/gear`, `/templates`, `/performance`, `/venues`
- [ ] Resize to 800px wide → Calendar + Equipment now appear in the Library dropdown with a divider
- [ ] Resize to 500px wide → existing mobile collapse pattern
- [ ] Keyboard: Tab moves through items, Enter navigates, Escape closes Library dropdown

### Commit

```
fix(shell-topbar): restore daily-use workspace navigation

When the legacy Sidebar was retired (b9317e3), TopBar's DEFAULT_NAV
only inherited Library + Templates — Dashboard / Personnel / Calendar /
Equipment were dropped without replacement. Operators lost one-click
access to their primary daily destinations.

- WORKSPACE_NAV adds Dashboard / Personnel / Calendar / Equipment as
  top-level nav links
- Library becomes a dropdown (Rider Packs / Deal Memos / Gear /
  Templates / Performance / Venues) with active-state highlighting on
  any subpath match
- Responsive collapse: <1024px folds Calendar + Equipment into the
  Library dropdown with a divider; <640px keeps the existing mobile
  pattern (icon-only Tours, Library + ⌘K + Account)

Made-with: Claude Code (fix sprint A/B/C)
```

---

## Step B — Avatar render fix (~15 min)

The TopBar's account chip currently shows `[?]` (a broken-image icon) when `getShellData()` returns an `avatarUrl` that doesn't load — or never wires the avatar at all. Fix by rendering an `<Image>` with an `onError` fallback to an initials chip.

### Investigate first

```bash
grep -nE "avatarUrl|user\.avatar|<User|profile.*avatar|<Image.*avatar" src/components/shell/TopBar.tsx
```

Note what's there. Likely scenarios:
- `<User />` lucide icon as a placeholder; avatar never wired
- `<img src={user.avatarUrl} />` without error handling
- `next/image` with a misconfigured src

### Target component

Add this helper inside `TopBar.tsx` (before the `TopBar` function) or break it out to `src/components/shell/AccountAvatar.tsx`:

```tsx
'use client';
import Image from 'next/image';
import { useState } from 'react';

function deriveInitials(nameOrEmail: string): string {
  const trimmed = nameOrEmail?.trim();
  if (!trimmed) return '?';
  const tokens = trimmed.split(/\s+/).filter(Boolean);
  if (tokens.length === 0) return '?';
  if (tokens.length === 1) return tokens[0].slice(0, 2).toUpperCase();
  return (tokens[0][0] + tokens[tokens.length - 1][0]).toUpperCase();
}

export function AccountAvatar({
  user,
  size = 28,
}: {
  user: { name: string; email: string; avatarUrl?: string | null };
  size?: number;
}) {
  const [imageFailed, setImageFailed] = useState(false);
  const showImage = !!user.avatarUrl && !imageFailed;

  if (showImage) {
    return (
      <Image
        src={user.avatarUrl as string}
        alt=""
        width={size}
        height={size}
        className="rounded-full object-cover"
        style={{ width: size, height: size }}
        onError={() => setImageFailed(true)}
      />
    );
  }

  return (
    <div
      className="flex items-center justify-center rounded-full text-[11px] font-semibold"
      style={{
        width: size,
        height: size,
        background: 'var(--color-lp-orange)',
        color: 'var(--lp-text-inverse)',
      }}
      aria-label={user.name || user.email || 'Account'}
    >
      {deriveInitials(user.name || user.email)}
    </div>
  );
}
```

### Wire it in

Inside the existing account button rendering in `TopBar.tsx`, replace whatever's currently producing the broken `[?]` icon (probably a `<User />` from lucide, an `<img>`, or an `<Image>` without onError) with `<AccountAvatar user={user} size={28} />`.

If `next/image` complains about the avatar URL's domain, add the Supabase storage hostname to `next.config.ts`'s `images.remotePatterns` (don't add new dependencies — this is a config tweak):

```ts
images: {
  remotePatterns: [
    { protocol: 'https', hostname: '**.supabase.co' },
  ],
},
```

### Acceptance

- [ ] If `user.avatarUrl` is set and reachable → photo renders
- [ ] If `user.avatarUrl` is null OR the image fails → orange initials chip with the user's initials (e.g. "AR" for "Adam Rowley", "MR" if name is "Mr Big' Rowley")
- [ ] No broken-image `[?]` icon ever visible
- [ ] Initials are uppercase, white-on-orange, readable
- [ ] Keyboard focus ring still works on the parent account button
- [ ] Image cached / not re-fetching on every render

### Commit

```
fix(shell-topbar): account chip renders avatar with initials fallback

Account chip was showing a broken-image icon when avatarUrl was unset
or the URL didn't resolve. AccountAvatar component now:

- Renders next/image when user.avatarUrl is non-null and valid
- Falls back to a branded initials chip on image error or missing URL
- Initials derived from name (first + last word) or email (first 2 chars)
- Orange background, inverse-text foreground; matches the rest of the
  brand chip patterns

next.config.ts adds Supabase storage hostnames to images.remotePatterns
so the avatar URLs are accepted by next/image's optimization layer.

Made-with: Claude Code (fix sprint A/B/C)
```

---

## Step C — Build UX08b ⌘K Command Palette (~3–4 hrs)

Now the substantive work. UX08b was specced but never executed. Build it for real.

### Authoritative source

Read `docs/cursor-prompts/CURSOR_PROMPT_UX08B_COMMAND_PALETTE.md` end-to-end. That prompt is the contract; implement against it.

### Updated context (since the prompt was drafted)

Entity registry now has these live descriptors (all with real `search()` implementations):
- `person`, `flight`, `room`, `gear`, `show`, `deal-memo`

Non-entity searchable kinds the prompt §4.1 specifies — query directly:
- `tour` → `public.tours` (search name, status)
- `budget-line` → query whatever the budget line items table is on this codebase. **Inspect first** with `git ls-tree origin/main database/migrations/ | grep budget` and read the relevant migration. Likely `public.budget_line_items` with `label` / `description` columns; verify before writing the query.
- `bug-report` → `public.bug_reports` (admin only — gate via `public.is_workspace_admin()`)
- `rider-pack` → `public.rider_packs`
- `rental-job` → `public.rental_jobs`

For each non-entity query, **inspect the actual schema before writing the SELECT**:

```bash
for t in tours budget_line_items bug_reports rider_packs rental_jobs; do
  echo "=== $t ==="
  git grep -A 3 "CREATE TABLE.*public\.$t\b\|CREATE TABLE.*${t}\b" database/migrations/*.sql | head -20
done
```

Use the columns that actually exist. Don't invent column names from the prompt's example.

Deferred kinds (per the prompt §4.2): `expense` / `file`. The original prompt deferred `deal-memo` too but that's now live via UX13b — flip from deferred to active in your `SearchKind` typed union.

### Build sequence

1. **Fuzzy matcher** — `src/lib/search/fuzzy.ts`. Implement per prompt §3:
   - Returns `{ score, ranges }` where ranges are `[start, end]` index pairs for highlight rendering
   - Scoring: substring +1000, consecutive char +50, starts-with-word +30, sequential +10, case-match bonus +5, position penalty -position
   - Returns `null` if no match
   - Test self-consistency: `fuzzy("Britannia Row Audio", "brit row")` should beat `fuzzy("Audio Britannia Row", "brit row")` because order matters

2. **Search providers** — `src/lib/search/providers.ts`. Per prompt §4:
   - `SearchKind` type union covering all 11 wired kinds + 2 deferred (file, expense)
   - `SearchResult` shape: `{ id, kind, label, secondary?, score, action: { type: 'open-entity', kind, id } | { type: 'navigate', href } }`
   - `searchAll(query, opts?)` parallels descriptor.search() across entity kinds AND issues per-non-entity Supabase queries; combines, scores, sorts descending, slices to `limit ?? 50`
   - Empty-query path: returns recent items from `localStorage` keyed `lp:cmdk:recent:<userId>`, limit 10
   - All non-entity queries scope by `workspace_id` via `public.get_my_workspace_id()` (RLS will enforce too — belt & braces)

3. **`<CommandPalette>`** — `src/components/command-palette/CommandPalette.tsx` (`'use client'`). Per prompt §5:
   - Centred popover, max 640×480, background `--lp-surface`, border `--lp-border`, radius `--lp-radius-xl`, shadow `--lp-shadow-xl`, z-index `--lp-z-command-palette` (1500)
   - Backdrop: `rgba(0,0,0,0.4)` light, `rgba(0,0,0,0.6)` dark, fade-in `--lp-duration-slow`. Backdrop click closes.
   - Search input autofocuses on open. Debounced search at 150ms (`useDebouncedValue` pattern; check if a hook already exists at `src/hooks/`).
   - Results grouped by `kind`. Group headers in `--lp-text-2xs` caps with `--lp-tracking-caps`.
   - Active row: `color-mix(in srgb, var(--lp-orange) 7%, transparent)` background + 2px `--lp-orange` left border.
   - Result row content: kind icon (lucide) + highlighted label (bold the chars matched by fuzzy ranges) + right-aligned secondary text.
   - Footer: `↑↓ navigate   ↵ open   esc close`
   - Keyboard: ↑/↓ moves selection; Enter activates; Escape closes; ⌘K toggles; mouse hover sets selection.

4. **Global mount + ⌘K shortcut** — per prompt §6:
   - Add open/close state to `AppShell.tsx` (already a client component): `const [paletteOpen, setPaletteOpen] = useState(false)`.
   - Mount `<CommandPalette open={paletteOpen} onClose={() => setPaletteOpen(false)} />` next to `<EntityRoutingProvider>` (inside it is fine — palette can use entity routing).
   - Add a global keydown listener: `(e.metaKey || e.ctrlKey) && e.key === 'k'` → `e.preventDefault(); setPaletteOpen(o => !o);`
   - Expose `setPaletteOpen` so the existing TopBar `onCommandPaletteOpen` callback can flip the same state. Two paths: (a) lift state higher and pass down to ShellTopBarClient, or (b) use a small context. (b) is cleaner — create `CommandPaletteContext` similar to `EntityRoutingContext` and have both AppShell mount + TopBar trigger consume the same context.

5. **Recent items** — last 10 opened entities in `localStorage` (`lp:cmdk:recent:<userId>`). Update on Enter. Render under "RECENT" group when query is empty. Provide a "Clear recent" link at the bottom of the recent group.

### Acceptance (per prompt §9)

- [ ] ⌘K from any page opens the palette (try `/dashboard`, `/tours/[id]`, `/library/deal-memos`)
- [ ] Type "brit" against your real data → finds rows containing "Britannia" / "Britain" via fuzzy match
- [ ] Group headers render for the 11 wired kinds
- [ ] ↑/↓ moves selection (visual highlight follows)
- [ ] Enter on an entity result opens its slide-over via `useEntityRouting().open(...)`
- [ ] Enter on a tour/bug-report/rider-pack/rental-job/budget-line navigates to the right URL
- [ ] Escape closes
- [ ] Recent items persist across reload
- [ ] Empty query shows recent (or "Type to search…" if no recent)
- [ ] No-matches state shows "No matches for «query»"
- [ ] Backdrop click closes
- [ ] Loading skeleton during slow networks
- [ ] Dark mode parity
- [ ] No new dependencies added

### Commit

```
feat(command-palette): UX08b ⌘K Spotlight for Lowpass

Cross-entity fuzzy search popover. Type-grouped results across:
shows · people · flights · rooms · gear · deal memos · tours ·
budget lines · rider packs · rental jobs · bug reports.

Keyboard-only navigation. Enter opens entity slide-over via
useEntityRouting() for canonical kinds; navigates to URL for
non-entity kinds. Recent-items persistence in localStorage
(last 10, per-user).

- src/lib/search/fuzzy.ts — custom matcher (no lib deps)
- src/lib/search/providers.ts — searchAll() across 11 wired result kinds
- src/components/command-palette/CommandPalette.tsx — popover + keyboard
- src/components/command-palette/CommandPaletteContext.tsx — open-state
  context shared by AppShell mount and TopBar trigger
- AppShell mounts globally; Cmd/Ctrl+K toggles
- TopBar onCommandPaletteOpen wired to the same context

Per-kind data sources verified against current schema:
- entity-registry kinds (UX08): person/flight/room/gear/show/deal-memo
- direct supabase: tours/bug_reports/rider_packs/rental_jobs/<budget table>

Made-with: Claude Code (fix sprint A/B/C)
```

---

## Verification before declaring all three done

After the C commit pushes and Vercel deploys, run a manual smoke:

1. Hard-refresh `/dashboard` → new top bar (Dashboard / Personnel / Calendar / Equipment + Library dropdown), avatar shows photo or orange-AR chip
2. Click each top-bar destination → navigates, no 404s
3. Resize browser to ~900px → Calendar + Equipment now in Library dropdown
4. Resize to ~500px → mobile collapse intact
5. Press `Cmd+K` (or `Ctrl+K`) → palette opens, autofocused
6. Type a few characters → results appear, grouped by kind, fuzzy-matching highlighted
7. ↑/↓ moves selection, Enter on a result → opens slide-over (entity) or navigates (non-entity)
8. Close, reopen → recent items appear under "RECENT"
9. ⌘K on a different page → still opens correctly
10. Lint + typecheck still clean (75/121 baseline)

If any of those fail, fix before declaring done. Report back the three commit SHAs.

---

## When you're done

Tell Adam in chat:

```
Fix sprint A/B/C complete. Commits: <sha-A>, <sha-B>, <sha-C>.
- Top bar now has Dashboard / Personnel / Calendar / Equipment + Library dropdown
- Avatar renders photo with initials chip fallback
- ⌘K opens Spotlight palette (X kinds wired, recent items, keyboard nav)
- Lint + typecheck clean (75/121 baseline)
- Vercel deploy: <link>
```

If anything is partial, say so — better to ship A+B fully and a partial C than rush all three.
