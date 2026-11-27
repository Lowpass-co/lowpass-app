/* ============================================
   LOWPASS — who may write a tour's Files (Nov 2026, Adam)

   Adam: "Ben is tour manager permissions but can't save a parking map" —
   the map exported, then filing the PDF died on "Forbidden — your role
   cannot make this change." The Files routes were still on bare
   requireWrite (admin / manager only), though the database (293 / 298) has
   always let anyone with Files EDIT on a tour write that tour's files — a
   Tour manager on all of his tours, a Member with Files EDIT.

   One rule for the upload, the finish and show / venue / person links:
     a tour file  → Files EDIT on that tour (requireWrite { area: 'files' })
     anything else (artist files, a file we can't place) → admin / manager.
   The database rules still decide the row itself.
   ============================================ */

import type { SupabaseClient } from '@supabase/supabase-js';

/** The file's id without the canvas's "ref:" prefix. */
export function fileRefId(id: string): string {
  return id.replace(/^ref:/, '');
}

/** The tour a file belongs to: its own tour, or the tour of the show it was
 *  filed on. Null for artist files or one the caller can't read. */
export async function tourOfFile(client: SupabaseClient, fileId: string): Promise<string | null> {
  const { data } = await client
    .from('file_references')
    .select('linked_to_type, linked_to_id')
    .eq('id', fileRefId(fileId))
    .maybeSingle<{ linked_to_type: string | null; linked_to_id: string | null }>();
  if (!data?.linked_to_id) return null;
  if (data.linked_to_type === 'tour') return data.linked_to_id;
  if (data.linked_to_type === 'routing') {
    const { data: day } = await client.from('routing').select('tour_id').eq('id', data.linked_to_id).maybeSingle<{ tour_id: string | null }>();
    return day?.tour_id ?? null;
  }
  return null;
}

/** The tour behind a show / venue / person link (by the file it links). */
export async function tourOfLink(client: SupabaseClient, linkId: string): Promise<string | null> {
  const { data } = await client.from('file_entity_links').select('file_id').eq('id', linkId).maybeSingle<{ file_id: string }>();
  return data ? tourOfFile(client, data.file_id) : null;
}

/** requireWrite's options for a Files write on `tourId` (null → none, i.e.
 *  admin / manager). Routes call requireWrite(supabase, filesWrite(tourId))
 *  so the guard ratchet still sees requireWrite in the route. */
export function filesWrite(tourId: string | null): { area?: 'files'; tourId?: string } {
  return tourId ? { area: 'files', tourId } : {};
}
