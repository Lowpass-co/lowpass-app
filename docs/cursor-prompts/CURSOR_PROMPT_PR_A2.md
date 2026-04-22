# Cursor Prompt — PR A2 (Routing page polish + right-rail Notes wiring)

Paste this whole file into Cursor. Execute top-to-bottom. Each major section has a **Step 0 verify-first** gate. If a section's verification shows the work is already complete, report that and move to the next section — do NOT re-apply.

**Scope recap**

This PR is three things in one pass:

1. §1 — Small cleanup of `AppTopBarModePill.tsx` left over from the overnight mega-PR.
2. §2 — Wire the existing `useIsMobile` hook into `RoutingPageShell` so the right-rail is JS-gated (foundation for Phase C mobile pivots).
3. §3 — Make the right-rail "Notes" section save/load real data. `routing.notes` column already exists; we just need a PATCH endpoint and a debounced optimistic editor.

Nothing else. Explicitly out of scope below in §5.

---

## Standing design references (unchanged)

Three references, each with a well-defined job:

- **Daysheets** (`daysheets.com`) — visual cues, layout patterns, what information lives where. Dark-mode hero, party chips (ADMIN=green / BAND=teal / CREW=yellow / PRINCIPAL=purple), day types with custom colours, right-rail meta panels, dense tabular grids.
- **Xero** — budget/money UX. (a) transaction list with inline-editable rows + running totals. (b) budget/forecast grid with rows×columns editable cells.
- **Notion** — context menus. Right-click **and** visible ⋯ kebab on hover. Grouped items, destructive items styled red, keyboard navigable, viewport-clamped.

Canonical file: `DESIGN_REFERENCES.md` at repo root. Do not re-interpret — these are locked.

---

## Hard rules (locked — do NOT deviate)

- **No framer-motion.** CSS `transform` + `transition-transform` only.
- **Preserve flexible advance_form_configs.** The JSONB sections system is Lowpass's moat. Never replace it with a fixed schema.
- **Workspace scoping.** Every new Supabase query must filter by `workspace_id` via the existing `get_my_workspace_id()` pattern or via the `profiles.workspace_id` lookup already in `src/app/api/tours/[id]/routing/route.ts`.
- **Income formula = Reading B.** Locked. Do not touch it in this PR. See `CURSOR_PROMPT_OVERNIGHT_MEGA.md §5 Step 4` for the definition.
- **If anything is ambiguous, STOP. Report. Do NOT invent behaviour.**

---

# §1 — Cleanup: `AppTopBarModePill.tsx`

## Step 0 — Verify

Run the three greps below. You will run §1 only if any of the three have an unexpected state.

```bash
# A) aria-pressed on role=tab (invalid per ARIA spec — should be absent)
grep -n "aria-pressed" src/components/layout/AppTopBarModePill.tsx || echo "OK: no aria-pressed"

# B) legacy key should be the LITERAL string 'lp-sidebar-mode' (not a join)
grep -n "lp-sidebar-mode\|'lp', 'sidebar', 'mode'\]" src/components/layout/AppTopBarModePill.tsx || echo "OK: no dynamic join"

# C) stale header comment still claims the rename is deferred
grep -n "rename deferred to A0.4" src/components/layout/AppTopBarModePill.tsx || echo "OK: comment up to date"
```

Expected **after** §1 lands:

- A: `OK: no aria-pressed`
- B: one hit showing `const LEGACY_MODE_KEY = 'lp-sidebar-mode';`
- C: `OK: comment up to date`

If all three already print "OK" or match the expected landed state, **skip §1** and report "§1 already landed".

## Step 1 — Apply fixes (all in `src/components/layout/AppTopBarModePill.tsx`)

### 1a. Replace dynamic legacy key with a literal

Find:

```ts
const LEGACY_MODE_KEY = ['lp', 'sidebar', 'mode'].join('-');
```

Replace with:

```ts
// Legacy key from pre-A0.4. Kept as a literal so future localStorage audits
// can find every key by plain grep.
const LEGACY_MODE_KEY = 'lp-sidebar-mode';
```

### 1b. Fix the stale header comment

Find the block comment at the top of the file (around lines 3–12). Replace the line:

```
   Persists active pill to 'lp-workspace-mode' localStorage
```

and the line:

