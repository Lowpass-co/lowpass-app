-- ============================================
-- LOWPASS — Rider-centric template re-seed
-- Migration 263
-- ============================================
--
-- Adam: "The rider pre-set fields are very advance centric, and not
-- very rider centric." The 111/258 platform rider_section_templates
-- were seeded from a venue-ADVANCE catalog — fields like "Wi-Fi
-- available", "On-site washer", "Nearest hospital" are questions a
-- VENUE answers during an advance. A rider is what an ARTIST sends:
-- demands and specs ("24 x still water", "Barricade required",
-- "Buyout $25/head"). This migration re-seeds the rider library as
-- artist demands.
--
-- Content changes:
--   * 9 existing platform templates REWRITTEN in place (UPDATE keyed
--     on workspace_id IS NULL + template_type — platform rows have no
--     fixed ids; 111 seeded them with gen_random_uuid(), and
--     rst_platform_type_uniq guarantees one platform row per type):
--       hospitality  -> "Hospitality Rider"   (dressing room stock demands)
--       catering     -> "Catering / Buyout"   (meal counts, dietary, buyout)
--       backline     -> "Backline"            (specs + venue-provides vs carried)
--       audio        -> "Audio / PA"          (PA spec, desk prefs, mic package)
--       lighting     -> "Lighting"            (floor package, haze, ops)
--       security     -> "Security & Barricade"
--       merch        -> "Merch"               (seller, rate %, table/lighting)
--       parking      -> "Parking & Access"    (bus/trailer spaces, shore power)
--       production   -> "Production Office"   (was the advance-centric
--                       "Production & Amenities" — the named offender)
--   * 4 NEW platform types INSERTED with fixed UUIDs (26300000-...),
--     sort_order 180-210 continuing after local_crew at 170:
--       dressing_rooms, towels_laundry, bus_stock, guest_list
--   * Untouched: contacts, schedule, monitoring, risers, transport,
--     labour, press_promo, local_crew (already artist/TM-framed).
--   * User-created (workspace_id NOT NULL) rows are never touched.
--
-- Field vocabulary matches the 111/258 seeds (contact / time / text /
-- textarea / number / boolean / currency). Per-line stock demands use
-- `boolean` deliberately: RiderSectionBuilder's toRiderFieldType()
-- maps boolean -> a single-item checkbox_list at drop time, so each
-- demand line becomes a tickable checklist item. `checkbox_list` is
-- NOT used in seeds because template field descriptors carry no
-- `items` payload (templateFieldToRiderField would seed it empty).
--
-- HAND-PASTE: pasted by hand into the Supabase SQL editor (no runner,
-- no tracking table). Every statement is idempotent — a full re-paste
-- is a no-op / self-correcting:
--   * rewrites are UPDATEs guarded by fields <> target;
--   * new types are INSERT .. SELECT with a fixed id, guarded by
--     NOT EXISTS on (workspace_id IS NULL AND template_type), plus
--     ON CONFLICT (id) DO NOTHING as a belt-and-braces re-run guard.
--
-- WARNING: do NOT re-paste 258 after this file — 258's fields<>guard
-- would see the 263 content as drift and revert the 9 rewritten
-- templates to their advance-centric field lists.
--
-- Depends on: 111_rider_architecture_mirror.sql,
--             258_rider_template_field_depth.sql.
-- Companion src change: src/lib/rider-packs/groups.ts maps the four
-- new template types into builder groups.
-- Down-migration block at the end.
-- ============================================

-- ---- rewrite: hospitality -> Hospitality Rider (15 fields) ----
UPDATE public.rider_section_templates
SET name = 'Hospitality Rider',
    description = 'Dressing room drinks and snacks the artist requires stocked',
    fields = '[
  {"id": "still_water", "label": "24 x still water (500ml, room temp)", "type": "boolean"},
  {"id": "sparkling_water", "label": "12 x sparkling water", "type": "boolean"},
  {"id": "local_beer", "label": "24 x local beer (bottles, iced)", "type": "boolean"},
  {"id": "red_wine", "label": "2 x red wine (drinkable, not cooking grade)", "type": "boolean"},
  {"id": "spirits", "label": "Spirits (brand + qty)", "type": "text"},
  {"id": "soft_drinks", "label": "Assorted soft drinks + mixers", "type": "boolean"},
  {"id": "coffee_tea", "label": "Coffee, tea, kettle, honey + lemon", "type": "boolean"},
  {"id": "fresh_fruit", "label": "Fresh fruit platter", "type": "boolean"},
  {"id": "veg_platter", "label": "Veg + hummus platter", "type": "boolean"},
  {"id": "deli_tray", "label": "Bread, cold cuts + cheese", "type": "boolean"},
  {"id": "snacks", "label": "Savoury snacks (crisps, nuts, dark chocolate)", "type": "boolean"},
  {"id": "ice", "label": "2 x bags ice", "type": "boolean"},
  {"id": "fridge", "label": "Fridge in dressing room", "type": "boolean"},
  {"id": "towels_count", "label": "Clean towels (count)", "type": "number"},
  {"id": "hospitality_notes", "label": "Allergies / substitutions", "type": "textarea"}
]'::jsonb,
    updated_at = now()
