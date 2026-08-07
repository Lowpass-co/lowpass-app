-- LOWPASS — which 2xx migrations are actually applied? Read-only.
-- One distinctive artifact per migration. present=false means NOT APPLIED.
-- 'NO AUTO-CHECK' = data-only/policy-only migration, must be checked by hand.

select * from (
select '200', 'table budget_sections', to_regclass('public.budget_sections') is not null
union all
select '201', 'col budget_settings.merch_cogs_pct', exists(select 1 from information_schema.columns where table_schema='public' and table_name='budget_settings' and column_name='merch_cogs_pct')
union all
select '202', 'col budget_settings.insurance_basis', exists(select 1 from information_schema.columns where table_schema='public' and table_name='budget_settings' and column_name='insurance_basis')
union all
select '203', 'col budget_sections.kind', exists(select 1 from information_schema.columns where table_schema='public' and table_name='budget_sections' and column_name='kind')
union all
select '204', 'col personnel_rates.person_id', exists(select 1 from information_schema.columns where table_schema='public' and table_name='personnel_rates' and column_name='person_id')
union all
select '205', 'col ai_usage_events.provider', exists(select 1 from information_schema.columns where table_schema='public' and table_name='ai_usage_events' and column_name='provider')
union all
select '206' as mig, 'NO AUTO-CHECK' as artifact, null::boolean as present
union all
select '207', 'table gdpr_requests', to_regclass('public.gdpr_requests') is not null
union all
select '208' as mig, 'NO AUTO-CHECK' as artifact, null::boolean as present
union all
select '209' as mig, 'NO AUTO-CHECK' as artifact, null::boolean as present
union all
select '210', 'table user_ai_preferences', to_regclass('public.user_ai_preferences') is not null
union all
select '211', 'table rag_chunks', to_regclass('public.rag_chunks') is not null
union all
select '212', 'table budget_versions', to_regclass('public.budget_versions') is not null
union all
select '213', 'fn match_rag_chunks', exists(select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname='match_rag_chunks')
union all
select '214', 'table canonical_venues', to_regclass('public.canonical_venues') is not null
union all
select '215', 'col budget_income.actual_deductions', exists(select 1 from information_schema.columns where table_schema='public' and table_name='budget_income' and column_name='actual_deductions')
union all
select '216', 'table budget_fx_rates', to_regclass('public.budget_fx_rates') is not null
union all
select '217', 'col budget_income.capacity', exists(select 1 from information_schema.columns where table_schema='public' and table_name='budget_income' and column_name='capacity')
union all
select '218', 'table drive_time_cache', to_regclass('public.drive_time_cache') is not null
union all
select '219', 'fn budget_version_rollback', exists(select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname='budget_version_rollback')
union all
select '220', 'col budget_income.overage_is_override', exists(select 1 from information_schema.columns where table_schema='public' and table_name='budget_income' and column_name='overage_is_override')
union all
select '221', 'col budget_income.actual_tickets_sold', exists(select 1 from information_schema.columns where table_schema='public' and table_name='budget_income' and column_name='actual_tickets_sold')
union all
select '222', 'col expense_receipts.raw_ocr_json', exists(select 1 from information_schema.columns where table_schema='public' and table_name='expense_receipts' and column_name='raw_ocr_json')
union all
select '223', 'bucket export-assets', exists(select 1 from storage.buckets where id='export-assets')
union all
select '224', 'table export_templates', to_regclass('public.export_templates') is not null
union all
select '225', 'col budget_income.locked_fx_rate', exists(select 1 from information_schema.columns where table_schema='public' and table_name='budget_income' and column_name='locked_fx_rate')
union all
select '226', 'col canonical_venues.address', exists(select 1 from information_schema.columns where table_schema='public' and table_name='canonical_venues' and column_name='address')
union all
select '227' as mig, 'NO AUTO-CHECK' as artifact, null::boolean as present
union all
select '228', 'table rate_types', to_regclass('public.rate_types') is not null
union all
select '229' as mig, 'NO AUTO-CHECK' as artifact, null::boolean as present
union all
select '230' as mig, 'NO AUTO-CHECK' as artifact, null::boolean as present
union all
select '232' as mig, 'NO AUTO-CHECK' as artifact, null::boolean as present
union all
select '233' as mig, 'NO AUTO-CHECK' as artifact, null::boolean as present
union all
select '234', 'col budget_line_items.locked_fx_rate', exists(select 1 from information_schema.columns where table_schema='public' and table_name='budget_line_items' and column_name='locked_fx_rate')
union all
select '235', 'col budget_income.actuals_source', exists(select 1 from information_schema.columns where table_schema='public' and table_name='budget_income' and column_name='actuals_source')
union all
select '236', 'col budget_settings.exchange_rate', exists(select 1 from information_schema.columns where table_schema='public' and table_name='budget_settings' and column_name='exchange_rate')
union all
select '237', 'col routing.venue_frozen_at', exists(select 1 from information_schema.columns where table_schema='public' and table_name='routing' and column_name='venue_frozen_at')
union all
select '238', 'col channel_list_rows.gain', exists(select 1 from information_schema.columns where table_schema='public' and table_name='channel_list_rows' and column_name='gain')
union all
select '239', 'table labor_calls', to_regclass('public.labor_calls') is not null
union all
select '240', 'table intake_pending_answers', to_regclass('public.intake_pending_answers') is not null
union all
select '241', 'bucket tour-files', exists(select 1 from storage.buckets where id='tour-files')
union all
select '242' as mig, 'NO AUTO-CHECK' as artifact, null::boolean as present
union all
select '243', 'table settlement_deductions', to_regclass('public.settlement_deductions') is not null
union all
select '244', 'table import_batches', to_regclass('public.import_batches') is not null
union all
select '245', 'table IF', to_regclass('public.IF') is not null
union all
select '246', 'table spaces', to_regclass('public.spaces') is not null
union all
select '247', 'col gear.country_of_origin', exists(select 1 from information_schema.columns where table_schema='public' and table_name='gear' and column_name='country_of_origin')
union all
select '248' as mig, 'NO AUTO-CHECK' as artifact, null::boolean as present
union all
select '249', 'col rental_job_items.gear_id', exists(select 1 from information_schema.columns where table_schema='public' and table_name='rental_job_items' and column_name='gear_id')
union all
select '250', 'col rental_movements.from_space_id', exists(select 1 from information_schema.columns where table_schema='public' and table_name='rental_movements' and column_name='from_space_id')
union all
select '251', 'col import_pending_lines.receipt_id', exists(select 1 from information_schema.columns where table_schema='public' and table_name='import_pending_lines' and column_name='receipt_id')
union all
select '252', 'col expense_receipts.page_from', exists(select 1 from information_schema.columns where table_schema='public' and table_name='expense_receipts' and column_name='page_from')
union all
select '253', 'col rental_jobs.display_currency', exists(select 1 from information_schema.columns where table_schema='public' and table_name='rental_jobs' and column_name='display_currency')
union all
select '254', 'fn accept_workspace_invite', exists(select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname='accept_workspace_invite')
union all
select '255', 'fn gear_set_qr_token', exists(select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname='gear_set_qr_token')
union all
select '256', 'table rider_pack_attachments', to_regclass('public.rider_pack_attachments') is not null
union all
select '257', 'table show_links', to_regclass('public.show_links') is not null
union all
select '258' as mig, 'NO AUTO-CHECK' as artifact, null::boolean as present
union all
select '259' as mig, 'NO AUTO-CHECK' as artifact, null::boolean as present
union all
select '260' as mig, 'NO AUTO-CHECK' as artifact, null::boolean as present
) t(migration, artifact, present)
order by present nulls last, migration;
