-- ============================================
-- LOWPASS — The advance question catalogue, curated
-- Migration 303
-- ============================================
--
-- GENERATED from src/lib/templates/advanceCatalog.ts + tourTemplates.ts by
--   npx tsx scripts/templates/gen303.ts
-- Never hand-edit — a test fails if this file and the code differ.
--
-- Adam (Nov 2026): "drastically improve all templates … each useful and
-- curated … dressing rooms appears twice". The built-in catalogue had grown
-- from two seeds (003, then 259) that overlapped: the headline set asked ~308
-- questions, many twice. This replaces it with 15 sections in which
-- every question is asked once, and rebuilds every workspace's starter
-- templates and every show day that uses one. Adam: "affect everything,
-- site isn't being used yet".
--
--  1. advance_templates.show_when (jsonb): a section shown only when another
--     question has one of the given answers (Weather & Outdoor).
--  2. Each catalogue section takes over its old built-in row (answers are
--     stored per row id + question id, so kept questions keep their answers)
--     or is inserted with a fixed id.
--  3. Workspace copies of built-in sections (forks, 077) are deleted — they
--     would replace the new sections by name. Sections you made yourself stay.
--  4. Retired built-in sections are deleted: Venue Info, Settlement, Deal Info, Hotel, Flights, Driver and Hotels, Personal Vehicle Parking, Venue Amenities, Airport and Local Distances.
--     Their stored answers stay in advance_instances.data, unshown.
--  5. Every workspace's starter templates (Headline show day, Support show day, Festival day, Day off)
--     are rebuilt, and every show day that uses one gets the new sections —
--     INCLUDING customised and sent days (customised is cleared).
--  6. A read-only report of templates and days this did NOT touch.
--
-- HAND-PASTE, idempotent: every write is guarded (IS DISTINCT FROM / NOT
-- EXISTS / ON CONFLICT); a second paste changes nothing.
-- ============================================

-- 1. ------------------------------------------------------------------------
ALTER TABLE public.advance_templates ADD COLUMN IF NOT EXISTS show_when jsonb;
COMMENT ON COLUMN public.advance_templates.show_when IS
  'Shown only when question field (any section of the day) is answered with one of in: {"field": "...", "in": [...]}. 303.';

-- 3 (first, while forked_from_id still points at the old rows). -------------
DELETE FROM public.advance_templates
WHERE workspace_id IS NOT NULL AND forked_from_id IS NOT NULL;

-- 2. ------------------------------------------------------------------------
-- ---- Key Contacts (11 questions) — takes over: Key Contacts ----
DO $$
DECLARE v_id uuid;
BEGIN
  SELECT id INTO v_id FROM public.advance_templates
  WHERE workspace_id IS NULL AND template_type = 'section'
    AND (id = '30300000-0000-4000-8000-000000000001'::uuid OR name IN ('Key Contacts'))
  ORDER BY (id = '30300000-0000-4000-8000-000000000001'::uuid) DESC, (name = 'Key Contacts') DESC, array_position(ARRAY['Key Contacts']::text[], name), created_at
  LIMIT 1;
  IF v_id IS NULL THEN
    INSERT INTO public.advance_templates (id, workspace_id, template_type, name, description, icon, fields)
    VALUES ('30300000-0000-4000-8000-000000000001'::uuid, NULL, 'section', 'Key Contacts', 'Who to call, for what', 'users', '[]'::jsonb)
    ON CONFLICT (id) DO NOTHING;
    v_id := '30300000-0000-4000-8000-000000000001'::uuid;
  END IF;
  UPDATE public.advance_templates SET
    name = 'Key Contacts', description = 'Who to call, for what', icon = 'users',
    fields = '[{"id":"promoter_buyer","label":"Promoter","type":"contact"},{"id":"primary_advance_contact","label":"Advance contact","type":"contact"},{"id":"day_of_show_venue_contact","label":"Day-of-show contact","type":"contact"},{"id":"production_contact","label":"Production","type":"contact"},{"id":"hospitality_catering_contact","label":"Hospitality / catering","type":"contact"},{"id":"runner_contact","label":"Runner","type":"contact"},{"id":"security_lead","label":"Security","type":"contact"},{"id":"box_office_ticketing_contact","label":"Box office","type":"contact"},{"id":"merchandise_contact","label":"Merch","type":"contact"},{"id":"settlement_contact","label":"Settlement","type":"contact"},{"id":"artist_transport_contact","label":"Artist transport","type":"contact"}]'::jsonb,
    tm_only = false, show_when = NULL::jsonb, sort_order = 0
  WHERE id = v_id
    AND (name, description, icon, fields, tm_only, show_when, sort_order)
      IS DISTINCT FROM ('Key Contacts', 'Who to call, for what', 'users', '[{"id":"promoter_buyer","label":"Promoter","type":"contact"},{"id":"primary_advance_contact","label":"Advance contact","type":"contact"},{"id":"day_of_show_venue_contact","label":"Day-of-show contact","type":"contact"},{"id":"production_contact","label":"Production","type":"contact"},{"id":"hospitality_catering_contact","label":"Hospitality / catering","type":"contact"},{"id":"runner_contact","label":"Runner","type":"contact"},{"id":"security_lead","label":"Security","type":"contact"},{"id":"box_office_ticketing_contact","label":"Box office","type":"contact"},{"id":"merchandise_contact","label":"Merch","type":"contact"},{"id":"settlement_contact","label":"Settlement","type":"contact"},{"id":"artist_transport_contact","label":"Artist transport","type":"contact"}]'::jsonb, false, NULL::jsonb, 0);
  -- Any other built-in row under these names (a double-pasted seed) goes.
  DELETE FROM public.advance_templates
  WHERE workspace_id IS NULL AND template_type = 'section' AND id <> v_id AND name IN ('Key Contacts');
END $$;

-- ---- Show (4 questions) — takes over: Event Basics ----
DO $$
DECLARE v_id uuid;
BEGIN
  SELECT id INTO v_id FROM public.advance_templates
  WHERE workspace_id IS NULL AND template_type = 'section'
    AND (id = '30300000-0000-4000-8000-000000000002'::uuid OR name IN ('Show', 'Event Basics'))
  ORDER BY (id = '30300000-0000-4000-8000-000000000002'::uuid) DESC, (name = 'Show') DESC, array_position(ARRAY['Show', 'Event Basics']::text[], name), created_at
  LIMIT 1;
  IF v_id IS NULL THEN
    INSERT INTO public.advance_templates (id, workspace_id, template_type, name, description, icon, fields)
    VALUES ('30300000-0000-4000-8000-000000000002'::uuid, NULL, 'section', 'Show', 'Capacity, age limit, indoor or outdoor', 'ticket', '[]'::jsonb)
    ON CONFLICT (id) DO NOTHING;
    v_id := '30300000-0000-4000-8000-000000000002'::uuid;
  END IF;
  UPDATE public.advance_templates SET
    name = 'Show', description = 'Capacity, age limit, indoor or outdoor', icon = 'ticket',
    fields = '[{"id":"capacity","label":"Capacity","type":"number"},{"id":"sellable_capacity","label":"Sellable capacity","type":"number"},{"id":"age_limit","label":"Age limit","type":"text"},{"id":"indoor_outdoor","label":"Indoor / outdoor","type":"select","options":["Indoor","Outdoor","Covered"]}]'::jsonb,
    tm_only = false, show_when = NULL::jsonb, sort_order = 1
  WHERE id = v_id
    AND (name, description, icon, fields, tm_only, show_when, sort_order)
      IS DISTINCT FROM ('Show', 'Capacity, age limit, indoor or outdoor', 'ticket', '[{"id":"capacity","label":"Capacity","type":"number"},{"id":"sellable_capacity","label":"Sellable capacity","type":"number"},{"id":"age_limit","label":"Age limit","type":"text"},{"id":"indoor_outdoor","label":"Indoor / outdoor","type":"select","options":["Indoor","Outdoor","Covered"]}]'::jsonb, false, NULL::jsonb, 1);
  -- Any other built-in row under these names (a double-pasted seed) goes.
  DELETE FROM public.advance_templates
  WHERE workspace_id IS NULL AND template_type = 'section' AND id <> v_id AND name IN ('Show', 'Event Basics');
