-- ============================================
-- LOWPASS — Rider template field depth
-- Migration 258
-- ============================================
--
-- Enriches the 13 platform rider_section_templates seeded by
-- migration 111 with much deeper field lists, and adds 4 NEW
-- platform template types matching the builder's curated groups:
-- production, parking, press_promo, local_crew (sort_order
-- 140-170, continuing after merch at 130).
--
-- Field content source: docs/design/ATOM_TEMPLATE_CATALOG_2026-08-06.md
-- (labels verbatim, snake_case ids derived) for the domain-mapped
-- templates — schedule <- "Schedule"; security <- "Security and
-- Credentials"; hospitality + catering <- "Catering and
-- Hospitality" (split); transport <- "Bus and Trailer" / "Driver
-- and Hotels" / "Airport and Local Distances" (subset, capped 25);
-- merch <- "Merchandise"; parking <- "Personal Vehicle Parking" +
-- Bus and Trailer parking subset; local_crew <- "Runner";
-- production <- "Venue Amenities" / "Dressing Rooms" (crew-
-- facility subset). The catalog has NO tech-spec section, so
-- audio / monitoring / lighting / backline / risers (and contacts /
-- labour / press_promo, also uncovered) use standard tech-rider
-- practice.
--
-- Field vocabulary matches the 111 seeds (contact / time / text /
-- textarea / number / boolean) plus currency, which the rider
-- builder's toRiderFieldType() passes through unchanged
-- (RiderSectionBuilder.tsx maps textarea->text, boolean->
-- checkbox_list at drop time). Existing seed field ids are kept
-- stable; new fields are added around them.
--
-- HAND-PASTE: this file is pasted by hand into the Supabase SQL
-- editor (no runner, no tracking table). Every statement is
-- idempotent — a full re-paste is a no-op:
--   * enrichments are UPDATEs guarded by fields <> target
--     (rst_platform_type_uniq keys platform rows on template_type);
--   * new types use INSERT .. SELECT .. WHERE NOT EXISTS keyed on
--     (workspace_id IS NULL AND template_type) — ON CONFLICT does
--     not target the partial unique index.
--
-- Depends on: 111_rider_architecture_mirror.sql.
-- Down-migration block at the end.
-- ============================================

-- ---- enrich: contacts (13 fields) ----
UPDATE public.rider_section_templates
SET fields = '[
  {"id": "tm", "label": "Tour Manager", "type": "contact", "required": true},
  {"id": "pm", "label": "Production Manager", "type": "contact"},
  {"id": "foh", "label": "FOH Engineer", "type": "contact"},
  {"id": "mons", "label": "Monitor Engineer", "type": "contact"},
  {"id": "lx", "label": "Lighting Designer", "type": "contact"},
  {"id": "backline_tech", "label": "Backline Tech", "type": "contact"},
  {"id": "management", "label": "Management", "type": "contact"},
  {"id": "agent", "label": "Booking Agent", "type": "contact"},
  {"id": "label_rep", "label": "Label Rep", "type": "contact"},
  {"id": "travel_agent", "label": "Travel Agent", "type": "contact"},
  {"id": "security_director", "label": "Security Director", "type": "contact"},
  {"id": "merch_manager", "label": "Merch Manager", "type": "contact"},
  {"id": "emergency_contact", "label": "Emergency Contact", "type": "contact"}
]'::jsonb,
    updated_at = now()
WHERE workspace_id IS NULL
  AND template_type = 'contacts'
  AND fields <> '[
  {"id": "tm", "label": "Tour Manager", "type": "contact", "required": true},
  {"id": "pm", "label": "Production Manager", "type": "contact"},
  {"id": "foh", "label": "FOH Engineer", "type": "contact"},
  {"id": "mons", "label": "Monitor Engineer", "type": "contact"},
  {"id": "lx", "label": "Lighting Designer", "type": "contact"},
  {"id": "backline_tech", "label": "Backline Tech", "type": "contact"},
  {"id": "management", "label": "Management", "type": "contact"},
  {"id": "agent", "label": "Booking Agent", "type": "contact"},
  {"id": "label_rep", "label": "Label Rep", "type": "contact"},
  {"id": "travel_agent", "label": "Travel Agent", "type": "contact"},
  {"id": "security_director", "label": "Security Director", "type": "contact"},
  {"id": "merch_manager", "label": "Merch Manager", "type": "contact"},
  {"id": "emergency_contact", "label": "Emergency Contact", "type": "contact"}
]'::jsonb;

-- ---- enrich: schedule (25 fields) ----
UPDATE public.rider_section_templates
SET fields = '[
  {"id": "load_in", "label": "Load-in", "type": "time"},
  {"id": "soundcheck", "label": "Soundcheck", "type": "time"},
  {"id": "doors", "label": "Doors", "type": "time"},
  {"id": "set_time", "label": "Set time", "type": "time"},
  {"id": "curfew", "label": "Curfew", "type": "time"},
  {"id": "earliest_bus_arrival", "label": "Earliest bus arrival", "type": "time"},
  {"id": "earliest_venue_access", "label": "Earliest venue access", "type": "time"},
  {"id": "runner_on_clock", "label": "Runner on clock", "type": "time"},
  {"id": "hospitality_available", "label": "Hospitality available", "type": "time"},
  {"id": "breakfast", "label": "Breakfast", "type": "time"},
  {"id": "headliner_load_in", "label": "Headliner load-in", "type": "time"},
  {"id": "support_load_in", "label": "Support load-in", "type": "time"},
  {"id": "support_soundcheck", "label": "Support soundcheck", "type": "time"},
  {"id": "lunch", "label": "Lunch", "type": "time"},
  {"id": "dinner", "label": "Dinner", "type": "time"},
  {"id": "vip_meet_and_greet", "label": "VIP/meet and greet", "type": "time"},
  {"id": "press_photo_call", "label": "Press/photo call", "type": "time"},
  {"id": "support_set", "label": "Support set", "type": "time"},
  {"id": "changeover", "label": "Changeover", "type": "text"},
  {"id": "encore", "label": "Encore", "type": "time"},
  {"id": "load_out", "label": "Load-out", "type": "time"},
  {"id": "runner_off_clock", "label": "Runner off clock", "type": "time"},
  {"id": "catering_cleared", "label": "Catering cleared", "type": "time"},
  {"id": "dressing_rooms_cleared", "label": "Dressing rooms cleared", "type": "time"},
  {"id": "bus_departure_deadline", "label": "Bus departure deadline", "type": "time"}
]'::jsonb,
    updated_at = now()
