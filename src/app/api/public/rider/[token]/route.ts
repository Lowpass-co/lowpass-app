/* ============================================
   LOWPASS — Public rider endpoint

   POST /api/public/rider/[token]
        Body: { password?: string }

   Unauthenticated. Uses the service-role Supabase
   client because the caller is a public user.

   Every query is scoped by the pack_id that the
   token resolves to, so scope leakage is not possible.
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

  const { data: link } = await service
    .from('rider_web_links')
    .select('id, pack_id, password_hash, revoked_at')
    .eq('token', token)
    .maybeSingle();

  if (!link || link.revoked_at) {
    return NextResponse.json({ error: 'Link not found' }, { status: 404 });
  }

  if (link.password_hash) {
    if (!password) {
      return NextResponse.json({ requires_password: true }, { status: 401 });
    }

    const ok = await verifyPassword(password, link.password_hash);
    if (!ok) {
      return NextResponse.json({ invalid_password: true }, { status: 401 });
    }
  }

  const { data: pack } = await service
    .from('rider_packs')
    .select('*')
    .eq('id', link.pack_id)
    .maybeSingle<RiderPack>();

  if (!pack) {
    return NextResponse.json({ error: 'Link not found' }, { status: 404 });
  }

  const { data: artist } = await service
    .from('artists')
    .select('name')
    .eq('id', pack.artist_id)
    .maybeSingle();

  const resolved = await resolvePack(service, pack);

  const assetIds = new Set<string>();
  for (const section of resolved.sections) {
    for (const field of section.fields as Field[]) {
      if (field.type === 'asset') {
        const id = (field as FieldAsset).asset_id;
        if (id) assetIds.add(id);
      }
    }
  }

  let signedUrls: Record<string, string | null> = {};
  if (assetIds.size > 0) {
    const { data: assets } = await service
      .from('rider_assets')
      .select('id, asset_type, storage_path, external_url')
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
