# Cursor Prompt — PR A2 follow-up (server-only, option 1)

**Context for you, Cursor.** You correctly flagged that PR A2's §2 and most of §3 can't land because `RoutingPageShell.tsx` and `src/hooks/useIsMobile.ts` don't exist in the tree — the mega-PR that introduced them was reverted in `d0613b4`. Adam has picked **Option 1**: ship the two server-only pieces that don't depend on the shell, and defer the UI rebuild to a separate future PR.

This prompt is standalone. It assumes nothing about your current session state. Verify state at each step.

---

## Hard rules

1. **Do not rebuild `RoutingPageShell`, `useIsMobile`, `RightRailMeta`, `MetaSection`, `NotesSection`, `DayListRow`, `DayStrip`, `DayCard`, or any component those types reference.** They were reverted intentionally. A separate PR will reintroduce them.
2. **Do not modify any component in `src/components/routing/` or `src/app/(app)/tours/[id]/routing/page.tsx`.** UI work is out of scope for this PR.
3. If anything is ambiguous, stop and report. Do not invent behaviour.
4. Every step includes grep-based acceptance criteria. Run them. Paste the output in your report.

---

## §1 — Verify prior §1 (AppTopBarModePill cleanup) is still present

You previously landed §1 in an earlier session (aria-pressed dropped, comment updated, `LEGACY_MODE_KEY` literal + migration on mount). Confirm it's still intact before proceeding.

### Step 0 — Verify

```bash
# A. LEGACY_MODE_KEY is literal, not dynamic join
grep -n "LEGACY_MODE_KEY" src/components/layout/AppTopBarModePill.tsx

# B. Active key is 'lp-workspace-mode'
grep -n "lp-workspace-mode" src/components/layout/AppTopBarModePill.tsx

# C. Migration on mount present
grep -n "removeItem" src/components/layout/AppTopBarModePill.tsx

# D. aria-pressed removed from pill buttons
grep -n "aria-pressed" src/components/layout/AppTopBarModePill.tsx
```

### Acceptance

- A prints `LEGACY_MODE_KEY = 'lp-sidebar-mode'` (literal string, no `.join(`).
- B prints at least one line mentioning `'lp-workspace-mode'`.
- C prints a line showing `removeItem` (the migration cleanup).
- D prints **nothing**. If it prints anything, stop and report — §1 regressed.

If any fail, stop and report before touching anything else.

---

## §2 — Add per-row PATCH endpoint for routing

Create a new API route that lets a single routing row be updated without rewriting the whole tour's routing. This is pure server. No UI consumes it yet; that's fine — the next routing UI PR will wire it up.

### Step 0 — Verify starting state

```bash
# A. New endpoint doesn't exist
ls -la "src/app/api/tours/[id]/routing/[routingId]/" 2>&1 | head -5

# B. Confirm the shape of the existing (collection) route for consistency
grep -n "createServerSupabaseClient\|workspace_id\|get_my_workspace_id" src/app/api/tours/[id]/routing/route.ts
```

### Acceptance for Step 0

