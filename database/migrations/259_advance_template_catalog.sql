-- ============================================
-- LOWPASS — Advance template catalog (ATOM)
-- Migration 259
-- ============================================
--
-- Seeds advance_templates with the full catalog from
-- docs/design/ATOM_TEMPLATE_CATALOG_2026-08-06.md: 17 sections,
-- field labels verbatim (snake_case ids derived from them).
-- 11 sections arrive as NEW platform templates (Event Basics,
-- Documents and Maps, Bus and Trailer, Driver and Hotels,
-- Personal Vehicle Parking, Venue Amenities, Dressing Rooms,
-- Runner, Comps and Ticketing, Airport and Local Distances,
-- Outdoor Venue and Final Confirmation); 5 catalog sections
-- overlap 003 seeds so heavily that the existing template is
-- ENRICHED in place instead of duplicated in the palette
-- (collision choices):
--   * ATOM "Schedule"                  -> enrich 003 'Schedule'
--   * ATOM "Catering and Hospitality"  -> enrich 003 'Hospitality'
--   * ATOM "Merchandise"               -> enrich 003 'Merch'
--   * ATOM "Security and Credentials"  -> enrich 003 'Security'
--   * ATOM "Settlement"                -> enrich 003 'Settlement'
-- Enrichment keeps every 003 field descriptor (ids/labels
-- untouched) and appends the catalog section's fields; a catalog
-- field is skipped only when an existing 003 field is a near-
-- exact duplicate (each skip is commented at the template).
--
-- CONTACT FIELDS (076 rule): migration 076
-- (advance_key_contacts_consolidation) strips contact-type fields
-- from, and forbids them in, every platform advance template
-- EXCEPT the one named exactly 'Key Contacts'
-- (advance_templates_contact_only_check — enforced as a trigger
-- in prod). Therefore:
--   * every catalog/003 field that would be contact-type is
--     seeded here as "type":"text" (ids/labels kept) in all
--     templates below;
--   * the catalog "Contacts" section (13 roles) is NOT a new
--     template — it is consolidated into the EXISTING platform
--     'Key Contacts' template via a computed append-UPDATE that
--     adds only the roles whose id or label (case-insensitive)
--     is not already on the row, leaving the 014/076 seed fields
--     untouched. If no platform 'Key Contacts' row exists, that
--     statement is a silent no-op.
-- 003's Production / Transport / Hotel / Flights / Venue Info /
-- Local Info are left untouched.
--
-- template_type: 003 uses the constant 'section' for every row
-- (it is a row-kind discriminator, NOT a per-template slug), so
-- these rows do the same. The idempotency key for platform
-- templates is therefore (workspace_id IS NULL AND name) — 003
-- itself has NO uniqueness guard (bare INSERTs), so this file
-- guards itself:
--   * new templates: INSERT .. SELECT .. WHERE NOT EXISTS on
--     (workspace_id IS NULL AND name);
--   * enrichments: UPDATE guarded by fields <> target (hits every
--     copy if 003 was ever double-pasted, which is fine).
--
-- HAND-PASTE: pasted by hand into the Supabase SQL editor (no
-- runner, no tracking table). A full re-paste is a no-op.
-- Depends on: 003_seed_advance_templates.sql (table + base rows).
-- Down-migration block at the end.
-- ============================================

-- ---- enrich: Schedule (28 fields — 1 contact->text per 076) ----
UPDATE public.advance_templates
SET fields = '[
  {"id": "doors_open", "label": "Doors", "type": "time", "required": true},
  {"id": "support_soundcheck", "label": "Support Soundcheck", "type": "time", "required": false},
  {"id": "headliner_soundcheck", "label": "Headliner Soundcheck", "type": "time", "required": false},
  {"id": "support_set", "label": "Support Set", "type": "time", "required": false},
  {"id": "changeover", "label": "Changeover", "type": "text", "required": false, "placeholder": "e.g. 30 mins"},
  {"id": "headliner_set", "label": "Headliner Set", "type": "time", "required": true},
  {"id": "curfew", "label": "Curfew", "type": "time", "required": true},
  {"id": "load_in", "label": "Load In", "type": "time", "required": false},
  {"id": "load_out", "label": "Load Out (estimated)", "type": "time", "required": false},
  {"id": "schedule_notes", "label": "Schedule Notes", "type": "textarea", "required": false},
  {"id": "earliest_bus_arrival", "label": "Earliest bus arrival", "type": "time", "required": false},
  {"id": "earliest_venue_access", "label": "Earliest venue access", "type": "time", "required": false},
  {"id": "parking_contact_on_site", "label": "Parking contact on site", "type": "text", "required": false},
  {"id": "runner_on_clock", "label": "Runner on clock", "type": "time", "required": false},
  {"id": "hospitality_available", "label": "Hospitality available", "type": "time", "required": false},
  {"id": "breakfast", "label": "Breakfast", "type": "time", "required": false},
  {"id": "headliner_load_in", "label": "Headliner load-in", "type": "time", "required": false},
  {"id": "support_load_in", "label": "Support load-in", "type": "time", "required": false},
  {"id": "lunch", "label": "Lunch", "type": "time", "required": false},
  {"id": "dinner", "label": "Dinner", "type": "time", "required": false},
  {"id": "vip_meet_and_greet", "label": "VIP/meet and greet", "type": "time", "required": false},
  {"id": "press_photo_call", "label": "Press/photo call", "type": "time", "required": false},
  {"id": "encore", "label": "Encore", "type": "time", "required": false},
  {"id": "runner_off_clock", "label": "Runner off clock", "type": "time", "required": false},
  {"id": "catering_cleared", "label": "Catering cleared", "type": "time", "required": false},
  {"id": "dressing_rooms_cleared", "label": "Dressing rooms cleared", "type": "time", "required": false},
  {"id": "bus_departure_deadline", "label": "Bus departure deadline", "type": "time", "required": false},
  {"id": "next_morning_departure_deadline", "label": "Next-morning departure deadline", "type": "time", "required": false}
]'::jsonb
WHERE workspace_id IS NULL
  AND name = 'Schedule'
  AND fields <> '[
  {"id": "doors_open", "label": "Doors", "type": "time", "required": true},
  {"id": "support_soundcheck", "label": "Support Soundcheck", "type": "time", "required": false},
  {"id": "headliner_soundcheck", "label": "Headliner Soundcheck", "type": "time", "required": false},
  {"id": "support_set", "label": "Support Set", "type": "time", "required": false},
  {"id": "changeover", "label": "Changeover", "type": "text", "required": false, "placeholder": "e.g. 30 mins"},
  {"id": "headliner_set", "label": "Headliner Set", "type": "time", "required": true},
  {"id": "curfew", "label": "Curfew", "type": "time", "required": true},
  {"id": "load_in", "label": "Load In", "type": "time", "required": false},
  {"id": "load_out", "label": "Load Out (estimated)", "type": "time", "required": false},
  {"id": "schedule_notes", "label": "Schedule Notes", "type": "textarea", "required": false},
  {"id": "earliest_bus_arrival", "label": "Earliest bus arrival", "type": "time", "required": false},
  {"id": "earliest_venue_access", "label": "Earliest venue access", "type": "time", "required": false},
  {"id": "parking_contact_on_site", "label": "Parking contact on site", "type": "text", "required": false},
  {"id": "runner_on_clock", "label": "Runner on clock", "type": "time", "required": false},
  {"id": "hospitality_available", "label": "Hospitality available", "type": "time", "required": false},
  {"id": "breakfast", "label": "Breakfast", "type": "time", "required": false},
  {"id": "headliner_load_in", "label": "Headliner load-in", "type": "time", "required": false},
  {"id": "support_load_in", "label": "Support load-in", "type": "time", "required": false},
  {"id": "lunch", "label": "Lunch", "type": "time", "required": false},
  {"id": "dinner", "label": "Dinner", "type": "time", "required": false},
  {"id": "vip_meet_and_greet", "label": "VIP/meet and greet", "type": "time", "required": false},
  {"id": "press_photo_call", "label": "Press/photo call", "type": "time", "required": false},
  {"id": "encore", "label": "Encore", "type": "time", "required": false},
  {"id": "runner_off_clock", "label": "Runner off clock", "type": "time", "required": false},
  {"id": "catering_cleared", "label": "Catering cleared", "type": "time", "required": false},
  {"id": "dressing_rooms_cleared", "label": "Dressing rooms cleared", "type": "time", "required": false},
  {"id": "bus_departure_deadline", "label": "Bus departure deadline", "type": "time", "required": false},
  {"id": "next_morning_departure_deadline", "label": "Next-morning departure deadline", "type": "time", "required": false}
]'::jsonb;