```
   (shared key with Sidebar — rename deferred to A0.4).
```

with:

```
   Persists active pill to 'lp-workspace-mode' localStorage
   (legacy 'lp-sidebar-mode' key is migrated on mount — see LEGACY_MODE_KEY).
```

### 1c. Remove invalid `aria-pressed` on the two role=tab buttons

`aria-pressed` is only valid for `role="button"` (or the implicit button role). The mode pill buttons use `role="tab"`, so `aria-selected` is the correct attribute (already present). Delete the two `aria-pressed` lines:

```diff
  role="tab"
  aria-selected={mode === 'advance'}
- aria-pressed={mode === 'advance'}
  onClick={() => go('advance')}
```

```diff
  role="tab"
  aria-selected={mode === 'budget'}
- aria-pressed={mode === 'budget'}
  onClick={() => go('budget')}
```

## §1 acceptance

- [ ] `grep -n 'aria-pressed' src/components/layout/AppTopBarModePill.tsx` returns no matches.
- [ ] `grep -n 'LEGACY_MODE_KEY' src/components/layout/AppTopBarModePill.tsx` shows the literal `'lp-sidebar-mode'`.
- [ ] `grep -n 'rename deferred' src/components/layout/AppTopBarModePill.tsx` returns no matches.
- [ ] `npm run lint src/components/layout/AppTopBarModePill.tsx` has zero warnings for `jsx-a11y/role-supports-aria-props` on this file (other pre-existing warnings elsewhere are unaffected).

---

# §2 — Wire `useIsMobile` into `RoutingPageShell`

## Why

`useIsMobile` was added in the overnight PR but isn't consumed anywhere. We want to keep it because Phase C (personnel filters + four mobile pivots: Day / Calendar / Routing / Map) will rely on JS-level viewport detection. This section replaces a single CSS breakpoint (`xl:block` on the right rail `<aside>`) with the hook, so the primitive is in active use.

The swap is **loosening** the condition deliberately: the right rail currently shows only at `xl+` (1280px+, effectively desktop only). After this PR it shows at `!isMobile` (tablet and up, ≥768px). On tablet it stacks below the income panel because the grid fallback `grid-cols-1` is already the default. Acceptable trade-off: tablet users get more context; no regressions on phone or desktop.

## Step 0 — Verify

```bash
# A) useIsMobile should NOT yet be imported in RoutingPageShell
grep -n "useIsMobile" src/app/\(app\)/tours/\[id\]/routing/RoutingPageShell.tsx \
  || echo "OK: not wired yet"

# B) the aside should currently use 'hidden ... xl:block'
grep -n "hidden space-y-4 xl:block" src/app/\(app\)/tours/\[id\]/routing/RoutingPageShell.tsx \
  || echo "Already migrated"
```

Expected **before** §2 lands: A prints `OK: not wired yet`; B prints one match.
Expected **after**: A prints one import line; B prints `Already migrated`.

If both already match the landed state, **skip §2** and report "§2 already landed".

## Step 1 — Import the hook

In `src/app/(app)/tours/[id]/routing/RoutingPageShell.tsx`, add the import beside the other hook imports:

```ts
import { useIsMobile } from '@/hooks/useIsMobile';
```

## Step 2 — Consume it in the component

At the top of the `RoutingPageShell` function body, add:

```ts
const isMobile = useIsMobile();
```

## Step 3 — Gate the right rail

Find the `RightRailMeta` render site:

```tsx
{selected && (
  <div className={cn('mt-4 grid gap-4 xl:grid-cols-[minmax(0,1fr)_320px]')}>
    <RoutingIncomePanel
      tourId={tourId}
      selectedRoutingId={selected}
      onRoutingIdChange={setSelected}
      currency={tourCurrency}
      showDayStrip={false}
    />
    <RightRailMeta selectedDay={selectedDay ?? null} />
  </div>
)}
```

Change to:

```tsx
{selected && (
  <div className={cn('mt-4 grid gap-4 xl:grid-cols-[minmax(0,1fr)_320px]')}>
    <RoutingIncomePanel
      tourId={tourId}
      selectedRoutingId={selected}
      onRoutingIdChange={setSelected}
      currency={tourCurrency}
      showDayStrip={false}
    />
    {!isMobile && <RightRailMeta tourId={tourId} selectedDay={selectedDay ?? null} />}
  </div>
)}
```

