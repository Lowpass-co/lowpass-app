# Cursor Prompt — Rider/Pack R4: Read-only view + public web link

Sixth build PR. Prior landed:
- R1 migrations (`1210645`)
- R2 API (`f1f1e63`)
- R2b assets API (`b5369c1`)
- R3 editor UI + R2c contact picker (`9782952`)
- R3b asset picker (`1be30fd`)

Migration 034 is already applied in Supabase. It created `rider_web_links` (columns: `id, pack_id, token, password_hash, created_by, created_at, revoked_at, revoked_reason`) and the matching RLS policies.

This PR ships three things:

1. **Web-link management** — authenticated admins can create/list/revoke shareable links for a pack. Optional per-link password.
2. **Public read-only page** at `/r/[token]` — anyone with the link (and the password, if set) sees the resolved pack. No Lowpass account needed.
3. **Shared read-only renderer** — one component that displays a resolved pack with no edit affordances. Today it powers the public page. Later it can power an in-app preview too.

**See `RIDER_PACK_DESIGN.md` for full context. You don't need to re-read it.**

---

## Files this PR creates (7 new)

1. `src/lib/rider-packs/web-links.ts` — token generation, password hashing (node `crypto` scrypt), shared types.
2. `src/app/api/rider-packs/[id]/web-links/route.ts` — `GET` (list active + revoked), `POST` (create).
3. `src/app/api/rider-web-links/[id]/route.ts` — `DELETE` (soft-revoke by setting `revoked_at`).
4. `src/app/api/public/rider/[token]/route.ts` — `POST` public endpoint. Body `{ password?: string }`. Uses the **service-role** Supabase client because the caller is unauthenticated.
5. `src/components/rider-pack/ReadOnlyPackView.tsx` — pure renderer. No fetches, no state. Props: `{ pack, sections, signedUrls }`.
6. `src/components/rider-pack/PublicRiderView.tsx` — client component. Handles the `password_required` → `verified` → render flow. Imports `ReadOnlyPackView`.
7. `src/app/r/[token]/page.tsx` — minimal server component wrapping `<PublicRiderView token={token} />`.

## Files this PR edits (3)

8. `src/lib/supabase-middleware.ts` — add `/r/` to the public-route exemption so unauthenticated users aren't redirected to `/login`.
9. `src/components/rider-pack/PackEditor.tsx` — add a "Sharing" section to the `Inspector` component (between Google Doc and Delete pack). Exports stay the same.
10. `src/lib/rider-packs/client.ts` — append three typed helpers (`createWebLink`, `listWebLinks`, `revokeWebLink`) and one type (`WebLink`).

---

## Hard rules

1. Do not create or modify any file not in the 10 listed above.
2. Do not add new npm dependencies. Password hashing must use node's built-in `crypto` module (`scrypt`).
3. Do not modify migration 034 or any SQL.
4. The public endpoint (`/api/public/rider/[token]`) must NEVER call `createServerSupabaseClient` — it has no user session. It must use `createServiceSupabaseClient` from `@/lib/supabase-server` and scope every query by `pack_id` derived from the looked-up token.
5. The API never returns `password_hash` to the client. Transform to `has_password: boolean` before sending.
6. Revokes are soft only (set `revoked_at = now()`). Never `DELETE` from `rider_web_links`.
7. Styling: match the quiet/flat tone of existing components. Use Tailwind utility classes and the `var(--lp-orange)` CSS variable for accents.
8. If anything is ambiguous, stop and report rather than guessing.

---

## Step 0 — Pre-flight

Paste the output of all of these in your report. Do not skip.

```bash
# A. Confirm the five prior rider-pack commits are in history.
git log --oneline | grep -E "1210645|f1f1e63|b5369c1|9782952|1be30fd" | head -5

# B. Confirm none of the 7 new files already exist.
ls src/lib/rider-packs/web-links.ts 2>&1
ls "src/app/api/rider-packs/[id]/web-links/" 2>&1
ls "src/app/api/rider-web-links/" 2>&1
ls "src/app/api/public/" 2>&1
ls src/components/rider-pack/ReadOnlyPackView.tsx 2>&1
ls src/components/rider-pack/PublicRiderView.tsx 2>&1
ls "src/app/r/" 2>&1

# C. Confirm the 3 files we'll edit exist.
ls src/lib/supabase-middleware.ts
ls src/components/rider-pack/PackEditor.tsx
ls src/lib/rider-packs/client.ts

# D. Confirm rider_web_links columns match what this PR expects.
grep -A 10 "CREATE TABLE.*rider_web_links" database/migrations/034_rider_pack_system.sql

# E. Confirm createServiceSupabaseClient is exported from supabase-server.ts.
grep -n "export function createServiceSupabaseClient" src/lib/supabase-server.ts

# F. Confirm resolvePack signature (we'll call it from the public route).
grep -n "export async function resolvePack" src/lib/rider-packs/resolve.ts

# G. Confirm signedUrlsForAssets signature (we'll call it from the public route).
grep -n "export async function signedUrlsForAssets" src/lib/rider-packs/assets.ts
```

Expected:
- A: 5 commit SHAs in order.
- B: 7 "No such file or directory" errors (or equivalent).
- C: 3 file paths printed.
- D: columns list includes `token`, `password_hash`, `revoked_at`.
- E: one match.
- F: one match.
- G: one match.

If any of these fail, **stop and report**.

---

## Step 1 — `src/lib/rider-packs/web-links.ts`

Purpose: isolate token generation and password hashing so the routes stay small.

