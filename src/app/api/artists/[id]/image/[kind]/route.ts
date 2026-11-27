/* ============================================
   LOWPASS — Sprint 8.4 §1 — Artist image upload + delete

   POST   /api/artists/[id]/image/[kind]
   DELETE /api/artists/[id]/image/[kind]

   `kind` is `logo` or `banner`. Each artist gets at most one
   logo and one banner; both live in the artist-assets bucket
   under a stable path:

     {workspace_id}/{artist_id}/{kind}.{ext}

   The stable path means re-uploads overwrite the previous file
   in place (upsert: true) — no orphan extension switches. On
   delete, we list the prefix and remove anything matching
   {kind}.*, since the file extension may have changed across
   uploads (jpg → png).

   POST writes the resulting public URL to artists.branding
   JSONB (logo_url or banner_url). DELETE clears that field
   AND removes the storage object.

   Bucket policy: artist-assets is public-read per
   migration 007_storage_artist_assets_policies.sql.

   WRITES GO THROUGH THE SERVER (Nov 2026). Uploading as the user hit
   "new row violates row-level security policy": the bucket's write rule
   (278) checks the path against the caller's CURRENT workspace
   (profiles.workspace_id), so anyone working in more than one workspace —
   or on a database where 278 wasn't pasted — couldn't set a logo. The route
   now decides who may write (admin / manager of THIS artist's workspace),
   checks the bytes really are a JPEG / PNG / WebP, and writes that one fixed
   path with the service role. The user can never choose the path.
   ============================================ */

import { NextResponse } from 'next/server';
import { requireWrite } from '@/lib/auth/workspace-check';
import { createServerSupabaseClient, createServiceSupabaseClient } from '@/lib/supabase-server';
import { sniffImage } from '@/lib/riders/photos';

const BUCKET = 'artist-assets';
// Under Vercel's ~4.5 MB request-body limit (a bigger body never reaches us).
const MAX_SIZE = 4 * 1024 * 1024; // 4MB
const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/webp'];
type ArtistRow = {
  id: string;
  workspace_id: string;
  branding: unknown;
};

