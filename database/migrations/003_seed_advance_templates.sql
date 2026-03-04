-- ============================================
-- LOWPASS — Seed Advance Templates
-- Migration 003
--
-- Pre-built section templates for the advance
-- form builder. workspace_id = NULL means these
-- are platform-wide defaults available to all.
-- ============================================

-- PRODUCTION
INSERT INTO advance_templates (workspace_id, template_type, name, description, icon, fields, suggested_for_day_types) VALUES
(NULL, 'section', 'Production', 'Stage, sound, lighting, and backline requirements', 'speaker', '[
  {"id": "stage_dimensions", "label": "Stage Dimensions", "type": "text", "required": false, "placeholder": "e.g. 40ft x 30ft"},
  {"id": "pa_system", "label": "PA System", "type": "text", "required": false, "placeholder": "e.g. L-Acoustics K2"},
  {"id": "monitor_system", "label": "Monitor System", "type": "text", "required": false, "placeholder": "e.g. Wedges / IEMs"},
  {"id": "foh_console", "label": "FOH Console", "type": "text", "required": false, "placeholder": "e.g. Avid S6L"},
  {"id": "mon_console", "label": "Monitor Console", "type": "text", "required": false, "placeholder": "e.g. Yamaha CL5"},
  {"id": "lighting_console", "label": "Lighting Console", "type": "text", "required": false, "placeholder": "e.g. grandMA3"},
  {"id": "backline_provided", "label": "Backline Provided", "type": "textarea", "required": false},
  {"id": "power_details", "label": "Power Details", "type": "textarea", "required": false},
  {"id": "load_in_access", "label": "Load-in Access", "type": "text", "required": false, "placeholder": "e.g. Dock door, ground level"},
  {"id": "production_contact", "label": "Venue Production Contact", "type": "contact", "required": true},
  {"id": "production_notes", "label": "Production Notes", "type": "textarea", "required": false}
]'::jsonb, ARRAY['show', 'festival', 'rehearsal']);

-- HOSPITALITY / CATERING
INSERT INTO advance_templates (workspace_id, template_type, name, description, icon, fields, suggested_for_day_types) VALUES
(NULL, 'section', 'Hospitality', 'Dressing rooms, catering, and rider requirements', 'utensils', '[
  {"id": "dressing_rooms", "label": "Dressing Rooms", "type": "textarea", "required": false, "placeholder": "Number and description of available rooms"},
  {"id": "catering_buyout", "label": "Catering / Buyout", "type": "select", "required": false, "options": ["Full catering provided", "Buyout", "Partial catering + buyout", "None"]},
  {"id": "buyout_amount", "label": "Buyout Amount", "type": "currency", "required": false},
  {"id": "meal_times", "label": "Meal Times", "type": "text", "required": false, "placeholder": "e.g. Lunch 12:00, Dinner 17:00"},
  {"id": "dietary_accommodations", "label": "Dietary Accommodations", "type": "textarea", "required": false},
  {"id": "rider_status", "label": "Rider Status", "type": "select", "required": true, "options": ["Sent", "Confirmed", "Partial", "Not sent"]},
  {"id": "rider_notes", "label": "Rider Notes / Issues", "type": "textarea", "required": false},
  {"id": "hospitality_contact", "label": "Hospitality Contact", "type": "contact", "required": false},
  {"id": "laundry_available", "label": "Laundry Available", "type": "boolean", "required": false}
]'::jsonb, ARRAY['show', 'festival']);

-- SCHEDULE / TIMES
INSERT INTO advance_templates (workspace_id, template_type, name, description, icon, fields, suggested_for_day_types) VALUES
(NULL, 'section', 'Schedule', 'Show day timeline from load-in to curfew', 'clock', '[
  {"id": "doors_open", "label": "Doors", "type": "time", "required": true},
  {"id": "support_soundcheck", "label": "Support Soundcheck", "type": "time", "required": false},
  {"id": "headliner_soundcheck", "label": "Headliner Soundcheck", "type": "time", "required": false},
  {"id": "support_set", "label": "Support Set", "type": "time", "required": false},
  {"id": "changeover", "label": "Changeover", "type": "text", "required": false, "placeholder": "e.g. 30 mins"},
  {"id": "headliner_set", "label": "Headliner Set", "type": "time", "required": true},
  {"id": "curfew", "label": "Curfew", "type": "time", "required": true},
  {"id": "load_in", "label": "Load In", "type": "time", "required": false},
  {"id": "load_out", "label": "Load Out (estimated)", "type": "time", "required": false},
  {"id": "schedule_notes", "label": "Schedule Notes", "type": "textarea", "required": false}
]'::jsonb, ARRAY['show', 'festival']);

