# Cursor Prompt — Rider/Pack R1: DB migrations

**This is the first of ~5 PRs implementing the Rider/Pack Builder. See `RIDER_PACK_DESIGN.md` in the repo root for the full design — you don't need to read it to execute this prompt, but refer to it if anything here feels under-specified.**

**Scope of R1:** migration 034 only. Six new tables, one helper function, one storage bucket, RLS policies, an optional pg_cron retention job. No API routes. No TypeScript. No UI. If you find yourself editing any `.ts`/`.tsx` file, stop.

---

## Hard rules

1. Only file touched: `database/migrations/034_rider_pack_system.sql` (new file).
2. Do not modify any existing migration.
3. Do not touch any `.ts` / `.tsx` / `.jsx` file.
4. Do not run the migration against any remote Supabase instance. Local dev only. Adam runs prod migrations manually.
5. If anything is ambiguous, stop and report. Do not invent schema.
6. Every step has a grep/psql acceptance check. Run them. Paste output.

---

## Step 0 — Pre-flight

```bash
# A. Confirm migrations folder exists and 034 is free
ls database/migrations/034_* 2>&1
ls database/migrations/ | tail -5

# B. Confirm get_my_workspace_id() helper exists
grep -rn "get_my_workspace_id" database/migrations/ | head -5

# C. Confirm the tables we reference exist
grep -n "CREATE TABLE.*\(artists\|tours\|routing\|workspaces\|profiles\|roles\)" database/migrations/001_initial_schema.sql | head -20

# D. Confirm no rider_* or pack_* table exists
grep -rni "CREATE TABLE.*rider\|CREATE TABLE.*pack" database/migrations/ | head -5
```

### Acceptance

