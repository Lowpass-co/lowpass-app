/* ============================================
   GET /api/tours/[id]/riders/pdf?version=<id>|draft&routingId=&kind=
   The rider PDF for the team: a published version (default: the latest) or
   the draft as it stands, for the whole tour or one show (that day's lines +
   settled states). Read-only; the database decides what the caller sees.
   ============================================ */

import { NextResponse } from 'next/server';
import type { SupabaseClient } from '@supabase/supabase-js';
import { createServerSupabaseClient } from '@/lib/supabase-server';
import { requireUserAndWorkspace } from '@/lib/auth/workspace-check';
import { exportErrorResponse, exportPdfResponse } from '@/lib/export/render';
import { tourGate } from '@/server/advance/routeGuard';
import { isUuid } from '@/lib/riders/blocks';
import { parseSnapshot } from '@/lib/riders/snapshot';
import { diffSnapshots } from '@/lib/riders/summary';
import type { LineStateView } from '@/lib/riders/render';
import type { RiderKind } from '@/lib/riders/types';
import { VERSION_COLS, loadRiderShows, toVersion } from '@/server/riders/data';
import { draftSnapshot, latestVersion } from '@/server/riders/actions';
import { riderPdfDoc } from '@/server/riders/pdf';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id: tourId } = await params;
    const url = new URL(request.url);
    const supabase = await createServerSupabaseClient();
    const auth = await requireUserAndWorkspace(supabase);
    if ('error' in auth) return auth.error;
    const gate = await tourGate(supabase, tourId, auth.workspaceId);
    if (gate) return gate;
    const client = supabase as unknown as SupabaseClient;
    const versionParam = url.searchParams.get('version');
    const routingId = url.searchParams.get('routingId');
    const kind = url.searchParams.get('kind');
    const kinds: RiderKind[] | undefined = kind === 'tech' || kind === 'hospitality' ? [kind] : undefined;

    let snapshot;
    let version: { label: string; publishedAt: string } | null = null;
    let changes: ReturnType<typeof diffSnapshots> = [];
    if (versionParam === 'draft') {
      const [draft, prev] = await Promise.all([draftSnapshot(client, tourId), latestVersion(client, tourId)]);
      snapshot = draft;
      changes = diffSnapshots(prev?.snapshot ?? null, draft);
    } else if (versionParam && isUuid(versionParam)) {
      const { data } = await client.from('rider_versions').select(`${VERSION_COLS}, snapshot`).eq('id', versionParam).eq('tour_id', tourId).maybeSingle();
      if (!data) return NextResponse.json({ error: 'Version not found' }, { status: 404 });
      const v = toVersion(data as Record<string, unknown>);
      snapshot = parseSnapshot((data as { snapshot: unknown }).snapshot);
      version = { label: v.label, publishedAt: v.publishedAt };
      changes = v.changes;
    } else {
      const latest = await latestVersion(client, tourId);
      if (!latest) return NextResponse.json({ error: 'Nothing published yet — publish first, or download the draft.' }, { status: 404 });
      snapshot = latest.snapshot;
      version = { label: latest.label, publishedAt: latest.publishedAt };
      changes = latest.changes;
    }

    let show: { date: string; venue: string | null; city: string | null } | null = null;
    const states: Record<string, LineStateView> = {};
    if (routingId && isUuid(routingId)) {
      const [shows, { data: st }] = await Promise.all([
        loadRiderShows(client, tourId),
        client.from('rider_line_states').select('block_id, state, note').eq('routing_id', routingId).eq('tour_id', tourId),
      ]);
      const s = shows.find((x) => x.routingId === routingId);
      if (!s) return NextResponse.json({ error: 'Show not found' }, { status: 404 });
      show = { date: s.date, venue: s.venue, city: s.city };
      for (const r of (st ?? []) as { block_id: string; state: LineStateView['state']; note: string | null }[]) states[r.block_id] = { state: r.state, note: r.note };
    }
    const snap = snapshot;
    return exportPdfResponse('rider', () => riderPdfDoc({ snapshot: snap, version, show, states, changes, linkUrl: null, kinds }));
  } catch (e) {
    return exportErrorResponse('rider', e);
  }
}
