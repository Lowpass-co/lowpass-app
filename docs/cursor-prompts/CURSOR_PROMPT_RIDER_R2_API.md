# Cursor Prompt — Rider/Pack R2: API layer (packs + sections + resolver + history)

Second of the Rider/Pack build PRs. R1 shipped migration 034 (commit `1210645`). R2 is the API surface that R3 (editor UI) will consume.

**See `RIDER_PACK_DESIGN.md` in repo root for full design. You don't need to re-read it to execute this prompt.**

---

## Scope

In this PR:
- Shared types + resolver + history helper in `src/lib/rider-packs/`
- 6 route files covering packs, sections, resolved view, history
- No UI. No asset upload yet. No contact picker yet. No Google Doc export.

Files this PR creates (exact list — anything else is out of scope):
1. `src/lib/rider-packs/types.ts`
2. `src/lib/rider-packs/resolve.ts`
3. `src/lib/rider-packs/history.ts`
4. `src/app/api/rider-packs/route.ts`
5. `src/app/api/rider-packs/[id]/route.ts`
6. `src/app/api/rider-packs/[id]/resolved/route.ts`
7. `src/app/api/rider-packs/[id]/sections/route.ts`
8. `src/app/api/rider-packs/[id]/sections/[sectionId]/route.ts`
9. `src/app/api/rider-packs/[id]/history/route.ts`

---

## Hard rules

1. Do not create any file not listed above.
2. Do not edit any existing `.ts` / `.tsx` file.
3. Do not touch the migration files.
4. Do not use zod (not a repo dependency — keep validation inline like the existing `routing/route.ts`).
5. Match the existing route patterns in `src/app/api/tours/[id]/routing/route.ts` and `src/app/api/tours/[id]/routing/[routingId]/route.ts`. Same import style, same auth flow, same triple-check pattern (workspace → parent → child).
6. RLS from migration 034 is the real security boundary. API-layer checks are defense in depth + for better error messages.
7. If anything is ambiguous, stop and report. Do not invent behaviour.

---

## Step 0 — Pre-flight

```bash
# A. Migration 034 is merged
git log --oneline -5 database/migrations/034_rider_pack_system.sql

# B. None of the R2 files already exist
ls src/lib/rider-packs/ 2>&1 | head -5
ls "src/app/api/rider-packs/" 2>&1 | head -5

# C. Supabase server client import path still valid
grep -n "createServerSupabaseClient" src/app/api/tours/[id]/routing/route.ts

# D. No zod imports anywhere (sanity — we match convention by not using it)
grep -rn "from ['\"]zod['\"]" src/ | head -3
```

### Acceptance

- A: prints commit `1210645` or the R1 commit SHA.
- B: both `ls` calls print "No such file or directory".
- C: prints an import line for `createServerSupabaseClient` from `@/lib/supabase-server`.
- D: prints nothing.

If any fail, stop and report.

---

## Step 1 — Types file

Create `src/lib/rider-packs/types.ts` with the exact content below.