WHERE workspace_id IS NULL
  AND template_type = 'hospitality'
  AND fields <> '[
  {"id": "still_water", "label": "24 x still water (500ml, room temp)", "type": "boolean"},
  {"id": "sparkling_water", "label": "12 x sparkling water", "type": "boolean"},
  {"id": "local_beer", "label": "24 x local beer (bottles, iced)", "type": "boolean"},
  {"id": "red_wine", "label": "2 x red wine (drinkable, not cooking grade)", "type": "boolean"},
  {"id": "spirits", "label": "Spirits (brand + qty)", "type": "text"},
  {"id": "soft_drinks", "label": "Assorted soft drinks + mixers", "type": "boolean"},
  {"id": "coffee_tea", "label": "Coffee, tea, kettle, honey + lemon", "type": "boolean"},
  {"id": "fresh_fruit", "label": "Fresh fruit platter", "type": "boolean"},
  {"id": "veg_platter", "label": "Veg + hummus platter", "type": "boolean"},
  {"id": "deli_tray", "label": "Bread, cold cuts + cheese", "type": "boolean"},
  {"id": "snacks", "label": "Savoury snacks (crisps, nuts, dark chocolate)", "type": "boolean"},
  {"id": "ice", "label": "2 x bags ice", "type": "boolean"},
  {"id": "fridge", "label": "Fridge in dressing room", "type": "boolean"},
  {"id": "towels_count", "label": "Clean towels (count)", "type": "number"},
  {"id": "hospitality_notes", "label": "Allergies / substitutions", "type": "textarea"}
]'::jsonb;

-- ---- rewrite: catering -> Catering / Buyout (13 fields) ----
UPDATE public.rider_section_templates
SET name = 'Catering / Buyout',
    description = 'Hot meal counts, dietary counts, meal times, buyout per head',
    fields = '[
  {"id": "hot_meal_count", "label": "Hot meals required", "type": "number"},
  {"id": "dinner_time", "label": "Dinner served by", "type": "time"},
  {"id": "lunch_required", "label": "Lunch required", "type": "boolean"},
  {"id": "lunch_time", "label": "Lunch served by", "type": "time"},
  {"id": "vegan_count", "label": "Vegan meals", "type": "number"},
  {"id": "vegetarian_count", "label": "Vegetarian meals", "type": "number"},
  {"id": "gluten_free_count", "label": "Gluten-free meals", "type": "number"},
  {"id": "allergies", "label": "Allergies (strict)", "type": "textarea"},
  {"id": "buyout_accepted", "label": "Buyout accepted in lieu of hot meal", "type": "boolean"},
  {"id": "buyout_per_person", "label": "Buyout per person", "type": "currency"},
  {"id": "driver_meal", "label": "Driver fed after sleep", "type": "boolean"},
  {"id": "after_show_food", "label": "After-show food to bus (pizzas / sandwiches)", "type": "textarea"},
  {"id": "catering_notes", "label": "Catering notes", "type": "textarea"}
]'::jsonb,
    updated_at = now()
WHERE workspace_id IS NULL
  AND template_type = 'catering'
  AND fields <> '[
  {"id": "hot_meal_count", "label": "Hot meals required", "type": "number"},
  {"id": "dinner_time", "label": "Dinner served by", "type": "time"},
  {"id": "lunch_required", "label": "Lunch required", "type": "boolean"},
  {"id": "lunch_time", "label": "Lunch served by", "type": "time"},
  {"id": "vegan_count", "label": "Vegan meals", "type": "number"},
  {"id": "vegetarian_count", "label": "Vegetarian meals", "type": "number"},
  {"id": "gluten_free_count", "label": "Gluten-free meals", "type": "number"},
  {"id": "allergies", "label": "Allergies (strict)", "type": "textarea"},
  {"id": "buyout_accepted", "label": "Buyout accepted in lieu of hot meal", "type": "boolean"},
  {"id": "buyout_per_person", "label": "Buyout per person", "type": "currency"},
  {"id": "driver_meal", "label": "Driver fed after sleep", "type": "boolean"},
  {"id": "after_show_food", "label": "After-show food to bus (pizzas / sandwiches)", "type": "textarea"},
  {"id": "catering_notes", "label": "Catering notes", "type": "textarea"}
]'::jsonb;