END $$;

-- ---- Schedule (15 questions) — takes over: Schedule ----
DO $$
DECLARE v_id uuid;
BEGIN
  SELECT id INTO v_id FROM public.advance_templates
  WHERE workspace_id IS NULL AND template_type = 'section'
    AND (id = '30300000-0000-4000-8000-000000000003'::uuid OR name IN ('Schedule'))
  ORDER BY (id = '30300000-0000-4000-8000-000000000003'::uuid) DESC, (name = 'Schedule') DESC, array_position(ARRAY['Schedule']::text[], name), created_at
  LIMIT 1;
  IF v_id IS NULL THEN
    INSERT INTO public.advance_templates (id, workspace_id, template_type, name, description, icon, fields)
    VALUES ('30300000-0000-4000-8000-000000000003'::uuid, NULL, 'section', 'Schedule', 'Arrival, load in, soundchecks, doors, sets, curfews, load out', 'clock', '[]'::jsonb)
    ON CONFLICT (id) DO NOTHING;
    v_id := '30300000-0000-4000-8000-000000000003'::uuid;
  END IF;
  UPDATE public.advance_templates SET
    name = 'Schedule', description = 'Arrival, load in, soundchecks, doors, sets, curfews, load out', icon = 'clock',
    fields = '[{"id":"earliest_bus_arrival","label":"Earliest bus arrival","type":"time"},{"id":"earliest_venue_access","label":"Earliest access","type":"time"},{"id":"load_in","label":"Load in","type":"time"},{"id":"headliner_soundcheck","label":"Headliner soundcheck","type":"time"},{"id":"support_soundcheck","label":"Support soundcheck","type":"time"},{"id":"security_brief","label":"Security brief","type":"time"},{"id":"vip_meet_and_greet","label":"VIP meet & greet","type":"time"},{"id":"doors_open","label":"Doors","type":"time"},{"id":"support_set","label":"Support set","type":"time"},{"id":"changeover","label":"Changeover","type":"text","placeholder":"e.g. 30 min"},{"id":"headliner_set","label":"Headliner set","type":"time"},{"id":"curfew","label":"Curfew","type":"time"},{"id":"load_out","label":"Load out","type":"time"},{"id":"backstage_curfew","label":"Backstage curfew","type":"time"},{"id":"schedule_notes","label":"Schedule notes","type":"textarea","placeholder":"Noise limits, early load out, anything else"}]'::jsonb,
    tm_only = false, show_when = NULL::jsonb, sort_order = 2
  WHERE id = v_id
    AND (name, description, icon, fields, tm_only, show_when, sort_order)
      IS DISTINCT FROM ('Schedule', 'Arrival, load in, soundchecks, doors, sets, curfews, load out', 'clock', '[{"id":"earliest_bus_arrival","label":"Earliest bus arrival","type":"time"},{"id":"earliest_venue_access","label":"Earliest access","type":"time"},{"id":"load_in","label":"Load in","type":"time"},{"id":"headliner_soundcheck","label":"Headliner soundcheck","type":"time"},{"id":"support_soundcheck","label":"Support soundcheck","type":"time"},{"id":"security_brief","label":"Security brief","type":"time"},{"id":"vip_meet_and_greet","label":"VIP meet & greet","type":"time"},{"id":"doors_open","label":"Doors","type":"time"},{"id":"support_set","label":"Support set","type":"time"},{"id":"changeover","label":"Changeover","type":"text","placeholder":"e.g. 30 min"},{"id":"headliner_set","label":"Headliner set","type":"time"},{"id":"curfew","label":"Curfew","type":"time"},{"id":"load_out","label":"Load out","type":"time"},{"id":"backstage_curfew","label":"Backstage curfew","type":"time"},{"id":"schedule_notes","label":"Schedule notes","type":"textarea","placeholder":"Noise limits, early load out, anything else"}]'::jsonb, false, NULL::jsonb, 2);
  -- Any other built-in row under these names (a double-pasted seed) goes.
  DELETE FROM public.advance_templates
  WHERE workspace_id IS NULL AND template_type = 'section' AND id <> v_id AND name IN ('Schedule');
END $$;

-- ---- Arrival & Parking (8 questions) — takes over: Bus and Trailer, Transport ----
DO $$
DECLARE v_id uuid;
BEGIN
  SELECT id INTO v_id FROM public.advance_templates
  WHERE workspace_id IS NULL AND template_type = 'section'
    AND (id = '30300000-0000-4000-8000-000000000004'::uuid OR name IN ('Arrival & Parking', 'Bus and Trailer', 'Transport'))
  ORDER BY (id = '30300000-0000-4000-8000-000000000004'::uuid) DESC, (name = 'Arrival & Parking') DESC, array_position(ARRAY['Arrival & Parking', 'Bus and Trailer', 'Transport']::text[], name), created_at
  LIMIT 1;
  IF v_id IS NULL THEN
    INSERT INTO public.advance_templates (id, workspace_id, template_type, name, description, icon, fields)
    VALUES ('30300000-0000-4000-8000-000000000004'::uuid, NULL, 'section', 'Arrival & Parking', 'Where vehicles go, when they must leave, power and limits', 'truck', '[]'::jsonb)
    ON CONFLICT (id) DO NOTHING;
    v_id := '30300000-0000-4000-8000-000000000004'::uuid;
  END IF;
  UPDATE public.advance_templates SET
    name = 'Arrival & Parking', description = 'Where vehicles go, when they must leave, power and limits', icon = 'truck',
    fields = '[{"id":"bus_parking","label":"Where the bus / truck parks","type":"textarea"},{"id":"correct_entrance","label":"Entrance for drivers","type":"text","placeholder":"Address or gate to aim for"},{"id":"latest_departure_time","label":"Must leave by","type":"time"},{"id":"overnight_parking_permitted","label":"Overnight parking allowed","type":"boolean"},{"id":"shore_power_amperage_connection","label":"Shore power","type":"text","placeholder":"Amps and connector, or none"},{"id":"low_branches_gates_weight_restrictions","label":"Height, width or weight limits on the way in","type":"textarea"},{"id":"gate_code","label":"Gate code","type":"text"},{"id":"personal_vehicle_parking_location","label":"Cars and vans park at","type":"text"}]'::jsonb,
    tm_only = false, show_when = NULL::jsonb, sort_order = 3
  WHERE id = v_id
    AND (name, description, icon, fields, tm_only, show_when, sort_order)
      IS DISTINCT FROM ('Arrival & Parking', 'Where vehicles go, when they must leave, power and limits', 'truck', '[{"id":"bus_parking","label":"Where the bus / truck parks","type":"textarea"},{"id":"correct_entrance","label":"Entrance for drivers","type":"text","placeholder":"Address or gate to aim for"},{"id":"latest_departure_time","label":"Must leave by","type":"time"},{"id":"overnight_parking_permitted","label":"Overnight parking allowed","type":"boolean"},{"id":"shore_power_amperage_connection","label":"Shore power","type":"text","placeholder":"Amps and connector, or none"},{"id":"low_branches_gates_weight_restrictions","label":"Height, width or weight limits on the way in","type":"textarea"},{"id":"gate_code","label":"Gate code","type":"text"},{"id":"personal_vehicle_parking_location","label":"Cars and vans park at","type":"text"}]'::jsonb, false, NULL::jsonb, 3);
  -- Any other built-in row under these names (a double-pasted seed) goes.
  DELETE FROM public.advance_templates
  WHERE workspace_id IS NULL AND template_type = 'section' AND id <> v_id AND name IN ('Arrival & Parking', 'Bus and Trailer', 'Transport');