```ts
/* ============================================
   LOWPASS — Rider web-link helpers

   Token generation + password hashing for public
   rider share links.

   Tokens: 24 bytes of random, base64url-encoded
   (~32 chars). More than enough entropy to make
   guessing infeasible.

   Passwords: scrypt from node's built-in crypto.
   Format stored in DB:
     s1:<saltHex>:<hashHex>
   where "s1" is a version prefix that lets us
   migrate params later without breaking old links.
   ============================================ */

import crypto from 'crypto';
import { promisify } from 'util';

const scryptAsync = promisify(crypto.scrypt) as (
  password: string | Buffer,
  salt: string | Buffer,
  keylen: number,
) => Promise<Buffer>;

const SCRYPT_KEYLEN = 32;
const SALT_BYTES = 16;
const VERSION = 's1';

/** Generate a URL-safe public token. */
export function generateToken(): string {
  return crypto.randomBytes(24).toString('base64url');
}

/** Hash a password for storage. Returns the full "s1:<salt>:<hash>" string. */
export async function hashPassword(password: string): Promise<string> {
  const salt = crypto.randomBytes(SALT_BYTES);
  const derived = await scryptAsync(password, salt, SCRYPT_KEYLEN);
  return `${VERSION}:${salt.toString('hex')}:${derived.toString('hex')}`;
}

/** Verify a password against a stored hash. Returns false on any parse failure. */
export async function verifyPassword(
  password: string,
  stored: string,
): Promise<boolean> {
  try {
    const [version, saltHex, hashHex] = stored.split(':');
    if (version !== VERSION || !saltHex || !hashHex) return false;
    const salt = Buffer.from(saltHex, 'hex');
    const expected = Buffer.from(hashHex, 'hex');
    const derived = await scryptAsync(password, salt, expected.length);
    // Constant-time comparison.
    if (derived.length !== expected.length) return false;
    return crypto.timingSafeEqual(derived, expected);
  } catch {
    return false;
  }
}

/** rider_web_links row, minus password_hash (never leaves the server). */
export type WebLinkPublic = {
  id: string;
  pack_id: string;
  token: string;
  has_password: boolean;
  created_by: string | null;
  created_at: string;
  revoked_at: string | null;
  revoked_reason: string | null;
};

/** Shape of the payload returned by /api/public/rider/[token] on success. */
export type PublicRiderPayload = {
  pack: {
    id: string;
    title: string | null;
    scope: 'artist' | 'tour' | 'show';
    artist_id: string;
    artist_name: string;
  };
  sections: Array<{
    id: string;
    section_key: string;
    title: string;
    sort_order: number;
    fields: unknown[];
    inherited_from: 'artist' | 'tour' | 'show' | null;
    source_pack_id: string;
  }>;
  signedUrls: Record<string, string | null>;
};
```

### Acceptance

```bash
grep -n "^export" src/lib/rider-packs/web-links.ts
```

Expected: 5 lines (`generateToken`, `hashPassword`, `verifyPassword`, `WebLinkPublic`, `PublicRiderPayload`).

---

## Step 2 — `src/app/api/rider-packs/[id]/web-links/route.ts`

`GET` returns all links for this pack (the admin UI shows revoked ones too so users understand history).

`POST` creates a link with optional password. Body: `{ password?: string }` — `password` is the plain text, it's hashed server-side.

```ts
/* ============================================
   LOWPASS — Rider web-links collection

   GET  /api/rider-packs/[id]/web-links
        Returns all links (active + revoked) for the pack.

   POST /api/rider-packs/[id]/web-links
        Body: { password?: string }
        Creates a new link. Password is hashed server-side.
   ============================================ */

import { NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase-server';
import {
  generateToken,
  hashPassword,
  type WebLinkPublic,
} from '@/lib/rider-packs/web-links';

type Row = {
  id: string;
  pack_id: string;
  token: string;
  password_hash: string | null;
  created_by: string | null;
  created_at: string;
  revoked_at: string | null;
  revoked_reason: string | null;
};

function toPublic(row: Row): WebLinkPublic {
  return {
    id: row.id,
    pack_id: row.pack_id,
    token: row.token,
    has_password: row.password_hash != null,
    created_by: row.created_by,
    created_at: row.created_at,
    revoked_at: row.revoked_at,
    revoked_reason: row.revoked_reason,
  };
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { id: packId } = await params;

  // RLS already scopes this to the user's workspace.
  const { data, error } = await supabase
    .from('rider_web_links')
    .select('*')
    .eq('pack_id', packId)
    .order('created_at', { ascending: false });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({
    links: (data as Row[]).map(toPublic),
  });
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

  let body: { password?: unknown } = {};
  try {
    body = (await request.json()) as { password?: unknown };
  } catch {
    // Empty body is fine.
  }

  const password = typeof body.password === 'string' && body.password.length > 0
    ? body.password
    : null;

  // Verify pack exists and is accessible (RLS handles the workspace check).
  const { data: pack } = await supabase
    .from('rider_packs')
    .select('id')
    .eq('id', packId)
    .maybeSingle();
  if (!pack) {
    return NextResponse.json({ error: 'Pack not found' }, { status: 404 });
  }

  const passwordHash = password ? await hashPassword(password) : null;

  // Retry up to 3 times on the extremely unlikely event of a token collision.
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const token = generateToken();
    const { data: inserted, error } = await supabase
      .from('rider_web_links')
      .insert({
        pack_id: packId,
        token,
        password_hash: passwordHash,
        created_by: user.id,
      })
      .select()
      .single();

    if (!error && inserted) {
      return NextResponse.json(toPublic(inserted as Row), { status: 201 });
    }

    // 23505 = unique_violation on the `token` UNIQUE constraint.
    if (error && error.code !== '23505') {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
  }

  return NextResponse.json(
    { error: 'Failed to generate a unique token after 3 attempts' },
    { status: 500 },
  );
}
```