-- ---- rewrite: backline -> Backline (15 fields) ----
UPDATE public.rider_section_templates
SET name = 'Backline',
    description = 'Backline specs — what the venue provides vs what the artist carries',
    fields = '[
  {"id": "drums_spec", "label": "Drum kit spec (venue to provide)", "type": "textarea"},
  {"id": "drums_carried", "label": "Drums carried by artist", "type": "boolean"},
  {"id": "breakables_carried", "label": "Breakables carried (snare, cymbals, pedals)", "type": "boolean"},
  {"id": "guitar_amp_spec", "label": "Guitar amp spec (venue to provide)", "type": "textarea"},
  {"id": "bass_amp_spec", "label": "Bass amp spec (venue to provide)", "type": "textarea"},
  {"id": "amps_carried", "label": "Amps carried by artist", "type": "boolean"},
  {"id": "keys_spec", "label": "Keys spec (venue to provide)", "type": "textarea"},
  {"id": "keys_carried", "label": "Keys carried by artist", "type": "boolean"},
  {"id": "dj_spec", "label": "DJ spec (venue to provide)", "type": "textarea"},
  {"id": "guitar_stands", "label": "Guitar stands", "type": "number"},
  {"id": "music_stands", "label": "Music stands", "type": "number"},
  {"id": "fresh_batteries", "label": "Fresh 9V / AA batteries at stage", "type": "boolean"},
  {"id": "backline_tech_required", "label": "Venue backline tech required", "type": "boolean"},
  {"id": "substitutions", "label": "Acceptable substitutions", "type": "textarea"},
  {"id": "backline_notes", "label": "Backline notes", "type": "textarea"}
]'::jsonb,
    updated_at = now()
WHERE workspace_id IS NULL
  AND template_type = 'backline'
  AND fields <> '[
  {"id": "drums_spec", "label": "Drum kit spec (venue to provide)", "type": "textarea"},
  {"id": "drums_carried", "label": "Drums carried by artist", "type": "boolean"},
  {"id": "breakables_carried", "label": "Breakables carried (snare, cymbals, pedals)", "type": "boolean"},
  {"id": "guitar_amp_spec", "label": "Guitar amp spec (venue to provide)", "type": "textarea"},
  {"id": "bass_amp_spec", "label": "Bass amp spec (venue to provide)", "type": "textarea"},
  {"id": "amps_carried", "label": "Amps carried by artist", "type": "boolean"},
  {"id": "keys_spec", "label": "Keys spec (venue to provide)", "type": "textarea"},
  {"id": "keys_carried", "label": "Keys carried by artist", "type": "boolean"},
  {"id": "dj_spec", "label": "DJ spec (venue to provide)", "type": "textarea"},
  {"id": "guitar_stands", "label": "Guitar stands", "type": "number"},
  {"id": "music_stands", "label": "Music stands", "type": "number"},
  {"id": "fresh_batteries", "label": "Fresh 9V / AA batteries at stage", "type": "boolean"},
  {"id": "backline_tech_required", "label": "Venue backline tech required", "type": "boolean"},
  {"id": "substitutions", "label": "Acceptable substitutions", "type": "textarea"},
  {"id": "backline_notes", "label": "Backline notes", "type": "textarea"}
]'::jsonb;

-- ---- rewrite: audio -> Audio / PA (14 fields) ----
UPDATE public.rider_section_templates
SET name = 'Audio / PA',
    description = 'PA spec, desk preferences, monitor world, mic package carried vs required',
    fields = '[
  {"id": "pa_spec", "label": "PA spec (pro-grade line array, full range, stereo)", "type": "textarea"},
  {"id": "pa_spl", "label": "Min SPL capability at mix position", "type": "text"},
  {"id": "foh_desk_pref", "label": "FOH desk preference (in order)", "type": "text"},
  {"id": "foh_desk_unacceptable", "label": "Desks NOT accepted", "type": "text"},
  {"id": "mon_desk_pref", "label": "Monitor desk preference", "type": "text"},
  {"id": "mixes_required", "label": "Monitor mixes required", "type": "number"},
  {"id": "wedges_required", "label": "Wedges required", "type": "number"},
  {"id": "iems_carried", "label": "IEMs carried by artist", "type": "boolean"},
  {"id": "mic_package_carried", "label": "Mic package carried by artist", "type": "boolean"},
  {"id": "mics_required", "label": "Mics / DIs required from venue", "type": "textarea"},
  {"id": "stands_required", "label": "Stands required from venue", "type": "textarea"},
  {"id": "foh_engineer_travels", "label": "FOH engineer travels with artist", "type": "boolean"},
  {"id": "soundcheck_minutes", "label": "Soundcheck time required (minutes)", "type": "number"},
  {"id": "audio_notes", "label": "Audio notes", "type": "textarea"}
]'::jsonb,
    updated_at = now()