-- ---- enrich: Hospitality (34 fields — 1 contact->text per 076) ----
UPDATE public.advance_templates
SET fields = '[
  {"id": "dressing_rooms", "label": "Dressing Rooms", "type": "textarea", "required": false, "placeholder": "Number and description of available rooms"},
  {"id": "catering_buyout", "label": "Catering / Buyout", "type": "select", "required": false, "options": ["Full catering provided", "Buyout", "Partial catering + buyout", "None"]},
  {"id": "buyout_amount", "label": "Buyout Amount", "type": "currency", "required": false},
  {"id": "meal_times", "label": "Meal Times", "type": "text", "required": false, "placeholder": "e.g. Lunch 12:00, Dinner 17:00"},
  {"id": "dietary_accommodations", "label": "Dietary Accommodations", "type": "textarea", "required": false},
  {"id": "rider_status", "label": "Rider Status", "type": "select", "required": true, "options": ["Sent", "Confirmed", "Partial", "Not sent"]},
  {"id": "rider_notes", "label": "Rider Notes / Issues", "type": "textarea", "required": false},
  {"id": "hospitality_contact", "label": "Hospitality Contact", "type": "text", "required": false},
  {"id": "laundry_available", "label": "Laundry Available", "type": "boolean", "required": false},
  {"id": "catering_budget", "label": "Catering budget", "type": "currency", "required": false},
  {"id": "hospitality_budget", "label": "Hospitality budget", "type": "currency", "required": false},
  {"id": "budgets_combined_or_separate", "label": "Budgets combined or separate", "type": "text", "required": false},
  {"id": "in_house_or_outside_catering", "label": "In-house or outside catering", "type": "text", "required": false},
  {"id": "receipts_required", "label": "Receipts required", "type": "boolean", "required": false},
  {"id": "tour_party_count", "label": "Tour party count", "type": "number", "required": false},
  {"id": "support_party_count", "label": "Support party count", "type": "number", "required": false},
  {"id": "driver_included_meal_count", "label": "Driver included in meal count", "type": "boolean", "required": false},
  {"id": "breakfast_time_details", "label": "Breakfast time and details", "type": "text", "required": false},
  {"id": "lunch_time_details", "label": "Lunch time and details", "type": "text", "required": false},
  {"id": "dinner_time_menu", "label": "Dinner time and menu", "type": "text", "required": false},
  {"id": "after_show_food", "label": "After-show food", "type": "textarea", "required": false},
  {"id": "vegetarian_meals", "label": "Vegetarian meals", "type": "number", "required": false},
  {"id": "vegan_meals", "label": "Vegan meals", "type": "number", "required": false},
  {"id": "no_red_meat_pork", "label": "No red meat/pork accommodation", "type": "boolean", "required": false},
  {"id": "other_dietary_restrictions", "label": "Other dietary restrictions/allergies", "type": "textarea", "required": false},
  {"id": "dressing_room_hospitality", "label": "Dressing room hospitality", "type": "textarea", "required": false},
  {"id": "bus_stock", "label": "Bus stock", "type": "textarea", "required": false},
  {"id": "water_and_ice", "label": "Water and ice", "type": "text", "required": false},
  {"id": "coffee_and_tea", "label": "Coffee and tea", "type": "text", "required": false},
  {"id": "soft_drinks_beverages", "label": "Soft drinks/electrolytes/beverages", "type": "textarea", "required": false},
  {"id": "alcohol", "label": "Alcohol", "type": "textarea", "required": false},
  {"id": "late_arrival_food", "label": "Food available for late arrivals", "type": "boolean", "required": false},
  {"id": "driver_meals_after_sleep", "label": "Meals available for driver after sleep", "type": "boolean", "required": false},
  {"id": "meal_credentials_required", "label": "Meal credentials/wristbands required", "type": "boolean", "required": false}
]'::jsonb
WHERE workspace_id IS NULL
  AND name = 'Hospitality'
  AND fields <> '[
  {"id": "dressing_rooms", "label": "Dressing Rooms", "type": "textarea", "required": false, "placeholder": "Number and description of available rooms"},
  {"id": "catering_buyout", "label": "Catering / Buyout", "type": "select", "required": false, "options": ["Full catering provided", "Buyout", "Partial catering + buyout", "None"]},
  {"id": "buyout_amount", "label": "Buyout Amount", "type": "currency", "required": false},
  {"id": "meal_times", "label": "Meal Times", "type": "text", "required": false, "placeholder": "e.g. Lunch 12:00, Dinner 17:00"},
  {"id": "dietary_accommodations", "label": "Dietary Accommodations", "type": "textarea", "required": false},
  {"id": "rider_status", "label": "Rider Status", "type": "select", "required": true, "options": ["Sent", "Confirmed", "Partial", "Not sent"]},
  {"id": "rider_notes", "label": "Rider Notes / Issues", "type": "textarea", "required": false},
  {"id": "hospitality_contact", "label": "Hospitality Contact", "type": "text", "required": false},
  {"id": "laundry_available", "label": "Laundry Available", "type": "boolean", "required": false},
  {"id": "catering_budget", "label": "Catering budget", "type": "currency", "required": false},
  {"id": "hospitality_budget", "label": "Hospitality budget", "type": "currency", "required": false},
  {"id": "budgets_combined_or_separate", "label": "Budgets combined or separate", "type": "text", "required": false},
  {"id": "in_house_or_outside_catering", "label": "In-house or outside catering", "type": "text", "required": false},
  {"id": "receipts_required", "label": "Receipts required", "type": "boolean", "required": false},
  {"id": "tour_party_count", "label": "Tour party count", "type": "number", "required": false},
  {"id": "support_party_count", "label": "Support party count", "type": "number", "required": false},
  {"id": "driver_included_meal_count", "label": "Driver included in meal count", "type": "boolean", "required": false},
  {"id": "breakfast_time_details", "label": "Breakfast time and details", "type": "text", "required": false},
  {"id": "lunch_time_details", "label": "Lunch time and details", "type": "text", "required": false},
  {"id": "dinner_time_menu", "label": "Dinner time and menu", "type": "text", "required": false},
  {"id": "after_show_food", "label": "After-show food", "type": "textarea", "required": false},
  {"id": "vegetarian_meals", "label": "Vegetarian meals", "type": "number", "required": false},
  {"id": "vegan_meals", "label": "Vegan meals", "type": "number", "required": false},
  {"id": "no_red_meat_pork", "label": "No red meat/pork accommodation", "type": "boolean", "required": false},
  {"id": "other_dietary_restrictions", "label": "Other dietary restrictions/allergies", "type": "textarea", "required": false},
  {"id": "dressing_room_hospitality", "label": "Dressing room hospitality", "type": "textarea", "required": false},
  {"id": "bus_stock", "label": "Bus stock", "type": "textarea", "required": false},
  {"id": "water_and_ice", "label": "Water and ice", "type": "text", "required": false},
  {"id": "coffee_and_tea", "label": "Coffee and tea", "type": "text", "required": false},
  {"id": "soft_drinks_beverages", "label": "Soft drinks/electrolytes/beverages", "type": "textarea", "required": false},
  {"id": "alcohol", "label": "Alcohol", "type": "textarea", "required": false},
  {"id": "late_arrival_food", "label": "Food available for late arrivals", "type": "boolean", "required": false},
  {"id": "driver_meals_after_sleep", "label": "Meals available for driver after sleep", "type": "boolean", "required": false},
  {"id": "meal_credentials_required", "label": "Meal credentials/wristbands required", "type": "boolean", "required": false}
]'::jsonb;