END $$;

-- ---- Production (13 questions) — takes over: Production ----
DO $$
DECLARE v_id uuid;
BEGIN
  SELECT id INTO v_id FROM public.advance_templates
  WHERE workspace_id IS NULL AND template_type = 'section'
    AND (id = '30300000-0000-4000-8000-000000000005'::uuid OR name IN ('Production'))
  ORDER BY (id = '30300000-0000-4000-8000-000000000005'::uuid) DESC, (name = 'Production') DESC, array_position(ARRAY['Production']::text[], name), created_at
  LIMIT 1;
  IF v_id IS NULL THEN
    INSERT INTO public.advance_templates (id, workspace_id, template_type, name, description, icon, fields)
    VALUES ('30300000-0000-4000-8000-000000000005'::uuid, NULL, 'section', 'Production', 'Stage, load-in access, power and the house systems', 'speaker', '[]'::jsonb)
    ON CONFLICT (id) DO NOTHING;
    v_id := '30300000-0000-4000-8000-000000000005'::uuid;
  END IF;
  UPDATE public.advance_templates SET
    name = 'Production', description = 'Stage, load-in access, power and the house systems', icon = 'speaker',
    fields = '[{"id":"stage_dimensions","label":"Stage size","type":"text","placeholder":"W × D × H"},{"id":"load_in_access","label":"Load-in access","type":"text","placeholder":"Dock, push, stairs, lift"},{"id":"power_details","label":"Power","type":"textarea","placeholder":"Amps, phase, where"},{"id":"pa_system","label":"PA","type":"text"},{"id":"foh_console","label":"House FOH console","type":"text"},{"id":"monitor_system","label":"Monitors","type":"text"},{"id":"mon_console","label":"House monitor console","type":"text"},{"id":"lighting_console","label":"Lighting rig and desk","type":"text"},{"id":"lighting_patch","label":"Lighting patch","type":"file","placeholder":"Image or PDF"},{"id":"backline_provided","label":"Backline provided","type":"textarea"},{"id":"haze_allowed","label":"Haze allowed","type":"boolean"},{"id":"hazer_supplied","label":"Hazer supplied","type":"boolean"},{"id":"production_notes","label":"Production notes","type":"textarea"}]'::jsonb,
    tm_only = false, show_when = NULL::jsonb, sort_order = 4
  WHERE id = v_id
    AND (name, description, icon, fields, tm_only, show_when, sort_order)
      IS DISTINCT FROM ('Production', 'Stage, load-in access, power and the house systems', 'speaker', '[{"id":"stage_dimensions","label":"Stage size","type":"text","placeholder":"W × D × H"},{"id":"load_in_access","label":"Load-in access","type":"text","placeholder":"Dock, push, stairs, lift"},{"id":"power_details","label":"Power","type":"textarea","placeholder":"Amps, phase, where"},{"id":"pa_system","label":"PA","type":"text"},{"id":"foh_console","label":"House FOH console","type":"text"},{"id":"monitor_system","label":"Monitors","type":"text"},{"id":"mon_console","label":"House monitor console","type":"text"},{"id":"lighting_console","label":"Lighting rig and desk","type":"text"},{"id":"lighting_patch","label":"Lighting patch","type":"file","placeholder":"Image or PDF"},{"id":"backline_provided","label":"Backline provided","type":"textarea"},{"id":"haze_allowed","label":"Haze allowed","type":"boolean"},{"id":"hazer_supplied","label":"Hazer supplied","type":"boolean"},{"id":"production_notes","label":"Production notes","type":"textarea"}]'::jsonb, false, NULL::jsonb, 4);
  -- Any other built-in row under these names (a double-pasted seed) goes.
  DELETE FROM public.advance_templates
  WHERE workspace_id IS NULL AND template_type = 'section' AND id <> v_id AND name IN ('Production');
END $$;