Note the new prop: `tourId={tourId}`. We need it in §3 so the Notes editor can PATCH the right row. Thread it through the component signature:

```tsx
function RightRailMeta({
  tourId,
  selectedDay,
}: {
  tourId: string;
  selectedDay: DayListRow | null;
}) {
  if (!selectedDay) return null;
  // ...existing body unchanged for now — §3 will edit this
}
```

## Step 4 — Remove the now-redundant CSS breakpoint on the aside

Inside `RightRailMeta`, the `<aside>` currently has `hidden space-y-4 xl:block`. Change the className to just `space-y-4`:

```diff
- <aside className="hidden space-y-4 xl:block">
+ <aside className="space-y-4">
```

Rationale: the parent `<div>` that contains the aside is now conditional on `!isMobile` (Step 3), so the CSS `hidden`/`xl:block` toggle is redundant. Keeping both would double-gate the same logic and confuse future readers.

## §2 acceptance

- [ ] `npx tsc --noEmit --skipLibCheck` clean.
- [ ] On a >=1280px desktop viewport: routing page renders income panel and right-rail side-by-side in a grid, exactly as before.
- [ ] On a tablet viewport (768–1279px): income panel renders first, right-rail stacks below it — **this is the intentional loosening**. Flag if this looks broken.
- [ ] On a phone viewport (<768px): right-rail is not rendered. Day strip + income panel only.
- [ ] Resizing the window from desktop → mobile → desktop correctly shows/hides the right rail.

---

# §3 — Right-rail Notes: wire to real data

## Decision block (no ambiguity allowed)

These are locked. Implement exactly as specified.

- **Data location**: the `routing` table already has a `notes` column (visible in `src/app/api/tours/[id]/routing/route.ts:121` in the insert payload). No schema migration.
- **Editor**: plain `<textarea>`. No rich-text editor. No markdown preview. No auto-linking.
- **Persistence model**: optimistic. Local state updates instantly on keystroke; server save is debounced 500ms after last keystroke.
- **Save failure**: revert local state to last-known-saved value and show an inline error beneath the textarea (`text-rose-500 text-xs`). Do NOT use `alert()` or a global toast — inline is sufficient for this PR.
- **Endpoint**: new file at `src/app/api/tours/[id]/routing/[routingId]/route.ts`. Method: `PATCH`. Body shape: `{ notes?: string }` — the body accepts a partial update so we can reuse this endpoint for other column-level edits later without adding more files.
- **Auth + RLS**: match the existing pattern in `src/app/api/tours/[id]/routing/route.ts`: `createServerSupabaseClient` → `auth.getUser()` → 401 if no user → fetch `profiles.workspace_id` → verify the tour belongs to this workspace → perform update. Never trust client-supplied workspace data.
- **Concurrency**: a simple last-write-wins update on the `routing` row is fine for this PR. No optimistic locking, no version column.

If any of the above is genuinely unworkable in the codebase as it stands, **STOP and report** — do not substitute your own design.

## Step 0 — Verify

```bash
# A) The new endpoint file should not yet exist
ls "src/app/api/tours/[id]/routing/[routingId]/route.ts" 2>&1 | head -5

# B) The RightRailMeta currently shows a placeholder "No notes"
grep -n "No notes" src/app/\(app\)/tours/\[id\]/routing/RoutingPageShell.tsx \
  || echo "Already migrated"

# C) Confirm routing table has a notes column used elsewhere
grep -rn "notes:" src/app/api/tours/\[id\]/routing/route.ts
```

Expected before §3 lands: A prints "No such file or directory"; B prints one match for "No notes"; C prints at least one line showing `notes:` in the insert payload.
Expected after: A prints the file listing; B prints "Already migrated"; C unchanged.

If all three already match the landed state, **skip §3** and report "§3 already landed".

## Step 1 — Create the PATCH endpoint

Create `src/app/api/tours/[id]/routing/[routingId]/route.ts`:

```ts
/* ============================================
   LOWPASS — Tour Routing Row API

   PATCH: partial update for a single routing row. Currently supports:
     - notes (text)
   Future column-level edits can extend the whitelist without creating
   new endpoints.
   ============================================ */

import { NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase-server';

const ALLOWED_FIELDS = new Set(['notes']);

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string; routingId: string }> }
) {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { id: tourId, routingId } = await params;

  const { data: profile } = await supabase
    .from('profiles')
    .select('workspace_id')
    .eq('id', user.id)
    .single();

  if (!profile?.workspace_id) {
    return NextResponse.json({ error: 'No workspace' }, { status: 403 });
  }

  // Verify the tour belongs to this workspace.
  const { data: tour, error: tourErr } = await supabase
    .from('tours')
    .select('id')
    .eq('id', tourId)
    .eq('workspace_id', profile.workspace_id)
    .maybeSingle();

  if (tourErr || !tour) {
    return NextResponse.json({ error: 'Tour not found' }, { status: 404 });
  }

  // Verify the routing row belongs to this tour (defence in depth against
  // a caller who knows a routing_id but not the tour).
  const { data: routingRow, error: routingErr } = await supabase
    .from('routing')
    .select('id')
    .eq('id', routingId)
    .eq('tour_id', tourId)
    .maybeSingle();

  if (routingErr || !routingRow) {
    return NextResponse.json({ error: 'Routing row not found' }, { status: 404 });
  }

  // Whitelist the incoming body.
  const body = (await request.json()) as Record<string, unknown>;
  const update: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(body)) {
    if (ALLOWED_FIELDS.has(k)) {
      update[k] = v;
    }
  }

  if (Object.keys(update).length === 0) {
    return NextResponse.json({ error: 'No updatable fields in body' }, { status: 400 });
  }

  const { data: updated, error: updateErr } = await supabase
    .from('routing')
    .update(update)
    .eq('id', routingId)
    .eq('tour_id', tourId)
    .select()
    .single();

  if (updateErr) {
    return NextResponse.json({ error: updateErr.message }, { status: 500 });
  }

  return NextResponse.json(updated);
}
```

**Notes on this code:**

- We verify workspace → tour → routing → update. Three lookups may feel heavy; they are cheap against PostgREST and prevent cross-tenant write paths.
- `ALLOWED_FIELDS` is a whitelist so a malicious client can't PATCH arbitrary columns via this endpoint.
- The returned row is the freshly-updated row (for client-side reconciliation).

## Step 2 — Extend `DayListRow` and the lite endpoint to include `notes`

The client needs the current notes value when a day is selected. Two approaches:

- (a) Extend the existing lite GET to include `notes` in its select.
- (b) Fetch the single row separately when selection changes.

Go with **(a)** — simpler, one fewer fetch, and notes are small.

Edit `src/app/api/tours/[id]/routing/route.ts`. Find the `lite` branch:

```ts
const { data, error } = await supabase
  .from('routing')
  .select('id, date, day_type, city, venue_name')
  .eq('tour_id', tourId)
  .order('date');
```

Change the select to include `notes`:

```ts
const { data, error } = await supabase
  .from('routing')
  .select('id, date, day_type, city, venue_name, notes')
  .eq('tour_id', tourId)
  .order('date');
```

Then edit `src/app/(app)/tours/[id]/routing/RoutingPageShell.tsx`. Find the `DayListRow` type and add `notes`:

```ts
type DayListRow = {
  id: string;
  date: string;
  day_type: string;
  city: string;
  venue_name: string | null;
  notes: string | null;
};
```

If `RoutingPageShell` currently fetches via `fetch(\`/api/tours/${encodeURIComponent(tourId)}/routing\`)` (the non-lite, full-row endpoint), leave it alone — full rows already include `notes` via `select('*')`. If it fetches the lite endpoint (`?lite=1`), the select update above covers it.

**STOP if**: any other caller of the lite endpoint expects the response NOT to include `notes` — unlikely because clients parse fields they need, but search for consumers before changing the server shape:

```bash
grep -rn "/api/tours/.*routing.*lite=1\|'lite': '1'\|lite=1" src/
```

If all hits are internal and benign, proceed. If any hit consumes the response in a way that would break with an extra field, stop and report.

## Step 3 — Build the Notes section in `RightRailMeta`

Replace the current stubbed Notes `MetaSection`:

```tsx
<MetaSection title="Notes">
  <p className="text-sm text-lp-text-tertiary">No notes</p>
</MetaSection>
```