-- ---- enrich: Merch (26 fields — 1 contact->text per 076) ----
UPDATE public.advance_templates
SET fields = '[
  {"id": "merch_split", "label": "Merch Split", "type": "text", "required": false, "placeholder": "e.g. 80/20 in favour of artist"},
  {"id": "merch_location", "label": "Merch Location", "type": "text", "required": false},
  {"id": "merch_seller", "label": "Merch Seller", "type": "select", "required": false, "options": ["Venue provides", "Own seller", "Self-serve"]},
  {"id": "merch_table_provided", "label": "Table/Display Provided", "type": "boolean", "required": false},
  {"id": "card_payments", "label": "Card Payments Available", "type": "boolean", "required": false},
  {"id": "merch_contact", "label": "Merch Contact", "type": "text", "required": false},
  {"id": "merch_notes", "label": "Merch Notes", "type": "textarea", "required": false},
  {"id": "merch_load_in_time", "label": "Merchandise load-in time", "type": "time", "required": false},
  {"id": "indoor_outdoor_covered", "label": "Indoor/outdoor/covered", "type": "text", "required": false},
  {"id": "seller_fee", "label": "Seller fee/hourly rate/minimum", "type": "text", "required": false},
  {"id": "soft_goods_split", "label": "Soft goods split", "type": "number", "required": false},
  {"id": "hard_goods_split", "label": "Hard goods split", "type": "number", "required": false},
  {"id": "sales_tax_retained_by", "label": "Who retains/remits sales tax", "type": "select", "required": false, "options": ["Venue", "Artist"]},
  {"id": "sales_tax_percentage", "label": "Sales tax percentage", "type": "number", "required": false},
  {"id": "tax_deducted_before_after_split", "label": "Tax deducted before or after split", "type": "text", "required": false},
  {"id": "venue_or_artist_pos", "label": "Venue or artist POS", "type": "text", "required": false},
  {"id": "cashless_venue", "label": "Cashless venue", "type": "boolean", "required": false},
  {"id": "cash_permitted", "label": "Cash permitted", "type": "boolean", "required": false},
  {"id": "wifi_power_at_merch", "label": "Wi-Fi and power at merch", "type": "boolean", "required": false},
  {"id": "tables_chairs_grid_display", "label": "Tables/chairs/grid/display wall", "type": "textarea", "required": false},
  {"id": "lighting_tablecloth_hangers", "label": "Lighting/tablecloth/hangers", "type": "textarea", "required": false},
  {"id": "security_at_merch", "label": "Security at merch", "type": "boolean", "required": false},
  {"id": "inventory_count_required", "label": "Inventory count required", "type": "boolean", "required": false},
  {"id": "venue_counts_in_out", "label": "Venue counts in and out", "type": "boolean", "required": false},
  {"id": "merch_settlement_time_contact", "label": "Merch settlement time and contact", "type": "text", "required": false},
  {"id": "outdoor_weather_contingency", "label": "Outdoor weather contingency", "type": "textarea", "required": false}
]'::jsonb
WHERE workspace_id IS NULL
  AND name = 'Merch'
  AND fields <> '[
  {"id": "merch_split", "label": "Merch Split", "type": "text", "required": false, "placeholder": "e.g. 80/20 in favour of artist"},
  {"id": "merch_location", "label": "Merch Location", "type": "text", "required": false},
  {"id": "merch_seller", "label": "Merch Seller", "type": "select", "required": false, "options": ["Venue provides", "Own seller", "Self-serve"]},
  {"id": "merch_table_provided", "label": "Table/Display Provided", "type": "boolean", "required": false},
  {"id": "card_payments", "label": "Card Payments Available", "type": "boolean", "required": false},
  {"id": "merch_contact", "label": "Merch Contact", "type": "text", "required": false},
  {"id": "merch_notes", "label": "Merch Notes", "type": "textarea", "required": false},
  {"id": "merch_load_in_time", "label": "Merchandise load-in time", "type": "time", "required": false},
  {"id": "indoor_outdoor_covered", "label": "Indoor/outdoor/covered", "type": "text", "required": false},
  {"id": "seller_fee", "label": "Seller fee/hourly rate/minimum", "type": "text", "required": false},
  {"id": "soft_goods_split", "label": "Soft goods split", "type": "number", "required": false},
  {"id": "hard_goods_split", "label": "Hard goods split", "type": "number", "required": false},
  {"id": "sales_tax_retained_by", "label": "Who retains/remits sales tax", "type": "select", "required": false, "options": ["Venue", "Artist"]},
  {"id": "sales_tax_percentage", "label": "Sales tax percentage", "type": "number", "required": false},
  {"id": "tax_deducted_before_after_split", "label": "Tax deducted before or after split", "type": "text", "required": false},
  {"id": "venue_or_artist_pos", "label": "Venue or artist POS", "type": "text", "required": false},
  {"id": "cashless_venue", "label": "Cashless venue", "type": "boolean", "required": false},
  {"id": "cash_permitted", "label": "Cash permitted", "type": "boolean", "required": false},
  {"id": "wifi_power_at_merch", "label": "Wi-Fi and power at merch", "type": "boolean", "required": false},
  {"id": "tables_chairs_grid_display", "label": "Tables/chairs/grid/display wall", "type": "textarea", "required": false},
  {"id": "lighting_tablecloth_hangers", "label": "Lighting/tablecloth/hangers", "type": "textarea", "required": false},
  {"id": "security_at_merch", "label": "Security at merch", "type": "boolean", "required": false},
  {"id": "inventory_count_required", "label": "Inventory count required", "type": "boolean", "required": false},
  {"id": "venue_counts_in_out", "label": "Venue counts in and out", "type": "boolean", "required": false},
  {"id": "merch_settlement_time_contact", "label": "Merch settlement time and contact", "type": "text", "required": false},
  {"id": "outdoor_weather_contingency", "label": "Outdoor weather contingency", "type": "textarea", "required": false}
]'::jsonb;

-- ---- enrich: Security (28 fields — 1 contact->text per 076) ----
UPDATE public.advance_templates
SET fields = '[
  {"id": "security_company", "label": "Security Company", "type": "text", "required": false},
  {"id": "security_contact", "label": "Security Contact", "type": "text", "required": false},
  {"id": "barrier_setup", "label": "Barrier Setup", "type": "text", "required": false},
  {"id": "guest_list_process", "label": "Guest List Process", "type": "textarea", "required": false},
  {"id": "wristband_system", "label": "Wristband / Pass System", "type": "text", "required": false},
  {"id": "security_notes", "label": "Security Notes", "type": "textarea", "required": false},
  {"id": "house_security_protocol_received", "label": "House security protocol received", "type": "boolean", "required": false},
  {"id": "tour_security_protocol_acknowledged", "label": "Tour security protocol acknowledged", "type": "boolean", "required": false},
  {"id": "pass_sheet_acknowledged", "label": "\"Pass sheet\" acknowledged", "type": "boolean", "required": false},
  {"id": "credential_types_approved", "label": "Credential types approved", "type": "text", "required": false},
  {"id": "credentials_printed_by", "label": "Who prints credentials", "type": "select", "required": false, "options": ["Venue", "Tour"]},
  {"id": "credential_distribution_location", "label": "Credential distribution location", "type": "text", "required": false},
  {"id": "backstage_access_controlled", "label": "Backstage access controlled", "type": "boolean", "required": false},
  {"id": "dressing_room_access_controlled", "label": "Dressing room access controlled", "type": "boolean", "required": false},
  {"id": "stage_access_controlled", "label": "Stage access controlled", "type": "boolean", "required": false},
  {"id": "bus_parking_secured", "label": "Bus parking secured", "type": "boolean", "required": false},
  {"id": "merchandise_security", "label": "Merchandise security", "type": "boolean", "required": false},
  {"id": "barricade_pit_security", "label": "Barricade/pit/stage stair security", "type": "textarea", "required": false},
  {"id": "artist_arrival_exit_route", "label": "Artist arrival and exit route", "type": "textarea", "required": false},
  {"id": "guest_credential_procedure", "label": "Guest credential procedure", "type": "textarea", "required": false},
  {"id": "photo_video_restrictions", "label": "Photo/video restrictions", "type": "textarea", "required": false},
  {"id": "bag_policy", "label": "Bag policy", "type": "textarea", "required": false},
  {"id": "reentry_policy", "label": "Re-entry policy", "type": "text", "required": false},
  {"id": "emergency_evacuation_plan", "label": "Emergency evacuation plan", "type": "textarea", "required": false},
  {"id": "severe_weather_shelter", "label": "Severe weather shelter", "type": "text", "required": false},
  {"id": "medical_ems_location", "label": "Medical staff/EMS location", "type": "text", "required": false},
  {"id": "nearest_hospital", "label": "Nearest hospital", "type": "text", "required": false},
  {"id": "incident_reporting_procedure", "label": "Incident reporting procedure", "type": "textarea", "required": false}
]'::jsonb
WHERE workspace_id IS NULL
  AND name = 'Security'
  AND fields <> '[
  {"id": "security_company", "label": "Security Company", "type": "text", "required": false},
  {"id": "security_contact", "label": "Security Contact", "type": "text", "required": false},
  {"id": "barrier_setup", "label": "Barrier Setup", "type": "text", "required": false},
  {"id": "guest_list_process", "label": "Guest List Process", "type": "textarea", "required": false},
  {"id": "wristband_system", "label": "Wristband / Pass System", "type": "text", "required": false},
  {"id": "security_notes", "label": "Security Notes", "type": "textarea", "required": false},
  {"id": "house_security_protocol_received", "label": "House security protocol received", "type": "boolean", "required": false},
  {"id": "tour_security_protocol_acknowledged", "label": "Tour security protocol acknowledged", "type": "boolean", "required": false},
  {"id": "pass_sheet_acknowledged", "label": "\"Pass sheet\" acknowledged", "type": "boolean", "required": false},
  {"id": "credential_types_approved", "label": "Credential types approved", "type": "text", "required": false},
  {"id": "credentials_printed_by", "label": "Who prints credentials", "type": "select", "required": false, "options": ["Venue", "Tour"]},
  {"id": "credential_distribution_location", "label": "Credential distribution location", "type": "text", "required": false},
  {"id": "backstage_access_controlled", "label": "Backstage access controlled", "type": "boolean", "required": false},
  {"id": "dressing_room_access_controlled", "label": "Dressing room access controlled", "type": "boolean", "required": false},
  {"id": "stage_access_controlled", "label": "Stage access controlled", "type": "boolean", "required": false},
  {"id": "bus_parking_secured", "label": "Bus parking secured", "type": "boolean", "required": false},
  {"id": "merchandise_security", "label": "Merchandise security", "type": "boolean", "required": false},
  {"id": "barricade_pit_security", "label": "Barricade/pit/stage stair security", "type": "textarea", "required": false},
  {"id": "artist_arrival_exit_route", "label": "Artist arrival and exit route", "type": "textarea", "required": false},
  {"id": "guest_credential_procedure", "label": "Guest credential procedure", "type": "textarea", "required": false},
  {"id": "photo_video_restrictions", "label": "Photo/video restrictions", "type": "textarea", "required": false},
  {"id": "bag_policy", "label": "Bag policy", "type": "textarea", "required": false},
  {"id": "reentry_policy", "label": "Re-entry policy", "type": "text", "required": false},
  {"id": "emergency_evacuation_plan", "label": "Emergency evacuation plan", "type": "textarea", "required": false},
  {"id": "severe_weather_shelter", "label": "Severe weather shelter", "type": "text", "required": false},
  {"id": "medical_ems_location", "label": "Medical staff/EMS location", "type": "text", "required": false},
  {"id": "nearest_hospital", "label": "Nearest hospital", "type": "text", "required": false},
  {"id": "incident_reporting_procedure", "label": "Incident reporting procedure", "type": "textarea", "required": false}
]'::jsonb;

