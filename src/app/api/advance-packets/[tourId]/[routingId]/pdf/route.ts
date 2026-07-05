/* ============================================
   LOWPASS — GET /api/advance-packets/[tourId]/[routingId]/pdf
   (Sprint 12 §11c — fills the §10 stub)

   Returns the bundled-packet PDF — every rider / channel list
   in the packet concatenated into a single document with
   forced page breaks between docs.

   Two entry paths (mirrors the §10 single-rider endpoint):

     1. Authenticated workspace member. Auth + tour-belongs-to-
        workspace via the §SAFE helpers. RLS gates the
        manifest fetch.

     2. ?token=<packet_link.token>&pw=<optional_password>.
        Service-role lookup scoped to the packet the token
        resolves to. Password gate + revoke check identical
        to the rider public-reader pattern.

   Implementation
     - Build the manifest (lib/advance-packet/manifest).
     - Fetch resolved PublicRiderPayload for every rider /
       channel-list doc (lib/advance-packet/payloads).
     - Concatenate into one HTML doc via buildPacketPdfHtml
       (lib/rider-packs/pdf-render).
     - Render once with Puppeteer + return as
       application/pdf inline.

   Rental jobs in the manifest are not rendered into the
   bundled PDF — no PDF render path exists for them yet.
   Tracked as a §11 follow-up.

   Performance: one Puppeteer call regardless of doc count.
   Cold start ~3-5s, warm ~1-2s. setContent's networkidle
   isn't available (puppeteer-core forbids it on setContent);
   'load' waits for inline <img> tags which is what assets
   need.
   ============================================ */

import { NextResponse } from 'next/server';
import { createServerSupabaseClient, createServiceSupabaseClient } from '@/lib/supabase-server';
import {
  requireUserAndWorkspace,
  requireTourInWorkspace,
} from '@/lib/auth/workspace-check';
import { verifyPassword } from '@/lib/rider-packs/web-links';
import { getBrowser, closePage } from '@/lib/rider-packs/puppeteer';
import { buildPacketPdfHtml } from '@/lib/rider-packs/pdf-render';
import { getPacketManifest, type PacketManifest } from '@/lib/advance-packet/manifest';
import { getPacketRiderPayloads } from '@/lib/advance-packet/payloads';
import type { SupabaseClient } from '@supabase/supabase-js';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

export async function GET(
  request: Request,
  { params }: { params: Promise<{ tourId: string; routingId: string }> },
): Promise<NextResponse | Response> {
  const { tourId, routingId } = await params;
  const url = new URL(request.url);
  const token = url.searchParams.get('token');
  const password = url.searchParams.get('pw');

  /* Branch 1: token-based public access. */
  if (token) {
    const service = createServiceSupabaseClient();
    const { data: link } = await service
      .from('advance_packet_links')
      .select('id, tour_id, routing_id, password_hash, revoked_at')
      .eq('token', token)
      .maybeSingle<{
        id: string;
        tour_id: string;
        routing_id: string | null;
        password_hash: string | null;
        revoked_at: string | null;
      }>();
    if (
      !link ||
      link.revoked_at ||
      link.tour_id !== tourId ||
      (link.routing_id ?? '') !== (routingId ?? '')
    ) {
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
    return renderBundle(service, tourId, routingId);
  }

  /* Branch 2: authenticated workspace member. */
  const supabase = await createServerSupabaseClient();
  const auth = await requireUserAndWorkspace(supabase);
  if ('error' in auth) return auth.error;
  const tourGate = await requireTourInWorkspace(supabase, tourId, auth.workspaceId);
  if (tourGate) return tourGate;
  return renderBundle(supabase, tourId, routingId);
}

/** Shared render path. Build manifest → fetch payloads →
 *  concatenate HTML → Puppeteer → PDF buffer. */
async function renderBundle(
  client: SupabaseClient,
  tourId: string,
  routingId: string,
): Promise<NextResponse | Response> {
  const manifest = await getPacketManifest(client, tourId, routingId);
  if (!manifest) {
    return NextResponse.json({ error: 'Packet not found' }, { status: 404 });
  }

  const payloads = await getPacketRiderPayloads(client, manifest);
  if (payloads.length === 0) {
    return NextResponse.json(
      { error: 'Nothing to render — packet has no riders or channel lists.' },
      { status: 422 },
    );
  }

  const meta = {
    tourName: manifest.tour.name,
    routingLabel: manifest.routing
      ? formatRoutingLabel(manifest.routing)
      : 'All shows',
  };
  const html = buildPacketPdfHtml(payloads, meta);

  const browser = await getBrowser();
  const page = await browser.newPage();
  try {
    await page.setContent(html, { waitUntil: 'load', timeout: 20_000 });
    const buffer = await page.pdf({
      format: 'A4',
      printBackground: true,
      margin: { top: '18mm', right: '16mm', bottom: '22mm', left: '16mm' },
    });

    const safeTour = (manifest.tour.name || 'packet').replace(/[^a-z0-9-_]+/gi, '_');
    const safeRouting = (meta.routingLabel || 'allshows').replace(/[^a-z0-9-_]+/gi, '_');
    const filename = `${safeTour}-${safeRouting}-packet.pdf`;

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

function formatRoutingLabel(r: NonNullable<PacketManifest['routing']>): string {
  const date = new Date(`${r.date.slice(0, 10)}T12:00:00Z`);
  const dateLabel = Number.isNaN(date.getTime())
    ? r.date
    : date.toLocaleDateString('en-GB', {
        day: '2-digit',
        month: 'short',
        year: 'numeric',
      });
  const where = [r.venue, r.city].filter(Boolean).join(', ');
  return where ? `${dateLabel} — ${where}` : dateLabel;
}