-- ---- Dressing Rooms (8 questions) — takes over: Dressing Rooms ----
DO $$
DECLARE v_id uuid;
BEGIN
  SELECT id INTO v_id FROM public.advance_templates
  WHERE workspace_id IS NULL AND template_type = 'section'
    AND (id = '30300000-0000-4000-8000-000000000006'::uuid OR name IN ('Dressing Rooms'))
  ORDER BY (id = '30300000-0000-4000-8000-000000000006'::uuid) DESC, (name = 'Dressing Rooms') DESC, array_position(ARRAY['Dressing Rooms']::text[], name), created_at
  LIMIT 1;
  IF v_id IS NULL THEN
    INSERT INTO public.advance_templates (id, workspace_id, template_type, name, description, icon, fields)
    VALUES ('30300000-0000-4000-8000-000000000006'::uuid, NULL, 'section', 'Dressing Rooms', 'Rooms, bathrooms, showers, towels, Wi-Fi, laundry, production office', 'door-closed', '[]'::jsonb)
    ON CONFLICT (id) DO NOTHING;
    v_id := '30300000-0000-4000-8000-000000000006'::uuid;
  END IF;
  UPDATE public.advance_templates SET
    name = 'Dressing Rooms', description = 'Rooms, bathrooms, showers, towels, Wi-Fi, laundry, production office', icon = 'door-closed',
    fields = '[{"id":"num_dressing_rooms","label":"Rooms available","type":"number"},{"id":"lockable_access","label":"Lockable","type":"boolean"},{"id":"backstage_bathrooms","label":"Backstage bathrooms","type":"text","placeholder":"How many, where"},{"id":"showers_number_location","label":"Showers","type":"text","placeholder":"How many, where, hot water"},{"id":"towel_cost","label":"Towel cost","type":"text","placeholder":"e.g. $1 per towel, or $10 per bundle"},{"id":"production_office","label":"Production office","type":"text"},{"id":"wifi_network_password","label":"Wi-Fi network and password","type":"text"},{"id":"laundry_location_hours","label":"Laundry","type":"text","placeholder":"Washer / dryer, where, detergent provided?"}]'::jsonb,
    tm_only = false, show_when = NULL::jsonb, sort_order = 5
  WHERE id = v_id
    AND (name, description, icon, fields, tm_only, show_when, sort_order)
      IS DISTINCT FROM ('Dressing Rooms', 'Rooms, bathrooms, showers, towels, Wi-Fi, laundry, production office', 'door-closed', '[{"id":"num_dressing_rooms","label":"Rooms available","type":"number"},{"id":"lockable_access","label":"Lockable","type":"boolean"},{"id":"backstage_bathrooms","label":"Backstage bathrooms","type":"text","placeholder":"How many, where"},{"id":"showers_number_location","label":"Showers","type":"text","placeholder":"How many, where, hot water"},{"id":"towel_cost","label":"Towel cost","type":"text","placeholder":"e.g. $1 per towel, or $10 per bundle"},{"id":"production_office","label":"Production office","type":"text"},{"id":"wifi_network_password","label":"Wi-Fi network and password","type":"text"},{"id":"laundry_location_hours","label":"Laundry","type":"text","placeholder":"Washer / dryer, where, detergent provided?"}]'::jsonb, false, NULL::jsonb, 5);
  -- Any other built-in row under these names (a double-pasted seed) goes.
  DELETE FROM public.advance_templates
  WHERE workspace_id IS NULL AND template_type = 'section' AND id <> v_id AND name IN ('Dressing Rooms');
END $$;

-- ---- Catering & Hospitality (6 questions) — takes over: Hospitality ----
DO $$
DECLARE v_id uuid;
BEGIN
  SELECT id INTO v_id FROM public.advance_templates
  WHERE workspace_id IS NULL AND template_type = 'section'
    AND (id = '30300000-0000-4000-8000-000000000007'::uuid OR name IN ('Catering & Hospitality', 'Hospitality'))
  ORDER BY (id = '30300000-0000-4000-8000-000000000007'::uuid) DESC, (name = 'Catering & Hospitality') DESC, array_position(ARRAY['Catering & Hospitality', 'Hospitality']::text[], name), created_at
  LIMIT 1;
  IF v_id IS NULL THEN
    INSERT INTO public.advance_templates (id, workspace_id, template_type, name, description, icon, fields)
    VALUES ('30300000-0000-4000-8000-000000000007'::uuid, NULL, 'section', 'Catering & Hospitality', 'Catering or buyout, budget, meal times', 'utensils', '[]'::jsonb)
    ON CONFLICT (id) DO NOTHING;
    v_id := '30300000-0000-4000-8000-000000000007'::uuid;
  END IF;
  UPDATE public.advance_templates SET
    name = 'Catering & Hospitality', description = 'Catering or buyout, budget, meal times', icon = 'utensils',
    fields = '[{"id":"catering_buyout","label":"Catering or buyout","type":"select","options":["Catering","Buyout","Both"]},{"id":"catering_budget","label":"Catering budget","type":"currency"},{"id":"tour_party_count","label":"Meals for (touring party)","type":"number"},{"id":"breakfast_time_details","label":"Breakfast","type":"text","placeholder":"Time and where"},{"id":"lunch_time_details","label":"Lunch","type":"text","placeholder":"Time and where"},{"id":"dinner_time_menu","label":"Dinner","type":"text","placeholder":"Time, where, menu"}]'::jsonb,
    tm_only = false, show_when = NULL::jsonb, sort_order = 6
  WHERE id = v_id
    AND (name, description, icon, fields, tm_only, show_when, sort_order)
      IS DISTINCT FROM ('Catering & Hospitality', 'Catering or buyout, budget, meal times', 'utensils', '[{"id":"catering_buyout","label":"Catering or buyout","type":"select","options":["Catering","Buyout","Both"]},{"id":"catering_budget","label":"Catering budget","type":"currency"},{"id":"tour_party_count","label":"Meals for (touring party)","type":"number"},{"id":"breakfast_time_details","label":"Breakfast","type":"text","placeholder":"Time and where"},{"id":"lunch_time_details","label":"Lunch","type":"text","placeholder":"Time and where"},{"id":"dinner_time_menu","label":"Dinner","type":"text","placeholder":"Time, where, menu"}]'::jsonb, false, NULL::jsonb, 6);
  -- Any other built-in row under these names (a double-pasted seed) goes.
  DELETE FROM public.advance_templates
  WHERE workspace_id IS NULL AND template_type = 'section' AND id <> v_id AND name IN ('Catering & Hospitality', 'Hospitality');
END $$;

-- ---- Runner (6 questions) — takes over: Runner ----
DO $$
DECLARE v_id uuid;
BEGIN
  SELECT id INTO v_id FROM public.advance_templates
  WHERE workspace_id IS NULL AND template_type = 'section'
    AND (id = '30300000-0000-4000-8000-000000000008'::uuid OR name IN ('Runner'))
  ORDER BY (id = '30300000-0000-4000-8000-000000000008'::uuid) DESC, (name = 'Runner') DESC, array_position(ARRAY['Runner']::text[], name), created_at
  LIMIT 1;
  IF v_id IS NULL THEN
    INSERT INTO public.advance_templates (id, workspace_id, template_type, name, description, icon, fields)
    VALUES ('30300000-0000-4000-8000-000000000008'::uuid, NULL, 'section', 'Runner', 'Whether there is one, hours, vehicle', 'car', '[]'::jsonb)
    ON CONFLICT (id) DO NOTHING;
    v_id := '30300000-0000-4000-8000-000000000008'::uuid;
  END IF;
  UPDATE public.advance_templates SET
    name = 'Runner', description = 'Whether there is one, hours, vehicle', icon = 'car',
    fields = '[{"id":"runner_available","label":"Runner available","type":"boolean"},{"id":"runner_on_clock","label":"From","type":"time"},{"id":"runner_off_clock","label":"Until","type":"time"},{"id":"runner_vehicle","label":"Vehicle and seats","type":"text"},{"id":"airport_runs_permitted","label":"Can do airport runs","type":"boolean"},{"id":"runner_breaks","label":"Breaks","type":"text"}]'::jsonb,
    tm_only = false, show_when = NULL::jsonb, sort_order = 7
  WHERE id = v_id
    AND (name, description, icon, fields, tm_only, show_when, sort_order)
      IS DISTINCT FROM ('Runner', 'Whether there is one, hours, vehicle', 'car', '[{"id":"runner_available","label":"Runner available","type":"boolean"},{"id":"runner_on_clock","label":"From","type":"time"},{"id":"runner_off_clock","label":"Until","type":"time"},{"id":"runner_vehicle","label":"Vehicle and seats","type":"text"},{"id":"airport_runs_permitted","label":"Can do airport runs","type":"boolean"},{"id":"runner_breaks","label":"Breaks","type":"text"}]'::jsonb, false, NULL::jsonb, 7);
  -- Any other built-in row under these names (a double-pasted seed) goes.
  DELETE FROM public.advance_templates
  WHERE workspace_id IS NULL AND template_type = 'section' AND id <> v_id AND name IN ('Runner');