WHERE workspace_id IS NULL
  AND template_type = 'schedule'
  AND fields <> '[
  {"id": "load_in", "label": "Load-in", "type": "time"},
  {"id": "soundcheck", "label": "Soundcheck", "type": "time"},
  {"id": "doors", "label": "Doors", "type": "time"},
  {"id": "set_time", "label": "Set time", "type": "time"},
  {"id": "curfew", "label": "Curfew", "type": "time"},
  {"id": "earliest_bus_arrival", "label": "Earliest bus arrival", "type": "time"},
  {"id": "earliest_venue_access", "label": "Earliest venue access", "type": "time"},
  {"id": "runner_on_clock", "label": "Runner on clock", "type": "time"},
  {"id": "hospitality_available", "label": "Hospitality available", "type": "time"},
  {"id": "breakfast", "label": "Breakfast", "type": "time"},
  {"id": "headliner_load_in", "label": "Headliner load-in", "type": "time"},
  {"id": "support_load_in", "label": "Support load-in", "type": "time"},
  {"id": "support_soundcheck", "label": "Support soundcheck", "type": "time"},
  {"id": "lunch", "label": "Lunch", "type": "time"},
  {"id": "dinner", "label": "Dinner", "type": "time"},
  {"id": "vip_meet_and_greet", "label": "VIP/meet and greet", "type": "time"},
  {"id": "press_photo_call", "label": "Press/photo call", "type": "time"},
  {"id": "support_set", "label": "Support set", "type": "time"},
  {"id": "changeover", "label": "Changeover", "type": "text"},
  {"id": "encore", "label": "Encore", "type": "time"},
  {"id": "load_out", "label": "Load-out", "type": "time"},
  {"id": "runner_off_clock", "label": "Runner off clock", "type": "time"},
  {"id": "catering_cleared", "label": "Catering cleared", "type": "time"},
  {"id": "dressing_rooms_cleared", "label": "Dressing rooms cleared", "type": "time"},
  {"id": "bus_departure_deadline", "label": "Bus departure deadline", "type": "time"}
]'::jsonb;

-- ---- enrich: audio (18 fields) ----
UPDATE public.rider_section_templates
SET fields = '[
  {"id": "pa", "label": "PA system", "type": "textarea"},
  {"id": "pa_coverage", "label": "Coverage requirements", "type": "textarea"},
  {"id": "subs_config", "label": "Subs configuration", "type": "text"},
  {"id": "foh_console", "label": "FOH console", "type": "text"},
  {"id": "monitor_console", "label": "Monitor console", "type": "text"},
  {"id": "foh_position", "label": "FOH position requirements", "type": "textarea"},
  {"id": "foh_engineer_supplied", "label": "FOH engineer supplied by artist", "type": "boolean"},
  {"id": "system_tech_required", "label": "House system tech required", "type": "boolean"},
  {"id": "drive_system", "label": "Drive / system processor", "type": "text"},
  {"id": "channel_count", "label": "Channel count", "type": "number"},
  {"id": "di_count", "label": "DI boxes required", "type": "number"},
  {"id": "mic_package", "label": "Microphone package", "type": "textarea"},
  {"id": "stands_package", "label": "Mic stands required", "type": "textarea"},
  {"id": "snake_split", "label": "Snake / split requirements", "type": "text"},
  {"id": "talkback", "label": "Talkback to stage required", "type": "boolean"},
  {"id": "recording_feed", "label": "Multitrack recording feed", "type": "boolean"},
  {"id": "power_audio", "label": "Audio power (dedicated / isolated)", "type": "text"},
  {"id": "audio_notes", "label": "Audio notes", "type": "textarea"}
]'::jsonb,
    updated_at = now()
WHERE workspace_id IS NULL
  AND template_type = 'audio'
  AND fields <> '[
  {"id": "pa", "label": "PA system", "type": "textarea"},
  {"id": "pa_coverage", "label": "Coverage requirements", "type": "textarea"},
  {"id": "subs_config", "label": "Subs configuration", "type": "text"},
  {"id": "foh_console", "label": "FOH console", "type": "text"},
  {"id": "monitor_console", "label": "Monitor console", "type": "text"},
  {"id": "foh_position", "label": "FOH position requirements", "type": "textarea"},
  {"id": "foh_engineer_supplied", "label": "FOH engineer supplied by artist", "type": "boolean"},
  {"id": "system_tech_required", "label": "House system tech required", "type": "boolean"},
  {"id": "drive_system", "label": "Drive / system processor", "type": "text"},
  {"id": "channel_count", "label": "Channel count", "type": "number"},
  {"id": "di_count", "label": "DI boxes required", "type": "number"},
  {"id": "mic_package", "label": "Microphone package", "type": "textarea"},
  {"id": "stands_package", "label": "Mic stands required", "type": "textarea"},
  {"id": "snake_split", "label": "Snake / split requirements", "type": "text"},
  {"id": "talkback", "label": "Talkback to stage required", "type": "boolean"},
  {"id": "recording_feed", "label": "Multitrack recording feed", "type": "boolean"},
  {"id": "power_audio", "label": "Audio power (dedicated / isolated)", "type": "text"},
  {"id": "audio_notes", "label": "Audio notes", "type": "textarea"}
]'::jsonb;

-- ---- enrich: monitoring (16 fields) ----
UPDATE public.rider_section_templates
SET fields = '[
  {"id": "mon_console", "label": "Monitor console", "type": "text"},
  {"id": "mon_engineer_supplied", "label": "Monitor engineer supplied by artist", "type": "boolean"},
  {"id": "mixes_count", "label": "Number of mixes", "type": "number"},
  {"id": "iem_pack_count", "label": "IEM packs", "type": "number"},
  {"id": "iem_frequencies", "label": "IEM frequencies / RF plan", "type": "textarea"},
  {"id": "rf_coordination_required", "label": "RF coordination required", "type": "boolean"},
  {"id": "rf_notes", "label": "RF coordination", "type": "textarea"},
  {"id": "wedge_count", "label": "Wedge count", "type": "number"},
  {"id": "sidefills", "label": "Sidefills", "type": "text"},
  {"id": "drum_sub", "label": "Drum sub", "type": "boolean"},
  {"id": "cue_wedge", "label": "Cue wedge at monitor world", "type": "boolean"},
  {"id": "ambient_mics", "label": "Ambient / audience mics", "type": "boolean"},
  {"id": "shout_talkback", "label": "Shout / talkback system", "type": "text"},
  {"id": "mon_position", "label": "Monitor world position", "type": "text"},
  {"id": "hardwired_spares", "label": "Hardwired spare mixes", "type": "number"},
  {"id": "monitoring_notes", "label": "Monitoring notes", "type": "textarea"}
]'::jsonb,
    updated_at = now()