-- ---- enrich: Settlement (29 fields — 1 contact->text per 076) ----
UPDATE public.advance_templates
SET fields = '[
  {"id": "deal_type", "label": "Deal Type", "type": "select", "required": false, "options": ["Guarantee", "Guarantee + bonus", "Door deal", "Flat fee", "Festival fee"]},
  {"id": "guarantee", "label": "Guarantee", "type": "currency", "required": false},
  {"id": "bonus_threshold", "label": "Bonus Threshold", "type": "text", "required": false},
  {"id": "bonus_split", "label": "Bonus Split", "type": "text", "required": false, "placeholder": "e.g. 85/15 after expenses"},
  {"id": "ticket_price", "label": "Ticket Price", "type": "currency", "required": false},
  {"id": "ticket_capacity", "label": "Ticket Capacity", "type": "number", "required": false},
  {"id": "deposit_received", "label": "Deposit Received", "type": "boolean", "required": false},
  {"id": "deposit_amount", "label": "Deposit Amount", "type": "currency", "required": false},
  {"id": "settlement_notes", "label": "Settlement Notes", "type": "textarea", "required": false},
  {"id": "settlement_contact_and_cell", "label": "Settlement contact and cell", "type": "text", "required": false},
  {"id": "settlement_location", "label": "Settlement location", "type": "text", "required": false},
  {"id": "settlement_time", "label": "Settlement time", "type": "time", "required": false},
  {"id": "before_or_after_show", "label": "Before or after show", "type": "text", "required": false},
  {"id": "settlement_method", "label": "Settlement method", "type": "select", "required": false, "options": ["Cash", "Wire", "Check"]},
  {"id": "wire_instructions_sent", "label": "Wire instructions sent", "type": "boolean", "required": false},
  {"id": "wire_recipient_confirmed", "label": "Wire recipient confirmed", "type": "boolean", "required": false},
  {"id": "remaining_guarantee", "label": "Remaining guarantee", "type": "currency", "required": false},
  {"id": "current_ticket_count", "label": "Current ticket count", "type": "number", "required": false},
  {"id": "final_drop_count", "label": "Final drop count", "type": "number", "required": false},
  {"id": "gross_box_office", "label": "Gross box office", "type": "currency", "required": false},
  {"id": "approved_expenses", "label": "Approved expenses", "type": "textarea", "required": false},
  {"id": "receipts_required", "label": "Receipts required", "type": "boolean", "required": false},
  {"id": "facility_ticket_cc_fees", "label": "Facility fee/ticket fee/credit-card percentage", "type": "text", "required": false},
  {"id": "taxes", "label": "Taxes", "type": "text", "required": false},
  {"id": "support_catering_hotel_expenses", "label": "Support/catering/hotel expenses", "type": "textarea", "required": false},
  {"id": "merch_settlement_separate", "label": "Merch settlement separate", "type": "boolean", "required": false},
  {"id": "final_settlement_sheet_provided", "label": "Final settlement sheet provided", "type": "boolean", "required": false},
  {"id": "wire_confirmation_provided", "label": "Wire confirmation provided", "type": "boolean", "required": false},
  {"id": "expected_wire_date", "label": "Expected wire date", "type": "text", "required": false}
]'::jsonb
WHERE workspace_id IS NULL
  AND name = 'Settlement'
  AND fields <> '[
  {"id": "deal_type", "label": "Deal Type", "type": "select", "required": false, "options": ["Guarantee", "Guarantee + bonus", "Door deal", "Flat fee", "Festival fee"]},
  {"id": "guarantee", "label": "Guarantee", "type": "currency", "required": false},
  {"id": "bonus_threshold", "label": "Bonus Threshold", "type": "text", "required": false},
  {"id": "bonus_split", "label": "Bonus Split", "type": "text", "required": false, "placeholder": "e.g. 85/15 after expenses"},
  {"id": "ticket_price", "label": "Ticket Price", "type": "currency", "required": false},
  {"id": "ticket_capacity", "label": "Ticket Capacity", "type": "number", "required": false},
  {"id": "deposit_received", "label": "Deposit Received", "type": "boolean", "required": false},
  {"id": "deposit_amount", "label": "Deposit Amount", "type": "currency", "required": false},
  {"id": "settlement_notes", "label": "Settlement Notes", "type": "textarea", "required": false},
  {"id": "settlement_contact_and_cell", "label": "Settlement contact and cell", "type": "text", "required": false},
  {"id": "settlement_location", "label": "Settlement location", "type": "text", "required": false},
  {"id": "settlement_time", "label": "Settlement time", "type": "time", "required": false},
  {"id": "before_or_after_show", "label": "Before or after show", "type": "text", "required": false},
  {"id": "settlement_method", "label": "Settlement method", "type": "select", "required": false, "options": ["Cash", "Wire", "Check"]},
  {"id": "wire_instructions_sent", "label": "Wire instructions sent", "type": "boolean", "required": false},
  {"id": "wire_recipient_confirmed", "label": "Wire recipient confirmed", "type": "boolean", "required": false},
  {"id": "remaining_guarantee", "label": "Remaining guarantee", "type": "currency", "required": false},
  {"id": "current_ticket_count", "label": "Current ticket count", "type": "number", "required": false},
  {"id": "final_drop_count", "label": "Final drop count", "type": "number", "required": false},
  {"id": "gross_box_office", "label": "Gross box office", "type": "currency", "required": false},
  {"id": "approved_expenses", "label": "Approved expenses", "type": "textarea", "required": false},
  {"id": "receipts_required", "label": "Receipts required", "type": "boolean", "required": false},
  {"id": "facility_ticket_cc_fees", "label": "Facility fee/ticket fee/credit-card percentage", "type": "text", "required": false},
  {"id": "taxes", "label": "Taxes", "type": "text", "required": false},
  {"id": "support_catering_hotel_expenses", "label": "Support/catering/hotel expenses", "type": "textarea", "required": false},
  {"id": "merch_settlement_separate", "label": "Merch settlement separate", "type": "boolean", "required": false},
  {"id": "final_settlement_sheet_provided", "label": "Final settlement sheet provided", "type": "boolean", "required": false},
  {"id": "wire_confirmation_provided", "label": "Wire confirmation provided", "type": "boolean", "required": false},
  {"id": "expected_wire_date", "label": "Expected wire date", "type": "text", "required": false}
]'::jsonb;

