/* ============================================
   LOWPASS — POST /api/payroll/[tourId]/export/zip  (#8 v2.1 Part C)

   "Download all (zip)" — a .zip containing the COMBINED run-sheet+statements PDF
   AND one statement PDF per person, so the user can send each crew member their
   own. READ-ONLY, workspace-RLS scoped (payroll is financial PII). internal_rate
   is never loaded (D5). Body: { config?: TemplateConfig }.
   ============================================ */

import { NextResponse } from 'next/server';
import JSZip from 'jszip';
import { createServerSupabaseClient } from '@/lib/supabase-server';
import { exportErrorResponse, contentDisposition, renderPdfBuffer } from '@/lib/export/render';
import { lowpassMarkDataUri } from '@/lib/export/logo';
import { buildPayrollExport } from '@/lib/export/build';
import { loadPayrollExportData } from '@/lib/export/payroll-data';
import { normalizeConfig, type TemplateConfig } from '@/lib/export/template-config';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const MAX_PEOPLE = 40; // guard the function duration (N+1 puppeteer renders)
const sanitize = (s: string, fb: string) => s.replace(/[^\w\s-]/g, '').replace(/\s+/g, ' ').trim().slice(0, 60) || fb;

export async function POST(
  request: Request,
  { params }: { params: Promise<{ tourId: string }> },
): Promise<NextResponse | Response> {
  try {
    const { tourId } = await params;
    const body = (await request.json().catch(() => ({}))) as { config?: unknown };
    const config = normalizeConfig('payroll', body.config);

    const supabase = await createServerSupabaseClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    const { data: profile } = await supabase.from('profiles').select('workspace_id').eq('id', user.id).single();
    if (!profile?.workspace_id) return NextResponse.json({ error: 'No workspace' }, { status: 403 });

    const { data: tour } = await supabase
      .from('tours')
      .select('id, name, currency, artist_id, start_date, end_date, workspace_id')
      .eq('id', tourId)
      .eq('workspace_id', profile.workspace_id)
      .maybeSingle();
    if (!tour) return NextResponse.json({ error: 'Tour not found' }, { status: 404 });

    const tourMeta = {
      id: tour.id as string, name: (tour.name as string) || 'Tour', currency: tour.currency as string | null,
      start_date: tour.start_date as string | null, end_date: tour.end_date as string | null, artist_id: tour.artist_id as string | null,
    };
    const workspaceId = profile.workspace_id as string;

    // The people in scope (respecting the date range + people picker).
    const data = await loadPayrollExportData(supabase, tourMeta, workspaceId, {
      range: config.dateRange,
      selectedIds: config.payroll.selectedPersonIds,
    });
    const people = data.persons.slice(0, MAX_PEOPLE);
    if (people.length === 0) return NextResponse.json({ error: 'No crew to export' }, { status: 400 });

    const markDataUri = await lowpassMarkDataUri();
    const zip = new JSZip();

    const renderToZip = async (cfg: TemplateConfig, entryName: string) => {
      const built = await buildPayrollExport(supabase, tourMeta, workspaceId, cfg);
      const buffer = await renderPdfBuffer('payroll-zip', { ...built, markDataUri });
      zip.file(entryName, buffer);
    };

    // 1) the combined master document.
    await renderToZip({ ...config, payroll: { ...config.payroll, mode: 'combined', personId: null } }, `${sanitize(tourMeta.name, 'Tour')} — Payroll (combined).pdf`);

    // 2) one statement per person.
    for (const p of people) {
      await renderToZip(
        { ...config, payroll: { ...config.payroll, mode: 'individual', personId: p.id } },
        `${sanitize(p.name, 'Crew')} — Payroll.pdf`,
      );
    }

    const zipBuffer = await zip.generateAsync({ type: 'nodebuffer' });
    const filename = `${sanitize(data.artist?.name ?? '', '')} — ${sanitize(tourMeta.name, 'Payroll')} — Payroll.zip`.replace(/^ — /, '');
    return new Response(new Uint8Array(zipBuffer), {
      status: 200,
      headers: { 'Content-Type': 'application/zip', 'Content-Disposition': contentDisposition(filename), 'Cache-Control': 'no-store' },
    });
  } catch (err) {
    return exportErrorResponse('payroll-zip', err);
  }
}
