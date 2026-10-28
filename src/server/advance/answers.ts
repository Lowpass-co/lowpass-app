/* ============================================
   Answer writes — validation + the one merge path.

   Every answer change (typed, accepted from an info pack, reused from an
   earlier show) goes through mergeAnswers → advance_merge_answers(), which
   merges into the stored JSON in one statement. Only questions that exist on
   the day's sections can be written; `contacts` lists ride inside a section.
   ============================================ */

import type { SupabaseClient } from '@supabase/supabase-js';
import type { AdvData, AdvSection } from '@/lib/advance/board';
import type { FieldSource } from './show';

export type AnswerChanges = Record<string, Record<string, unknown>>;
export type SourceChanges = Record<string, FieldSource | null>;

const MAX_TEXT = 5000;
const SOURCE_KINDS = new Set(['pack', 'venue', 'previous', 'you']);

function okValue(v: unknown): boolean {
  if (v === null) return true;
  if (typeof v === 'string') return v.length <= MAX_TEXT;
  if (typeof v === 'boolean') return true;
  if (typeof v === 'number') return Number.isFinite(v);
  return false;
}

function okContacts(v: unknown): boolean {
  if (!Array.isArray(v) || v.length > 50) return false;
  return v.every(
    (c) =>
      c && typeof c === 'object' && !Array.isArray(c) &&
      Object.values(c as Record<string, unknown>).every((x) => x === undefined || x === null || (typeof x === 'string' && x.length <= 500)),
  );
}

/** Returns an error message, or null when every change targets a real question. */
export function validateChanges(sections: AdvSection[], changes: unknown, sources: unknown): string | null {
  if (!changes || typeof changes !== 'object' || Array.isArray(changes)) return 'changes must be an object';
  const byId = new Map(sections.map((s) => [s.template_id, new Set((s.fields ?? []).map((f) => f.id))]));
  let n = 0;
  for (const [sid, fields] of Object.entries(changes as Record<string, unknown>)) {
    const known = byId.get(sid);
    if (!known) return `Unknown section ${sid}`;
    if (!fields || typeof fields !== 'object' || Array.isArray(fields)) return `Section ${sid} must be an object`;
    for (const [fid, v] of Object.entries(fields as Record<string, unknown>)) {
      n += 1;
      if (fid === 'contacts') {
        if (!okContacts(v)) return 'contacts must be a list of up to 50 contacts';
        continue;
      }
      if (!known.has(fid)) return `Unknown question ${sid}:${fid}`;
      if (!okValue(v)) return `Bad value for ${sid}:${fid}`;
    }
  }
  if (n > 500) return 'Too many changes at once';
  if (sources !== undefined && sources !== null) {
    if (typeof sources !== 'object' || Array.isArray(sources)) return 'sources must be an object';
    for (const [key, s] of Object.entries(sources as Record<string, unknown>)) {
      const [sid, fid] = key.split(':');
      if (!byId.get(sid)?.has(fid)) return `Unknown question ${key}`;
      if (s === null) continue;
      const src = s as Record<string, unknown>;
      if (!SOURCE_KINDS.has(String(src.kind))) return `Bad source for ${key}`;
      if (src.quote !== undefined && (typeof src.quote !== 'string' || src.quote.length > 600)) return `Quote too long for ${key}`;
      if (src.page !== undefined && (typeof src.page !== 'number' || !Number.isInteger(src.page) || src.page < 1)) return `Bad page for ${key}`;
      if (src.file_name !== undefined && (typeof src.file_name !== 'string' || src.file_name.length > 300)) return `Bad file name for ${key}`;
      if (src.doc_id !== undefined && typeof src.doc_id !== 'string') return `Bad document for ${key}`;
    }
  }
  return null;
}

export async function mergeAnswers(
  client: SupabaseClient,
  instanceId: string,
  changes: AnswerChanges,
  sources: SourceChanges = {},
): Promise<{ data: AdvData; field_sources: Record<string, FieldSource>; last_updated_at: string }> {
  const { data, error } = await client.rpc('advance_merge_answers', {
    p_instance: instanceId,
    p_changes: changes,
    p_sources: sources,
  });
  if (error) throw new Error(`save answers: ${error.message}`);
  if (!data) throw new Error('save answers: advance not found');
  return data as { data: AdvData; field_sources: Record<string, FieldSource>; last_updated_at: string };
}