### Acceptance

```bash
grep -n "^export async function" "src/app/api/rider-packs/[id]/web-links/route.ts"
```

Expected: 2 lines (`GET`, `POST`).

---

## Step 3 — `src/app/api/rider-web-links/[id]/route.ts`

Only `DELETE`. Soft-revoke.

```ts
/* ============================================
   LOWPASS — Rider web-link revoke

   DELETE /api/rider-web-links/[id]
          Soft-revokes the link (sets revoked_at).
          Never hard-deletes so audit history is preserved.
   ============================================ */

import { NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase-server';

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

  const { data, error } = await supabase
    .from('rider_web_links')
    .update({
      revoked_at: new Date().toISOString(),
      revoked_reason: 'revoked by user',
    })
    .eq('id', id)
    .is('revoked_at', null) // idempotent: already-revoked links are a no-op
    .select()
    .maybeSingle();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }
  if (!data) {
    // Either the link doesn't exist, is outside the user's workspace (RLS),
    // or is already revoked. All three are safe to surface as 204.
    return new NextResponse(null, { status: 204 });
  }

  return new NextResponse(null, { status: 204 });
}
```

### Acceptance

```bash
grep -n "^export async function" "src/app/api/rider-web-links/[id]/route.ts"
```

Expected: 1 line (`DELETE`).

---

## Step 4 — `src/app/api/public/rider/[token]/route.ts`

The public endpoint. Unauthenticated. Uses the service-role client.

```ts
/* ============================================
   LOWPASS — Public rider endpoint

   POST /api/public/rider/[token]
        Body: { password?: string }

   Unauthenticated. Uses the service-role Supabase
   client because the caller is a public user.
   Every query is scoped by the pack_id that the
   token resolves to, so scope leakage is not possible.

   Response shapes:
     200 { pack, sections, signedUrls }   (see PublicRiderPayload)
     401 { requires_password: true }      (password set, none provided)
     401 { invalid_password: true }       (password set, wrong)
     404 { error: 'Link not found' }      (revoked, deleted, or bad token)
   ============================================ */

import { NextResponse } from 'next/server';
import { createServiceSupabaseClient } from '@/lib/supabase-server';
import { resolvePack } from '@/lib/rider-packs/resolve';
import { signedUrlsForAssets } from '@/lib/rider-packs/assets';
import { verifyPassword, type PublicRiderPayload } from '@/lib/rider-packs/web-links';
import type { Field, FieldAsset, RiderPack } from '@/lib/rider-packs/types';

export async function POST(
  request: Request,
  { params }: { params: Promise<{ token: string }> },
) {
  const { token } = await params;
  if (!token) {
    return NextResponse.json({ error: 'Link not found' }, { status: 404 });
  }

  let body: { password?: unknown } = {};
  try {
    body = (await request.json()) as { password?: unknown };
  } catch {
    // empty body ok
  }
  const password = typeof body.password === 'string' ? body.password : null;

  const service = createServiceSupabaseClient();

  // 1. Resolve token → link row.
  const { data: link } = await service
    .from('rider_web_links')
    .select('id, pack_id, password_hash, revoked_at')
    .eq('token', token)
    .maybeSingle();

  if (!link || link.revoked_at) {
    return NextResponse.json({ error: 'Link not found' }, { status: 404 });
  }

  // 2. Password gate.
  if (link.password_hash) {
    if (!password) {
      return NextResponse.json({ requires_password: true }, { status: 401 });
    }
    const ok = await verifyPassword(password, link.password_hash);
    if (!ok) {
      return NextResponse.json({ invalid_password: true }, { status: 401 });
    }
  }

  // 3. Fetch the pack. Service role bypasses RLS; we scope by pack_id.
  const { data: pack } = await service
    .from('rider_packs')
    .select('*')
    .eq('id', link.pack_id)
    .maybeSingle<RiderPack>();

  if (!pack) {
    return NextResponse.json({ error: 'Link not found' }, { status: 404 });
  }

  // 4. Artist name for the header.
  const { data: artist } = await service
    .from('artists')
    .select('name')
    .eq('id', pack.artist_id)
    .maybeSingle();

  // 5. Resolve sections (walks show → tour → artist via the same helper we use
  //    for authenticated /resolved). resolvePack works fine with a service-role
  //    client because every query inside it is keyed by the pack's own IDs.
  const resolved = await resolvePack(service, pack);

  // 6. Collect all asset ids referenced by any section's fields.
  const assetIds = new Set<string>();
  for (const section of resolved.sections) {
    for (const field of section.fields as Field[]) {
      if (field.type === 'asset') {
        const id = (field as FieldAsset).asset_id;
        if (id) assetIds.add(id);
      }
    }
  }

  // 7. Sign URLs for those assets (images will render inline; files get
  //    a clickable link). signedUrlsForAssets only returns URLs for rows
  //    with a non-null storage_path, which is exactly what we want.
  let signedUrls: Record<string, string | null> = {};
  if (assetIds.size > 0) {
    const { data: assets } = await service
      .from('rider_assets')
      .select('id, storage_path')
      .in('id', Array.from(assetIds));
    if (assets) {
      signedUrls = await signedUrlsForAssets(service, assets);
    }
  }

  const payload: PublicRiderPayload = {
    pack: {
      id: pack.id,
      title: pack.title,
      scope: pack.scope,
      artist_id: pack.artist_id,
      artist_name: artist?.name ?? 'Unknown artist',
    },
    sections: resolved.sections.map((s) => ({
      id: s.id,
      section_key: s.section_key,
      title: s.title,
      sort_order: s.sort_order,
      fields: s.fields,
      inherited_from: s.inherited_from,
      source_pack_id: s.source_pack_id,
    })),
    signedUrls,
  };

  return NextResponse.json(payload);
}
```