WHERE workspace_id IS NULL
  AND template_type = 'audio'
  AND fields <> '[
  {"id": "pa_spec", "label": "PA spec (pro-grade line array, full range, stereo)", "type": "textarea"},
  {"id": "pa_spl", "label": "Min SPL capability at mix position", "type": "text"},
  {"id": "foh_desk_pref", "label": "FOH desk preference (in order)", "type": "text"},
  {"id": "foh_desk_unacceptable", "label": "Desks NOT accepted", "type": "text"},
  {"id": "mon_desk_pref", "label": "Monitor desk preference", "type": "text"},
  {"id": "mixes_required", "label": "Monitor mixes required", "type": "number"},
  {"id": "wedges_required", "label": "Wedges required", "type": "number"},
  {"id": "iems_carried", "label": "IEMs carried by artist", "type": "boolean"},
  {"id": "mic_package_carried", "label": "Mic package carried by artist", "type": "boolean"},
  {"id": "mics_required", "label": "Mics / DIs required from venue", "type": "textarea"},
  {"id": "stands_required", "label": "Stands required from venue", "type": "textarea"},
  {"id": "foh_engineer_travels", "label": "FOH engineer travels with artist", "type": "boolean"},
  {"id": "soundcheck_minutes", "label": "Soundcheck time required (minutes)", "type": "number"},
  {"id": "audio_notes", "label": "Audio notes", "type": "textarea"}
]'::jsonb;

-- ---- rewrite: lighting -> Lighting (12 fields) ----
UPDATE public.rider_section_templates
SET name = 'Lighting',
    description = 'Floor package, haze, operators — the artist''s lighting demands',
    fields = '[
  {"id": "house_rig_ok", "label": "House rig acceptable (with operator)", "type": "boolean"},
  {"id": "ld_travels", "label": "LD travels with artist", "type": "boolean"},
  {"id": "house_ld_required", "label": "House LD to operate if no LD travels", "type": "boolean"},
  {"id": "floor_package", "label": "Floor package carried (artist)", "type": "textarea"},
  {"id": "floor_power", "label": "Power for floor package (e.g. 1 x 16A)", "type": "text"},
  {"id": "haze_required", "label": "Haze required (water-based)", "type": "boolean"},
  {"id": "strobe_warning", "label": "Strobes used — venue to post warnings", "type": "boolean"},
  {"id": "followspots", "label": "Followspots required", "type": "number"},
  {"id": "focus_minutes", "label": "Focus / plot time required (minutes)", "type": "number"},
  {"id": "house_lights_cue", "label": "House lights on LD''s cue", "type": "boolean"},
  {"id": "backdrop_hang", "label": "Backdrop to be hung (artist carries)", "type": "boolean"},
  {"id": "lighting_notes", "label": "Lighting notes", "type": "textarea"}
]'::jsonb,
    updated_at = now()
WHERE workspace_id IS NULL
  AND template_type = 'lighting'
  AND fields <> '[
  {"id": "house_rig_ok", "label": "House rig acceptable (with operator)", "type": "boolean"},
  {"id": "ld_travels", "label": "LD travels with artist", "type": "boolean"},
  {"id": "house_ld_required", "label": "House LD to operate if no LD travels", "type": "boolean"},
  {"id": "floor_package", "label": "Floor package carried (artist)", "type": "textarea"},
  {"id": "floor_power", "label": "Power for floor package (e.g. 1 x 16A)", "type": "text"},
  {"id": "haze_required", "label": "Haze required (water-based)", "type": "boolean"},
  {"id": "strobe_warning", "label": "Strobes used — venue to post warnings", "type": "boolean"},
  {"id": "followspots", "label": "Followspots required", "type": "number"},
  {"id": "focus_minutes", "label": "Focus / plot time required (minutes)", "type": "number"},
  {"id": "house_lights_cue", "label": "House lights on LD''s cue", "type": "boolean"},
  {"id": "backdrop_hang", "label": "Backdrop to be hung (artist carries)", "type": "boolean"},
  {"id": "lighting_notes", "label": "Lighting notes", "type": "textarea"}
]'::jsonb;

