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
  const meta = body.meta && typeof body.meta === 'object' ? body.meta : {};

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