END $$;

-- ---- Merch (8 questions) — takes over: Merch ----
DO $$
DECLARE v_id uuid;
BEGIN
  SELECT id INTO v_id FROM public.advance_templates
  WHERE workspace_id IS NULL AND template_type = 'section'
    AND (id = '30300000-0000-4000-8000-000000000009'::uuid OR name IN ('Merch'))
  ORDER BY (id = '30300000-0000-4000-8000-000000000009'::uuid) DESC, (name = 'Merch') DESC, array_position(ARRAY['Merch']::text[], name), created_at
  LIMIT 1;
  IF v_id IS NULL THEN
    INSERT INTO public.advance_templates (id, workspace_id, template_type, name, description, icon, fields)
    VALUES ('30300000-0000-4000-8000-000000000009'::uuid, NULL, 'section', 'Merch', 'Concession, house fee, the split, the stand, counts', 'shirt', '[]'::jsonb)
    ON CONFLICT (id) DO NOTHING;
    v_id := '30300000-0000-4000-8000-000000000009'::uuid;
  END IF;
  UPDATE public.advance_templates SET
    name = 'Merch', description = 'Concession, house fee, the split, the stand, counts', icon = 'shirt',
    fields = '[{"id":"merch_concession","label":"Concession","type":"text"},{"id":"merch_house_fee","label":"House fee","type":"number"},{"id":"soft_goods_split","label":"Soft goods — % to venue","type":"number"},{"id":"hard_goods_split","label":"Hard goods — % to venue","type":"number"},{"id":"merch_location","label":"Where merch is","type":"text"},{"id":"tables_chairs_grid_display","label":"Tables, grid, lighting, power","type":"textarea"},{"id":"venue_pos","label":"Venue POS","type":"boolean"},{"id":"venue_counts_in_out","label":"Count in / count out","type":"boolean"}]'::jsonb,
    tm_only = false, show_when = NULL::jsonb, sort_order = 8
  WHERE id = v_id
    AND (name, description, icon, fields, tm_only, show_when, sort_order)
      IS DISTINCT FROM ('Merch', 'Concession, house fee, the split, the stand, counts', 'shirt', '[{"id":"merch_concession","label":"Concession","type":"text"},{"id":"merch_house_fee","label":"House fee","type":"number"},{"id":"soft_goods_split","label":"Soft goods — % to venue","type":"number"},{"id":"hard_goods_split","label":"Hard goods — % to venue","type":"number"},{"id":"merch_location","label":"Where merch is","type":"text"},{"id":"tables_chairs_grid_display","label":"Tables, grid, lighting, power","type":"textarea"},{"id":"venue_pos","label":"Venue POS","type":"boolean"},{"id":"venue_counts_in_out","label":"Count in / count out","type":"boolean"}]'::jsonb, false, NULL::jsonb, 8);
  -- Any other built-in row under these names (a double-pasted seed) goes.
  DELETE FROM public.advance_templates
  WHERE workspace_id IS NULL AND template_type = 'section' AND id <> v_id AND name IN ('Merch');
END $$;

-- ---- Guests & Credentials (5 questions) — takes over: Comps and Ticketing ----
DO $$
DECLARE v_id uuid;
BEGIN
  SELECT id INTO v_id FROM public.advance_templates
  WHERE workspace_id IS NULL AND template_type = 'section'
    AND (id = '30300000-0000-4000-8000-00000000000a'::uuid OR name IN ('Guests & Credentials', 'Comps and Ticketing'))
  ORDER BY (id = '30300000-0000-4000-8000-00000000000a'::uuid) DESC, (name = 'Guests & Credentials') DESC, array_position(ARRAY['Guests & Credentials', 'Comps and Ticketing']::text[], name), created_at
  LIMIT 1;
  IF v_id IS NULL THEN
    INSERT INTO public.advance_templates (id, workspace_id, template_type, name, description, icon, fields)
    VALUES ('30300000-0000-4000-8000-00000000000a'::uuid, NULL, 'section', 'Guests & Credentials', 'Guest list allocation, collection, passes', 'id-card', '[]'::jsonb)
    ON CONFLICT (id) DO NOTHING;
    v_id := '30300000-0000-4000-8000-00000000000a'::uuid;
  END IF;
  UPDATE public.advance_templates SET
    name = 'Guests & Credentials', description = 'Guest list allocation, collection, passes', icon = 'id-card',
    fields = '[{"id":"artist_comps","label":"Guest list allocation","type":"number"},{"id":"support_guest_allocation","label":"Shared with support? Their allocation","type":"text"},{"id":"digital_or_box_office","label":"Guests collect from","type":"text","placeholder":"Box office, digital, guest list window"},{"id":"send_guest_list_to","label":"Send the guest list to","type":"email"},{"id":"credential_distribution_location","label":"Passes picked up at","type":"text"}]'::jsonb,
    tm_only = false, show_when = NULL::jsonb, sort_order = 9
  WHERE id = v_id
    AND (name, description, icon, fields, tm_only, show_when, sort_order)
      IS DISTINCT FROM ('Guests & Credentials', 'Guest list allocation, collection, passes', 'id-card', '[{"id":"artist_comps","label":"Guest list allocation","type":"number"},{"id":"support_guest_allocation","label":"Shared with support? Their allocation","type":"text"},{"id":"digital_or_box_office","label":"Guests collect from","type":"text","placeholder":"Box office, digital, guest list window"},{"id":"send_guest_list_to","label":"Send the guest list to","type":"email"},{"id":"credential_distribution_location","label":"Passes picked up at","type":"text"}]'::jsonb, false, NULL::jsonb, 9);
  -- Any other built-in row under these names (a double-pasted seed) goes.
  DELETE FROM public.advance_templates
  WHERE workspace_id IS NULL AND template_type = 'section' AND id <> v_id AND name IN ('Guests & Credentials', 'Comps and Ticketing');
END $$;