-- ---- rewrite: security -> Security & Barricade (12 fields) ----
UPDATE public.rider_section_templates
SET name = 'Security & Barricade',
    description = 'Barricade, pit crew, escorts, lockdown — the artist''s security demands',
    fields = '[
  {"id": "barricade_required", "label": "Barricade required", "type": "boolean"},
  {"id": "pit_security_count", "label": "Pit security count", "type": "number"},
  {"id": "stage_stairs_posts", "label": "Posts at stage stairs (both sides)", "type": "boolean"},
  {"id": "dressing_room_post", "label": "Post at dressing room corridor", "type": "boolean"},
  {"id": "bus_overnight_security", "label": "Overnight security at bus / trailer", "type": "boolean"},
  {"id": "stage_escort", "label": "Artist escort to / from stage", "type": "boolean"},
  {"id": "backstage_lockdown", "label": "Backstage locked down from doors", "type": "boolean"},
  {"id": "security_briefing_time", "label": "Security briefing with TM", "type": "time"},
  {"id": "crowd_policy", "label": "Crowd surfing / mosh policy", "type": "text"},
  {"id": "barricade_water", "label": "Water at barricade for crowd", "type": "boolean"},
  {"id": "pass_system", "label": "Tour pass system honoured (AAA / working / guest)", "type": "textarea"},
  {"id": "security_notes", "label": "Security notes", "type": "textarea"}
]'::jsonb,
    updated_at = now()
WHERE workspace_id IS NULL
  AND template_type = 'security'
  AND fields <> '[
  {"id": "barricade_required", "label": "Barricade required", "type": "boolean"},
  {"id": "pit_security_count", "label": "Pit security count", "type": "number"},
  {"id": "stage_stairs_posts", "label": "Posts at stage stairs (both sides)", "type": "boolean"},
  {"id": "dressing_room_post", "label": "Post at dressing room corridor", "type": "boolean"},
  {"id": "bus_overnight_security", "label": "Overnight security at bus / trailer", "type": "boolean"},
  {"id": "stage_escort", "label": "Artist escort to / from stage", "type": "boolean"},
  {"id": "backstage_lockdown", "label": "Backstage locked down from doors", "type": "boolean"},
  {"id": "security_briefing_time", "label": "Security briefing with TM", "type": "time"},
  {"id": "crowd_policy", "label": "Crowd surfing / mosh policy", "type": "text"},
  {"id": "barricade_water", "label": "Water at barricade for crowd", "type": "boolean"},
  {"id": "pass_system", "label": "Tour pass system honoured (AAA / working / guest)", "type": "textarea"},
  {"id": "security_notes", "label": "Security notes", "type": "textarea"}
]'::jsonb;

-- ---- rewrite: merch -> Merch (12 fields) ----
UPDATE public.rider_section_templates
SET name = 'Merch',
    description = 'Seller, venue rate caps, stand setup — the artist''s merch demands',
    fields = '[
  {"id": "seller_provided", "label": "Venue to provide seller", "type": "boolean"},
  {"id": "artist_sells", "label": "Artist may sell own merch (no seller fee)", "type": "boolean"},
  {"id": "max_rate_soft", "label": "Max venue rate on soft goods (%)", "type": "number"},
  {"id": "max_rate_hard", "label": "Max venue rate on hard goods (%)", "type": "number"},
  {"id": "tables_required", "label": "Merch tables required (6ft)", "type": "number"},
  {"id": "lit_position", "label": "Well-lit, high-traffic position", "type": "boolean"},
  {"id": "power_at_stand", "label": "Power at merch stand", "type": "boolean"},
  {"id": "wifi_for_pos", "label": "Wi-Fi / signal for card POS", "type": "boolean"},
  {"id": "stand_security", "label": "Stand security during show", "type": "boolean"},
  {"id": "count_in_out", "label": "Count-in / count-out with venue rep", "type": "boolean"},
  {"id": "settle_night_of", "label": "Merch settled night-of", "type": "boolean"},
  {"id": "merch_notes", "label": "Merch notes", "type": "textarea"}
]'::jsonb,
    updated_at = now()