### Acceptance

```bash
grep -n "createServerSupabaseClient\|createServiceSupabaseClient" \
  "src/app/api/public/rider/[token]/route.ts"
```

Expected: 1 line, and it must be `createServiceSupabaseClient`. **Zero matches for `createServerSupabaseClient` in this file.** If that grep matches, stop and report.

---

## Step 5 — `src/components/rider-pack/ReadOnlyPackView.tsx`

Pure render. No fetches, no state, no auth.

```tsx
'use client';

/* ============================================
   LOWPASS — ReadOnlyPackView

   Renders a resolved pack as a read-only document.
   Drives the public /r/[token] page today; future
   in-app preview can use it too.

   Pure render: props in → JSX out. No fetching,
   no hooks beyond what's needed for presentation.
   ============================================ */

import type { PublicRiderPayload } from '@/lib/rider-packs/web-links';
import type {
  Field,
  FieldTable,
  FieldContact,
  FieldAsset,
  FieldTime,
  FieldCurrency,
  FieldNumber,
  FieldCheckboxList,
  FieldUrl,
  FieldText,
} from '@/lib/rider-packs/types';

type Props = {
  payload: PublicRiderPayload;
};

export function ReadOnlyPackView({ payload }: Props) {
  const { pack, sections, signedUrls } = payload;
  const ordered = [...sections].sort((a, b) => a.sort_order - b.sort_order);

  return (
    <div className="max-w-3xl mx-auto p-6 space-y-6 bg-white text-neutral-900">
      <header className="space-y-1">
        <div className="text-xs uppercase tracking-wide text-neutral-500">
          {pack.artist_name}
        </div>
        <h1 className="text-2xl font-semibold">
          {pack.title || 'Rider'}
        </h1>
      </header>

      {ordered.length === 0 ? (
        <div className="text-sm text-neutral-500">This pack has no sections yet.</div>
      ) : (
        ordered.map((s) => (
          <section
            key={s.id}
            className="rounded border border-neutral-200 bg-white"
          >
            <h2 className="border-b border-neutral-200 px-4 py-2 text-sm font-medium">
              {s.title}
            </h2>
            <div className="p-4 space-y-3">
              {(s.fields as Field[]).length === 0 ? (
                <div className="text-xs text-neutral-400">(empty)</div>
              ) : (
                (s.fields as Field[]).map((field, idx) => (
                  <FieldRow
                    key={`${field.key}-${idx}`}
                    field={field}
                    signedUrls={signedUrls}
                  />
                ))
              )}
            </div>
          </section>
        ))
      )}

      <footer className="pt-4 text-[10px] text-neutral-400 text-center">
        Shared via Lowpass
      </footer>
    </div>
  );
}

// ---------------- Field renderers ----------------

function FieldRow({
  field,
  signedUrls,
}: {
  field: Field;
  signedUrls: Record<string, string | null>;
}) {
  const label = field.label?.trim() || '';
  return (
    <div className="space-y-1">
      {label && (
        <div className="text-[10px] uppercase tracking-wide text-neutral-500">
          {label}
        </div>
      )}
      <FieldValue field={field} signedUrls={signedUrls} />
    </div>
  );
}

function FieldValue({
  field,
  signedUrls,
}: {
  field: Field;
  signedUrls: Record<string, string | null>;
}) {
  switch (field.type) {
    case 'text':
      return <TextValue field={field} />;
    case 'table':
      return <TableValue field={field} />;
    case 'contact':
      return <ContactValue field={field} />;
    case 'asset':
      return <AssetValue field={field} signedUrls={signedUrls} />;
    case 'time':
      return <TimeValue field={field} />;
    case 'currency':
      return <CurrencyValue field={field} />;
    case 'number':
      return <NumberValue field={field} />;
    case 'checkbox_list':
      return <CheckboxListValue field={field} />;
    case 'url':
      return <UrlValue field={field} />;
    default:
      return <div className="text-xs text-neutral-400">(unsupported field)</div>;
  }
}

function TextValue({ field }: { field: FieldText }) {
  const v = field.value ?? '';
  if (!v) return <div className="text-sm text-neutral-400">—</div>;
  return <div className="whitespace-pre-wrap text-sm">{v}</div>;
}

function TableValue({ field }: { field: FieldTable }) {
  const columns = field.columns ?? [];
  const rows = field.rows ?? [];
  if (columns.length === 0 || rows.length === 0) {
    return <div className="text-sm text-neutral-400">—</div>;
  }
  return (
    <div className="overflow-x-auto">
      <table className="min-w-full text-sm">
        <thead>
          <tr className="border-b border-neutral-200 text-left">
            {columns.map((c) => (
              <th key={c.key} className="px-2 py-1 text-[10px] uppercase tracking-wide text-neutral-500 font-medium">
                {c.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, ri) => (
            <tr key={ri} className="border-b border-neutral-100 last:border-b-0">
              {columns.map((c) => (
                <td key={c.key} className="px-2 py-1 align-top">
                  {String(row[c.key] ?? '')}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function ContactValue({ field }: { field: FieldContact }) {
  // FieldContact.entries is an array. Each entry has inline name/role/email/
  // phone/company/notes plus `show_fields` controlling which to render.
  const entries = field.entries ?? [];
  if (entries.length === 0) {
    return <div className="text-sm text-neutral-400">—</div>;
  }
  return (
    <div className="space-y-2">
      {entries.map((entry, i) => {
        const show = new Set(entry.show_fields ?? []);
        const name = entry.name?.trim() || '';
        const role = entry.role?.trim() || '';
        const email = entry.email?.trim() || '';
        const phone = entry.phone?.trim() || '';
        const company = entry.company?.trim() || '';
        const notes = entry.notes?.trim() || '';
        return (
          <div key={i} className="text-sm space-y-0.5">
            {show.has('name') && name && <div className="font-medium">{name}</div>}
            {show.has('role') && role && (
              <div className="text-xs text-neutral-500">{role}</div>
            )}
            {show.has('company') && company && (
              <div className="text-xs text-neutral-500">{company}</div>
            )}
            {show.has('email') && email && (
              <a
                href={`mailto:${email}`}
                className="text-xs text-[var(--lp-orange)] hover:underline"
              >
                {email}
              </a>
            )}
            {show.has('phone') && phone && (
              <div className="text-xs text-neutral-600">{phone}</div>
            )}
            {show.has('notes') && notes && (
              <div className="text-xs text-neutral-500 whitespace-pre-wrap">{notes}</div>
            )}
          </div>
        );
      })}
    </div>
  );
}

function AssetValue({
  field,
  signedUrls,
}: {
  field: FieldAsset;
  signedUrls: Record<string, string | null>;
}) {
  const id = field.asset_id ?? '';
  if (!id) return <div className="text-sm text-neutral-400">—</div>;
  const url = signedUrls[id] ?? null;
  if (!url) {
    return <div className="text-xs text-neutral-400">(asset unavailable)</div>;
  }
  // We don't have the asset_type here (payload only carries signedUrls).
  // Try rendering as an image; if the browser can't decode, the user sees
  // the alt text and can click the link below.
  return (
    <div className="space-y-1">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={url}
        alt={field.label ?? 'asset'}
        className="max-h-72 max-w-full rounded border border-neutral-200"
      />
      <a
        href={url}
        target="_blank"
        rel="noreferrer"
        className="block text-[10px] text-[var(--lp-orange)] hover:underline"
      >
        Open original
      </a>
    </div>
  );
}

function TimeValue({ field }: { field: FieldTime }) {
  const v = field.value ?? '';
  if (!v) return <div className="text-sm text-neutral-400">—</div>;
  return <div className="text-sm font-mono">{v}</div>;
}

function CurrencyValue({ field }: { field: FieldCurrency }) {
  const n = field.amount;
  if (n == null || !Number.isFinite(n)) {
    return <div className="text-sm text-neutral-400">—</div>;
  }
  const code = field.currency || 'USD';
  try {
    return (
      <div className="text-sm">
        {new Intl.NumberFormat('en-US', { style: 'currency', currency: code }).format(n)}
      </div>
    );
  } catch {
    return <div className="text-sm">{code} {n}</div>;
  }
}

function NumberValue({ field }: { field: FieldNumber }) {
  const v = field.value;
  if (v == null || !Number.isFinite(v)) {
    return <div className="text-sm text-neutral-400">—</div>;
  }
  return (
    <div className="text-sm">
      {v}
      {field.unit ? ` ${field.unit}` : ''}
    </div>
  );
}

function CheckboxListValue({ field }: { field: FieldCheckboxList }) {
  const items = field.items ?? [];
  if (items.length === 0) return <div className="text-sm text-neutral-400">—</div>;
  return (
    <ul className="text-sm space-y-0.5">
      {items.map((item) => (
        <li key={item.key} className="flex items-center gap-2">
          <span
            className={`inline-block h-3 w-3 rounded-sm border ${
              item.checked
                ? 'border-[var(--lp-orange)] bg-[var(--lp-orange)]'
                : 'border-neutral-300 bg-white'
            }`}
            aria-hidden
          />
          <span>{item.label}</span>
        </li>
      ))}
    </ul>
  );
}

function UrlValue({ field }: { field: FieldUrl }) {
  const href = field.href?.trim() ?? '';
  if (!href) return <div className="text-sm text-neutral-400">—</div>;
  const label = field.display_text?.trim() || href;
  return (
    <a
      href={href}
      target="_blank"
      rel="noreferrer"
      className="text-sm text-[var(--lp-orange)] hover:underline break-all"
    >
      {label}
    </a>
  );
}
```

