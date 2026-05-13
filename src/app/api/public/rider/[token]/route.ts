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
import { listMics } from '@/lib/rider-packs/mic-library';
import type {
  Field,
  FieldAsset,
  FieldText,
  MicLibraryEntry,
  RiderPack,
} from '@/lib/rider-packs/types';
import {
  resolveVariableMap,
  substituteInText,
  substituteInTiptapDoc,
} from '@/lib/rider-packs/variable-resolver';

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
    .select('name, default_logo_url')
    .eq('id', pack.artist_id)
    .maybeSingle<{ name: string; default_logo_url: string | null }>();

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

  /* Sprint 12 §9b — resolve cover logo with the spec cascade:
       cover_logo_url override → artists.default_logo_url → null.
     If the resolved value looks like a storage-bucket path
     rather than an external URL, sign it through the
     rider-assets bucket so the public reader can render it
     without an authenticated session. External URLs (http(s)://
     prefix) pass through unchanged. */
  const rawCoverLogo =
    pack.cover_logo_url ?? artist?.default_logo_url ?? null;
  let coverLogoResolved: string | null = rawCoverLogo;
  if (rawCoverLogo && !/^https?:\/\//i.test(rawCoverLogo)) {
    const { data: signed } = await service.storage
      .from('rider-assets')
      .createSignedUrl(rawCoverLogo, 60 * 60);
    coverLogoResolved = signed?.signedUrl ?? null;
  }

  /* Sprint 12 §9c1.a — build the variable map once per page
     render and apply it to every text-bearing field before
     building the payload. Plain-text fields (cover, legacy
     FieldText.value, section titles) get regex substitution;
     rich-text sections get a Tiptap doc walk that replaces
     VariableNode instances with text nodes carrying the
     resolved value. */
  const varMap = await resolveVariableMap(service, pack);

  const sectionsResolved = resolved.sections.map((s) => {
    let fields = s.fields;
    /* Walk Field[] arrays. Only the FieldText variant carries
       a `.value` string that's worth substituting. Other field
       types pass through unchanged. */
    if (Array.isArray(fields)) {
      fields = (fields as Field[]).map((f) => {
        if (f.type === 'text' && typeof (f as FieldText).value === 'string') {
          return {
            ...(f as FieldText),
            value: substituteInText((f as FieldText).value, varMap),
          };
        }
        return f;
      });
    }
    /* Rich-text sections store the Tiptap doc on
       metadata.content. Walk + transform; surface the new
       content back on the metadata object so the reader
       sees pre-resolved text. */
    let metadata = s.metadata ?? null;
    if (s.section_type === 'rich_text' && metadata && typeof metadata === 'object') {
      const meta = metadata as Record<string, unknown>;
      const content = meta.content;
      if (content && typeof content === 'object') {
        metadata = {
          ...meta,
          content: substituteInTiptapDoc(content as Parameters<typeof substituteInTiptapDoc>[0], varMap),
        };
      }
    }
    /* Sprint 12 §10 follow-up — surface channel_list section
       data. resolve.ts already attaches sub-snakes / stage-
       boxes / rows for channel_list sections; pre-§10 this
       endpoint dropped them on the floor. Pass them through
       so the public reader + PDF can render the full grid. */
    const isChannelList = s.section_type === 'channel_list';
    return {
      id: s.id,
      section_key: s.section_key,
      title: substituteInText(s.title, varMap),
      sort_order: s.sort_order,
      section_type: s.section_type,
      fields,
      metadata,
      inherited_from: s.inherited_from,
      source_pack_id: s.source_pack_id,
      sub_snakes: isChannelList ? s.subSnakes ?? [] : undefined,
      stage_boxes: isChannelList ? s.stageBoxes ?? [] : undefined,
      rows: isChannelList ? s.rows ?? [] : undefined,
    };
  });

  /* Sprint 12 §10 follow-up — fetch the mic library for the
     pack's workspace if any section is a channel_list. The
     render uses entries to map row.mic -> kind badge. Errors
     are non-fatal (empty list just means no badges). */
  let mics: MicLibraryEntry[] = [];
  if (sectionsResolved.some((s) => s.section_type === 'channel_list')) {
    try {
      mics = await listMics(service, pack.workspace_id);
    } catch {
      mics = [];
    }
  }

  const payload: PublicRiderPayload = {
    pack: {
      id: pack.id,
      title: substituteInText(pack.title, varMap) || null,
      scope: pack.scope,
      artist_id: pack.artist_id,
      artist_name: artist?.name ?? 'Unknown artist',
      cover_logo_url: coverLogoResolved,
      cover_subtitle: substituteInText(pack.cover_subtitle, varMap) || null,
      cover_disclaimer: substituteInText(pack.cover_disclaimer, varMap) || null,
      updated_at: pack.updated_at,
    },
    sections: sectionsResolved,
    signedUrls,
    mics,
  };

  return NextResponse.json(payload);
}
