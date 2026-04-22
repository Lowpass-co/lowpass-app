# Cursor Prompt — Rider/Pack R2b: Assets API

Third Rider/Pack PR. R1 shipped migration 034 (`1210645`). R2 shipped the packs/sections API (`f1f1e63`). R2b adds asset metadata CRUD + signed-URL generation.

**Uploads are NOT proxied through Next.js.** The client uploads directly to the `rider-assets` storage bucket using the Supabase JS client, then POSTs the metadata row to this API. This is simpler and faster.

**Scope:** metadata CRUD + signed URL generation only. No UI, no upload route in Next.js, no changes to migration 034.

---

## Files this PR creates (exact list)

1. `src/lib/rider-packs/assets.ts` — helpers: storage-path validation + signed URL generation
2. `src/app/api/rider-assets/route.ts` — GET (list with scope filters) + POST (create metadata)
3. `src/app/api/rider-assets/[id]/route.ts` — GET (single, with signed URL) + PATCH + DELETE

---

## Hard rules

1. Do not create any file not listed above.
2. Do not edit existing `.ts`/`.tsx` files.
3. Do not modify migration 034 or any existing migration.
4. Do not add an upload proxy route — client uploads direct to bucket via Supabase JS.
5. Storage paths MUST be prefixed with `{workspace_id}/` — validate this server-side on POST and reject if the claimed path doesn't match the caller's workspace.
6. If anything is ambiguous, stop and report.

---

## Step 0 — Pre-flight

```bash
# A. R2 is merged
git log --oneline -3 "src/app/api/rider-packs/route.ts"

# B. None of the R2b files exist
ls src/app/api/rider-assets/ 2>&1 | head -3
ls src/lib/rider-packs/assets.ts 2>&1

# C. Existing types exist (we import from them)
grep -n "export type RiderPack\|PackScope" src/lib/rider-packs/types.ts | head -3

# D. Migration 034 created the rider-assets bucket
grep -n "'rider-assets'" database/migrations/034_rider_pack_system.sql | head -3
```

### Acceptance

- A: prints commit `f1f1e63` or the R2 commit SHA.
- B: both prints are "No such file or directory".
- C: prints 2+ lines.
- D: prints at least 2 lines (bucket insert + policies).

---

## Step 1 — Assets helper

Create `src/lib/rider-packs/assets.ts`:

```ts
/* ============================================
   LOWPASS — Rider/Pack asset helpers

   Path convention: {workspace_id}/{artist_id}/{uuid}-{filename}
   Workspace prefix is enforced on writes so one workspace can't
   reference another's files by path.
   ============================================ */

import type { SupabaseClient } from '@supabase/supabase-js';

export const RIDER_ASSETS_BUCKET = 'rider-assets';
const SIGNED_URL_TTL_SECONDS = 60 * 60; // 1 hour

export function isValidStoragePathForWorkspace(
  storagePath: string | null | undefined,
  workspaceId: string,
): boolean {
  if (!storagePath || typeof storagePath !== 'string') return false;
  if (!workspaceId) return false;
  // Must start with '{workspace_id}/' and be non-empty after.
  const prefix = `${workspaceId}/`;
  return storagePath.startsWith(prefix) && storagePath.length > prefix.length;
}

/**
 * Given an asset row with storage_path, return a short-lived signed URL.
 * Returns null for non-storage assets (asset_type = 'url') or on error.
 */
export async function signedUrlForAsset(
  supabase: SupabaseClient,
  asset: {
    asset_type: string;
    storage_path: string | null;
    external_url: string | null;
  },
): Promise<string | null> {
  if (asset.asset_type === 'url') return asset.external_url ?? null;
  if (!asset.storage_path) return null;

  const { data, error } = await supabase.storage
    .from(RIDER_ASSETS_BUCKET)
    .createSignedUrl(asset.storage_path, SIGNED_URL_TTL_SECONDS);

  if (error || !data?.signedUrl) return null;
  return data.signedUrl;
}

/** Bulk helper for list endpoints — returns URLs keyed by asset id. */
export async function signedUrlsForAssets(
  supabase: SupabaseClient,
  assets: Array<{
    id: string;
    asset_type: string;
    storage_path: string | null;
    external_url: string | null;
  }>,
): Promise<Record<string, string | null>> {
  const out: Record<string, string | null> = {};
  for (const a of assets) {
    out[a.id] = await signedUrlForAsset(supabase, a);
  }
  return out;
}
```

### Acceptance

```bash
grep -n "RIDER_ASSETS_BUCKET\|isValidStoragePathForWorkspace\|signedUrlForAsset" src/lib/rider-packs/assets.ts
```

Expected: 3+ lines.

---

## Step 2 — `GET`/`POST /api/rider-assets`

Create `src/app/api/rider-assets/route.ts`:

