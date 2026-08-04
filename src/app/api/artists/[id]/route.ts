/* ============================================
   LOWPASS — Single Artist API

   GET: Artist by id
   PATCH: Update artist (name, Spotify, branding)
   ============================================ */

import { NextResponse } from 'next/server';
import { requireWrite } from '@/lib/auth/workspace-check';
import { createServerSupabaseClient } from '@/lib/supabase-server';

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { id } = await params;
  const { data, error } = await supabase
    .from('artists')
    .select('*')
    .eq('id', id)
    .single();

  if (error || !data) {
    return NextResponse.json(
      { error: error?.message ?? 'Not found' },
      { status: error?.code === 'PGRST116' ? 404 : 500 }
    );
  }
  return NextResponse.json(data);
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const supabase = await createServerSupabaseClient();
  const auth = await requireWrite(supabase);
  if ('error' in auth) return auth.error;
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { id } = await params;
  const body = await request.json();

  const branding = body.branding ?? {};
  if (body.logo_url !== undefined) branding.logo_url = body.logo_url;
  if (body.banner_url !== undefined) branding.banner_url = body.banner_url;

  const updates: Record<string, unknown> = {};
  if (body.name != null && typeof body.name === 'string') updates.name = body.name.trim();
  if (body.spotify_id !== undefined) updates.spotify_id = body.spotify_id ?? null;
  if (body.spotify_image_url !== undefined) updates.spotify_image_url = body.spotify_image_url ?? null;
  if (body.spotify_banner_url !== undefined) updates.spotify_banner_url = body.spotify_banner_url ?? null;
  if (Object.keys(branding).length) updates.branding = branding;

  if (Object.keys(updates).length === 0) {
    const { data } = await supabase.from('artists').select('*').eq('id', id).single();
    return NextResponse.json(data);
  }

  const { data, error } = await supabase
    .from('artists')
    .update(updates)
    .eq('id', id)
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json(data);
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const supabase = await createServerSupabaseClient();
  const auth = await requireWrite(supabase);
  if ('error' in auth) return auth.error;
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { data: profile } = await supabase
    .from('profiles')
    .select('workspace_id')
    .eq('id', user.id)
    .single();

  if (!profile?.workspace_id) {
    return NextResponse.json({ error: 'No workspace' }, { status: 403 });
  }

  const { id } = await params;
  const workspaceId = profile.workspace_id as string;

  /* ============================================
     Sprint 8.4 §3 — storage cleanup before DB cascade.

     Cascade scope (per audit in Sprint 8.4 §3):
       - tours.artist_id        ON DELETE CASCADE
       - rider_packs.artist_id  ON DELETE CASCADE
       - rider_assets.artist_id ON DELETE CASCADE
       - rider_folders.artist_id ON DELETE CASCADE

     Tours then transitively cascade through all 22 tour-scoped
     tables per Sprint 8.1 §5. The DB-level cleanup is automatic;
     storage objects are NOT and must be enumerated + removed
     manually before the DB delete fires.

     Buckets cleaned (mirroring Sprint 8.2 §5 for tour delete,
     plus the artist's own logo/banner files):
       - artist-assets  ← {workspace_id}/{artist_id}/* (logo, banner)
       - rider-assets   ← rider_assets.storage_path for THIS
                          artist (tours OR artist-wide packs)
       - deal-memos     ← deal_memos.document_url for tours under
                          this artist
       - receipts       ← expenses.receipt_url for tours under
                          this artist

     Buckets DEFERRED (Sprint 8.2 §5 deferred #5b — full URL
     extraction needed):
       - budget-files
       - advance-files

     Failure semantics: storage cleanup runs BEFORE the DB delete
     but failures are LOGGED and do NOT block. Orphans recoverable;
     half-deleted artist is harder to recover.
     ============================================ */

  // Enumerate tour ids under this artist (RLS-scoped).
  const { data: tourRows } = await supabase
    .from('tours')
    .select('id')
    .eq('artist_id', id);
  const tourIds = ((tourRows ?? []) as Array<{ id: string }>).map(
    (t) => t.id,
  );

  // Gather storage paths from the four direct-path tables. Run
  // in parallel; tolerate empties.
  const [
    riderAssetsRes,
    dealMemosRes,
    expensesRes,
  ] = await Promise.all([
    // rider_assets — by artist_id (covers all packs under artist).
    supabase
      .from('rider_assets')
      .select('storage_path')
      .eq('artist_id', id),
    tourIds.length > 0
      ? supabase
          .from('deal_memos')
          .select('document_url')
          .in('tour_id', tourIds)
      : Promise.resolve({ data: [] }),
    tourIds.length > 0
      ? supabase
          .from('expenses')
          .select('receipt_url')
          .in('tour_id', tourIds)
      : Promise.resolve({ data: [] }),
  ]);

  const riderPaths = (
    (riderAssetsRes.data ?? []) as Array<{ storage_path: string | null }>
  )
    .map((r) => r.storage_path)
    .filter((p): p is string => typeof p === 'string' && p.length > 0);

  const dealMemoPaths = (
    (dealMemosRes.data ?? []) as Array<{ document_url: string | null }>
  )
    .map((d) => d.document_url)
    .filter((p): p is string => typeof p === 'string' && p.length > 0);

  const receiptPaths = (
    (expensesRes.data ?? []) as Array<{ receipt_url: string | null }>
  )
    .map((e) => e.receipt_url)
    .filter((p): p is string => typeof p === 'string' && p.length > 0);

  // artist-assets — list the artist's prefix and remove all files.
  const artistPrefix = `${workspaceId}/${id}`;
  let artistAssetPaths: string[] = [];
  try {
    const { data: existing } = await supabase.storage
      .from('artist-assets')
      .list(artistPrefix, { limit: 100 });
    artistAssetPaths = (existing ?? []).map(
      (entry) => `${artistPrefix}/${entry.name}`,
    );
  } catch (err) {
    console.error(
      `[delete-artist ${id}] artist-assets list failed:`,
      err,
    );
  }

  async function cleanBucket(
    bucket: string,
    paths: string[],
  ): Promise<void> {
    if (paths.length === 0) return;
    try {
      const { error: rmErr } = await supabase.storage
        .from(bucket)
        .remove(paths);
      if (rmErr) {
        console.error(
          `[delete-artist ${id}] storage.${bucket}.remove failed:`,
          rmErr.message,
        );
      }
    } catch (err) {
      console.error(
        `[delete-artist ${id}] storage.${bucket}.remove threw:`,
        err,
      );
    }
  }

  await Promise.all([
    cleanBucket('artist-assets', artistAssetPaths),
    cleanBucket('rider-assets', riderPaths),
    cleanBucket('deal-memos', dealMemoPaths),
    cleanBucket('receipts', receiptPaths),
  ]);

  // DB delete — cascades through tours + rider_packs +
  // rider_assets + rider_folders, transitively through all
  // 22 tour-scoped tables.
  const { data: deleted, error } = await supabase
    .from('artists')
    .delete()
    .eq('id', id)
    .eq('workspace_id', workspaceId)
    .select('id');
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  if (!deleted?.length) {
    return NextResponse.json({ error: 'Artist not found' }, { status: 404 });
  }
  return new NextResponse(null, { status: 204 });
}