with a new `NotesSection` component. Drop this new component directly above `MetaSection` at the bottom of `RoutingPageShell.tsx`:

```tsx
function NotesSection({
  tourId,
  routingId,
  initial,
}: {
  tourId: string;
  routingId: string;
  initial: string;
}) {
  const [value, setValue] = useState(initial);
  const [savedValue, setSavedValue] = useState(initial);
  const [status, setStatus] = useState<'idle' | 'saving' | 'error'>('idle');
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // When the parent swaps to a different day, reset local state to the new initial.
  useEffect(() => {
    setValue(initial);
    setSavedValue(initial);
    setStatus('idle');
  }, [routingId, initial]);

  // Debounced save on value change.
  useEffect(() => {
    if (value === savedValue) return;
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      void save(value);
    }, 500);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);

  async function save(next: string) {
    setStatus('saving');
    try {
      const res = await fetch(
        `/api/tours/${encodeURIComponent(tourId)}/routing/${encodeURIComponent(routingId)}`,
        {
          method: 'PATCH',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ notes: next }),
        }
      );
      if (!res.ok) throw new Error(`Save failed: ${res.status}`);
      setSavedValue(next);
      setStatus('idle');
    } catch (err) {
      console.error('Notes save failed', err);
      // Revert to last-known-saved value on failure.
      setValue(savedValue);
      setStatus('error');
    }
  }

  return (
    <MetaSection
      title="Notes"
      actionLabel={null}
      meta={
        status === 'saving'
          ? 'Saving…'
          : status === 'error'
          ? 'Save failed'
          : null
      }
      metaClass={status === 'error' ? 'text-rose-500' : 'text-lp-text-tertiary'}
    >
      <textarea
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder="Add notes for this day…"
        rows={4}
        className="w-full resize-y rounded-md border border-lp-border bg-lp-bg px-3 py-2 text-sm text-lp-text placeholder:text-lp-text-tertiary focus:border-lp-orange focus:outline-none focus:ring-1 focus:ring-lp-orange"
      />
    </MetaSection>
  );
}
```

You'll need these additional imports at the top of `RoutingPageShell.tsx`:

```ts
import { ReactNode, useEffect, useRef, useState } from 'react';
```

(If `ReactNode`, `useEffect`, `useState` are already imported, just add `useRef`.)

## Step 4 — Teach `MetaSection` to accept a status meta line

The current `MetaSection` has a `+` button hardcoded. Our Notes section doesn't want the `+` — it has its own inline editor — so extend `MetaSection` with two optional props:

```tsx
function MetaSection({
  title,
  children,
  actionLabel = '+',
  meta,
  metaClass,
}: {
  title: string;
  children: ReactNode;
  actionLabel?: string | null; // null = hide the action button
  meta?: string | null;
  metaClass?: string;
}) {
  return (
    <div className="rounded-xl border border-lp-border bg-lp-surface/50 p-4">
      <div className="mb-2 flex items-center justify-between gap-2">
        <h3 className="lp-label-caps text-[10px] font-semibold uppercase tracking-widest text-lp-text-secondary">
          {title}
        </h3>
        <div className="flex items-center gap-2">
          {meta && <span className={cn('text-[10px] uppercase tracking-widest', metaClass)}>{meta}</span>}
          {actionLabel !== null && (
            <button
              type="button"
              onClick={() => alert('TODO: Phase F will enable editing here')}
              className="inline-flex h-6 w-6 items-center justify-center rounded-md text-lp-text-tertiary hover:bg-lp-surface-hover hover:text-lp-text"
              aria-label={`Add to ${title}`}
            >
              {actionLabel}
            </button>
          )}
        </div>
      </div>
      {children}
    </div>
  );
}
```

Existing callers (`Day Type & Locations`, `Lodging`, `Contacts`) pass only `title` and `children`, so they keep the default `+` and no meta. `NotesSection` passes `actionLabel={null}` to suppress the `+` and `meta="Saving…"` etc. to show status.

## Step 5 — Render the new `NotesSection`

Inside `RightRailMeta`, replace the stubbed Notes block:

```tsx
<MetaSection title="Notes">
  <p className="text-sm text-lp-text-tertiary">No notes</p>
</MetaSection>
```

with:

