-- 026_line_item_links.sql
-- Adds a link from hotel_bookings and flight_bookings to budget_line_items
-- so the shared pop-out panel can be opened from those tabs.
-- (Numbered 026 because 025_storage_avatars.sql already exists.)

-- 1. Add source entity tracking to budget_line_items
ALTER TABLE budget_line_items
  ADD COLUMN IF NOT EXISTS source_entity_id   UUID,
  ADD COLUMN IF NOT EXISTS source_entity_type TEXT
    CHECK (source_entity_type IS NULL OR source_entity_type IN ('hotel_booking', 'flight_booking'));

-- 2. Add line_item_id FK to hotel_bookings
ALTER TABLE hotel_bookings
  ADD COLUMN IF NOT EXISTS line_item_id UUID
    REFERENCES budget_line_items(id) ON DELETE SET NULL;

-- 3. Add line_item_id FK to flight_bookings
ALTER TABLE flight_bookings
  ADD COLUMN IF NOT EXISTS line_item_id UUID
    REFERENCES budget_line_items(id) ON DELETE SET NULL;

-- 4. Backfill: create budget_line_items rows for existing hotel_bookings
--    (Per-hotel totals live on room assignments; line item costs start at 0.)
WITH inserted AS (
  INSERT INTO budget_line_items (
    tour_id, workspace_id, category, label,
    proposed_cost, actual_cost,
    source_entity_type, source_entity_id,
    created_at, updated_at
  )
  SELECT
    hb.tour_id,
    hb.workspace_id,
    'hotels',
    hb.hotel_name,
    0,
    0,
    'hotel_booking',
    hb.id,
    hb.created_at,
    now()
  FROM hotel_bookings hb
  WHERE hb.line_item_id IS NULL
  RETURNING id, source_entity_id
)
UPDATE hotel_bookings hb
  SET line_item_id = ins.id
  FROM inserted ins
  WHERE ins.source_entity_id = hb.id;

-- 5. Backfill: create budget_line_items rows for existing flight_bookings
WITH inserted AS (
  INSERT INTO budget_line_items (
    tour_id, workspace_id, category, label,
    proposed_cost, actual_cost,
    source_entity_type, source_entity_id,
    created_at, updated_at
  )
  SELECT
    fb.tour_id,
    fb.workspace_id,
    'flights',
    TRIM(BOTH FROM (
      COALESCE(fb.person_name, '') || ': ' ||
      COALESCE(fb.origin_code, '') || '→' || COALESCE(fb.destination_code, '')
    )),
    COALESCE(fb.proposed_cost, 0),
    COALESCE(fb.actual_cost, 0),
    'flight_booking',
    fb.id,
    fb.created_at,
    now()
  FROM flight_bookings fb
  WHERE fb.line_item_id IS NULL
  RETURNING id, source_entity_id
)
UPDATE flight_bookings fb
  SET line_item_id = ins.id
  FROM inserted ins
  WHERE ins.source_entity_id = fb.id;

-- 6. Indexes
CREATE INDEX IF NOT EXISTS idx_budget_line_items_source
  ON budget_line_items (source_entity_type, source_entity_id);
CREATE INDEX IF NOT EXISTS idx_hotel_bookings_line_item
  ON hotel_bookings (line_item_id);
CREATE INDEX IF NOT EXISTS idx_flight_bookings_line_item
  ON flight_bookings (line_item_id);
