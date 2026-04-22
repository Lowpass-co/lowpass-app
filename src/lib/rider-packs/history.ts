/* ============================================
   LOWPASS — Rider/Pack history append helper

   Used by route handlers after successful writes to record
   the change in rider_pack_history. Best-effort: if the
   insert fails, we log and continue — the primary write
   already succeeded.
   ============================================ */

import type { SupabaseClient } from '@supabase/supabase-js';
import type { HistoryChangeType } from './types';

export type AppendHistoryArgs = {
  packId: string;
  changedBy: string | null;
  changeType: HistoryChangeType;
  sectionKey?: string | null;
  fieldKey?: string | null;
  oldValue?: unknown;
  newValue?: unknown;
};

export async function appendHistory(
  supabase: SupabaseClient,
  args: AppendHistoryArgs,
): Promise<void> {
  const { error } = await supabase.from('rider_pack_history').insert({
    pack_id: args.packId,
    changed_by: args.changedBy,
    change_type: args.changeType,
    section_key: args.sectionKey ?? null,
    field_key: args.fieldKey ?? null,
    old_value: args.oldValue ?? null,
    new_value: args.newValue ?? null,
  });
  if (error) {
    // Don't throw — history is best-effort.
    console.warn('[rider-packs] history append failed', {
      packId: args.packId,
      changeType: args.changeType,
      error: error.message,
    });
  }
}
