import { NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase-server';
import type { DealMemoInput, DealMemoStatus } from '@/lib/types/deal-memo';
import { mapListRow } from '@/lib/deal-memos/mapDealMemo';

type Params = { params: Promise<{ id: string }> };

async function loadEnrichedById(supabase: Awaited<ReturnType<typeof createServerSupabaseClient>>, id: string) {
  const { data, error } = await supabase
    .from('deal_memos')
    .select('*, tours ( name )')
    .eq('id', id)
    .maybeSingle();
  if (error || !data) return null;
  const row = data as Record<string, unknown> & { tours?: { name?: string | null }; show_id?: string | null };
  const tourName = (row.tours as { name?: string } | null)?.name ?? null;
  let showMeta: string | undefined;
  if (row.show_id) {
    const r = await supabase.from('routing').select('date').eq('id', row.show_id).maybeSingle();
    const d = r.data?.date;
    showMeta = d ? `Show ${new Date(String(d)).toLocaleDateString()}` : 'Show-linked';
  } else showMeta = 'Tour-wide';
  const flat = { ...row };
  delete flat.tours;
  return mapListRow({
    ...(flat as Record<string, unknown>),
    tour_name: tourName,
    show_label: showMeta,
  } as Record<string, unknown>);
}

export async function GET(_: Request, { params }: Params) {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { id } = await params;

  const dealMemo = await loadEnrichedById(supabase, id);
  if (!dealMemo) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  return NextResponse.json({ dealMemo });
}

export async function PATCH(request: Request, { params }: Params) {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { id } = await params;
  let body: DealMemoInput;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const patch: Record<string, unknown> = { updated_by: user.id };

  const stringKeys = [
    'reference',
    'promoter_name',
    'promoter_email',
    'promoter_phone',
    'fee_currency',
    'deposit_currency',
    'settlement_method',
    'document_url',
    'document_filename',
    'terms_summary',
    'notes',
  ] as const;
  for (const k of stringKeys) {
    if (k in body) patch[k] = body[k];
  }

  const optionalNullString = ['show_id', 'sent_at', 'signed_at', 'expires_at'] as const;
  for (const k of optionalNullString) {
    if (k in body) patch[k] = body[k];
  }

  if (body.title !== undefined && typeof body.title === 'string') patch.title = body.title.trim();
  if ('tour_id' in body && body.tour_id) patch.tour_id = body.tour_id;
  if ('fee_amount' in body) patch.fee_amount = body.fee_amount;
  if ('deposit_amount' in body) patch.deposit_amount = body.deposit_amount;
  if (body.status !== undefined) patch.status = body.status as DealMemoStatus;

  const { error } = await supabase.from('deal_memos').update(patch).eq('id', id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const dm = await loadEnrichedById(supabase, id);
  if (!dm) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  return NextResponse.json({ dealMemo: dm });
}

export async function DELETE(_: Request, { params }: Params) {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { data: isAdmin, error: rpcErr } = await supabase.rpc('is_workspace_admin');
  if (rpcErr) return NextResponse.json({ error: rpcErr.message }, { status: 500 });
  if (!isAdmin) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const { id } = await params;
  const { error } = await supabase.from('deal_memos').delete().eq('id', id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return new Response(null, { status: 204 });
}