-- TRANSPORT / DRIVERS
INSERT INTO advance_templates (workspace_id, template_type, name, description, icon, fields, suggested_for_day_types) VALUES
(NULL, 'section', 'Transport', 'Ground transport, parking, and driver details', 'truck', '[
  {"id": "bus_parking", "label": "Bus / Truck Parking", "type": "textarea", "required": false},
  {"id": "parking_address", "label": "Parking Address", "type": "text", "required": false},
  {"id": "parking_restrictions", "label": "Parking Restrictions", "type": "textarea", "required": false, "placeholder": "Height limits, time restrictions, permits needed"},
  {"id": "drive_distance", "label": "Drive Distance", "type": "text", "required": false, "placeholder": "e.g. 245 miles / 4h 15m"},
  {"id": "driver_hotel", "label": "Driver Hotel", "type": "text", "required": false},
  {"id": "runner_details", "label": "Runner / Local Transport", "type": "textarea", "required": false},
  {"id": "transport_contact", "label": "Transport Contact", "type": "contact", "required": false},
  {"id": "transport_notes", "label": "Transport Notes", "type": "textarea", "required": false}
]'::jsonb, ARRAY['show', 'travel', 'festival']);

-- HOTEL / ACCOMMODATION
INSERT INTO advance_templates (workspace_id, template_type, name, description, icon, fields, suggested_for_day_types) VALUES
(NULL, 'section', 'Hotel', 'Accommodation details and rooming', 'bed', '[
  {"id": "hotel_name", "label": "Hotel Name", "type": "text", "required": true},
  {"id": "hotel_address", "label": "Hotel Address", "type": "text", "required": true},
  {"id": "hotel_phone", "label": "Hotel Phone", "type": "text", "required": false},
  {"id": "check_in_time", "label": "Check-in Time", "type": "time", "required": false},
  {"id": "check_out_time", "label": "Check-out Time", "type": "time", "required": false},
  {"id": "confirmation_number", "label": "Confirmation Number", "type": "text", "required": false},
  {"id": "rooms_booked", "label": "Rooms Booked", "type": "number", "required": false},
  {"id": "room_rate", "label": "Room Rate", "type": "currency", "required": false},
  {"id": "breakfast_included", "label": "Breakfast Included", "type": "boolean", "required": false},
  {"id": "parking_at_hotel", "label": "Parking Available", "type": "boolean", "required": false},
  {"id": "wifi_details", "label": "WiFi Details", "type": "text", "required": false},
  {"id": "hotel_notes", "label": "Hotel Notes", "type": "textarea", "required": false}
]'::jsonb, ARRAY['show', 'off', 'travel', 'festival']);

-- FLIGHTS
INSERT INTO advance_templates (workspace_id, template_type, name, description, icon, fields, suggested_for_day_types) VALUES
(NULL, 'section', 'Flights', 'Flight bookings and airport logistics', 'plane', '[
  {"id": "flight_outbound", "label": "Outbound Flight", "type": "text", "required": false, "placeholder": "e.g. BA245 LHR→LAX 10:30"},
  {"id": "flight_inbound", "label": "Inbound Flight", "type": "text", "required": false, "placeholder": "e.g. BA246 LAX→LHR 21:00"},
  {"id": "airline", "label": "Airline", "type": "text", "required": false},
  {"id": "booking_ref", "label": "Booking Reference", "type": "text", "required": false},
  {"id": "airport_transfer", "label": "Airport Transfer Details", "type": "textarea", "required": false},
  {"id": "baggage_allowance", "label": "Baggage Allowance", "type": "text", "required": false},
  {"id": "flight_notes", "label": "Flight Notes", "type": "textarea", "required": false}
]'::jsonb, ARRAY['travel', 'off']);

-- VENUE INFO
INSERT INTO advance_templates (workspace_id, template_type, name, description, icon, fields, suggested_for_day_types) VALUES
(NULL, 'section', 'Venue Info', 'General venue information and contacts', 'building', '[
  {"id": "venue_name", "label": "Venue Name", "type": "text", "required": true},
  {"id": "venue_address", "label": "Address", "type": "text", "required": true},
  {"id": "venue_capacity", "label": "Capacity", "type": "number", "required": false},
  {"id": "venue_website", "label": "Website", "type": "url", "required": false},
  {"id": "promoter_name", "label": "Promoter", "type": "text", "required": false},
  {"id": "promoter_contact", "label": "Promoter Contact", "type": "contact", "required": true},
  {"id": "venue_rep", "label": "Venue Rep Contact", "type": "contact", "required": false},
  {"id": "age_restriction", "label": "Age Restriction", "type": "select", "required": false, "options": ["All ages", "14+", "16+", "18+", "21+"]},
  {"id": "sold_status", "label": "Sold Status", "type": "select", "required": false, "options": ["On sale", "Low tickets", "Sold out", "Not yet on sale"]},
  {"id": "venue_notes", "label": "Venue Notes", "type": "textarea", "required": false}
]'::jsonb, ARRAY['show', 'festival']);

