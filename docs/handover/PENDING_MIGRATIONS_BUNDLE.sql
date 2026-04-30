-- ============================================
-- LOWPASS — Pending migrations bundle
-- Apply this entire file in Supabase SQL Editor
-- All idempotent: safe to re-run if some pieces already applied
-- 
-- Order (dependency-respecting):
--   056 — set_updated_at function (required by canonical entity triggers)
--   035 — rental_jobs billing columns
--   057 — gear ↔ rental_inventory FK
--   060 — roles infrastructure backfill
--   061 — RLS audit (huge — every workspace-scoped table)
--   062 — initial site admin promotions (adam@ + ben@)
--   063 — budget-receipts storage bucket + RLS
-- ============================================

-- ════════════════════════════════════════════
-- 056: set_updated_at function
-- ════════════════════════════════════════════
-- ============================================
-- LOWPASS — Shared set_updated_at trigger function
-- Migration 056
-- ============================================
--
-- Migrations 049 (flight), 050 (person), 051 (room), 052 (gear), 053 (deal-memos),
-- 055 (expenses) all reference public.set_updated_at() as the BEFORE UPDATE trigger
-- function for their canonical entity tables. The function was never defined — the
-- pre-UX-overhaul convention was per-table functions (bug_reports_set_updated_at,
-- rider_packs_set_updated_at, channel_list_rows_set_updated_at, etc).
--
-- Defining it here as the canonical shared function so the UX-era migrations can
-- run cleanly. Idempotent (CREATE OR REPLACE) so safe to re-apply.
--
-- Going forward, new migrations should use this function rather than create
-- per-table copies. The per-table functions in earlier migrations stay as-is
-- (don't break existing triggers).

CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

-- Permissions: callable by row triggers in any schema (RLS-bypass via SECURITY DEFINER
-- not required — this is a pure data shaping function with no privileged access).

-- ════════════════════════════════════════════
-- 035: rental_jobs billing details
-- ════════════════════════════════════════════
-- ============================================================
-- Migration: rental_jobs billing details (optional)
-- Adds optional billing fields used by the branded PDF export.
-- All fields nullable; export falls back to client_name only when
-- billing fields are blank.
-- ============================================================

ALTER TABLE rental_jobs
  ADD COLUMN IF NOT EXISTS billing_address TEXT,
  ADD COLUMN IF NOT EXISTS billing_email   TEXT,
  ADD COLUMN IF NOT EXISTS billing_phone   TEXT,
  ADD COLUMN IF NOT EXISTS billing_tax_id  TEXT;

COMMENT ON COLUMN rental_jobs.billing_address IS 'Optional multi-line billing address for the rental quote/invoice export.';
COMMENT ON COLUMN rental_jobs.billing_email   IS 'Optional billing contact email.';
COMMENT ON COLUMN rental_jobs.billing_phone   IS 'Optional billing contact phone.';
COMMENT ON COLUMN rental_jobs.billing_tax_id  IS 'Optional VAT / EIN / tax-ID for invoicing.';

-- ════════════════════════════════════════════
-- 057: gear ↔ rental_inventory FK
-- ════════════════════════════════════════════
-- ============================================
-- LOWPASS — Rental inventory ↔ Gear canonical bridge
-- Migration 057
--
-- Adds the bridge between the standalone Rental Business module
-- (rental_inventory + rental_jobs + rental_job_items + branded PDF export)
-- and the canonical Gear entity introduced in UX12. **Both tables stay
-- intact.** This is a linking exercise — no schema collapses.
--
-- Per UX21:
--   - rental_jobs.tour_id was added in earlier rental setup (visible in
--     src/components/equipment/types.ts), so this migration only adds the
--     gear → rental_inventory FK and its index.
--   - No automatic backfill — operators link items by hand via the new UI
--     in src/components/entity/gear/GearSlideOver.tsx and the Inventory
--     tab "Add to tour" affordance.
-- ============================================

-- Link a canonical Gear record to its underlying rental_inventory row, if any.
ALTER TABLE public.gear
  ADD COLUMN IF NOT EXISTS rental_inventory_id uuid
    REFERENCES public.rental_inventory(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS gear_rental_inventory_id_idx
  ON public.gear(rental_inventory_id);

-- Defensive: ensure rental_jobs.tour_id exists. Older rental setups may not
-- have it. If it's already present this is a no-op.
ALTER TABLE public.rental_jobs
  ADD COLUMN IF NOT EXISTS tour_id uuid
    REFERENCES public.tours(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS rental_jobs_tour_id_idx
  ON public.rental_jobs(tour_id);

-- ============================================
-- Down migration (commented out; use as reference if rolling back)
-- ============================================
-- DROP INDEX IF EXISTS public.rental_jobs_tour_id_idx;
-- DROP INDEX IF EXISTS public.gear_rental_inventory_id_idx;
-- ALTER TABLE public.gear DROP COLUMN IF EXISTS rental_inventory_id;
-- -- Do NOT drop rental_jobs.tour_id; it predates this migration in many
-- -- environments and dropping it would break the rental UI.

-- ════════════════════════════════════════════
-- 060: roles infrastructure backfill
-- ════════════════════════════════════════════
-- ============================================
-- LOWPASS — Roles infrastructure backfill
-- Migration 060
--
-- 001_initial_schema.sql created the roles table and profiles.role_id
-- but never reliably populated either across the user base. The
-- auto-provisioning trigger from 002 creates a "Tour Manager" role
-- with is_god=TRUE for new signups, but accounts created before that
-- trigger existed (or where the trigger ran but the role assignment
-- got cleared) end up with role_id IS NULL — and is_workspace_admin()
-- returns FALSE for them, silently locking them out of admin-gated
-- operations across the app.
--
-- This migration ensures the roles infrastructure is end-to-end:
--   1. Every workspace has Admin (is_god=TRUE) + Member roles.
--   2. Every profile with NULL role_id is backfilled to its workspace's
--      Admin role (Adam's call: default-unblock everyone, demote test
--      users via the new /settings/team UI).
--   3. RLS on the roles table — workspace members SELECT, only admins
--      can write.
--   4. profiles UPDATE policy extended so admins can change other
--      members' role_id within their workspace (powers the Team UI).
--
-- This migration was applied via direct SQL on 2026-04-29. Recording
-- it as a tracked file so codebase and live database stop drifting.
-- See docs/handover/CC_ROLES_WIRING.md for the original prompt.
-- ============================================

-- 1. Ensure Admin + Member roles exist per workspace
INSERT INTO public.roles (workspace_id, name, is_god, permissions)
SELECT w.id, 'Admin', TRUE, '{}'::jsonb
FROM public.workspaces w
WHERE NOT EXISTS (
  SELECT 1 FROM public.roles r
  WHERE r.workspace_id = w.id AND r.is_god = TRUE
);

INSERT INTO public.roles (workspace_id, name, is_god, permissions)
SELECT w.id, 'Member', FALSE, '{}'::jsonb
FROM public.workspaces w
WHERE NOT EXISTS (
  SELECT 1 FROM public.roles r
  WHERE r.workspace_id = w.id AND r.is_god = FALSE AND r.name = 'Member'
);

-- 2. Backfill: every NULL-role profile gets their workspace's earliest
--    is_god=TRUE role (typically Tour Manager from 002, or Admin from
--    step 1).
UPDATE public.profiles p
SET role_id = (
  SELECT r.id
  FROM public.roles r
  WHERE r.workspace_id = p.workspace_id AND r.is_god = TRUE
  ORDER BY r.created_at ASC
  LIMIT 1
)
WHERE p.role_id IS NULL AND p.workspace_id IS NOT NULL;

-- 3. RLS on the roles table
ALTER TABLE public.roles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "roles_select" ON public.roles;
CREATE POLICY "roles_select"
  ON public.roles FOR SELECT
  USING (workspace_id = public.get_my_workspace_id());

DROP POLICY IF EXISTS "roles_admin_write" ON public.roles;
CREATE POLICY "roles_admin_write"
  ON public.roles FOR ALL
  USING (workspace_id = public.get_my_workspace_id() AND public.is_workspace_admin())
  WITH CHECK (workspace_id = public.get_my_workspace_id() AND public.is_workspace_admin());

-- 4. Extend profiles UPDATE so admins can change other members' role_id
DROP POLICY IF EXISTS "profiles_admin_update" ON public.profiles;
CREATE POLICY "profiles_admin_update"
  ON public.profiles FOR UPDATE
  USING (workspace_id = public.get_my_workspace_id() AND public.is_workspace_admin())
  WITH CHECK (workspace_id = public.get_my_workspace_id() AND public.is_workspace_admin());

-- Down (commented; uncomment to roll back manually):
-- DROP POLICY IF EXISTS "profiles_admin_update" ON public.profiles;
-- DROP POLICY IF EXISTS "roles_admin_write" ON public.roles;
-- DROP POLICY IF EXISTS "roles_select" ON public.roles;
-- (Don't NULL out role_ids on rollback — keep the assignment.)

-- ════════════════════════════════════════════
-- 061: RLS audit (large)
-- ════════════════════════════════════════════
-- ============================================
-- LOWPASS — RLS audit migration
-- Migration 061
--
-- Brings every workspace-scoped table in `public` to the canonical
-- 4-policy shape. Closes the recurring "missing SELECT after
-- .insert(...).select()" / "DELETE silently affects 0 rows" class
-- of bug that's hit advance_templates (059), rider_folders (058 +
-- post-058 patches), rider_packs, rider_sections, rider_assets
-- across the last week.
--
-- Canonical rules (per CC_RLS_AUDIT_MIGRATION.md §1.7):
--
--   • SELECT / INSERT / UPDATE — workspace-membership only.
--     No is_workspace_admin() checks on these ops on any table.
--   • DELETE — workspace-membership only, EXCEPT on the six
--     canonical entity tables (flights, persons, rooms, gear,
--     deal_memos, expenses) which retain an admin gate, and on
--     the `roles` table itself (handled by 060).
--   • profiles.is_site_admin (036) is OUT OF SCOPE.
--   • bug_reports (site-admin gated), notifications (user-scoped),
--     and storage.objects bucket policies are OUT OF SCOPE.
--
-- Idempotent: every CREATE POLICY is preceded by DROP POLICY IF
-- EXISTS. Running this migration twice produces the same
-- end-state.
--
-- Pre/post smoke checks live in
-- docs/handover/RLS_AUDIT_DISCOVERY_2026_04_29.md.
-- ============================================

-- ============================================
-- §1. Direct workspace-scoped tables
--     (workspace_id column directly on the table)
-- ============================================

-- §1.1 artists — workspace-scoped
ALTER TABLE public.artists ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Users can view workspace artists" ON public.artists;
DROP POLICY IF EXISTS "Users can create workspace artists" ON public.artists;
DROP POLICY IF EXISTS "Users can update workspace artists" ON public.artists;
DROP POLICY IF EXISTS "Users can delete workspace artists" ON public.artists;
DROP POLICY IF EXISTS "artists_select" ON public.artists;
DROP POLICY IF EXISTS "artists_insert" ON public.artists;
DROP POLICY IF EXISTS "artists_update" ON public.artists;
DROP POLICY IF EXISTS "artists_delete" ON public.artists;
CREATE POLICY "artists_select" ON public.artists FOR SELECT
  USING (workspace_id = public.get_my_workspace_id());
CREATE POLICY "artists_insert" ON public.artists FOR INSERT
  WITH CHECK (workspace_id = public.get_my_workspace_id());
CREATE POLICY "artists_update" ON public.artists FOR UPDATE
  USING (workspace_id = public.get_my_workspace_id())
  WITH CHECK (workspace_id = public.get_my_workspace_id());
CREATE POLICY "artists_delete" ON public.artists FOR DELETE
  USING (workspace_id = public.get_my_workspace_id());

-- §1.2 tours — workspace-scoped
ALTER TABLE public.tours ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Users can view workspace tours" ON public.tours;
DROP POLICY IF EXISTS "Users can create workspace tours" ON public.tours;
DROP POLICY IF EXISTS "Users can update workspace tours" ON public.tours;
DROP POLICY IF EXISTS "Users can delete workspace tours" ON public.tours;
DROP POLICY IF EXISTS "tours_select" ON public.tours;
DROP POLICY IF EXISTS "tours_insert" ON public.tours;
DROP POLICY IF EXISTS "tours_update" ON public.tours;
DROP POLICY IF EXISTS "tours_delete" ON public.tours;
CREATE POLICY "tours_select" ON public.tours FOR SELECT
  USING (workspace_id = public.get_my_workspace_id());
CREATE POLICY "tours_insert" ON public.tours FOR INSERT
  WITH CHECK (workspace_id = public.get_my_workspace_id());
CREATE POLICY "tours_update" ON public.tours FOR UPDATE
  USING (workspace_id = public.get_my_workspace_id())
  WITH CHECK (workspace_id = public.get_my_workspace_id());
CREATE POLICY "tours_delete" ON public.tours FOR DELETE
  USING (workspace_id = public.get_my_workspace_id());

-- §1.3 venues — workspace-scoped
ALTER TABLE public.venues ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Users can view workspace venues" ON public.venues;
DROP POLICY IF EXISTS "Users can create workspace venues" ON public.venues;
DROP POLICY IF EXISTS "Users can update workspace venues" ON public.venues;
DROP POLICY IF EXISTS "Users can delete workspace venues" ON public.venues;
DROP POLICY IF EXISTS "venues_select" ON public.venues;
DROP POLICY IF EXISTS "venues_insert" ON public.venues;
DROP POLICY IF EXISTS "venues_update" ON public.venues;
DROP POLICY IF EXISTS "venues_delete" ON public.venues;
CREATE POLICY "venues_select" ON public.venues FOR SELECT
  USING (workspace_id = public.get_my_workspace_id());
CREATE POLICY "venues_insert" ON public.venues FOR INSERT
  WITH CHECK (workspace_id = public.get_my_workspace_id());
CREATE POLICY "venues_update" ON public.venues FOR UPDATE
  USING (workspace_id = public.get_my_workspace_id())
  WITH CHECK (workspace_id = public.get_my_workspace_id());
CREATE POLICY "venues_delete" ON public.venues FOR DELETE
  USING (workspace_id = public.get_my_workspace_id());

-- §1.4 personnel — workspace-scoped
ALTER TABLE public.personnel ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Users can view workspace personnel" ON public.personnel;
DROP POLICY IF EXISTS "Users can create workspace personnel" ON public.personnel;
DROP POLICY IF EXISTS "Users can update workspace personnel" ON public.personnel;
DROP POLICY IF EXISTS "Users can delete workspace personnel" ON public.personnel;
DROP POLICY IF EXISTS "personnel_select" ON public.personnel;
DROP POLICY IF EXISTS "personnel_insert" ON public.personnel;
DROP POLICY IF EXISTS "personnel_update" ON public.personnel;
DROP POLICY IF EXISTS "personnel_delete" ON public.personnel;
CREATE POLICY "personnel_select" ON public.personnel FOR SELECT
  USING (workspace_id = public.get_my_workspace_id());
CREATE POLICY "personnel_insert" ON public.personnel FOR INSERT
  WITH CHECK (workspace_id = public.get_my_workspace_id());
CREATE POLICY "personnel_update" ON public.personnel FOR UPDATE
  USING (workspace_id = public.get_my_workspace_id())
  WITH CHECK (workspace_id = public.get_my_workspace_id());
CREATE POLICY "personnel_delete" ON public.personnel FOR DELETE
  USING (workspace_id = public.get_my_workspace_id());

-- §1.5 contacts — workspace-scoped
ALTER TABLE public.contacts ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "contacts_select" ON public.contacts;
DROP POLICY IF EXISTS "contacts_insert" ON public.contacts;
DROP POLICY IF EXISTS "contacts_update" ON public.contacts;
DROP POLICY IF EXISTS "contacts_delete" ON public.contacts;
CREATE POLICY "contacts_select" ON public.contacts FOR SELECT
  USING (workspace_id = public.get_my_workspace_id());
CREATE POLICY "contacts_insert" ON public.contacts FOR INSERT
  WITH CHECK (workspace_id = public.get_my_workspace_id());
CREATE POLICY "contacts_update" ON public.contacts FOR UPDATE
  USING (workspace_id = public.get_my_workspace_id())
  WITH CHECK (workspace_id = public.get_my_workspace_id());
CREATE POLICY "contacts_delete" ON public.contacts FOR DELETE
  USING (workspace_id = public.get_my_workspace_id());

-- §1.6 advance_templates — workspace-scoped + platform-NULL visibility
--   Platform templates have workspace_id IS NULL and must remain visible to all
--   authenticated users (preserves the pattern from migration 011). Writes stay
--   workspace-only — platform rows aren't owned by anyone, so writes fail naturally.
ALTER TABLE public.advance_templates ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Anyone can view platform templates" ON public.advance_templates;
DROP POLICY IF EXISTS "at_select" ON public.advance_templates;
DROP POLICY IF EXISTS "at_insert" ON public.advance_templates;
DROP POLICY IF EXISTS "at_update" ON public.advance_templates;
DROP POLICY IF EXISTS "at_delete" ON public.advance_templates;
DROP POLICY IF EXISTS "advance_templates_select" ON public.advance_templates;
DROP POLICY IF EXISTS "advance_templates_insert" ON public.advance_templates;
DROP POLICY IF EXISTS "advance_templates_update" ON public.advance_templates;
DROP POLICY IF EXISTS "advance_templates_delete" ON public.advance_templates;
CREATE POLICY "advance_templates_select" ON public.advance_templates FOR SELECT
  USING (workspace_id IS NULL OR workspace_id = public.get_my_workspace_id());
CREATE POLICY "advance_templates_insert" ON public.advance_templates FOR INSERT
  WITH CHECK (workspace_id IS NOT NULL AND workspace_id = public.get_my_workspace_id());
CREATE POLICY "advance_templates_update" ON public.advance_templates FOR UPDATE
  USING (workspace_id IS NOT NULL AND workspace_id = public.get_my_workspace_id())
  WITH CHECK (workspace_id IS NOT NULL AND workspace_id = public.get_my_workspace_id());
CREATE POLICY "advance_templates_delete" ON public.advance_templates FOR DELETE
  USING (workspace_id IS NOT NULL AND workspace_id = public.get_my_workspace_id());

-- §1.7 advance_layout_templates — workspace-scoped (from 019)
ALTER TABLE public.advance_layout_templates ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "advance_layout_templates_select" ON public.advance_layout_templates;
DROP POLICY IF EXISTS "advance_layout_templates_insert" ON public.advance_layout_templates;
DROP POLICY IF EXISTS "advance_layout_templates_update" ON public.advance_layout_templates;
DROP POLICY IF EXISTS "advance_layout_templates_delete" ON public.advance_layout_templates;
CREATE POLICY "advance_layout_templates_select" ON public.advance_layout_templates FOR SELECT
  USING (workspace_id = public.get_my_workspace_id());
CREATE POLICY "advance_layout_templates_insert" ON public.advance_layout_templates FOR INSERT
  WITH CHECK (workspace_id = public.get_my_workspace_id());
CREATE POLICY "advance_layout_templates_update" ON public.advance_layout_templates FOR UPDATE
  USING (workspace_id = public.get_my_workspace_id())
  WITH CHECK (workspace_id = public.get_my_workspace_id());
CREATE POLICY "advance_layout_templates_delete" ON public.advance_layout_templates FOR DELETE
  USING (workspace_id = public.get_my_workspace_id());

-- §1.8 advance_dropdown_options — workspace-scoped (from 020)
ALTER TABLE public.advance_dropdown_options ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "advance_dropdown_options_select" ON public.advance_dropdown_options;
DROP POLICY IF EXISTS "advance_dropdown_options_insert" ON public.advance_dropdown_options;
DROP POLICY IF EXISTS "advance_dropdown_options_update" ON public.advance_dropdown_options;
DROP POLICY IF EXISTS "advance_dropdown_options_delete" ON public.advance_dropdown_options;
CREATE POLICY "advance_dropdown_options_select" ON public.advance_dropdown_options FOR SELECT
  USING (workspace_id = public.get_my_workspace_id());
CREATE POLICY "advance_dropdown_options_insert" ON public.advance_dropdown_options FOR INSERT
  WITH CHECK (workspace_id = public.get_my_workspace_id());
CREATE POLICY "advance_dropdown_options_update" ON public.advance_dropdown_options FOR UPDATE
  USING (workspace_id = public.get_my_workspace_id())
  WITH CHECK (workspace_id = public.get_my_workspace_id());
CREATE POLICY "advance_dropdown_options_delete" ON public.advance_dropdown_options FOR DELETE
  USING (workspace_id = public.get_my_workspace_id());

-- §1.9 advance_schedule_templates — workspace-scoped (from 021)
ALTER TABLE public.advance_schedule_templates ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "advance_schedule_templates_select" ON public.advance_schedule_templates;
DROP POLICY IF EXISTS "advance_schedule_templates_insert" ON public.advance_schedule_templates;
DROP POLICY IF EXISTS "advance_schedule_templates_update" ON public.advance_schedule_templates;
DROP POLICY IF EXISTS "advance_schedule_templates_delete" ON public.advance_schedule_templates;
CREATE POLICY "advance_schedule_templates_select" ON public.advance_schedule_templates FOR SELECT
  USING (workspace_id = public.get_my_workspace_id());
CREATE POLICY "advance_schedule_templates_insert" ON public.advance_schedule_templates FOR INSERT
  WITH CHECK (workspace_id = public.get_my_workspace_id());
CREATE POLICY "advance_schedule_templates_update" ON public.advance_schedule_templates FOR UPDATE
  USING (workspace_id = public.get_my_workspace_id())
  WITH CHECK (workspace_id = public.get_my_workspace_id());
CREATE POLICY "advance_schedule_templates_delete" ON public.advance_schedule_templates FOR DELETE
  USING (workspace_id = public.get_my_workspace_id());

-- §1.10 rider_packs — workspace-scoped, drops the artist-scope admin gate from 034
ALTER TABLE public.rider_packs ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "rider_packs_select" ON public.rider_packs;
DROP POLICY IF EXISTS "rider_packs_insert" ON public.rider_packs;
DROP POLICY IF EXISTS "rider_packs_update" ON public.rider_packs;
DROP POLICY IF EXISTS "rider_packs_delete" ON public.rider_packs;
CREATE POLICY "rider_packs_select" ON public.rider_packs FOR SELECT
  USING (workspace_id = public.get_my_workspace_id());
CREATE POLICY "rider_packs_insert" ON public.rider_packs FOR INSERT
  WITH CHECK (workspace_id = public.get_my_workspace_id());
CREATE POLICY "rider_packs_update" ON public.rider_packs FOR UPDATE
  USING (workspace_id = public.get_my_workspace_id())
  WITH CHECK (workspace_id = public.get_my_workspace_id());
CREATE POLICY "rider_packs_delete" ON public.rider_packs FOR DELETE
  USING (workspace_id = public.get_my_workspace_id());

-- §1.11 rider_folders — workspace-scoped, drops the DELETE admin gate that 058 left in place
ALTER TABLE public.rider_folders ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "rider_folders_select" ON public.rider_folders;
DROP POLICY IF EXISTS "rider_folders_insert" ON public.rider_folders;
DROP POLICY IF EXISTS "rider_folders_update" ON public.rider_folders;
DROP POLICY IF EXISTS "rider_folders_delete" ON public.rider_folders;
CREATE POLICY "rider_folders_select" ON public.rider_folders FOR SELECT
  USING (workspace_id = public.get_my_workspace_id());
CREATE POLICY "rider_folders_insert" ON public.rider_folders FOR INSERT
  WITH CHECK (workspace_id = public.get_my_workspace_id());
CREATE POLICY "rider_folders_update" ON public.rider_folders FOR UPDATE
  USING (workspace_id = public.get_my_workspace_id())
  WITH CHECK (workspace_id = public.get_my_workspace_id());
CREATE POLICY "rider_folders_delete" ON public.rider_folders FOR DELETE
  USING (workspace_id = public.get_my_workspace_id());

-- §1.12 rider_assets — workspace-scoped, drops the artist-scope admin gates from 034
ALTER TABLE public.rider_assets ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "rider_assets_select" ON public.rider_assets;
DROP POLICY IF EXISTS "rider_assets_insert" ON public.rider_assets;
DROP POLICY IF EXISTS "rider_assets_update" ON public.rider_assets;
DROP POLICY IF EXISTS "rider_assets_delete" ON public.rider_assets;
CREATE POLICY "rider_assets_select" ON public.rider_assets FOR SELECT
  USING (workspace_id = public.get_my_workspace_id());
CREATE POLICY "rider_assets_insert" ON public.rider_assets FOR INSERT
  WITH CHECK (workspace_id = public.get_my_workspace_id());
CREATE POLICY "rider_assets_update" ON public.rider_assets FOR UPDATE
  USING (workspace_id = public.get_my_workspace_id())
  WITH CHECK (workspace_id = public.get_my_workspace_id());
CREATE POLICY "rider_assets_delete" ON public.rider_assets FOR DELETE
  USING (workspace_id = public.get_my_workspace_id());

-- §1.13 mic_library — workspace-scoped + global-NULL visibility (from 040)
--   Global mic seeds have workspace_id IS NULL and remain visible to all
--   authenticated users; writes are workspace-only.
ALTER TABLE public.mic_library ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "mic_library_select" ON public.mic_library;
DROP POLICY IF EXISTS "mic_library_insert" ON public.mic_library;
DROP POLICY IF EXISTS "mic_library_update" ON public.mic_library;
DROP POLICY IF EXISTS "mic_library_delete" ON public.mic_library;
CREATE POLICY "mic_library_select" ON public.mic_library FOR SELECT
  USING (workspace_id IS NULL OR workspace_id = public.get_my_workspace_id());
CREATE POLICY "mic_library_insert" ON public.mic_library FOR INSERT
  WITH CHECK (workspace_id = public.get_my_workspace_id());
CREATE POLICY "mic_library_update" ON public.mic_library FOR UPDATE
  USING (workspace_id = public.get_my_workspace_id())
  WITH CHECK (workspace_id = public.get_my_workspace_id());
CREATE POLICY "mic_library_delete" ON public.mic_library FOR DELETE
  USING (workspace_id = public.get_my_workspace_id());

-- §1.14 budget_line_items — workspace-scoped
ALTER TABLE public.budget_line_items ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "budget_line_items_select" ON public.budget_line_items;
DROP POLICY IF EXISTS "budget_line_items_insert" ON public.budget_line_items;
DROP POLICY IF EXISTS "budget_line_items_update" ON public.budget_line_items;
DROP POLICY IF EXISTS "budget_line_items_delete" ON public.budget_line_items;
CREATE POLICY "budget_line_items_select" ON public.budget_line_items FOR SELECT
  USING (workspace_id = public.get_my_workspace_id());
CREATE POLICY "budget_line_items_insert" ON public.budget_line_items FOR INSERT
  WITH CHECK (workspace_id = public.get_my_workspace_id());
CREATE POLICY "budget_line_items_update" ON public.budget_line_items FOR UPDATE
  USING (workspace_id = public.get_my_workspace_id())
  WITH CHECK (workspace_id = public.get_my_workspace_id());
CREATE POLICY "budget_line_items_delete" ON public.budget_line_items FOR DELETE
  USING (workspace_id = public.get_my_workspace_id());

-- §1.15 budget_line_item_attachments — workspace-scoped
ALTER TABLE public.budget_line_item_attachments ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "budget_line_item_attachments_select" ON public.budget_line_item_attachments;
DROP POLICY IF EXISTS "budget_line_item_attachments_insert" ON public.budget_line_item_attachments;
DROP POLICY IF EXISTS "budget_line_item_attachments_update" ON public.budget_line_item_attachments;
DROP POLICY IF EXISTS "budget_line_item_attachments_delete" ON public.budget_line_item_attachments;
CREATE POLICY "budget_line_item_attachments_select" ON public.budget_line_item_attachments FOR SELECT
  USING (workspace_id = public.get_my_workspace_id());
CREATE POLICY "budget_line_item_attachments_insert" ON public.budget_line_item_attachments FOR INSERT
  WITH CHECK (workspace_id = public.get_my_workspace_id());
CREATE POLICY "budget_line_item_attachments_update" ON public.budget_line_item_attachments FOR UPDATE
  USING (workspace_id = public.get_my_workspace_id())
  WITH CHECK (workspace_id = public.get_my_workspace_id());
CREATE POLICY "budget_line_item_attachments_delete" ON public.budget_line_item_attachments FOR DELETE
  USING (workspace_id = public.get_my_workspace_id());

-- §1.16 budget_line_item_notes — workspace-scoped
ALTER TABLE public.budget_line_item_notes ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "budget_line_item_notes_select" ON public.budget_line_item_notes;
DROP POLICY IF EXISTS "budget_line_item_notes_insert" ON public.budget_line_item_notes;
DROP POLICY IF EXISTS "budget_line_item_notes_update" ON public.budget_line_item_notes;
DROP POLICY IF EXISTS "budget_line_item_notes_delete" ON public.budget_line_item_notes;
CREATE POLICY "budget_line_item_notes_select" ON public.budget_line_item_notes FOR SELECT
  USING (workspace_id = public.get_my_workspace_id());
CREATE POLICY "budget_line_item_notes_insert" ON public.budget_line_item_notes FOR INSERT
  WITH CHECK (workspace_id = public.get_my_workspace_id());
CREATE POLICY "budget_line_item_notes_update" ON public.budget_line_item_notes FOR UPDATE
  USING (workspace_id = public.get_my_workspace_id())
  WITH CHECK (workspace_id = public.get_my_workspace_id());
CREATE POLICY "budget_line_item_notes_delete" ON public.budget_line_item_notes FOR DELETE
  USING (workspace_id = public.get_my_workspace_id());

-- §1.17 budget_settings — workspace-scoped
ALTER TABLE public.budget_settings ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "budget_settings_select" ON public.budget_settings;
DROP POLICY IF EXISTS "budget_settings_insert" ON public.budget_settings;
DROP POLICY IF EXISTS "budget_settings_update" ON public.budget_settings;
DROP POLICY IF EXISTS "budget_settings_delete" ON public.budget_settings;
CREATE POLICY "budget_settings_select" ON public.budget_settings FOR SELECT
  USING (workspace_id = public.get_my_workspace_id());
CREATE POLICY "budget_settings_insert" ON public.budget_settings FOR INSERT
  WITH CHECK (workspace_id = public.get_my_workspace_id());
CREATE POLICY "budget_settings_update" ON public.budget_settings FOR UPDATE
  USING (workspace_id = public.get_my_workspace_id())
  WITH CHECK (workspace_id = public.get_my_workspace_id());
CREATE POLICY "budget_settings_delete" ON public.budget_settings FOR DELETE
  USING (workspace_id = public.get_my_workspace_id());

-- §1.18 budget_commissions — workspace-scoped
ALTER TABLE public.budget_commissions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "budget_commissions_select" ON public.budget_commissions;
DROP POLICY IF EXISTS "budget_commissions_insert" ON public.budget_commissions;
DROP POLICY IF EXISTS "budget_commissions_update" ON public.budget_commissions;
DROP POLICY IF EXISTS "budget_commissions_delete" ON public.budget_commissions;
CREATE POLICY "budget_commissions_select" ON public.budget_commissions FOR SELECT
  USING (workspace_id = public.get_my_workspace_id());
CREATE POLICY "budget_commissions_insert" ON public.budget_commissions FOR INSERT
  WITH CHECK (workspace_id = public.get_my_workspace_id());
CREATE POLICY "budget_commissions_update" ON public.budget_commissions FOR UPDATE
  USING (workspace_id = public.get_my_workspace_id())
  WITH CHECK (workspace_id = public.get_my_workspace_id());
CREATE POLICY "budget_commissions_delete" ON public.budget_commissions FOR DELETE
  USING (workspace_id = public.get_my_workspace_id());

-- §1.19 budget_income — workspace-scoped
ALTER TABLE public.budget_income ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "budget_income_select" ON public.budget_income;
DROP POLICY IF EXISTS "budget_income_insert" ON public.budget_income;
DROP POLICY IF EXISTS "budget_income_update" ON public.budget_income;
DROP POLICY IF EXISTS "budget_income_delete" ON public.budget_income;
CREATE POLICY "budget_income_select" ON public.budget_income FOR SELECT
  USING (workspace_id = public.get_my_workspace_id());
CREATE POLICY "budget_income_insert" ON public.budget_income FOR INSERT
  WITH CHECK (workspace_id = public.get_my_workspace_id());
CREATE POLICY "budget_income_update" ON public.budget_income FOR UPDATE
  USING (workspace_id = public.get_my_workspace_id())
  WITH CHECK (workspace_id = public.get_my_workspace_id());
CREATE POLICY "budget_income_delete" ON public.budget_income FOR DELETE
  USING (workspace_id = public.get_my_workspace_id());

-- §1.20 payroll_entries — workspace-scoped
ALTER TABLE public.payroll_entries ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "payroll_entries_select" ON public.payroll_entries;
DROP POLICY IF EXISTS "payroll_entries_insert" ON public.payroll_entries;
DROP POLICY IF EXISTS "payroll_entries_update" ON public.payroll_entries;
DROP POLICY IF EXISTS "payroll_entries_delete" ON public.payroll_entries;
CREATE POLICY "payroll_entries_select" ON public.payroll_entries FOR SELECT
  USING (workspace_id = public.get_my_workspace_id());
CREATE POLICY "payroll_entries_insert" ON public.payroll_entries FOR INSERT
  WITH CHECK (workspace_id = public.get_my_workspace_id());
CREATE POLICY "payroll_entries_update" ON public.payroll_entries FOR UPDATE
  USING (workspace_id = public.get_my_workspace_id())
  WITH CHECK (workspace_id = public.get_my_workspace_id());
CREATE POLICY "payroll_entries_delete" ON public.payroll_entries FOR DELETE
  USING (workspace_id = public.get_my_workspace_id());

-- §1.21 personnel_rates — workspace-scoped
ALTER TABLE public.personnel_rates ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "personnel_rates_select" ON public.personnel_rates;
DROP POLICY IF EXISTS "personnel_rates_insert" ON public.personnel_rates;
DROP POLICY IF EXISTS "personnel_rates_update" ON public.personnel_rates;
DROP POLICY IF EXISTS "personnel_rates_delete" ON public.personnel_rates;
CREATE POLICY "personnel_rates_select" ON public.personnel_rates FOR SELECT
  USING (workspace_id = public.get_my_workspace_id());
CREATE POLICY "personnel_rates_insert" ON public.personnel_rates FOR INSERT
  WITH CHECK (workspace_id = public.get_my_workspace_id());
CREATE POLICY "personnel_rates_update" ON public.personnel_rates FOR UPDATE
  USING (workspace_id = public.get_my_workspace_id())
  WITH CHECK (workspace_id = public.get_my_workspace_id());
CREATE POLICY "personnel_rates_delete" ON public.personnel_rates FOR DELETE
  USING (workspace_id = public.get_my_workspace_id());

-- §1.22 tour_personnel — workspace-scoped
ALTER TABLE public.tour_personnel ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "tour_personnel_select" ON public.tour_personnel;
DROP POLICY IF EXISTS "tour_personnel_insert" ON public.tour_personnel;
DROP POLICY IF EXISTS "tour_personnel_update" ON public.tour_personnel;
DROP POLICY IF EXISTS "tour_personnel_delete" ON public.tour_personnel;
CREATE POLICY "tour_personnel_select" ON public.tour_personnel FOR SELECT
  USING (workspace_id = public.get_my_workspace_id());
CREATE POLICY "tour_personnel_insert" ON public.tour_personnel FOR INSERT
  WITH CHECK (workspace_id = public.get_my_workspace_id());
CREATE POLICY "tour_personnel_update" ON public.tour_personnel FOR UPDATE
  USING (workspace_id = public.get_my_workspace_id())
  WITH CHECK (workspace_id = public.get_my_workspace_id());
CREATE POLICY "tour_personnel_delete" ON public.tour_personnel FOR DELETE
  USING (workspace_id = public.get_my_workspace_id());

-- §1.23 tour_gear — workspace-scoped (tour-scoped link table; not a destructive op surface)
ALTER TABLE public.tour_gear ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "tour_gear_select" ON public.tour_gear;
DROP POLICY IF EXISTS "tour_gear_insert" ON public.tour_gear;
DROP POLICY IF EXISTS "tour_gear_update" ON public.tour_gear;
DROP POLICY IF EXISTS "tour_gear_delete" ON public.tour_gear;
CREATE POLICY "tour_gear_select" ON public.tour_gear FOR SELECT
  USING (workspace_id = public.get_my_workspace_id());
CREATE POLICY "tour_gear_insert" ON public.tour_gear FOR INSERT
  WITH CHECK (workspace_id = public.get_my_workspace_id());
CREATE POLICY "tour_gear_update" ON public.tour_gear FOR UPDATE
  USING (workspace_id = public.get_my_workspace_id())
  WITH CHECK (workspace_id = public.get_my_workspace_id());
CREATE POLICY "tour_gear_delete" ON public.tour_gear FOR DELETE
  USING (workspace_id = public.get_my_workspace_id());

-- §1.24 hotels — workspace-scoped (canonical hotel storage; rooms is the canonical entity child)
ALTER TABLE public.hotels ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "hotels_select" ON public.hotels;
DROP POLICY IF EXISTS "hotels_insert" ON public.hotels;
DROP POLICY IF EXISTS "hotels_update" ON public.hotels;
DROP POLICY IF EXISTS "hotels_delete" ON public.hotels;
CREATE POLICY "hotels_select" ON public.hotels FOR SELECT
  USING (workspace_id = public.get_my_workspace_id());
CREATE POLICY "hotels_insert" ON public.hotels FOR INSERT
  WITH CHECK (workspace_id = public.get_my_workspace_id());
CREATE POLICY "hotels_update" ON public.hotels FOR UPDATE
  USING (workspace_id = public.get_my_workspace_id())
  WITH CHECK (workspace_id = public.get_my_workspace_id());
CREATE POLICY "hotels_delete" ON public.hotels FOR DELETE
  USING (workspace_id = public.get_my_workspace_id());

-- §1.25 room_assignments — workspace-scoped
ALTER TABLE public.room_assignments ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "room_assignments_select" ON public.room_assignments;
DROP POLICY IF EXISTS "room_assignments_insert" ON public.room_assignments;
DROP POLICY IF EXISTS "room_assignments_update" ON public.room_assignments;
DROP POLICY IF EXISTS "room_assignments_delete" ON public.room_assignments;
CREATE POLICY "room_assignments_select" ON public.room_assignments FOR SELECT
  USING (workspace_id = public.get_my_workspace_id());
CREATE POLICY "room_assignments_insert" ON public.room_assignments FOR INSERT
  WITH CHECK (workspace_id = public.get_my_workspace_id());
CREATE POLICY "room_assignments_update" ON public.room_assignments FOR UPDATE
  USING (workspace_id = public.get_my_workspace_id())
  WITH CHECK (workspace_id = public.get_my_workspace_id());
CREATE POLICY "room_assignments_delete" ON public.room_assignments FOR DELETE
  USING (workspace_id = public.get_my_workspace_id());

-- §1.26 settlement — workspace-scoped
ALTER TABLE public.settlement ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "settlement_select" ON public.settlement;
DROP POLICY IF EXISTS "settlement_insert" ON public.settlement;
DROP POLICY IF EXISTS "settlement_update" ON public.settlement;
DROP POLICY IF EXISTS "settlement_delete" ON public.settlement;
CREATE POLICY "settlement_select" ON public.settlement FOR SELECT
  USING (workspace_id = public.get_my_workspace_id());
CREATE POLICY "settlement_insert" ON public.settlement FOR INSERT
  WITH CHECK (workspace_id = public.get_my_workspace_id());
CREATE POLICY "settlement_update" ON public.settlement FOR UPDATE
  USING (workspace_id = public.get_my_workspace_id())
  WITH CHECK (workspace_id = public.get_my_workspace_id());
CREATE POLICY "settlement_delete" ON public.settlement FOR DELETE
  USING (workspace_id = public.get_my_workspace_id());

-- §1.27 expense_receipts — workspace-scoped
ALTER TABLE public.expense_receipts ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "expense_receipts_select" ON public.expense_receipts;
DROP POLICY IF EXISTS "expense_receipts_insert" ON public.expense_receipts;
DROP POLICY IF EXISTS "expense_receipts_update" ON public.expense_receipts;
DROP POLICY IF EXISTS "expense_receipts_delete" ON public.expense_receipts;
CREATE POLICY "expense_receipts_select" ON public.expense_receipts FOR SELECT
  USING (workspace_id = public.get_my_workspace_id());
CREATE POLICY "expense_receipts_insert" ON public.expense_receipts FOR INSERT
  WITH CHECK (workspace_id = public.get_my_workspace_id());
CREATE POLICY "expense_receipts_update" ON public.expense_receipts FOR UPDATE
  USING (workspace_id = public.get_my_workspace_id())
  WITH CHECK (workspace_id = public.get_my_workspace_id());
CREATE POLICY "expense_receipts_delete" ON public.expense_receipts FOR DELETE
  USING (workspace_id = public.get_my_workspace_id());

-- ============================================
-- §2. Tour-scoped tables (transitive via tour_id)
-- ============================================

-- §2.1 routing — tour-scoped
ALTER TABLE public.routing ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Users can view tour routing" ON public.routing;
DROP POLICY IF EXISTS "Users can create tour routing" ON public.routing;
DROP POLICY IF EXISTS "Users can update tour routing" ON public.routing;
DROP POLICY IF EXISTS "Users can delete tour routing" ON public.routing;
DROP POLICY IF EXISTS "routing_select" ON public.routing;
DROP POLICY IF EXISTS "routing_insert" ON public.routing;
DROP POLICY IF EXISTS "routing_update" ON public.routing;
DROP POLICY IF EXISTS "routing_delete" ON public.routing;
CREATE POLICY "routing_select" ON public.routing FOR SELECT
  USING (tour_id IN (SELECT id FROM public.tours WHERE workspace_id = public.get_my_workspace_id()));
CREATE POLICY "routing_insert" ON public.routing FOR INSERT
  WITH CHECK (tour_id IN (SELECT id FROM public.tours WHERE workspace_id = public.get_my_workspace_id()));
CREATE POLICY "routing_update" ON public.routing FOR UPDATE
  USING (tour_id IN (SELECT id FROM public.tours WHERE workspace_id = public.get_my_workspace_id()))
  WITH CHECK (tour_id IN (SELECT id FROM public.tours WHERE workspace_id = public.get_my_workspace_id()));
CREATE POLICY "routing_delete" ON public.routing FOR DELETE
  USING (tour_id IN (SELECT id FROM public.tours WHERE workspace_id = public.get_my_workspace_id()));

-- §2.2 advance_form_configs — tour-scoped
ALTER TABLE public.advance_form_configs ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Users can view tour advance configs" ON public.advance_form_configs;
DROP POLICY IF EXISTS "Users can create advance configs" ON public.advance_form_configs;
DROP POLICY IF EXISTS "advance_form_configs_select" ON public.advance_form_configs;
DROP POLICY IF EXISTS "advance_form_configs_insert" ON public.advance_form_configs;
DROP POLICY IF EXISTS "advance_form_configs_update" ON public.advance_form_configs;
DROP POLICY IF EXISTS "advance_form_configs_delete" ON public.advance_form_configs;
CREATE POLICY "advance_form_configs_select" ON public.advance_form_configs FOR SELECT
  USING (tour_id IN (SELECT id FROM public.tours WHERE workspace_id = public.get_my_workspace_id()));
CREATE POLICY "advance_form_configs_insert" ON public.advance_form_configs FOR INSERT
  WITH CHECK (tour_id IN (SELECT id FROM public.tours WHERE workspace_id = public.get_my_workspace_id()));
CREATE POLICY "advance_form_configs_update" ON public.advance_form_configs FOR UPDATE
  USING (tour_id IN (SELECT id FROM public.tours WHERE workspace_id = public.get_my_workspace_id()))
  WITH CHECK (tour_id IN (SELECT id FROM public.tours WHERE workspace_id = public.get_my_workspace_id()));
CREATE POLICY "advance_form_configs_delete" ON public.advance_form_configs FOR DELETE
  USING (tour_id IN (SELECT id FROM public.tours WHERE workspace_id = public.get_my_workspace_id()));

-- ============================================
-- §3. Routing-scoped tables (transitive via routing_id → tours)
-- ============================================

-- §3.1 advance_instances — routing-scoped
ALTER TABLE public.advance_instances ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Users can view advance instances" ON public.advance_instances;
DROP POLICY IF EXISTS "Users can update advance instances" ON public.advance_instances;
DROP POLICY IF EXISTS "advance_instances_select" ON public.advance_instances;
DROP POLICY IF EXISTS "advance_instances_insert" ON public.advance_instances;
DROP POLICY IF EXISTS "advance_instances_update" ON public.advance_instances;
DROP POLICY IF EXISTS "advance_instances_delete" ON public.advance_instances;
CREATE POLICY "advance_instances_select" ON public.advance_instances FOR SELECT
  USING (routing_id IN (
    SELECT r.id FROM public.routing r
    JOIN public.tours t ON r.tour_id = t.id
    WHERE t.workspace_id = public.get_my_workspace_id()
  ));
CREATE POLICY "advance_instances_insert" ON public.advance_instances FOR INSERT
  WITH CHECK (routing_id IN (
    SELECT r.id FROM public.routing r
    JOIN public.tours t ON r.tour_id = t.id
    WHERE t.workspace_id = public.get_my_workspace_id()
  ));
CREATE POLICY "advance_instances_update" ON public.advance_instances FOR UPDATE
  USING (routing_id IN (
    SELECT r.id FROM public.routing r
    JOIN public.tours t ON r.tour_id = t.id
    WHERE t.workspace_id = public.get_my_workspace_id()
  ))
  WITH CHECK (routing_id IN (
    SELECT r.id FROM public.routing r
    JOIN public.tours t ON r.tour_id = t.id
    WHERE t.workspace_id = public.get_my_workspace_id()
  ));
CREATE POLICY "advance_instances_delete" ON public.advance_instances FOR DELETE
  USING (routing_id IN (
    SELECT r.id FROM public.routing r
    JOIN public.tours t ON r.tour_id = t.id
    WHERE t.workspace_id = public.get_my_workspace_id()
  ));

-- ============================================
-- §4. Advance-instance-scoped tables
-- ============================================

-- §4.1 advance_comments — instance-scoped
ALTER TABLE public.advance_comments ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Users can view advance comments" ON public.advance_comments;
DROP POLICY IF EXISTS "Users can create advance comments" ON public.advance_comments;
DROP POLICY IF EXISTS "advance_comments_select" ON public.advance_comments;
DROP POLICY IF EXISTS "advance_comments_insert" ON public.advance_comments;
DROP POLICY IF EXISTS "advance_comments_update" ON public.advance_comments;
DROP POLICY IF EXISTS "advance_comments_delete" ON public.advance_comments;
CREATE POLICY "advance_comments_select" ON public.advance_comments FOR SELECT
  USING (advance_instance_id IN (
    SELECT ai.id FROM public.advance_instances ai
    JOIN public.routing r ON ai.routing_id = r.id
    JOIN public.tours t ON r.tour_id = t.id
    WHERE t.workspace_id = public.get_my_workspace_id()
  ));
CREATE POLICY "advance_comments_insert" ON public.advance_comments FOR INSERT
  WITH CHECK (advance_instance_id IN (
    SELECT ai.id FROM public.advance_instances ai
    JOIN public.routing r ON ai.routing_id = r.id
    JOIN public.tours t ON r.tour_id = t.id
    WHERE t.workspace_id = public.get_my_workspace_id()
  ));
CREATE POLICY "advance_comments_update" ON public.advance_comments FOR UPDATE
  USING (advance_instance_id IN (
    SELECT ai.id FROM public.advance_instances ai
    JOIN public.routing r ON ai.routing_id = r.id
    JOIN public.tours t ON r.tour_id = t.id
    WHERE t.workspace_id = public.get_my_workspace_id()
  ));
CREATE POLICY "advance_comments_delete" ON public.advance_comments FOR DELETE
  USING (advance_instance_id IN (
    SELECT ai.id FROM public.advance_instances ai
    JOIN public.routing r ON ai.routing_id = r.id
    JOIN public.tours t ON r.tour_id = t.id
    WHERE t.workspace_id = public.get_my_workspace_id()
  ));

-- ============================================
-- §5. Pack-scoped tables (transitive via pack_id → rider_packs)
-- ============================================

-- §5.1 rider_sections — pack-scoped, drops the artist-scope admin gates from 034
ALTER TABLE public.rider_sections ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "rider_sections_select" ON public.rider_sections;
DROP POLICY IF EXISTS "rider_sections_insert" ON public.rider_sections;
DROP POLICY IF EXISTS "rider_sections_update" ON public.rider_sections;
DROP POLICY IF EXISTS "rider_sections_delete" ON public.rider_sections;
CREATE POLICY "rider_sections_select" ON public.rider_sections FOR SELECT
  USING (pack_id IN (
    SELECT id FROM public.rider_packs WHERE workspace_id = public.get_my_workspace_id()
  ));
CREATE POLICY "rider_sections_insert" ON public.rider_sections FOR INSERT
  WITH CHECK (pack_id IN (
    SELECT id FROM public.rider_packs WHERE workspace_id = public.get_my_workspace_id()
  ));
CREATE POLICY "rider_sections_update" ON public.rider_sections FOR UPDATE
  USING (pack_id IN (
    SELECT id FROM public.rider_packs WHERE workspace_id = public.get_my_workspace_id()
  ))
  WITH CHECK (pack_id IN (
    SELECT id FROM public.rider_packs WHERE workspace_id = public.get_my_workspace_id()
  ));
CREATE POLICY "rider_sections_delete" ON public.rider_sections FOR DELETE
  USING (pack_id IN (
    SELECT id FROM public.rider_packs WHERE workspace_id = public.get_my_workspace_id()
  ));

-- §5.2 rider_pack_exports — pack-scoped, append-only (no UPDATE/DELETE)
ALTER TABLE public.rider_pack_exports ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "rider_pack_exports_select" ON public.rider_pack_exports;
DROP POLICY IF EXISTS "rider_pack_exports_insert" ON public.rider_pack_exports;
CREATE POLICY "rider_pack_exports_select" ON public.rider_pack_exports FOR SELECT
  USING (pack_id IN (
    SELECT id FROM public.rider_packs WHERE workspace_id = public.get_my_workspace_id()
  ));
CREATE POLICY "rider_pack_exports_insert" ON public.rider_pack_exports FOR INSERT
  WITH CHECK (pack_id IN (
    SELECT id FROM public.rider_packs WHERE workspace_id = public.get_my_workspace_id()
  ));
-- No UPDATE/DELETE — exports are an immutable audit trail.

-- §5.3 rider_pack_history — pack-scoped, append-only (retention via cleanup function)
ALTER TABLE public.rider_pack_history ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "rider_pack_history_select" ON public.rider_pack_history;
DROP POLICY IF EXISTS "rider_pack_history_insert" ON public.rider_pack_history;
CREATE POLICY "rider_pack_history_select" ON public.rider_pack_history FOR SELECT
  USING (pack_id IN (
    SELECT id FROM public.rider_packs WHERE workspace_id = public.get_my_workspace_id()
  ));
CREATE POLICY "rider_pack_history_insert" ON public.rider_pack_history FOR INSERT
  WITH CHECK (pack_id IN (
    SELECT id FROM public.rider_packs WHERE workspace_id = public.get_my_workspace_id()
  ));
-- No UPDATE/DELETE — history is immutable; retention via rider_pack_history_cleanup().

-- §5.4 rider_web_links — pack-scoped, no DELETE (rotation via revoked_at)
ALTER TABLE public.rider_web_links ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "rider_web_links_select" ON public.rider_web_links;
DROP POLICY IF EXISTS "rider_web_links_insert" ON public.rider_web_links;
DROP POLICY IF EXISTS "rider_web_links_update" ON public.rider_web_links;
CREATE POLICY "rider_web_links_select" ON public.rider_web_links FOR SELECT
  USING (pack_id IN (
    SELECT id FROM public.rider_packs WHERE workspace_id = public.get_my_workspace_id()
  ));
CREATE POLICY "rider_web_links_insert" ON public.rider_web_links FOR INSERT
  WITH CHECK (pack_id IN (
    SELECT id FROM public.rider_packs WHERE workspace_id = public.get_my_workspace_id()
  ));
CREATE POLICY "rider_web_links_update" ON public.rider_web_links FOR UPDATE
  USING (pack_id IN (
    SELECT id FROM public.rider_packs WHERE workspace_id = public.get_my_workspace_id()
  ))
  WITH CHECK (pack_id IN (
    SELECT id FROM public.rider_packs WHERE workspace_id = public.get_my_workspace_id()
  ));
-- No DELETE — rotation sets revoked_at rather than deleting rows.

-- §5.5 channel_list_rows — pack-scoped, drops the artist-scope admin gates from 040
ALTER TABLE public.channel_list_rows ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "channel_list_rows_select" ON public.channel_list_rows;
DROP POLICY IF EXISTS "channel_list_rows_insert" ON public.channel_list_rows;
DROP POLICY IF EXISTS "channel_list_rows_update" ON public.channel_list_rows;
DROP POLICY IF EXISTS "channel_list_rows_delete" ON public.channel_list_rows;
CREATE POLICY "channel_list_rows_select" ON public.channel_list_rows FOR SELECT
  USING (pack_id IN (
    SELECT id FROM public.rider_packs WHERE workspace_id = public.get_my_workspace_id()
  ));
CREATE POLICY "channel_list_rows_insert" ON public.channel_list_rows FOR INSERT
  WITH CHECK (pack_id IN (
    SELECT id FROM public.rider_packs WHERE workspace_id = public.get_my_workspace_id()
  ));
CREATE POLICY "channel_list_rows_update" ON public.channel_list_rows FOR UPDATE
  USING (pack_id IN (
    SELECT id FROM public.rider_packs WHERE workspace_id = public.get_my_workspace_id()
  ))
  WITH CHECK (pack_id IN (
    SELECT id FROM public.rider_packs WHERE workspace_id = public.get_my_workspace_id()
  ));
CREATE POLICY "channel_list_rows_delete" ON public.channel_list_rows FOR DELETE
  USING (pack_id IN (
    SELECT id FROM public.rider_packs WHERE workspace_id = public.get_my_workspace_id()
  ));

-- §5.6 sub_snakes — pack-scoped, drops admin gates from 040
ALTER TABLE public.sub_snakes ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "sub_snakes_select" ON public.sub_snakes;
DROP POLICY IF EXISTS "sub_snakes_insert" ON public.sub_snakes;
DROP POLICY IF EXISTS "sub_snakes_update" ON public.sub_snakes;
DROP POLICY IF EXISTS "sub_snakes_delete" ON public.sub_snakes;
CREATE POLICY "sub_snakes_select" ON public.sub_snakes FOR SELECT
  USING (pack_id IN (
    SELECT id FROM public.rider_packs WHERE workspace_id = public.get_my_workspace_id()
  ));
CREATE POLICY "sub_snakes_insert" ON public.sub_snakes FOR INSERT
  WITH CHECK (pack_id IN (
    SELECT id FROM public.rider_packs WHERE workspace_id = public.get_my_workspace_id()
  ));
CREATE POLICY "sub_snakes_update" ON public.sub_snakes FOR UPDATE
  USING (pack_id IN (
    SELECT id FROM public.rider_packs WHERE workspace_id = public.get_my_workspace_id()
  ))
  WITH CHECK (pack_id IN (
    SELECT id FROM public.rider_packs WHERE workspace_id = public.get_my_workspace_id()
  ));
CREATE POLICY "sub_snakes_delete" ON public.sub_snakes FOR DELETE
  USING (pack_id IN (
    SELECT id FROM public.rider_packs WHERE workspace_id = public.get_my_workspace_id()
  ));

-- §5.7 stage_boxes — pack-scoped, drops admin gates from 046
ALTER TABLE public.stage_boxes ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "stage_boxes_select" ON public.stage_boxes;
DROP POLICY IF EXISTS "stage_boxes_insert" ON public.stage_boxes;
DROP POLICY IF EXISTS "stage_boxes_update" ON public.stage_boxes;
DROP POLICY IF EXISTS "stage_boxes_delete" ON public.stage_boxes;
CREATE POLICY "stage_boxes_select" ON public.stage_boxes FOR SELECT
  USING (pack_id IN (
    SELECT id FROM public.rider_packs WHERE workspace_id = public.get_my_workspace_id()
  ));
CREATE POLICY "stage_boxes_insert" ON public.stage_boxes FOR INSERT
  WITH CHECK (pack_id IN (
    SELECT id FROM public.rider_packs WHERE workspace_id = public.get_my_workspace_id()
  ));
CREATE POLICY "stage_boxes_update" ON public.stage_boxes FOR UPDATE
  USING (pack_id IN (
    SELECT id FROM public.rider_packs WHERE workspace_id = public.get_my_workspace_id()
  ))
  WITH CHECK (pack_id IN (
    SELECT id FROM public.rider_packs WHERE workspace_id = public.get_my_workspace_id()
  ));
CREATE POLICY "stage_boxes_delete" ON public.stage_boxes FOR DELETE
  USING (pack_id IN (
    SELECT id FROM public.rider_packs WHERE workspace_id = public.get_my_workspace_id()
  ));

-- ============================================
-- §6. Canonical entity tables — DELETE admin gate retained
--     (flights, persons, rooms, gear, deal_memos, expenses)
-- ============================================

-- §6.1 flights — canonical
ALTER TABLE public.flights ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS flights_select ON public.flights;
DROP POLICY IF EXISTS flights_insert ON public.flights;
DROP POLICY IF EXISTS flights_update ON public.flights;
DROP POLICY IF EXISTS flights_delete ON public.flights;
CREATE POLICY flights_select ON public.flights FOR SELECT
  USING (workspace_id = public.get_my_workspace_id());
CREATE POLICY flights_insert ON public.flights FOR INSERT
  WITH CHECK (workspace_id = public.get_my_workspace_id());
CREATE POLICY flights_update ON public.flights FOR UPDATE
  USING (workspace_id = public.get_my_workspace_id())
  WITH CHECK (workspace_id = public.get_my_workspace_id());
CREATE POLICY flights_delete ON public.flights FOR DELETE
  USING (workspace_id = public.get_my_workspace_id() AND public.is_workspace_admin());

-- §6.2 persons — canonical
ALTER TABLE public.persons ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS persons_select ON public.persons;
DROP POLICY IF EXISTS persons_insert ON public.persons;
DROP POLICY IF EXISTS persons_update ON public.persons;
DROP POLICY IF EXISTS persons_delete ON public.persons;
CREATE POLICY persons_select ON public.persons FOR SELECT
  USING (workspace_id = public.get_my_workspace_id());
CREATE POLICY persons_insert ON public.persons FOR INSERT
  WITH CHECK (workspace_id = public.get_my_workspace_id());
CREATE POLICY persons_update ON public.persons FOR UPDATE
  USING (workspace_id = public.get_my_workspace_id())
  WITH CHECK (workspace_id = public.get_my_workspace_id());
CREATE POLICY persons_delete ON public.persons FOR DELETE
  USING (workspace_id = public.get_my_workspace_id() AND public.is_workspace_admin());

-- §6.3 rooms — canonical
ALTER TABLE public.rooms ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS rooms_select ON public.rooms;
DROP POLICY IF EXISTS rooms_insert ON public.rooms;
DROP POLICY IF EXISTS rooms_update ON public.rooms;
DROP POLICY IF EXISTS rooms_delete ON public.rooms;
CREATE POLICY rooms_select ON public.rooms FOR SELECT
  USING (workspace_id = public.get_my_workspace_id());
CREATE POLICY rooms_insert ON public.rooms FOR INSERT
  WITH CHECK (workspace_id = public.get_my_workspace_id());
CREATE POLICY rooms_update ON public.rooms FOR UPDATE
  USING (workspace_id = public.get_my_workspace_id())
  WITH CHECK (workspace_id = public.get_my_workspace_id());
CREATE POLICY rooms_delete ON public.rooms FOR DELETE
  USING (workspace_id = public.get_my_workspace_id() AND public.is_workspace_admin());

-- §6.4 gear — canonical
ALTER TABLE public.gear ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS gear_select ON public.gear;
DROP POLICY IF EXISTS gear_insert ON public.gear;
DROP POLICY IF EXISTS gear_update ON public.gear;
DROP POLICY IF EXISTS gear_delete ON public.gear;
CREATE POLICY gear_select ON public.gear FOR SELECT
  USING (workspace_id = public.get_my_workspace_id());
CREATE POLICY gear_insert ON public.gear FOR INSERT
  WITH CHECK (workspace_id = public.get_my_workspace_id());
CREATE POLICY gear_update ON public.gear FOR UPDATE
  USING (workspace_id = public.get_my_workspace_id())
  WITH CHECK (workspace_id = public.get_my_workspace_id());
CREATE POLICY gear_delete ON public.gear FOR DELETE
  USING (workspace_id = public.get_my_workspace_id() AND public.is_workspace_admin());

-- §6.5 deal_memos — canonical
ALTER TABLE public.deal_memos ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS deal_memos_select ON public.deal_memos;
DROP POLICY IF EXISTS deal_memos_insert ON public.deal_memos;
DROP POLICY IF EXISTS deal_memos_update ON public.deal_memos;
DROP POLICY IF EXISTS deal_memos_delete ON public.deal_memos;
CREATE POLICY deal_memos_select ON public.deal_memos FOR SELECT
  USING (workspace_id = public.get_my_workspace_id());
CREATE POLICY deal_memos_insert ON public.deal_memos FOR INSERT
  WITH CHECK (workspace_id = public.get_my_workspace_id());
CREATE POLICY deal_memos_update ON public.deal_memos FOR UPDATE
  USING (workspace_id = public.get_my_workspace_id())
  WITH CHECK (workspace_id = public.get_my_workspace_id());
CREATE POLICY deal_memos_delete ON public.deal_memos FOR DELETE
  USING (workspace_id = public.get_my_workspace_id() AND public.is_workspace_admin());

-- §6.6 expenses — canonical
ALTER TABLE public.expenses ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS expenses_select ON public.expenses;
DROP POLICY IF EXISTS expenses_insert ON public.expenses;
DROP POLICY IF EXISTS expenses_update ON public.expenses;
DROP POLICY IF EXISTS expenses_delete ON public.expenses;
CREATE POLICY expenses_select ON public.expenses FOR SELECT
  USING (workspace_id = public.get_my_workspace_id());
CREATE POLICY expenses_insert ON public.expenses FOR INSERT
  WITH CHECK (workspace_id = public.get_my_workspace_id());
CREATE POLICY expenses_update ON public.expenses FOR UPDATE
  USING (workspace_id = public.get_my_workspace_id())
  WITH CHECK (workspace_id = public.get_my_workspace_id());
CREATE POLICY expenses_delete ON public.expenses FOR DELETE
  USING (workspace_id = public.get_my_workspace_id() AND public.is_workspace_admin());

-- ============================================
-- §7. Roles + profiles (verify only — main shape established by 060)
-- ============================================

-- §7.1 roles — re-emit the 060 policies idempotently
ALTER TABLE public.roles ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Users can view workspace roles" ON public.roles;
DROP POLICY IF EXISTS "roles_select" ON public.roles;
DROP POLICY IF EXISTS "roles_admin_write" ON public.roles;
CREATE POLICY "roles_select" ON public.roles FOR SELECT
  USING (workspace_id = public.get_my_workspace_id());
CREATE POLICY "roles_admin_write" ON public.roles FOR ALL
  USING (workspace_id = public.get_my_workspace_id() AND public.is_workspace_admin())
  WITH CHECK (workspace_id = public.get_my_workspace_id() AND public.is_workspace_admin());

-- §7.2 profiles — preserve own-profile + admin-update from 004 + 060
--   (Audit re-emits idempotently; doesn't restructure the shape.)
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Users can view own profile" ON public.profiles;
DROP POLICY IF EXISTS "profiles_self_select" ON public.profiles;
DROP POLICY IF EXISTS "profiles_admin_update" ON public.profiles;
CREATE POLICY "profiles_self_select" ON public.profiles FOR SELECT
  USING (id = auth.uid() OR workspace_id = public.get_my_workspace_id());
CREATE POLICY "profiles_admin_update" ON public.profiles FOR UPDATE
  USING (workspace_id = public.get_my_workspace_id() AND public.is_workspace_admin())
  WITH CHECK (workspace_id = public.get_my_workspace_id() AND public.is_workspace_admin());

-- ============================================
-- §9. Missing-from-prior-audit tables
--
-- Smoke against the live database (see RLS_AUDIT_DISCOVERY_2026_04_29.md
-- §3 "Followup notes") surfaced six workspace-scoped tables that were
-- present in production but missed by 061's first pass:
--   file_references (001), flight_bookings, hotel_bookings,
--   hotel_room_assignments, rooming_grid (017), personnel_tour_assignments.
--
-- Each gets the canonical 4-policy shape using its actual workspace-
-- resolution pattern (verified against the originating migration).
--
-- The rental_* triplet (rental_inventory / rental_jobs /
-- rental_job_items) were on the candidate list but turned out to be
-- USER-scoped (user_id, not workspace_id) with workspace siblings
-- seeing each other via a join through workspace_members. Different
-- pattern than this audit handles — explicitly surfaced in the
-- discovery report under "Followup notes" and left for a separate
-- user-scoped RLS audit pass.
-- ============================================

-- §9.1 file_references — direct workspace_id (from 001)
ALTER TABLE public.file_references ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Users can view workspace file_references" ON public.file_references;
DROP POLICY IF EXISTS "Users can create workspace file_references" ON public.file_references;
DROP POLICY IF EXISTS "Users can update workspace file_references" ON public.file_references;
DROP POLICY IF EXISTS "Users can delete workspace file_references" ON public.file_references;
DROP POLICY IF EXISTS "file_references_select" ON public.file_references;
DROP POLICY IF EXISTS "file_references_insert" ON public.file_references;
DROP POLICY IF EXISTS "file_references_update" ON public.file_references;
DROP POLICY IF EXISTS "file_references_delete" ON public.file_references;
CREATE POLICY "file_references_select" ON public.file_references FOR SELECT
  USING (workspace_id = public.get_my_workspace_id());
CREATE POLICY "file_references_insert" ON public.file_references FOR INSERT
  WITH CHECK (workspace_id = public.get_my_workspace_id());
CREATE POLICY "file_references_update" ON public.file_references FOR UPDATE
  USING (workspace_id = public.get_my_workspace_id())
  WITH CHECK (workspace_id = public.get_my_workspace_id());
CREATE POLICY "file_references_delete" ON public.file_references FOR DELETE
  USING (workspace_id = public.get_my_workspace_id());

-- §9.2 flight_bookings — direct workspace_id (from 017; legacy table —
--   canonical entity is `flights` per 049, but flight_bookings remains
--   for unmigrated data and is workspace-scoped)
ALTER TABLE public.flight_bookings ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Users can view tour flights" ON public.flight_bookings;
DROP POLICY IF EXISTS "Users can create tour flights" ON public.flight_bookings;
DROP POLICY IF EXISTS "Users can update tour flights" ON public.flight_bookings;
DROP POLICY IF EXISTS "Users can delete tour flights" ON public.flight_bookings;
DROP POLICY IF EXISTS "flight_bookings_select" ON public.flight_bookings;
DROP POLICY IF EXISTS "flight_bookings_insert" ON public.flight_bookings;
DROP POLICY IF EXISTS "flight_bookings_update" ON public.flight_bookings;
DROP POLICY IF EXISTS "flight_bookings_delete" ON public.flight_bookings;
CREATE POLICY "flight_bookings_select" ON public.flight_bookings FOR SELECT
  USING (workspace_id = public.get_my_workspace_id());
CREATE POLICY "flight_bookings_insert" ON public.flight_bookings FOR INSERT
  WITH CHECK (workspace_id = public.get_my_workspace_id());
CREATE POLICY "flight_bookings_update" ON public.flight_bookings FOR UPDATE
  USING (workspace_id = public.get_my_workspace_id())
  WITH CHECK (workspace_id = public.get_my_workspace_id());
CREATE POLICY "flight_bookings_delete" ON public.flight_bookings FOR DELETE
  USING (workspace_id = public.get_my_workspace_id());

-- §9.3 hotel_bookings — direct workspace_id (from 017; legacy table —
--   canonical entity is `rooms`/`hotels` per 051, but hotel_bookings
--   remains for unmigrated data and is workspace-scoped)
ALTER TABLE public.hotel_bookings ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Users can view tour hotels" ON public.hotel_bookings;
DROP POLICY IF EXISTS "Users can create tour hotels" ON public.hotel_bookings;
DROP POLICY IF EXISTS "Users can update tour hotels" ON public.hotel_bookings;
DROP POLICY IF EXISTS "Users can delete tour hotels" ON public.hotel_bookings;
DROP POLICY IF EXISTS "hotel_bookings_select" ON public.hotel_bookings;
DROP POLICY IF EXISTS "hotel_bookings_insert" ON public.hotel_bookings;
DROP POLICY IF EXISTS "hotel_bookings_update" ON public.hotel_bookings;
DROP POLICY IF EXISTS "hotel_bookings_delete" ON public.hotel_bookings;
CREATE POLICY "hotel_bookings_select" ON public.hotel_bookings FOR SELECT
  USING (workspace_id = public.get_my_workspace_id());
CREATE POLICY "hotel_bookings_insert" ON public.hotel_bookings FOR INSERT
  WITH CHECK (workspace_id = public.get_my_workspace_id());
CREATE POLICY "hotel_bookings_update" ON public.hotel_bookings FOR UPDATE
  USING (workspace_id = public.get_my_workspace_id())
  WITH CHECK (workspace_id = public.get_my_workspace_id());
CREATE POLICY "hotel_bookings_delete" ON public.hotel_bookings FOR DELETE
  USING (workspace_id = public.get_my_workspace_id());

-- §9.4 hotel_room_assignments — direct workspace_id (from 017; the
--   workspace_id column is denormalised onto each row alongside
--   hotel_booking_id, which lets us gate at the row level without a
--   subquery through hotel_bookings)
ALTER TABLE public.hotel_room_assignments ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Users can view hotel rooms" ON public.hotel_room_assignments;
DROP POLICY IF EXISTS "Users can create hotel rooms" ON public.hotel_room_assignments;
DROP POLICY IF EXISTS "Users can update hotel rooms" ON public.hotel_room_assignments;
DROP POLICY IF EXISTS "Users can delete hotel rooms" ON public.hotel_room_assignments;
DROP POLICY IF EXISTS "hotel_room_assignments_select" ON public.hotel_room_assignments;
DROP POLICY IF EXISTS "hotel_room_assignments_insert" ON public.hotel_room_assignments;
DROP POLICY IF EXISTS "hotel_room_assignments_update" ON public.hotel_room_assignments;
DROP POLICY IF EXISTS "hotel_room_assignments_delete" ON public.hotel_room_assignments;
CREATE POLICY "hotel_room_assignments_select" ON public.hotel_room_assignments FOR SELECT
  USING (workspace_id = public.get_my_workspace_id());
CREATE POLICY "hotel_room_assignments_insert" ON public.hotel_room_assignments FOR INSERT
  WITH CHECK (workspace_id = public.get_my_workspace_id());
CREATE POLICY "hotel_room_assignments_update" ON public.hotel_room_assignments FOR UPDATE
  USING (workspace_id = public.get_my_workspace_id())
  WITH CHECK (workspace_id = public.get_my_workspace_id());
CREATE POLICY "hotel_room_assignments_delete" ON public.hotel_room_assignments FOR DELETE
  USING (workspace_id = public.get_my_workspace_id());

-- §9.5 rooming_grid — direct workspace_id (from 017)
ALTER TABLE public.rooming_grid ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Users can view rooming grid" ON public.rooming_grid;
DROP POLICY IF EXISTS "Users can create rooming grid" ON public.rooming_grid;
DROP POLICY IF EXISTS "Users can update rooming grid" ON public.rooming_grid;
DROP POLICY IF EXISTS "Users can delete rooming grid" ON public.rooming_grid;
DROP POLICY IF EXISTS "rooming_grid_select" ON public.rooming_grid;
DROP POLICY IF EXISTS "rooming_grid_insert" ON public.rooming_grid;
DROP POLICY IF EXISTS "rooming_grid_update" ON public.rooming_grid;
DROP POLICY IF EXISTS "rooming_grid_delete" ON public.rooming_grid;
CREATE POLICY "rooming_grid_select" ON public.rooming_grid FOR SELECT
  USING (workspace_id = public.get_my_workspace_id());
CREATE POLICY "rooming_grid_insert" ON public.rooming_grid FOR INSERT
  WITH CHECK (workspace_id = public.get_my_workspace_id());
CREATE POLICY "rooming_grid_update" ON public.rooming_grid FOR UPDATE
  USING (workspace_id = public.get_my_workspace_id())
  WITH CHECK (workspace_id = public.get_my_workspace_id());
CREATE POLICY "rooming_grid_delete" ON public.rooming_grid FOR DELETE
  USING (workspace_id = public.get_my_workspace_id());

-- §9.6 personnel_tour_assignments — tour-scoped (from 001; no workspace_id
--   column, only tour_id). Workspace gating walks the FK chain through
--   tours, same pattern as `routing` / `advance_form_configs`.
ALTER TABLE public.personnel_tour_assignments ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Users can view tour personnel assignments" ON public.personnel_tour_assignments;
DROP POLICY IF EXISTS "Users can create tour personnel assignments" ON public.personnel_tour_assignments;
DROP POLICY IF EXISTS "Users can update tour personnel assignments" ON public.personnel_tour_assignments;
DROP POLICY IF EXISTS "Users can delete tour personnel assignments" ON public.personnel_tour_assignments;
DROP POLICY IF EXISTS "personnel_tour_assignments_select" ON public.personnel_tour_assignments;
DROP POLICY IF EXISTS "personnel_tour_assignments_insert" ON public.personnel_tour_assignments;
DROP POLICY IF EXISTS "personnel_tour_assignments_update" ON public.personnel_tour_assignments;
DROP POLICY IF EXISTS "personnel_tour_assignments_delete" ON public.personnel_tour_assignments;
CREATE POLICY "personnel_tour_assignments_select" ON public.personnel_tour_assignments FOR SELECT
  USING (tour_id IN (SELECT id FROM public.tours WHERE workspace_id = public.get_my_workspace_id()));
CREATE POLICY "personnel_tour_assignments_insert" ON public.personnel_tour_assignments FOR INSERT
  WITH CHECK (tour_id IN (SELECT id FROM public.tours WHERE workspace_id = public.get_my_workspace_id()));
CREATE POLICY "personnel_tour_assignments_update" ON public.personnel_tour_assignments FOR UPDATE
  USING (tour_id IN (SELECT id FROM public.tours WHERE workspace_id = public.get_my_workspace_id()))
  WITH CHECK (tour_id IN (SELECT id FROM public.tours WHERE workspace_id = public.get_my_workspace_id()));
CREATE POLICY "personnel_tour_assignments_delete" ON public.personnel_tour_assignments FOR DELETE
  USING (tour_id IN (SELECT id FROM public.tours WHERE workspace_id = public.get_my_workspace_id()));

-- ============================================
-- Down (commented; uncomment to roll back manually)
-- ============================================
-- This audit is a no-op revert: simply re-running the source migrations
-- (034 / 039 / 040 / 058 / 059 etc.) would re-introduce the artist-scope
-- admin gates the audit dropped. There's no clean "down" — the post-audit
-- state IS the canonical state. If you must roll back a specific table,
-- hand-craft a follow-up migration with the desired policy shape.

-- ════════════════════════════════════════════
-- 062: initial site admin promotions
-- ════════════════════════════════════════════
-- ============================================
-- LOWPASS — Initial site admin promotions
-- Migration 062
--
-- 036_site_admins.sql added the profiles.is_site_admin flag for
-- triaging bug reports at /bugs. Adam and Ben were promoted via
-- direct SQL on 2026-04-29; this records that as a tracked
-- migration so the production state is reproducible.
--
-- Numbering note: 061 is intentionally reserved for the RLS audit
-- migration that lands alongside CC_RLS_AUDIT_MIGRATION.md. Do not
-- backfill 061 with anything else.
--
-- In non-production environments these emails won't exist, so the
-- UPDATE affects 0 rows — that's the expected behaviour. Site
-- admin promotion in any other environment should happen through
-- a separate process (e.g. seed data or manual SQL by an env owner).
-- ============================================

UPDATE public.profiles
SET is_site_admin = TRUE
WHERE email IN ('adam@lowpass.co', 'ben@lowpass.co')
  AND is_site_admin = FALSE;

-- Down (commented):
-- UPDATE public.profiles
-- SET is_site_admin = FALSE
-- WHERE email IN ('adam@lowpass.co', 'ben@lowpass.co');

-- ════════════════════════════════════════════
-- 063: budget-receipts storage bucket + RLS
-- ════════════════════════════════════════════
-- ============================================
-- LOWPASS — budget-receipts storage bucket + RLS
-- Migration 063
--
-- The /api/budget/receipts/upload route (referenced from migration
-- 017's expense_receipts table) uploads files to a Supabase Storage
-- bucket named "budget-receipts". The bucket has never been created
-- via a tracked migration — operators have either provisioned it
-- manually via the Supabase Dashboard or hit the upload route's
-- "Storage bucket not found" error path.
--
-- Even when the bucket exists, storage.objects has RLS enabled by
-- default and there's no policy granting INSERT for budget-receipts.
-- That surfaces as "new row violates row-level security policy" when
-- the user drags a file into the Receipt Inbox.
--
-- This migration creates the bucket idempotently and adds the four
-- canonical CRUD policies for storage.objects scoped to bucket_id =
-- 'budget-receipts' + auth.uid() IS NOT NULL. Mirrors the pattern
-- from 016_advance_files_storage.sql / 027_personnel_files_storage.sql.
--
-- Numbering: 060/061/062 are reserved for the migration-repo-sync,
-- RLS-audit, and initial-site-admins migrations queued in PRs #4/#5.
-- 063 is the next safe number on this branch.
-- ============================================

-- 1. Bucket (private — receipt files are sensitive).
INSERT INTO storage.buckets (id, name, public)
VALUES ('budget-receipts', 'budget-receipts', false)
ON CONFLICT (id) DO NOTHING;

-- 2. RLS policies. Drop-then-create so re-running is safe.
DROP POLICY IF EXISTS "budget_receipts_storage_select" ON storage.objects;
CREATE POLICY "budget_receipts_storage_select"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'budget-receipts' AND auth.uid() IS NOT NULL);

DROP POLICY IF EXISTS "budget_receipts_storage_insert" ON storage.objects;
CREATE POLICY "budget_receipts_storage_insert"
  ON storage.objects FOR INSERT
  WITH CHECK (bucket_id = 'budget-receipts' AND auth.uid() IS NOT NULL);

DROP POLICY IF EXISTS "budget_receipts_storage_update" ON storage.objects;
CREATE POLICY "budget_receipts_storage_update"
  ON storage.objects FOR UPDATE
  USING (bucket_id = 'budget-receipts' AND auth.uid() IS NOT NULL)
  WITH CHECK (bucket_id = 'budget-receipts' AND auth.uid() IS NOT NULL);

DROP POLICY IF EXISTS "budget_receipts_storage_delete" ON storage.objects;
CREATE POLICY "budget_receipts_storage_delete"
  ON storage.objects FOR DELETE
  USING (bucket_id = 'budget-receipts' AND auth.uid() IS NOT NULL);

-- Down (commented; uncomment to roll back manually):
-- DROP POLICY IF EXISTS "budget_receipts_storage_select" ON storage.objects;
-- DROP POLICY IF EXISTS "budget_receipts_storage_insert" ON storage.objects;
-- DROP POLICY IF EXISTS "budget_receipts_storage_update" ON storage.objects;
-- DROP POLICY IF EXISTS "budget_receipts_storage_delete" ON storage.objects;
-- (Don't drop the bucket on rollback — files persist.)