-- ---- enrich: Key Contacts (append the catalog "Contacts" section,
--      13 roles; existing 014/076 fields untouched; a role is
--      skipped when its id or label already exists on the row) ----
UPDATE public.advance_templates t
SET fields = t.fields || COALESCE((
  SELECT jsonb_agg(nf.f ORDER BY nf.ord)
  FROM (VALUES
    (1, '{"id": "promoter_buyer", "label": "Promoter/buyer", "type": "contact", "required": false}'::jsonb),
    (2, '{"id": "primary_advance_contact", "label": "Primary advance contact", "type": "contact", "required": false}'::jsonb),
    (3, '{"id": "day_of_show_venue_contact", "label": "Day-of-show venue contact", "type": "contact", "required": false}'::jsonb),
    (4, '{"id": "production_contact", "label": "Production contact", "type": "contact", "required": false}'::jsonb),
    (5, '{"id": "hospitality_catering_contact", "label": "Hospitality/catering contact", "type": "contact", "required": false}'::jsonb),
    (6, '{"id": "runner_contact", "label": "Runner contact", "type": "contact", "required": false}'::jsonb),
    (7, '{"id": "security_lead", "label": "Security lead", "type": "contact", "required": false}'::jsonb),
    (8, '{"id": "box_office_ticketing_contact", "label": "Box office/ticketing contact", "type": "contact", "required": false}'::jsonb),
    (9, '{"id": "merchandise_contact", "label": "Merchandise contact", "type": "contact", "required": false}'::jsonb),
    (10, '{"id": "settlement_contact", "label": "Settlement contact", "type": "contact", "required": false}'::jsonb),
    (11, '{"id": "hotel_contact", "label": "Hotel contact", "type": "contact", "required": false}'::jsonb),
    (12, '{"id": "parking_site_operations_contact", "label": "Parking/site operations contact", "type": "contact", "required": false}'::jsonb),
    (13, '{"id": "emergency_medical_contact", "label": "Emergency/medical contact", "type": "contact", "required": false}'::jsonb)
  ) AS nf(ord, f)
  WHERE NOT EXISTS (
    SELECT 1 FROM jsonb_array_elements(t.fields) e
    WHERE e->>'id' = nf.f->>'id'
       OR lower(e->>'label') = lower(nf.f->>'label')
  )
), '[]'::jsonb)
WHERE t.workspace_id IS NULL
  AND t.name = 'Key Contacts'
  AND EXISTS (
    SELECT 1
    FROM (VALUES
    (1, '{"id": "promoter_buyer", "label": "Promoter/buyer", "type": "contact", "required": false}'::jsonb),
    (2, '{"id": "primary_advance_contact", "label": "Primary advance contact", "type": "contact", "required": false}'::jsonb),
    (3, '{"id": "day_of_show_venue_contact", "label": "Day-of-show venue contact", "type": "contact", "required": false}'::jsonb),
    (4, '{"id": "production_contact", "label": "Production contact", "type": "contact", "required": false}'::jsonb),
    (5, '{"id": "hospitality_catering_contact", "label": "Hospitality/catering contact", "type": "contact", "required": false}'::jsonb),
    (6, '{"id": "runner_contact", "label": "Runner contact", "type": "contact", "required": false}'::jsonb),
    (7, '{"id": "security_lead", "label": "Security lead", "type": "contact", "required": false}'::jsonb),
    (8, '{"id": "box_office_ticketing_contact", "label": "Box office/ticketing contact", "type": "contact", "required": false}'::jsonb),
    (9, '{"id": "merchandise_contact", "label": "Merchandise contact", "type": "contact", "required": false}'::jsonb),
    (10, '{"id": "settlement_contact", "label": "Settlement contact", "type": "contact", "required": false}'::jsonb),
    (11, '{"id": "hotel_contact", "label": "Hotel contact", "type": "contact", "required": false}'::jsonb),
    (12, '{"id": "parking_site_operations_contact", "label": "Parking/site operations contact", "type": "contact", "required": false}'::jsonb),
    (13, '{"id": "emergency_medical_contact", "label": "Emergency/medical contact", "type": "contact", "required": false}'::jsonb)
  ) AS nf(ord, f)
  WHERE NOT EXISTS (
    SELECT 1 FROM jsonb_array_elements(t.fields) e
    WHERE e->>'id' = nf.f->>'id'
       OR lower(e->>'label') = lower(nf.f->>'label')
  )
  );

-- ---- new template: Event Basics (18 fields) ----
INSERT INTO public.advance_templates
  (workspace_id, template_type, name, description, icon, fields, suggested_for_day_types)
SELECT NULL, 'section', 'Event Basics', 'Core event facts: date, capacity, billing, curfews, sale status', 'building',
  '[
  {"id": "event_date", "label": "Event date", "type": "text", "required": false},
  {"id": "venue_name", "label": "Venue name", "type": "text", "required": true},
  {"id": "venue_address", "label": "Venue address (correct GPS / artist entrance)", "type": "text", "required": false},
  {"id": "venue_website", "label": "Venue website", "type": "url", "required": false},
  {"id": "indoor_outdoor", "label": "Indoor/outdoor", "type": "select", "required": false, "options": ["Indoor", "Outdoor", "Both"]},
  {"id": "rain_or_shine", "label": "Rain or shine", "type": "boolean", "required": false},
  {"id": "capacity", "label": "Capacity", "type": "number", "required": false},
  {"id": "sellable_capacity", "label": "Sellable capacity", "type": "number", "required": false},
  {"id": "age_limit", "label": "Age limit", "type": "text", "required": false},
  {"id": "billing", "label": "Billing", "type": "text", "required": false},
  {"id": "support_acts", "label": "Support act(s)", "type": "text", "required": false},
  {"id": "doors", "label": "Doors", "type": "time", "required": false},
  {"id": "show_start", "label": "Show start", "type": "time", "required": false},
  {"id": "venue_curfew", "label": "Venue curfew", "type": "time", "required": false},
  {"id": "sound_curfew", "label": "Sound curfew", "type": "time", "required": false},
  {"id": "expected_attendance", "label": "Expected attendance", "type": "number", "required": false},
  {"id": "current_presale", "label": "Current presale at time of advance", "type": "number", "required": false},
  {"id": "one_week_out_update_due", "label": "One-week-out ticket update due", "type": "text", "required": false}
]'::jsonb, ARRAY['show', 'festival']
WHERE NOT EXISTS (
  SELECT 1 FROM public.advance_templates
  WHERE workspace_id IS NULL AND name = 'Event Basics'
);

-- ---- new template: Documents and Maps (15 fields) ----
INSERT INTO public.advance_templates
  (workspace_id, template_type, name, description, icon, fields, suggested_for_day_types)
SELECT NULL, 'section', 'Documents and Maps', 'Received/sent status of every advance document', 'map-pin',
  '[
  {"id": "venue_tech_pack_received", "label": "Venue tech pack received", "type": "boolean", "required": false},
  {"id": "venue_contact_sheet_received", "label": "Venue contact sheet received", "type": "boolean", "required": false},
  {"id": "venue_map_received", "label": "Venue map received", "type": "boolean", "required": false},
  {"id": "bus_trailer_parking_map_received", "label": "Bus and trailer parking map received", "type": "boolean", "required": false},
  {"id": "detailed_arrival_instructions_received", "label": "Detailed arrival instructions received", "type": "boolean", "required": false},
  {"id": "marked_aerial_image_received", "label": "Marked aerial image received", "type": "boolean", "required": false},
  {"id": "dressing_room_layout_received", "label": "Dressing room layout received", "type": "boolean", "required": false},
  {"id": "hospitality_information_received", "label": "Hospitality information received", "type": "boolean", "required": false},
  {"id": "catering_plan_menu_received", "label": "Catering plan/menu received", "type": "boolean", "required": false},
  {"id": "house_security_protocol_received", "label": "House security protocol received", "type": "boolean", "required": false},
  {"id": "tour_security_protocol_sent", "label": "Tour security protocol sent", "type": "boolean", "required": false},
  {"id": "pass_sheet_sent", "label": "Credential/pass reference sheet (\"pass sheet\") sent", "type": "boolean", "required": false},
  {"id": "settlement_worksheet_received", "label": "Settlement worksheet/template received", "type": "boolean", "required": false},
  {"id": "final_run_of_show_received", "label": "Final run of show received", "type": "boolean", "required": false},
  {"id": "outdoor_weather_plan_received", "label": "Outdoor weather/emergency plan received", "type": "boolean", "required": false}
]'::jsonb, ARRAY['show', 'festival']
WHERE NOT EXISTS (
  SELECT 1 FROM public.advance_templates
  WHERE workspace_id IS NULL AND name = 'Documents and Maps'
);

