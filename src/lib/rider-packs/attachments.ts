/* ============================================
   LOWPASS — document attachments (rider decouple phase A, 2026-08-05)

   The attachment relation replaces "the rider inheritance chain happens to
   contain a channel_list section" as the way a channel list / stage plot
   reaches a rider, a show, or a tour. Resolution precedence for a SHOW:

     routing attachment  →  tour attachment  →  legacy fallback (caller's)

   One attachment per KIND per target, enforced here by replace-on-attach
   (SQL can't check kind without a join — see migration 256).
   ============================================ */

import type { SupabaseClient } from '@supabase/supabase-js';

export type DocumentKind = 'channel_list' | 'stage_plot' | 'rider';

export interface AttachedDocument {
  attachment_id: string;
  document_pack_id: string;
  kind: DocumentKind;
  title: string;
  version_label: string | null;
  version_of_pack_id: string | null;
}

interface AttachmentRow {
  id: string;
  document_pack_id: string;
  rider_packs: {
    kind: string | null;
    title: string | null;
    version_label: string | null;
    version_of_pack_id: string | null;
  } | null;
}

function toDocs(rows: AttachmentRow[] | null | undefined): AttachedDocument[] {
  return (rows ?? [])
    .filter((r) => r.rider_packs)
    .map((r) => ({
      attachment_id: r.id,
      document_pack_id: r.document_pack_id,
      kind: ((r.rider_packs?.kind as DocumentKind) ?? 'rider'),
      title: r.rider_packs?.title ?? 'Untitled',
      version_label: r.rider_packs?.version_label ?? null,
      version_of_pack_id: r.rider_packs?.version_of_pack_id ?? null,
    }));
}

const SELECT = 'id, document_pack_id, rider_packs:document_pack_id (kind, title, version_label, version_of_pack_id)';

export async function listAttachments(
  supabase: SupabaseClient,
  target: { riderPackId?: string; routingId?: string; tourId?: string },
): Promise<AttachedDocument[]> {
  let q = supabase.from('rider_pack_attachments').select(SELECT);
  if (target.riderPackId) q = q.eq('rider_pack_id', target.riderPackId);
  else if (target.routingId) q = q.eq('routing_id', target.routingId);
  else if (target.tourId) q = q.eq('tour_id', target.tourId);
  else return [];
  const { data, error } = await q;
  if (error) return []; // table missing pre-migration → behave as "nothing attached"
  return toDocs(data as unknown as AttachmentRow[]);
}

/**
 * The documents a SHOW should present, per kind:
 * its own routing attachment first, else the tour-wide default.
 */
export async function resolveShowDocuments(
  supabase: SupabaseClient,
  tourId: string,
  routingId: string | null,
): Promise<Partial<Record<DocumentKind, AttachedDocument>>> {
  const [showDocs, tourDocs] = await Promise.all([
    routingId ? listAttachments(supabase, { routingId }) : Promise.resolve([]),
    listAttachments(supabase, { tourId }),
  ]);
  const out: Partial<Record<DocumentKind, AttachedDocument>> = {};
  for (const d of tourDocs) out[d.kind] = d;
  for (const d of showDocs) out[d.kind] = d; // show wins
  return out;
}

/** Attach, replacing any existing attachment of the SAME KIND on the target. */
export async function attachDocument(
  supabase: SupabaseClient,
  ws: string,
  userId: string,
  documentPackId: string,
  target: { riderPackId?: string; routingId?: string; tourId?: string },
): Promise<{ ok: true; id: string } | { ok: false; status: number; error: string }> {
  const targets = [target.riderPackId, target.routingId, target.tourId].filter(Boolean);
  if (targets.length !== 1) return { ok: false, status: 400, error: 'Exactly one target required' };

  const { data: doc, error: docErr } = await supabase
    .from('rider_packs')
    .select('id, workspace_id, kind')
    .eq('id', documentPackId)
    .maybeSingle();
  if (docErr) return { ok: false, status: 500, error: docErr.message };
  if (!doc || doc.workspace_id !== ws) return { ok: false, status: 404, error: 'Document not found' };

  // Replace same-kind: find existing attachments on this target whose document
  // shares this kind, remove them, then insert.
  const existing = await listAttachments(supabase, target);
  const sameKind = existing.filter((d) => d.kind === ((doc.kind as DocumentKind) ?? 'rider'));
  if (sameKind.length) {
    await supabase
      .from('rider_pack_attachments')
      .delete()
      .in('id', sameKind.map((d) => d.attachment_id));
  }

  const { data: ins, error: insErr } = await supabase
    .from('rider_pack_attachments')
    .insert({
      workspace_id: ws,
      document_pack_id: documentPackId,
      rider_pack_id: target.riderPackId ?? null,
      routing_id: target.routingId ?? null,
      tour_id: target.tourId ?? null,
      created_by: userId,
    })
    .select('id')
    .single();
  if (insErr || !ins) return { ok: false, status: 500, error: insErr?.message ?? 'Attach failed' };
  return { ok: true, id: ins.id as string };
}
