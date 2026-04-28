import { NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase-server';
import type { DealMemoInput, DealMemoStatus } from '@/lib/types/deal-memo';
import { mapListRow } from '@/lib/deal-memos/mapDealMemo';

async function enrichMany(
  supabase: Awaited<ReturnType<typeof createServerSupabaseClient>>,
  rows: Array<Record<string, unknown>>,
) {
  const showIds = [...new Set(rows.map((r) => r.show_id).filter(Boolean))] as string[];
  const routingDates = new Map<string, string | null>();
  if (showIds.length > 0) {
    const { data } = await supabase.from('routing').select('id, date').in('id', showIds);
    for (const r of data ?? []) {
      routingDates.set((r as { id: string }).id, (r as { date: string }).date ?? null);
    }
  }

  const out: ReturnType<typeof mapListRow>[] = [];
  for (const row of rows) {
    const r = row as Record<string, unknown> & {
      tours?: { name?: string | null };
    };
    const tourName = (r.tours as { name?: string } | null)?.name ?? null;
    const sid = r.show_id ? String(r.show_id) : null;
    const d = sid ? routingDates.get(sid) : undefined;
    const showLabel =
      d != null ? `Show ${new Date(d).toLocaleDateString()}` : sid ? 'Show-linked' : 'Tour-wide';
    const flat = { ...r };
    delete flat.tours;
    out.push(
      mapListRow({
        ...flat,
        tour_name: tourName,
        show_label: showLabel,
      } as Record<string, unknown>),
    );
  }
  return out;
}

export async function GET(request: Request) {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const tourId = searchParams.get('tour_id');
  const showId = searchParams.get('show_id');
  const statusFilter = searchParams.get('status');
  const yearStr = searchParams.get('year');
  const scope = searchParams.get('scope');
  const q = searchParams.get('q');
  const limit = Math.min(200, Math.max(1, Number(searchParams.get('limit')) || 50));

  let qb = supabase
    .from('deal_memos')
    .select(
      `
      *,
      tours ( name )
    `,
    )
    .order('updated_at', { ascending: false })
    .limit(limit);

  if (tourId) qb = qb.eq('tour_id', tourId);
  if (showId) qb = qb.eq('show_id', showId);
  if (statusFilter && ['draft', 'sent', 'pending', 'signed', 'expired'].includes(statusFilter)) {
    qb = qb.eq('status', statusFilter);
  }
  const yearNum = yearStr ? Number(yearStr) : NaN;
  if (!Number.isNaN(yearNum) && yearNum >= 1900 && yearNum < 2100) {
    qb = qb.gte('created_at', `${yearNum}-01-01`).lte('created_at', `${yearNum + 1}-01-01`);
  }
  if (scope === 'show') qb = qb.not('show_id', 'is', null);
  if (scope === 'tour-wide') qb = qb.is('show_id', null);
  if (q?.trim()) {
    const qi = `%${q.trim()}%`;
    qb = qb.ilike('title', qi);
  }

  const { data, error } = await qb;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const enriched = await enrichMany(supabase, (data ?? []) as Record<string, unknown>[]);
  return NextResponse.json({ dealMemos: enriched });
}

export async function POST(request: Request) {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  let body: DealMemoInput & { title?: string; tour_id?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const title = typeof body.title === 'string' ? body.title.trim() : '';
  if (!body.tour_id || !title) {
    return NextResponse.json({ error: 'tour_id and title required' }, { status: 400 });
  }

  const { data: profile } = await supabase.from('profiles').select('workspace_id').eq('id', user.id).maybeSingle();
  const workspaceId = profile?.workspace_id;
  if (!workspaceId) return NextResponse.json({ error: 'No workspace' }, { status: 400 });

  const patch: Record<string, unknown> = {
    workspace_id: workspaceId,
    tour_id: body.tour_id,
    title,
    reference: body.reference ?? null,
    show_id: body.show_id ?? null,
    promoter_name: body.promoter_name ?? null,
    promoter_email: body.promoter_email ?? null,
    promoter_phone: body.promoter_phone ?? null,
    fee_amount: body.fee_amount ?? null,
    fee_currency: body.fee_currency ?? 'GBP',
    deposit_amount: body.deposit_amount ?? null,
    deposit_currency: body.deposit_currency ?? null,
    settlement_method: body.settlement_method ?? null,
    status: (body.status as DealMemoStatus | undefined) ?? 'draft',
    sent_at: body.sent_at ?? null,
    signed_at: body.signed_at ?? null,
    expires_at: body.expires_at ?? null,
    document_url: body.document_url ?? null,
    document_filename: body.document_filename ?? null,
    terms_summary: body.terms_summary ?? null,
    notes: body.notes ?? null,
    created_by: user.id,
    updated_by: user.id,
  };

  const { data: row, error } = await supabase.from('deal_memos').insert(patch).select('*').single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const enriched = await enrichMany(supabase, [row as Record<string, unknown>]);
  return NextResponse.json({ dealMemo: enriched[0] });
}
