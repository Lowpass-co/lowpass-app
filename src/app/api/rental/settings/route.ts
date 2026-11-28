/* PATCH /api/rental/settings { days_per_week } — the workspace's default
   week for rental pricing (306: workspaces.rental_days_per_week). */
import { NextResponse } from 'next/server';
import { requireWrite } from '@/lib/auth/workspace-check';
import { createServerSupabaseClient } from '@/lib/supabase-server';
import { weekLength } from '@/lib/rental-pricing';
import { readBody } from '@/server/rental/respond';

export const dynamic = 'force-dynamic';

export async function PATCH(request: Request) {
  const supabase = await createServerSupabaseClient();
  const auth = await requireWrite(supabase);
  if ('error' in auth) return auth.error;
  const body = await readBody(request);
  const n = Number(body.days_per_week);
  if (!Number.isFinite(n) || n < 1 || n > 7) return NextResponse.json({ error: 'A week is 1 to 7 days.' }, { status: 400 });
  const days = weekLength(n);
  const { data, error } = await supabase
    .from('workspaces')
    .update({ rental_days_per_week: days })
    .eq('id', auth.workspaceId)
    .select('rental_days_per_week')
    .maybeSingle();
  if (error) {
    const missing = /rental_days_per_week/.test(error.message);
    return NextResponse.json({ error: missing ? 'Paste migration 306 first.' : error.message }, { status: missing ? 409 : 500 });
  }
  if (!data) return NextResponse.json({ error: 'Only a workspace admin can change this.' }, { status: 403 });
  return NextResponse.json({ days_per_week: Number((data as { rental_days_per_week: unknown }).rental_days_per_week) });
}