-- ---- new template: Bus and Trailer (32 fields — 1 contact->text per 076) ----
INSERT INTO public.advance_templates
  (workspace_id, template_type, name, description, icon, fields, suggested_for_day_types)
SELECT NULL, 'section', 'Bus and Trailer', 'Bus and trailer logistics: arrival, parking, power, water', 'truck',
  '[
  {"id": "vehicle_configuration", "label": "Vehicle configuration", "type": "text", "required": false},
  {"id": "bus_length", "label": "Bus length", "type": "text", "required": false},
  {"id": "trailer_length", "label": "Trailer length", "type": "text", "required": false},
  {"id": "total_combined_length", "label": "Total combined length", "type": "text", "required": false},
  {"id": "earliest_bus_arrival", "label": "Earliest bus arrival", "type": "time", "required": false},
  {"id": "earliest_venue_access", "label": "Earliest venue access", "type": "time", "required": false},
  {"id": "can_bus_arrive_day_before", "label": "Can bus arrive the day before", "type": "boolean", "required": false},
  {"id": "bus_trailer_remain_connected", "label": "Can bus and trailer remain connected", "type": "boolean", "required": false},
  {"id": "bus_parked_one_location", "label": "Can bus remain parked in one location all day", "type": "boolean", "required": false},
  {"id": "bus_move_after_load_in", "label": "Will bus need to move after load-in", "type": "boolean", "required": false},
  {"id": "overnight_parking_permitted", "label": "Overnight parking permitted", "type": "boolean", "required": false},
  {"id": "latest_departure_time", "label": "Latest departure time", "type": "time", "required": false},
  {"id": "next_morning_departure_time", "label": "Required next-morning departure time", "type": "time", "required": false},
  {"id": "parking_surface", "label": "Parking surface", "type": "text", "required": false},
  {"id": "parking_area_level", "label": "Parking area level", "type": "boolean", "required": false},
  {"id": "turning_clearance_confirmed", "label": "Turning clearance confirmed", "type": "boolean", "required": false},
  {"id": "low_branches_gates_weight_restrictions", "label": "Low branches/gates/weight restrictions", "type": "textarea", "required": false},
  {"id": "gate_code", "label": "Gate code", "type": "text", "required": false},
  {"id": "correct_entrance", "label": "Correct entrance", "type": "text", "required": false},
  {"id": "arrival_contact_and_cell", "label": "Arrival contact and cell", "type": "text", "required": false},
  {"id": "escort_required", "label": "Escort required", "type": "boolean", "required": false},
  {"id": "shore_power_available", "label": "Shore power available", "type": "boolean", "required": false},
  {"id": "shore_power_amperage_connection", "label": "Shore power amperage/connection", "type": "text", "required": false},
  {"id": "shore_power_location", "label": "Shore power location", "type": "text", "required": false},
  {"id": "generator_permitted", "label": "Generator permitted", "type": "boolean", "required": false},
  {"id": "generator_restrictions_quiet_hours", "label": "Generator restrictions/quiet hours", "type": "textarea", "required": false},
  {"id": "water_hookup_available", "label": "Water hookup available", "type": "boolean", "required": false},
  {"id": "water_hose_connection_details", "label": "Water hose connection details", "type": "text", "required": false},
  {"id": "potable_water_confirmed", "label": "Potable water confirmed", "type": "boolean", "required": false},
  {"id": "trash_disposal_available", "label": "Trash disposal available", "type": "boolean", "required": false},
  {"id": "bus_restroom_servicing_available", "label": "Bus restroom servicing available", "type": "boolean", "required": false},
  {"id": "trailer_security_overnight", "label": "Trailer security overnight", "type": "boolean", "required": false}
]'::jsonb, ARRAY['show', 'travel', 'festival']
WHERE NOT EXISTS (
  SELECT 1 FROM public.advance_templates
  WHERE workspace_id IS NULL AND name = 'Bus and Trailer'
);

-- ---- new template: Driver and Hotels (26 fields) ----
INSERT INTO public.advance_templates
  (workspace_id, template_type, name, description, icon, fields, suggested_for_day_types)
SELECT NULL, 'section', 'Driver and Hotels', 'Driver rooms, hotel rates, check-in/out, bus parking at hotel', 'bed',
  '[
  {"id": "driver_name", "label": "Driver name", "type": "text", "required": false},
  {"id": "quiet_driver_room_required", "label": "Quiet driver room required", "type": "boolean", "required": false},
  {"id": "hotel_property", "label": "Hotel property", "type": "text", "required": false},
  {"id": "hotel_address", "label": "Hotel address", "type": "text", "required": false},
  {"id": "hotel_phone_contact", "label": "Hotel phone/contact", "type": "text", "required": false},
  {"id": "venue_promoter_rate", "label": "Venue/promoter rate", "type": "currency", "required": false},
  {"id": "room_rate_incl_taxes_fees", "label": "Room rate including taxes and fees", "type": "currency", "required": false},
  {"id": "early_check_in_requested", "label": "Early check-in requested", "type": "boolean", "required": false},
  {"id": "early_check_in_confirmed", "label": "Early check-in confirmed", "type": "boolean", "required": false},
  {"id": "late_checkout_requested", "label": "Late checkout requested", "type": "boolean", "required": false},
  {"id": "late_checkout_confirmed", "label": "Late checkout confirmed", "type": "boolean", "required": false},
  {"id": "reservation_confirmation_number", "label": "Reservation confirmation number", "type": "text", "required": false},
  {"id": "room_payment_method", "label": "Room payment method", "type": "text", "required": false},
  {"id": "incidentals_responsibility", "label": "Incidentals responsibility", "type": "text", "required": false},
  {"id": "distance_venue_to_hotel", "label": "Distance from venue to hotel", "type": "text", "required": false},
  {"id": "venue_to_hotel_drive_time", "label": "Estimated venue-to-hotel drive time", "type": "text", "required": false},
  {"id": "runner_transport_hotel", "label": "Runner transport to/from hotel", "type": "boolean", "required": false},
  {"id": "driver_shower_before_check_in", "label": "Driver shower available before hotel check-in", "type": "boolean", "required": false},
  {"id": "driver_breakfast_available", "label": "Driver breakfast available", "type": "boolean", "required": false},
  {"id": "driver_meal_included", "label": "Driver meal included", "type": "boolean", "required": false},
  {"id": "nearby_hotel_recommendations", "label": "Nearby hotel recommendations", "type": "textarea", "required": false},
  {"id": "hotel_bus_trailer_parking", "label": "Hotel with bus and trailer parking", "type": "boolean", "required": false},
  {"id": "bus_trailer_connected_at_hotel", "label": "Bus and trailer can remain connected at hotel", "type": "boolean", "required": false},
  {"id": "hotel_bus_parking_confirmed_writing", "label": "Hotel bus parking confirmed in writing", "type": "boolean", "required": false},
  {"id": "cleanup_shower_rooms_needed", "label": "Cleanup/shower rooms needed", "type": "boolean", "required": false},
  {"id": "cleanup_shower_rooms_confirmed", "label": "Cleanup/shower rooms confirmed", "type": "boolean", "required": false}
]'::jsonb, ARRAY['show', 'travel', 'festival']
WHERE NOT EXISTS (
  SELECT 1 FROM public.advance_templates
  WHERE workspace_id IS NULL AND name = 'Driver and Hotels'
);

-- ---- new template: Personal Vehicle Parking (10 fields) ----
INSERT INTO public.advance_templates
  (workspace_id, template_type, name, description, icon, fields, suggested_for_day_types)
SELECT NULL, 'section', 'Personal Vehicle Parking', 'Band and crew personal vehicle parking', 'map-pin',
  '[
  {"id": "num_personal_vehicles", "label": "Number of artist/crew personal vehicles", "type": "number", "required": false},
  {"id": "num_support_vehicles", "label": "Number of support vehicles", "type": "number", "required": false},
  {"id": "personal_vehicle_parking_location", "label": "Personal vehicle parking location", "type": "text", "required": false},
  {"id": "parking_passes_required", "label": "Parking passes required", "type": "boolean", "required": false},
  {"id": "parking_fee", "label": "Parking fee", "type": "currency", "required": false},
  {"id": "overnight_parking_permitted", "label": "Overnight parking permitted", "type": "boolean", "required": false},
  {"id": "secure_parking_available", "label": "Secure parking available", "type": "boolean", "required": false},
  {"id": "vehicle_list_required", "label": "Vehicle list required in advance", "type": "boolean", "required": false},
  {"id": "license_plate_info_required", "label": "License plate information required", "type": "boolean", "required": false},
  {"id": "guest_parking_location", "label": "Guest parking location", "type": "text", "required": false}
]'::jsonb, ARRAY['show', 'festival']
WHERE NOT EXISTS (
  SELECT 1 FROM public.advance_templates
  WHERE workspace_id IS NULL AND name = 'Personal Vehicle Parking'
);