WHERE workspace_id IS NULL
  AND template_type = 'monitoring'
  AND fields <> '[
  {"id": "mon_console", "label": "Monitor console", "type": "text"},
  {"id": "mon_engineer_supplied", "label": "Monitor engineer supplied by artist", "type": "boolean"},
  {"id": "mixes_count", "label": "Number of mixes", "type": "number"},
  {"id": "iem_pack_count", "label": "IEM packs", "type": "number"},
  {"id": "iem_frequencies", "label": "IEM frequencies / RF plan", "type": "textarea"},
  {"id": "rf_coordination_required", "label": "RF coordination required", "type": "boolean"},
  {"id": "rf_notes", "label": "RF coordination", "type": "textarea"},
  {"id": "wedge_count", "label": "Wedge count", "type": "number"},
  {"id": "sidefills", "label": "Sidefills", "type": "text"},
  {"id": "drum_sub", "label": "Drum sub", "type": "boolean"},
  {"id": "cue_wedge", "label": "Cue wedge at monitor world", "type": "boolean"},
  {"id": "ambient_mics", "label": "Ambient / audience mics", "type": "boolean"},
  {"id": "shout_talkback", "label": "Shout / talkback system", "type": "text"},
  {"id": "mon_position", "label": "Monitor world position", "type": "text"},
  {"id": "hardwired_spares", "label": "Hardwired spare mixes", "type": "number"},
  {"id": "monitoring_notes", "label": "Monitoring notes", "type": "textarea"}
]'::jsonb;

-- ---- enrich: lighting (17 fields) ----
UPDATE public.rider_section_templates
SET fields = '[
  {"id": "console", "label": "Console", "type": "text"},
  {"id": "ld_supplied", "label": "LD supplied by artist", "type": "boolean"},
  {"id": "house_rig_ok", "label": "House rig acceptable", "type": "boolean"},
  {"id": "fixtures", "label": "Fixtures", "type": "textarea"},
  {"id": "floor_package", "label": "Floor package", "type": "textarea"},
  {"id": "followspots", "label": "Followspots", "type": "number"},
  {"id": "spot_ops_required", "label": "Spot operators required", "type": "number"},
  {"id": "hazers", "label": "Haze / atmosphere", "type": "text"},
  {"id": "strobes_used", "label": "Strobes used in show", "type": "boolean"},
  {"id": "rigging_points", "label": "Rigging points required", "type": "number"},
  {"id": "rigging_plot", "label": "Rigging / flying requirements", "type": "textarea"},
  {"id": "power_lighting", "label": "Lighting power (3-phase)", "type": "text"},
  {"id": "dmx_universes", "label": "DMX universes", "type": "number"},
  {"id": "house_lights_control", "label": "House lights controllable from FOH", "type": "boolean"},
  {"id": "backdrop", "label": "Backdrop", "type": "textarea"},
  {"id": "video_wall", "label": "Video / projection", "type": "textarea"},
  {"id": "lighting_notes", "label": "Lighting notes", "type": "textarea"}
]'::jsonb,
    updated_at = now()
WHERE workspace_id IS NULL
  AND template_type = 'lighting'
  AND fields <> '[
  {"id": "console", "label": "Console", "type": "text"},
  {"id": "ld_supplied", "label": "LD supplied by artist", "type": "boolean"},
  {"id": "house_rig_ok", "label": "House rig acceptable", "type": "boolean"},
  {"id": "fixtures", "label": "Fixtures", "type": "textarea"},
  {"id": "floor_package", "label": "Floor package", "type": "textarea"},
  {"id": "followspots", "label": "Followspots", "type": "number"},
  {"id": "spot_ops_required", "label": "Spot operators required", "type": "number"},
  {"id": "hazers", "label": "Haze / atmosphere", "type": "text"},
  {"id": "strobes_used", "label": "Strobes used in show", "type": "boolean"},
  {"id": "rigging_points", "label": "Rigging points required", "type": "number"},
  {"id": "rigging_plot", "label": "Rigging / flying requirements", "type": "textarea"},
  {"id": "power_lighting", "label": "Lighting power (3-phase)", "type": "text"},
  {"id": "dmx_universes", "label": "DMX universes", "type": "number"},
  {"id": "house_lights_control", "label": "House lights controllable from FOH", "type": "boolean"},
  {"id": "backdrop", "label": "Backdrop", "type": "textarea"},
  {"id": "video_wall", "label": "Video / projection", "type": "textarea"},
  {"id": "lighting_notes", "label": "Lighting notes", "type": "textarea"}
]'::jsonb;

-- ---- enrich: backline (16 fields) ----
UPDATE public.rider_section_templates
SET fields = '[
  {"id": "drums", "label": "Drum kit", "type": "textarea"},
  {"id": "drum_hardware", "label": "Drum hardware", "type": "textarea"},
  {"id": "cymbals", "label": "Cymbals", "type": "textarea"},
  {"id": "percussion", "label": "Percussion", "type": "textarea"},
  {"id": "guitar_amps", "label": "Guitar amps", "type": "textarea"},
  {"id": "bass_amps", "label": "Bass amps", "type": "textarea"},
  {"id": "keys", "label": "Keys / pianos", "type": "textarea"},
  {"id": "dj_equipment", "label": "DJ equipment", "type": "textarea"},
  {"id": "guitar_stands", "label": "Guitar stands", "type": "number"},
  {"id": "keyboard_stands", "label": "Keyboard stands", "type": "number"},
  {"id": "music_stands", "label": "Music stands", "type": "number"},
  {"id": "backline_hire_required", "label": "Backline hire required", "type": "boolean"},
  {"id": "hire_company", "label": "Preferred hire company", "type": "text"},
  {"id": "stage_power_drops", "label": "Stage power drops", "type": "textarea"},
  {"id": "backline_tech_required", "label": "House backline tech required", "type": "boolean"},
  {"id": "backline_notes", "label": "Backline notes", "type": "textarea"}
]'::jsonb,
    updated_at = now()
WHERE workspace_id IS NULL
  AND template_type = 'backline'
  AND fields <> '[
  {"id": "drums", "label": "Drum kit", "type": "textarea"},
  {"id": "drum_hardware", "label": "Drum hardware", "type": "textarea"},
  {"id": "cymbals", "label": "Cymbals", "type": "textarea"},
  {"id": "percussion", "label": "Percussion", "type": "textarea"},
  {"id": "guitar_amps", "label": "Guitar amps", "type": "textarea"},
  {"id": "bass_amps", "label": "Bass amps", "type": "textarea"},
  {"id": "keys", "label": "Keys / pianos", "type": "textarea"},
  {"id": "dj_equipment", "label": "DJ equipment", "type": "textarea"},
  {"id": "guitar_stands", "label": "Guitar stands", "type": "number"},
  {"id": "keyboard_stands", "label": "Keyboard stands", "type": "number"},
  {"id": "music_stands", "label": "Music stands", "type": "number"},
  {"id": "backline_hire_required", "label": "Backline hire required", "type": "boolean"},
  {"id": "hire_company", "label": "Preferred hire company", "type": "text"},
  {"id": "stage_power_drops", "label": "Stage power drops", "type": "textarea"},
  {"id": "backline_tech_required", "label": "House backline tech required", "type": "boolean"},
  {"id": "backline_notes", "label": "Backline notes", "type": "textarea"}
]'::jsonb;

