-- ============================================
-- LOWPASS — Backfill _lp_migrations
-- Migration 068
-- 2026-05-01
--
-- One-time data migration. Records every database/migrations/*.sql
-- file already applied to production by hand BEFORE the runner
-- existed (everything 001..065). Without this row set, the runner
-- would treat all of those as pending on its first invocation and
-- attempt to re-apply them — many would error on "table already
-- exists" / "policy already exists".
--
-- Includes 067 because Adam pastes the tracking-table migration by
-- hand in Supabase SQL Editor before the runner ever connects, so
-- the runner has no opportunity to record 067 itself.
--
-- Excludes 068 (this file) — the runner picks it up on its first
-- invocation post-bootstrap and records it via the normal apply
-- path. The INSERT below is idempotent (ON CONFLICT DO NOTHING) so
-- that re-apply is safe.
--
-- Excludes 066 — number deliberately skipped (see 067 header comment).
--
-- Stored checksums are the literal string 'backfill': we don't know
-- what the file content was at the time it was applied to
-- production, and the runner's checksum check explicitly skips
-- validation when stored = 'backfill'.
--
-- Adam: paste this in the Supabase SQL Editor AFTER 067 and BEFORE
-- the first `npm run db:migrate -- --dry-run`.
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
  ('012_tour_calendar_token.sql', 'backfill', 'historical'),
  ('013_tours_default_advance_template.sql', 'backfill', 'historical'),
  ('014_contacts.sql', 'backfill', 'historical'),
  ('015_routing_venue_extended.sql', 'backfill', 'historical'),
  ('016_advance_files_storage.sql', 'backfill', 'historical'),
  -- 017 and 024 have collision pairs (combined-budget vs split files);
  -- both filenames exist on disk and were applied historically. List
  -- both so the runner doesn't try to re-apply either.
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
  -- 029 and 030 numbers are unused on disk — skip the inserts.
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
  -- 064 lives on the feat/product-split-phase3 branch; backfill skips
  -- it. When that branch merges to main, the runner will apply it
  -- normally (real checksum, no 'backfill' sentinel).
  ('065_storage_buckets_orphan_capture.sql', 'backfill', 'historical'),
  -- 066 deliberately skipped (gap reserved for in-flight feature work).
  ('067_lp_migrations_tracking.sql', 'backfill', 'historical')
ON CONFLICT (filename) DO NOTHING;
