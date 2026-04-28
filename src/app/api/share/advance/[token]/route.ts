import { NextResponse } from 'next/server';
import { createServiceSupabaseClient } from '@/lib/supabase-server';
import { getAdvanceBundleJson } from '@/server/advance/getAdvanceBundle';
import { verifyAdvanceShareToken } from '@/lib/advance/publicShareToken';

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ token: string }> },
) {
  let supabase;
  try {
    supabase = createServiceSupabaseClient();
  } catch {
    return NextResponse.json({ error: 'Public share is not configured on this server.' }, { status: 503 });
  }

  const { token } = await params;
  const verified = verifyAdvanceShareToken(decodeURIComponent(token));
  if (!verified) {
    return NextResponse.json({ error: 'Invalid or expired link' }, { status: 404 });
  }

  const bundle = await getAdvanceBundleJson(supabase, verified.tourId, verified.routingId);
  if (!bundle) {
    return NextResponse.json({ error: 'Advance not found' }, { status: 404 });
  }

  return NextResponse.json(bundle);
}