-- ---- new template: Venue Amenities (21 fields) ----
INSERT INTO public.advance_templates
  (workspace_id, template_type, name, description, icon, fields, suggested_for_day_types)
SELECT NULL, 'section', 'Venue Amenities', 'Wi-Fi, laundry, showers, and restrooms', 'building',
  '[
  {"id": "wifi_available", "label": "Wi-Fi available", "type": "boolean", "required": false},
  {"id": "wifi_network_password", "label": "Wi-Fi network and password", "type": "text", "required": false},
  {"id": "wifi_dressing_rooms", "label": "Wi-Fi in dressing rooms", "type": "boolean", "required": false},
  {"id": "wifi_backstage", "label": "Wi-Fi backstage", "type": "boolean", "required": false},
  {"id": "wifi_merchandise", "label": "Wi-Fi at merchandise", "type": "boolean", "required": false},
  {"id": "wifi_bus_parking", "label": "Wi-Fi at bus parking", "type": "boolean", "required": false},
  {"id": "onsite_washer", "label": "On-site washer", "type": "boolean", "required": false},
  {"id": "onsite_dryer", "label": "On-site dryer", "type": "boolean", "required": false},
  {"id": "laundry_location_hours", "label": "Laundry location and hours", "type": "text", "required": false},
  {"id": "detergent_provided", "label": "Detergent provided", "type": "boolean", "required": false},
  {"id": "showers_available", "label": "Showers available", "type": "boolean", "required": false},
  {"id": "showers_number_location", "label": "Number and location of showers", "type": "text", "required": false},
  {"id": "showers_private_shared", "label": "Showers private or shared", "type": "text", "required": false},
  {"id": "hot_water_confirmed", "label": "Hot water confirmed", "type": "boolean", "required": false},
  {"id": "shower_hours_after_show", "label": "Shower hours/after-show access", "type": "text", "required": false},
  {"id": "shower_towels_provided", "label": "Shower towels provided", "type": "boolean", "required": false},
  {"id": "shower_towels_count", "label": "Number of shower towels", "type": "number", "required": false},
  {"id": "toiletries_provided", "label": "Toiletries provided", "type": "boolean", "required": false},
  {"id": "private_artist_restroom", "label": "Private artist restroom", "type": "boolean", "required": false},
  {"id": "private_crew_restroom", "label": "Private crew restroom", "type": "boolean", "required": false},
  {"id": "restroom_location_after_curfew", "label": "Restroom location and after-curfew access", "type": "text", "required": false}
]'::jsonb, ARRAY['show', 'festival']
WHERE NOT EXISTS (
  SELECT 1 FROM public.advance_templates
  WHERE workspace_id IS NULL AND name = 'Venue Amenities'
);

-- ---- new template: Dressing Rooms (18 fields) ----
INSERT INTO public.advance_templates
  (workspace_id, template_type, name, description, icon, fields, suggested_for_day_types)
SELECT NULL, 'section', 'Dressing Rooms', 'Room count, assignments, access, and furnishings', 'bed',
  '[
  {"id": "num_dressing_rooms", "label": "Number of dressing rooms", "type": "number", "required": false},
  {"id": "dressing_room_assignments", "label": "Dressing room assignments", "type": "textarea", "required": false},
  {"id": "private_or_shared", "label": "Private or shared", "type": "text", "required": false},
  {"id": "lockable_access", "label": "Lockable/key/credential access", "type": "text", "required": false},
  {"id": "capacity_room_details", "label": "Capacity and room details", "type": "textarea", "required": false},
  {"id": "location_distance_stage", "label": "Location and distance from stage", "type": "text", "required": false},
  {"id": "private_restroom", "label": "Private restroom", "type": "boolean", "required": false},
  {"id": "shower_in_dressing_room", "label": "Shower in dressing room", "type": "boolean", "required": false},
  {"id": "climate_control", "label": "Climate control", "type": "boolean", "required": false},
  {"id": "wifi", "label": "Wi-Fi", "type": "boolean", "required": false},
  {"id": "mirrors", "label": "Mirrors/full-length mirror", "type": "boolean", "required": false},
  {"id": "tables_chairs_couch", "label": "Tables/chairs/couch", "type": "boolean", "required": false},
  {"id": "clothing_rack", "label": "Clothing rack", "type": "boolean", "required": false},
  {"id": "refrigerator", "label": "Refrigerator", "type": "boolean", "required": false},
  {"id": "power_outlets", "label": "Power outlets", "type": "boolean", "required": false},
  {"id": "security_coverage", "label": "Security coverage", "type": "boolean", "required": false},
  {"id": "available_upon_arrival", "label": "Available upon arrival", "type": "boolean", "required": false},
  {"id": "must_be_cleared_by", "label": "Must be cleared by", "type": "time", "required": false}
]'::jsonb, ARRAY['show', 'festival']
WHERE NOT EXISTS (
  SELECT 1 FROM public.advance_templates
  WHERE workspace_id IS NULL AND name = 'Dressing Rooms'
);

-- ---- new template: Runner (16 fields — 2 contact->text per 076) ----
INSERT INTO public.advance_templates
  (workspace_id, template_type, name, description, icon, fields, suggested_for_day_types)
SELECT NULL, 'section', 'Runner', 'Local runner availability, vehicle, and run policy', 'truck',
  '[
  {"id": "runner_available", "label": "Runner available", "type": "boolean", "required": false},
  {"id": "runner_name_cell", "label": "Runner name and cell", "type": "text", "required": false},
  {"id": "runner_on_clock", "label": "Runner on clock", "type": "time", "required": false},
  {"id": "runner_off_clock", "label": "Runner off clock", "type": "time", "required": false},
  {"id": "runner_vehicle", "label": "Runner vehicle", "type": "text", "required": false},
  {"id": "number_of_seats", "label": "Number of seats", "type": "number", "required": false},
  {"id": "cargo_capacity", "label": "Cargo capacity", "type": "text", "required": false},
  {"id": "airport_runs_permitted", "label": "Airport runs permitted", "type": "boolean", "required": false},
  {"id": "hotel_runs_permitted", "label": "Hotel runs permitted", "type": "boolean", "required": false},
  {"id": "driver_hotel_transport_covered", "label": "Driver hotel transport covered", "type": "boolean", "required": false},
  {"id": "grocery_hospitality_runs", "label": "Grocery/hospitality runs", "type": "boolean", "required": false},
  {"id": "prescription_pharmacy_runs", "label": "Prescription/pharmacy runs", "type": "boolean", "required": false},
  {"id": "food_pickup", "label": "Food pickup", "type": "boolean", "required": false},
  {"id": "dedicated_or_shared", "label": "Dedicated or shared runner", "type": "text", "required": false},
  {"id": "runner_after_show", "label": "Runner available after show", "type": "boolean", "required": false},
  {"id": "backup_runner_contact", "label": "Backup runner contact", "type": "text", "required": false}
]'::jsonb, ARRAY['show', 'festival']
WHERE NOT EXISTS (
  SELECT 1 FROM public.advance_templates
  WHERE workspace_id IS NULL AND name = 'Runner'
);

-- ---- new template: Comps and Ticketing (16 fields — 2 contact->text per 076) ----
INSERT INTO public.advance_templates
  (workspace_id, template_type, name, description, icon, fields, suggested_for_day_types)
