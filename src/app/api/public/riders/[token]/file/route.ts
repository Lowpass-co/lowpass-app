/* ============================================
   GET /api/public/riders/[token]/file?kind=channel_list|stage_plot|file&id=
   An attachment of the link's LATEST published version, and nothing else
   (publicAttachment checks the version lists it): the input list / stage
   plot as PDFs (the same builders as the team's exports, service role,
   scoped to the link's tour + workspace), a tour file as a 60-second
   signed download.
   ============================================ */

import { NextResponse } from 'next/server';
import type { SupabaseClient } from '@supabase/supabase-js';
import { createServiceSupabaseClient } from '@/lib/supabase-server';
import { exportErrorResponse, exportPdfResponse } from '@/lib/export/render';
import { buildChannelListExport, buildStagePlotExport } from '@/lib/export/build';
import { lowpassMarkDataUri } from '@/lib/export/logo';
import { normalizeConfig } from '@/lib/export/template-config';
import { publicAttachment, TOKEN_RE } from '@/server/riders/public';
import { riderErrorResponse } from '@/server/riders/http';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

export async function GET(request: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  if (!TOKEN_RE.test(token)) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  const url = new URL(request.url);
  const service = createServiceSupabaseClient() as unknown as SupabaseClient;
  let found;
  try {
    found = await publicAttachment(service, token, url.searchParams.get('kind'), url.searchParams.get('id'));
  } catch (e) {
    return riderErrorResponse(e, 'public:file');
  }
  const { link, attachment } = found;
  try {
    if (attachment.kind === 'file') {
      const { data: f } = await service
        .from('file_references')
        .select('file_name, storage_provider, provider_file_id')
        .eq('id', attachment.id!)
        .eq('workspace_id', link.workspace_id)
        .eq('linked_to_type', 'tour')
        .eq('linked_to_id', link.tour_id)
        .maybeSingle();
      const file = f as { file_name: string | null; storage_provider: string; provider_file_id: string | null } | null;
      if (!file || file.storage_provider !== 'tour-files' || !file.provider_file_id) return NextResponse.json({ error: 'That file isn’t available.' }, { status: 404 });
      const { data } = await service.storage.from('tour-files').createSignedUrl(file.provider_file_id, 60, { download: file.file_name ?? 'file' });
      if (!data?.signedUrl) return NextResponse.json({ error: 'That file isn’t available.' }, { status: 404 });
      return NextResponse.redirect(data.signedUrl, 302);
    }
    const { data: tour } = await service.from('tours').select('id, name, artist_id').eq('id', link.tour_id).eq('workspace_id', link.workspace_id).maybeSingle();
    if (!tour) return NextResponse.json({ error: 'Not found' }, { status: 404 });
    const t = tour as { id: string; name: string | null; artist_id: string | null };
    if (attachment.kind === 'channel_list') {
      return exportPdfResponse('rider-input-list', async () => {
        const { html, footerNote, filename, footer, runningHeader } = await buildChannelListExport(service, { id: t.id, name: t.name || 'Tour', artist_id: t.artist_id }, link.workspace_id, normalizeConfig('channel-list', undefined));
        return { html, footerNote, markDataUri: await lowpassMarkDataUri(), filename, footer, runningHeader };
      });
    }
    return exportPdfResponse('rider-stage-plot', async () => {
      const built = await buildStagePlotExport(service, attachment.id!, link.workspace_id, normalizeConfig('stage-plot', undefined));
      return { ...built, markDataUri: await lowpassMarkDataUri() };
    });
  } catch (e) {
    return exportErrorResponse('rider-file', e);
  }
}