```ts
/* ============================================
   LOWPASS — Rider/Pack shared types

   Keep in sync with migration 034 column shapes and
   with RIDER_PACK_DESIGN.md §5.3 (field primitives).
   ============================================ */

export type PackScope = 'artist' | 'tour' | 'show';

/** Field primitive discriminated union. See design §5.3. */
export type FieldText = {
  type: 'text';
  key: string;
  label?: string;
  value: string; // HTML or markdown — client decides render
};

export type FieldTable = {
  type: 'table';
  key: string;
  label?: string;
  columns: { key: string; label: string }[];
  rows: Record<string, string>[];
};

export type FieldContact = {
  type: 'contact';
  key: string;
  label?: string;
  // Resolved at render; stored as references.
  entries: Array<{
    source: 'tour_personnel' | 'contact' | 'external';
    ref_id?: string; // personnel_tour_assignments.id / contacts.id
    // For external or overrides, inline fields:
    name?: string;
    role?: string;
    email?: string;
    phone?: string;
    company?: string;
    notes?: string;
    show_fields: Array<'name' | 'role' | 'email' | 'phone' | 'company' | 'notes'>;
  }>;
};

export type FieldAsset = {
  type: 'asset';
  key: string;
  label?: string;
  asset_id: string; // FK to rider_assets.id
};

export type FieldTime = {
  type: 'time';
  key: string;
  label?: string;
  value: string; // 'HH:MM' 24h
  tz?: string;   // IANA, e.g. 'Europe/London'
};

export type FieldCurrency = {
  type: 'currency';
  key: string;
  label?: string;
  amount: number;
  currency: string; // ISO 4217, e.g. 'USD'
};

export type FieldNumber = {
  type: 'number';
  key: string;
  label?: string;
  value: number;
  unit?: string;
};

export type FieldCheckboxList = {
  type: 'checkbox_list';
  key: string;
  label?: string;
  items: { key: string; label: string; checked: boolean }[];
};

export type FieldUrl = {
  type: 'url';
  key: string;
  label?: string;
  href: string;
  display_text?: string;
};

export type Field =
  | FieldText
  | FieldTable
  | FieldContact
  | FieldAsset
  | FieldTime
  | FieldCurrency
  | FieldNumber
  | FieldCheckboxList
  | FieldUrl;

export const FIELD_TYPES = [
  'text', 'table', 'contact', 'asset',
  'time', 'currency', 'number', 'checkbox_list', 'url',
] as const;
export type FieldType = (typeof FIELD_TYPES)[number];

/** rider_packs row. */
export type RiderPack = {
  id: string;
  workspace_id: string;
  scope: PackScope;
  artist_id: string;
  tour_id: string | null;
  routing_id: string | null;
  title: string | null;
  google_doc_id: string | null;
  google_doc_url: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
};

/** rider_sections row (as stored). */
export type RiderSection = {
  id: string;
  pack_id: string;
  section_key: string;
  title: string;
  sort_order: number;
  fields: Field[];
  created_at: string;
  updated_at: string;
};

/** Resolved section with inheritance metadata. */
export type ResolvedSection = RiderSection & {
  /** Where this section actually came from. null = authored at current scope. */
  inherited_from: PackScope | null;
  /** Pack ID the section was sourced from (may differ from the requested pack). */
  source_pack_id: string;
};

/** Shape returned by GET /api/rider-packs/[id]/resolved. */
export type ResolvedPack = {
  pack: RiderPack;
  sections: ResolvedSection[];
};

export const HISTORY_CHANGE_TYPES = [
  'pack.created',
  'pack.updated',
  'pack.deleted',
  'section.added',
  'section.updated',
  'section.removed',
  'section.reordered',
] as const;
export type HistoryChangeType = (typeof HISTORY_CHANGE_TYPES)[number];

export type RiderPackHistoryRow = {
  id: string;
  pack_id: string;
  changed_by: string | null;
  change_type: HistoryChangeType | string;
  section_key: string | null;
  field_key: string | null;
  old_value: unknown;
  new_value: unknown;
  changed_at: string;
};
```

### Acceptance

```bash
grep -n "export type PackScope\|export type Field\b\|export type RiderPack\|export type ResolvedPack\|export const HISTORY_CHANGE_TYPES" src/lib/rider-packs/types.ts
```

Expected: 5 lines.

---

## Step 2 — Resolver

Create `src/lib/rider-packs/resolve.ts`. This walks the scope chain (show → tour → artist) and merges sections by `section_key`, preferring more specific scopes.

