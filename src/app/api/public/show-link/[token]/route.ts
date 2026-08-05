/* ============================================
   LOWPASS — Public Show Link endpoint (rider decouple phase B4)
   POST /api/public/show-link/[token]   body: { password?: string }

   The one venue-facing door for a show. Token-gated, service-role
   scoped, password gate mirroring /api/public/advance-packet.
   Assembles EVERYTHING the /s/[token] tabs render, from the seams
   that already exist:

     · header + docs    — getPacketManifest (venue SSOT via resolveVenue)
     · rider payloads   — getPacketRiderPayloads (riders + channel lists,
                          show → tour → artist order; the client renders
                          them with the B3 grouped ReadOnlyPackView)
     · stage plot SVG   — resolveShowDocuments (show → tour attachment)
                          else newest tour stage_plot pack, rendered
                          server-side via the export loader + SVG builder
     · advance form URL — the routing's newest live advance_intake_link,
                          embedded by the client (that surface stays the
                          ONE intake code path)

   Fails soft per tab: a missing stage plot or intake link nulls that
   tab, never the page. Stamps last_viewed_at best-effort.
   ============================================ */

import { NextResponse } from 'next/server';
import { createServiceSupabaseClient } from '@/lib/supabase-server';
import { verifyPassword, type PublicRiderPayload } from '@/lib/rider-packs/web-links';
import { getPacketManifest, type PacketManifest } from '@/lib/advance-packet/manifest';
import { getPacketRiderPayloads } from '@/lib/advance-packet/payloads';
import { resolveShowDocuments } from '@/lib/rider-packs/attachments';
import { loadStagePlotExportData } from '@/lib/export/stageplot-data';
import { buildStagePlotSvg } from '@/lib/stage-plot/stageplot-svg';

export const dynamic = 'force-dynamic';

interface ShowLinkRow {
  id: string;
  workspace_id: string;
  tour_id: string;
  routing_id: string;
  password_hash: string | null;
  revoked_at: string | null;
}

async function resolveStagePlotSvg(
  service: ReturnType<typeof createServiceSupabaseClient>,
  workspaceId: string,
  tourId: string,
  routingId: string,
): Promise<string | null> {
  try {
    /* Attachment-first (show → tour), else the legacy newest-pack scan. */
    const attached = await resolveShowDocuments(service, tourId, routingId);
    let packId = attached.stage_plot?.document_pack_id ?? null;
    if (!packId) {
      const { data } = await service
        .from('rider_packs')
        .select('id')
        .eq('tour_id', tourId)
        .eq('kind', 'stage_plot')
        .order('updated_at', { ascending: false })
        .limit(1)
        .maybeSingle<{ id: string }>();
      packId = data?.id ?? null;
    }
    if (!packId) return null;
    const { data: plotRow } = await service
      .from('stage_plots')
      .select('id')
      .eq('rider_pack_id', packId)
      .maybeSingle<{ id: string }>();
    if (!plotRow) return null;
    const exportData = await loadStagePlotExportData(service, plotRow.id, workspaceId);
    if (!exportData) return null;
    return buildStagePlotSvg(exportData.plot, exportData.items, exportData.customIcons);
  } catch {
    return null; // the tab shows its empty state; the page never dies on this
  }
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ token: string }> },
): Promise<NextResponse> {
  const { token } = await params;
  if (!token) return NextResponse.json({ error: 'Link not found' }, { status: 404 });

  let body: { password?: unknown } = {};
  try {
    body = (await request.json()) as { password?: unknown };
  } catch {
    /* empty body ok */
  }
  const password = typeof body.password === 'string' ? body.password : null;

  const service = createServiceSupabaseClient();
  const { data: link } = await service
    .from('show_links')
    .select('id, workspace_id, tour_id, routing_id, password_hash, revoked_at')
    .eq('token', token)
    .maybeSingle<ShowLinkRow>();
  if (!link || link.revoked_at) {
    return NextResponse.json({ error: 'Link not found' }, { status: 404 });
  }

  if (link.password_hash) {
    if (!password) return NextResponse.json({ requires_password: true }, { status: 401 });
    const ok = await verifyPassword(password, link.password_hash);
    if (!ok) return NextResponse.json({ invalid_password: true }, { status: 401 });
  }

  const manifest: PacketManifest | null = await getPacketManifest(service, link.tour_id, link.routing_id);
  if (!manifest) return NextResponse.json({ error: 'Show not found' }, { status: 404 });

  const [payloads, stagePlotSvg, intake] = await Promise.all([
    getPacketRiderPayloads(service, manifest).catch(() => [] as PublicRiderPayload[]),
    resolveStagePlotSvg(service, link.workspace_id, link.tour_id, link.routing_id),
    /* The routing's newest live venue-intake link — the Advance tab embeds
       that surface rather than reimplementing the form. (Async IIFE: the
       supabase builder is a thenable, not a Promise — no .catch chaining.) */
    (async (): Promise<string | null> => {
      try {
        const { data } = await service
          .from('advance_intake_links')
          .select('token, revoked_at, expires_at')
          .eq('routing_id', link.routing_id)
          .is('revoked_at', null)
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle<{ token: string; revoked_at: string | null; expires_at: string | null }>();
        if (!data) return null;
        if (data.expires_at && new Date(data.expires_at).getTime() < Date.now()) return null;
        return data.token;
      } catch {
        return null;
      }
    })(),
  ]);

  const ipHeader = request.headers.get('x-forwarded-for') ?? request.headers.get('x-real-ip');
  const ip = ipHeader ? ipHeader.split(',')[0].trim().slice(0, 64) : null;
  try {
    await service
      .from('show_links')
      .update({ last_viewed_at: new Date().toISOString(), last_viewer_ip: ip })
      .eq('id', link.id);
  } catch {
    /* best-effort */
  }

  return NextResponse.json({
    manifest,
    payloads,
    stage_plot_svg: stagePlotSvg,
    intake_url: intake ? `/advance-intake/${encodeURIComponent(intake)}` : null,
    tour_id: link.tour_id,
    routing_id: link.routing_id,
    has_password: !!link.password_hash,
  });
}