-- ---- enrich: risers (13 fields) ----
UPDATE public.rider_section_templates
SET fields = '[
  {"id": "riser_sizes", "label": "Risers required", "type": "textarea"},
  {"id": "drum_riser", "label": "Drum riser (W x D x H)", "type": "text"},
  {"id": "keys_riser", "label": "Keys riser (W x D x H)", "type": "text"},
  {"id": "rolling_risers", "label": "Rolling risers required", "type": "boolean"},
  {"id": "riser_skirting", "label": "Riser skirting required", "type": "boolean"},
  {"id": "stage_minimum", "label": "Minimum stage size", "type": "text"},
  {"id": "stage_height", "label": "Stage height", "type": "text"},
  {"id": "clearance_height", "label": "Clearance / trim height", "type": "text"},
  {"id": "wing_space", "label": "Wing space", "type": "text"},
  {"id": "crossover", "label": "Upstage crossover required", "type": "boolean"},
  {"id": "ramp_access", "label": "Ramp / lift access to stage", "type": "boolean"},
  {"id": "stage_extension", "label": "Stage extension / thrust", "type": "text"},
  {"id": "stage_notes", "label": "Stage notes", "type": "textarea"}
]'::jsonb,
    updated_at = now()
WHERE workspace_id IS NULL
  AND template_type = 'risers'
  AND fields <> '[
  {"id": "riser_sizes", "label": "Risers required", "type": "textarea"},
  {"id": "drum_riser", "label": "Drum riser (W x D x H)", "type": "text"},
  {"id": "keys_riser", "label": "Keys riser (W x D x H)", "type": "text"},
  {"id": "rolling_risers", "label": "Rolling risers required", "type": "boolean"},
  {"id": "riser_skirting", "label": "Riser skirting required", "type": "boolean"},
  {"id": "stage_minimum", "label": "Minimum stage size", "type": "text"},
  {"id": "stage_height", "label": "Stage height", "type": "text"},
  {"id": "clearance_height", "label": "Clearance / trim height", "type": "text"},
  {"id": "wing_space", "label": "Wing space", "type": "text"},
  {"id": "crossover", "label": "Upstage crossover required", "type": "boolean"},
  {"id": "ramp_access", "label": "Ramp / lift access to stage", "type": "boolean"},
  {"id": "stage_extension", "label": "Stage extension / thrust", "type": "text"},
  {"id": "stage_notes", "label": "Stage notes", "type": "textarea"}
]'::jsonb;

-- ---- enrich: security (25 fields) ----
UPDATE public.rider_section_templates
SET fields = '[
  {"id": "metal_detection", "label": "Metal detection", "type": "boolean"},
  {"id": "bag_policy", "label": "Bag policy", "type": "textarea"},
  {"id": "walkthrough_required", "label": "Walkthrough required", "type": "boolean"},
  {"id": "security_contact_and_cell", "label": "Security contact and cell", "type": "contact"},
  {"id": "house_security_protocol_received", "label": "House security protocol received", "type": "boolean"},
  {"id": "tour_security_protocol_acknowledged", "label": "Tour security protocol acknowledged", "type": "boolean"},
  {"id": "pass_sheet_acknowledged", "label": "\"Pass sheet\" acknowledged", "type": "boolean"},
  {"id": "credential_types_approved", "label": "Credential types approved", "type": "text"},
  {"id": "credentials_printed_by", "label": "Who prints credentials", "type": "text"},
  {"id": "credential_distribution_location", "label": "Credential distribution location", "type": "text"},
  {"id": "backstage_access_controlled", "label": "Backstage access controlled", "type": "boolean"},
  {"id": "dressing_room_access_controlled", "label": "Dressing room access controlled", "type": "boolean"},
  {"id": "stage_access_controlled", "label": "Stage access controlled", "type": "boolean"},
  {"id": "bus_parking_secured", "label": "Bus parking secured", "type": "boolean"},
  {"id": "merchandise_security", "label": "Merchandise security", "type": "boolean"},
  {"id": "barricade_pit_security", "label": "Barricade/pit/stage stair security", "type": "textarea"},
  {"id": "artist_arrival_exit_route", "label": "Artist arrival and exit route", "type": "textarea"},
  {"id": "guest_credential_procedure", "label": "Guest credential procedure", "type": "textarea"},
  {"id": "photo_video_restrictions", "label": "Photo/video restrictions", "type": "textarea"},
  {"id": "reentry_policy", "label": "Re-entry policy", "type": "text"},
  {"id": "emergency_evacuation_plan", "label": "Emergency evacuation plan", "type": "textarea"},
  {"id": "severe_weather_shelter", "label": "Severe weather shelter", "type": "text"},
  {"id": "medical_ems_location", "label": "Medical staff/EMS location", "type": "text"},
  {"id": "nearest_hospital", "label": "Nearest hospital", "type": "text"},
  {"id": "incident_reporting_procedure", "label": "Incident reporting procedure", "type": "textarea"}
]'::jsonb,
    updated_at = now()
WHERE workspace_id IS NULL
  AND template_type = 'security'
  AND fields <> '[
  {"id": "metal_detection", "label": "Metal detection", "type": "boolean"},
  {"id": "bag_policy", "label": "Bag policy", "type": "textarea"},
  {"id": "walkthrough_required", "label": "Walkthrough required", "type": "boolean"},
  {"id": "security_contact_and_cell", "label": "Security contact and cell", "type": "contact"},
  {"id": "house_security_protocol_received", "label": "House security protocol received", "type": "boolean"},
  {"id": "tour_security_protocol_acknowledged", "label": "Tour security protocol acknowledged", "type": "boolean"},
  {"id": "pass_sheet_acknowledged", "label": "\"Pass sheet\" acknowledged", "type": "boolean"},
  {"id": "credential_types_approved", "label": "Credential types approved", "type": "text"},
  {"id": "credentials_printed_by", "label": "Who prints credentials", "type": "text"},
  {"id": "credential_distribution_location", "label": "Credential distribution location", "type": "text"},
  {"id": "backstage_access_controlled", "label": "Backstage access controlled", "type": "boolean"},
  {"id": "dressing_room_access_controlled", "label": "Dressing room access controlled", "type": "boolean"},
  {"id": "stage_access_controlled", "label": "Stage access controlled", "type": "boolean"},
  {"id": "bus_parking_secured", "label": "Bus parking secured", "type": "boolean"},
  {"id": "merchandise_security", "label": "Merchandise security", "type": "boolean"},
  {"id": "barricade_pit_security", "label": "Barricade/pit/stage stair security", "type": "textarea"},
  {"id": "artist_arrival_exit_route", "label": "Artist arrival and exit route", "type": "textarea"},
  {"id": "guest_credential_procedure", "label": "Guest credential procedure", "type": "textarea"},
  {"id": "photo_video_restrictions", "label": "Photo/video restrictions", "type": "textarea"},
  {"id": "reentry_policy", "label": "Re-entry policy", "type": "text"},
  {"id": "emergency_evacuation_plan", "label": "Emergency evacuation plan", "type": "textarea"},
  {"id": "severe_weather_shelter", "label": "Severe weather shelter", "type": "text"},
  {"id": "medical_ems_location", "label": "Medical staff/EMS location", "type": "text"},
  {"id": "nearest_hospital", "label": "Nearest hospital", "type": "text"},
  {"id": "incident_reporting_procedure", "label": "Incident reporting procedure", "type": "textarea"}
]'::jsonb;