```ts
/* ============================================
   LOWPASS — Rider/Pack section resolver

   Given a pack, return its sections merged with parent-scope
   sections so the UI can show "inherited from tour" / etc.

   Resolution order: show > tour > artist. First match per
   section_key wins. Sort the final list by sort_order from
   whichever scope authored it.
   ============================================ */

import type { SupabaseClient } from '@supabase/supabase-js';
import type {
  PackScope,
  RiderPack,
  RiderSection,
  ResolvedSection,
  ResolvedPack,
} from './types';

/** Find the chain of parent pack IDs for a given pack. */
async function resolveParentPackIds(
  supabase: SupabaseClient,
  pack: RiderPack,
): Promise<Array<{ id: string; scope: PackScope }>> {
  const parents: Array<{ id: string; scope: PackScope }> = [];

  if (pack.scope === 'show' && pack.tour_id) {
    const { data: tourPack } = await supabase
      .from('rider_packs')
      .select('id, scope')
      .eq('scope', 'tour')
      .eq('artist_id', pack.artist_id)
      .eq('tour_id', pack.tour_id)
      .maybeSingle();
    if (tourPack) parents.push({ id: tourPack.id, scope: 'tour' });
  }

  if (pack.scope === 'show' || pack.scope === 'tour') {
    const { data: artistPack } = await supabase
      .from('rider_packs')
      .select('id, scope')
      .eq('scope', 'artist')
      .eq('artist_id', pack.artist_id)
      .maybeSingle();
    if (artistPack) parents.push({ id: artistPack.id, scope: 'artist' });
  }

  return parents;
}

/** Priority: show (0) < tour (1) < artist (2). Lower number = more specific. */
const SCOPE_PRIORITY: Record<PackScope, number> = {
  show: 0,
  tour: 1,
  artist: 2,
};

export async function resolvePack(
  supabase: SupabaseClient,
  pack: RiderPack,
): Promise<ResolvedPack> {
  const parents = await resolveParentPackIds(supabase, pack);
  const allPackIds = [pack.id, ...parents.map((p) => p.id)];

  const { data: rawSections, error } = await supabase
    .from('rider_sections')
    .select('*, pack:rider_packs!inner(id, scope)')
    .in('pack_id', allPackIds);

  if (error) throw error;

  // Sort so the most specific scope comes first, then pick first per key.
  const sorted = (rawSections ?? []).slice().sort((a, b) => {
    const ap = SCOPE_PRIORITY[a.pack.scope as PackScope] ?? 99;
    const bp = SCOPE_PRIORITY[b.pack.scope as PackScope] ?? 99;
    return ap - bp;
  });

  const byKey = new Map<string, ResolvedSection>();
  for (const row of sorted) {
    if (byKey.has(row.section_key)) continue;
    const { pack: srcPack, ...rest } = row as RiderSection & {
      pack: { id: string; scope: PackScope };
    };
    byKey.set(row.section_key, {
      ...rest,
      inherited_from: srcPack.id === pack.id ? null : srcPack.scope,
      source_pack_id: srcPack.id,
    });
  }

  const sections = Array.from(byKey.values()).sort(
    (a, b) => a.sort_order - b.sort_order,
  );

  return { pack, sections };
}
```

### Acceptance

```bash
grep -n "export async function resolvePack\|resolveParentPackIds\|SCOPE_PRIORITY" src/lib/rider-packs/resolve.ts
```

Expected: 3 lines.

---

## Step 3 — History helper

Create `src/lib/rider-packs/history.ts`. Pure insert helper. Never throws — logs on error and returns silently because history is append-best-effort, not a correctness guarantee.

```ts
/* ============================================
   LOWPASS — Rider/Pack history append helper

   Used by route handlers after successful writes to record
   the change in rider_pack_history. Best-effort: if the
   insert fails, we log and continue — the primary write
   already succeeded.
   ============================================ */

import type { SupabaseClient } from '@supabase/supabase-js';
import type { HistoryChangeType } from './types';

export type AppendHistoryArgs = {
  packId: string;
  changedBy: string | null;
  changeType: HistoryChangeType;
  sectionKey?: string | null;
  fieldKey?: string | null;
  oldValue?: unknown;
  newValue?: unknown;
};

export async function appendHistory(
  supabase: SupabaseClient,
  args: AppendHistoryArgs,
): Promise<void> {
  const { error } = await supabase.from('rider_pack_history').insert({
    pack_id: args.packId,
    changed_by: args.changedBy,
    change_type: args.changeType,
    section_key: args.sectionKey ?? null,
    field_key: args.fieldKey ?? null,
    old_value: args.oldValue ?? null,
    new_value: args.newValue ?? null,
  });
  if (error) {
    // Don't throw — history is best-effort.
    console.warn('[rider-packs] history append failed', {
      packId: args.packId,
      changeType: args.changeType,
      error: error.message,
    });
  }
}
```

### Acceptance

```bash
grep -n "export async function appendHistory\|AppendHistoryArgs" src/lib/rider-packs/history.ts
```

Expected: 2 lines.

---

## Step 4 — `GET`/`POST /api/rider-packs`

Create `src/app/api/rider-packs/route.ts`.