- A: first `ls` prints "No such file" (034 doesn't exist yet). Second prints recent migrations ending with 033.
- B: prints the definition line(s) of `get_my_workspace_id`. If empty, stop.
- C: prints lines showing `artists`, `tours`, `routing`, `workspaces`, `profiles`, `roles` all defined.
- D: prints nothing. If anything shows up, stop and report.

---

## Step 1 — Write the migration

Create `database/migrations/034_rider_pack_system.sql` with the exact content below. Do not add additional columns. Do not rearrange. If you think something is missing, stop and report instead of adding.

```sql
-- ============================================
-- LOWPASS — Rider / Pack System
-- Migration 034
--
-- Artist → Tour → Show three-layer inheritance for rider/advance packs.
-- Six tables:
--   rider_packs        — one pack per scope (artist | tour | show).
--   rider_sections     — sections within a pack. Sparse: a section exists
--                        at a given scope iff it's been overridden there.
--                        Client resolves by walking scope chain.
--   rider_assets       — logos, stage plots, input list files. Scope-aware.
--   rider_pack_exports — snapshot per export (Google Doc overwrite or web link).
--   rider_pack_history — field-level audit, 90-day rolling.
--   rider_web_links    — tokenised public URLs with optional password.
--
-- Plus:
--   is_workspace_admin()           helper (mirrors get_my_workspace_id pattern)
--   rider-assets                   private storage bucket
--   rider_pack_history_cleanup()   90-day retention function
--   (optional) pg_cron schedule for the above
-- ============================================

-- ============================================
-- Helpers
-- ============================================

CREATE OR REPLACE FUNCTION public.is_workspace_admin()
RETURNS BOOLEAN AS $$
  SELECT COALESCE(r.is_god, FALSE)
  FROM profiles p
  LEFT JOIN roles r ON r.id = p.role_id
  WHERE p.id = auth.uid()
$$ LANGUAGE sql STABLE SECURITY DEFINER;

COMMENT ON FUNCTION public.is_workspace_admin() IS
  'Returns true if the current user''s profile is linked to a role where is_god = true. Used to gate artist-baseline writes.';

-- ============================================
-- rider_packs
-- ============================================

CREATE TABLE IF NOT EXISTS rider_packs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  scope TEXT NOT NULL CHECK (scope IN ('artist', 'tour', 'show')),
  artist_id UUID NOT NULL REFERENCES artists(id) ON DELETE CASCADE,
  tour_id UUID REFERENCES tours(id) ON DELETE CASCADE,
  routing_id UUID REFERENCES routing(id) ON DELETE CASCADE,
  title TEXT,
  google_doc_id TEXT,
  google_doc_url TEXT,
  created_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT rider_packs_scope_shape CHECK (
    (scope = 'artist' AND tour_id IS NULL AND routing_id IS NULL) OR
    (scope = 'tour'   AND tour_id IS NOT NULL AND routing_id IS NULL) OR
    (scope = 'show'   AND tour_id IS NOT NULL AND routing_id IS NOT NULL)
  )
);

-- One pack per (artist | artist+tour | artist+tour+show) tuple.
CREATE UNIQUE INDEX IF NOT EXISTS rider_packs_artist_unique
  ON rider_packs(artist_id) WHERE scope = 'artist';
CREATE UNIQUE INDEX IF NOT EXISTS rider_packs_tour_unique
  ON rider_packs(artist_id, tour_id) WHERE scope = 'tour';
CREATE UNIQUE INDEX IF NOT EXISTS rider_packs_show_unique
  ON rider_packs(artist_id, tour_id, routing_id) WHERE scope = 'show';

CREATE INDEX IF NOT EXISTS rider_packs_workspace_idx ON rider_packs(workspace_id);
CREATE INDEX IF NOT EXISTS rider_packs_artist_idx ON rider_packs(artist_id);
CREATE INDEX IF NOT EXISTS rider_packs_tour_idx ON rider_packs(tour_id) WHERE tour_id IS NOT NULL;

ALTER TABLE rider_packs ENABLE ROW LEVEL SECURITY;

-- SELECT: any member of the workspace.
CREATE POLICY "rider_packs_select"
  ON rider_packs FOR SELECT
  USING (workspace_id = public.get_my_workspace_id());

-- INSERT: any member may create tour/show packs. Only admins may create
-- artist-scoped (baseline) packs.
CREATE POLICY "rider_packs_insert"
  ON rider_packs FOR INSERT
  WITH CHECK (
    workspace_id = public.get_my_workspace_id() AND
    (scope <> 'artist' OR public.is_workspace_admin())
  );

-- UPDATE: workspace match required. Artist-baseline writes gated on admin.
CREATE POLICY "rider_packs_update"
  ON rider_packs FOR UPDATE
  USING (workspace_id = public.get_my_workspace_id())
  WITH CHECK (
    workspace_id = public.get_my_workspace_id() AND
    (scope <> 'artist' OR public.is_workspace_admin())
  );

-- DELETE: same rule as UPDATE.
CREATE POLICY "rider_packs_delete"
  ON rider_packs FOR DELETE
  USING (
    workspace_id = public.get_my_workspace_id() AND
    (scope <> 'artist' OR public.is_workspace_admin())
  );

-- ============================================
-- rider_sections
-- ============================================

CREATE TABLE IF NOT EXISTS rider_sections (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  pack_id UUID NOT NULL REFERENCES rider_packs(id) ON DELETE CASCADE,
  section_key TEXT NOT NULL,
  title TEXT NOT NULL,
  sort_order INT NOT NULL DEFAULT 0,
  fields JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT rider_sections_fields_is_array CHECK (jsonb_typeof(fields) = 'array'),
  UNIQUE (pack_id, section_key)
);

CREATE INDEX IF NOT EXISTS rider_sections_pack_sort_idx ON rider_sections(pack_id, sort_order);

ALTER TABLE rider_sections ENABLE ROW LEVEL SECURITY;

-- Section visibility/edit follows the parent pack.
CREATE POLICY "rider_sections_select"
  ON rider_sections FOR SELECT
  USING (
    pack_id IN (
      SELECT id FROM rider_packs WHERE workspace_id = public.get_my_workspace_id()
    )
  );

CREATE POLICY "rider_sections_insert"
  ON rider_sections FOR INSERT
  WITH CHECK (
    pack_id IN (
      SELECT id FROM rider_packs
      WHERE workspace_id = public.get_my_workspace_id()
        AND (scope <> 'artist' OR public.is_workspace_admin())
    )
  );

CREATE POLICY "rider_sections_update"
  ON rider_sections FOR UPDATE
  USING (
    pack_id IN (
      SELECT id FROM rider_packs
      WHERE workspace_id = public.get_my_workspace_id()
        AND (scope <> 'artist' OR public.is_workspace_admin())
    )
  );

CREATE POLICY "rider_sections_delete"
  ON rider_sections FOR DELETE
  USING (
    pack_id IN (
      SELECT id FROM rider_packs
      WHERE workspace_id = public.get_my_workspace_id()
        AND (scope <> 'artist' OR public.is_workspace_admin())
    )
  );

-- ============================================
-- rider_assets
-- ============================================

CREATE TABLE IF NOT EXISTS rider_assets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  scope TEXT NOT NULL CHECK (scope IN ('artist', 'tour', 'show')),
  artist_id UUID NOT NULL REFERENCES artists(id) ON DELETE CASCADE,
  tour_id UUID REFERENCES tours(id) ON DELETE CASCADE,
  routing_id UUID REFERENCES routing(id) ON DELETE CASCADE,
  asset_type TEXT NOT NULL CHECK (asset_type IN ('image', 'file', 'url')),
  label TEXT NOT NULL,
  storage_path TEXT,
  external_url TEXT,
  meta JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT rider_assets_scope_shape CHECK (
    (scope = 'artist' AND tour_id IS NULL AND routing_id IS NULL) OR
    (scope = 'tour'   AND tour_id IS NOT NULL AND routing_id IS NULL) OR
    (scope = 'show'   AND tour_id IS NOT NULL AND routing_id IS NOT NULL)
  ),
  -- Image/file must have storage_path; url must have external_url.
  CONSTRAINT rider_assets_payload_shape CHECK (
    (asset_type IN ('image', 'file') AND storage_path IS NOT NULL) OR
    (asset_type = 'url' AND external_url IS NOT NULL)
  )
);

CREATE INDEX IF NOT EXISTS rider_assets_workspace_idx ON rider_assets(workspace_id);
CREATE INDEX IF NOT EXISTS rider_assets_artist_idx ON rider_assets(artist_id);
CREATE INDEX IF NOT EXISTS rider_assets_tour_idx ON rider_assets(tour_id) WHERE tour_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS rider_assets_routing_idx ON rider_assets(routing_id) WHERE routing_id IS NOT NULL;

ALTER TABLE rider_assets ENABLE ROW LEVEL SECURITY;

CREATE POLICY "rider_assets_select"
  ON rider_assets FOR SELECT
  USING (workspace_id = public.get_my_workspace_id());

CREATE POLICY "rider_assets_insert"
  ON rider_assets FOR INSERT
  WITH CHECK (
    workspace_id = public.get_my_workspace_id() AND
    (scope <> 'artist' OR public.is_workspace_admin())
  );

CREATE POLICY "rider_assets_update"
  ON rider_assets FOR UPDATE
  USING (workspace_id = public.get_my_workspace_id())
  WITH CHECK (
    workspace_id = public.get_my_workspace_id() AND
    (scope <> 'artist' OR public.is_workspace_admin())
  );

CREATE POLICY "rider_assets_delete"
  ON rider_assets FOR DELETE
  USING (
    workspace_id = public.get_my_workspace_id() AND
    (scope <> 'artist' OR public.is_workspace_admin())
  );

-- ============================================
-- rider_pack_exports
-- ============================================

CREATE TABLE IF NOT EXISTS rider_pack_exports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  pack_id UUID NOT NULL REFERENCES rider_packs(id) ON DELETE CASCADE,
  exported_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
  export_type TEXT NOT NULL CHECK (export_type IN ('google_doc', 'web_link')),
  target_id TEXT NOT NULL,
  target_url TEXT,
  content_snapshot JSONB NOT NULL,
  exported_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS rider_pack_exports_pack_idx ON rider_pack_exports(pack_id, exported_at DESC);

ALTER TABLE rider_pack_exports ENABLE ROW LEVEL SECURITY;

CREATE POLICY "rider_pack_exports_select"
  ON rider_pack_exports FOR SELECT
  USING (
    pack_id IN (
      SELECT id FROM rider_packs WHERE workspace_id = public.get_my_workspace_id()
    )
  );

CREATE POLICY "rider_pack_exports_insert"
  ON rider_pack_exports FOR INSERT
  WITH CHECK (
    pack_id IN (
      SELECT id FROM rider_packs WHERE workspace_id = public.get_my_workspace_id()
    )
  );

-- No UPDATE/DELETE policies: export records are immutable audit trail.

-- ============================================
-- rider_pack_history
-- ============================================

CREATE TABLE IF NOT EXISTS rider_pack_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  pack_id UUID NOT NULL REFERENCES rider_packs(id) ON DELETE CASCADE,
  changed_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
  change_type TEXT NOT NULL,
  section_key TEXT,
  field_key TEXT,
  old_value JSONB,
  new_value JSONB,
  changed_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS rider_pack_history_pack_changed_idx
  ON rider_pack_history(pack_id, changed_at DESC);
CREATE INDEX IF NOT EXISTS rider_pack_history_changed_at_idx
  ON rider_pack_history(changed_at);

ALTER TABLE rider_pack_history ENABLE ROW LEVEL SECURITY;

CREATE POLICY "rider_pack_history_select"
  ON rider_pack_history FOR SELECT
  USING (
    pack_id IN (
      SELECT id FROM rider_packs WHERE workspace_id = public.get_my_workspace_id()
    )
  );

CREATE POLICY "rider_pack_history_insert"
  ON rider_pack_history FOR INSERT
  WITH CHECK (
    pack_id IN (
      SELECT id FROM rider_packs WHERE workspace_id = public.get_my_workspace_id()
    )
  );

-- No UPDATE/DELETE policies: history is immutable. Retention handled by
-- scheduled cleanup function below.

-- Retention cleanup
CREATE OR REPLACE FUNCTION public.rider_pack_history_cleanup()
RETURNS void AS $$
  DELETE FROM rider_pack_history WHERE changed_at < now() - interval '90 days';
$$ LANGUAGE sql SECURITY DEFINER;

COMMENT ON FUNCTION public.rider_pack_history_cleanup() IS
  'Drops rider_pack_history rows older than 90 days. Intended to run nightly via pg_cron.';

-- ============================================
-- rider_web_links
-- ============================================

CREATE TABLE IF NOT EXISTS rider_web_links (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  pack_id UUID NOT NULL REFERENCES rider_packs(id) ON DELETE CASCADE,
  token TEXT NOT NULL UNIQUE,
  password_hash TEXT,
  created_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  revoked_at TIMESTAMPTZ,
  revoked_reason TEXT
);

CREATE INDEX IF NOT EXISTS rider_web_links_pack_idx ON rider_web_links(pack_id);
CREATE INDEX IF NOT EXISTS rider_web_links_active_idx
  ON rider_web_links(pack_id) WHERE revoked_at IS NULL;

ALTER TABLE rider_web_links ENABLE ROW LEVEL SECURITY;

CREATE POLICY "rider_web_links_select"
  ON rider_web_links FOR SELECT
  USING (
    pack_id IN (
      SELECT id FROM rider_packs WHERE workspace_id = public.get_my_workspace_id()
    )
  );

CREATE POLICY "rider_web_links_insert"
  ON rider_web_links FOR INSERT
  WITH CHECK (
    pack_id IN (
      SELECT id FROM rider_packs WHERE workspace_id = public.get_my_workspace_id()
    )
  );

CREATE POLICY "rider_web_links_update"
  ON rider_web_links FOR UPDATE
  USING (
    pack_id IN (
      SELECT id FROM rider_packs WHERE workspace_id = public.get_my_workspace_id()
    )
  );

-- No DELETE policy. Rotation sets revoked_at rather than deleting rows
-- (audit trail of who got which URL).

-- ============================================
-- updated_at triggers
-- ============================================

CREATE OR REPLACE FUNCTION rider_packs_set_updated_at()
RETURNS TRIGGER AS $$
BEGIN NEW.updated_at := now(); RETURN NEW; END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS rider_packs_updated_at ON rider_packs;
CREATE TRIGGER rider_packs_updated_at
  BEFORE UPDATE ON rider_packs
  FOR EACH ROW EXECUTE FUNCTION rider_packs_set_updated_at();

CREATE OR REPLACE FUNCTION rider_sections_set_updated_at()
RETURNS TRIGGER AS $$
BEGIN NEW.updated_at := now(); RETURN NEW; END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS rider_sections_updated_at ON rider_sections;
CREATE TRIGGER rider_sections_updated_at
  BEFORE UPDATE ON rider_sections
  FOR EACH ROW EXECUTE FUNCTION rider_sections_set_updated_at();

CREATE OR REPLACE FUNCTION rider_assets_set_updated_at()
RETURNS TRIGGER AS $$
BEGIN NEW.updated_at := now(); RETURN NEW; END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS rider_assets_updated_at ON rider_assets;
CREATE TRIGGER rider_assets_updated_at
  BEFORE UPDATE ON rider_assets
  FOR EACH ROW EXECUTE FUNCTION rider_assets_set_updated_at();

-- ============================================
-- Storage bucket: rider-assets (private)
-- ============================================

INSERT INTO storage.buckets (id, name, public)
VALUES ('rider-assets', 'rider-assets', false)
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "rider_assets_storage_select"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'rider-assets' AND auth.uid() IS NOT NULL);

CREATE POLICY "rider_assets_storage_insert"
  ON storage.objects FOR INSERT
  WITH CHECK (bucket_id = 'rider-assets' AND auth.uid() IS NOT NULL);

CREATE POLICY "rider_assets_storage_update"
  ON storage.objects FOR UPDATE
  USING (bucket_id = 'rider-assets' AND auth.uid() IS NOT NULL);

CREATE POLICY "rider_assets_storage_delete"
  ON storage.objects FOR DELETE
  USING (bucket_id = 'rider-assets' AND auth.uid() IS NOT NULL);

-- ============================================
-- Optional pg_cron schedule for history retention
--
-- Uncomment if pg_cron is enabled on this Supabase project:
--
--   SELECT cron.schedule(
--     'rider_pack_history_nightly_cleanup',
--     '15 3 * * *',
--     $$ SELECT public.rider_pack_history_cleanup(); $$
--   );
--
-- Alternative: call rider_pack_history_cleanup() from a Next.js cron
-- route or a Supabase edge function on a schedule.
-- ============================================
```

---

## Step 2 — Acceptance

Run these greps against the file you just wrote. Paste the full output in your report.

```bash
# A. File exists and is the only new migration
ls database/migrations/034_*
git status --short database/

# B. All six tables present
grep -n "CREATE TABLE IF NOT EXISTS rider_" database/migrations/034_rider_pack_system.sql

# C. is_workspace_admin helper present
grep -n "is_workspace_admin" database/migrations/034_rider_pack_system.sql

# D. RLS enabled on all six tables
grep -n "ENABLE ROW LEVEL SECURITY" database/migrations/034_rider_pack_system.sql

# E. Policies count sanity check — expect ≥ 20 policies
grep -c "CREATE POLICY" database/migrations/034_rider_pack_system.sql

# F. updated_at triggers for packs/sections/assets
grep -n "CREATE TRIGGER" database/migrations/034_rider_pack_system.sql

# G. Storage bucket
grep -n "'rider-assets'" database/migrations/034_rider_pack_system.sql

# H. Retention function + optional cron block
grep -n "rider_pack_history_cleanup\|pg_cron" database/migrations/034_rider_pack_system.sql
```

### Expected

- A: one file listed; `git status` shows only the new 034 file.
- B: exactly 6 lines: `rider_packs`, `rider_sections`, `rider_assets`, `rider_pack_exports`, `rider_pack_history`, `rider_web_links`.
- C: at least 2 lines (function definition + usage in policies).
- D: 6 lines.
- E: integer ≥ 20.
- F: 3 CREATE TRIGGER lines.
- G: at least 2 lines (bucket insert + policies).
- H: function body + commented cron block.

If any expectation fails, stop and report — do not try to "fix" the file by editing it; explain what's wrong and wait.

---

## Step 3 — Apply to local Supabase (if local dev is running)

**Skip this step if you don't have a local Supabase running.** Adam will apply to local/remote manually.

If local Supabase is up:

```bash
# Find the local psql connection string from supabase/config.toml or env
# Then apply the migration
psql "$LOCAL_DB_URL" -f database/migrations/034_rider_pack_system.sql

# Confirm tables created
psql "$LOCAL_DB_URL" -c "\dt rider_*"

# Confirm RLS enabled
psql "$LOCAL_DB_URL" -c "SELECT tablename, rowsecurity FROM pg_tables WHERE tablename LIKE 'rider_%';"

# Confirm policies
psql "$LOCAL_DB_URL" -c "SELECT tablename, policyname FROM pg_policies WHERE tablename LIKE 'rider_%' ORDER BY tablename, policyname;"
```

If any of those fail, report the full error and stop. Do not try to fix by editing the migration — report first.

---

## Step 4 — Commit + push

Only if Step 2 acceptance passed cleanly.

```bash
git status --short
# Expect exactly: ?? database/migrations/034_rider_pack_system.sql
# If anything else shows up, STOP. Revert anything unrelated. Report.

git add database/migrations/034_rider_pack_system.sql
git commit -m "feat(rider-pack): add migration 034 (schema + RLS)

First PR for the Rider/Pack Builder (see RIDER_PACK_DESIGN.md).

Tables:
- rider_packs (artist/tour/show scope with CHECK constraint)
- rider_sections (sparse — exists only when overridden at that scope)
- rider_assets (scope-aware, storage + URL + file types)
- rider_pack_exports (immutable export audit)
- rider_pack_history (immutable, 90-day retention)
- rider_web_links (tokenised public access, per-URL password, rotation
  via revoked_at rather than DELETE)

Plus:
- is_workspace_admin() helper (mirrors get_my_workspace_id pattern)
- rider-assets private storage bucket
- rider_pack_history_cleanup() function + commented pg_cron schedule

RLS:
- Workspace-scoped across the board.
- Artist-scope writes gated on is_workspace_admin().
- Tour/show scope writes open to any workspace member.
- Exports and history are INSERT-only (no UPDATE/DELETE policies).

No API, no UI. R2 (API layer) is the next PR."
git push
```

---

## Step 5 — Report

Paste in your reply:

1. Step 0 grep output (A–D).
2. Step 2 acceptance output (A–H).
3. Step 3 output (if you ran it) or "skipped — no local Supabase".
4. `git status --short` before commit.
5. Final commit SHA.
6. Anything you stopped on (ideally nothing).

---

## Out of scope for this PR

- Any `.ts` / `.tsx` file.
- API routes under `src/app/api/rider/**` (that's R2).
- Editor UI (that's R3).
- Public web link render (that's R4).
- Google Doc export integration (that's R5).
- Seeding default sections (happens in R2 when a new pack is created).
- Touching existing migrations.
- Running migrations against prod/remote.
