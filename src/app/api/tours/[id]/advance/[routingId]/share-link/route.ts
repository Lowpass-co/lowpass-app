import { NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase-server';
import { signAdvanceShare, hasAdvanceShareSecret } from '@/lib/advance/publicShareToken';

/** POST { expDays?: number } — returns { url } for read-only advance share (HMAC token). */
export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string; routingId: string }> },
) {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { id: tourId, routingId } = await params;

  const { data: row } = await supabase
    .from('routing')
    .select('id')
    .eq('id', routingId)
    .eq('tour_id', tourId)
    .maybeSingle();

  if (!row) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  let expDays = 30;
  try {
    const body = await _request.json();
    if (typeof body?.expDays === 'number' && body.expDays > 0 && body.expDays <= 365) {
      expDays = body.expDays;
    }
  } catch {
    /* default */
  }

  if (!hasAdvanceShareSecret()) {
    return NextResponse.json(
      { error: 'Set ADVANCE_SHARE_HMAC_SECRET (a dedicated random secret) so share links can be signed.' },
      { status: 503 },
    );
  }

  const exp = Math.floor(Date.now() / 1000) + expDays * 86400;
  const token = signAdvanceShare({ tourId, routingId, exp });

  const base = process.env.NEXT_PUBLIC_APP_URL ?? '';
  const url = `${base.replace(/\/$/, '')}/share/advance/${encodeURIComponent(token)}`;

  return NextResponse.json({ url, exp });
}