-- ---- Security & Safety (8 questions) — takes over: Security ----
DO $$
DECLARE v_id uuid;
BEGIN
  SELECT id INTO v_id FROM public.advance_templates
  WHERE workspace_id IS NULL AND template_type = 'section'
    AND (id = '30300000-0000-4000-8000-00000000000b'::uuid OR name IN ('Security & Safety', 'Security'))
  ORDER BY (id = '30300000-0000-4000-8000-00000000000b'::uuid) DESC, (name = 'Security & Safety') DESC, array_position(ARRAY['Security & Safety', 'Security']::text[], name), created_at
  LIMIT 1;
  IF v_id IS NULL THEN
    INSERT INTO public.advance_templates (id, workspace_id, template_type, name, description, icon, fields)
    VALUES ('30300000-0000-4000-8000-00000000000b'::uuid, NULL, 'section', 'Security & Safety', 'Barrier, entry screening, bags, re-entry, pit', 'shield', '[]'::jsonb)
    ON CONFLICT (id) DO NOTHING;
    v_id := '30300000-0000-4000-8000-00000000000b'::uuid;
  END IF;
  UPDATE public.advance_templates SET
    name = 'Security & Safety', description = 'Barrier, entry screening, bags, re-entry, pit', icon = 'shield',
    fields = '[{"id":"barrier_setup","label":"Barrier","type":"text"},{"id":"walk_through_scanners","label":"Walk-through scanners","type":"boolean"},{"id":"wanding","label":"Wanding","type":"boolean"},{"id":"bag_check","label":"Bag check","type":"boolean"},{"id":"bag_size_limit","label":"Bag size limit","type":"text"},{"id":"clear_bag_policy","label":"Clear-bag policy","type":"boolean"},{"id":"reentry_allowed","label":"Re-entry allowed","type":"boolean"},{"id":"pit_security_count","label":"Pit / stage-front security (how many)","type":"number"}]'::jsonb,
    tm_only = false, show_when = NULL::jsonb, sort_order = 10
  WHERE id = v_id
    AND (name, description, icon, fields, tm_only, show_when, sort_order)
      IS DISTINCT FROM ('Security & Safety', 'Barrier, entry screening, bags, re-entry, pit', 'shield', '[{"id":"barrier_setup","label":"Barrier","type":"text"},{"id":"walk_through_scanners","label":"Walk-through scanners","type":"boolean"},{"id":"wanding","label":"Wanding","type":"boolean"},{"id":"bag_check","label":"Bag check","type":"boolean"},{"id":"bag_size_limit","label":"Bag size limit","type":"text"},{"id":"clear_bag_policy","label":"Clear-bag policy","type":"boolean"},{"id":"reentry_allowed","label":"Re-entry allowed","type":"boolean"},{"id":"pit_security_count","label":"Pit / stage-front security (how many)","type":"number"}]'::jsonb, false, NULL::jsonb, 10);
  -- Any other built-in row under these names (a double-pasted seed) goes.
  DELETE FROM public.advance_templates
  WHERE workspace_id IS NULL AND template_type = 'section' AND id <> v_id AND name IN ('Security & Safety', 'Security');
END $$;

-- ---- Weather & Outdoor (5 questions) — takes over: Outdoor Venue and Final Confirmation ----
DO $$
DECLARE v_id uuid;
BEGIN
  SELECT id INTO v_id FROM public.advance_templates
  WHERE workspace_id IS NULL AND template_type = 'section'
    AND (id = '30300000-0000-4000-8000-00000000000c'::uuid OR name IN ('Weather & Outdoor', 'Outdoor Venue and Final Confirmation'))
  ORDER BY (id = '30300000-0000-4000-8000-00000000000c'::uuid) DESC, (name = 'Weather & Outdoor') DESC, array_position(ARRAY['Weather & Outdoor', 'Outdoor Venue and Final Confirmation']::text[], name), created_at
  LIMIT 1;
  IF v_id IS NULL THEN
    INSERT INTO public.advance_templates (id, workspace_id, template_type, name, description, icon, fields)
    VALUES ('30300000-0000-4000-8000-00000000000c'::uuid, NULL, 'section', 'Weather & Outdoor', 'Shown when the show is outdoor or covered: cover, stop rules, ground', 'cloud-rain', '[]'::jsonb)
    ON CONFLICT (id) DO NOTHING;
    v_id := '30300000-0000-4000-8000-00000000000c'::uuid;
  END IF;
  UPDATE public.advance_templates SET
    name = 'Weather & Outdoor', description = 'Shown when the show is outdoor or covered: cover, stop rules, ground', icon = 'cloud-rain',
    fields = '[{"id":"rain_plan","label":"Rain and cover plan","type":"textarea"},{"id":"lightning_protocol","label":"Lightning / high-wind stop rules","type":"textarea"},{"id":"severe_weather_shelter","label":"Shelter","type":"text"},{"id":"ground_conditions_towing_plan","label":"Ground conditions","type":"textarea","placeholder":"Trackway, towing"},{"id":"cancellation_decision_authority","label":"Weather show-stop contact","type":"text"}]'::jsonb,
    tm_only = false, show_when = '{"field":"indoor_outdoor","in":["Outdoor","Covered"]}'::jsonb, sort_order = 11
  WHERE id = v_id
    AND (name, description, icon, fields, tm_only, show_when, sort_order)
      IS DISTINCT FROM ('Weather & Outdoor', 'Shown when the show is outdoor or covered: cover, stop rules, ground', 'cloud-rain', '[{"id":"rain_plan","label":"Rain and cover plan","type":"textarea"},{"id":"lightning_protocol","label":"Lightning / high-wind stop rules","type":"textarea"},{"id":"severe_weather_shelter","label":"Shelter","type":"text"},{"id":"ground_conditions_towing_plan","label":"Ground conditions","type":"textarea","placeholder":"Trackway, towing"},{"id":"cancellation_decision_authority","label":"Weather show-stop contact","type":"text"}]'::jsonb, false, '{"field":"indoor_outdoor","in":["Outdoor","Covered"]}'::jsonb, 11);
  -- Any other built-in row under these names (a double-pasted seed) goes.
  DELETE FROM public.advance_templates
  WHERE workspace_id IS NULL AND template_type = 'section' AND id <> v_id AND name IN ('Weather & Outdoor', 'Outdoor Venue and Final Confirmation');
END $$;

-- ---- Festival (4 questions) — new ----
DO $$
DECLARE v_id uuid;
BEGIN
  SELECT id INTO v_id FROM public.advance_templates
  WHERE workspace_id IS NULL AND template_type = 'section'
    AND (id = '30300000-0000-4000-8000-00000000000f'::uuid OR name IN ('Festival'))
  ORDER BY (id = '30300000-0000-4000-8000-00000000000f'::uuid) DESC, (name = 'Festival') DESC, array_position(ARRAY['Festival']::text[], name), created_at
  LIMIT 1;
  IF v_id IS NULL THEN
    INSERT INTO public.advance_templates (id, workspace_id, template_type, name, description, icon, fields)
    VALUES ('30300000-0000-4000-8000-00000000000f'::uuid, NULL, 'section', 'Festival', 'Getting to stage, artist transport, the catering system', 'tent', '[]'::jsonb)
    ON CONFLICT (id) DO NOTHING;
    v_id := '30300000-0000-4000-8000-00000000000f'::uuid;
  END IF;
  UPDATE public.advance_templates SET
    name = 'Festival', description = 'Getting to stage, artist transport, the catering system', icon = 'tent',
    fields = '[{"id":"getting_to_stage","label":"Getting to stage","type":"text","placeholder":"Shuttle, golf cart, walk"},{"id":"artist_transport_booked_through","label":"Artist transport booked through","type":"text"},{"id":"catering_system","label":"Catering system","type":"select","options":["Tokens","Buffet","Buyout","Artist catering"]},{"id":"meal_numbers_confirmed","label":"Our meal numbers confirmed for every meal","type":"boolean"}]'::jsonb,
    tm_only = false, show_when = NULL::jsonb, sort_order = 12
  WHERE id = v_id
    AND (name, description, icon, fields, tm_only, show_when, sort_order)
      IS DISTINCT FROM ('Festival', 'Getting to stage, artist transport, the catering system', 'tent', '[{"id":"getting_to_stage","label":"Getting to stage","type":"text","placeholder":"Shuttle, golf cart, walk"},{"id":"artist_transport_booked_through","label":"Artist transport booked through","type":"text"},{"id":"catering_system","label":"Catering system","type":"select","options":["Tokens","Buffet","Buyout","Artist catering"]},{"id":"meal_numbers_confirmed","label":"Our meal numbers confirmed for every meal","type":"boolean"}]'::jsonb, false, NULL::jsonb, 12);
  -- Any other built-in row under these names (a double-pasted seed) goes.
  DELETE FROM public.advance_templates
  WHERE workspace_id IS NULL AND template_type = 'section' AND id <> v_id AND name IN ('Festival');