```ts
/* ============================================
   LOWPASS — Rider/Pack collection

   GET  /api/rider-packs?scope=artist|tour|show
                        &artist_id=...
                        &tour_id=...
                        &routing_id=...

   POST /api/rider-packs   body: { scope, artist_id,
                                   tour_id?, routing_id?, title? }
   ============================================ */

import { NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase-server';
import { appendHistory } from '@/lib/rider-packs/history';
import type { PackScope } from '@/lib/rider-packs/types';

const SCOPES: PackScope[] = ['artist', 'tour', 'show'];

export async function GET(request: Request) {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const scope = searchParams.get('scope');
  const artistId = searchParams.get('artist_id');
  const tourId = searchParams.get('tour_id');
  const routingId = searchParams.get('routing_id');

  let query = supabase.from('rider_packs').select('*');
  if (scope) {
    if (!SCOPES.includes(scope as PackScope)) {
      return NextResponse.json({ error: 'Invalid scope' }, { status: 400 });
    }
    query = query.eq('scope', scope);
  }
  if (artistId) query = query.eq('artist_id', artistId);
  if (tourId) query = query.eq('tour_id', tourId);
  if (routingId) query = query.eq('routing_id', routingId);

  const { data, error } = await query.order('created_at', { ascending: false });
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ packs: data ?? [] });
}

export async function POST(request: Request) {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const scope = body.scope as PackScope | undefined;
  const artistId = body.artist_id as string | undefined;
  const tourId = (body.tour_id as string | undefined) ?? null;
  const routingId = (body.routing_id as string | undefined) ?? null;
  const title = (body.title as string | undefined) ?? null;

  if (!scope || !SCOPES.includes(scope)) {
    return NextResponse.json({ error: 'scope must be artist|tour|show' }, { status: 400 });
  }
  if (!artistId) {
    return NextResponse.json({ error: 'artist_id is required' }, { status: 400 });
  }

  // Shape checks mirror the DB CHECK constraint — fail fast with a clear message.
  if (scope === 'artist' && (tourId || routingId)) {
    return NextResponse.json(
      { error: 'artist scope cannot have tour_id or routing_id' },
      { status: 400 },
    );
  }
  if (scope === 'tour' && (!tourId || routingId)) {
    return NextResponse.json(
      { error: 'tour scope requires tour_id and no routing_id' },
      { status: 400 },
    );
  }
  if (scope === 'show' && (!tourId || !routingId)) {
    return NextResponse.json(
      { error: 'show scope requires both tour_id and routing_id' },
      { status: 400 },
    );
  }

  // Workspace lookup for the row.
  const { data: profile } = await supabase
    .from('profiles')
    .select('workspace_id')
    .eq('id', user.id)
    .single();
  if (!profile?.workspace_id) {
    return NextResponse.json({ error: 'No workspace' }, { status: 403 });
  }

  // Verify artist belongs to workspace.
  const { data: artist } = await supabase
    .from('artists')
    .select('id')
    .eq('id', artistId)
    .eq('workspace_id', profile.workspace_id)
    .maybeSingle();
  if (!artist) {
    return NextResponse.json({ error: 'Artist not found' }, { status: 404 });
  }

  const { data: inserted, error } = await supabase
    .from('rider_packs')
    .insert({
      workspace_id: profile.workspace_id,
      scope,
      artist_id: artistId,
      tour_id: tourId,
      routing_id: routingId,
      title,
      created_by: user.id,
    })
    .select()
    .single();

  if (error) {
    // Likely unique-index conflict (one pack per scope tuple) or RLS denial (artist scope + non-admin).
    const status = error.code === '23505' ? 409 : 400;
    return NextResponse.json({ error: error.message }, { status });
  }

  await appendHistory(supabase, {
    packId: inserted.id,
    changedBy: user.id,
    changeType: 'pack.created',
    newValue: inserted,
  });

  return NextResponse.json(inserted, { status: 201 });
}
```

### Acceptance

```bash
grep -n "export async function GET\|export async function POST" src/app/api/rider-packs/route.ts
grep -n "appendHistory" src/app/api/rider-packs/route.ts
```

Expected: 2 lines each.

---

## Step 5 — `GET`/`PATCH`/`DELETE /api/rider-packs/[id]`

Create `src/app/api/rider-packs/[id]/route.ts`.