**Field-type reference (verified against `src/lib/rider-packs/types.ts`):**
- `FieldText.value`, `FieldTime.value`, `FieldNumber.value` + `.unit?`
- `FieldCurrency.amount` + `.currency`
- `FieldUrl.href` + `.display_text?`
- `FieldContact.entries[]` with inline `name/role/email/phone/company/notes` gated by `show_fields[]`
- `FieldAsset.asset_id`
- `FieldTable.columns[].key/label` + `.rows[]` as `Record<string, string>`
- `FieldCheckboxList.items[].key/label/checked`

Do not rename or add fields on any of these types — the types are shared across editor, public, and future Google Doc export.

### Acceptance

```bash
grep -n "export function ReadOnlyPackView\|function FieldValue\b" \
  src/components/rider-pack/ReadOnlyPackView.tsx
```

Expected: 2 lines.

---

## Step 6 — `src/components/rider-pack/PublicRiderView.tsx`

Handles the public flow: initial POST with no password → either renders the pack or shows the password form.

```tsx
'use client';

/* ============================================
   LOWPASS — PublicRiderView

   Client component for /r/[token]. Handles:
   - Initial POST to /api/public/rider/[token] with no password.
   - 401 requires_password → render password form.
   - 401 invalid_password → render password form with error.
   - 404 → render not-found state.
   - 200 → render ReadOnlyPackView.
   ============================================ */

import { useCallback, useEffect, useState } from 'react';
import { ReadOnlyPackView } from './ReadOnlyPackView';
import type { PublicRiderPayload } from '@/lib/rider-packs/web-links';

type State =
  | { kind: 'loading' }
  | { kind: 'needs_password'; invalid: boolean }
  | { kind: 'not_found' }
  | { kind: 'error'; message: string }
  | { kind: 'ok'; payload: PublicRiderPayload };

export function PublicRiderView({ token }: { token: string }) {
  const [state, setState] = useState<State>({ kind: 'loading' });

  const attempt = useCallback(
    async (password: string | null) => {
      try {
        const res = await fetch(`/api/public/rider/${encodeURIComponent(token)}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(password ? { password } : {}),
        });

        if (res.ok) {
          const payload = (await res.json()) as PublicRiderPayload;
          setState({ kind: 'ok', payload });
          return;
        }

        if (res.status === 404) {
          setState({ kind: 'not_found' });
          return;
        }

        if (res.status === 401) {
          const body = await res.json().catch(() => ({}));
          if (body?.requires_password) {
            setState({ kind: 'needs_password', invalid: false });
            return;
          }
          if (body?.invalid_password) {
            setState({ kind: 'needs_password', invalid: true });
            return;
          }
        }

        setState({ kind: 'error', message: `Unexpected status ${res.status}` });
      } catch (e) {
        setState({
          kind: 'error',
          message: e instanceof Error ? e.message : 'Network error',
        });
      }
    },
    [token],
  );

  useEffect(() => {
    void attempt(null);
  }, [attempt]);

  if (state.kind === 'loading') {
    return (
      <div className="min-h-screen flex items-center justify-center text-sm text-neutral-500">
        Loading…
      </div>
    );
  }

  if (state.kind === 'not_found') {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="max-w-md p-6 text-center space-y-2">
          <div className="text-lg font-semibold">Link not found</div>
          <div className="text-sm text-neutral-500">
            This link may have been revoked or is incorrect.
          </div>
        </div>
      </div>
    );
  }

  if (state.kind === 'error') {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="max-w-md p-6 text-center space-y-2">
          <div className="text-lg font-semibold">Something went wrong</div>
          <div className="text-sm text-neutral-500">{state.message}</div>
        </div>
      </div>
    );
  }

  if (state.kind === 'needs_password') {
    return <PasswordForm invalid={state.invalid} onSubmit={(p) => attempt(p)} />;
  }

  return <ReadOnlyPackView payload={state.payload} />;
}

