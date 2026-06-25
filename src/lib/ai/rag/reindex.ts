/* ============================================================
   LOWPASS — RAG ingestion (structured records → stripped text → chunks)

   Fetches a workspace's own records (service-role, but ALWAYS filtered by
   workspace_id — never cross-workspace), runs them through the PII-safe
   builders in sources.ts, embeds the stripped text (gemini, google lane),
   and upserts rag_chunks on (workspace_id, source_kind, source_id) so
   re-runs update rather than duplicate.

   IMPORTANT: every SELECT here lists the allow-listed columns explicitly —
   the PII columns from DATA_MAP never leave the DB into application memory.

   Three entry points:
     reindexWorkspace  — bulk (the reindex endpoint / backfill)
     reindexRecord     — one record (incremental upkeep from entity routes)
     removeRecordChunks — delete a record's chunk (delete + erasure cascade)
   ============================================================ */

import type { SupabaseClient } from '@supabase/supabase-js';
import { createServiceSupabaseClient } from '@/lib/supabase-server';
import type { GoogleCallContext } from '@/lib/external/googleUsage';
import { embedTexts, EMBED_MODEL_TAG, toVectorLiteral } from '@/lib/ai/embeddings';
import {
  RAG_SOURCE_KINDS,
  buildChunk,
  type RagSourceKind,
  type RagChunkContent,
  type DealMemoSource,
  type VenueSource,
  type BudgetLineItemSource,
} from './sources';

/** Attribution for the google-lane metering on the embedding calls. */
export interface ReindexContext {
  workspaceId: string;
  userId: string | null;
}

interface BuiltRow {
  sourceId: string;
  built: RagChunkContent;
}

function googleCtx(ctx: ReindexContext): GoogleCallContext {
  // userId is required by GoogleCallContext; fall back to a sentinel for
  // system-initiated reindexes (service-role script with no session user).
  return { workspaceId: ctx.workspaceId, userId: ctx.userId ?? ctx.workspaceId, endpoint: 'ai.embeddings' };
}

/* ── source fetchers (allow-listed columns only) ─────────────────────── */

async function fetchDealMemos(
  svc: SupabaseClient,
  workspaceId: string,
  opts: { id?: string; since?: string },
): Promise<BuiltRow[]> {
  let q = svc
    .from('deal_memos')
    .select(
      'id, title, reference, fee_amount, fee_currency, deposit_amount, deposit_currency, settlement_method, status, terms_summary, tour_id, show_id, updated_at',
    )
    .eq('workspace_id', workspaceId);
  if (opts.id) q = q.eq('id', opts.id);
  if (opts.since) q = q.gte('updated_at', opts.since);
  const { data } = await q;
  const rows = (data ?? []) as Array<DealMemoSource & { show_id?: string | null; updated_at?: string }>;

  // Resolve non-PII show context (city / venue name / date) from routing.
  const showIds = Array.from(new Set(rows.map((r) => r.show_id).filter(Boolean))) as string[];
  const routingById = await fetchRoutingContext(svc, showIds);

  const out: BuiltRow[] = [];
  for (const r of rows) {
    const ctx = r.show_id ? routingById.get(r.show_id) : undefined;
    const built = buildChunk('deal_memo', {
      ...r,
      venue_name: ctx?.venue_name ?? null,
      city: ctx?.city ?? null,
      show_date: ctx?.date ?? null,
    } as DealMemoSource);
    if (built) out.push({ sourceId: r.id, built });
  }
  return out;
}

async function fetchVenues(
  svc: SupabaseClient,
  workspaceId: string,
  opts: { id?: string; since?: string },
): Promise<BuiltRow[]> {
  let q = svc
    .from('venues')
    .select('id, name, city, country, capacity, updated_at')
    .eq('workspace_id', workspaceId);
  if (opts.id) q = q.eq('id', opts.id);
  if (opts.since) q = q.gte('updated_at', opts.since);
  const { data } = await q;
  const rows = (data ?? []) as VenueSource[];
  const out: BuiltRow[] = [];
  for (const r of rows) {
    const built = buildChunk('venue', r);
    if (built) out.push({ sourceId: r.id, built });
  }
  return out;
}