- A prints "No such file or directory" or similar (the folder doesn't exist yet).
- B prints lines confirming the existing route uses `createServerSupabaseClient()` + a `profiles.workspace_id` lookup + a `tours` triple-check. You'll mirror that pattern.

If A shows the file already exists, stop and report — someone has already started this.

### Step 1 — Create the file

Create `src/app/api/tours/[id]/routing/[routingId]/route.ts` with:

```ts
/* ============================================
   LOWPASS — Tour Routing Row (PATCH)

   Partial update for a single routing row. Whitelisted fields only.
   Verifies workspace → tour → routing ownership before writing.
   Last-write-wins (no optimistic concurrency in v1).
   ============================================ */

import { NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase-server';

/**
 * Fields callers are allowed to PATCH on a routing row.
 * Do NOT add fields like `tour_id`, `id`, `created_at`, or anything that
 * changes row identity. Add one field at a time and confirm the frontend
 * actually sends it before expanding.
 */
const ALLOWED_FIELDS = new Set<string>([
  'notes',
  'day_type',
  'city',
  'address',
  'venue_id',
  'venue_name',
  'venue_website',
  'venue_phone',
  'venue_capacity',
  'latitude',
  'longitude',
  'transport_to_next',
]);

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

  // 1. workspace check
  const { data: profile } = await supabase
    .from('profiles')
    .select('workspace_id')
    .eq('id', user.id)
    .single();

  if (!profile?.workspace_id) {
    return NextResponse.json({ error: 'No workspace' }, { status: 403 });
  }

  // 2. tour must belong to workspace
  const { data: tour, error: tourErr } = await supabase
    .from('tours')
    .select('id')
    .eq('id', tourId)
    .eq('workspace_id', profile.workspace_id)
    .maybeSingle();

  if (tourErr || !tour) {
    return NextResponse.json({ error: 'Tour not found' }, { status: 404 });
  }

  // 3. routing row must belong to tour
  const { data: existing, error: existingErr } = await supabase
    .from('routing')
    .select('id')
    .eq('id', routingId)
    .eq('tour_id', tourId)
    .maybeSingle();

  if (existingErr || !existing) {
    return NextResponse.json({ error: 'Routing row not found' }, { status: 404 });
  }

  // 4. parse + whitelist body
  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const updates: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(body ?? {})) {
    if (ALLOWED_FIELDS.has(k)) updates[k] = v;
  }

  if (Object.keys(updates).length === 0) {
    return NextResponse.json(
      { error: 'No updatable fields in body' },
      { status: 400 }
    );
  }

  // 5. update
  const { data: updated, error: updateErr } = await supabase
    .from('routing')
    .update(updates)
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

### Step 2 — Acceptance greps

```bash
# A. File exists and exports PATCH
grep -n "export async function PATCH" "src/app/api/tours/[id]/routing/[routingId]/route.ts"

# B. Whitelist present and includes 'notes'
grep -n "ALLOWED_FIELDS" "src/app/api/tours/[id]/routing/[routingId]/route.ts"
grep -n "'notes'" "src/app/api/tours/[id]/routing/[routingId]/route.ts"

# C. Triple-check in place (workspace → tour → routing)
grep -n "get_my_workspace_id\|workspace_id\|tour_id" "src/app/api/tours/[id]/routing/[routingId]/route.ts" | head -20

# D. No other HTTP verbs added (keep this file PATCH-only)
grep -n "export async function" "src/app/api/tours/[id]/routing/[routingId]/route.ts"
```

### Expected

- A prints one line.
- B prints `ALLOWED_FIELDS` + the `'notes'` line.
- C prints at least three lines covering all three checks.
- D prints exactly one line (PATCH only). If GET or POST show up, you've drifted.

---

## §3 — Expose `notes` in the lite GET of the collection route

The lite GET currently returns `id, date, day_type, city, venue_name`. Add `notes` so future UI can read it without a full fetch.

### Step 0 — Verify

```bash
# A. Confirm lite select shape
grep -n "lite" src/app/api/tours/[id]/routing/route.ts
grep -n "id, date, day_type, city, venue_name" src/app/api/tours/[id]/routing/route.ts
```

### Expected

- A prints at least one line matching the select tuple. If it already includes `notes`, stop — no work to do, report "already migrated".

### Step 1 — Edit

Find this line in `src/app/api/tours/[id]/routing/route.ts`:

```ts
.select('id, date, day_type, city, venue_name')
```

Change to:

```ts
.select('id, date, day_type, city, venue_name, notes')
```

That's the only change in this file. Do not touch POST, do not reorder fields, do not add other columns.

### Step 2 — Acceptance

```bash
grep -n "id, date, day_type, city, venue_name, notes" src/app/api/tours/[id]/routing/route.ts
```

- Prints one line. Nothing else changed.

---

## §4 — Final verification

Run the following and paste the full output in your report:

```bash
# 1. TypeScript clean
npx tsc --noEmit 2>&1 | tail -20

# 2. Lint — filter for files touched in this PR
npx eslint "src/app/api/tours/[id]/routing/route.ts" "src/app/api/tours/[id]/routing/[routingId]/route.ts" 2>&1 | tail -20

# 3. Confirm no UI files were touched
git status --short
```

### Expected

- `tsc` clean (no errors).
- `eslint` clean on both touched files (or only pre-existing warnings if any).
- `git status --short` shows ONLY:
  - `M  src/app/api/tours/[id]/routing/route.ts`
  - `A  src/app/api/tours/[id]/routing/[routingId]/route.ts`

If any routing UI files (`src/components/routing/**`, `src/app/(app)/tours/[id]/routing/**`), any hooks, or any layout files show up in `git status`, STOP. Revert those changes. Report.

### Commit + push

```bash
git add "src/app/api/tours/[id]/routing/route.ts" "src/app/api/tours/[id]/routing/[routingId]/route.ts"
git commit -m "feat(routing): add per-row PATCH + expose notes in lite GET

PR A2 follow-up (server-only). The full UI work in the original A2 prompt
was blocked because RoutingPageShell and useIsMobile were reverted in
d0613b4. This ships only the two server-only pieces that don't depend on
the shell:

- New PATCH /api/tours/[id]/routing/[routingId] with ALLOWED_FIELDS
  whitelist and workspace → tour → routing triple-check.
- Lite GET now includes 'notes' so future right-rail UI can read it."
git push
```

---

## §5 — Out of scope (do not touch)

- `src/components/routing/**`
- `src/app/(app)/tours/[id]/routing/page.tsx`
- `src/hooks/**` (nothing new here; useIsMobile is deferred)
- `src/components/layout/**` (AppTopBarModePill was finished in §1 of the previous PR; do not re-edit)
- Any new components, any new shells, any new hooks
- Any migration files
- Day type editing / custom day types
- Lodging, Contacts, Advance detail redesign

---

## §6 — Report template for your reply

Please report back with:

1. §1 Step 0 verification output (all four greps A–D).
2. §2 Step 0 verification output.
3. §2 Step 2 acceptance grep output.
4. §3 Step 0 + Step 2 grep output.
5. §4 tsc + eslint + git status output.
6. The commit SHA after push.
7. Anything you flagged as ambiguous and stopped on (ideally nothing).

Do not write any commentary beyond what's needed to explain the greps. Short report.
