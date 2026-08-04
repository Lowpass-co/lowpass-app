/* ============================================
   LOWPASS — Settlement itemized lines API (M1-B)

   CRUD for the three itemized settlement tables (migration 243), keyed by
   settlement_id (the per-show settlement grain):
     type=deduction → settlement_deductions (kind enum)
     type=expense   → settlement_expenses
     type=payment   → settlement_payments (method enum)

   POST   create a line   { type, settlement_id, ...fields }
   PATCH  update a line    { type, id, ...fields }
   DELETE remove a line    { type, id }

   Workspace-scoped (profile.workspace_id + RLS). The parent settlement row must
   exist first — the Walk panel upserts it via /api/budget/settlement before
   adding lines.
   ============================================ */

import { NextResponse } from 'next/server';
import { requireWrite } from '@/lib/auth/workspace-check';
import { createServerSupabaseClient } from '@/lib/supabase-server';

type LineType = 'deduction' | 'expense' | 'payment';

const TABLES: Record<LineType, string> = {
  deduction: 'settlement_deductions',
  expense: 'settlement_expenses',
  payment: 'settlement_payments',
};
const DEDUCTION_KINDS = new Set(['withholding', 'tax', 'venue_cost', 'commission', 'other']);
const PAYMENT_METHODS = new Set(['wire', 'check', 'cash', 'ach']);

function isLineType(t: unknown): t is LineType {
  return t === 'deduction' || t === 'expense' || t === 'payment';
}

/** Whitelist + validate the mutable fields for a type. Returns null on bad input. */
function pickFields(type: LineType, body: Record<string, unknown>): Record<string, unknown> | null {
  const out: Record<string, unknown> = {};
  if ('amount' in body) {
    const a = Number(body.amount);
    if (!Number.isFinite(a)) return null;
    out.amount = a;
  }
  if ('currency' in body) out.currency = body.currency == null ? null : String(body.currency);
  if ('label' in body) out.label = body.label == null ? null : String(body.label);
  if (type === 'deduction' && 'kind' in body) {
    const k = String(body.kind);
    if (!DEDUCTION_KINDS.has(k)) return null;
    out.kind = k;
  }
  if (type === 'payment') {
    if ('method' in body) {
      const m = String(body.method);
      if (!PAYMENT_METHODS.has(m)) return null;
      out.method = m;
    }
    if ('paid_on' in body) out.paid_on = body.paid_on == null ? null : String(body.paid_on);
    if ('note' in body) out.note = body.note == null ? null : String(body.note);
  }
  return out;
}

async function workspaceId(supabase: Awaited<ReturnType<typeof createServerSupabaseClient>>): Promise<string | null> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;
  const { data: profile } = await supabase
    .from('profiles')
    .select('workspace_id')
    .eq('id', user.id)
    .maybeSingle();
  return (profile?.workspace_id as string | undefined) ?? null;
}

export async function POST(request: Request) {
  const supabase = await createServerSupabaseClient();
  const auth = await requireWrite(supabase);
  if ('error' in auth) return auth.error;
  const ws = await workspaceId(supabase);
  if (!ws) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  if (!body || !isLineType(body.type)) {
    return NextResponse.json({ error: 'type must be deduction | expense | payment' }, { status: 400 });
  }
  const type = body.type;
  const settlementId = body.settlement_id;
  if (typeof settlementId !== 'string') {
    return NextResponse.json({ error: 'settlement_id is required' }, { status: 400 });
  }
  // Confirm the settlement belongs to the caller's workspace.
  const { data: settlement } = await supabase
    .from('settlement')
    .select('id, workspace_id')
    .eq('id', settlementId)
    .maybeSingle();
  if (!settlement || settlement.workspace_id !== ws) {
    return NextResponse.json({ error: 'Settlement not found' }, { status: 404 });
  }

  const fields = pickFields(type, body);
  if (!fields) return NextResponse.json({ error: 'Invalid field values' }, { status: 400 });

  const { data, error } = await supabase
    .from(TABLES[type])
    .insert({ workspace_id: ws, settlement_id: settlementId, ...fields })
    .select()
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}

export async function PATCH(request: Request) {
  const supabase = await createServerSupabaseClient();
  const auth = await requireWrite(supabase);
  if ('error' in auth) return auth.error;
  const ws = await workspaceId(supabase);
  if (!ws) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  if (!body || !isLineType(body.type) || typeof body.id !== 'string') {
    return NextResponse.json({ error: 'type + id are required' }, { status: 400 });
  }
  const fields = pickFields(body.type, body);
  if (!fields || Object.keys(fields).length === 0) {
    return NextResponse.json({ error: 'No valid fields to update' }, { status: 400 });
  }
  const { data, error } = await supabase
    .from(TABLES[body.type])
    .update(fields)
    .eq('id', body.id)
    .eq('workspace_id', ws)
    .select()
    .maybeSingle();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!data) return NextResponse.json({ error: 'Line not found' }, { status: 404 });
  return NextResponse.json(data);
}

export async function DELETE(request: Request) {
  const supabase = await createServerSupabaseClient();
  const auth = await requireWrite(supabase);
  if ('error' in auth) return auth.error;
  const ws = await workspaceId(supabase);
  if (!ws) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  if (!body || !isLineType(body.type) || typeof body.id !== 'string') {
    return NextResponse.json({ error: 'type + id are required' }, { status: 400 });
  }
  const { error } = await supabase
    .from(TABLES[body.type])
    .delete()
    .eq('id', body.id)
    .eq('workspace_id', ws);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