```ts
/* ============================================
   LOWPASS — Rider assets collection

   GET  /api/rider-assets?artist_id=...&scope=...&tour_id=...&routing_id=...
        Returns assets + signedUrls map keyed by asset id.

   POST /api/rider-assets   body: {
          scope, artist_id,
          tour_id?, routing_id?,
          asset_type, label,
          storage_path? (for image|file),
          external_url? (for url),
          meta?
        }
   ============================================ */

import { NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase-server';
import {
  isValidStoragePathForWorkspace,
  signedUrlsForAssets,
} from '@/lib/rider-packs/assets';
import type { PackScope } from '@/lib/rider-packs/types';

const SCOPES: PackScope[] = ['artist', 'tour', 'show'];
const ASSET_TYPES = ['image', 'file', 'url'] as const;

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

  let query = supabase.from('rider_assets').select('*');
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

  const assets = data ?? [];
  const signedUrls = await signedUrlsForAssets(supabase, assets);
  return NextResponse.json({ assets, signedUrls });
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
  const assetType = body.asset_type as string | undefined;
  const label = body.label as string | undefined;
  const storagePath = (body.storage_path as string | undefined) ?? null;
  const externalUrl = (body.external_url as string | undefined) ?? null;
  const meta = (body.meta && typeof body.meta === 'object') ? body.meta : {};

  if (!scope || !SCOPES.includes(scope)) {
    return NextResponse.json({ error: 'scope must be artist|tour|show' }, { status: 400 });
  }
  if (!artistId) {
    return NextResponse.json({ error: 'artist_id is required' }, { status: 400 });
  }
  if (!assetType || !ASSET_TYPES.includes(assetType as (typeof ASSET_TYPES)[number])) {
    return NextResponse.json({ error: 'asset_type must be image|file|url' }, { status: 400 });
  }
  if (!label || typeof label !== 'string') {
    return NextResponse.json({ error: 'label is required' }, { status: 400 });
  }

  // Scope-shape mirrors the DB CHECK.
  if (scope === 'artist' && (tourId || routingId)) {
    return NextResponse.json({ error: 'artist scope cannot have tour_id or routing_id' }, { status: 400 });
  }
  if (scope === 'tour' && (!tourId || routingId)) {
    return NextResponse.json({ error: 'tour scope requires tour_id and no routing_id' }, { status: 400 });
  }
  if (scope === 'show' && (!tourId || !routingId)) {
    return NextResponse.json({ error: 'show scope requires both tour_id and routing_id' }, { status: 400 });
  }

  // Payload-shape mirrors the DB CHECK.
  if (assetType === 'url' && !externalUrl) {
    return NextResponse.json({ error: 'url type requires external_url' }, { status: 400 });
  }
  if ((assetType === 'image' || assetType === 'file') && !storagePath) {
    return NextResponse.json({ error: `${assetType} type requires storage_path` }, { status: 400 });
  }

  // Workspace lookup.
  const { data: profile } = await supabase
    .from('profiles')
    .select('workspace_id')
    .eq('id', user.id)
    .single();
  if (!profile?.workspace_id) {
    return NextResponse.json({ error: 'No workspace' }, { status: 403 });
  }

  // Critical: the claimed storage_path MUST live under this workspace's prefix.
  if (storagePath && !isValidStoragePathForWorkspace(storagePath, profile.workspace_id)) {
    return NextResponse.json(
      { error: 'storage_path must be prefixed with your workspace_id' },
      { status: 400 },
    );
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
    .from('rider_assets')
    .insert({
      workspace_id: profile.workspace_id,
      scope,
      artist_id: artistId,
      tour_id: tourId,
      routing_id: routingId,
      asset_type: assetType,
      label,
      storage_path: storagePath,
      external_url: externalUrl,
      meta,
      created_by: user.id,
    })
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  return NextResponse.json(inserted, { status: 201 });
}
```

### Acceptance

```bash
grep -n "export async function \(GET\|POST\)" src/app/api/rider-assets/route.ts
grep -n "isValidStoragePathForWorkspace\|signedUrlsForAssets" src/app/api/rider-assets/route.ts
```

Expected: 2 export lines, 2 helper-import lines.

---

## Step 3 — `GET`/`PATCH`/`DELETE /api/rider-assets/[id]`

Create `src/app/api/rider-assets/[id]/route.ts`:

