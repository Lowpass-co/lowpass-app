-- ============================================
-- LOWPASS — RAG document chunk index (per-workspace)
-- Migration 211
--
-- Per-workspace semantic index over the workspace's own STRUCTURED
-- records. Embeddings are Google Gemini (gemini-embedding-001 truncated
-- to 768 dims via outputDimensionality — confirmed against
-- ai.google.dev/gemini-api/docs/embeddings, 2026-06-24). PII is excluded
-- UPSTREAM (see src/lib/ai/rag/sources.ts allow-lists, built from
-- docs/gdpr/DATA_MAP.md F1/F3); this table stores only the already-
-- stripped text that was embedded.
--
-- Per-workspace isolation is the privacy invariant: every retrieval
-- filters workspace_id = get_my_workspace_id(); the index is NEVER
-- cross-workspace (that is the future Community layer, with its own
-- opt-in + k-anonymity — NOT this).
-- ============================================

CREATE EXTENSION IF NOT EXISTS vector;

-- source_kind ∈ ('deal_memo','venue','budget_line_item') for v1.
CREATE TABLE IF NOT EXISTS public.rag_chunks (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id  uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  source_kind   text NOT NULL,
  source_id     uuid NOT NULL,         -- the row this chunk derives from
  content       text NOT NULL,         -- the PII-stripped text that was embedded
  embedding     vector(768) NOT NULL,  -- gemini-embedding-001 @ outputDimensionality=768
  metadata      jsonb NOT NULL DEFAULT '{}'::jsonb,  -- tour_id, city, date, etc. (non-PII only)
  embed_model   text NOT NULL,         -- e.g. 'gemini-embedding-001@768' (provenance for re-embeds)
  created_at    timestamptz NOT NULL DEFAULT now(),
  UNIQUE (workspace_id, source_kind, source_id)
);

-- Workspace-scoped retrieval + the erasure cascade both need this.
CREATE INDEX IF NOT EXISTS rag_chunks_workspace_idx
  ON public.rag_chunks (workspace_id, source_kind);
-- Per-source lookup for re-embed / erasure of a single record.
CREATE INDEX IF NOT EXISTS rag_chunks_source_idx
  ON public.rag_chunks (source_kind, source_id);
-- HNSW cosine index for retrieval. (Fine to build here for a fresh table;
-- for a large backfill build it AFTER the rows land.)
CREATE INDEX IF NOT EXISTS rag_chunks_embedding_idx
  ON public.rag_chunks USING hnsw (embedding vector_cosine_ops);

ALTER TABLE public.rag_chunks ENABLE ROW LEVEL SECURITY;

-- Read: workspace members read their own workspace's chunks.
DROP POLICY IF EXISTS rag_chunks_select ON public.rag_chunks;
CREATE POLICY rag_chunks_select ON public.rag_chunks
  FOR SELECT USING (workspace_id = public.get_my_workspace_id());

-- Writes are service-role only (the ingestion job writes; UI never inserts) —
-- mirror the ai_usage_events pattern (migration 114).
DROP POLICY IF EXISTS rag_chunks_no_client_write ON public.rag_chunks;
CREATE POLICY rag_chunks_no_client_write ON public.rag_chunks
  FOR INSERT WITH CHECK (false);

-- ── Retrieval function ──────────────────────────────────────────────
-- SECURITY INVOKER (the default) so the caller's RLS on rag_chunks
-- applies — a member can only ever match their own workspace's chunks.
-- The explicit workspace_id filter is belt-and-braces on top of RLS.
-- Cosine distance via the <=> operator (pairs with the HNSW
-- vector_cosine_ops index above); smaller distance = more similar.
CREATE OR REPLACE FUNCTION public.match_rag_chunks(
  ws uuid,
  query_embedding vector(768),
  match_count int DEFAULT 8
)
RETURNS TABLE (
  id          uuid,
  source_kind text,
  source_id   uuid,
  content     text,
  metadata    jsonb,
  distance    float
)
LANGUAGE sql
STABLE
SECURITY INVOKER
AS $$
  SELECT
    c.id,
    c.source_kind,
    c.source_id,
    c.content,
    c.metadata,
    (c.embedding <=> query_embedding) AS distance
  FROM public.rag_chunks c
  WHERE c.workspace_id = ws
  ORDER BY c.embedding <=> query_embedding
  LIMIT GREATEST(match_count, 1);
$$;

-- ============================================
-- DOWN (manual)
-- DROP FUNCTION IF EXISTS public.match_rag_chunks(uuid, vector, int);
-- DROP TABLE IF EXISTS public.rag_chunks CASCADE;
-- -- leave the vector extension; other features may use it.
-- ============================================
