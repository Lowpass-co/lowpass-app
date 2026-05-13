/* ============================================
   LOWPASS — GET /api/rider-packs/[id]/pdf
   (Sprint 12 §10)

   Renders a single rider pack to PDF via Puppeteer.

   Auth: TWO accepted entry points.
     1. Authenticated workspace member — RLS gates the
        pack lookup. The endpoint mirrors the resolve flow
        used by /api/public/rider/[token].
     2. ?token=<rider_web_link.token> — service-role lookup
        scoped to the pack the token resolves to.
        Token can be password-protected — pass &pw=<pw> in
        that case. This is the path the bundle endpoint
        (§11) will follow when it stitches multiple riders
        into a single packet PDF.

   Output: application/pdf with a Content-Disposition that
   names the file "<artist> - <rider>.pdf". Buffer is
   returned inline so calling code can also re-use the
   bytes for the bundle workflow.

   Performance notes:
     - Puppeteer's getBrowser() caches the Chromium instance
       on the function module. Warm renders ~1-2s, cold ~5s.
     - page.setContent with our self-contained HTML doc means
       no asset bundle resolution is needed; any external
       images (cover logo, asset fields) reach out at PDF
       generation time.
     - waitUntil: 'load' on setContent — puppeteer-core
       intentionally disallows networkidle0/2 on setContent
       (no navigation event). 'load' waits for inline
       resources (<img>) which is what we actually need;
       async XHRs aren't part of the static markup.

   The route ALWAYS closes its page in a finally block — the
   browser instance is intentionally kept alive across requests
   (see puppeteer.ts). Leaking the browser would burn Vercel's
   per-instance memory budget within 10-20 renders.
   ============================================ */

import { NextResponse } from 'next/server';
import { createServerSupabaseClient, createServiceSupabaseClient } from '@/lib/supabase-server';
import { resolvePack } from '@/lib/rider-packs/resolve';
import { signedUrlsForAssets } from '@/lib/rider-packs/assets';
import { verifyPassword, type PublicRiderPayload } from '@/lib/rider-packs/web-links';
import type { Field, FieldAsset, FieldText, RiderPack } from '@/lib/rider-packs/types';
import {
  resolveVariableMap,
  substituteInText,
  substituteInTiptapDoc,
} from '@/lib/rider-packs/variable-resolver';
import { getBrowser, closePage } from '@/lib/rider-packs/puppeteer';
import { buildRiderPdfHtml } from '@/lib/rider-packs/pdf-render';
import type { SupabaseClient } from '@supabase/supabase-js';

export const dynamic = 'force-dynamic';
/* Plenty of headroom for cold-start Chromium + render. The
   Pro plan cap is 60s; we should land well under in practice. */
export const maxDuration = 60;

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse | Response> {
  const { id: packId } = await params;
  const url = new URL(request.url);
  const token = url.searchParams.get('token');
  const password = url.searchParams.get('pw');

  /* Branch 1: token-based public access. Mirrors the
     /api/public/rider/[token] auth/password flow but lands
     in the same render pipeline. */
  if (token) {
    const service = createServiceSupabaseClient();
    const { data: link } = await service
      .from('rider_web_links')
      .select('id, pack_id, password_hash, revoked_at')
      .eq('token', token)
      .maybeSingle();

    if (!link || link.revoked_at || link.pack_id !== packId) {
      return NextResponse.json({ error: 'Link not found' }, { status: 404 });
    }
    if (link.password_hash) {
      if (!password) {
        return NextResponse.json({ error: 'Password required' }, { status: 401 });
      }
      const ok = await verifyPassword(password, link.password_hash);
      if (!ok) {
        return NextResponse.json({ error: 'Invalid password' }, { status: 401 });
      }
    }
    return renderPdf(service, packId);
  }

  /* Branch 2: authenticated workspace member. RLS scopes the
     pack lookup; no extra workspace check needed. */
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  return renderPdf(supabase, packId);
}

/** Shared render path. Loads the pack + resolves variables,
 *  composes the print HTML, fires Puppeteer, returns the PDF
 *  buffer. Errors propagate as 4xx/5xx. */
async function renderPdf(client: SupabaseClient, packId: string): Promise<NextResponse | Response> {
  const { data: pack } = await client
    .from('rider_packs')
    .select('*')
    .eq('id', packId)
    .maybeSingle<RiderPack>();
  if (!pack) {
    return NextResponse.json({ error: 'Pack not found' }, { status: 404 });
  }

  const { data: artist } = await client
    .from('artists')
    .select('name, default_logo_url')
    .eq('id', pack.artist_id)
    .maybeSingle<{ name: string; default_logo_url: string | null }>();

  const resolved = await resolvePack(client, pack);

  /* Sign asset URLs. Identical to the public reader's flow —
     we deliberately use the same helpers so the PDF is byte-
     equivalent to what the web reader renders for the same
     pack. */
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
    const { data: assets } = await client
      .from('rider_assets')
      .select('id, asset_type, storage_path, external_url')
      .in('id', Array.from(assetIds));
    if (assets) {
      signedUrls = await signedUrlsForAssets(client, assets);
    }
  }

  /* Cover logo cascade (mirror of public route). */
  const rawCoverLogo = pack.cover_logo_url ?? artist?.default_logo_url ?? null;
  let coverLogoResolved: string | null = rawCoverLogo;
  if (rawCoverLogo && !/^https?:\/\//i.test(rawCoverLogo)) {
    const { data: signed } = await client.storage
      .from('rider-assets')
      .createSignedUrl(rawCoverLogo, 60 * 60);
    coverLogoResolved = signed?.signedUrl ?? null;
  }

  /* Variable substitution. */
  const varMap = await resolveVariableMap(client, pack);

  const sectionsResolved = resolved.sections.map((s) => {
    let fields = s.fields;
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
    };
  });

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
  };

  const html = buildRiderPdfHtml(payload);

  const browser = await getBrowser();
  const page = await browser.newPage();
  try {
    await page.setContent(html, { waitUntil: 'load', timeout: 15_000 });
    const buffer = await page.pdf({
      format: 'A4',
      printBackground: true,
      margin: { top: '18mm', right: '16mm', bottom: '22mm', left: '16mm' },
    });

    const safeArtist = (payload.pack.artist_name || 'rider').replace(/[^a-z0-9-_]+/gi, '_');
    const safeTitle = (payload.pack.title || 'rider').replace(/[^a-z0-9-_]+/gi, '_');
    const filename = `${safeArtist}-${safeTitle}.pdf`;

    return new Response(new Uint8Array(buffer), {
      status: 200,
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `inline; filename="${filename}"`,
        'Cache-Control': 'no-store',
      },
    });
  } finally {
    await closePage(page);
  }
}