-- ---- enrich: hospitality (12 fields) ----
UPDATE public.rider_section_templates
SET fields = '[
  {"id": "dressing_rooms", "label": "Dressing rooms", "type": "textarea"},
  {"id": "towels_shower", "label": "Shower towels", "type": "number"},
  {"id": "towels_stage", "label": "Stage towels", "type": "number"},
  {"id": "snacks", "label": "Snacks", "type": "textarea"},
  {"id": "hospitality_budget", "label": "Hospitality budget", "type": "currency"},
  {"id": "dressing_room_hospitality", "label": "Dressing room hospitality", "type": "textarea"},
  {"id": "bus_stock", "label": "Bus stock", "type": "textarea"},
  {"id": "water_and_ice", "label": "Water and ice", "type": "text"},
  {"id": "coffee_and_tea", "label": "Coffee and tea", "type": "text"},
  {"id": "soft_drinks_beverages", "label": "Soft drinks/electrolytes/beverages", "type": "textarea"},
  {"id": "late_arrival_food", "label": "Food available for late arrivals", "type": "boolean"},
  {"id": "meal_credentials_required", "label": "Meal credentials/wristbands required", "type": "boolean"}
]'::jsonb,
    updated_at = now()
WHERE workspace_id IS NULL
  AND template_type = 'hospitality'
  AND fields <> '[
  {"id": "dressing_rooms", "label": "Dressing rooms", "type": "textarea"},
  {"id": "towels_shower", "label": "Shower towels", "type": "number"},
  {"id": "towels_stage", "label": "Stage towels", "type": "number"},
  {"id": "snacks", "label": "Snacks", "type": "textarea"},
  {"id": "hospitality_budget", "label": "Hospitality budget", "type": "currency"},
  {"id": "dressing_room_hospitality", "label": "Dressing room hospitality", "type": "textarea"},
  {"id": "bus_stock", "label": "Bus stock", "type": "textarea"},
  {"id": "water_and_ice", "label": "Water and ice", "type": "text"},
  {"id": "coffee_and_tea", "label": "Coffee and tea", "type": "text"},
  {"id": "soft_drinks_beverages", "label": "Soft drinks/electrolytes/beverages", "type": "textarea"},
  {"id": "late_arrival_food", "label": "Food available for late arrivals", "type": "boolean"},
  {"id": "meal_credentials_required", "label": "Meal credentials/wristbands required", "type": "boolean"}
]'::jsonb;

-- ---- enrich: catering (19 fields) ----
UPDATE public.rider_section_templates
SET fields = '[
  {"id": "meal_count", "label": "Meal count", "type": "number"},
  {"id": "dietary", "label": "Dietary requirements", "type": "textarea"},
  {"id": "alcohol", "label": "Alcohol policy", "type": "textarea"},
  {"id": "catering_budget", "label": "Catering budget", "type": "currency"},
  {"id": "budgets_combined_or_separate", "label": "Budgets combined or separate", "type": "text"},
  {"id": "in_house_or_outside_catering", "label": "In-house or outside catering", "type": "text"},
  {"id": "meal_buyout", "label": "Meal buyout", "type": "text"},
  {"id": "receipts_required", "label": "Receipts required", "type": "boolean"},
  {"id": "tour_party_count", "label": "Tour party count", "type": "number"},
  {"id": "support_party_count", "label": "Support party count", "type": "number"},
  {"id": "driver_included_meal_count", "label": "Driver included in meal count", "type": "boolean"},
  {"id": "breakfast_time_details", "label": "Breakfast time and details", "type": "text"},
  {"id": "lunch_time_details", "label": "Lunch time and details", "type": "text"},
  {"id": "dinner_time_menu", "label": "Dinner time and menu", "type": "text"},
  {"id": "after_show_food", "label": "After-show food", "type": "textarea"},
  {"id": "vegetarian_meals", "label": "Vegetarian meals", "type": "number"},
  {"id": "vegan_meals", "label": "Vegan meals", "type": "number"},
  {"id": "no_red_meat_pork", "label": "No red meat/pork accommodation", "type": "boolean"},
  {"id": "driver_meals_after_sleep", "label": "Meals available for driver after sleep", "type": "boolean"}
]'::jsonb,
    updated_at = now()
WHERE workspace_id IS NULL
  AND template_type = 'catering'
  AND fields <> '[
  {"id": "meal_count", "label": "Meal count", "type": "number"},
  {"id": "dietary", "label": "Dietary requirements", "type": "textarea"},
  {"id": "alcohol", "label": "Alcohol policy", "type": "textarea"},
  {"id": "catering_budget", "label": "Catering budget", "type": "currency"},
  {"id": "budgets_combined_or_separate", "label": "Budgets combined or separate", "type": "text"},
  {"id": "in_house_or_outside_catering", "label": "In-house or outside catering", "type": "text"},
  {"id": "meal_buyout", "label": "Meal buyout", "type": "text"},
  {"id": "receipts_required", "label": "Receipts required", "type": "boolean"},
  {"id": "tour_party_count", "label": "Tour party count", "type": "number"},
  {"id": "support_party_count", "label": "Support party count", "type": "number"},
  {"id": "driver_included_meal_count", "label": "Driver included in meal count", "type": "boolean"},
  {"id": "breakfast_time_details", "label": "Breakfast time and details", "type": "text"},
  {"id": "lunch_time_details", "label": "Lunch time and details", "type": "text"},
  {"id": "dinner_time_menu", "label": "Dinner time and menu", "type": "text"},
  {"id": "after_show_food", "label": "After-show food", "type": "textarea"},
  {"id": "vegetarian_meals", "label": "Vegetarian meals", "type": "number"},
  {"id": "vegan_meals", "label": "Vegan meals", "type": "number"},
  {"id": "no_red_meat_pork", "label": "No red meat/pork accommodation", "type": "boolean"},
  {"id": "driver_meals_after_sleep", "label": "Meals available for driver after sleep", "type": "boolean"}
]'::jsonb;

