/* ============================================
   LOWPASS — GET /api/budget/vendor-history
   (Budget Phase B §B3.2)

   Workspace-scoped list of distinct vendor names from
   budget_line_item_transactions, ordered by frequency
   (most-used first). Used by <VendorCombobox> to power the
   autocomplete dropdown when adding / editing a transaction.

   Auth: workspace member via §SAFE's requireUserAndWorkspace.
   No tour gate — the list is workspace-wide so vendors used
   across past tours stay accessible.

   Cache: 5 minutes per workspace, using the in-memory map
   pattern from §SAFE. Cheap protection against the
   combobox firing on every focus / re-mount.
   ============================================ */

import { NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase-server';
import { requireUserAndWorkspace } from '@/lib/auth/workspace-check';
import { getCached, setCached } from '@/lib/rate-limit';

export const dynamic = 'force-dynamic';

const CACHE_MS = 5 * 60_000;
const cache = new Map<string, { at: number; value: { vendors: string[] } }>();

const MAX_RESULTS = 50;

export async function GET(): Promise<NextResponse> {
  const supabase = await createServerSupabaseClient();
  const auth = await requireUserAndWorkspace(supabase);
  if ('error' in auth) return auth.error;

  /* Per-workspace cache. The user dimension doesn't matter:
     every member sees the same vendor history. */
  const cached = getCached(cache, auth.workspaceId, CACHE_MS);
  if (cached) return NextResponse.json(cached);

  /* PostgREST has no DISTINCT or GROUP BY in REST. Fetch raw
     vendor_names + count in JS. Cap the row scan at 5000 to
     keep this bounded on big workspaces — vendor history
     beyond that is rarely useful and the most-used-first
     ordering surfaces the long tail anyway. */
  const { data } = await supabase
    .from('budget_line_item_transactions')
    .select('vendor_name')
    .eq('workspace_id', auth.workspaceId)
    .order('created_at', { ascending: false })
    .limit(5000);

  const counts = new Map<string, number>();
  for (const row of (data ?? []) as Array<{ vendor_name: string | null }>) {
    const v = (row.vendor_name ?? '').trim();
    if (!v) continue;
    /* Filter out the §A1 backfill placeholder so it doesn't
       pollute the autocomplete list. */
    if (v === '(legacy entry)') continue;
    counts.set(v, (counts.get(v) ?? 0) + 1);
  }
  const vendors = Array.from(counts.entries())
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, MAX_RESULTS)
    .map(([name]) => name);

  const result = { vendors };
  setCached(cache, auth.workspaceId, result);
  return NextResponse.json(result);
}
