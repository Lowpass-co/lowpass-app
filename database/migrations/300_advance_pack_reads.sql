-- ============================================================================
-- 300_advance_pack_reads.sql  (Nov 2026, Adam: "The AI read of the info packs
-- is SLOW, and gives you no info on how long it'll take, and doesnt encourage
-- you to close the window and come back")
--
-- One row per info-pack read for one show. The read runs on the server after
-- the request has answered (next/server `after`), writes its progress here
-- (parts_done of parts_total) and its result when done — so the TM can close
-- the window and find the answers waiting on the show's advance.
--
--   reading → done | failed      reviewed_at set once the TM has been through
--                                 it (saved or dismissed), so it stops showing.
--
-- No client can read or write this table: RLS on, no policies. The routes use
-- the service role after requireWrite({ area: 'advance', tourId }). The result
-- holds suggested answers quoted from venue documents — nothing beyond what
-- the advance already stores. Re-runnable.
-- ============================================================================
BEGIN;

CREATE TABLE IF NOT EXISTS public.advance_pack_reads (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id  UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  tour_id       UUID NOT NULL REFERENCES public.tours(id) ON DELETE CASCADE,
  routing_id    UUID NOT NULL REFERENCES public.routing(id) ON DELETE CASCADE,
  user_id       UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  files         JSONB NOT NULL DEFAULT '[]'::jsonb,   -- [{ path, name, size, type }]
  status        TEXT NOT NULL DEFAULT 'reading' CHECK (status IN ('reading', 'done', 'failed')),
  parts_total   INT NOT NULL DEFAULT 0,
  parts_done    INT NOT NULL DEFAULT 0,
  result        JSONB,
  error         TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  finished_at   TIMESTAMPTZ,
  reviewed_at   TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS advance_pack_reads_mine_idx
  ON public.advance_pack_reads (tour_id, user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS advance_pack_reads_done_idx
  ON public.advance_pack_reads (finished_at DESC) WHERE status = 'done';
ALTER TABLE public.advance_pack_reads ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.advance_pack_reads FROM anon, authenticated;

COMMIT;

-- ---------------------------------------------------------------------------
-- Down:
--   DROP TABLE IF EXISTS public.advance_pack_reads;
-- ---------------------------------------------------------------------------
