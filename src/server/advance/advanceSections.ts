/* ============================================
   loadAdvanceSections — the ONE way to get a show's advance sections.

   A show's section layout lives on `advance_form_configs.sections`, reached
   through `advance_instances.form_config_id`. There is NO `sections` column on
   `advance_instances`. Ten call sites used to select one anyway (share page,
   venue intake GET/submit/tech-pack, pending review, reminders, the intake
   page, day sheets); PostgREST errors on an unknown column, they read the null
   `data` as "not found", and venue sending 404'd for every show with no error
   anywhere. `advanceSections.guard.test.tsx` now fails the build if anything
   selects that column again.

   tm_only (TM-view-only sections such as Deal Info) is NOT stored on the
   config's section snapshot; it lives on `advance_templates`. Venue-facing
   paths drop tm_only sections, so this loader FAILS CLOSED: if the template
   lookup errors, it throws rather than defaulting every section to
   venue-visible.
   ============================================ */

import type { SupabaseClient } from '@supabase/supabase-js';
import type { IntakeSection } from '@/lib/advance/intake';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function loadAdvanceSections(
  client: SupabaseClient,
  formConfigId: string | null | undefined,
): Promise<IntakeSection[]> {
  if (!formConfigId) return [];

  const { data: config, error } = await client
    .from('advance_form_configs')
    .select('sections')
    .eq('id', formConfigId)
    .maybeSingle<{ sections: IntakeSection[] | null }>();
  if (error) throw new Error(`advance sections: ${error.message}`);

  const sections = Array.isArray(config?.sections) ? config.sections : [];
  if (!sections.length) return [];
  const [out] = await markTmOnly(client, [sections]);
  return out;
}

/**
 * Marks TM-only sections on several section lists with ONE template lookup
 * (the board does every show at once). Fails closed, like the loader above.
 */
export async function markTmOnly<S extends { template_id: string; tm_only?: boolean }>(
  client: SupabaseClient,
  lists: S[][],
): Promise<S[][]> {
  // Only UUID-shaped ids can be template rows; a custom section's slug id in
  // an `.in('id', …)` would make Postgres reject the whole query.
  const ids = [
    ...new Set(lists.flat().map((s) => s.template_id).filter((id) => typeof id === 'string' && UUID.test(id))),
  ];
  const tmOnly = new Set<string>();
  if (ids.length) {
    const { data: rows, error: tErr } = await client
      .from('advance_templates')
      .select('id, tm_only')
      .in('id', ids);
    if (tErr) throw new Error(`advance sections (tm_only): ${tErr.message}`);
    for (const r of (rows ?? []) as { id: string; tm_only: boolean | null }[]) if (r.tm_only) tmOnly.add(r.id);
  }
  // A flag already on the snapshot is kept: either source saying TM-only wins.
  return lists.map((l) => l.map((s) => ({ ...s, tm_only: s.tm_only === true || tmOnly.has(s.template_id) })));
}
