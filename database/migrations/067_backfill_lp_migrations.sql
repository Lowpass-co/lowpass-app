-- ============================================
-- LOWPASS — Backfill _lp_migrations
-- Migration 067
--
-- Records every database/migrations/*.sql file that has already been
-- applied to production by hand, BEFORE the migration runner started
-- tracking. Without this, the runner would re-attempt every migration
-- 001..065 on first run; many would error on "table already exists" /
-- "policy already exists" / etc.
--
-- Filenames are hardcoded — this migration is not portable to other
-- environments. That's fine: this is a one-time data migration that
-- captures the current production state.
--
-- Checksums are intentionally the literal string 'backfill' because we
-- don't know what the file content was at the time it was applied.
-- The runner (scripts/db-migrate.mjs) skips checksum validation when
-- the stored value is 'backfill'.
--
-- 066 (the tracking table itself) is included so the runner doesn't
-- try to re-apply it. 067 (this file) is NOT included; the runner
-- will record it when it picks this file up on its first real pass.
--
-- Note on gaps: 029, 030, and 064 are intentionally absent from the
-- repo. 064 is reserved for `feat/product-split-phase3`'s
-- `064_budget_line_items_phase_tag.sql` which has not landed on main.
-- ============================================

INSERT INTO public._lp_migrations (filename, checksum, applied_by)
VALUES
  ('001_initial_schema.sql', 'backfill', 'historical'),
  ('002_auto_provisioning.sql', 'backfill', 'historical'),
  ('003_seed_advance_templates.sql', 'backfill', 'historical'),
  ('004_fix_rls_recursion.sql', 'backfill', 'historical'),
  ('005_routing_delete_policy.sql', 'backfill', 'historical'),
  ('006_artists_spotify_tours_principal.sql', 'backfill', 'historical'),
  ('007_storage_artist_assets_policies.sql', 'backfill', 'historical'),
  ('008_routing_address.sql', 'backfill', 'historical'),
  ('009_routing_lat_lng_transport.sql', 'backfill', 'historical'),
  ('010_tour_custom_day_types.sql', 'backfill', 'historical'),
  ('011_advance_system_enhancements.sql', 'backfill', 'historical'),
  ('011b_routing_day_type_default.sql', 'backfill', 'historical'),
  ('012_tour_calendar_token.sql', 'backfill', 'historical'),
  ('013_tours_default_advance_template.sql', 'backfill', 'historical'),
  ('014_contacts.sql', 'backfill', 'historical'),
  ('015_routing_venue_extended.sql', 'backfill', 'historical'),
  ('016_advance_files_storage.sql', 'backfill', 'historical'),
  ('017_024_combined_budget_system.sql', 'backfill', 'historical'),
  ('017_budget_system.sql', 'backfill', 'historical'),
  ('018_advance_templates_sort_order.sql', 'backfill', 'historical'),
  ('018_profiles_job_title_phone.sql', 'backfill', 'historical'),
  ('019_advance_layout_templates_workspace.sql', 'backfill', 'historical'),
  ('019_storage_avatars_bucket.sql', 'backfill', 'historical'),
  ('020_advance_dropdown_options.sql', 'backfill', 'historical'),
  ('021_advance_schedule_templates.sql', 'backfill', 'historical'),
  ('022_production_contact_optional.sql', 'backfill', 'historical'),
  ('023_deal_info_section_tm_only.sql', 'backfill', 'historical'),
  ('024_profiles_extended.sql', 'backfill', 'historical'),
  ('024_rich_line_items.sql', 'backfill', 'historical'),
  ('025_personnel_roster_link.sql', 'backfill', 'historical'),
  ('025_storage_avatars.sql', 'backfill', 'historical'),
  ('026_line_item_links.sql', 'backfill', 'historical'),
  ('026_personnel_extended_profile.sql', 'backfill', 'historical'),
  ('027_personnel_files_storage.sql', 'backfill', 'historical'),
  ('028_rental_inventory_day_rate_manual.sql', 'backfill', 'historical'),
  ('031_artists_tours_delete_rls.sql', 'backfill', 'historical'),
  ('032_personnel_delete_rls_fix.sql', 'backfill', 'historical'),
  ('033_bug_reports.sql', 'backfill', 'historical'),
  ('034_rider_pack_system.sql', 'backfill', 'historical'),
  ('035_bug_reports_reconcile.sql', 'backfill', 'historical'),
  ('035_rental_jobs_billing_details.sql', 'backfill', 'historical'),
  ('036_site_admins.sql', 'backfill', 'historical'),
  ('037_site_admin_functions.sql', 'backfill', 'historical'),
  ('038_site_admin_functions_fix.sql', 'backfill', 'historical'),
  ('039_rider_folders.sql', 'backfill', 'historical'),
  ('040_channel_list.sql', 'backfill', 'historical'),
  ('041_bug_status_pending_testing.sql', 'backfill', 'historical'),
  ('042_ensure_rider_section_type.sql', 'backfill', 'historical'),
  ('043_channel_list_reorder_and_stage_io.sql', 'backfill', 'historical'),
  ('044_bug_reports_status_default_open.sql', 'backfill', 'historical'),
  ('045_bug_reports_status_pending_testing_ensure.sql', 'backfill', 'historical'),
  ('046_channel_list_routing.sql', 'backfill', 'historical'),
  ('047_channel_list_rows_stagebox_positions_repair.sql', 'backfill', 'historical'),
  ('048_bugs_2026_04_26_pending_testing.sql', 'backfill', 'historical'),
  ('049_flight_canonical.sql', 'backfill', 'historical'),
  ('050_person_canonical.sql', 'backfill', 'historical'),
  ('051_room_canonical.sql', 'backfill', 'historical'),
  ('052_gear_canonical.sql', 'backfill', 'historical'),
  ('053_deal_memos.sql', 'backfill', 'historical'),
  ('054_budget_line_items_section.sql', 'backfill', 'historical'),
  ('055_expenses_canonical.sql', 'backfill', 'historical'),
  ('056_set_updated_at_function.sql', 'backfill', 'historical'),
  ('057_rental_gear_link.sql', 'backfill', 'historical'),
  ('058_rider_folders_relax_admin_gate.sql', 'backfill', 'historical'),
  ('059_advance_templates_update_delete_policies.sql', 'backfill', 'historical'),
  ('060_roles_wiring.sql', 'backfill', 'historical'),
  ('061_rls_audit.sql', 'backfill', 'historical'),
  ('062_initial_site_admins.sql', 'backfill', 'historical'),
  ('063_budget_receipts_storage.sql', 'backfill', 'historical'),
  ('065_storage_buckets_orphan_capture.sql', 'backfill', 'historical'),
  ('066_lp_migrations_tracking.sql', 'backfill', 'historical')
ON CONFLICT (filename) DO NOTHING;

-- Down (commented; uncomment to roll back manually):
-- DELETE FROM public._lp_migrations WHERE checksum = 'backfill';
