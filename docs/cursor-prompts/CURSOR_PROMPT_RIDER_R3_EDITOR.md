# Cursor Prompt — Rider/Pack R3: Editor UI (+ R2c contact picker)

Fourth build PR. Prior landed: R1 (`1210645`), R2 (`f1f1e63`), R2b (`b5369c1`). Migration 034 is applied.

R3 ships the editor UI. R2c — a single GET endpoint for the contact picker — is rolled into this PR because it's one small file and R3's Contact field uses it.

**See `RIDER_PACK_DESIGN.md` for full design context. You don't need to re-read it.**

---

## Files this PR creates (exact list, 6 files)

1. `src/app/api/contacts/pick/route.ts` — R2c contact picker endpoint
2. `src/lib/rider-packs/client.ts` — typed fetch helpers for all rider-pack endpoints
3. `src/components/rider-pack/FieldEditors.tsx` — dispatcher + per-type inline editors (all 8 types)
4. `src/components/rider-pack/PackEditor.tsx` — three-pane editor shell (client component)
5. `src/app/(app)/rider-packs/page.tsx` — pack index (list + "new artist pack")
6. `src/app/(app)/rider-packs/[id]/page.tsx` — pack editor route (server component wrapping `<PackEditor>`)

---

## Hard rules

1. Do not create or modify any file not listed above.
2. Do not modify existing `src/` files. (If you think one needs a fix, stop and report — don't silently edit.)
3. Do not touch migrations.
4. Do not add new npm dependencies. Use only what's already installed.
5. Use Tailwind utility classes for styling. Match the style tone of existing components (quiet, flat, minimal — see `src/components/layout/AppTopBar.tsx` for reference if you need one).
6. All data-fetching goes through `src/lib/rider-packs/client.ts`. No raw fetches in component code.
7. If anything is ambiguous, stop and report.

---

## Step 0 — Pre-flight

```bash
# A. Previous PRs merged
git log --oneline -5 | head -5

# B. None of these files exist
ls src/app/api/contacts/pick/ 2>&1
ls src/lib/rider-packs/client.ts 2>&1
ls src/components/rider-pack/ 2>&1
ls "src/app/(app)/rider-packs/" 2>&1

# C. Confirm contact-related table columns before we query them.
#    Personnel + assignments shape:
grep -n "CREATE TABLE.*personnel\b\|CREATE TABLE.*personnel_tour_assignments" \
  database/migrations/001_initial_schema.sql
grep -n "personnel_tour_assignments\|roster_personnel_id" \
  database/migrations/025_personnel_roster_link.sql 2>/dev/null || true

#    Contacts shape:
grep -n "CREATE TABLE.*contacts\b" database/migrations/014_contacts.sql

# D. Existing types still valid
grep -n "export type Field\b\|FieldContact\|ResolvedPack" src/lib/rider-packs/types.ts

# E. Existing route pattern to match
grep -n "createServerSupabaseClient\|auth.getUser" \
  "src/app/api/rider-packs/route.ts" | head -4
```

### Acceptance

- A: shows `b5369c1` (R2b), `f1f1e63` (R2), `1210645` (R1) at or near the top.
- B: all four `ls` prints are "No such file or directory".
- C: prints column definitions for `personnel`, `personnel_tour_assignments`, and `contacts`. Note the exact column names — you'll use them in Step 1. If `personnel` doesn't have expected columns like `name`/`email`/`phone`, stop and report the actual column set.
- D: prints 3+ lines.
- E: prints import + auth call lines.

---

## Step 1 — R2c contact picker endpoint

Create `src/app/api/contacts/pick/route.ts`:

```ts
/* ============================================
   LOWPASS — Contact picker

   GET /api/contacts/pick?tour_id=<uuid>&q=<string>&limit=<int>

   Returns:
     {
       tour_personnel: [{ source, id, name, role, email, phone, ... }],
       contacts:       [{ source, id, name, role, email, phone, ... }]
     }

   Used by the rider-pack Contact field picker (design §7).
   tour_personnel is included only when tour_id is present.
   ============================================ */

import { NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase-server';

const MAX_LIMIT = 50;

export async function GET(request: Request) {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const tourId = searchParams.get('tour_id');
  const q = (searchParams.get('q') ?? '').trim();
  let limit = Number(searchParams.get('limit') ?? 20);
  if (!Number.isFinite(limit) || limit <= 0) limit = 20;
  if (limit > MAX_LIMIT) limit = MAX_LIMIT;

  // Workspace check
  const { data: profile } = await supabase
    .from('profiles')
    .select('workspace_id')
    .eq('id', user.id)
    .single();
  if (!profile?.workspace_id) {
    return NextResponse.json({ error: 'No workspace' }, { status: 403 });
  }

  // --- tour_personnel (only when tour_id given) ---
  let tourPersonnel: Array<{
    source: 'tour_personnel';
    id: string;
    name: string;
    role: string | null;
    email: string | null;
    phone: string | null;
    company: string | null;
    notes: string | null;
  }> = [];

  if (tourId) {
    // Verify the tour belongs to this workspace.
    const { data: tour } = await supabase
      .from('tours')
      .select('id')
      .eq('id', tourId)
      .eq('workspace_id', profile.workspace_id)
      .maybeSingle();

    if (tour) {
      // personnel_tour_assignments joined to personnel.
      // Column names confirmed in Step 0 — if personnel has different
      // column names, stop and report instead of guessing.
      const { data: rows } = await supabase
        .from('personnel_tour_assignments')
        .select(`
          id,
          role_on_tour,
          personnel:personnel_id (
            id, name, email, phone
          )
        `)
        .eq('tour_id', tourId)
        .limit(limit);

      tourPersonnel = (rows ?? [])
        .map((r: any) => {
          const p = r.personnel ?? {};
          return {
            source: 'tour_personnel' as const,
            id: r.id,
            name: p.name ?? '',
            role: r.role_on_tour ?? null,
            email: p.email ?? null,
            phone: p.phone ?? null,
            company: null,
            notes: null,
          };
        })
        .filter((p) => !q || matchesQuery(p, q));
    }
  }

  // --- contacts ---
  let contactsQuery = supabase
    .from('contacts')
    .select('id, first_name, last_name, role, email, phone, venue_name, notes')
    .eq('workspace_id', profile.workspace_id)
    .order('last_name', { ascending: true })
    .limit(limit);

  if (q) {
    // Supabase PostgREST OR filter: any of these columns ilike %q%
    // Keep `%` escaping simple — q arrives trimmed; we don't allow wildcards.
    const pattern = `%${q.replace(/[%_]/g, '\\$&')}%`;
    contactsQuery = contactsQuery.or(
      `first_name.ilike.${pattern},last_name.ilike.${pattern},email.ilike.${pattern},role.ilike.${pattern},venue_name.ilike.${pattern}`,
    );
  }

  const { data: contactRows, error: contactsErr } = await contactsQuery;
  if (contactsErr) {
    return NextResponse.json({ error: contactsErr.message }, { status: 500 });
  }

  const contacts = (contactRows ?? []).map((c) => ({
    source: 'contact' as const,
    id: c.id,
    name: [c.first_name ?? '', c.last_name ?? ''].filter(Boolean).join(' ').trim(),
    role: c.role ?? null,
    email: c.email ?? null,
    phone: c.phone ?? null,
    company: c.venue_name ?? null,
    notes: c.notes ?? null,
  }));

  return NextResponse.json({ tour_personnel: tourPersonnel, contacts });
}

function matchesQuery(
  p: { name?: string; role?: string | null; email?: string | null },
  q: string,
): boolean {
  const needle = q.toLowerCase();
  return (
    (p.name ?? '').toLowerCase().includes(needle) ||
    (p.role ?? '').toLowerCase().includes(needle) ||
    (p.email ?? '').toLowerCase().includes(needle)
  );
}
```

### Acceptance

```bash
grep -n "export async function GET\|personnel_tour_assignments\|workspace_id" \
  src/app/api/contacts/pick/route.ts | head -6
```

Expected: lines for GET, personnel_tour_assignments, workspace_id.

**If Step 0 showed the `personnel` table uses different column names than `name`/`email`/`phone`, stop and report.** Don't invent columns.

---

## Step 2 — Typed fetch client

Create `src/lib/rider-packs/client.ts`:

```ts
/* ============================================
   LOWPASS — Rider/Pack client

   Typed fetch helpers for everything under /api/rider-packs,
   /api/rider-assets, and /api/contacts/pick.

   All helpers are thin wrappers around fetch. They throw an
   Error (message = server's error string) on non-2xx so
   components can do try/catch without re-parsing JSON.
   ============================================ */

import type {
  PackScope,
  ResolvedPack,
  RiderPack,
  RiderPackHistoryRow,
  RiderSection,
} from './types';

// --- low-level ---------------------------------------------------------------

async function asJson<T>(res: Response): Promise<T> {
  if (!res.ok) {
    let msg = `HTTP ${res.status}`;
    try {
      const j = await res.json();
      if (j?.error) msg = String(j.error);
    } catch { /* ignore */ }
    throw new Error(msg);
  }
  return res.json() as Promise<T>;
}

// --- packs -------------------------------------------------------------------

export async function listPacks(params: {
  scope?: PackScope;
  artistId?: string;
  tourId?: string;
  routingId?: string;
}): Promise<RiderPack[]> {
  const q = new URLSearchParams();
  if (params.scope) q.set('scope', params.scope);
  if (params.artistId) q.set('artist_id', params.artistId);
  if (params.tourId) q.set('tour_id', params.tourId);
  if (params.routingId) q.set('routing_id', params.routingId);
  const res = await fetch(`/api/rider-packs?${q.toString()}`);
  const { packs } = await asJson<{ packs: RiderPack[] }>(res);
  return packs;
}

export async function createPack(body: {
  scope: PackScope;
  artist_id: string;
  tour_id?: string | null;
  routing_id?: string | null;
  title?: string | null;
}): Promise<RiderPack> {
  const res = await fetch('/api/rider-packs', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  return asJson<RiderPack>(res);
}

export async function getPackRaw(id: string): Promise<{
  pack: RiderPack;
  sections: RiderSection[];
}> {
  const res = await fetch(`/api/rider-packs/${id}`);
  return asJson(res);
}

export async function getPackResolved(id: string): Promise<ResolvedPack> {
  const res = await fetch(`/api/rider-packs/${id}/resolved`);
  return asJson(res);
}

export async function updatePack(
  id: string,
  body: Partial<Pick<RiderPack, 'title' | 'google_doc_id' | 'google_doc_url'>>,
): Promise<RiderPack> {
  const res = await fetch(`/api/rider-packs/${id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  return asJson(res);
}

export async function deletePack(id: string): Promise<void> {
  const res = await fetch(`/api/rider-packs/${id}`, { method: 'DELETE' });
  await asJson(res);
}

// --- sections ---------------------------------------------------------------

export async function createSection(
  packId: string,
  body: { section_key: string; title: string; sort_order?: number; fields?: unknown[] },
): Promise<RiderSection> {
  const res = await fetch(`/api/rider-packs/${packId}/sections`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  return asJson(res);
}

export async function updateSection(
  packId: string,
  sectionId: string,
  body: Partial<Pick<RiderSection, 'title' | 'sort_order' | 'fields' | 'section_key'>>,
): Promise<RiderSection> {
  const res = await fetch(`/api/rider-packs/${packId}/sections/${sectionId}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  return asJson(res);
}

export async function deleteSection(packId: string, sectionId: string): Promise<void> {
  const res = await fetch(`/api/rider-packs/${packId}/sections/${sectionId}`, {
    method: 'DELETE',
  });
  await asJson(res);
}

// --- history ---------------------------------------------------------------

export async function listHistory(
  packId: string,
  params?: { limit?: number; before?: string },
): Promise<RiderPackHistoryRow[]> {
  const q = new URLSearchParams();
  if (params?.limit) q.set('limit', String(params.limit));
  if (params?.before) q.set('before', params.before);
  const res = await fetch(`/api/rider-packs/${packId}/history?${q.toString()}`);
  const { history } = await asJson<{ history: RiderPackHistoryRow[] }>(res);
  return history;
}

// --- contact picker --------------------------------------------------------

export type PickedContact = {
  source: 'tour_personnel' | 'contact' | 'external';
  id?: string;
  name: string;
  role: string | null;
  email: string | null;
  phone: string | null;
  company: string | null;
  notes: string | null;
};

export async function pickContacts(params: {
  tourId?: string;
  q?: string;
  limit?: number;
}): Promise<{ tour_personnel: PickedContact[]; contacts: PickedContact[] }> {
  const sp = new URLSearchParams();
  if (params.tourId) sp.set('tour_id', params.tourId);
  if (params.q) sp.set('q', params.q);
  if (params.limit) sp.set('limit', String(params.limit));
  const res = await fetch(`/api/contacts/pick?${sp.toString()}`);
  return asJson(res);
}

// --- assets (read-only from the client for R3) -----------------------------

export type RiderAsset = {
  id: string;
  workspace_id: string;
  scope: PackScope;
  artist_id: string;
  tour_id: string | null;
  routing_id: string | null;
  asset_type: 'image' | 'file' | 'url';
  label: string;
  storage_path: string | null;
  external_url: string | null;
  meta: Record<string, unknown>;
  created_at: string;
  updated_at: string;
};

export async function listAssets(params: {
  artistId?: string;
  scope?: PackScope;
  tourId?: string;
  routingId?: string;
}): Promise<{ assets: RiderAsset[]; signedUrls: Record<string, string | null> }> {
  const q = new URLSearchParams();
  if (params.artistId) q.set('artist_id', params.artistId);
  if (params.scope) q.set('scope', params.scope);
  if (params.tourId) q.set('tour_id', params.tourId);
  if (params.routingId) q.set('routing_id', params.routingId);
  const res = await fetch(`/api/rider-assets?${q.toString()}`);
  return asJson(res);
}
```

### Acceptance

```bash
grep -n "export async function " src/lib/rider-packs/client.ts | wc -l
# Expected: 12 (listPacks, createPack, getPackRaw, getPackResolved, updatePack,
#              deletePack, createSection, updateSection, deleteSection,
#              listHistory, pickContacts, listAssets)
```

Expected: `12`.

---

## Step 3 — Field editors

Create `src/components/rider-pack/FieldEditors.tsx`. This file contains the dispatcher + one inline editor per field type. Contact uses the picker; Asset renders a placeholder (picker is part of R3b — a later polish PR).

```tsx
'use client';

/* ============================================
   LOWPASS — Field editors for the rider/pack editor

   Exports <FieldEditor> which dispatches on field.type.
   All editors are controlled: they call `onChange(nextField)`
   on every keystroke. Parent is responsible for persisting
   on blur / explicit save.

   Asset field renders a placeholder — a full asset picker UI
   is coming in R3b (it consumes the R2b API already shipped).
   Contact field uses the R2c /api/contacts/pick endpoint.
   ============================================ */

import { useEffect, useMemo, useState } from 'react';
import type {
  Field,
  FieldText,
  FieldTable,
  FieldContact,
  FieldAsset,
  FieldTime,
  FieldCurrency,
  FieldNumber,
  FieldCheckboxList,
  FieldUrl,
} from '@/lib/rider-packs/types';
import { pickContacts, type PickedContact } from '@/lib/rider-packs/client';

type FieldEditorProps<F extends Field = Field> = {
  field: F;
  onChange: (next: F) => void;
  onRemove?: () => void;
  /** Tour id for the containing pack, if any. Contact picker uses it. */
  tourId?: string | null;
};

export function FieldEditor({ field, onChange, onRemove, tourId }: FieldEditorProps) {
  return (
    <div className="rounded-md border border-neutral-200 bg-white p-3 space-y-2">
      <div className="flex items-center justify-between gap-2">
        <LabelInput field={field} onChange={onChange} />
        {onRemove && (
          <button
            type="button"
            onClick={onRemove}
            className="text-xs text-neutral-500 hover:text-red-600"
          >
            Remove
          </button>
        )}
      </div>
      <Dispatcher field={field} onChange={onChange} tourId={tourId ?? null} />
    </div>
  );
}

function LabelInput({ field, onChange }: { field: Field; onChange: (n: Field) => void }) {
  return (
    <input
      type="text"
      value={field.label ?? ''}
      onChange={(e) => onChange({ ...field, label: e.target.value })}
      placeholder="Field label"
      className="flex-1 text-sm font-medium bg-transparent outline-none border-b border-transparent focus:border-neutral-300"
    />
  );
}

function Dispatcher({
  field,
  onChange,
  tourId,
}: {
  field: Field;
  onChange: (n: Field) => void;
  tourId: string | null;
}) {
  switch (field.type) {
    case 'text':
      return <TextEditor field={field} onChange={onChange as (n: FieldText) => void} />;
    case 'table':
      return <TableEditor field={field} onChange={onChange as (n: FieldTable) => void} />;
    case 'contact':
      return (
        <ContactEditor
          field={field}
          onChange={onChange as (n: FieldContact) => void}
          tourId={tourId}
        />
      );
    case 'asset':
      return <AssetEditor field={field} onChange={onChange as (n: FieldAsset) => void} />;
    case 'time':
      return <TimeEditor field={field} onChange={onChange as (n: FieldTime) => void} />;
    case 'currency':
      return <CurrencyEditor field={field} onChange={onChange as (n: FieldCurrency) => void} />;
    case 'number':
      return <NumberEditor field={field} onChange={onChange as (n: FieldNumber) => void} />;
    case 'checkbox_list':
      return (
        <CheckboxListEditor
          field={field}
          onChange={onChange as (n: FieldCheckboxList) => void}
        />
      );
    case 'url':
      return <UrlEditor field={field} onChange={onChange as (n: FieldUrl) => void} />;
    default:
      return <div className="text-xs text-neutral-500">Unknown field type.</div>;
  }
}

// ----- Per-type editors -----

function TextEditor({ field, onChange }: { field: FieldText; onChange: (n: FieldText) => void }) {
  return (
    <textarea
      value={field.value ?? ''}
      onChange={(e) => onChange({ ...field, value: e.target.value })}
      placeholder="Text..."
      className="w-full min-h-[80px] rounded border border-neutral-200 p-2 text-sm outline-none focus:border-neutral-400"
    />
  );
}

function TimeEditor({ field, onChange }: { field: FieldTime; onChange: (n: FieldTime) => void }) {
  return (
    <div className="flex items-center gap-2">
      <input
        type="time"
        value={field.value ?? ''}
        onChange={(e) => onChange({ ...field, value: e.target.value })}
        className="rounded border border-neutral-200 px-2 py-1 text-sm"
      />
      <input
        type="text"
        value={field.tz ?? ''}
        onChange={(e) => onChange({ ...field, tz: e.target.value })}
        placeholder="Timezone (optional)"
        className="flex-1 rounded border border-neutral-200 px-2 py-1 text-sm"
      />
    </div>
  );
}

function CurrencyEditor({
  field,
  onChange,
}: {
  field: FieldCurrency;
  onChange: (n: FieldCurrency) => void;
}) {
  return (
    <div className="flex items-center gap-2">
      <input
        type="number"
        value={Number.isFinite(field.amount) ? field.amount : 0}
        onChange={(e) => onChange({ ...field, amount: Number(e.target.value) || 0 })}
        step="0.01"
        className="flex-1 rounded border border-neutral-200 px-2 py-1 text-sm"
      />
      <input
        type="text"
        value={field.currency ?? 'USD'}
        onChange={(e) => onChange({ ...field, currency: e.target.value.toUpperCase() })}
        maxLength={3}
        className="w-16 rounded border border-neutral-200 px-2 py-1 text-sm uppercase"
      />
    </div>
  );
}

function NumberEditor({
  field,
  onChange,
}: {
  field: FieldNumber;
  onChange: (n: FieldNumber) => void;
}) {
  return (
    <div className="flex items-center gap-2">
      <input
        type="number"
        value={Number.isFinite(field.value) ? field.value : 0}
        onChange={(e) => onChange({ ...field, value: Number(e.target.value) || 0 })}
        className="flex-1 rounded border border-neutral-200 px-2 py-1 text-sm"
      />
      <input
        type="text"
        value={field.unit ?? ''}
        onChange={(e) => onChange({ ...field, unit: e.target.value })}
        placeholder="unit"
        className="w-24 rounded border border-neutral-200 px-2 py-1 text-sm"
      />
    </div>
  );
}

function UrlEditor({ field, onChange }: { field: FieldUrl; onChange: (n: FieldUrl) => void }) {
  return (
    <div className="space-y-2">
      <input
        type="url"
        value={field.href ?? ''}
        onChange={(e) => onChange({ ...field, href: e.target.value })}
        placeholder="https://..."
        className="w-full rounded border border-neutral-200 px-2 py-1 text-sm"
      />
      <input
        type="text"
        value={field.display_text ?? ''}
        onChange={(e) => onChange({ ...field, display_text: e.target.value })}
        placeholder="Link text (optional)"
        className="w-full rounded border border-neutral-200 px-2 py-1 text-sm"
      />
    </div>
  );
}

function TableEditor({ field, onChange }: { field: FieldTable; onChange: (n: FieldTable) => void }) {
  const columns = field.columns ?? [];
  const rows = field.rows ?? [];

  const setColumns = (next: typeof columns) => onChange({ ...field, columns: next });
  const setRows = (next: typeof rows) => onChange({ ...field, rows: next });

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-2 text-xs text-neutral-500">
        <span>Columns:</span>
        {columns.map((c, i) => (
          <span key={i} className="inline-flex items-center gap-1 rounded bg-neutral-100 px-2 py-0.5">
            <input
              value={c.label}
              onChange={(e) => {
                const next = [...columns];
                next[i] = { ...c, label: e.target.value };
                setColumns(next);
              }}
              className="bg-transparent outline-none w-24"
            />
            <button
              type="button"
              className="text-neutral-400 hover:text-red-600"
              onClick={() => {
                const next = columns.filter((_, j) => j !== i);
                setColumns(next);
                setRows(rows.map((r) => {
                  const { [c.key]: _omit, ...rest } = r;
                  return rest;
                }));
              }}
            >
              ×
            </button>
          </span>
        ))}
        <button
          type="button"
          onClick={() => {
            const key = `col_${Date.now().toString(36)}`;
            setColumns([...columns, { key, label: 'New column' }]);
          }}
          className="rounded bg-neutral-200 px-2 py-0.5 hover:bg-neutral-300"
        >
          + column
        </button>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr>
              {columns.map((c) => (
                <th key={c.key} className="px-2 py-1 text-left font-medium text-neutral-600">
                  {c.label}
                </th>
              ))}
              <th />
            </tr>
          </thead>
          <tbody>
            {rows.map((row, rowIdx) => (
              <tr key={rowIdx}>
                {columns.map((c) => (
                  <td key={c.key} className="border-t border-neutral-100 px-1 py-1">
                    <input
                      value={row[c.key] ?? ''}
                      onChange={(e) => {
                        const next = [...rows];
                        next[rowIdx] = { ...row, [c.key]: e.target.value };
                        setRows(next);
                      }}
                      className="w-full rounded border border-transparent px-1 py-0.5 text-sm outline-none focus:border-neutral-300"
                    />
                  </td>
                ))}
                <td className="border-t border-neutral-100 px-1 py-1 text-right">
                  <button
                    type="button"
                    onClick={() => setRows(rows.filter((_, j) => j !== rowIdx))}
                    className="text-xs text-neutral-400 hover:text-red-600"
                  >
                    ×
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <button
        type="button"
        onClick={() => setRows([...rows, Object.fromEntries(columns.map((c) => [c.key, '']))])}
        className="rounded bg-neutral-200 px-2 py-0.5 text-xs hover:bg-neutral-300"
      >
        + row
      </button>
    </div>
  );
}

function CheckboxListEditor({
  field,
  onChange,
}: {
  field: FieldCheckboxList;
  onChange: (n: FieldCheckboxList) => void;
}) {
  const items = field.items ?? [];
  return (
    <div className="space-y-1">
      {items.map((item, i) => (
        <div key={item.key} className="flex items-center gap-2">
          <input
            type="checkbox"
            checked={item.checked}
            onChange={(e) => {
              const next = [...items];
              next[i] = { ...item, checked: e.target.checked };
              onChange({ ...field, items: next });
            }}
          />
          <input
            type="text"
            value={item.label}
            onChange={(e) => {
              const next = [...items];
              next[i] = { ...item, label: e.target.value };
              onChange({ ...field, items: next });
            }}
            className="flex-1 rounded border border-neutral-200 px-2 py-1 text-sm"
          />
          <button
            type="button"
            onClick={() => onChange({ ...field, items: items.filter((_, j) => j !== i) })}
            className="text-xs text-neutral-400 hover:text-red-600"
          >
            ×
          </button>
        </div>
      ))}
      <button
        type="button"
        onClick={() =>
          onChange({
            ...field,
            items: [
              ...items,
              { key: `item_${Date.now().toString(36)}`, label: 'New item', checked: false },
            ],
          })
        }
        className="rounded bg-neutral-200 px-2 py-0.5 text-xs hover:bg-neutral-300"
      >
        + item
      </button>
    </div>
  );
}

function AssetEditor({ field, onChange }: { field: FieldAsset; onChange: (n: FieldAsset) => void }) {
  // R3 stub: raw id input. R3b ships the real asset picker.
  return (
    <div className="space-y-1">
      <input
        type="text"
        value={field.asset_id ?? ''}
        onChange={(e) => onChange({ ...field, asset_id: e.target.value })}
        placeholder="Asset ID (picker coming in R3b)"
        className="w-full rounded border border-neutral-200 px-2 py-1 text-sm font-mono"
      />
      <p className="text-xs text-neutral-500">
        Asset picker UI is a later PR. For now, paste an asset id from /api/rider-assets.
      </p>
    </div>
  );
}

function ContactEditor({
  field,
  onChange,
  tourId,
}: {
  field: FieldContact;
  onChange: (n: FieldContact) => void;
  tourId: string | null;
}) {
  const [q, setQ] = useState('');
  const [picker, setPicker] = useState<{
    tour_personnel: PickedContact[];
    contacts: PickedContact[];
  } | null>(null);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    const t = setTimeout(async () => {
      try {
        const result = await pickContacts({ tourId: tourId ?? undefined, q, limit: 20 });
        if (!cancelled) setPicker(result);
      } catch {
        /* ignore — show empty */
      }
    }, 200);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [open, q, tourId]);

  const entries = field.entries ?? [];

  const addEntry = (c: PickedContact) => {
    const next: FieldContact['entries'][number] = {
      source: c.source,
      ref_id: c.id,
      name: c.name,
      role: c.role ?? undefined,
      email: c.email ?? undefined,
      phone: c.phone ?? undefined,
      company: c.company ?? undefined,
      notes: c.notes ?? undefined,
      show_fields: ['name', 'role', 'email', 'phone'],
    };
    onChange({ ...field, entries: [...entries, next] });
    setOpen(false);
    setQ('');
  };

  const addExternal = () => {
    onChange({
      ...field,
      entries: [
        ...entries,
        {
          source: 'external',
          name: '',
          role: '',
          email: '',
          phone: '',
          show_fields: ['name', 'role', 'email', 'phone'],
        },
      ],
    });
  };

  return (
    <div className="space-y-2">
      {entries.map((entry, i) => (
        <div
          key={i}
          className="rounded border border-neutral-200 p-2 text-sm space-y-1 bg-neutral-50"
        >
          <div className="flex items-center justify-between gap-2">
            <span className="text-xs text-neutral-500">
              {entry.source === 'tour_personnel' && 'On tour'}
              {entry.source === 'contact' && 'Contact'}
              {entry.source === 'external' && 'External'}
            </span>
            <button
              type="button"
              className="text-xs text-neutral-400 hover:text-red-600"
              onClick={() => onChange({ ...field, entries: entries.filter((_, j) => j !== i) })}
            >
              Remove
            </button>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <input
              type="text"
              value={entry.name ?? ''}
              onChange={(e) => {
                const next = [...entries];
                next[i] = { ...entry, name: e.target.value };
                onChange({ ...field, entries: next });
              }}
              placeholder="Name"
              className="rounded border border-neutral-200 px-2 py-1 text-sm"
            />
            <input
              type="text"
              value={entry.role ?? ''}
              onChange={(e) => {
                const next = [...entries];
                next[i] = { ...entry, role: e.target.value };
                onChange({ ...field, entries: next });
              }}
              placeholder="Role"
              className="rounded border border-neutral-200 px-2 py-1 text-sm"
            />
            <input
              type="email"
              value={entry.email ?? ''}
              onChange={(e) => {
                const next = [...entries];
                next[i] = { ...entry, email: e.target.value };
                onChange({ ...field, entries: next });
              }}
              placeholder="Email"
              className="rounded border border-neutral-200 px-2 py-1 text-sm"
            />
            <input
              type="tel"
              value={entry.phone ?? ''}
              onChange={(e) => {
                const next = [...entries];
                next[i] = { ...entry, phone: e.target.value };
                onChange({ ...field, entries: next });
              }}
              placeholder="Phone"
              className="rounded border border-neutral-200 px-2 py-1 text-sm"
            />
          </div>
        </div>
      ))}

      {open ? (
        <div className="rounded border border-neutral-200 p-2 space-y-2 bg-white">
          <input
            type="text"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search tour personnel & contacts..."
            className="w-full rounded border border-neutral-200 px-2 py-1 text-sm"
            autoFocus
          />
          <div className="max-h-48 overflow-y-auto space-y-1">
            {picker?.tour_personnel?.length ? (
              <>
                <div className="text-xs font-medium text-neutral-500 px-1">On tour</div>
                {picker.tour_personnel.map((c) => (
                  <button
                    key={c.id}
                    type="button"
                    onClick={() => addEntry(c)}
                    className="w-full text-left rounded px-2 py-1 text-sm hover:bg-neutral-100"
                  >
                    <div className="font-medium">{c.name || '(unnamed)'}</div>
                    <div className="text-xs text-neutral-500">{c.role ?? ''}</div>
                  </button>
                ))}
              </>
            ) : null}
            {picker?.contacts?.length ? (
              <>
                <div className="text-xs font-medium text-neutral-500 px-1 pt-1">Contacts</div>
                {picker.contacts.map((c) => (
                  <button
                    key={c.id}
                    type="button"
                    onClick={() => addEntry(c)}
                    className="w-full text-left rounded px-2 py-1 text-sm hover:bg-neutral-100"
                  >
                    <div className="font-medium">{c.name || '(unnamed)'}</div>
                    <div className="text-xs text-neutral-500">
                      {c.role ?? ''}
                      {c.company ? ` — ${c.company}` : ''}
                    </div>
                  </button>
                ))}
              </>
            ) : null}
            {!picker?.tour_personnel?.length && !picker?.contacts?.length && (
              <div className="text-xs text-neutral-500 px-1 py-2">No matches.</div>
            )}
          </div>
          <div className="flex items-center justify-between">
            <button type="button" onClick={() => setOpen(false)} className="text-xs text-neutral-500 hover:text-neutral-900">
              Cancel
            </button>
            <button type="button" onClick={addExternal} className="text-xs text-neutral-500 hover:text-neutral-900">
              Add external...
            </button>
          </div>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="rounded bg-neutral-200 px-2 py-1 text-xs hover:bg-neutral-300"
        >
          + contact
        </button>
      )}
    </div>
  );
}

// Field type defaults — used by the "add field" dropdown in <PackEditor>.
export function makeDefaultField(type: Field['type']): Field {
  const baseKey = `f_${Date.now().toString(36)}`;
  switch (type) {
    case 'text': return { type, key: baseKey, label: 'Text', value: '' };
    case 'table': return { type, key: baseKey, label: 'Table', columns: [{ key: 'col1', label: 'Column' }], rows: [] };
    case 'contact': return { type, key: baseKey, label: 'Contacts', entries: [] };
    case 'asset': return { type, key: baseKey, label: 'Asset', asset_id: '' };
    case 'time': return { type, key: baseKey, label: 'Time', value: '' };
    case 'currency': return { type, key: baseKey, label: 'Amount', amount: 0, currency: 'USD' };
    case 'number': return { type, key: baseKey, label: 'Number', value: 0 };
    case 'checkbox_list': return { type, key: baseKey, label: 'Checklist', items: [] };
    case 'url': return { type, key: baseKey, label: 'Link', href: '' };
  }
}

export const FIELD_TYPE_LABELS: Record<Field['type'], string> = {
  text: 'Text',
  table: 'Table',
  contact: 'Contacts',
  asset: 'Asset (stub)',
  time: 'Time',
  currency: 'Currency',
  number: 'Number',
  checkbox_list: 'Checklist',
  url: 'Link',
};
```

### Acceptance

```bash
grep -n "export function FieldEditor\|export function makeDefaultField\|export const FIELD_TYPE_LABELS" \
  src/components/rider-pack/FieldEditors.tsx
```

Expected: 3 lines.

---

## Step 4 — Pack editor shell

Create `src/components/rider-pack/PackEditor.tsx`:

```tsx
'use client';

/* ============================================
   LOWPASS — Rider/Pack editor shell

   Three-pane layout:
   - Left: section list (add/remove/reorder/select)
   - Center: section editor (title + fields)
   - Right: inspector (pack metadata + inheritance badge + actions)

   Fetches the resolved view once on mount. Each section row
   carries an `inherited_from` tag:
     null       → authored at this scope (editable)
     'tour'     → inherited from tour (click to override)
     'artist'   → inherited from artist (click to override)
   ============================================ */

import { useCallback, useEffect, useMemo, useState } from 'react';
import type {
  Field,
  RiderPack,
  ResolvedPack,
  ResolvedSection,
} from '@/lib/rider-packs/types';
import {
  createSection,
  deletePack,
  deleteSection,
  getPackResolved,
  updatePack,
  updateSection,
} from '@/lib/rider-packs/client';
import {
  FIELD_TYPE_LABELS,
  FieldEditor,
  makeDefaultField,
} from './FieldEditors';

type Props = {
  packId: string;
};

export function PackEditor({ packId }: Props) {
  const [data, setData] = useState<ResolvedPack | null>(null);
  const [selected, setSelected] = useState<string | null>(null); // section_key
  const [error, setError] = useState<string | null>(null);
  const [savingSection, setSavingSection] = useState(false);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    try {
      const r = await getPackResolved(packId);
      setData(r);
      setSelected((prev) => prev ?? r.sections[0]?.section_key ?? null);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load');
    } finally {
      setLoading(false);
    }
  }, [packId]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const selectedSection = useMemo(
    () => data?.sections.find((s) => s.section_key === selected) ?? null,
    [data, selected],
  );

  // ----- Section mutations -----

  const handleAddSection = async () => {
    if (!data) return;
    const sectionKey = prompt('Section key (e.g. "hospitality"):');
    if (!sectionKey) return;
    const title = prompt('Section title:', sectionKey) ?? sectionKey;
    try {
      await createSection(packId, {
        section_key: sectionKey,
        title,
        sort_order: (data.sections[data.sections.length - 1]?.sort_order ?? 0) + 10,
        fields: [],
      });
      await refresh();
      setSelected(sectionKey);
    } catch (e) {
      alert(e instanceof Error ? e.message : 'Failed to add section');
    }
  };

  const handleRemoveSection = async (section: ResolvedSection) => {
    if (section.inherited_from) {
      alert('This section is inherited. To remove it here, override it first.');
      return;
    }
    if (!confirm(`Remove section "${section.title}"?`)) return;
    try {
      await deleteSection(packId, section.id);
      setSelected(null);
      await refresh();
    } catch (e) {
      alert(e instanceof Error ? e.message : 'Failed to remove section');
    }
  };

  const handleOverrideSection = async (section: ResolvedSection) => {
    // Create a local row at this pack's scope, copying the inherited content.
    try {
      await createSection(packId, {
        section_key: section.section_key,
        title: section.title,
        sort_order: section.sort_order,
        fields: section.fields,
      });
      await refresh();
    } catch (e) {
      alert(e instanceof Error ? e.message : 'Failed to override');
    }
  };

  const handleMoveSection = async (section: ResolvedSection, dir: -1 | 1) => {
    if (!data) return;
    if (section.inherited_from) {
      alert('This section is inherited. Override it here before reordering.');
      return;
    }
    const ownedSections = data.sections.filter((s) => !s.inherited_from);
    const idx = ownedSections.findIndex((s) => s.section_key === section.section_key);
    const swapIdx = idx + dir;
    if (idx === -1 || swapIdx < 0 || swapIdx >= ownedSections.length) return;
    const other = ownedSections[swapIdx];
    if (other.inherited_from) return;
    try {
      await Promise.all([
        updateSection(packId, section.id, { sort_order: other.sort_order }),
        updateSection(packId, other.id, { sort_order: section.sort_order }),
      ]);
      await refresh();
    } catch (e) {
      alert(e instanceof Error ? e.message : 'Failed to reorder');
    }
  };

  // ----- Field mutations on the selected section -----

  const saveSelectedSection = async (next: Partial<ResolvedSection>) => {
    if (!selectedSection) return;
    if (selectedSection.inherited_from) {
      alert('This section is inherited. Override it first.');
      return;
    }
    setSavingSection(true);
    try {
      await updateSection(packId, selectedSection.id, next);
      await refresh();
    } catch (e) {
      alert(e instanceof Error ? e.message : 'Failed to save');
    } finally {
      setSavingSection(false);
    }
  };

  // ----- Render -----

  if (loading) return <div className="p-6 text-sm text-neutral-500">Loading...</div>;
  if (error) return <div className="p-6 text-sm text-red-600">{error}</div>;
  if (!data) return null;

  return (
    <div className="grid grid-cols-[220px_1fr_280px] gap-0 h-[calc(100vh-120px)] border-t border-neutral-200">
      {/* LEFT: section list */}
      <aside className="border-r border-neutral-200 overflow-y-auto">
        <div className="p-3 flex items-center justify-between">
          <span className="text-xs font-medium uppercase text-neutral-500">Sections</span>
          <button type="button" onClick={handleAddSection} className="text-xs text-[var(--lp-orange)] hover:underline">
            + add
          </button>
        </div>
        <ul>
          {data.sections.map((s) => (
            <li key={s.section_key}>
              <button
                type="button"
                onClick={() => setSelected(s.section_key)}
                className={`w-full text-left px-3 py-2 text-sm flex items-center justify-between gap-2 border-l-2 ${
                  selected === s.section_key
                    ? 'bg-neutral-100 border-[var(--lp-orange)]'
                    : 'border-transparent hover:bg-neutral-50'
                }`}
              >
                <span className="truncate">{s.title}</span>
                {s.inherited_from && (
                  <span className="text-[10px] uppercase tracking-wide text-neutral-400">
                    {s.inherited_from === 'artist' ? 'artist' : 'tour'}
                  </span>
                )}
              </button>
            </li>
          ))}
        </ul>
      </aside>

      {/* CENTER: section editor */}
      <main className="overflow-y-auto bg-neutral-50 p-6">
        {!selectedSection ? (
          <div className="text-sm text-neutral-500">Select a section, or add a new one.</div>
        ) : (
          <SectionEditor
            key={selectedSection.id}
            section={selectedSection}
            tourId={data.pack.tour_id}
            saving={savingSection}
            onTitleChange={(title) => saveSelectedSection({ title })}
            onFieldsChange={(fields) => saveSelectedSection({ fields })}
            onRemove={() => handleRemoveSection(selectedSection)}
            onOverride={() => handleOverrideSection(selectedSection)}
            onMoveUp={() => handleMoveSection(selectedSection, -1)}
            onMoveDown={() => handleMoveSection(selectedSection, 1)}
          />
        )}
      </main>

      {/* RIGHT: inspector */}
      <aside className="border-l border-neutral-200 overflow-y-auto p-4 space-y-4 text-sm">
        <Inspector pack={data.pack} onPackUpdate={() => refresh()} onPackDelete={async () => {
          if (!confirm('Delete this pack? This cannot be undone.')) return;
          try {
            await deletePack(packId);
            window.location.href = '/rider-packs';
          } catch (e) {
            alert(e instanceof Error ? e.message : 'Failed to delete');
          }
        }} />
      </aside>
    </div>
  );
}

function SectionEditor({
  section,
  tourId,
  saving,
  onTitleChange,
  onFieldsChange,
  onRemove,
  onOverride,
  onMoveUp,
  onMoveDown,
}: {
  section: ResolvedSection;
  tourId: string | null;
  saving: boolean;
  onTitleChange: (title: string) => void;
  onFieldsChange: (fields: Field[]) => void;
  onRemove: () => void;
  onOverride: () => void;
  onMoveUp: () => void;
  onMoveDown: () => void;
}) {
  const [titleDraft, setTitleDraft] = useState(section.title);
  useEffect(() => setTitleDraft(section.title), [section.id, section.title]);

  const inherited = !!section.inherited_from;
  const fields = section.fields ?? [];

  return (
    <div className="max-w-3xl mx-auto space-y-4">
      <div className="flex items-start justify-between gap-4">
        <div className="flex-1">
          <input
            type="text"
            value={titleDraft}
            onChange={(e) => setTitleDraft(e.target.value)}
            onBlur={() => {
              if (titleDraft !== section.title && !inherited) onTitleChange(titleDraft);
            }}
            disabled={inherited}
            className="w-full text-2xl font-semibold bg-transparent outline-none border-b border-transparent focus:border-neutral-300 disabled:text-neutral-400"
          />
          <div className="mt-1 text-xs text-neutral-500">
            {inherited ? (
              <>Inherited from {section.inherited_from}. </>
            ) : (
              <>{saving ? 'Saving…' : 'Authored here.'} </>
            )}
          </div>
        </div>
        <div className="flex items-center gap-1 pt-2 text-xs">
          <button type="button" onClick={onMoveUp} className="rounded border border-neutral-200 px-2 py-1 hover:bg-neutral-50">↑</button>
          <button type="button" onClick={onMoveDown} className="rounded border border-neutral-200 px-2 py-1 hover:bg-neutral-50">↓</button>
          {inherited ? (
            <button type="button" onClick={onOverride} className="rounded bg-[var(--lp-orange)] px-2 py-1 text-white hover:opacity-90">
              Override here
            </button>
          ) : (
            <button type="button" onClick={onRemove} className="rounded border border-neutral-200 px-2 py-1 hover:bg-red-50 hover:text-red-600">
              Remove
            </button>
          )}
        </div>
      </div>

      <fieldset disabled={inherited} className={inherited ? 'opacity-60 pointer-events-none' : ''}>
        <div className="space-y-2">
          {fields.map((f, i) => (
            <FieldEditor
              key={i}
              field={f}
              tourId={tourId}
              onChange={(next) => {
                const copy = [...fields];
                copy[i] = next;
                onFieldsChange(copy);
              }}
              onRemove={() => onFieldsChange(fields.filter((_, j) => j !== i))}
            />
          ))}
        </div>

        <AddFieldDropdown onAdd={(type) => onFieldsChange([...fields, makeDefaultField(type)])} />
      </fieldset>
    </div>
  );
}

function AddFieldDropdown({ onAdd }: { onAdd: (type: Field['type']) => void }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="mt-3">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="rounded border border-dashed border-neutral-300 px-3 py-2 text-sm text-neutral-600 hover:bg-neutral-50"
      >
        + Add field
      </button>
      {open && (
        <div className="mt-2 grid grid-cols-3 gap-1">
          {(Object.keys(FIELD_TYPE_LABELS) as Field['type'][]).map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => { onAdd(t); setOpen(false); }}
              className="rounded border border-neutral-200 px-2 py-1 text-xs hover:bg-neutral-50"
            >
              {FIELD_TYPE_LABELS[t]}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function Inspector({
  pack,
  onPackUpdate,
  onPackDelete,
}: {
  pack: RiderPack;
  onPackUpdate: () => void;
  onPackDelete: () => void;
}) {
  const [titleDraft, setTitleDraft] = useState(pack.title ?? '');
  useEffect(() => setTitleDraft(pack.title ?? ''), [pack.id, pack.title]);

  const commitTitle = async () => {
    if ((pack.title ?? '') === titleDraft) return;
    try {
      await updatePack(pack.id, { title: titleDraft });
      onPackUpdate();
    } catch (e) {
      alert(e instanceof Error ? e.message : 'Failed to save title');
    }
  };

  return (
    <>
      <div>
        <div className="text-[10px] uppercase tracking-wide text-neutral-400">Scope</div>
        <div className="mt-1 inline-flex items-center rounded-full bg-neutral-100 px-2 py-0.5 text-xs font-medium uppercase">
          {pack.scope}
        </div>
      </div>
      <div>
        <label className="text-[10px] uppercase tracking-wide text-neutral-400">Title</label>
        <input
          type="text"
          value={titleDraft}
          onChange={(e) => setTitleDraft(e.target.value)}
          onBlur={commitTitle}
          className="mt-1 w-full rounded border border-neutral-200 px-2 py-1 text-sm"
          placeholder="Untitled"
        />
      </div>
      <div>
        <div className="text-[10px] uppercase tracking-wide text-neutral-400">Google Doc</div>
        {pack.google_doc_url ? (
          <a href={pack.google_doc_url} target="_blank" rel="noreferrer" className="mt-1 block text-xs text-[var(--lp-orange)] hover:underline truncate">
            {pack.google_doc_url}
          </a>
        ) : (
          <div className="mt-1 text-xs text-neutral-400">Not yet exported. (R5 wires this up.)</div>
        )}
      </div>
      <div className="pt-4 border-t border-neutral-200">
        <button
          type="button"
          onClick={onPackDelete}
          className="text-xs text-neutral-500 hover:text-red-600"
        >
          Delete pack
        </button>
      </div>
    </>
  );
}
```

### Acceptance

```bash
grep -n "export function PackEditor\b\|function SectionEditor\|function Inspector\b" \
  src/components/rider-pack/PackEditor.tsx
```

Expected: 3 lines.

---

## Step 5 — Pack index page

Two things happen in this step:

1. **Append `NewPackForm` to the bottom of `src/components/rider-pack/PackEditor.tsx`** (it reuses the existing `'use client'` directive at the top of that file; it must be a client component because it does a fetch POST with JSON).
2. **Create `src/app/(app)/rider-packs/page.tsx`** as a server component that imports `NewPackForm` from `PackEditor.tsx`.

### 5a — Append to `PackEditor.tsx`

At the **bottom** of `src/components/rider-pack/PackEditor.tsx` (still inside the same file, after all the existing components — `PackEditor`, `SectionEditor`, `Inspector`, etc.), append:

```tsx
// ============================================================
// NewPackForm — small client form for the /rider-packs index page.
// Exported from this file so page.tsx (a server component) can import
// a ready-made client component without needing its own file.
// ============================================================
export function NewPackForm({ artists }: { artists: { id: string; name: string }[] }) {
  const [artistId, setArtistId] = useState(artists[0]?.id ?? '');
  const [title, setTitle] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const submit = async () => {
    if (!artistId) return;
    setSubmitting(true);
    try {
      const res = await fetch('/api/rider-packs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ scope: 'artist', artist_id: artistId, title: title || null }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        alert(j.error ?? 'Failed to create pack');
        return;
      }
      const pack = await res.json();
      window.location.href = `/rider-packs/${pack.id}`;
    } finally {
      setSubmitting(false);
    }
  };

  if (artists.length === 0) {
    return <div className="p-4 text-xs text-neutral-500">No artists in this workspace yet. Create one first.</div>;
  }

  return (
    <div className="flex flex-wrap items-end gap-3 p-4">
      <label className="text-xs">
        <div className="text-[10px] uppercase tracking-wide text-neutral-400 mb-1">Artist</div>
        <select
          value={artistId}
          onChange={(e) => setArtistId(e.target.value)}
          className="rounded border border-neutral-200 px-2 py-1 text-sm"
        >
          {artists.map((a) => (
            <option key={a.id} value={a.id}>{a.name}</option>
          ))}
        </select>
      </label>
      <label className="text-xs flex-1 min-w-[200px]">
        <div className="text-[10px] uppercase tracking-wide text-neutral-400 mb-1">Title (optional)</div>
        <input
          type="text"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          className="w-full rounded border border-neutral-200 px-2 py-1 text-sm"
          placeholder="e.g. Master rider v1"
        />
      </label>
      <button
        type="button"
        onClick={submit}
        disabled={submitting || !artistId}
        className="rounded bg-[var(--lp-orange)] px-4 py-1.5 text-sm text-white hover:opacity-90 disabled:opacity-50"
      >
        Create
      </button>
    </div>
  );
}
```

### 5b — Create `src/app/(app)/rider-packs/page.tsx`

```tsx
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { createServerSupabaseClient } from '@/lib/supabase-server';
import { NewPackForm } from '@/components/rider-pack/PackEditor';

export const dynamic = 'force-dynamic';

export default async function RiderPacksIndexPage() {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const { data: profile } = await supabase
    .from('profiles')
    .select('workspace_id')
    .eq('id', user.id)
    .single();

  if (!profile?.workspace_id) {
    return <div className="p-6 text-sm text-neutral-500">No workspace found.</div>;
  }

  const [{ data: artists }, { data: packs }] = await Promise.all([
    supabase
      .from('artists')
      .select('id, name')
      .eq('workspace_id', profile.workspace_id)
      .order('name'),
    supabase
      .from('rider_packs')
      .select('id, title, scope, artist_id, tour_id, routing_id, updated_at')
      .order('updated_at', { ascending: false }),
  ]);

  const artistMap = new Map((artists ?? []).map((a) => [a.id, a.name]));

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-6">
      <header>
        <h1 className="text-2xl font-semibold">Rider / Pack</h1>
      </header>

      <section className="rounded border border-neutral-200 bg-white">
        <div className="border-b border-neutral-200 px-4 py-2 text-xs font-medium uppercase text-neutral-500">
          New artist pack
        </div>
        <NewPackForm artists={artists ?? []} />
      </section>

      <section className="rounded border border-neutral-200 bg-white">
        <div className="border-b border-neutral-200 px-4 py-2 text-xs font-medium uppercase text-neutral-500">
          Packs
        </div>
        {!packs || packs.length === 0 ? (
          <div className="p-4 text-sm text-neutral-500">No packs yet. Create one above.</div>
        ) : (
          <ul className="divide-y divide-neutral-100">
            {packs.map((p) => (
              <li key={p.id}>
                <Link
                  href={`/rider-packs/${p.id}`}
                  className="flex items-center justify-between gap-4 px-4 py-3 hover:bg-neutral-50"
                >
                  <div className="min-w-0">
                    <div className="text-sm font-medium truncate">{p.title || '(untitled)'}</div>
                    <div className="text-xs text-neutral-500 truncate">
                      {artistMap.get(p.artist_id) ?? 'Unknown artist'}
                      {' · '}
                      <span className="uppercase tracking-wide">{p.scope}</span>
                    </div>
                  </div>
                  <div className="text-[10px] text-neutral-400">
                    {new Date(p.updated_at).toLocaleString()}
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
```

### Acceptance

```bash
# NewPackForm is exported from PackEditor.tsx
grep -n "export function NewPackForm" src/components/rider-pack/PackEditor.tsx

# page.tsx is server component, imports NewPackForm, uses force-dynamic
grep -n "force-dynamic\|createServerSupabaseClient\|NewPackForm" \
  "src/app/(app)/rider-packs/page.tsx"
```

Expected: 1 line on the first grep, 3 lines on the second.

---

## Step 6 — Pack editor route

Create `src/app/(app)/rider-packs/[id]/page.tsx`:

```tsx
import { createServerSupabaseClient } from '@/lib/supabase-server';
import { redirect } from 'next/navigation';
import { PackEditor } from '@/components/rider-pack/PackEditor';

export const dynamic = 'force-dynamic';

export default async function RiderPackEditorPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const { id } = await params;

  // Light existence check for a better 404 than surfacing a fetch error.
  const { data: pack } = await supabase
    .from('rider_packs')
    .select('id, title')
    .eq('id', id)
    .maybeSingle();

  if (!pack) {
    return (
      <div className="p-6 text-sm text-neutral-500">Pack not found.</div>
    );
  }

  return (
    <div>
      <div className="px-6 py-3 border-b border-neutral-200 flex items-center gap-2 text-sm">
        <a href="/rider-packs" className="text-neutral-500 hover:text-neutral-900">← Rider / Pack</a>
        <span className="text-neutral-300">/</span>
        <span className="font-medium">{pack.title || '(untitled)'}</span>
      </div>
      <PackEditor packId={id} />
    </div>
  );
}
```

### Acceptance

```bash
grep -n "PackEditor\|createServerSupabaseClient\|force-dynamic" \
  "src/app/(app)/rider-packs/[id]/page.tsx"
```

Expected: 3 lines.

---

## Step 7 — Final verification

```bash
# 1. TypeScript clean across the whole repo
npx tsc --noEmit 2>&1 | tail -30

# 2. Lint only the new files
npx eslint \
  "src/app/api/contacts/pick/route.ts" \
  "src/lib/rider-packs/client.ts" \
  "src/components/rider-pack/**/*.tsx" \
  "src/app/(app)/rider-packs/**/*.tsx" \
  2>&1 | tail -30

# 3. Build so SSR/hydration issues are caught
npx next build 2>&1 | tail -40

# 4. Git status
git status --short src/ | head -20

# 5. Count — expect exactly 6 new files, no existing modifications
git status --short src/ | grep -E "^\?\?" | wc -l
git status --short src/ | grep -E "^ M|^M " | wc -l
```

### Expected

- tsc clean, or only errors in files you created (fixable in-place). If errors are in existing files you didn't touch, note them and move on.
- eslint clean on the new files.
- `next build` succeeds. If it fails with SSR/hydration errors on the new routes, fix them in the new files only.
- Count: exactly `6` new files, `0` modifications.

If any step fails, STOP. Paste the error. Do not try to fix by editing unrelated files.

---

## Step 8 — Commit + push

```bash
git add \
  "src/app/api/contacts/pick/route.ts" \
  "src/lib/rider-packs/client.ts" \
  "src/components/rider-pack/" \
  "src/app/(app)/rider-packs/"

git commit -m "feat(rider-pack): editor UI (R3) + contact picker (R2c)

R3 ships the rider/pack editor — three-pane layout with section
list, section editor, and inspector. All 8 field primitives have
inline editors. Asset field is a stub (picker in R3b). Contact
field uses the new R2c /api/contacts/pick endpoint.

R2c is one GET endpoint: tour personnel (when tour_id given)
plus workspace contacts, filterable by q. Used by the editor's
Contact field picker.

Routes added:
- GET  /api/contacts/pick                (R2c)
- /rider-packs                           (pack index + new artist pack)
- /rider-packs/[id]                      (editor)

Client lib:
- src/lib/rider-packs/client.ts  (12 typed fetch helpers)

Components:
- src/components/rider-pack/FieldEditors.tsx
- src/components/rider-pack/PackEditor.tsx  (also exports NewPackForm)

Inheritance UX:
- Sections tagged inherited_from='artist'|'tour'|null.
- Inherited sections render read-only with an 'Override here'
  action that forks a local copy at this scope.
- Inherited sections cannot be renamed/removed/reordered until
  overridden.

Still TODO (later PRs):
- R3b: real asset picker (consumes R2b API).
- R4: read-only view + public web link render.
- R5: Google Doc export.
- History panel (endpoint exists in R2).
- Full IA / nav placement (task #17)."

git push
```

---

## Step 9 — Report

Paste:

1. Step 0 pre-flight output (A–E). Include the exact personnel column names you found.
2. Step 7: tsc summary, eslint summary, `next build` summary (last 10 lines), git status, counts.
3. The 6 created file paths.
4. Final commit SHA.
5. Anything you stopped on. If nothing, say "nothing".

---

## Out of scope

- Real asset picker (R3b).
- Read-only view / web link render (R4).
- Google Doc export (R5).
- History panel in the inspector.
- Drag-and-drop section reorder.
- Seeding default sections on pack creation.
- Artist/tour/show pack creation other than "new artist pack" (tour/show packs are created from the tour/routing views in future PRs).
- Any nav / IA changes.
- Any existing file edits.