WHERE workspace_id IS NULL
  AND template_type = 'merch'
  AND fields <> '[
  {"id": "seller_provided", "label": "Venue to provide seller", "type": "boolean"},
  {"id": "artist_sells", "label": "Artist may sell own merch (no seller fee)", "type": "boolean"},
  {"id": "max_rate_soft", "label": "Max venue rate on soft goods (%)", "type": "number"},
  {"id": "max_rate_hard", "label": "Max venue rate on hard goods (%)", "type": "number"},
  {"id": "tables_required", "label": "Merch tables required (6ft)", "type": "number"},
  {"id": "lit_position", "label": "Well-lit, high-traffic position", "type": "boolean"},
  {"id": "power_at_stand", "label": "Power at merch stand", "type": "boolean"},
  {"id": "wifi_for_pos", "label": "Wi-Fi / signal for card POS", "type": "boolean"},
  {"id": "stand_security", "label": "Stand security during show", "type": "boolean"},
  {"id": "count_in_out", "label": "Count-in / count-out with venue rep", "type": "boolean"},
  {"id": "settle_night_of", "label": "Merch settled night-of", "type": "boolean"},
  {"id": "merch_notes", "label": "Merch notes", "type": "textarea"}
]'::jsonb;

-- ---- rewrite: parking -> Parking & Access (13 fields) ----
UPDATE public.rider_section_templates
SET name = 'Parking & Access',
    description = 'Bus / trailer spaces, shore power, load-in access the artist requires',
    fields = '[
  {"id": "bus_spaces", "label": "Bus spaces required", "type": "number"},
  {"id": "trailer_spaces", "label": "Trailer spaces required", "type": "number"},
  {"id": "van_car_spaces", "label": "Van / car spaces required", "type": "number"},
  {"id": "vehicle_dims", "label": "Vehicle dimensions (L x H)", "type": "text"},
  {"id": "shore_power", "label": "Shore power required (amperage / connector)", "type": "text"},
  {"id": "adjacent_load_in", "label": "Parking adjacent to load-in door", "type": "boolean"},
  {"id": "level_access", "label": "Level load-in (dock / ramp — no stairs)", "type": "boolean"},
  {"id": "early_access", "label": "Early bus arrival access (pre-9am)", "type": "boolean"},
  {"id": "overnight_parking", "label": "Overnight parking required", "type": "boolean"},
  {"id": "secured_overnight", "label": "Secured / attended overnight", "type": "boolean"},
  {"id": "water_fill", "label": "Bus water fill on site", "type": "boolean"},
  {"id": "passes_required", "label": "Parking passes required", "type": "number"},
  {"id": "access_notes", "label": "Access notes", "type": "textarea"}
]'::jsonb,
    updated_at = now()
WHERE workspace_id IS NULL
  AND template_type = 'parking'
  AND fields <> '[
  {"id": "bus_spaces", "label": "Bus spaces required", "type": "number"},
  {"id": "trailer_spaces", "label": "Trailer spaces required", "type": "number"},
  {"id": "van_car_spaces", "label": "Van / car spaces required", "type": "number"},
  {"id": "vehicle_dims", "label": "Vehicle dimensions (L x H)", "type": "text"},
  {"id": "shore_power", "label": "Shore power required (amperage / connector)", "type": "text"},
  {"id": "adjacent_load_in", "label": "Parking adjacent to load-in door", "type": "boolean"},
  {"id": "level_access", "label": "Level load-in (dock / ramp — no stairs)", "type": "boolean"},
  {"id": "early_access", "label": "Early bus arrival access (pre-9am)", "type": "boolean"},
  {"id": "overnight_parking", "label": "Overnight parking required", "type": "boolean"},
  {"id": "secured_overnight", "label": "Secured / attended overnight", "type": "boolean"},
  {"id": "water_fill", "label": "Bus water fill on site", "type": "boolean"},
  {"id": "passes_required", "label": "Parking passes required", "type": "number"},
  {"id": "access_notes", "label": "Access notes", "type": "textarea"}
]'::jsonb;

