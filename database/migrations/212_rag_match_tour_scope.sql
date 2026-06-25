-- ============================================
-- LOWPASS — RAG retrieval: optional tour/artist scope
-- Migration 212
--
-- Supersedes match_rag_chunks() (migration 211) with an optional
-- p_tour_ids filter so an "ask your history" query can be narrowed to a
-- single tour (p_tour_ids = ARRAY[tour_id]) or an artist (the artist's
-- tour_ids) — or left workspace-wide (p_tour_ids = NULL, the default,
-- which preserves the original behaviour).
--
-- The scope filter is ADDITIVE — it sits on top of the existing
-- `workspace_id = ws` clause, never instead of it. Cross-workspace
-- isolation (RAG-04) is unchanged: a member still can't read another
-- workspace's chunks (SECURITY INVOKER → caller's RLS applies).
--
-- A uuid[] param (rather than a single uuid) lets one signature serve
-- both tour and artist scope via ANY(...). Drop the old 3-arg overload
-- first so only one function remains (CREATE OR REPLACE can't change the
-- arg list in place). Idempotent.
-- ============================================

DROP FUNCTION IF EXISTS public.match_rag_chunks(uuid, vector, int);

CREATE OR REPLACE FUNCTION public.match_rag_chunks(
  ws uuid,
  query_embedding vector(768),
  match_count int DEFAULT 8,
  p_tour_ids uuid[] DEFAULT NULL
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
    -- Additive scope: NULL = whole workspace; otherwise only chunks whose
    -- metadata.tour_id is in the list. Chunks with no tour_id (e.g. venues)
    -- are excluded when a scope is given, which is the intended behaviour.
    AND (
      p_tour_ids IS NULL
      OR (c.metadata->>'tour_id') IS NOT NULL
         AND (c.metadata->>'tour_id')::uuid = ANY(p_tour_ids)
    )
  ORDER BY c.embedding <=> query_embedding
  LIMIT GREATEST(match_count, 1);
$$;

-- ============================================
-- DOWN (manual) — restore the 211 (un-scoped) signature
-- DROP FUNCTION IF EXISTS public.match_rag_chunks(uuid, vector, int, uuid[]);
-- CREATE OR REPLACE FUNCTION public.match_rag_chunks(
--   ws uuid, query_embedding vector(768), match_count int DEFAULT 8
-- ) RETURNS TABLE (id uuid, source_kind text, source_id uuid, content text, metadata jsonb, distance float)
-- LANGUAGE sql STABLE SECURITY INVOKER AS $$
--   SELECT c.id, c.source_kind, c.source_id, c.content, c.metadata, (c.embedding <=> query_embedding)
--   FROM public.rag_chunks c WHERE c.workspace_id = ws
--   ORDER BY c.embedding <=> query_embedding LIMIT GREATEST(match_count, 1);
-- $$;
-- ============================================