async function fetchBudgetLineItems(
  svc: SupabaseClient,
  workspaceId: string,
  opts: { id?: string; since?: string },
): Promise<BuiltRow[]> {
  let q = svc
    .from('budget_line_items')
    .select('id, category, label, proposed_cost, actual_cost, currency, tour_id, routing_id, updated_at')
    .eq('workspace_id', workspaceId);
  if (opts.id) q = q.eq('id', opts.id);
  if (opts.since) q = q.gte('updated_at', opts.since);
  const { data } = await q;
  const rows = (data ?? []) as Array<BudgetLineItemSource & { routing_id?: string | null }>;

  const routingIds = Array.from(new Set(rows.map((r) => r.routing_id).filter(Boolean))) as string[];
  const routingById = await fetchRoutingContext(svc, routingIds);

  // F1: the line's currency is almost always NULL — the real currency lives
  // on the tour. Resolve tours.currency for the batch as the fallback.
  const tourIds = Array.from(new Set(rows.map((r) => r.tour_id).filter(Boolean))) as string[];
  const tourCurrencyById = await fetchTourCurrencies(svc, tourIds);

  const out: BuiltRow[] = [];
  for (const r of rows) {
    const ctx = r.routing_id ? routingById.get(r.routing_id) : undefined;
    const built = buildChunk('budget_line_item', {
      ...r,
      tour_currency: r.tour_id ? tourCurrencyById.get(r.tour_id) ?? null : null,
      city: ctx?.city ?? null,
      show_date: ctx?.date ?? null,
    } as BudgetLineItemSource);
    if (built) out.push({ sourceId: r.id, built });
  }
  return out;
}

/** Map tour_id → tours.currency (the fallback for line items with no
 *  currency of their own). Currency is a 3-letter code, not personal. */
async function fetchTourCurrencies(svc: SupabaseClient, ids: string[]): Promise<Map<string, string | null>> {
  const map = new Map<string, string | null>();
  if (ids.length === 0) return map;
  const { data } = await svc.from('tours').select('id, currency').in('id', ids);
  for (const r of (data ?? []) as Array<{ id: string; currency: string | null }>) {
    map.set(r.id, r.currency);
  }
  return map;
}

/** Routing rows are non-PII context (city/venue/date). venue_name is a
 *  business name; venue_phone/notes are NOT selected. */
async function fetchRoutingContext(
  svc: SupabaseClient,
  ids: string[],
): Promise<Map<string, { city: string | null; venue_name: string | null; date: string | null }>> {
  const map = new Map<string, { city: string | null; venue_name: string | null; date: string | null }>();
  if (ids.length === 0) return map;
  const { data } = await svc.from('routing').select('id, city, venue_name, date').in('id', ids);
  for (const r of (data ?? []) as Array<{ id: string; city: string | null; venue_name: string | null; date: string | null }>) {
    map.set(r.id, { city: r.city, venue_name: r.venue_name, date: r.date });
  }
  return map;
}

async function fetchBuilt(
  svc: SupabaseClient,
  workspaceId: string,
  kind: RagSourceKind,
  opts: { id?: string; since?: string },
): Promise<BuiltRow[]> {
  switch (kind) {
    case 'deal_memo':
      return fetchDealMemos(svc, workspaceId, opts);
    case 'venue':
      return fetchVenues(svc, workspaceId, opts);
    case 'budget_line_item':
      return fetchBudgetLineItems(svc, workspaceId, opts);
    default:
      return [];
  }
}

/* ── upsert ──────────────────────────────────────────────────────────── */

async function embedAndUpsert(
  svc: SupabaseClient,
  ctx: ReindexContext,
  kind: RagSourceKind,
  built: BuiltRow[],
): Promise<number> {
  if (built.length === 0) return 0;
  const vectors = await embedTexts(
    built.map((b) => b.built.content),
    { ctx: googleCtx(ctx), taskType: 'RETRIEVAL_DOCUMENT' },
  );
  const rows = built.map((b, i) => ({
    workspace_id: ctx.workspaceId,
    source_kind: kind,
    source_id: b.sourceId,
    content: b.built.content,
    embedding: toVectorLiteral(vectors[i]),
    metadata: b.built.metadata,
    embed_model: EMBED_MODEL_TAG,
  }));
  const { error } = await svc
    .from('rag_chunks')
    .upsert(rows, { onConflict: 'workspace_id,source_kind,source_id' });
  if (error) throw new Error(`rag_chunks upsert failed: ${error.message}`);
  return rows.length;
}

