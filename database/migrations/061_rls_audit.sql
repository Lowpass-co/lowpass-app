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
-- Down (commented; uncomment to roll back manually)
-- ============================================
-- This audit is a no-op revert: simply re-running the source migrations
-- (034 / 039 / 040 / 058 / 059 etc.) would re-introduce the artist-scope
-- admin gates the audit dropped. There's no clean "down" — the post-audit
-- state IS the canonical state. If you must roll back a specific table,
-- hand-craft a follow-up migration with the desired policy shape.