SELECT NULL, 'section', 'Comps and Ticketing', 'Comps, guest list, holds/kills, ticket counts', 'banknote',
  '[
  {"id": "artist_comps", "label": "Artist comps", "type": "number", "required": false},
  {"id": "support_comps", "label": "Support comps", "type": "number", "required": false},
  {"id": "comp_request_deadline", "label": "Comp request deadline", "type": "text", "required": false},
  {"id": "guest_list_contact", "label": "Guest list contact", "type": "text", "required": false},
  {"id": "required_guest_information", "label": "Required guest information", "type": "textarea", "required": false},
  {"id": "digital_or_box_office", "label": "Digital tickets or box office pickup", "type": "text", "required": false},
  {"id": "backstage_access_included", "label": "Backstage access included", "type": "boolean", "required": false},
  {"id": "parking_included", "label": "Parking included", "type": "boolean", "required": false},
  {"id": "unused_comps_released_at", "label": "Unused comps released at", "type": "time", "required": false},
  {"id": "additional_comps_require_approval", "label": "Additional comps require approval", "type": "boolean", "required": false},
  {"id": "current_presale", "label": "Current presale", "type": "number", "required": false},
  {"id": "current_holds_kills_comps", "label": "Current holds/kills/comps", "type": "text", "required": false},
  {"id": "one_week_out_update_requested", "label": "One-week-out update requested", "type": "boolean", "required": false},
  {"id": "one_week_out_paid_count", "label": "One-week-out paid count", "type": "number", "required": false},
  {"id": "one_week_out_expected_attendance", "label": "One-week-out expected attendance", "type": "number", "required": false},
  {"id": "day_of_show_ticket_count_contact", "label": "Day-of-show ticket count contact", "type": "text", "required": false}
]'::jsonb, ARRAY['show', 'festival']
WHERE NOT EXISTS (
  SELECT 1 FROM public.advance_templates
  WHERE workspace_id IS NULL AND name = 'Comps and Ticketing'
);

-- ---- new template: Airport and Local Distances (13 fields) ----
INSERT INTO public.advance_templates
  (workspace_id, template_type, name, description, icon, fields, suggested_for_day_types)
SELECT NULL, 'section', 'Airport and Local Distances', 'Airports, drive times, and nearest essentials', 'plane',
  '[
  {"id": "primary_airport", "label": "Primary airport", "type": "text", "required": false},
  {"id": "backup_airport", "label": "Backup airport", "type": "text", "required": false},
  {"id": "venue_airport_mileage", "label": "Venue-to-airport mileage/drive time", "type": "text", "required": false},
  {"id": "venue_hotel_mileage", "label": "Venue-to-hotel mileage/drive time", "type": "text", "required": false},
  {"id": "hotel_airport_mileage", "label": "Hotel-to-airport mileage/drive time", "type": "text", "required": false},
  {"id": "toll_roads_bridge_restrictions", "label": "Toll roads/bridge restrictions", "type": "textarea", "required": false},
  {"id": "airport_pickup_location", "label": "Airport pickup location", "type": "text", "required": false},
  {"id": "runner_airport_runs", "label": "Runner can perform airport runs", "type": "boolean", "required": false},
  {"id": "large_luggage_capacity_confirmed", "label": "Large luggage capacity confirmed", "type": "boolean", "required": false},
  {"id": "nearest_pharmacy", "label": "Nearest pharmacy", "type": "text", "required": false},
  {"id": "nearest_grocery_store", "label": "Nearest grocery store", "type": "text", "required": false},
  {"id": "nearest_urgent_care", "label": "Nearest urgent care", "type": "text", "required": false},
  {"id": "nearest_hospital", "label": "Nearest hospital", "type": "text", "required": false}
]'::jsonb, ARRAY['show', 'travel', 'festival']
WHERE NOT EXISTS (
  SELECT 1 FROM public.advance_templates
  WHERE workspace_id IS NULL AND name = 'Airport and Local Distances'
);

-- ---- new template: Outdoor Venue and Final Confirmation (30 fields — 1 contact->text per 076) ----
INSERT INTO public.advance_templates
  (workspace_id, template_type, name, description, icon, fields, suggested_for_day_types)
SELECT NULL, 'section', 'Outdoor Venue and Final Confirmation', 'Weather protocols and the closing checklist', 'shield',
  '[
  {"id": "weather_monitoring_contact", "label": "Weather monitoring contact", "type": "text", "required": false},
  {"id": "rain_plan", "label": "Rain plan", "type": "textarea", "required": false},
  {"id": "lightning_protocol", "label": "Lightning protocol", "type": "textarea", "required": false},
  {"id": "high_wind_protocol", "label": "High-wind protocol", "type": "textarea", "required": false},
  {"id": "severe_weather_shelter", "label": "Severe weather shelter", "type": "text", "required": false},
  {"id": "stage_backstage_merch_cover", "label": "Stage/backstage/merch cover", "type": "text", "required": false},
  {"id": "bus_route_usable_in_rain", "label": "Bus route usable in rain", "type": "boolean", "required": false},
  {"id": "ground_conditions_towing_plan", "label": "Ground conditions/towing plan", "type": "textarea", "required": false},
  {"id": "shade_water_insect_control", "label": "Shade/water/insect control", "type": "textarea", "required": false},
  {"id": "cancellation_decision_authority", "label": "Cancellation decision authority", "type": "text", "required": false},
  {"id": "final_contact_sheet_distributed", "label": "Final contact sheet distributed", "type": "boolean", "required": false},
  {"id": "final_run_of_show_approved", "label": "Final run of show approved", "type": "boolean", "required": false},
  {"id": "bus_eta_confirmed", "label": "Bus ETA confirmed", "type": "boolean", "required": false},
  {"id": "parking_instructions_sent_driver", "label": "Parking instructions sent to driver", "type": "boolean", "required": false},
  {"id": "parking_map_sent_driver", "label": "Parking map sent to driver", "type": "boolean", "required": false},
  {"id": "driver_hotel_confirmed", "label": "Driver hotel confirmed", "type": "boolean", "required": false},
  {"id": "early_check_in_confirmed", "label": "Early check-in confirmed", "type": "boolean", "required": false},
  {"id": "runner_confirmed", "label": "Runner confirmed", "type": "boolean", "required": false},
  {"id": "catering_headcount_dietary_confirmed", "label": "Catering headcount and dietary confirmed", "type": "boolean", "required": false},
  {"id": "dressing_rooms_assigned", "label": "Dressing rooms assigned", "type": "boolean", "required": false},
  {"id": "showers_towels_laundry_confirmed", "label": "Showers/towels/laundry confirmed", "type": "boolean", "required": false},
  {"id": "merch_details_confirmed", "label": "Merch details confirmed", "type": "boolean", "required": false},
  {"id": "security_documents_acknowledged", "label": "Security documents acknowledged", "type": "boolean", "required": false},
  {"id": "pass_sheet_acknowledged", "label": "\"Pass sheet\" acknowledged", "type": "boolean", "required": false},
  {"id": "comp_deadline_confirmed", "label": "Comp deadline confirmed", "type": "boolean", "required": false},
  {"id": "settlement_method_confirmed", "label": "Settlement method confirmed", "type": "boolean", "required": false},
  {"id": "one_week_out_update_received", "label": "One-week-out ticket update received", "type": "boolean", "required": false},
  {"id": "weather_plan_confirmed", "label": "Weather plan confirmed", "type": "boolean", "required": false},
  {"id": "bus_departure_confirmed", "label": "Bus departure confirmed", "type": "boolean", "required": false},
  {"id": "all_pending_items_closed", "label": "All pending items closed or identified", "type": "boolean", "required": false}
]'::jsonb, ARRAY['show', 'festival']
WHERE NOT EXISTS (
  SELECT 1 FROM public.advance_templates
  WHERE workspace_id IS NULL AND name = 'Outdoor Venue and Final Confirmation'
);

-- ============================================
-- DOWN MIGRATION (manual — uncomment to invert)
-- ============================================
-- Removes the 11 new platform templates. The 5 enriched templates
-- are NOT auto-restorable from here — re-run the matching INSERT
-- blocks of 003_seed_advance_templates.sql after deleting the row
-- to get the original field lists back. The Key Contacts append
-- is inverted by removing the 13 catalog role ids.
-- DELETE FROM public.advance_templates
--   WHERE workspace_id IS NULL
--     AND name IN ('Event Basics',
--                 'Documents and Maps',
--                 'Bus and Trailer',
--                 'Driver and Hotels',
--                 'Personal Vehicle Parking',
--                 'Venue Amenities',
--                 'Dressing Rooms',
--                 'Runner',
--                 'Comps and Ticketing',
--                 'Airport and Local Distances',
--                 'Outdoor Venue and Final Confirmation');
-- UPDATE public.advance_templates t
-- SET fields = (
--   SELECT COALESCE(jsonb_agg(e ORDER BY ord), '[]'::jsonb)
--   FROM jsonb_array_elements(t.fields) WITH ORDINALITY AS x(e, ord)
--   WHERE e->>'id' NOT IN ('promoter_buyer', 'primary_advance_contact', 'day_of_show_venue_contact', 'production_contact', 'hospitality_catering_contact', 'runner_contact', 'security_lead', 'box_office_ticketing_contact', 'merchandise_contact', 'settlement_contact', 'hotel_contact', 'parking_site_operations_contact', 'emergency_medical_contact')
-- )
-- WHERE t.workspace_id IS NULL AND t.name = 'Key Contacts';
-- ============================================