-- ---- rewrite: production -> Production Office (10 fields) ----
-- (was "Production & Amenities": "Wi-Fi available", "On-site washer" —
--  venue-advance questions. Now the artist's production office demands.)
UPDATE public.rider_section_templates
SET name = 'Production Office',
    description = 'Office, internet, printer — what production requires on the day',
    fields = '[
  {"id": "office_required", "label": "Lockable production office", "type": "boolean"},
  {"id": "office_furniture", "label": "2 x trestle tables, 4 x chairs", "type": "boolean"},
  {"id": "hardline_internet", "label": "Hardline internet in office", "type": "boolean"},
  {"id": "wifi_logins", "label": "Wi-Fi logins for touring party", "type": "number"},
  {"id": "printer_access", "label": "Printer / scanner access", "type": "boolean"},
  {"id": "power_strips", "label": "4 x power strips", "type": "boolean"},
  {"id": "near_stage", "label": "Office within easy reach of stage", "type": "boolean"},
  {"id": "office_key", "label": "Key to TM at load-in", "type": "boolean"},
  {"id": "consumables", "label": "Gaff, board tape, Sharpies, batteries stocked", "type": "boolean"},
  {"id": "production_notes", "label": "Production notes", "type": "textarea"}
]'::jsonb,
    updated_at = now()
WHERE workspace_id IS NULL
  AND template_type = 'production'
  AND fields <> '[
  {"id": "office_required", "label": "Lockable production office", "type": "boolean"},
  {"id": "office_furniture", "label": "2 x trestle tables, 4 x chairs", "type": "boolean"},
  {"id": "hardline_internet", "label": "Hardline internet in office", "type": "boolean"},
  {"id": "wifi_logins", "label": "Wi-Fi logins for touring party", "type": "number"},
  {"id": "printer_access", "label": "Printer / scanner access", "type": "boolean"},
  {"id": "power_strips", "label": "4 x power strips", "type": "boolean"},
  {"id": "near_stage", "label": "Office within easy reach of stage", "type": "boolean"},
  {"id": "office_key", "label": "Key to TM at load-in", "type": "boolean"},
  {"id": "consumables", "label": "Gaff, board tape, Sharpies, batteries stocked", "type": "boolean"},
  {"id": "production_notes", "label": "Production notes", "type": "textarea"}
]'::jsonb;

-- ---- new platform type: dressing_rooms (13 fields) ----
INSERT INTO public.rider_section_templates
  (id, workspace_id, template_type, name, description, icon, fields, sort_order)
SELECT '26300000-0000-4000-8000-000000000001'::uuid, NULL, 'dressing_rooms', 'Dressing Rooms',
  'Rooms, keys, mirrors, seating, private bathroom the artist requires', 'door-closed',
  '[
  {"id": "rooms_count", "label": "Dressing rooms required", "type": "number"},
  {"id": "room_capacity", "label": "Capacity per room (e.g. 8 + 4)", "type": "text"},
  {"id": "lockable_keys", "label": "Lockable — keys to TM at load-in", "type": "boolean"},
  {"id": "mirrors", "label": "Full-length mirror + lit makeup mirror", "type": "boolean"},
  {"id": "seating", "label": "Comfortable seating (sofa + chairs)", "type": "boolean"},
  {"id": "private_bathroom", "label": "Private bathroom with shower", "type": "boolean"},
  {"id": "hot_water", "label": "Hot water confirmed", "type": "boolean"},
  {"id": "climate_control", "label": "Heating / AC (controllable in room)", "type": "boolean"},
  {"id": "power_outlets", "label": "Ample power outlets", "type": "boolean"},
  {"id": "clothes_rack", "label": "Clothes rack + hangers", "type": "boolean"},
  {"id": "steamer", "label": "Garment steamer or iron + board", "type": "boolean"},
  {"id": "towels_count", "label": "Clean towels (count)", "type": "number"},
  {"id": "dressing_room_notes", "label": "Dressing room notes", "type": "textarea"}
]'::jsonb, 180
WHERE NOT EXISTS (
  SELECT 1 FROM public.rider_section_templates
  WHERE workspace_id IS NULL AND template_type = 'dressing_rooms'
)
ON CONFLICT (id) DO NOTHING;

-- ---- new platform type: towels_laundry (8 fields) ----
INSERT INTO public.rider_section_templates
  (id, workspace_id, template_type, name, description, icon, fields, sort_order)
SELECT '26300000-0000-4000-8000-000000000002'::uuid, NULL, 'towels_laundry', 'Towels & Laundry',
  'Show towel counts and laundry access the artist requires', 'shirt',
  '[
  {"id": "stage_towels", "label": "Black stage towels", "type": "number"},
  {"id": "shower_towels", "label": "Shower towels", "type": "number"},
  {"id": "towels_by_soundcheck", "label": "Towels in rooms by soundcheck", "type": "boolean"},
  {"id": "laundry_access", "label": "Washer / dryer access on show day", "type": "boolean"},
  {"id": "laundry_run", "label": "Runner laundry run if no on-site machines", "type": "boolean"},
  {"id": "detergent", "label": "Non-bio detergent provided", "type": "boolean"},
  {"id": "drying_rack", "label": "Drying rack for stage wear", "type": "boolean"},
  {"id": "laundry_notes", "label": "Laundry notes", "type": "textarea"}
]'::jsonb, 190
WHERE NOT EXISTS (
  SELECT 1 FROM public.rider_section_templates
  WHERE workspace_id IS NULL AND template_type = 'towels_laundry'
)
ON CONFLICT (id) DO NOTHING;