function PasswordForm({
  invalid,
  onSubmit,
}: {
  invalid: boolean;
  onSubmit: (password: string) => void;
}) {
  const [value, setValue] = useState('');
  return (
    <div className="min-h-screen flex items-center justify-center bg-neutral-50">
      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (value) onSubmit(value);
        }}
        className="w-full max-w-sm space-y-3 rounded border border-neutral-200 bg-white p-6"
      >
        <div className="space-y-1">
          <div className="text-lg font-semibold">Password required</div>
          <div className="text-sm text-neutral-500">
            This rider is protected. Enter the password to view.
          </div>
        </div>
        <input
          type="password"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          autoFocus
          className="w-full rounded border border-neutral-200 px-3 py-2 text-sm"
          placeholder="Password"
        />
        {invalid && (
          <div className="text-xs text-red-600">Incorrect password. Try again.</div>
        )}
        <button
          type="submit"
          disabled={!value}
          className="w-full rounded bg-[var(--lp-orange)] px-3 py-2 text-sm text-white hover:opacity-90 disabled:opacity-50"
        >
          Unlock
        </button>
      </form>
    </div>
  );
}
```

### Acceptance

```bash
grep -n "export function PublicRiderView\|function PasswordForm" \
  src/components/rider-pack/PublicRiderView.tsx
```

Expected: 2 lines.

---

## Step 7 — `src/app/r/[token]/page.tsx`

Minimal server page.

```tsx
/* ============================================
   LOWPASS — Public rider page

   Server component. Just extracts the token from
   the URL and renders the client component that
   handles password flow + fetch + render.
   ============================================ */

import { PublicRiderView } from '@/components/rider-pack/PublicRiderView';

export const dynamic = 'force-dynamic';

export default async function PublicRiderPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  return <PublicRiderView token={token} />;
}
```

### Acceptance

```bash
grep -n "force-dynamic\|PublicRiderView" "src/app/r/[token]/page.tsx"
```

Expected: 3 lines (the force-dynamic const, the import, the use inside JSX).

---

## Step 8 — Edit `src/lib/supabase-middleware.ts`

The proxy currently treats anything that isn't `/login`, `/signup`, or `/auth` as protected. We need to let `/r/` through so unauthenticated users can hit the public page.

Find this block:

```ts
  // If no user and trying to access protected routes, redirect to login
  const isAuthRoute = request.nextUrl.pathname.startsWith('/login') ||
    request.nextUrl.pathname.startsWith('/signup') ||
    request.nextUrl.pathname.startsWith('/auth');

  if (!user && !isAuthRoute) {
    const url = request.nextUrl.clone();
    url.pathname = '/login';
    return NextResponse.redirect(url);
  }

  // If user exists and on auth route, redirect to dashboard
  if (user && isAuthRoute) {
    const url = request.nextUrl.clone();
    url.pathname = '/dashboard';
    return NextResponse.redirect(url);
  }
```

Replace it with:

```ts
  // If no user and trying to access protected routes, redirect to login.
  const isAuthRoute = request.nextUrl.pathname.startsWith('/login') ||
    request.nextUrl.pathname.startsWith('/signup') ||
    request.nextUrl.pathname.startsWith('/auth');

  // Public routes accessible without a session (public rider links).
  const isPublicRoute = request.nextUrl.pathname.startsWith('/r/');

  if (!user && !isAuthRoute && !isPublicRoute) {
    const url = request.nextUrl.clone();
    url.pathname = '/login';
    return NextResponse.redirect(url);
  }

  // If user exists and on auth route, redirect to dashboard.
  // Public routes (e.g. /r/[token]) are fine to visit while signed in —
  // do NOT redirect authenticated users away from them.
  if (user && isAuthRoute) {
    const url = request.nextUrl.clone();
    url.pathname = '/dashboard';
    return NextResponse.redirect(url);
  }
