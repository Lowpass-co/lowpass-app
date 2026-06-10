/* ============================================
   LOWPASS — budget line-item attachment aggregates (Phase 3, Step 5)

   Mirror of transactions.ts' aggregate helper: attach a per-line
   `attachment_count` at fetch time so the grid's 📎 cell shows a real count
   without loading the attachment rows. One round-trip; RLS scopes to the
   caller's workspace.
   ============================================ */

import type { SupabaseClient } from '@supabase/supabase-js';

/** line_item_id → number of attachments. One query, aggregated client-side
 *  (PostgREST has no GROUP BY). The attachments table is narrow + bounded. */
export async function fetchAttachmentCounts(
  supabase: SupabaseClient,
  lineItemIds: string[],
): Promise<Map<string, number>> {
  const map = new Map<string, number>();
  if (lineItemIds.length === 0) return map;
  const { data } = await supabase
    .from('budget_line_item_attachments')
    .select('line_item_id')
    .in('line_item_id', lineItemIds);
  for (const row of (data ?? []) as Array<{ line_item_id: string }>) {
    map.set(row.line_item_id, (map.get(row.line_item_id) ?? 0) + 1);
  }
  return map;
}

/** Decorate a line-items array with `attachment_count`. Returns a new array. */
export async function enrichLinesWithAttachmentCounts<L extends { id: string }>(
  supabase: SupabaseClient,
  lines: L[],
): Promise<Array<L & { attachment_count: number }>> {
  const counts = await fetchAttachmentCounts(
    supabase,
    lines.map((l) => l.id),
  );
  return lines.map((line) => ({ ...line, attachment_count: counts.get(line.id) ?? 0 }));
}
