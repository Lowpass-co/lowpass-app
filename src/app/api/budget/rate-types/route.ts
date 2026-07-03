/* ============================================
   LOWPASS — Rate-types catalog API (b2 UI phase)

   Manages the workspace's payroll rate_types (migration 228/229). Amounts live
   in personnel_rate_lines, not here.

   GET    ?tour_id=…  → the catalog (global defaults + this workspace's customs).
   POST               → create a type (name/bucket/basis/day_statuses); seeds a
                        0-amount line for everyone on the tour.
   PATCH              → rename / reorder / edit a WORKSPACE-owned type.
   DELETE ?id=…       → soft-block if any non-zero amount uses it; else cascade.

   Global defaults (workspace_id NULL) can't be edited/deleted — RLS blocks the
   write (workspace_id must equal get_my_workspace_id()); we also guard here for
   a clear message.
   ============================================ */

import { NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase-server';

const BUCKETS = new Set(['fee', 'per_diem']);
const BASES = new Set(['per_day_status', 'per_active_day', 'flat_once']);
const DAY_STATUSES = new Set(['show', 'off_travel', 'rehearsal']);

async function workspace(supabase: Awaited<ReturnType<typeof createServerSupabaseClient>>) {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) } as const;
  const { data: profile } = await supabase.from('profiles').select('workspace_id').eq('id', user.id).single();
  if (!profile?.workspace_id) return { error: NextResponse.json({ error: 'No workspace' }, { status: 403 }) } as const;
  return { workspaceId: profile.workspace_id as string } as const;
}

export async function GET() {
  const supabase = await createServerSupabaseClient();
  const ctx = await workspace(supabase);
  if ('error' in ctx) return ctx.error;

  const { data, error } = await supabase
    .from('rate_types')
    .select('id, name, bucket, basis, day_statuses, order_index, is_default, workspace_id')
    .or(`workspace_id.is.null,workspace_id.eq.${ctx.workspaceId}`)
    .order('order_index', { ascending: true });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ rate_types: data ?? [] });
}

export async function POST(request: Request) {
  const supabase = await createServerSupabaseClient();
  const ctx = await workspace(supabase);
  if ('error' in ctx) return ctx.error;

  let body: { name?: string; bucket?: string; basis?: string; day_statuses?: string[]; tour_id?: string };
  try { body = await request.json(); } catch { return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 }); }

  const name = (body.name ?? '').trim();
  const bucket = body.bucket ?? '';
  const basis = body.basis ?? '';
  const dayStatuses = (body.day_statuses ?? []).filter((s) => DAY_STATUSES.has(s));
  if (!name) return NextResponse.json({ error: 'name is required' }, { status: 400 });
  if (!BUCKETS.has(bucket)) return NextResponse.json({ error: 'bucket must be fee|per_diem' }, { status: 400 });
  if (!BASES.has(basis)) return NextResponse.json({ error: 'basis must be per_day_status|per_active_day|flat_once' }, { status: 400 });
  if (basis === 'per_day_status' && dayStatuses.length === 0)
    return NextResponse.json({ error: 'per_day_status needs at least one day status' }, { status: 400 });

  // Append after the current max order_index (defaults + customs).
  const { data: maxRow } = await supabase
    .from('rate_types')
    .select('order_index')
    .or(`workspace_id.is.null,workspace_id.eq.${ctx.workspaceId}`)
    .order('order_index', { ascending: false })
    .limit(1)
    .maybeSingle();
  const orderIndex = ((maxRow?.order_index as number | undefined) ?? -1) + 1;

  const { data: created, error } = await supabase
    .from('rate_types')
    .insert({
      workspace_id: ctx.workspaceId,
      name,
      bucket,
      basis,
      day_statuses: basis === 'per_day_status' ? dayStatuses : [],
      order_index: orderIndex,
      is_default: false,
    })
    .select('id, name, bucket, basis, day_statuses, order_index, is_default, workspace_id')
    .single();
  if (error || !created) return NextResponse.json({ error: error?.message ?? 'Create failed' }, { status: 500 });

  // Seed a 0-amount line for everyone on the tour so the new column exists.
  if (body.tour_id) {
    const { data: prs } = await supabase
      .from('personnel_rates')
      .select('id, tour_id, workspace_id')
      .eq('tour_id', body.tour_id)
      .eq('workspace_id', ctx.workspaceId);
    if (prs && prs.length > 0) {
      await supabase.from('personnel_rate_lines').insert(
        prs.map((pr) => ({
          tour_id: pr.tour_id,
          workspace_id: pr.workspace_id,
          personnel_rate_id: pr.id,
          rate_type_id: created.id,
          amount: 0,
        })),
      );
    }
  }

  return NextResponse.json(created);
}