```ts
/* ============================================
   LOWPASS — Rider/Pack single pack

   GET    /api/rider-packs/[id]   → pack + raw sections (not resolved)
   PATCH  /api/rider-packs/[id]   → update pack metadata (whitelist)
   DELETE /api/rider-packs/[id]   → cascade delete via DB
   ============================================ */

import { NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase-server';
import { appendHistory } from '@/lib/rider-packs/history';

const ALLOWED_PATCH_FIELDS = new Set<string>([
  'title',
  'google_doc_id',
  'google_doc_url',
]);

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { id } = await params;

  const { data: pack, error: packErr } = await supabase
    .from('rider_packs')
    .select('*')
    .eq('id', id)
    .maybeSingle();
  if (packErr) {
    return NextResponse.json({ error: packErr.message }, { status: 500 });
  }
  if (!pack) {
    return NextResponse.json({ error: 'Pack not found' }, { status: 404 });
  }

  const { data: sections, error: sectErr } = await supabase
    .from('rider_sections')
    .select('*')
    .eq('pack_id', id)
    .order('sort_order');
  if (sectErr) {
    return NextResponse.json({ error: sectErr.message }, { status: 500 });
  }

  return NextResponse.json({ pack, sections: sections ?? [] });
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { id } = await params;

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const updates: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(body ?? {})) {
    if (ALLOWED_PATCH_FIELDS.has(k)) updates[k] = v;
  }
  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: 'No updatable fields in body' }, { status: 400 });
  }

  const { data: before } = await supabase
    .from('rider_packs')
    .select('*')
    .eq('id', id)
    .maybeSingle();
  if (!before) {
    return NextResponse.json({ error: 'Pack not found' }, { status: 404 });
  }

  const { data: updated, error } = await supabase
    .from('rider_packs')
    .update(updates)
    .eq('id', id)
    .select()
    .single();
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  await appendHistory(supabase, {
    packId: id,
    changedBy: user.id,
    changeType: 'pack.updated',
    oldValue: before,
    newValue: updated,
  });

  return NextResponse.json(updated);
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { id } = await params;

  const { data: before } = await supabase
    .from('rider_packs')
    .select('*')
    .eq('id', id)
    .maybeSingle();
  if (!before) {
    return NextResponse.json({ error: 'Pack not found' }, { status: 404 });
  }

  // History row first (FK has ON DELETE CASCADE; we want the snapshot to survive).
  // NB: cascade WILL delete history rows for this pack. This is the tradeoff we
  // accepted in the design — history is 90-day rolling, not forever. If a pack
  // is deleted, its audit goes with it.
  const { error } = await supabase.from('rider_packs').delete().eq('id', id);
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  return NextResponse.json({ ok: true });
}
```

### Acceptance

```bash
grep -n "export async function \(GET\|PATCH\|DELETE\)" "src/app/api/rider-packs/[id]/route.ts"
grep -n "ALLOWED_PATCH_FIELDS" "src/app/api/rider-packs/[id]/route.ts"
```

Expected: 3 export lines, 1 `ALLOWED_PATCH_FIELDS` line.

---

## Step 6 — `GET /api/rider-packs/[id]/resolved`

Create `src/app/api/rider-packs/[id]/resolved/route.ts`.

```ts
/* ============================================
   LOWPASS — Rider/Pack resolved view

   GET /api/rider-packs/[id]/resolved
     Returns { pack, sections } where sections are merged
     across the scope chain (show > tour > artist) with
     inheritance metadata on each.
   ============================================ */

import { NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase-server';
import { resolvePack } from '@/lib/rider-packs/resolve';

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { id } = await params;

  const { data: pack, error } = await supabase
    .from('rider_packs')
    .select('*')
    .eq('id', id)
    .maybeSingle();
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  if (!pack) {
    return NextResponse.json({ error: 'Pack not found' }, { status: 404 });
  }

  try {
    const resolved = await resolvePack(supabase, pack);
    return NextResponse.json(resolved);
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'resolve failed';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
```

### Acceptance

```bash
grep -n "resolvePack\|export async function GET" "src/app/api/rider-packs/[id]/resolved/route.ts"
```

Expected: 2 lines.

---

## Step 7 — `GET`/`POST /api/rider-packs/[id]/sections`

Create `src/app/api/rider-packs/[id]/sections/route.ts`.

