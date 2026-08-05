/* ============================================
   LOWPASS — /api/rider-pack-attachments (decouple phase A)

   GET    ?rider_pack_id= | ?routing_id= | ?tour_id=   → { documents }
   POST   { document_pack_id, rider_pack_id? | routing_id? | tour_id? }
          → attach (REPLACES any same-kind attachment on that target)
   DELETE ?id=  → detach
   ============================================ */

import { NextResponse } from 'next/server';
import { requireWrite } from '@/lib/auth/workspace-check';
import { createServerSupabaseClient } from '@/lib/supabase-server';
import { listAttachments, attachDocument } from '@/lib/rider-packs/attachments';

export async function GET(request: Request) {
  const supabase = await createServerSupabaseClient();
  const url = new URL(request.url);
  const documents = await listAttachments(supabase, {
    riderPackId: url.searchParams.get('rider_pack_id') ?? undefined,
    routingId: url.searchParams.get('routing_id') ?? undefined,
    tourId: url.searchParams.get('tour_id') ?? undefined,
  });
  return NextResponse.json({ documents });
}

export async function POST(request: Request) {
  const supabase = await createServerSupabaseClient();
  const auth = await requireWrite(supabase);
  if ('error' in auth) return auth.error;
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { data: profile } = await supabase.from('profiles').select('workspace_id').eq('id', user.id).single();
  if (!profile?.workspace_id) return NextResponse.json({ error: 'No workspace' }, { status: 403 });

  let body: { document_pack_id?: string; rider_pack_id?: string; routing_id?: string; tour_id?: string };
  try { body = await request.json(); } catch { return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 }); }
  if (!body.document_pack_id) return NextResponse.json({ error: 'document_pack_id required' }, { status: 400 });

  const result = await attachDocument(supabase, profile.workspace_id, user.id, body.document_pack_id, {
    riderPackId: body.rider_pack_id,
    routingId: body.routing_id,
    tourId: body.tour_id,
  });
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status });
  return NextResponse.json({ id: result.id });
}

export async function DELETE(request: Request) {
  const supabase = await createServerSupabaseClient();
  const auth = await requireWrite(supabase);
  if ('error' in auth) return auth.error;
  const id = new URL(request.url).searchParams.get('id');
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 });
  const { error } = await supabase.from('rider_pack_attachments').delete().eq('id', id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