END $$;

-- ---- Local Info (6 questions) — takes over: Local Info ----
DO $$
DECLARE v_id uuid;
BEGIN
  SELECT id INTO v_id FROM public.advance_templates
  WHERE workspace_id IS NULL AND template_type = 'section'
    AND (id = '30300000-0000-4000-8000-00000000000d'::uuid OR name IN ('Local Info'))
  ORDER BY (id = '30300000-0000-4000-8000-00000000000d'::uuid) DESC, (name = 'Local Info') DESC, array_position(ARRAY['Local Info']::text[], name), created_at
  LIMIT 1;
  IF v_id IS NULL THEN
    INSERT INTO public.advance_templates (id, workspace_id, template_type, name, description, icon, fields)
    VALUES ('30300000-0000-4000-8000-00000000000d'::uuid, NULL, 'section', 'Local Info', 'Hospital, pharmacy, food, laundry, gym', 'map-pin', '[]'::jsonb)
    ON CONFLICT (id) DO NOTHING;
    v_id := '30300000-0000-4000-8000-00000000000d'::uuid;
  END IF;
  UPDATE public.advance_templates SET
    name = 'Local Info', description = 'Hospital, pharmacy, food, laundry, gym', icon = 'map-pin',
    fields = '[{"id":"nearest_hospital","label":"Nearest hospital / A&E","type":"text"},{"id":"nearest_pharmacy","label":"Nearest pharmacy","type":"text"},{"id":"nearest_grocery_store","label":"Nearest supermarket","type":"text"},{"id":"local_restaurants","label":"Food nearby","type":"textarea"},{"id":"laundromat","label":"Laundrette","type":"text"},{"id":"gym_nearby","label":"Gym","type":"text"}]'::jsonb,
    tm_only = false, show_when = NULL::jsonb, sort_order = 13
  WHERE id = v_id
    AND (name, description, icon, fields, tm_only, show_when, sort_order)
      IS DISTINCT FROM ('Local Info', 'Hospital, pharmacy, food, laundry, gym', 'map-pin', '[{"id":"nearest_hospital","label":"Nearest hospital / A&E","type":"text"},{"id":"nearest_pharmacy","label":"Nearest pharmacy","type":"text"},{"id":"nearest_grocery_store","label":"Nearest supermarket","type":"text"},{"id":"local_restaurants","label":"Food nearby","type":"textarea"},{"id":"laundromat","label":"Laundrette","type":"text"},{"id":"gym_nearby","label":"Gym","type":"text"}]'::jsonb, false, NULL::jsonb, 13);
  -- Any other built-in row under these names (a double-pasted seed) goes.
  DELETE FROM public.advance_templates
  WHERE workspace_id IS NULL AND template_type = 'section' AND id <> v_id AND name IN ('Local Info');
END $$;

-- ---- Documents Received (6 questions) — takes over: Documents and Maps ----
DO $$
DECLARE v_id uuid;
BEGIN
  SELECT id INTO v_id FROM public.advance_templates
  WHERE workspace_id IS NULL AND template_type = 'section'
    AND (id = '30300000-0000-4000-8000-00000000000e'::uuid OR name IN ('Documents Received', 'Documents and Maps'))
  ORDER BY (id = '30300000-0000-4000-8000-00000000000e'::uuid) DESC, (name = 'Documents Received') DESC, array_position(ARRAY['Documents Received', 'Documents and Maps']::text[], name), created_at
  LIMIT 1;
  IF v_id IS NULL THEN
    INSERT INTO public.advance_templates (id, workspace_id, template_type, name, description, icon, fields)
    VALUES ('30300000-0000-4000-8000-00000000000e'::uuid, NULL, 'section', 'Documents Received', 'What the venue has sent you', 'file-check', '[]'::jsonb)
    ON CONFLICT (id) DO NOTHING;
    v_id := '30300000-0000-4000-8000-00000000000e'::uuid;
  END IF;
  UPDATE public.advance_templates SET
    name = 'Documents Received', description = 'What the venue has sent you', icon = 'file-check',
    fields = '[{"id":"venue_tech_pack_received","label":"Tech pack","type":"boolean"},{"id":"venue_map_received","label":"Venue / site map","type":"boolean"},{"id":"bus_trailer_parking_map_received","label":"Parking map","type":"boolean"},{"id":"hospitality_information_received","label":"Hospitality info","type":"boolean"},{"id":"house_security_protocol_received","label":"House security info","type":"boolean"},{"id":"final_run_of_show_received","label":"Final run of show","type":"boolean"}]'::jsonb,
    tm_only = true, show_when = NULL::jsonb, sort_order = 14
  WHERE id = v_id
    AND (name, description, icon, fields, tm_only, show_when, sort_order)
      IS DISTINCT FROM ('Documents Received', 'What the venue has sent you', 'file-check', '[{"id":"venue_tech_pack_received","label":"Tech pack","type":"boolean"},{"id":"venue_map_received","label":"Venue / site map","type":"boolean"},{"id":"bus_trailer_parking_map_received","label":"Parking map","type":"boolean"},{"id":"hospitality_information_received","label":"Hospitality info","type":"boolean"},{"id":"house_security_protocol_received","label":"House security info","type":"boolean"},{"id":"final_run_of_show_received","label":"Final run of show","type":"boolean"}]'::jsonb, true, NULL::jsonb, 14);
  -- Any other built-in row under these names (a double-pasted seed) goes.
  DELETE FROM public.advance_templates
  WHERE workspace_id IS NULL AND template_type = 'section' AND id <> v_id AND name IN ('Documents Received', 'Documents and Maps');
END $$;

-- 4. ------------------------------------------------------------------------
DELETE FROM public.advance_templates
WHERE workspace_id IS NULL AND template_type = 'section'
  AND name IN ('Venue Info', 'Settlement', 'Deal Info', 'Hotel', 'Flights', 'Driver and Hotels', 'Personal Vehicle Parking', 'Venue Amenities', 'Airport and Local Distances')
  AND name NOT IN ('Key Contacts', 'Key Contacts', 'Show', 'Event Basics', 'Schedule', 'Schedule', 'Arrival & Parking', 'Bus and Trailer', 'Transport', 'Production', 'Production', 'Dressing Rooms', 'Dressing Rooms', 'Catering & Hospitality', 'Hospitality', 'Runner', 'Runner', 'Merch', 'Merch', 'Guests & Credentials', 'Comps and Ticketing', 'Security & Safety', 'Security', 'Weather & Outdoor', 'Outdoor Venue and Final Confirmation', 'Festival', 'Local Info', 'Local Info', 'Documents Received', 'Documents and Maps');