-- ---- enrich: transport (25 fields) ----
UPDATE public.rider_section_templates
SET fields = '[
  {"id": "vehicles", "label": "Vehicles", "type": "text"},
  {"id": "parking", "label": "Parking instructions", "type": "textarea"},
  {"id": "load_in_notes", "label": "Load-in notes", "type": "textarea"},
  {"id": "vehicle_configuration", "label": "Vehicle configuration", "type": "text"},
  {"id": "total_combined_length", "label": "Total combined length", "type": "text"},
  {"id": "can_bus_arrive_day_before", "label": "Can bus arrive the day before", "type": "boolean"},
  {"id": "bus_trailer_remain_connected", "label": "Can bus and trailer remain connected", "type": "boolean"},
  {"id": "overnight_parking_permitted", "label": "Overnight parking permitted", "type": "boolean"},
  {"id": "parking_surface", "label": "Parking surface", "type": "text"},
  {"id": "shore_power_available", "label": "Shore power available", "type": "boolean"},
  {"id": "shore_power_amperage_connection", "label": "Shore power amperage/connection", "type": "text"},
  {"id": "generator_permitted", "label": "Generator permitted", "type": "boolean"},
  {"id": "water_hookup_available", "label": "Water hookup available", "type": "boolean"},
  {"id": "trash_disposal_available", "label": "Trash disposal available", "type": "boolean"},
  {"id": "trailer_security_overnight", "label": "Trailer security overnight", "type": "boolean"},
  {"id": "quiet_driver_room_required", "label": "Quiet driver room required", "type": "boolean"},
  {"id": "hotel_bus_trailer_parking", "label": "Hotel with bus and trailer parking", "type": "boolean"},
  {"id": "driver_shower_before_check_in", "label": "Driver shower available before hotel check-in", "type": "boolean"},
  {"id": "driver_meal_included", "label": "Driver meal included", "type": "boolean"},
  {"id": "primary_airport", "label": "Primary airport", "type": "text"},
  {"id": "venue_airport_mileage", "label": "Venue-to-airport mileage/drive time", "type": "text"},
  {"id": "venue_hotel_mileage", "label": "Venue-to-hotel mileage/drive time", "type": "text"},
  {"id": "hotel_airport_mileage", "label": "Hotel-to-airport mileage/drive time", "type": "text"},
  {"id": "toll_roads_bridge_restrictions", "label": "Toll roads/bridge restrictions", "type": "textarea"},
  {"id": "airport_pickup_location", "label": "Airport pickup location", "type": "text"}
]'::jsonb,
    updated_at = now()
WHERE workspace_id IS NULL
  AND template_type = 'transport'
  AND fields <> '[
  {"id": "vehicles", "label": "Vehicles", "type": "text"},
  {"id": "parking", "label": "Parking instructions", "type": "textarea"},
  {"id": "load_in_notes", "label": "Load-in notes", "type": "textarea"},
  {"id": "vehicle_configuration", "label": "Vehicle configuration", "type": "text"},
  {"id": "total_combined_length", "label": "Total combined length", "type": "text"},
  {"id": "can_bus_arrive_day_before", "label": "Can bus arrive the day before", "type": "boolean"},
  {"id": "bus_trailer_remain_connected", "label": "Can bus and trailer remain connected", "type": "boolean"},
  {"id": "overnight_parking_permitted", "label": "Overnight parking permitted", "type": "boolean"},
  {"id": "parking_surface", "label": "Parking surface", "type": "text"},
  {"id": "shore_power_available", "label": "Shore power available", "type": "boolean"},
  {"id": "shore_power_amperage_connection", "label": "Shore power amperage/connection", "type": "text"},
  {"id": "generator_permitted", "label": "Generator permitted", "type": "boolean"},
  {"id": "water_hookup_available", "label": "Water hookup available", "type": "boolean"},
  {"id": "trash_disposal_available", "label": "Trash disposal available", "type": "boolean"},
  {"id": "trailer_security_overnight", "label": "Trailer security overnight", "type": "boolean"},
  {"id": "quiet_driver_room_required", "label": "Quiet driver room required", "type": "boolean"},
  {"id": "hotel_bus_trailer_parking", "label": "Hotel with bus and trailer parking", "type": "boolean"},
  {"id": "driver_shower_before_check_in", "label": "Driver shower available before hotel check-in", "type": "boolean"},
  {"id": "driver_meal_included", "label": "Driver meal included", "type": "boolean"},
  {"id": "primary_airport", "label": "Primary airport", "type": "text"},
  {"id": "venue_airport_mileage", "label": "Venue-to-airport mileage/drive time", "type": "text"},
  {"id": "venue_hotel_mileage", "label": "Venue-to-hotel mileage/drive time", "type": "text"},
  {"id": "hotel_airport_mileage", "label": "Hotel-to-airport mileage/drive time", "type": "text"},
  {"id": "toll_roads_bridge_restrictions", "label": "Toll roads/bridge restrictions", "type": "textarea"},
  {"id": "airport_pickup_location", "label": "Airport pickup location", "type": "text"}
]'::jsonb;

-- ---- enrich: labour (16 fields) ----
UPDATE public.rider_section_templates
SET fields = '[
  {"id": "stagehands", "label": "Stagehands", "type": "number"},
  {"id": "loaders_in", "label": "Loaders (load-in)", "type": "number"},
  {"id": "loaders_out", "label": "Loaders (load-out)", "type": "number"},
  {"id": "riggers", "label": "Riggers", "type": "number"},
  {"id": "all_day", "label": "All-day crew", "type": "number"},
  {"id": "spot_ops", "label": "Spot operators", "type": "number"},
  {"id": "foh_tech", "label": "FOH tech", "type": "boolean"},
  {"id": "lx_tech", "label": "Lighting tech", "type": "boolean"},
  {"id": "mon_tech", "label": "Monitor / stage tech", "type": "boolean"},
  {"id": "forklift_driver", "label": "Forklift + driver", "type": "boolean"},
  {"id": "crew_call_time", "label": "Crew call time", "type": "time"},
  {"id": "show_call_count", "label": "Show call crew", "type": "number"},
  {"id": "minimum_call_hours", "label": "Minimum call (hours)", "type": "number"},
  {"id": "union_venue", "label": "Union venue", "type": "boolean"},
  {"id": "runner_required", "label": "Runner required", "type": "boolean"},
  {"id": "labour_notes", "label": "Labour notes", "type": "textarea"}
]'::jsonb,
    updated_at = now()