```ts
/* ============================================
   LOWPASS — Rider sections collection

   GET  /api/rider-packs/[id]/sections    raw (not resolved)
   POST /api/rider-packs/[id]/sections    body: { section_key, title,
                                                  sort_order?, fields? }
   ============================================ */

import { NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase-server';
import { appendHistory } from '@/lib/rider-packs/history';

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { id } = await params;

  // RLS will return [] if the pack isn't visible; 404 the pack explicitly for clarity.
  const { data: pack } = await supabase
    .from('rider_packs')
    .select('id')
    .eq('id', id)
    .maybeSingle();
  if (!pack) {
    return NextResponse.json({ error: 'Pack not found' }, { status: 404 });
  }

  const { data, error } = await supabase
    .from('rider_sections')
    .select('*')
    .eq('pack_id', id)
    .order('sort_order');
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ sections: data ?? [] });
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { id: packId } = await params;

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const sectionKey = body.section_key as string | undefined;
  const title = body.title as string | undefined;
  const sortOrder =
    typeof body.sort_order === 'number' ? (body.sort_order as number) : 0;
  const fields = Array.isArray(body.fields) ? body.fields : [];

  if (!sectionKey || typeof sectionKey !== 'string') {
    return NextResponse.json({ error: 'section_key is required' }, { status: 400 });
  }
  if (!title || typeof title !== 'string') {
    return NextResponse.json({ error: 'title is required' }, { status: 400 });
  }

  const { data: pack } = await supabase
    .from('rider_packs')
    .select('id')
    .eq('id', packId)
    .maybeSingle();
  if (!pack) {
    return NextResponse.json({ error: 'Pack not found' }, { status: 404 });
  }

  const { data: inserted, error } = await supabase
    .from('rider_sections')
    .insert({
      pack_id: packId,
      section_key: sectionKey,
      title,
      sort_order: sortOrder,
      fields,
    })
    .select()
    .single();

  if (error) {
    const status = error.code === '23505' ? 409 : 400;
    return NextResponse.json({ error: error.message }, { status });
  }

  await appendHistory(supabase, {
    packId,
    changedBy: user.id,
    changeType: 'section.added',
    sectionKey: sectionKey,
    newValue: inserted,
  });

  return NextResponse.json(inserted, { status: 201 });
}
```

### Acceptance

```bash
grep -n "export async function \(GET\|POST\)" "src/app/api/rider-packs/[id]/sections/route.ts"
grep -n "appendHistory" "src/app/api/rider-packs/[id]/sections/route.ts"
```

Expected: 2 export lines, 1 `appendHistory` call line.

---

## Step 8 — `PATCH`/`DELETE /api/rider-packs/[id]/sections/[sectionId]`

Create `src/app/api/rider-packs/[id]/sections/[sectionId]/route.ts`.

```ts
/* ============================================
   LOWPASS — Rider section single row

   PATCH  /api/rider-packs/[id]/sections/[sectionId]
   DELETE /api/rider-packs/[id]/sections/[sectionId]
   ============================================ */

import { NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase-server';
import { appendHistory } from '@/lib/rider-packs/history';

const ALLOWED_SECTION_FIELDS = new Set<string>([
  'title',
  'sort_order',
  'fields',
  'section_key', // allow rename (e.g. user renames 'technical' -> 'technical_audio')
]);

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string; sectionId: string }> },
) {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { id: packId, sectionId } = await params;

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const updates: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(body ?? {})) {
    if (ALLOWED_SECTION_FIELDS.has(k)) updates[k] = v;
  }
  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: 'No updatable fields in body' }, { status: 400 });
  }

  const { data: before } = await supabase
    .from('rider_sections')
    .select('*')
    .eq('id', sectionId)
    .eq('pack_id', packId)
    .maybeSingle();
  if (!before) {
    return NextResponse.json({ error: 'Section not found' }, { status: 404 });
  }

  const { data: updated, error } = await supabase
    .from('rider_sections')
    .update(updates)
    .eq('id', sectionId)
    .eq('pack_id', packId)
    .select()
    .single();

  if (error) {
    const status = error.code === '23505' ? 409 : 400;
    return NextResponse.json({ error: error.message }, { status });
  }

  await appendHistory(supabase, {
    packId,
    changedBy: user.id,
    changeType: 'section.updated',
    sectionKey: updated.section_key,
    oldValue: before,
    newValue: updated,
  });

  return NextResponse.json(updated);
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string; sectionId: string }> },
) {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { id: packId, sectionId } = await params;

  const { data: before } = await supabase
    .from('rider_sections')
    .select('*')
    .eq('id', sectionId)
    .eq('pack_id', packId)
    .maybeSingle();
  if (!before) {
    return NextResponse.json({ error: 'Section not found' }, { status: 404 });
  }

  const { error } = await supabase
    .from('rider_sections')
    .delete()
    .eq('id', sectionId)
    .eq('pack_id', packId);
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  await appendHistory(supabase, {
    packId,
    changedBy: user.id,
    changeType: 'section.removed',
    sectionKey: before.section_key,
    oldValue: before,
  });

  return NextResponse.json({ ok: true });
}
```