function readBranding(branding: unknown): Record<string, unknown> {
  if (!branding || typeof branding !== 'object' || Array.isArray(branding)) {
    return {};
  }
  return { ...(branding as Record<string, unknown>) };
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string; kind: string }> },
) {
  const supabase = await createServerSupabaseClient();
  const auth = await requireWrite(supabase);
  if ('error' in auth) return auth.error;
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { id: artistId, kind } = await params;
  if (kind !== 'logo' && kind !== 'banner') {
    return NextResponse.json(
      { error: 'kind must be logo or banner' },
      { status: 400 },
    );
  }

  // Fetch the artist (RLS-scoped) to confirm access + get workspace_id.
  const { data: artist, error: artistErr } = await supabase
    .from('artists')
    .select('id, workspace_id, branding')
    .eq('id', artistId)
    .maybeSingle();

  if (artistErr || !artist) {
    return NextResponse.json({ error: 'Artist not found' }, { status: 404 });
  }
  const artistRow = artist as ArtistRow;
  if (!artistRow.workspace_id) {
    return NextResponse.json(
      { error: 'Artist has no workspace_id' },
      { status: 500 },
    );
  }
  // requireWrite passed for the caller's ACTIVE workspace; the write below is
  // made as the server, so it must be THIS artist's workspace too.
  if (artistRow.workspace_id !== auth.workspaceId) {
    return NextResponse.json(
      { error: 'Switch to this artist’s workspace to change its images.' },
      { status: 403 },
    );
  }

  // Multipart form.
  let formData: FormData;
  try {
    formData = await request.formData();
  } catch {
    return NextResponse.json({ error: 'Invalid form data' }, { status: 400 });
  }

  const file = formData.get('file');
  if (!(file instanceof File)) {
    return NextResponse.json({ error: 'file is required' }, { status: 400 });
  }
  if (!ALLOWED_TYPES.includes(file.type)) {
    return NextResponse.json(
      { error: `Allowed types: ${ALLOWED_TYPES.join(', ')}` },
      { status: 400 },
    );
  }
  if (file.size > MAX_SIZE) {
    return NextResponse.json(
      { error: `File too large (max ${MAX_SIZE / 1024 / 1024}MB)` },
      { status: 400 },
    );
  }

  const buffer = Buffer.from(await file.arrayBuffer());
  // The bytes decide the type, not the browser's label.
  const sniffed = sniffImage(new Uint8Array(buffer.subarray(0, 32)));
  if (sniffed !== 'image/jpeg' && sniffed !== 'image/png' && sniffed !== 'image/webp') {
    return NextResponse.json({ error: 'That file isn’t a JPEG, PNG or WebP image.' }, { status: 400 });
  }
  const ext = sniffed === 'image/jpeg' ? 'jpg' : sniffed === 'image/png' ? 'png' : 'webp';
  const path = `${artistRow.workspace_id}/${artistRow.id}/${kind}.${ext}`;
  const storage = createServiceSupabaseClient().storage;

  // First, list the prefix and remove any prior {kind}.* file with
  // a different extension (so a jpg→png upgrade doesn't leave an
  // orphan jpg). Best-effort; tolerate failures.
  try {
    const prefix = `${artistRow.workspace_id}/${artistRow.id}`;
    const { data: existing } = await storage
      .from(BUCKET)
      .list(prefix, { limit: 100 });
    if (existing) {
      const stale = existing
        .map((entry) => entry.name)
        .filter(
          (name) =>
            name.startsWith(`${kind}.`) && name !== `${kind}.${ext}`,
        )
        .map((name) => `${prefix}/${name}`);
      if (stale.length > 0) {
        await storage.from(BUCKET).remove(stale);
      }
    }
  } catch (err) {
    console.error(
      `[artist-image ${artistId}/${kind}] stale-cleanup failed:`,
      err,
    );
  }

  const { error: upErr } = await storage
    .from(BUCKET)
    .upload(path, buffer, {
      contentType: sniffed,
      upsert: true,
    });

  if (upErr) {
    if (upErr.message?.includes('Bucket not found')) {
      return NextResponse.json(
        {
          error:
            `Storage bucket "${BUCKET}" not found. ` +
            'Run migration 007_storage_artist_assets_policies.sql ' +
            'or create the bucket in Supabase Dashboard → Storage.',
        },
        { status: 503 },
      );
    }
    console.error(
      `[artist-image ${artistId}/${kind}] upload failed:`,
      upErr.message,
    );
    return NextResponse.json({ error: upErr.message }, { status: 500 });
  }

  const { data: urlData } = storage.from(BUCKET).getPublicUrl(path);
  const publicUrl = urlData.publicUrl;

  // Update artists.branding JSONB. Read current value, merge in
  // the new field, write back. Per Sprint 8.4 §1 sign-off: store
  // the public URL directly so <img src={...}> works without
  // additional resolution.
  const branding = readBranding(artistRow.branding);
  branding[kind === 'logo' ? 'logo_url' : 'banner_url'] = publicUrl;

  const { error: updErr } = await supabase
    .from('artists')
    .update({ branding })
    .eq('id', artistId);

  if (updErr) {
    // Storage upload succeeded but DB write failed. Return error
    // so the client can re-try; the storage object is still
    // usable on the next attempt because of upsert: true.
    console.error(
      `[artist-image ${artistId}/${kind}] DB write failed:`,
      updErr.message,
    );
    return NextResponse.json({ error: updErr.message }, { status: 500 });
  }

  return NextResponse.json({ url: publicUrl });
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string; kind: string }> },
) {
  const supabase = await createServerSupabaseClient();
  const auth = await requireWrite(supabase);
  if ('error' in auth) return auth.error;
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { id: artistId, kind } = await params;
  if (kind !== 'logo' && kind !== 'banner') {
    return NextResponse.json(
      { error: 'kind must be logo or banner' },
      { status: 400 },
    );
  }

  const { data: artist, error: artistErr } = await supabase
    .from('artists')
    .select('id, workspace_id, branding')
    .eq('id', artistId)
    .maybeSingle();

  if (artistErr || !artist) {
    return NextResponse.json({ error: 'Artist not found' }, { status: 404 });
  }
  const artistRow = artist as ArtistRow;
  if (artistRow.workspace_id !== auth.workspaceId) {
    return NextResponse.json(
      { error: 'Switch to this artist’s workspace to change its images.' },
      { status: 403 },
    );
  }
  const storage = createServiceSupabaseClient().storage;

  // List the prefix and remove every {kind}.* (covers any
  // extension; we don't trust the URL alone since branding
  // could have a stale value).
  try {
    const prefix = `${artistRow.workspace_id}/${artistRow.id}`;
    const { data: existing } = await storage
      .from(BUCKET)
      .list(prefix, { limit: 100 });
    if (existing && existing.length > 0) {
      const toRemove = existing
        .map((entry) => entry.name)
        .filter((name) => name.startsWith(`${kind}.`))
        .map((name) => `${prefix}/${name}`);
      if (toRemove.length > 0) {
        await storage.from(BUCKET).remove(toRemove);
      }
    }
  } catch (err) {
    console.error(
      `[artist-image ${artistId}/${kind}] storage delete failed:`,
      err,
    );
    // Don't fail the request — the DB clear below is more
    // important. Orphan storage is recoverable later.
  }

  // Clear the branding field.
  const branding = readBranding(artistRow.branding);
  if (kind === 'logo') {
    delete branding.logo_url;
  } else {
    delete branding.banner_url;
  }

  const { error: updErr } = await supabase
    .from('artists')
    .update({ branding })
    .eq('id', artistId);

  if (updErr) {
    return NextResponse.json({ error: updErr.message }, { status: 500 });
  }

  return new NextResponse(null, { status: 204 });
}