WHERE workspace_id IS NULL
  AND template_type = 'labour'
  AND fields <> '[
  {"id": "stagehands", "label": "Stagehands", "type": "number"},
  {"id": "loaders_in", "label": "Loaders (load-in)", "type": "number"},
  {"id": "loaders_out", "label": "Loaders (load-out)", "type": "number"},
  {"id": "riggers", "label": "Riggers", "type": "number"},
  {"id": "all_day", "label": "All-day crew", "type": "number"},
  {"id": "spot_ops", "label": "Spot operators", "type": "number"},
  {"id": "foh_tech", "label": "FOH tech", "type": "boolean"},
  {"id": "lx_tech", "label": "Lighting tech", "type": "boolean"},
  {"id": "mon_tech", "label": "Monitor / stage tech", "type": "boolean"},
  {"id": "forklift_driver", "label": "Forklift + driver", "type": "boolean"},
  {"id": "crew_call_time", "label": "Crew call time", "type": "time"},
  {"id": "show_call_count", "label": "Show call crew", "type": "number"},
  {"id": "minimum_call_hours", "label": "Minimum call (hours)", "type": "number"},
  {"id": "union_venue", "label": "Union venue", "type": "boolean"},
  {"id": "runner_required", "label": "Runner required", "type": "boolean"},
  {"id": "labour_notes", "label": "Labour notes", "type": "textarea"}
]'::jsonb;

-- ---- enrich: merch (22 fields) ----
UPDATE public.rider_section_templates
SET fields = '[
  {"id": "merch_company", "label": "Merch company", "type": "text"},
  {"id": "location", "label": "Location", "type": "text"},
  {"id": "split", "label": "Split %", "type": "number"},
  {"id": "merch_load_in_time", "label": "Merchandise load-in time", "type": "time"},
  {"id": "indoor_outdoor_covered", "label": "Indoor/outdoor/covered", "type": "text"},
  {"id": "seller_fee", "label": "Seller fee/hourly rate/minimum", "type": "text"},
  {"id": "soft_goods_split", "label": "Soft goods split", "type": "number"},
  {"id": "hard_goods_split", "label": "Hard goods split", "type": "number"},
  {"id": "sales_tax_retained_by", "label": "Who retains/remits sales tax", "type": "text"},
  {"id": "sales_tax_percentage", "label": "Sales tax percentage", "type": "number"},
  {"id": "tax_deducted_before_after_split", "label": "Tax deducted before or after split", "type": "text"},
  {"id": "venue_or_artist_pos", "label": "Venue or artist POS", "type": "text"},
  {"id": "cashless_venue", "label": "Cashless venue", "type": "boolean"},
  {"id": "cash_permitted", "label": "Cash permitted", "type": "boolean"},
  {"id": "wifi_power_at_merch", "label": "Wi-Fi and power at merch", "type": "boolean"},
  {"id": "tables_chairs_grid_display", "label": "Tables/chairs/grid/display wall", "type": "textarea"},
  {"id": "lighting_tablecloth_hangers", "label": "Lighting/tablecloth/hangers", "type": "textarea"},
  {"id": "security_at_merch", "label": "Security at merch", "type": "boolean"},
  {"id": "inventory_count_required", "label": "Inventory count required", "type": "boolean"},
  {"id": "venue_counts_in_out", "label": "Venue counts in and out", "type": "boolean"},
  {"id": "merch_settlement_time_contact", "label": "Merch settlement time and contact", "type": "text"},
  {"id": "outdoor_weather_contingency", "label": "Outdoor weather contingency", "type": "textarea"}
]'::jsonb,
    updated_at = now()
WHERE workspace_id IS NULL
  AND template_type = 'merch'
  AND fields <> '[
  {"id": "merch_company", "label": "Merch company", "type": "text"},
  {"id": "location", "label": "Location", "type": "text"},
  {"id": "split", "label": "Split %", "type": "number"},
  {"id": "merch_load_in_time", "label": "Merchandise load-in time", "type": "time"},
  {"id": "indoor_outdoor_covered", "label": "Indoor/outdoor/covered", "type": "text"},
  {"id": "seller_fee", "label": "Seller fee/hourly rate/minimum", "type": "text"},
  {"id": "soft_goods_split", "label": "Soft goods split", "type": "number"},
  {"id": "hard_goods_split", "label": "Hard goods split", "type": "number"},
  {"id": "sales_tax_retained_by", "label": "Who retains/remits sales tax", "type": "text"},
  {"id": "sales_tax_percentage", "label": "Sales tax percentage", "type": "number"},
  {"id": "tax_deducted_before_after_split", "label": "Tax deducted before or after split", "type": "text"},
  {"id": "venue_or_artist_pos", "label": "Venue or artist POS", "type": "text"},
  {"id": "cashless_venue", "label": "Cashless venue", "type": "boolean"},
  {"id": "cash_permitted", "label": "Cash permitted", "type": "boolean"},
  {"id": "wifi_power_at_merch", "label": "Wi-Fi and power at merch", "type": "boolean"},
  {"id": "tables_chairs_grid_display", "label": "Tables/chairs/grid/display wall", "type": "textarea"},
  {"id": "lighting_tablecloth_hangers", "label": "Lighting/tablecloth/hangers", "type": "textarea"},
  {"id": "security_at_merch", "label": "Security at merch", "type": "boolean"},
  {"id": "inventory_count_required", "label": "Inventory count required", "type": "boolean"},
  {"id": "venue_counts_in_out", "label": "Venue counts in and out", "type": "boolean"},
  {"id": "merch_settlement_time_contact", "label": "Merch settlement time and contact", "type": "text"},
  {"id": "outdoor_weather_contingency", "label": "Outdoor weather contingency", "type": "textarea"}
]'::jsonb;

-- ---- new platform type: production (16 fields) ----
INSERT INTO public.rider_section_templates
  (workspace_id, template_type, name, description, icon, fields, sort_order)
SELECT NULL, 'production', 'Production & Amenities', 'Wi-Fi, laundry, showers, and crew facilities (ATOM Venue Amenities / Dressing Rooms)', 'briefcase',
  '[
  {"id": "wifi_available", "label": "Wi-Fi available", "type": "boolean"},
  {"id": "wifi_network_password", "label": "Wi-Fi network and password", "type": "text"},
  {"id": "wifi_backstage", "label": "Wi-Fi backstage", "type": "boolean"},
  {"id": "wifi_dressing_rooms", "label": "Wi-Fi in dressing rooms", "type": "boolean"},
  {"id": "onsite_washer", "label": "On-site washer", "type": "boolean"},
  {"id": "onsite_dryer", "label": "On-site dryer", "type": "boolean"},
  {"id": "laundry_location_hours", "label": "Laundry location and hours", "type": "text"},
  {"id": "detergent_provided", "label": "Detergent provided", "type": "boolean"},
  {"id": "showers_available", "label": "Showers available", "type": "boolean"},
  {"id": "hot_water_confirmed", "label": "Hot water confirmed", "type": "boolean"},
  {"id": "shower_towels_provided", "label": "Shower towels provided", "type": "boolean"},
  {"id": "shower_towels_count", "label": "Number of shower towels", "type": "number"},
  {"id": "toiletries_provided", "label": "Toiletries provided", "type": "boolean"},
  {"id": "private_crew_restroom", "label": "Private crew restroom", "type": "boolean"},
  {"id": "power_outlets", "label": "Power outlets", "type": "boolean"},
  {"id": "climate_control", "label": "Climate control", "type": "boolean"}
]'::jsonb, 140
WHERE NOT EXISTS (
  SELECT 1 FROM public.rider_section_templates
  WHERE workspace_id IS NULL AND template_type = 'production'
);