export async function PATCH(request: Request) {
  const supabase = await createServerSupabaseClient();
  const ctx = await workspace(supabase);
  if ('error' in ctx) return ctx.error;

  let body: { id?: string; name?: string; order_index?: number; day_statuses?: string[] };
  try { body = await request.json(); } catch { return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 }); }
  if (!body.id) return NextResponse.json({ error: 'id is required' }, { status: 400 });

  const patch: Record<string, unknown> = {};
  if (body.name !== undefined) {
    const n = body.name.trim();
    if (!n) return NextResponse.json({ error: 'name cannot be empty' }, { status: 400 });
    patch.name = n;
  }
  if (body.order_index !== undefined && Number.isFinite(Number(body.order_index)))
    patch.order_index = Math.max(0, Math.floor(Number(body.order_index)));
  if (body.day_statuses !== undefined)
    patch.day_statuses = body.day_statuses.filter((s) => DAY_STATUSES.has(s));
  if (Object.keys(patch).length === 0) return NextResponse.json({ error: 'nothing to update' }, { status: 400 });

  // Only workspace-owned types (RLS also enforces; is_default global rows have
  // workspace_id NULL and won't match).
  const { data, error } = await supabase
    .from('rate_types')
    .update(patch)
    .eq('id', body.id)
    .eq('workspace_id', ctx.workspaceId)
    .select('id, name, bucket, basis, day_statuses, order_index, is_default, workspace_id')
    .maybeSingle();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!data) return NextResponse.json({ error: 'Rate type not found, or it is a global default (not editable).' }, { status: 404 });
  return NextResponse.json(data);
}

export async function DELETE(request: Request) {
  const supabase = await createServerSupabaseClient();
  const ctx = await workspace(supabase);
  if ('error' in ctx) return ctx.error;

  const id = new URL(request.url).searchParams.get('id');
  if (!id) return NextResponse.json({ error: 'id is required' }, { status: 400 });

  // SOFT-BLOCK: refuse if any non-zero amount uses this type — never silently
  // drop money data. (amount can be null/0/'' — treat only real >0 as blocking.)
  const { data: lines } = await supabase
    .from('personnel_rate_lines')
    .select('amount')
    .eq('rate_type_id', id)
    .eq('workspace_id', ctx.workspaceId);
  const nonZero = (lines ?? []).filter((l) => Number((l as { amount: unknown }).amount) > 0).length;
  if (nonZero > 0) {
    return NextResponse.json(
      { error: `This rate type has ${nonZero} non-zero amount${nonZero === 1 ? '' : 's'}. Zero them first, then delete.`, code: 'HAS_AMOUNTS', nonZero },
      { status: 409 },
    );
  }

  // Safe: delete the type (its zero lines cascade via FK ON DELETE CASCADE).
  const { data, error } = await supabase
    .from('rate_types')
    .delete()
    .eq('id', id)
    .eq('workspace_id', ctx.workspaceId)
    .select('id')
    .maybeSingle();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!data) return NextResponse.json({ error: 'Rate type not found, or it is a global default (not deletable).' }, { status: 404 });
  return NextResponse.json({ deleted: id });
}
