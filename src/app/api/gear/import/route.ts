/* POST /api/gear/import { rows: ImportRow[] } — add many stock items at once
   (Nov 2026). Each row goes through cleanImportRow again (never trust the
   browser's copy); ≤ 500 per call; one insert. A typed day rate is kept as
   the item's own (day_rate_manual), else the 3% rule applies. */
import { NextResponse } from 'next/server';
import { requireWrite } from '@/lib/auth/workspace-check';
import { createServerSupabaseClient } from '@/lib/supabase-server';
import { cleanImportRow } from '@/lib/gear/importList';

export const dynamic = 'force-dynamic';
const MAX_ROWS = 500;

export async function POST(request: Request) {
  const supabase = await createServerSupabaseClient();
  const auth = await requireWrite(supabase);
  if ('error' in auth) return auth.error;
  const body = (await request.json().catch(() => null)) as { rows?: unknown } | null;
  const raw = Array.isArray(body?.rows) ? body!.rows : [];
  if (raw.length === 0) return NextResponse.json({ error: 'Nothing to add.' }, { status: 400 });
  if (raw.length > MAX_ROWS) return NextResponse.json({ error: `${MAX_ROWS} items at a time, please.` }, { status: 400 });

  const rows = raw.map((r) => cleanImportRow((r ?? {}) as Record<string, unknown>)).filter((r) => r !== null);
  if (rows.length === 0) return NextResponse.json({ error: 'None of those rows has a name.' }, { status: 400 });

  const insert = (withQty: boolean) =>
    supabase
      .from('gear')
      .insert(
        rows.map((r) => ({
          workspace_id: auth.workspaceId,
          name: r.name,
          category: r.category,
          manufacturer: r.manufacturer,
          model: r.model,
          serial_number: r.serial,
          ownership: 'owned',
          status: 'available',
          purchase_cost: r.purchaseCost,
          day_rate: r.dayRate,
          day_rate_manual: r.dayRate != null,
          value_amount: r.value,
          value_currency: r.value != null ? 'USD' : null,
          weight_kg: r.weightKg,
          notes: r.notes,
          ...(withQty ? { quantity: r.quantity } : {}),
        })),
      )
      .select('id');
  let res = await insert(true);
  // Before 306 there's no quantity column — add them as one each.
  if (res.error && /quantity/.test(res.error.message)) res = await insert(false);
  if (res.error) return NextResponse.json({ error: res.error.message }, { status: 500 });
  return NextResponse.json({ added: (res.data ?? []).length });
}
