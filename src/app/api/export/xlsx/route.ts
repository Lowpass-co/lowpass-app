/* ============================================
   LOWPASS — POST /api/export/xlsx  (#8 Document Export v2, Part C)

   The Excel variant of the export — a flat machine-readable .xlsx (one row per
   line), built from the SAME loaders as the PDF path. Generic over surface:
   Body: { surface, tourId, config?, versionId? }. READ-ONLY, workspace-RLS scoped
   (a foreign tour 404s — payroll/rooming PII never leaks).
   ============================================ */

import { NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase-server';
import { exportErrorResponse, contentDisposition } from '@/lib/export/render';
import { buildXlsxExport } from '@/lib/export/xlsx';
import { normalizeConfig, type ExportSurface } from '@/lib/export/template-config';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const SURFACES: ExportSurface[] = ['budget', 'rooming', 'payroll', 'routing'];

export async function POST(request: Request): Promise<NextResponse | Response> {
  try {
    const body = (await request.json().catch(() => ({}))) as { surface?: unknown; tourId?: unknown; config?: unknown; versionId?: string | null };
    if (typeof body.surface !== 'string' || !SURFACES.includes(body.surface as ExportSurface)) {
      return NextResponse.json({ error: 'Invalid surface' }, { status: 400 });
    }
    if (typeof body.tourId !== 'string') return NextResponse.json({ error: 'tourId is required' }, { status: 400 });
    const surface = body.surface as ExportSurface;
    const config = normalizeConfig(surface, body.config);

    const supabase = await createServerSupabaseClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { data: profile } = await supabase.from('profiles').select('workspace_id').eq('id', user.id).single();
    if (!profile?.workspace_id) return NextResponse.json({ error: 'No workspace' }, { status: 403 });

    const { data: tour } = await supabase
      .from('tours')
      .select('id, name, currency, artist_id, start_date, end_date, workspace_id')
      .eq('id', body.tourId)
      .eq('workspace_id', profile.workspace_id)
      .maybeSingle();
    if (!tour) return NextResponse.json({ error: 'Tour not found' }, { status: 404 });

    const { buffer, filename } = await buildXlsxExport(
      surface,
      supabase,
      { id: tour.id as string, name: (tour.name as string) || 'Tour', currency: tour.currency as string | null, start_date: tour.start_date as string | null, end_date: tour.end_date as string | null, artist_id: tour.artist_id as string | null },
      profile.workspace_id as string,
      config,
      body.versionId ?? null,
    );

    return new Response(new Uint8Array(buffer), {
      status: 200,
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': contentDisposition(filename),
        'Cache-Control': 'no-store',
      },
    });
  } catch (err) {
    return exportErrorResponse('xlsx', err);
  }
}