-- MERCH
INSERT INTO advance_templates (workspace_id, template_type, name, description, icon, fields, suggested_for_day_types) VALUES
(NULL, 'section', 'Merch', 'Merchandise selling arrangements', 'shopping-bag', '[
  {"id": "merch_split", "label": "Merch Split", "type": "text", "required": false, "placeholder": "e.g. 80/20 in favour of artist"},
  {"id": "merch_location", "label": "Merch Location", "type": "text", "required": false},
  {"id": "merch_seller", "label": "Merch Seller", "type": "select", "required": false, "options": ["Venue provides", "Own seller", "Self-serve"]},
  {"id": "merch_table_provided", "label": "Table/Display Provided", "type": "boolean", "required": false},
  {"id": "card_payments", "label": "Card Payments Available", "type": "boolean", "required": false},
  {"id": "merch_contact", "label": "Merch Contact", "type": "contact", "required": false},
  {"id": "merch_notes", "label": "Merch Notes", "type": "textarea", "required": false}
]'::jsonb, ARRAY['show', 'festival']);

-- SECURITY
INSERT INTO advance_templates (workspace_id, template_type, name, description, icon, fields, suggested_for_day_types) VALUES
(NULL, 'section', 'Security', 'Venue security and access arrangements', 'shield', '[
  {"id": "security_company", "label": "Security Company", "type": "text", "required": false},
  {"id": "security_contact", "label": "Security Contact", "type": "contact", "required": false},
  {"id": "barrier_setup", "label": "Barrier Setup", "type": "text", "required": false},
  {"id": "guest_list_process", "label": "Guest List Process", "type": "textarea", "required": false},
  {"id": "wristband_system", "label": "Wristband / Pass System", "type": "text", "required": false},
  {"id": "security_notes", "label": "Security Notes", "type": "textarea", "required": false}
]'::jsonb, ARRAY['show', 'festival']);

-- LOCAL INFO (useful for off days and travel days too)
INSERT INTO advance_templates (workspace_id, template_type, name, description, icon, fields, suggested_for_day_types) VALUES
(NULL, 'section', 'Local Info', 'Local area information for crew', 'map-pin', '[
  {"id": "nearest_hospital", "label": "Nearest Hospital / A&E", "type": "text", "required": false},
  {"id": "nearest_pharmacy", "label": "Nearest Pharmacy", "type": "text", "required": false},
  {"id": "local_restaurants", "label": "Nearby Restaurants", "type": "textarea", "required": false},
  {"id": "laundromat", "label": "Nearest Laundromat", "type": "text", "required": false},
  {"id": "gym_nearby", "label": "Nearby Gym", "type": "text", "required": false},
  {"id": "local_notes", "label": "Local Notes", "type": "textarea", "required": false}
]'::jsonb, ARRAY['show', 'off', 'travel', 'festival']);

-- SETTLEMENT / FINANCIALS (visible to TM only)
INSERT INTO advance_templates (workspace_id, template_type, name, description, icon, fields, suggested_for_day_types) VALUES
(NULL, 'section', 'Settlement', 'Financial deal terms (TM eyes only)', 'banknote', '[
  {"id": "deal_type", "label": "Deal Type", "type": "select", "required": false, "options": ["Guarantee", "Guarantee + bonus", "Door deal", "Flat fee", "Festival fee"]},
  {"id": "guarantee", "label": "Guarantee", "type": "currency", "required": false},
  {"id": "bonus_threshold", "label": "Bonus Threshold", "type": "text", "required": false},
  {"id": "bonus_split", "label": "Bonus Split", "type": "text", "required": false, "placeholder": "e.g. 85/15 after expenses"},
  {"id": "ticket_price", "label": "Ticket Price", "type": "currency", "required": false},
  {"id": "ticket_capacity", "label": "Ticket Capacity", "type": "number", "required": false},
  {"id": "deposit_received", "label": "Deposit Received", "type": "boolean", "required": false},
  {"id": "deposit_amount", "label": "Deposit Amount", "type": "currency", "required": false},
  {"id": "settlement_notes", "label": "Settlement Notes", "type": "textarea", "required": false}
]'::jsonb, ARRAY['show', 'festival']);
