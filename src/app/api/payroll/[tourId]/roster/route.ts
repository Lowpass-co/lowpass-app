/* ============================================
   LOWPASS — GET /api/payroll/[tourId]/roster  (#8 v2.1 Part C)

   The crew list (rate-card id + display name) for the export editor's people
   picker. READ-ONLY, workspace-RLS scoped. Reuses the payroll loader so the ids +
   live names match the export exactly.
   ============================================ */

import { NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase-server';
import { loadPayrollExportData } from '@/lib/export/payroll-data';

export const dynamic = 'force-dynamic';

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ tourId: string }> },
): Promise<NextResponse> {
  try {
    const { tourId } = await params;
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

    const data = await loadPayrollExportData(
      supabase,
      { id: tour.id as string, name: (tour.name as string) || 'Tour', currency: tour.currency as string | null, start_date: tour.start_date as string | null, end_date: tour.end_date as string | null, artist_id: tour.artist_id as string | null },
      profile.workspace_id as string,
    );
    return NextResponse.json({ people: data.persons.map((p) => ({ id: p.id, name: p.name })) });
  } catch {
    return NextResponse.json({ people: [] });
  }
}