```

Do not change anything else in this file.

### Acceptance

```bash
grep -n "isPublicRoute\|startsWith('/r/')\|startsWith('/login')" \
  src/lib/supabase-middleware.ts
```

Expected: 3 lines (one for the `isPublicRoute` definition, one for the `/r/` check, one for the existing `/login` check).

---

## Step 9 — Edit `src/lib/rider-packs/client.ts`

Append three typed helpers and one type export at the bottom of the file. Do not touch existing exports.

```ts
// ============================================================
// Web links (R4)
// ============================================================

export type WebLink = {
  id: string;
  pack_id: string;
  token: string;
  has_password: boolean;
  created_by: string | null;
  created_at: string;
  revoked_at: string | null;
  revoked_reason: string | null;
};

export async function listWebLinks(packId: string): Promise<{ links: WebLink[] }> {
  const res = await fetch(`/api/rider-packs/${packId}/web-links`);
  return asJson(res);
}

export async function createWebLink(
  packId: string,
  body: { password?: string | null } = {},
): Promise<WebLink> {
  const res = await fetch(`/api/rider-packs/${packId}/web-links`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body.password ? { password: body.password } : {}),
  });
  return asJson(res);
}

export async function revokeWebLink(linkId: string): Promise<void> {
  const res = await fetch(`/api/rider-web-links/${linkId}`, { method: 'DELETE' });
  if (!res.ok) throw new Error(`Failed to revoke link (status ${res.status})`);
}
```

**Placement:** append at the very end of the file, after the existing `listAssets` function. Use the existing `asJson` helper that's already defined at the top of the file (do not redefine it).

### Acceptance

```bash
grep -n "export async function createWebLink\|export async function listWebLinks\|export async function revokeWebLink\|export type WebLink" \
  src/lib/rider-packs/client.ts