/* ── public entry points ─────────────────────────────────────────────── */

export interface ReindexResult {
  kind: RagSourceKind;
  embedded: number;
}

/** Bulk reindex one or all v1 kinds for a workspace (endpoint / backfill). */
export async function reindexWorkspace(
  ctx: ReindexContext,
  opts: { sourceKind?: RagSourceKind; since?: string } = {},
): Promise<ReindexResult[]> {
  const svc = createServiceSupabaseClient();
  const kinds: RagSourceKind[] = opts.sourceKind ? [opts.sourceKind] : [...RAG_SOURCE_KINDS];
  const results: ReindexResult[] = [];
  for (const kind of kinds) {
    const built = await fetchBuilt(svc, ctx.workspaceId, kind, { since: opts.since });
    const embedded = await embedAndUpsert(svc, ctx, kind, built);
    results.push({ kind, embedded });
  }
  return results;
}

/**
 * Re-embed a single record (incremental upkeep). Best-effort — callers fire
 * this and never block the user's save; a throw here is logged, not surfaced.
 * Deletes the chunk if the record no longer yields embeddable content.
 */
export async function reindexRecord(
  ctx: ReindexContext,
  kind: RagSourceKind,
  id: string,
): Promise<void> {
  const svc = createServiceSupabaseClient();
  const built = await fetchBuilt(svc, ctx.workspaceId, kind, { id });
  if (built.length === 0) {
    // Nothing embeddable (e.g. cleared label) — ensure no stale chunk remains.
    await removeRecordChunks(ctx.workspaceId, kind, id);
    return;
  }
  await embedAndUpsert(svc, ctx, kind, built);
}

/** Delete the chunk(s) for one source record. Used on record delete AND by
 *  the GDPR erasure cascade (see deleteSourceChunks). Service-role. */
export async function removeRecordChunks(
  workspaceId: string,
  kind: RagSourceKind,
  id: string,
): Promise<void> {
  const svc = createServiceSupabaseClient();
  const { error } = await svc
    .from('rag_chunks')
    .delete()
    .eq('workspace_id', workspaceId)
    .eq('source_kind', kind)
    .eq('source_id', id);
  if (error) throw new Error(`rag_chunks delete failed: ${error.message}`);
}

/* ── fire-and-forget wrappers for incremental upkeep ──────────────────
   Call sites in the entity write routes use these so a re-embed never
   blocks (or breaks) the user's save. NOTE: post-response work in a
   serverless handler is best-effort — the bulk reindex endpoint is the
   reliable backstop. */
export function reindexRecordSafe(ctx: ReindexContext, kind: RagSourceKind, id: string): void {
  void reindexRecord(ctx, kind, id).catch((e) =>
    console.error('[rag] reindexRecord failed', { kind, id, error: e }),
  );
}

export function removeRecordChunksSafe(workspaceId: string, kind: RagSourceKind, id: string): void {
  void removeRecordChunks(workspaceId, kind, id).catch((e) =>
    console.error('[rag] removeRecordChunks failed', { kind, id, error: e }),
  );
}

/* ── GDPR erasure hook ────────────────────────────────────────────────
   The Art. 17 erasure executor does NOT exist yet (migration 207 defers
   it until the DATA_MAP is signed off; nothing imports gdpr/registry.ts).
   When it is built, it MUST call this for every erased source row whose
   table feeds the index — anonymising/deleting a deal_memo, venue, or
   budget_line_item without clearing its chunk would leave the pre-erasure
   text embedded. RAG_INDEXED_TABLES maps the registry's table names to the
   source kinds so the executor can drive this generically. */
export const RAG_INDEXED_TABLES: Record<string, RagSourceKind> = {
  deal_memos: 'deal_memo',
  venues: 'venue',
  budget_line_items: 'budget_line_item',
};

/** Erasure-cascade entry point: clear the chunk for an erased source row. */
export async function deleteSourceChunks(
  workspaceId: string,
  table: string,
  sourceId: string,
): Promise<void> {
  const kind = RAG_INDEXED_TABLES[table];
  if (!kind) return; // table doesn't feed the index — nothing to do.
  await removeRecordChunks(workspaceId, kind, sourceId);
}