```tsx
<NotesSection
  tourId={tourId}
  routingId={selectedDay.id}
  initial={selectedDay.notes ?? ''}
/>
```

Remember `RightRailMeta` now takes `tourId` as a prop (added in §2 Step 3).

## §3 acceptance

- [ ] `npx tsc --noEmit --skipLibCheck` clean.
- [ ] New endpoint file exists at `src/app/api/tours/[id]/routing/[routingId]/route.ts`.
- [ ] Typing in the Notes textarea updates the visible value instantly.
- [ ] After ~500ms of no keystrokes, the "Saving…" meta appears, then disappears on success.
- [ ] Refresh the page → the previously-typed notes persist.
- [ ] Switching to a different day via the day strip correctly swaps the textarea contents.
- [ ] Forcing a 500 (e.g. network tab → block `/api/tours/.../routing/.../` → type in textarea) → "Save failed" meta appears in rose, local value reverts.
- [ ] `npm run lint src/app/(app)/tours/[id]/routing/RoutingPageShell.tsx src/app/api/tours/[id]/routing/[routingId]/route.ts` adds no new errors or warnings.

---

# §4 — Final verification

Run these from the project root and paste the output back:

```bash
# 1. Type check
npx tsc --noEmit --skipLibCheck 2>&1 | tail -40

# 2. Lint just the files this PR touched or added
npm run lint -- \
  src/components/layout/AppTopBarModePill.tsx \
  "src/app/(app)/tours/[id]/routing/RoutingPageShell.tsx" \
  "src/app/api/tours/[id]/routing/[routingId]/route.ts" \
  src/app/api/tours/\[id\]/routing/route.ts 2>&1 | tail -60

# 3. Confirm cleanup landed
grep -n "aria-pressed\|'lp', 'sidebar', 'mode'\|rename deferred to A0.4" \
  src/components/layout/AppTopBarModePill.tsx \
  || echo "OK: cleanup landed"

# 4. Confirm useIsMobile wired
grep -n "useIsMobile" "src/app/(app)/tours/[id]/routing/RoutingPageShell.tsx"

# 5. Confirm new endpoint exists
ls "src/app/api/tours/[id]/routing/[routingId]/route.ts"

# 6. Confirm NotesSection exists
grep -n "function NotesSection" "src/app/(app)/tours/[id]/routing/RoutingPageShell.tsx"
```

Report:

- Per section: ran / skipped / blocked (with reason).
- Files touched.
- Any deviations from the spec (with reason).
- Full output of the six commands above.
- Any NEW lint or type errors (not pre-existing ones — diff against the last known clean state if unsure).

---

# §5 — Explicit out of scope

Do not touch these in this PR, even if tempting:

- Lodging section — requires schema decisions (hotel assignments table, rooming list, etc.). Phase F territory.
- Contacts section — `contacts` table exists but the right-rail view needs to filter by day, which means a `routing_contacts` join or a `day_tag` column. Separate design pass.
- Day Type & Locations section — currently read-only and that's fine for this PR. A future PR will let you edit `day_type` + re-order the routing row. That touches the routing editor's drag-drop flow, not the right rail.
- Advance detail page `/tours/[id]/advance/[routingId]` — big Daysheets three-column redesign, separate prompt.
- Migrating `custom_day_types` JSONB from `string[]` to `{ name, color }[]` — worthwhile but needs a DB migration plan + existing-data audit.
- Any framer-motion, any new external packages.
- Sidebar structural changes.
- Phase B realtime / share links / PDF export.
- Group tags, party chip wiring, "All/Me" filter.

If any of the above feels necessary to complete §1–§3 cleanly, **STOP and report** — it means the spec is wrong, not that you should expand scope.

---

# Appendix — Why these three pieces together

1. **Cleanup first (§1)** — closes the loose ends from the overnight PR so future greps are honest.
2. **`useIsMobile` wiring (§2)** — activates a primitive we'll need anyway; lets us remove one hardcoded CSS breakpoint.
3. **Notes wiring (§3)** — first real right-rail feature. Establishes the PATCH-one-field pattern that Lodging, Contacts, and Day Type editors will reuse. Low risk because the column already exists and the UI surface is one textarea.

Estimated PR size: ~250 lines net, split across five files. All additive except the three small edits in §1 and §2 Step 4.
