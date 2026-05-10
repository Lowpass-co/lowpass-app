# CC Sprint 5 — Daysheets-style ArtistTourSwitcher

Feature work, not bug fixes. Replaces the current static `[Artist link] › [Tour span]` display in `ProductHeader` with a single combined hierarchical dropdown switcher. Includes a tour creation slide-over because no existing flow exists.

**Branch off `main`** (which has v2 + Sprint 3 + Sprint 4 merged). Three commits + verify (1 → 2 → 3 → V). ~6-8 hr CC time.

---

## 0. Required reading

- `CLAUDE.md` — particularly the design tokens / `<SlideOver>` primitive / Visual language rules
- `docs/handover/CC_STATE_2026_05_03.md`
- `docs/components/SLIDE_OVER_CONTRACT.md` — the SlideOver primitive contract (you'll use this in Phase 3)
- `src/components/shell/SlideOver.tsx` — the SlideOver primitive itself
- `src/components/shell-v2/ProductHeader.tsx` — server component, lines 84-140 currently render the static artist + tour chips that this sprint replaces
- `src/contexts/ArtistTourContext.tsx` — provides `selectedArtistId`, `selectedTourId`, `artists`, `tours`, `setSelectedArtistId`, `setSelectedTourId`. The setters already write to URL + localStorage; reuse them.
- `src/types/index.ts` — `Artist` and `Tour` type shapes (read these so you know what fields exist on tours, especially `start_date` / `end_date` / `currency` for grouping by year)
- `src/components/_legacy/sidebar/` — DO NOT IMPORT FROM HERE. Reference only — there may be a useful pattern for the artist-list rendering style.

---

## 1. Hard rules

1. **No new dependencies.** Use only what's in `package.json` already.
2. **No `any`, no `// @ts-ignore`.**
3. **Lint baseline 75 errors / 120 warnings.** Hold the line.
4. **Typecheck zero.**
5. **Build via `next build --webpack` only.**
6. **Three commits in numeric order: 1 → 2 → 3.** One per phase.
7. **Verify before claiming.** Quote post-fix file:line in the report.
8. **Visual fidelity is a hard requirement.** Adam said "make it pretty, follow all the UX we have built together" — that means the §1.5 Visual Language Manifesto applies in full: dense Bloomberg-terminal aesthetic, three-elevation surface system (base / panel / hover), borders define structure, mono numerics where appropriate, uppercase tracked-wider micro-labels (`var(--lp-label-caps)` style), orange-as-functional-accent only, all colour/size/spacing/shadow values via `var(--lp-*)` tokens. **No raw hex except orange hex+alpha for transparent variants.** No inline magic numbers — everything tokenised.
9. **Smooth animations are a hard requirement.** Adam said "all animation should be smooth. no jumpy janky shit." Specifically: opening/closing the dropdown, transitioning between artist list and tour list states, the slide-over open/close. CSS transitions are fine (no Framer Motion etc — not in deps). `prefers-reduced-motion` should be respected.
10. **No protocol skips.** If the design has decisions you're unsure about, post diagnosis to chat and wait for sign-off before implementing.
11. **Stay in scope.** Six items in §"Out of scope" at the bottom. Don't touch them.

---

## 2. Phase 1 — Build `<ArtistTourSwitcher>` component (~3 hr)

### 2.1 What to build

A client component at `src/components/shell-v2/ArtistTourSwitcher.tsx`. It is the trigger button + the dropdown panel + the dropdown's internal state machine.

**Trigger button** (always visible in ProductHeader's left slot):
- Shows current selection: `Artist Name · Tour Name` (with a single bullet separator, NOT a chevron between them — chevron is for hierarchy navigation, this is just the current state).
- Empty states:
  - No artist selected: `"Pick an artist…"` in muted text.
  - Artist but no tour: `"Artist Name · Pick a tour…"`.
- Trailing `<ChevronDown />` (12-14px) to indicate it's a dropdown trigger, rotating to `<ChevronUp />` when open.
- Token-styled: button background uses `var(--lp-panel)` at rest, `var(--lp-panel-hover)` on hover. Border `var(--lp-border)`. Text `var(--lp-text)` for the names, `var(--lp-text-secondary)` for the bullet separator.
- Click toggles dropdown.
- Esc closes dropdown.
- Click-outside closes dropdown (use a `useRef` + document-level click handler, NOT a backdrop element — the dropdown sits over content, doesn't dim it).

**Dropdown panel**:
- Anchored to the trigger button (left-aligned, top-positioned just below the button — `position: absolute` works; if scroll containers cause issues, escalate to `Floating UI`-style dynamic positioning, but `package.json` has no floating-ui dep so prefer the simpler approach if it works).
- Width: ~320px. Token-spec: `min-width: 320px; max-width: 360px`.
- Max-height: `min(420px, 60vh)`. Internal scroll on overflow.
- Three-elevation surface: panel sits on `var(--lp-panel)` (one elevation above base). Border `var(--lp-border-strong)`. Shadow `var(--lp-shadow-popover)` (or whatever the existing popover shadow token is — verify in `globals.css`; if no popover-shadow token exists, add one).
- Internal padding: `var(--lp-space-2)` around the content area, `var(--lp-space-3)` per row.

**Dropdown internal states** (state machine):
- `closed` — dropdown not visible.
- `artists` — dropdown shows artist list (default open state, OR if user re-clicks the trigger on a page with no current artist).
- `tours` — dropdown shows tour list grouped by year, for the artist clicked from the artists view OR the currently-selected artist when the dropdown opens.

**Initial state on open:**
- If `selectedArtistId` is non-null → open into `tours` state (showing tours for that artist). User has already picked an artist; they're most likely switching tours.
- If `selectedArtistId` is null → open into `artists` state.

**State transitions:**
- `closed → artists` or `closed → tours` (depending on initial-state rule above). Animation: dropdown panel fades in + translates 4px down (200ms `ease-out`).
- `artists → tours` (user clicks an artist in the list). Animation: cross-fade between content; previous list slides 8px to the left while fading out, new list slides in 8px from the right while fading in. 250ms total. Use CSS `transition` on `opacity` + `transform`. Don't use display:none toggles between states — wrap both in absolute-positioned containers and toggle pointer-events + opacity for the inactive one.
- `tours → artists` (user clicks the back chevron in the tour list header). Reverse animation.
- `closed` (Esc / click-outside): panel fades out + translates 4px down. 150ms `ease-in`.
- All animations respect `@media (prefers-reduced-motion: reduce)` — under that media query, animations resolve to opacity-only with `<= 50ms` duration.

**Artists state UI:**
- Header row: uppercase tracked-wider micro-label "ARTISTS" left-aligned, count right-aligned (e.g. "5"). 11px font-size. `var(--lp-text-tertiary)`.
- List of artist rows. Each row:
  - 36px height
  - Avatar (24px circle) on left — use existing `pickArtistImageUrl()` helper from `src/app/(app)/advance/[tourId]/[routingId]/page.tsx` for the URL extraction; render `<img>` if URL exists, otherwise an initials chip with brand orange background.
  - Artist name (14px, `var(--lp-text)`)
  - Trailing right-arrow chevron (12px) on the row
- Hover: row background → `var(--lp-panel-hover)`.
- Selected (= matches `selectedArtistId`): left 2px accent border in `var(--lp-orange)`, slightly tinted background.
- Click: triggers `setSelectedArtistId(artist.id)` from context, which clears tour selection per the existing context behaviour. Then transitions dropdown to `tours` state.

**Tours state UI:**
- Header row: back-chevron icon button (left, 16px) + selected artist name (truncated, 14px, `var(--lp-text)`) + close-chevron-up icon button (right, collapses dropdown).
- Sub-header: uppercase tracked-wider "TOURS" label + count.
- Tours list grouped by year. Group headers in micro-label style (`var(--lp-text-tertiary)`, 11px tracked-wider, e.g. "2026"). Tours within each year sorted by `start_date` descending (most recent first). If a tour has no `start_date`, group it under "UNDATED" at the bottom.
- Tour row:
  - 44px height
  - Tour name (14px, `var(--lp-text)`)
  - Date range underneath in `var(--lp-text-secondary)` 12px, format "Jan – Mar 2026" or "12 Apr 2026" if single-day, or just the year if no end date.
  - No avatar / no leading icon.
- Hover, selected, click semantics same as artist rows. Click on a tour calls `setSelectedTourId(tour.id)` from context, then closes the dropdown.
- **At the BOTTOM of the tour list (after the last tour, NOT inside any year group)**: a "+ Create new tour" CTA. Distinct visual treatment — slightly indented, leading `<Plus>` icon (14px) in `var(--lp-orange)`, label "Create new tour" in `var(--lp-orange)` 14px font-medium. Click triggers a callback prop `onCreateTour` (Phase 2 will wire this; Phase 1 just defines the prop signature).

### 2.2 Component API

```ts
interface ArtistTourSwitcherProps {
  /** Pre-fetched artist list — server-side initial data so the dropdown
   *  is instant on first open. The component refetches lazily on
   *  open if the list goes stale (older than 60s). */
  initialArtists: Array<{
    id: string;
    name: string;
    branding: unknown;  // for image extraction
  }>;
  /** Optional pre-fetched tours for the currently-selected artist.
   *  When null, the component fetches via /api/tours?artist_id=X
   *  on first open of the tours state. */
  initialTours?: Array<{
    id: string;
    name: string;
    start_date: string | null;
    end_date: string | null;
  }> | null;
  /** Called when the user clicks "+ Create new tour". Phase 2 wires
   *  this to open the new-tour slide-over. */
  onCreateTour: () => void;
}
```

The selected artist/tour state is read from `useArtistTourContext()` — don't re-pass via props. Selection mutations also go through the context setters.

### 2.3 Acceptance

- [ ] Switcher trigger renders in left slot; shows current artist · tour or appropriate empty state.
- [ ] Click trigger → dropdown opens with the right initial state (artists or tours per §2.1 rule).
- [ ] Animations smooth: open/close 200/150ms, state-transition 250ms, all respect `prefers-reduced-motion`.
- [ ] Artist click → tour state transition. Tour click → dropdown closes + selection updates.
- [ ] "+ Create new tour" CTA appears at the bottom of the tour list. Click triggers `onCreateTour` callback (Phase 1: just verify the callback fires; Phase 2 wires the actual slide-over).
- [ ] Esc key + click-outside both close the dropdown.
- [ ] Tokens-only styling. Lint + typecheck clean. **Run `grep -r "0x[0-9a-f]" src/components/shell-v2/ArtistTourSwitcher.tsx` AFTER writing — if it finds raw hex outside orange transparency variants, remove them.**
- [ ] No raw inline `px` / `rem` magic numbers — every spacing / size value via tokens.

### 2.4 Quote in report

- Component file path + total line count (`wc -l`).
- The state machine setup (the `useState` declarations + the open/close/transition handlers, ~15-30 lines).
- The two list-render blocks (artists state and tours state, just the JSX skeleton, not the full styles).
- The animation CSS classes / styles (the transition strings and the opacity/transform values).
- The `prefers-reduced-motion` media query block (verbatim).

### 2.5 Commit

`feat(shell-v2): ArtistTourSwitcher dropdown component (Phase 1 of Sprint 5)`

---

## 3. Phase 2 — Wire `<ArtistTourSwitcher>` into `<ProductHeader>` (~1 hr)

### 3.1 What to do

Replace the static artist + tour chips in `src/components/shell-v2/ProductHeader.tsx` lines 84-140 with a `<ArtistTourSwitcher>` mount.

**Tricky bit**: `ProductHeader` is an `async function` (server component). `ArtistTourSwitcher` is a client component. So:
- Server: pre-fetch `initialArtists` and (if `artistId` is present) `initialTours` for that artist.
- Pass them to `<ArtistTourSwitcher>` as initial data.

**Server-side queries to add:**

```ts
// Inside ProductHeader server component, alongside the existing fetches:
const artistsListRes = await supabase
  .from('artists')
  .select('id, name, branding')
  .order('name', { ascending: true });

const initialToursRes = artistId
  ? await supabase
      .from('tours')
      .select('id, name, start_date, end_date')
      .eq('artist_id', artistId)
      .order('start_date', { ascending: false })
  : { data: null };
```

Both queries are RLS-scoped — the existing helpers handle workspace filtering. If the user has no artists, `initialArtists` is `[]` and the switcher should still render (showing "No artists yet — create one in the workspace settings" or similar empty-state CTA — but check whether such a CTA exists; if not, just show "No artists" muted text and don't add scope).

**The trigger button replaces the entire `<div className="flex min-w-0 items-center gap-1.5">...</div>` block currently at lines 92-140.** The product name (lines 142-155) and the right-side search/avatar block (lines 157-onwards) stay unchanged.

### 3.2 onCreateTour wiring

For Phase 2, the `onCreateTour` callback is provided by a NEW client wrapper component (not directly inside ProductHeader, since ProductHeader is server). Create:

`src/components/shell-v2/ArtistTourSwitcherClientWrapper.tsx` — client component that:
- Renders `<ArtistTourSwitcher>` with the server-passed props.
- Owns local state `[isCreateTourOpen, setIsCreateTourOpen]`.
- Passes `onCreateTour={() => setIsCreateTourOpen(true)}` to the switcher.
- Renders `<TourCreateSlideOver open={isCreateTourOpen} onClose={() => setIsCreateTourOpen(false)} ... />` (component built in Phase 3).

Phase 2 stub: the slide-over import is a placeholder until Phase 3 lands. Use a temporary inline component that just renders a `<div>` saying "Tour creation coming in Phase 3" — Phase 3 swaps this for the real slide-over.

### 3.3 Acceptance

- [ ] `ProductHeader` server-fetches artists + (optional) tours and passes to client wrapper.
- [ ] The legacy chips (lines 92-140) are completely removed; the switcher trigger replaces them.
- [ ] The product name + search + avatar on the right are unchanged.
- [ ] On every page that uses `<ProductShell>` (= every Operations / Budget / Advance / Home page), the switcher renders correctly.
- [ ] Selecting a tour via the switcher updates `selectedTourId` in context, which writes to URL via existing `syncUrlParams` (existing Sprint-4 path-aware logic verifies it stays correct).
- [ ] Clicking "+ Create new tour" in the switcher opens the temporary placeholder div (real slide-over in Phase 3).
- [ ] Lint + typecheck clean.

### 3.4 Quote in report

- The post-fix `<ProductHeader>` left slot — replacing the old chips block, including the new server queries.
- The new `ArtistTourSwitcherClientWrapper.tsx` first 30 lines.

### 3.5 Commit

`feat(shell-v2): wire ArtistTourSwitcher into ProductHeader (Phase 2 of Sprint 5)`

---

## 4. Phase 3 — Tour creation API + slide-over (~2-3 hr)

### 4.1 What to build

A new tour creation flow — there isn't one in the codebase today.

**API route:**

`src/app/api/tours/route.ts` — handle POST.

```ts
// Server route handler. Auth-gated, workspace-scoped, RLS handles
// the workspace_id assertion automatically once the user is set.
import { NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase-server';
import { z } from 'zod';  // CHECK package.json — if zod not present, hand-roll validation. Don't add a dep.

// Per Hard Rule 1, no new dependencies. If zod isn't in package.json,
// inline a small validation function instead.
const TourCreateSchema = {
  validate: (input: unknown): { ok: true; value: { name: string; artist_id: string; start_date: string | null; end_date: string | null; currency: string } } | { ok: false; error: string } => {
    if (!input || typeof input !== 'object') return { ok: false, error: 'invalid body' };
    const i = input as Record<string, unknown>;
    if (typeof i.name !== 'string' || !i.name.trim()) return { ok: false, error: 'name required' };
    if (typeof i.artist_id !== 'string' || !/^[0-9a-f-]{36}$/.test(i.artist_id)) return { ok: false, error: 'artist_id required' };
    const start = typeof i.start_date === 'string' && i.start_date ? i.start_date : null;
    const end = typeof i.end_date === 'string' && i.end_date ? i.end_date : null;
    const currency = typeof i.currency === 'string' && i.currency.trim() ? i.currency.trim().toUpperCase() : 'USD';
    return { ok: true, value: { name: i.name.trim(), artist_id: i.artist_id, start_date: start, end_date: end, currency } };
  },
};

export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  const parsed = TourCreateSchema.validate(body);
  if (!parsed.ok) {
    return NextResponse.json({ error: parsed.error }, { status: 400 });
  }

  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: 'unauthenticated' }, { status: 401 });
  }

  // Insert with the user's workspace; RLS verifies the artist belongs
  // to that workspace via existing policies. workspace_id pulled via
  // public.get_my_workspace_id() in the policy.
  const { data, error } = await supabase
    .from('tours')
    .insert({
      name: parsed.value.name,
      artist_id: parsed.value.artist_id,
      start_date: parsed.value.start_date,
      end_date: parsed.value.end_date,
      currency: parsed.value.currency,
    })
    .select('id, name, start_date, end_date, currency, artist_id')
    .single();

  if (error || !data) {
    return NextResponse.json({ error: error?.message ?? 'create failed' }, { status: 500 });
  }

  return NextResponse.json({ tour: data }, { status: 201 });
}
```

**Investigation step before writing the API**: read `src/types/index.ts` for the `Tour` type. Check what fields are NOT NULL in the database (look at any tours migration in `database/migrations/`). If there are required fields beyond name/artist_id/dates/currency, surface them — don't guess. Post a diagnosis to chat and wait for Adam's call before building the form.

**Slide-over:**

`src/components/shell-v2/TourCreateSlideOver.tsx` — uses the `<SlideOver>` primitive from `src/components/shell/SlideOver.tsx` (read its contract first — `docs/components/SLIDE_OVER_CONTRACT.md`).

Form fields:
- Name (text, required)
- Start date (date input, optional)
- End date (date input, optional)
- Currency (select, default "USD"; options USD / GBP / EUR / AUD / CAD / JPY — use the existing currency token list if there is one elsewhere in the codebase; if not, hardcode this minimal set)
- Hidden: artist_id (passed via prop from the wrapper, defaults to currently-selected artist)

Required: name only. Everything else is optional.

Footer actions: Cancel (closes), Create Tour (orange primary).

Loading state during submit. Error state surfaces the server message in a tinted banner above the form.

On success:
- Close the slide-over.
- Refetch the tour list for the current artist (or update the local `initialTours` prop optimistically by appending the new tour).
- Set the new tour as `selectedTourId` via context — this auto-navigates user to it where applicable.
- Surface a toast "Tour created" (use the existing `useToast` hook from `@/components/ui/Toast` — confirm the import path before writing).

### 4.2 Acceptance

- [ ] POST `/api/tours` with valid body inserts a row, returns 201 + tour data.
- [ ] POST with no name → 400.
- [ ] POST with no artist_id → 400.
- [ ] POST without auth → 401.
- [ ] POST with artist_id pointing to another workspace's artist → RLS blocks insert, returns 500 with the RLS error.
- [ ] Slide-over opens from the switcher's "+ Create new tour" CTA.
- [ ] Form validates: empty name disables Create Tour button.
- [ ] Submit → loading state → success → slide-over closes → new tour appears in switcher tour list → new tour is selected.
- [ ] Submit error → error banner with server message, form stays open, user can retry.
- [ ] Lint + typecheck clean.

### 4.3 Quote in report

- API route file (full content, ≤80 lines).
- Slide-over file: imports + form state setup + submit handler.
- The wired `onCreateTour` callback in `ArtistTourSwitcherClientWrapper.tsx` post-Phase-3.

### 4.4 Commit

`feat(api,shell-v2): tour creation slide-over and POST /api/tours route (Phase 3 of Sprint 5)`

---

## V. Verify (~30 min)

CC: walk these on the Vercel preview.

1. ProductHeader's left slot now shows the switcher trigger button, not the old chips. PASS / FAIL.
2. Click trigger → dropdown opens with smooth animation. PASS / FAIL.
3. With an artist already selected → opens into tours state. With no artist → opens into artists state. PASS / FAIL.
4. Click an artist → smooth transition to tours state. PASS / FAIL.
5. Click back-chevron → smooth transition back to artists state. PASS / FAIL.
6. Tours list grouped by year, descending. Most recent tour at top of most recent year. PASS / FAIL.
7. Click a tour → dropdown closes, selection updates, URL updates with `?tour_id=`. PASS / FAIL.
8. Click "+ Create new tour" → slide-over opens. PASS / FAIL.
9. Submit valid tour creation form → tour appears in list, gets selected, slide-over closes, toast shown. PASS / FAIL.
10. Submit empty name → Create Tour button disabled. PASS / FAIL.
11. Esc closes the dropdown. Click-outside closes the dropdown. PASS / FAIL.
12. `prefers-reduced-motion: reduce` set in DevTools → animations resolve to short fades. PASS / FAIL.
13. Lint baseline 75/120. Typecheck zero. `next build --webpack` succeeds.

---

## When done — report exactly this format

```
Sprint 5 done. Branch: feat/sprint-5-switcher
Vercel preview: <URL>

Commits in order:
- 1: <hash> feat(shell-v2): ArtistTourSwitcher dropdown component
- 2: <hash> feat(shell-v2): wire ArtistTourSwitcher into ProductHeader
- 3: <hash> feat(api,shell-v2): tour creation slide-over and POST /api/tours

Quoted post-fix lines:
[Phase 1] ArtistTourSwitcher.tsx <wc -l> lines
          state machine block
          render skeletons (artists state, tours state)
          animation CSS
          prefers-reduced-motion block
[Phase 2] ProductHeader.tsx left-slot replacement + new server queries
          ArtistTourSwitcherClientWrapper.tsx top 30 lines
[Phase 3] /api/tours/route.ts (full)
          TourCreateSlideOver.tsx imports + form setup + submit
          onCreateTour wiring in the wrapper

V.1-13 results:
1. <pass/fail with one-line note>
... (all 13)

Lint <X errors / Y warnings>. Typecheck zero. Build OK.
```

---

## Out of scope this sprint (DO NOT touch)

1. **Mobile/responsive behaviour of the switcher.** Desktop only this sprint. Mobile is Phase 18+ (separate `m/` route group).
2. **Cmd+K palette integration.** Adam said no search this sprint. The palette already exists at `src/components/command-palette/`.
3. **Artist creation.** No "Create new artist" CTA in the artists state — Adam didn't spec it. If you want one, mention it in the report but don't build it.
4. **Switching the avatar / search position.** Right side of ProductHeader stays untouched.
5. **Animation library / motion library.** No Framer Motion or react-spring etc. CSS transitions only.
6. **Refactoring `ArtistTourContext` further.** The five baseline lint errors flagged in Sprint 4 are still there — leave them. Separate cleanup sprint.

If you find another bug or improvement opportunity while doing this sprint — note it in the report's "out of scope, deferred" section. Don't fix it.
