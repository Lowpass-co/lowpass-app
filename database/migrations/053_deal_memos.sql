-- ============================================
-- LOWPASS — Deal memos canonical entity
-- Migration 053
-- ============================================
-- Independent of rider packs; tour required; routing id optional (NULL = tour-wide).

CREATE TABLE IF NOT EXISTS public.deal_memos (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id    uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  tour_id         uuid NOT NULL REFERENCES public.tours(id) ON DELETE CASCADE,
  -- NULL = tour-wide; set = show-specific (routing row)
  show_id         uuid REFERENCES public.routing(id) ON DELETE SET NULL,
  title           text NOT NULL,
  reference       text,
  promoter_name   text,
  promoter_email  text,
  promoter_phone  text,
  fee_amount      numeric(12, 2),
  fee_currency    text DEFAULT 'GBP',
  deposit_amount  numeric(12, 2),
  deposit_currency text,
  settlement_method text,
  status          text NOT NULL DEFAULT 'draft',
  sent_at         timestamptz,
  signed_at       timestamptz,
  expires_at      timestamptz,
  document_url    text,
  document_filename text,
  terms_summary   text,
  notes           text,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  created_by      uuid REFERENCES auth.users(id),
  updated_by      uuid REFERENCES auth.users(id),
  CONSTRAINT deal_memos_status_check CHECK (
    status IN ('draft', 'sent', 'pending', 'signed', 'expired')
  )
);

CREATE INDEX IF NOT EXISTS deal_memos_workspace_id_idx ON public.deal_memos(workspace_id);
CREATE INDEX IF NOT EXISTS deal_memos_tour_id_idx ON public.deal_memos(tour_id);
CREATE INDEX IF NOT EXISTS deal_memos_show_id_idx ON public.deal_memos(show_id);
CREATE INDEX IF NOT EXISTS deal_memos_status_idx ON public.deal_memos(status);

ALTER TABLE public.deal_memos ENABLE ROW LEVEL SECURITY;

CREATE POLICY deal_memos_select ON public.deal_memos
  FOR SELECT USING (workspace_id = public.get_my_workspace_id());

CREATE POLICY deal_memos_insert ON public.deal_memos
  FOR INSERT WITH CHECK (workspace_id = public.get_my_workspace_id());

CREATE POLICY deal_memos_update ON public.deal_memos
  FOR UPDATE USING (workspace_id = public.get_my_workspace_id())
  WITH CHECK (workspace_id = public.get_my_workspace_id());

CREATE POLICY deal_memos_delete ON public.deal_memos
  FOR DELETE USING (
    workspace_id = public.get_my_workspace_id() AND public.is_workspace_admin()
  );

DROP TRIGGER IF EXISTS deal_memos_updated_at ON public.deal_memos;
CREATE TRIGGER deal_memos_updated_at
  BEFORE UPDATE ON public.deal_memos
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ---------- Storage: deal-memos bucket (paths: {workspace_id}/{deal_memo_id}/{filename})
INSERT INTO storage.buckets (id, name, public)
VALUES ('deal-memos', 'deal-memos', false)
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "deal_memos_storage_select"
  ON storage.objects FOR SELECT
  USING (
    bucket_id = 'deal-memos'
    AND split_part(name, '/', 1) = public.get_my_workspace_id()::text
  );

CREATE POLICY "deal_memos_storage_insert"
  ON storage.objects FOR INSERT
  WITH CHECK (
    bucket_id = 'deal-memos'
    AND auth.uid() IS NOT NULL
    AND split_part(name, '/', 1) = public.get_my_workspace_id()::text
  );

CREATE POLICY "deal_memos_storage_update"
  ON storage.objects FOR UPDATE
  USING (
    bucket_id = 'deal-memos'
    AND split_part(name, '/', 1) = public.get_my_workspace_id()::text
  );

CREATE POLICY "deal_memos_storage_delete"
  ON storage.objects FOR DELETE
  USING (
    bucket_id = 'deal-memos'
    AND split_part(name, '/', 1) = public.get_my_workspace_id()::text
  );

-- Down (comment only):
-- DROP POLICY IF EXISTS deal_memos_storage_delete ON storage.objects;
-- DROP POLICY IF EXISTS deal_memos_storage_update ON storage.objects;
-- DROP POLICY IF EXISTS deal_memos_storage_insert ON storage.objects;
-- DROP POLICY IF EXISTS deal_memos_storage_select ON storage.objects;
-- DELETE FROM storage.buckets WHERE id = 'deal-memos';
-- DROP TABLE IF EXISTS public.deal_memos;