```

Expected: 4 lines.

---

## Step 10 — Edit `src/components/rider-pack/PackEditor.tsx` — Sharing panel

Add a Sharing section inside the `Inspector` component. It goes **between** the Google Doc block and the Delete pack block.

Find this existing fragment inside `Inspector`:

```tsx
      <div>
        <div className="text-[10px] uppercase tracking-wide text-neutral-400">Google Doc</div>
        {pack.google_doc_url ? (
          <a
            href={pack.google_doc_url}
            target="_blank"
            rel="noreferrer"
            className="mt-1 block text-xs text-[var(--lp-orange)] hover:underline truncate"
          >
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
```

Insert a new `<SharingPanel>` block between the Google Doc `</div>` and the `<div className="pt-4 border-t border-neutral-200">` delete block:

```tsx
      <SharingPanel packId={pack.id} />
```

Then **append** the `SharingPanel` component at the end of the file (after `NewPackForm`, before the file ends). Imports at the top of the file need `createWebLink`, `listWebLinks`, `revokeWebLink`, and `WebLink` added to the existing `@/lib/rider-packs/client` import.

```tsx
function SharingPanel({ packId }: { packId: string }) {
  const [links, setLinks] = useState<WebLink[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [passwordDraft, setPasswordDraft] = useState('');
  const [showPasswordField, setShowPasswordField] = useState(false);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await listWebLinks(packId);
      setLinks(res.links);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load links');
    } finally {
      setLoading(false);
    }
  }, [packId]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const handleCreate = async () => {
    setCreating(true);
    try {
      const password = showPasswordField && passwordDraft.length > 0 ? passwordDraft : null;
      const link = await createWebLink(packId, password ? { password } : {});
      await navigator.clipboard?.writeText(buildPublicUrl(link.token)).catch(() => {});
      setPasswordDraft('');
      setShowPasswordField(false);
      await refresh();
    } catch (e) {
      alert(e instanceof Error ? e.message : 'Failed to create link');
    } finally {
      setCreating(false);
    }
  };

  const handleRevoke = async (linkId: string) => {
    if (!confirm('Revoke this link? Anyone using it will lose access.')) return;
    try {
      await revokeWebLink(linkId);
      await refresh();
    } catch (e) {
      alert(e instanceof Error ? e.message : 'Failed to revoke link');
    }
  };

  const active = (links ?? []).filter((l) => !l.revoked_at);
  const revoked = (links ?? []).filter((l) => l.revoked_at);

  return (
    <div>
      <div className="text-[10px] uppercase tracking-wide text-neutral-400">Sharing</div>

      {loading && <div className="mt-1 text-xs text-neutral-400">Loading…</div>}
      {error && <div className="mt-1 text-xs text-red-600">{error}</div>}

      {!loading && active.length > 0 && (
        <ul className="mt-2 space-y-2">
          {active.map((link) => (
            <li
              key={link.id}
              className="rounded border border-neutral-200 bg-neutral-50 p-2 space-y-1"
            >
              <div className="flex items-center justify-between gap-2">
                <span className="text-[10px] uppercase tracking-wide text-neutral-500">
                  {link.has_password ? 'Password' : 'Open'}
                </span>
                <button
                  type="button"
                  onClick={() => handleRevoke(link.id)}
                  className="text-[10px] text-neutral-500 hover:text-red-600"
                >
                  Revoke
                </button>
              </div>
              <div className="font-mono text-[10px] break-all text-neutral-700">
                /r/{link.token}
              </div>
              <button
                type="button"
                onClick={() => {
                  navigator.clipboard?.writeText(buildPublicUrl(link.token)).catch(() => {});
                }}
                className="text-[10px] text-[var(--lp-orange)] hover:underline"
              >
                Copy link
              </button>
            </li>
          ))}
        </ul>
      )}

      {!loading && active.length === 0 && (
        <div className="mt-1 text-xs text-neutral-400">No active links.</div>
      )}

      <div className="mt-3 space-y-2">
        {showPasswordField && (
          <input
            type="text"
            value={passwordDraft}
            onChange={(e) => setPasswordDraft(e.target.value)}
            placeholder="Password for this link"
            className="w-full rounded border border-neutral-200 px-2 py-1 text-xs"
            autoFocus
          />
        )}
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={handleCreate}
            disabled={creating}
            className="rounded bg-[var(--lp-orange)] px-3 py-1.5 text-xs text-white hover:opacity-90 disabled:opacity-50"
          >
            {creating ? 'Creating…' : 'Create link'}
          </button>
          <label className="flex items-center gap-1 text-[10px] text-neutral-500">
            <input
              type="checkbox"
              checked={showPasswordField}
              onChange={(e) => {
                setShowPasswordField(e.target.checked);
                if (!e.target.checked) setPasswordDraft('');
              }}
            />
            Protect with password
          </label>
        </div>
      </div>

      {revoked.length > 0 && (
        <details className="mt-3">
          <summary className="cursor-pointer text-[10px] text-neutral-400">
            Revoked ({revoked.length})
          </summary>
          <ul className="mt-1 space-y-1">
            {revoked.map((link) => (
              <li
                key={link.id}
                className="text-[10px] text-neutral-400 font-mono line-through truncate"
              >
                /r/{link.token}
              </li>
            ))}
          </ul>
        </details>
      )}
    </div>
  );
}

function buildPublicUrl(token: string): string {
  if (typeof window === 'undefined') return `/r/${token}`;
  return `${window.location.origin}/r/${token}`;
}
```

**Imports to add at the top of `PackEditor.tsx`** — extend the existing `@/lib/rider-packs/client` import line. Do not add a second import line.

Before:
```tsx
import {
  getPackResolved,
  updatePack,
  deletePack,
  createSection,
  updateSection,
  deleteSection,
} from '@/lib/rider-packs/client';
```

After (add whatever isn't already in the existing list):
```tsx
import {
  getPackResolved,
  updatePack,
  deletePack,
  createSection,
  updateSection,
  deleteSection,
  listWebLinks,
  createWebLink,
  revokeWebLink,
  type WebLink,
} from '@/lib/rider-packs/client';
```

Keep `useCallback` and `useEffect` imports intact — they may already be imported; if not, add them to the existing `react` import.

### Acceptance

```bash
grep -n "function SharingPanel\|function buildPublicUrl\|<SharingPanel " \
  src/components/rider-pack/PackEditor.tsx
```

Expected: 3 lines.

---

## Step 11 — Verify

```bash
# Typecheck
npx tsc --noEmit

# Lint just the new + edited files
npx eslint \
  src/lib/rider-packs/web-links.ts \
  "src/app/api/rider-packs/[id]/web-links/route.ts" \
  "src/app/api/rider-web-links/[id]/route.ts" \
  "src/app/api/public/rider/[token]/route.ts" \
  src/components/rider-pack/ReadOnlyPackView.tsx \
  src/components/rider-pack/PublicRiderView.tsx \
  "src/app/r/[token]/page.tsx" \
  src/lib/supabase-middleware.ts \
  src/components/rider-pack/PackEditor.tsx \
  src/lib/rider-packs/client.ts

# Full build
npx next build

# Git state — should show exactly 7 untracked + 3 modified files.
git status -u --short src/
```

If tsc or eslint flag issues in the new/edited files, fix them in place. Do not touch any file outside the 10 listed. If you hit a blocker (eg. the tsc error involves a field name on a type we didn't own), **stop and report** rather than guessing.

---

## Step 12 — Commit

```bash
git add \
  src/lib/rider-packs/web-links.ts \
  "src/app/api/rider-packs/[id]/web-links" \
  "src/app/api/rider-web-links" \
  "src/app/api/public" \
  src/components/rider-pack/ReadOnlyPackView.tsx \
  src/components/rider-pack/PublicRiderView.tsx \
  "src/app/r" \
  src/lib/supabase-middleware.ts \
  src/components/rider-pack/PackEditor.tsx \
  src/lib/rider-packs/client.ts

git commit -m "feat(rider-pack): public web links + read-only view (R4)

Adds shareable /r/[token] links to rider packs.

New:
- src/lib/rider-packs/web-links.ts  (scrypt hashing, token gen)
- /api/rider-packs/[id]/web-links    GET/POST  (list, create)
- /api/rider-web-links/[id]          DELETE    (soft-revoke)
- /api/public/rider/[token]          POST      (public, service-role)
- ReadOnlyPackView.tsx               pure renderer
- PublicRiderView.tsx                password flow + fetch
- /r/[token]/page.tsx                server shell

Edits:
- supabase-middleware.ts: /r/ bypasses auth redirect
- PackEditor.tsx: Sharing panel in Inspector
- client.ts: WebLink helpers

Still TODO (R5): Google Doc export."

git push
```

---

## Step 13 — Report

Paste:

1. Step 0 pre-flight output (A–G).
2. Step 11: tsc summary, eslint summary, `next build` summary (last 10 lines), git status.
3. The 7 created file paths + the 3 edited file paths.
4. Final commit SHA.
5. Anything you stopped on. If nothing, say "nothing".
