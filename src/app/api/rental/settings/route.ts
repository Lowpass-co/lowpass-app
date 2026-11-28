/* PATCH /api/rental/settings — the workspace's rental settings. Send any of:
     days_per_week     1–7, halves allowed (306: rental_days_per_week)
     quote_valid_days  1–365 (307: rental_quote_valid_days)
     payment_details   text ≤ 2000, '' clears (307: rental_payment_details)
   Only the fields sent are checked and written. */
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

  const patch: Record<string, unknown> = {};
  if ('days_per_week' in body) {
    const n = Number(body.days_per_week);
    if (!Number.isFinite(n) || n < 1 || n > 7) return NextResponse.json({ error: 'A week is 1 to 7 days.' }, { status: 400 });
    patch.rental_days_per_week = weekLength(n);
  }
  if ('quote_valid_days' in body) {
    const n = Number(body.quote_valid_days);
    if (!Number.isInteger(n) || n < 1 || n > 365) return NextResponse.json({ error: 'A quote is valid for 1 to 365 days.' }, { status: 400 });
    patch.rental_quote_valid_days = n;
  }
  if ('payment_details' in body) {
    const v = body.payment_details;
    if (v != null && typeof v !== 'string') return NextResponse.json({ error: 'Payment details are text.' }, { status: 400 });
    const t = (v ?? '').trim();
    if (t.length > 2000) return NextResponse.json({ error: 'Payment details are 2,000 characters at most.' }, { status: 400 });
    patch.rental_payment_details = t || null;
  }
  if (Object.keys(patch).length === 0) return NextResponse.json({ error: 'Nothing to save.' }, { status: 400 });

  const cols = Object.keys(patch).join(', ');
  const { data, error } = await supabase
    .from('workspaces')
    .update(patch)
    .eq('id', auth.workspaceId)
    .select(cols)
    .maybeSingle();
  if (error) {
    const m = error.message;
    const need = /rental_days_per_week/.test(m) ? '306' : /rental_quote_valid_days|rental_payment_details/.test(m) ? '307' : null;
    return NextResponse.json({ error: need ? `Paste migration ${need} first.` : m }, { status: need ? 409 : 500 });
  }
  if (!data) return NextResponse.json({ error: 'Only a workspace admin can change this.' }, { status: 403 });
  const row = data as unknown as Record<string, unknown>;
  return NextResponse.json({
    ...(row.rental_days_per_week !== undefined ? { days_per_week: Number(row.rental_days_per_week) } : {}),
    ...(row.rental_quote_valid_days !== undefined ? { quote_valid_days: Number(row.rental_quote_valid_days) } : {}),
    ...(row.rental_payment_details !== undefined ? { payment_details: (row.rental_payment_details as string | null) ?? null } : {}),
  });
}