-- 5. ------------------------------------------------------------------------
-- ---- Headline show day: 14 sections ----
WITH comp AS (
  SELECT jsonb_agg(
    jsonb_build_object('template_id', t.id::text, 'label', t.name, 'fields', t.fields, 'order', v.ord)
      || CASE WHEN t.tm_only THEN '{"tm_only": true}'::jsonb ELSE '{}'::jsonb END
      || CASE WHEN NOT v.always AND t.show_when IS NOT NULL THEN jsonb_build_object('show_when', t.show_when) ELSE '{}'::jsonb END
    ORDER BY v.ord) AS sections
  FROM (VALUES
    (0, 'Key Contacts', false),
    (1, 'Show', false),
    (2, 'Schedule', false),
    (3, 'Arrival & Parking', false),
    (4, 'Production', false),
    (5, 'Dressing Rooms', false),
    (6, 'Catering & Hospitality', false),
    (7, 'Runner', false),
    (8, 'Merch', false),
    (9, 'Guests & Credentials', false),
    (10, 'Security & Safety', false),
    (11, 'Weather & Outdoor', false),
    (12, 'Local Info', false),
    (13, 'Documents Received', false)
  ) AS v(ord, name, always)
  JOIN public.advance_templates t
    ON t.workspace_id IS NULL AND t.template_type = 'section' AND t.name = v.name
)
UPDATE public.advance_layout_templates l
SET sections = comp.sections, updated_at = now()
FROM comp
WHERE lower(trim(l.name)) = lower('Headline show day')
  AND l.sections IS DISTINCT FROM comp.sections;

-- ---- Support show day: 9 sections ----
WITH comp AS (
  SELECT jsonb_agg(
    jsonb_build_object('template_id', t.id::text, 'label', t.name, 'fields', t.fields, 'order', v.ord)
      || CASE WHEN t.tm_only THEN '{"tm_only": true}'::jsonb ELSE '{}'::jsonb END
      || CASE WHEN NOT v.always AND t.show_when IS NOT NULL THEN jsonb_build_object('show_when', t.show_when) ELSE '{}'::jsonb END
    ORDER BY v.ord) AS sections
  FROM (VALUES
    (0, 'Key Contacts', false),
    (1, 'Schedule', false),
    (2, 'Arrival & Parking', false),
    (3, 'Production', false),
    (4, 'Dressing Rooms', false),
    (5, 'Catering & Hospitality', false),
    (6, 'Merch', false),
    (7, 'Guests & Credentials', false),
    (8, 'Documents Received', false)
  ) AS v(ord, name, always)
  JOIN public.advance_templates t
    ON t.workspace_id IS NULL AND t.template_type = 'section' AND t.name = v.name
)
UPDATE public.advance_layout_templates l
SET sections = comp.sections, updated_at = now()
FROM comp
WHERE lower(trim(l.name)) = lower('Support show day')
  AND l.sections IS DISTINCT FROM comp.sections;

-- ---- Festival day: 13 sections ----
WITH comp AS (
  SELECT jsonb_agg(
    jsonb_build_object('template_id', t.id::text, 'label', t.name, 'fields', t.fields, 'order', v.ord)
      || CASE WHEN t.tm_only THEN '{"tm_only": true}'::jsonb ELSE '{}'::jsonb END
      || CASE WHEN NOT v.always AND t.show_when IS NOT NULL THEN jsonb_build_object('show_when', t.show_when) ELSE '{}'::jsonb END
    ORDER BY v.ord) AS sections
  FROM (VALUES
    (0, 'Key Contacts', false),
    (1, 'Show', false),
    (2, 'Schedule', false),
    (3, 'Arrival & Parking', false),
    (4, 'Production', false),
    (5, 'Dressing Rooms', false),
    (6, 'Catering & Hospitality', false),
    (7, 'Festival', false),
    (8, 'Guests & Credentials', false),
    (9, 'Security & Safety', false),
    (10, 'Weather & Outdoor', true),
    (11, 'Local Info', false),
    (12, 'Documents Received', false)
  ) AS v(ord, name, always)
  JOIN public.advance_templates t
    ON t.workspace_id IS NULL AND t.template_type = 'section' AND t.name = v.name
)
UPDATE public.advance_layout_templates l
SET sections = comp.sections, updated_at = now()
FROM comp
WHERE lower(trim(l.name)) = lower('Festival day')
  AND l.sections IS DISTINCT FROM comp.sections;

-- ---- Day off: 1 sections ----
WITH comp AS (
  SELECT jsonb_agg(
    jsonb_build_object('template_id', t.id::text, 'label', t.name, 'fields', t.fields, 'order', v.ord)
      || CASE WHEN t.tm_only THEN '{"tm_only": true}'::jsonb ELSE '{}'::jsonb END
      || CASE WHEN NOT v.always AND t.show_when IS NOT NULL THEN jsonb_build_object('show_when', t.show_when) ELSE '{}'::jsonb END
    ORDER BY v.ord) AS sections
  FROM (VALUES
    (0, 'Local Info', false)
  ) AS v(ord, name, always)
  JOIN public.advance_templates t
    ON t.workspace_id IS NULL AND t.template_type = 'section' AND t.name = v.name
)
UPDATE public.advance_layout_templates l
SET sections = comp.sections, updated_at = now()
FROM comp
WHERE lower(trim(l.name)) = lower('Day off')
  AND l.sections IS DISTINCT FROM comp.sections;

UPDATE public.advance_form_configs c
SET sections = l.sections, customised = false
FROM public.advance_layout_templates l
WHERE c.layout_template_id = l.id
  AND lower(trim(l.name)) IN ('headline show day', 'support show day', 'festival day', 'day off')
  AND (c.sections IS DISTINCT FROM l.sections OR c.customised);

-- 6. Report (read-only): templates and days NOT rebuilt above. -------------
SELECT 'template not rebuilt (not a starter name)' AS what, l.name AS detail, count(c.id) AS days
FROM public.advance_layout_templates l
LEFT JOIN public.advance_form_configs c ON c.layout_template_id = l.id
WHERE lower(trim(l.name)) NOT IN ('headline show day', 'support show day', 'festival day', 'day off')
GROUP BY l.name
UNION ALL
SELECT 'day with no template', NULL, count(*)
FROM public.advance_form_configs
WHERE layout_template_id IS NULL;

-- ============================================
-- DOWN (manual): not reversible in place — the old catalogue rows were
-- rewritten. To roll back, re-paste 259 (it re-adds its sections by name) and
-- rebuild templates by hand. show_when can be dropped:
--   ALTER TABLE public.advance_templates DROP COLUMN IF EXISTS show_when;
-- ============================================
