/* ============================================================
   LOWPASS — RAG retrieval (per-workspace, RLS-enforced)

   embedQuery(queryText) → match_rag_chunks() cosine search. The SQL
   function is SECURITY INVOKER (migration 211), so RLS on rag_chunks
   applies to the calling user — a member can only ever match their own
   workspace's chunks. The explicit `ws` argument is belt-and-braces on
   top of RLS (the privacy invariant: never cross-workspace).

   Pass the USER-SESSION supabase client (not service-role) so RLS is in
   force. `ctx` is only for metering the one query-embedding call on the
   google lane.
   ============================================================ */

import type { SupabaseClient } from '@supabase/supabase-js';
import { embedQuery, toVectorLiteral } from '@/lib/ai/embeddings';
import type { ReindexContext } from './reindex';
import type { RagSourceKind, RagChunkMetadata } from './sources';

export interface RagHit {
  source_kind: RagSourceKind;
  source_id: string;
  content: string;
  metadata: RagChunkMetadata;
  distance: number;
}

/**
 * Retrieve the k most similar chunks for a query within one workspace.
 * Returns [] on an embedding failure (graceful — the caller surfaces an
 * empty Ask result rather than an error).
 */
export async function retrieve(
  supabase: SupabaseClient,
  ctx: ReindexContext,
  queryText: string,
  k = 8,
  opts: { tourIds?: string[] | null } = {},
): Promise<RagHit[]> {
  const q = queryText.trim();
  if (!q) return [];

  let queryVec: number[];
  try {
    queryVec = await embedQuery(q, {
      ctx: { workspaceId: ctx.workspaceId, userId: ctx.userId ?? ctx.workspaceId, endpoint: 'ai.embeddings' },
    });
  } catch {
    return [];
  }

  // Additive scope: a non-empty tourIds narrows to those tours; null/empty
  // is whole-workspace (the workspace_id clause in the fn always applies).
  const tourIds = opts.tourIds && opts.tourIds.length > 0 ? opts.tourIds : null;

  const { data, error } = await supabase.rpc('match_rag_chunks', {
    ws: ctx.workspaceId,
    query_embedding: toVectorLiteral(queryVec),
    match_count: k,
    p_tour_ids: tourIds,
  });
  if (error || !data) return [];

  return (data as Array<{
    source_kind: string;
    source_id: string;
    content: string;
    metadata: RagChunkMetadata | null;
    distance: number;
  }>).map((r) => ({
    source_kind: r.source_kind as RagSourceKind,
    source_id: r.source_id,
    content: r.content,
    metadata: r.metadata ?? {},
    distance: r.distance,
  }));
}