```ts
/* ============================================
   LOWPASS — Rider asset single row

   GET    /api/rider-assets/[id]  → asset + signedUrl
   PATCH  /api/rider-assets/[id]  → update metadata (whitelist)
   DELETE /api/rider-assets/[id]  → delete metadata row + storage object
   ============================================ */

import { NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase-server';
import {
  RIDER_ASSETS_BUCKET,
  signedUrlForAsset,
} from '@/lib/rider-packs/assets';

const ALLOWED_PATCH_FIELDS = new Set<string>([
  'label',
  'scope',
  'tour_id',
  'routing_id',
  'meta',
  // asset_type, storage_path, external_url intentionally NOT editable
  // (create a new asset rather than mutating payload shape)
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

  const { data: asset, error } = await supabase
    .from('rider_assets')
    .select('*')
    .eq('id', id)
    .maybeSingle();
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  if (!asset) {
    return NextResponse.json({ error: 'Asset not found' }, { status: 404 });
  }

  const signedUrl = await signedUrlForAsset(supabase, asset);
  return NextResponse.json({ asset, signedUrl });
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

  // If scope changed, the shape CHECK must still hold; DB will reject otherwise.
  // We don't pre-validate because we don't have the merged final-state here;
  // trust the DB CHECK.

  const { data: updated, error } = await supabase
    .from('rider_assets')
    .update(updates)
    .eq('id', id)
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

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

  // Fetch first so we know the storage_path (if any) to clean up.
  const { data: before } = await supabase
    .from('rider_assets')
    .select('*')
    .eq('id', id)
    .maybeSingle();
  if (!before) {
    return NextResponse.json({ error: 'Asset not found' }, { status: 404 });
  }

  const { error: delErr } = await supabase
    .from('rider_assets')
    .delete()
    .eq('id', id);
  if (delErr) {
    return NextResponse.json({ error: delErr.message }, { status: 400 });
  }

  // Best-effort: remove storage object. Failure here shouldn't fail the whole request
  // because the metadata row is already gone; log and continue.
  if (before.storage_path) {
    const { error: storageErr } = await supabase.storage
      .from(RIDER_ASSETS_BUCKET)
      .remove([before.storage_path]);
    if (storageErr) {
      console.warn('[rider-assets] storage cleanup failed', {
        assetId: id,
        storagePath: before.storage_path,
        error: storageErr.message,
      });
    }
  }

  return NextResponse.json({ ok: true });
}
```

### Acceptance

```bash
grep -n "export async function \(GET\|PATCH\|DELETE\)" "src/app/api/rider-assets/[id]/route.ts"
grep -n "ALLOWED_PATCH_FIELDS\|RIDER_ASSETS_BUCKET\|signedUrlForAsset" "src/app/api/rider-assets/[id]/route.ts"
```

Expected: 3 export lines, 3+ helper lines.

---

## Step 4 — Final verification

```bash
# 1. TypeScript clean
npx tsc --noEmit 2>&1 | tail -20

# 2. Lint
npx eslint \
  "src/lib/rider-packs/assets.ts" \
  "src/app/api/rider-assets/**/*.ts" \
  2>&1 | tail -20

# 3. Only expected files changed
git status --short src/

# 4. Count: exactly 3 new files
git status --short src/ | grep -E "^\?\? (src/lib/rider-packs/assets\.ts|src/app/api/rider-assets/)" | wc -l
```

### Expected

- tsc clean. If broken in existing code, report and move on.
- eslint clean on the 3 touched files.
- `git status`: exactly the 3 new files.
- Count: `3`.

If count isn't 3 or anything unexpected appears, STOP. Revert. Report.

---

## Step 5 — Commit + push

```bash
git add src/lib/rider-packs/assets.ts "src/app/api/rider-assets/"
git commit -m "feat(rider-pack): assets API (R2b)

Metadata CRUD + signed-URL generation for rider-pack assets.
Upload bytes go directly from client to the rider-assets bucket
via the Supabase JS client; this PR adds only the server-side
metadata surface.

Files:
- src/lib/rider-packs/assets.ts
  - isValidStoragePathForWorkspace: enforces {workspace_id}/ prefix
  - signedUrlForAsset / signedUrlsForAssets: 1-hour signed URLs
- src/app/api/rider-assets/route.ts       GET (with filters) + POST
- src/app/api/rider-assets/[id]/route.ts  GET + PATCH + DELETE

PATCH is label/scope/tour_id/routing_id/meta only — asset_type
and payload fields (storage_path, external_url) are immutable;
re-upload as a new asset rather than mutating the shape.

DELETE cleans up the storage object best-effort after the
metadata row is removed.

Security:
- RLS from migration 034 is the real gate.
- API enforces workspace prefix on storage_path.
- Bucket is private — all reads go via signed URL."

git push
```

---

## Step 6 — Report

1. Step 0 output (A–D).
2. Step 4 tsc + eslint + git status + count.
3. The 3 created files (paths).
4. Final commit SHA.
5. Anything stopped on (ideally nothing).

---

## Out of scope

- Any UI.
- Upload proxying through Next.js (client uploads direct to bucket).
- Bulk delete endpoint.
- Asset reassignment across artists (would need a separate endpoint).
- History logging on asset changes (not in the design scope for v1 — if wanted, add in a later PR).
- Migration changes.
