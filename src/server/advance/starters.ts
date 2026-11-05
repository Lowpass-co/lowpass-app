/* ============================================
   Advance starter templates (Nov 2026)

   Installs one of the starter question sets (Headline show day, Support show
   day, Festival day, Day off — src/lib/templates/tourTemplates.ts) into the
   workspace's advance_layout_templates, built from the question catalog
   (advance_templates). Runs only on an explicit action (creating a tour) —
   never on a page load.

   Re-runnable: if the workspace already has a template with that name, that
   one is used as it is (it may have been edited) and nothing is written.
   ============================================ */

import type { SupabaseClient } from '@supabase/supabase-js';
import { composeStarter, starterByKey, type AdvanceStarterKey, type CatalogSection } from '@/lib/templates/tourTemplates';
import { asTemplateSections, cleanSections, FIELD_TYPES } from './sections';

export async function installStarter(
  client: SupabaseClient,
  workspaceId: string,
  key: AdvanceStarterKey,
): Promise<{ id: string; created: boolean; missing: string[] }> {
  const starter = starterByKey(key);
  if (!starter) throw new Error(`Unknown advance starter: ${key}`);

  const { data: existing, error: eErr } = await client
    .from('advance_layout_templates')
    .select('id, name')
    .eq('workspace_id', workspaceId);
  if (eErr) throw new Error(`advance templates: ${eErr.message}`);
  const same = ((existing ?? []) as { id: string; name: string }[]).find(
    (t) => t.name.trim().toLowerCase() === starter.name.toLowerCase(),
  );
  if (same) return { id: same.id, created: false, missing: [] };

  const { data: catalog, error: cErr } = await client
    .from('advance_templates')
    .select('id, name, workspace_id, fields, tm_only')
    .eq('template_type', 'section')
    .or(`workspace_id.is.null,workspace_id.eq.${workspaceId}`);
  if (cErr) throw new Error(`question catalog: ${cErr.message}`);

  const { sections, missing } = composeStarter(starter, (catalog ?? []) as CatalogSection[]);
  // Catalog rows are old seeds: keep only questions the editor can show, and
  // give any odd type the plain text box rather than dropping the question.
  const safe = sections.map((s) => ({
    ...s,
    fields: s.fields
      .filter((f) => f && typeof f.id === 'string' && typeof f.label === 'string' && f.label.trim())
      .map((f) => (FIELD_TYPES.has(String(f.type)) ? f : { ...f, type: 'text' })),
  }));
  const cleaned = cleanSections(safe);
  if ('error' in cleaned) throw new Error(`${starter.name}: ${cleaned.error}`);

  const { data: row, error } = await client
    .from('advance_layout_templates')
    .insert({ workspace_id: workspaceId, name: starter.name, sections: asTemplateSections(cleaned.sections) })
    .select('id')
    .single();
  if (error || !row) throw new Error(`${starter.name}: ${error?.message ?? 'not saved'}`);
  return { id: (row as { id: string }).id, created: true, missing };
}
