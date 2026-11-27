/* ============================================
   GET /api/public/riders/[token]/pdf — the promoter's PDF: the LATEST
   published version, filtered to the link's show (with that show's settled
   lines), stamped with its version and date. Service role after the token
   check; nothing unpublished is ever rendered.
   ============================================ */

import { NextResponse } from 'next/server';
import type { SupabaseClient } from '@supabase/supabase-js';
import { createServiceSupabaseClient } from '@/lib/supabase-server';
import { exportErrorResponse, exportPdfResponse } from '@/lib/export/render';
import { loadPublicRider, TOKEN_RE } from '@/server/riders/public';
import { riderPdfDoc } from '@/server/riders/pdf';
import { changeReaches } from '@/lib/riders/summary';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

export async function GET(request: Request, { params }: { params: Promise<{ token: string }> }) {
  try {
    const { token } = await params;
    if (!TOKEN_RE.test(token)) return NextResponse.json({ error: 'Not found' }, { status: 404 });
    const service = createServiceSupabaseClient() as unknown as SupabaseClient;
    const r = await loadPublicRider(service, token, { recordView: false });
    if (!r) return NextResponse.json({ error: 'This link isn’t active any more.' }, { status: 404 });
    if (!r.snapshot || !r.versions[0]) return NextResponse.json({ error: 'Nothing published yet.' }, { status: 404 });
    const v = r.versions[0];
    const snapshot = r.snapshot;
    const linkUrl = `${new URL(request.url).origin}/r/${token}`;
    return exportPdfResponse('rider-public', () =>
      riderPdfDoc({ tourId: r.tourId, snapshot, version: { label: v.label, publishedAt: v.publishedAt }, show: r.show, states: r.states, changes: r.show ? v.changes.filter((c) => changeReaches(c, r.show!, snapshot.embeds)) : v.changes, linkUrl }),
    );
  } catch (e) {
    return exportErrorResponse('rider-public', e);
  }
}
