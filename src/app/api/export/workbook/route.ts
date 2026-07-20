/* ============================================
   LOWPASS — POST /api/export/workbook  (X1-A)

   Streams the six-sheet Tour Accounting Workbook (.xlsx). READ-ONLY: runs the same
   loaders as the PDF/xlsx paths (workspace-RLS scoped — a foreign tour 404s), then
   the pure builder. Settlement money is the harness-proven computeWalk (never
   recomputed here). Body: { tourId, sheets?, versionId? }.
   ============================================ */

import { NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase-server';
import { loadBudgetExportData } from '@/lib/export/budget-data';
import { loadPayrollExportData } from '@/lib/export/payroll-data';
import { loadTourSettlementWalks } from '@/lib/settlement/loadWalk';
import { payrollFinalizedAt } from '@/lib/payroll/finalize';
import { buildTourWorkbookBuffer, type TourWorkbookInput } from '@/lib/export/workbook';
import { contentDisposition } from '@/lib/export/render';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

function tourDateRange(start: string | null, end: string | null): string | null {
  if (!start && !end) return null;
  return [start, end].filter(Boolean).join(' – ');
}

export async function POST(request: Request): Promise<NextResponse | Response> {
  try {
    const body = (await request.json().catch(() => ({}))) as {
      tourId?: string;
      versionId?: string | null;
      sheets?: TourWorkbookInput['sheets'];
    };
    const tourId = body.tourId;
    if (!tourId) return NextResponse.json({ error: 'tourId is required' }, { status: 400 });

    const supabase = await createServerSupabaseClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    const { data: profile } = await supabase.from('profiles').select('workspace_id').eq('id', user.id).single();
    if (!profile?.workspace_id) return NextResponse.json({ error: 'No workspace' }, { status: 403 });
    const workspaceId = profile.workspace_id as string;

    const { data: tour } = await supabase
      .from('tours')
      .select('id, name, currency, artist_id, start_date, end_date, workspace_id')
      .eq('id', tourId)
      .eq('workspace_id', workspaceId)
      .maybeSingle();
    if (!tour) return NextResponse.json({ error: 'Tour not found' }, { status: 404 });

    const tourMeta = {
      id: tour.id as string,
      name: (tour.name as string) || 'Tour',
      currency: tour.currency as string | null,
      start_date: tour.start_date as string | null,
      end_date: tour.end_date as string | null,
      artist_id: tour.artist_id as string | null,
    };
    const currency = (tour.currency as string | null) ?? 'GBP';

    const [budget, shows, payroll, finalizedAt] = await Promise.all([
      loadBudgetExportData(supabase, tourMeta, workspaceId, { versionId: body.versionId ?? null }),
      loadTourSettlementWalks(supabase, tourId, workspaceId, currency),
      loadPayrollExportData(supabase, tourMeta, workspaceId).catch(() => null),
      payrollFinalizedAt(supabase, tourId),
    ]);

    const input: TourWorkbookInput = {
      meta: {
        artistName: budget.artist?.name ?? null,
        tourName: tourMeta.name,
        tourDates: tourDateRange(tourMeta.start_date, tourMeta.end_date),
        currency,
        generatedOn: new Date().toISOString(),
      },
      budget,
      shows,
      payroll,
      payrollFinalizedAt: finalizedAt,
      sheets: body.sheets,
    };

    const buffer = await buildTourWorkbookBuffer(input);
    const prefix = (budget.artist?.name ? `${budget.artist.name} — ` : '') + tourMeta.name;
    // The Unicode filename may hold em-dashes / accents; contentDisposition() emits
    // an ASCII fallback + RFC 5987 filename* so the header stays Latin-1-safe.
    const filename = `${prefix.trim() || 'Tour'} — Accounting Workbook.xlsx`;
    return new Response(new Uint8Array(buffer), {
      status: 200,
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': contentDisposition(filename),
        'Cache-Control': 'no-store',
      },
    });
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: 'Workbook export failed', detail }, { status: 500 });
  }
}