### Acceptance

```bash
grep -n "export async function \(PATCH\|DELETE\)" "src/app/api/rider-packs/[id]/sections/[sectionId]/route.ts"
grep -n "ALLOWED_SECTION_FIELDS\|appendHistory" "src/app/api/rider-packs/[id]/sections/[sectionId]/route.ts"
```

Expected: 2 export lines; 3 lines (1 allowlist + 2 appendHistory).

---

## Step 9 — `GET /api/rider-packs/[id]/history`

Create `src/app/api/rider-packs/[id]/history/route.ts`.

```ts
/* ============================================
   LOWPASS — Rider/Pack audit history

   GET /api/rider-packs/[id]/history?limit=50&before=<iso>
     Paginated, most-recent-first.
   ============================================ */

import { NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase-server';

const MAX_LIMIT = 200;

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { id } = await params;
  const { searchParams } = new URL(request.url);

  const limitParam = searchParams.get('limit');
  const before = searchParams.get('before');

  let limit = Number(limitParam ?? 50);
  if (!Number.isFinite(limit) || limit <= 0) limit = 50;
  if (limit > MAX_LIMIT) limit = MAX_LIMIT;

  let query = supabase
    .from('rider_pack_history')
    .select('*')
    .eq('pack_id', id)
    .order('changed_at', { ascending: false })
    .limit(limit);

  if (before) {
    query = query.lt('changed_at', before);
  }

  const { data, error } = await query;
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ history: data ?? [], limit });
}
```

### Acceptance

```bash
grep -n "export async function GET\|MAX_LIMIT" "src/app/api/rider-packs/[id]/history/route.ts"
```

Expected: 2 lines.

---

## Step 10 — Final verification

```bash
# 1. TypeScript clean
npx tsc --noEmit 2>&1 | tail -20

# 2. Lint — only files this PR touched
npx eslint \
  "src/lib/rider-packs/**/*.ts" \
  "src/app/api/rider-packs/**/*.ts" \
  2>&1 | tail -30

# 3. Only the expected files changed
git status --short src/

# 4. Count: exactly 9 new files under src/
git status --short src/ | grep -E "^\?\? (src/lib/rider-packs/|src/app/api/rider-packs/)" | wc -l
```

### Expected

- `tsc`: clean. If it's not, fix the error ONLY if it's in a file this PR created. If it's pre-existing elsewhere, note it and move on.
- `eslint`: clean on the 9 new files (or pre-existing warnings only).
- `git status --short src/`: only the 9 new files listed.
- Count: `9`.

If count is not 9 or any unexpected file shows up, STOP. Revert anything not in the file list above. Report.

---

## Step 11 — Commit + push

```bash
git add \
  src/lib/rider-packs/ \
  "src/app/api/rider-packs/"

git commit -m "feat(rider-pack): API layer — packs, sections, resolver, history

R2 of Rider/Pack Builder (see RIDER_PACK_DESIGN.md).

Endpoints:
- GET/POST  /api/rider-packs
- GET/PATCH/DELETE  /api/rider-packs/[id]
- GET  /api/rider-packs/[id]/resolved  (show > tour > artist merge)
- GET/POST  /api/rider-packs/[id]/sections
- PATCH/DELETE  /api/rider-packs/[id]/sections/[sectionId]
- GET  /api/rider-packs/[id]/history

Shared lib:
- src/lib/rider-packs/types.ts  (discriminated Field union,
  RiderPack/Section/ResolvedSection, HISTORY_CHANGE_TYPES)
- src/lib/rider-packs/resolve.ts  (scope-chain walker)
- src/lib/rider-packs/history.ts  (best-effort append helper)

No UI, no asset upload, no contact picker, no Google Doc export yet.
Those are R2b/R2c/R3/R5."

git push
```

---

## Step 12 — Report

Paste:

1. Step 0 pre-flight output (A–D).
2. Step 10 tsc, eslint, git status, count.
3. List of 9 created files.
4. Final commit SHA.
5. Anything you stopped on (ideally nothing).

---

## Out of scope for this PR

- UI (R3).
- Asset upload / list / delete (R2b).
- Contact picker endpoint (R2c).
- Bulk section reorder (do individual PATCHes to `sort_order` for v1).
- Google Doc export (R5).
- Web link generation (R4).
- Seeding the 14 default sections on pack creation (handled client-side by R3).
- Any migrations.
- Any existing file edits.