-- ---- new platform type: bus_stock (12 fields) ----
INSERT INTO public.rider_section_templates
  (id, workspace_id, template_type, name, description, icon, fields, sort_order)
SELECT '26300000-0000-4000-8000-000000000003'::uuid, NULL, 'bus_stock', 'Bus Stock',
  'Per-bus rider items to be stocked on show day', 'bus',
  '[
  {"id": "still_water", "label": "24 x still water (500ml)", "type": "boolean"},
  {"id": "ice", "label": "2 x bags ice", "type": "boolean"},
  {"id": "local_beer", "label": "12 x local beer (chilled)", "type": "boolean"},
  {"id": "soft_drinks", "label": "Assorted soft drinks", "type": "boolean"},
  {"id": "milk", "label": "Oat milk + dairy milk", "type": "boolean"},
  {"id": "coffee", "label": "Coffee pods / ground coffee", "type": "boolean"},
  {"id": "snacks", "label": "Savoury snacks assortment", "type": "boolean"},
  {"id": "fresh_fruit", "label": "Fresh fruit", "type": "boolean"},
  {"id": "bread_fixings", "label": "Bread + sandwich fixings", "type": "boolean"},
  {"id": "kitchen_supplies", "label": "Kitchen roll + bin bags", "type": "boolean"},
  {"id": "stocked_by", "label": "Stock on bus by (time)", "type": "time"},
  {"id": "bus_stock_notes", "label": "Bus stock notes", "type": "textarea"}
]'::jsonb, 200
WHERE NOT EXISTS (
  SELECT 1 FROM public.rider_section_templates
  WHERE workspace_id IS NULL AND template_type = 'bus_stock'
)
ON CONFLICT (id) DO NOTHING;

-- ---- new platform type: guest_list (10 fields) ----
INSERT INTO public.rider_section_templates
  (id, workspace_id, template_type, name, description, icon, fields, sort_order)
SELECT '26300000-0000-4000-8000-000000000004'::uuid, NULL, 'guest_list', 'Guest List & Passes',
  'Allocation counts and pass types the artist requires', 'ticket',
  '[
  {"id": "guest_allocation", "label": "Guest list allocation required", "type": "number"},
  {"id": "aaa_passes", "label": "AAA passes", "type": "number"},
  {"id": "working_passes", "label": "Working passes", "type": "number"},
  {"id": "photo_passes", "label": "Photo passes", "type": "number"},
  {"id": "aftershow_passes", "label": "Aftershow passes", "type": "number"},
  {"id": "list_deadline", "label": "Guest list submitted by", "type": "time"},
  {"id": "tm_only_changes", "label": "List changes via TM only", "type": "boolean"},
  {"id": "box_office_pickup", "label": "Guest tickets at box office under TM name", "type": "boolean"},
  {"id": "photo_policy", "label": "Photo pass policy (e.g. first 3, no flash)", "type": "text"},
  {"id": "guest_list_notes", "label": "Guest list notes", "type": "textarea"}
]'::jsonb, 210
WHERE NOT EXISTS (
  SELECT 1 FROM public.rider_section_templates
  WHERE workspace_id IS NULL AND template_type = 'guest_list'
)
ON CONFLICT (id) DO NOTHING;

-- ============================================
-- DOWN MIGRATION (manual — uncomment to invert)
-- ============================================
-- Removes the 4 new platform types (fixed 26300000-... ids; guarded by
-- template_type too in case an environment seeded them with other ids).
-- Instantiated sections keep their copied fields (template_id merely
-- nulls out via ON DELETE SET NULL). The 9 rewritten templates are NOT
-- auto-restorable from here — re-paste 258_rider_template_field_depth.sql
-- afterwards: its fields<>guards see the 263 content as drift and
-- restore the advance-catalog field lists (and re-paste 111's seed
-- block first if the rows were deleted outright).
-- DELETE FROM public.rider_section_templates
--   WHERE workspace_id IS NULL
--     AND template_type IN ('dressing_rooms', 'towels_laundry', 'bus_stock', 'guest_list');
-- ============================================
