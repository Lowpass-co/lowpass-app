/* ============================================
   LOWPASS — POST /api/rooming/[tourId]/export/pdf  (#8 Document Export)

   Streams a branded A4 hotel rooming-list PDF. READ-ONLY: loads the tour's
   rooming (workspace-RLS scoped — a foreign-workspace tour 404s, rooming is PII,
   no cross-workspace leak), renders the SHARED shell + rooming body, prints via
   the existing puppeteer pipeline (getBrowser() — reused). Never writes.

   Mirrors the Budget export route exactly (shell + getBrowser + footer template).
   ============================================ */

import { NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase-server';
import { loadRoomingExportData } from '@/lib/export/rooming-data';
import { buildRoomingBodyHtml } from '@/lib/export/rooming-pdf';
import { renderDocument } from '@/lib/export/shell';
import { exportPdfResponse } from '@/lib/export/render';
import { fetchLogoDataUri, lowpassMarkDataUri } from '@/lib/export/logo';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

function fmtDate(d: string | null): string | null {
  if (!d) return null;
  const parsed = new Date(d);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
}
function tourDateRange(start: string | null, end: string | null): string | null {
  const s = fmtDate(start);
  const e = fmtDate(end);
  if (s && e) return `${s} – ${e}`;
  if (s) return `From ${s}`;
  if (e) return `Until ${e}`;
  return null;
}
const sanitize = (s: string): string => s.replace(/[^\w\s-]/g, '').replace(/\s+/g, ' ').trim().slice(0, 60) || 'Rooming';

export async function POST(
  request: Request,
  { params }: { params: Promise<{ tourId: string }> },
): Promise<NextResponse | Response> {
  const { tourId } = await params;

  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { data: profile } = await supabase.from('profiles').select('workspace_id').eq('id', user.id).single();
  if (!profile?.workspace_id) return NextResponse.json({ error: 'No workspace' }, { status: 403 });

  // Workspace-RLS scope: a tour outside the user's workspace 404s (no PII leak).
  const { data: tour } = await supabase
    .from('tours')
    .select('id, name, artist_id, start_date, end_date, workspace_id')
    .eq('id', tourId)
    .eq('workspace_id', profile.workspace_id)
    .maybeSingle();
  if (!tour) return NextResponse.json({ error: 'Tour not found' }, { status: 404 });

  // Build + render inside the shared helper so a loader/render throw is logged +
  // returned as a real 500 (never a silent non-PDF). RLS-scoped tour resolved above.
  return exportPdfResponse('rooming', async () => {
    const data = await loadRoomingExportData(
      supabase,
      { id: tour.id as string, name: (tour.name as string) || 'Tour', start_date: tour.start_date as string | null, end_date: tour.end_date as string | null, artist_id: tour.artist_id as string | null },
      profile.workspace_id as string,
    );

    const [logoDataUri, markDataUri] = await Promise.all([fetchLogoDataUri(data.logoUrl), lowpassMarkDataUri()]);

    const bodyHtml = buildRoomingBodyHtml(data);
    const html = renderDocument({
      letterhead: {
        artistName: data.artist?.name ?? null,
        tourName: data.tour.name,
        tourDates: tourDateRange(data.tour.start_date, data.tour.end_date),
        logoDataUri,
        generatedOn: new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }),
      },
      title: 'Rooming list',
      subtitle: `${data.hotels.length} hotel${data.hotels.length === 1 ? '' : 's'}`,
      bodyHtml,
    });

    const footerNote = `${data.artist?.name ? `${data.artist.name} — ` : ''}${data.tour.name} · Rooming`;
    const filename = `${sanitize(data.artist?.name ?? '')} — ${sanitize(data.tour.name)} — Rooming.pdf`.replace(/^ — /, '');
    return { html, footerNote, markDataUri, filename };
  });
}