-- ---- new platform type: parking (15 fields) ----
INSERT INTO public.rider_section_templates
  (workspace_id, template_type, name, description, icon, fields, sort_order)
SELECT NULL, 'parking', 'Parking', 'Personal vehicle parking plus bus/trailer access (ATOM Personal Vehicle Parking + Bus and Trailer subset)', 'car',
  '[
  {"id": "num_personal_vehicles", "label": "Number of artist/crew personal vehicles", "type": "number"},
  {"id": "num_support_vehicles", "label": "Number of support vehicles", "type": "number"},
  {"id": "personal_vehicle_parking_location", "label": "Personal vehicle parking location", "type": "text"},
  {"id": "parking_passes_required", "label": "Parking passes required", "type": "boolean"},
  {"id": "parking_fee", "label": "Parking fee", "type": "currency"},
  {"id": "overnight_parking_permitted", "label": "Overnight parking permitted", "type": "boolean"},
  {"id": "secure_parking_available", "label": "Secure parking available", "type": "boolean"},
  {"id": "vehicle_list_required", "label": "Vehicle list required in advance", "type": "boolean"},
  {"id": "license_plate_info_required", "label": "License plate information required", "type": "boolean"},
  {"id": "guest_parking_location", "label": "Guest parking location", "type": "text"},
  {"id": "parking_surface", "label": "Parking surface", "type": "text"},
  {"id": "turning_clearance_confirmed", "label": "Turning clearance confirmed", "type": "boolean"},
  {"id": "low_branches_gates_weight_restrictions", "label": "Low branches/gates/weight restrictions", "type": "textarea"},
  {"id": "gate_code", "label": "Gate code", "type": "text"},
  {"id": "correct_entrance", "label": "Correct entrance", "type": "text"}
]'::jsonb, 150
WHERE NOT EXISTS (
  SELECT 1 FROM public.rider_section_templates
  WHERE workspace_id IS NULL AND template_type = 'parking'
);

-- ---- new platform type: press_promo (12 fields) ----
INSERT INTO public.rider_section_templates
  (workspace_id, template_type, name, description, icon, fields, sort_order)
SELECT NULL, 'press_promo', 'Press & Promo', 'Photo/video policy, press passes, meet and greets, promo', 'camera',
  '[
  {"id": "photo_policy", "label": "Photo policy", "type": "textarea"},
  {"id": "video_policy", "label": "Video policy", "type": "textarea"},
  {"id": "press_passes", "label": "Press passes", "type": "number"},
  {"id": "photo_pass_limit", "label": "Photo pass limit", "type": "number"},
  {"id": "first_three_songs", "label": "First three songs only", "type": "boolean"},
  {"id": "meet_greet", "label": "Meet and greet", "type": "boolean"},
  {"id": "meet_greet_details", "label": "Meet and greet details", "type": "textarea"},
  {"id": "promo_schedule", "label": "Promo schedule", "type": "textarea"},
  {"id": "interviews", "label": "Interviews", "type": "textarea"},
  {"id": "approval_contact", "label": "Approvals contact", "type": "contact"},
  {"id": "house_photographer", "label": "House photographer allowed", "type": "boolean"},
  {"id": "press_notes", "label": "Press notes", "type": "textarea"}
]'::jsonb, 160
WHERE NOT EXISTS (
  SELECT 1 FROM public.rider_section_templates
  WHERE workspace_id IS NULL AND template_type = 'press_promo'
);

-- ---- new platform type: local_crew (16 fields) ----
INSERT INTO public.rider_section_templates
  (workspace_id, template_type, name, description, icon, fields, sort_order)
SELECT NULL, 'local_crew', 'Runner / Local Crew', 'Runner availability, vehicle, and run policy (ATOM Runner)', 'hard-hat',
  '[
  {"id": "runner_available", "label": "Runner available", "type": "boolean"},
  {"id": "runner_name_cell", "label": "Runner name and cell", "type": "contact"},
  {"id": "runner_on_clock", "label": "Runner on clock", "type": "time"},
  {"id": "runner_off_clock", "label": "Runner off clock", "type": "time"},
  {"id": "runner_vehicle", "label": "Runner vehicle", "type": "text"},
  {"id": "number_of_seats", "label": "Number of seats", "type": "number"},
  {"id": "cargo_capacity", "label": "Cargo capacity", "type": "text"},
  {"id": "airport_runs_permitted", "label": "Airport runs permitted", "type": "boolean"},
  {"id": "hotel_runs_permitted", "label": "Hotel runs permitted", "type": "boolean"},
  {"id": "driver_hotel_transport_covered", "label": "Driver hotel transport covered", "type": "boolean"},
  {"id": "grocery_hospitality_runs", "label": "Grocery/hospitality runs", "type": "boolean"},
  {"id": "prescription_pharmacy_runs", "label": "Prescription/pharmacy runs", "type": "boolean"},
  {"id": "food_pickup", "label": "Food pickup", "type": "boolean"},
  {"id": "dedicated_or_shared", "label": "Dedicated or shared runner", "type": "text"},
  {"id": "runner_after_show", "label": "Runner available after show", "type": "boolean"},
  {"id": "backup_runner_contact", "label": "Backup runner contact", "type": "contact"}
]'::jsonb, 170
WHERE NOT EXISTS (
  SELECT 1 FROM public.rider_section_templates
  WHERE workspace_id IS NULL AND template_type = 'local_crew'
);

-- ============================================
-- DOWN MIGRATION (manual — uncomment to invert)
-- ============================================
-- Removes the 4 new platform types. The 13 enriched templates are
-- NOT auto-restorable from here — re-run the seed block of
-- 111_rider_architecture_mirror.sql after deleting the platform
-- rows to get the original shallow field lists back.
-- DELETE FROM public.rider_section_templates
--   WHERE workspace_id IS NULL
--     AND template_type IN ('production', 'parking', 'press_promo', 'local_crew');
-- ============================================
