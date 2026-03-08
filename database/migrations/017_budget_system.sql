-- ============================================
-- LOWPASS — Budget System
-- Migration 017
--
-- Tables: budget_settings, budget_commissions, budget_income,
-- budget_line_items, personnel_rates, payroll_entries, rooming_grid,
-- hotel_bookings, hotel_room_assignments, flight_bookings,
-- expense_receipts, settlement.
-- All tables workspace-scoped with RLS.
-- ============================================

-- 1. budget_settings (one per tour)
CREATE TABLE budget_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tour_id UUID NOT NULL REFERENCES tours(id) ON DELETE CASCADE,
  workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  currency_home TEXT NOT NULL DEFAULT 'GBP',
  currency_tour TEXT NOT NULL DEFAULT 'USD',
  exchange_rate NUMERIC,
  exchange_rate_updated_at TIMESTAMPTZ,
  insurance_pct NUMERIC NOT NULL DEFAULT 0.03,
  contingency_pct NUMERIC NOT NULL DEFAULT 0.02,
  accountancy_pct NUMERIC NOT NULL DEFAULT 0,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(tour_id)
);

-- 2. budget_commissions (multiple per tour)
CREATE TABLE budget_commissions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tour_id UUID NOT NULL REFERENCES tours(id) ON DELETE CASCADE,
  workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  label TEXT NOT NULL,
  percentage NUMERIC NOT NULL DEFAULT 0,
  basis TEXT NOT NULL DEFAULT 'gross',
  notes TEXT,
  order_index INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 3. budget_income (one per routing date — show/festival only)
CREATE TABLE budget_income (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  routing_id UUID NOT NULL REFERENCES routing(id) ON DELETE CASCADE,
  workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  pre_tax_guarantee NUMERIC NOT NULL DEFAULT 0,
  withholding_pct NUMERIC NOT NULL DEFAULT 0,
  post_tax_guarantee NUMERIC NOT NULL DEFAULT 0,
  pre_tax_overage NUMERIC NOT NULL DEFAULT 0,
  post_tax_overage NUMERIC NOT NULL DEFAULT 0,
  merch_income NUMERIC NOT NULL DEFAULT 0,
  vip_income NUMERIC NOT NULL DEFAULT 0,
  drop_count INT,
  actual_guarantee NUMERIC,
  actual_overage NUMERIC,
  actual_merch NUMERIC,
  actual_vip NUMERIC,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(routing_id)
);

-- 4. budget_line_items (flexible expense rows per tour)
-- receipt_id FK added after expense_receipts exists
CREATE TABLE budget_line_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tour_id UUID NOT NULL REFERENCES tours(id) ON DELETE CASCADE,
  workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  category TEXT NOT NULL,
  label TEXT NOT NULL,
  quantity INT NOT NULL DEFAULT 1,
  proposed_cost NUMERIC NOT NULL DEFAULT 0,
  actual_cost NUMERIC NOT NULL DEFAULT 0,
  currency TEXT,
  receipt_id UUID,
  routing_id UUID REFERENCES routing(id) ON DELETE SET NULL,
  notes TEXT,
  order_index INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 5. personnel_rates (per person per tour)
CREATE TABLE personnel_rates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tour_id UUID NOT NULL REFERENCES tours(id) ON DELETE CASCADE,
  workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  person_name TEXT NOT NULL,
  role TEXT,
  person_type TEXT NOT NULL DEFAULT 'crew',
  rate_type TEXT NOT NULL DEFAULT 'day_rate',
  show_rate NUMERIC NOT NULL DEFAULT 0,
  off_rate NUMERIC NOT NULL DEFAULT 0,
  rehearsal_rate NUMERIC NOT NULL DEFAULT 0,
  per_diem NUMERIC NOT NULL DEFAULT 0,
  advance_fee NUMERIC NOT NULL DEFAULT 0,
  commission NUMERIC NOT NULL DEFAULT 0,
  commission_note TEXT,
  base_rate_note TEXT,
  order_index INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 6. payroll_entries (one per person per week)
CREATE TABLE payroll_entries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tour_id UUID NOT NULL REFERENCES tours(id) ON DELETE CASCADE,
  workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  personnel_id UUID NOT NULL REFERENCES personnel_rates(id) ON DELETE CASCADE,
  week_start DATE NOT NULL,
  day_statuses JSONB NOT NULL DEFAULT '{}',
  advance_fee NUMERIC NOT NULL DEFAULT 0,
  total_fee NUMERIC NOT NULL DEFAULT 0,
  total_per_diem NUMERIC NOT NULL DEFAULT 0,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(personnel_id, week_start)
);

-- 7. rooming_grid (one per person per routing date)
CREATE TABLE rooming_grid (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tour_id UUID NOT NULL REFERENCES tours(id) ON DELETE CASCADE,
  workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  person_name TEXT NOT NULL,
  role TEXT,
  routing_id UUID NOT NULL REFERENCES routing(id) ON DELETE CASCADE,
  room_type TEXT NOT NULL DEFAULT '-',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(tour_id, person_name, routing_id)
);

-- 8. hotel_bookings (per hotel used on tour)
CREATE TABLE hotel_bookings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tour_id UUID NOT NULL REFERENCES tours(id) ON DELETE CASCADE,
  workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  hotel_name TEXT NOT NULL,
  address TEXT,
  phone TEXT,
  cancellation_policy TEXT,
  distance_to_venue TEXT,
  distance_to_airport TEXT,
  city TEXT,
  check_in_date DATE,
  check_out_date DATE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 9. hotel_room_assignments (per person per hotel)
CREATE TABLE hotel_room_assignments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  hotel_booking_id UUID NOT NULL REFERENCES hotel_bookings(id) ON DELETE CASCADE,
  workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  person_name TEXT NOT NULL,
  check_in DATE,
  check_out DATE,
  nights INT NOT NULL DEFAULT 0,
  room_type TEXT,
  room_number TEXT,
  confirmation TEXT,
  rate_per_night NUMERIC NOT NULL DEFAULT 0,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 10. flight_bookings (per person per flight leg)
CREATE TABLE flight_bookings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tour_id UUID NOT NULL REFERENCES tours(id) ON DELETE CASCADE,
  workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  person_name TEXT NOT NULL,
  role TEXT,
  origin_code TEXT,
  destination_code TEXT,
  proposed_cost NUMERIC NOT NULL DEFAULT 0,
  actual_cost NUMERIC NOT NULL DEFAULT 0,
  airline TEXT,
  flight_number TEXT,
  confirmation TEXT,
  departure_date DATE,
  departure_time TIME,
  leg_order INT NOT NULL DEFAULT 1,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 11. expense_receipts (receipt log)
CREATE TABLE expense_receipts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tour_id UUID NOT NULL REFERENCES tours(id) ON DELETE CASCADE,
  workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  receipt_number TEXT NOT NULL,
  date DATE,
  vendor TEXT,
  category TEXT,
  description TEXT,
  payment_method TEXT NOT NULL DEFAULT 'card',
  cost_tour_currency NUMERIC NOT NULL DEFAULT 0,
  cost_home_currency NUMERIC NOT NULL DEFAULT 0,
  receipt_file_url TEXT,
  in_budget BOOLEAN NOT NULL DEFAULT false,
  linked_line_item_id UUID REFERENCES budget_line_items(id) ON DELETE SET NULL,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Add FK from budget_line_items.receipt_id → expense_receipts (after both tables exist)
ALTER TABLE budget_line_items
  ADD CONSTRAINT budget_line_items_receipt_id_fkey
  FOREIGN KEY (receipt_id) REFERENCES expense_receipts(id) ON DELETE SET NULL;

-- 12. settlement (per show — one per routing date)
CREATE TABLE settlement (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  routing_id UUID NOT NULL REFERENCES routing(id) ON DELETE CASCADE,
  workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'pending',
  day_of_guarantee NUMERIC,
  day_of_overage NUMERIC,
  day_of_merch NUMERIC,
  day_of_deductions NUMERIC,
  day_of_net NUMERIC,
  day_of_signed_by TEXT,
  day_of_notes TEXT,
  day_of_file_url TEXT,
  reconciled_guarantee NUMERIC,
  reconciled_overage NUMERIC,
  reconciled_merch NUMERIC,
  reconciled_deductions NUMERIC,
  reconciled_net NUMERIC,
  reconciled_notes TEXT,
  reconciled_at TIMESTAMPTZ,
  deal_memo_text TEXT,
  deal_memo_file_url TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(routing_id)
);

-- Indexes
CREATE INDEX idx_budget_settings_tour ON budget_settings(tour_id);
CREATE INDEX idx_budget_commissions_tour ON budget_commissions(tour_id);
CREATE INDEX idx_budget_income_routing ON budget_income(routing_id);
CREATE INDEX idx_budget_line_items_tour ON budget_line_items(tour_id);
CREATE INDEX idx_personnel_rates_tour ON personnel_rates(tour_id);
CREATE INDEX idx_payroll_entries_tour ON payroll_entries(tour_id);
CREATE INDEX idx_payroll_entries_personnel ON payroll_entries(personnel_id);
CREATE INDEX idx_rooming_grid_tour ON rooming_grid(tour_id);
CREATE INDEX idx_hotel_bookings_tour ON hotel_bookings(tour_id);
CREATE INDEX idx_hotel_room_assignments_hotel ON hotel_room_assignments(hotel_booking_id);
CREATE INDEX idx_flight_bookings_tour ON flight_bookings(tour_id);
CREATE INDEX idx_expense_receipts_tour ON expense_receipts(tour_id);
CREATE INDEX idx_settlement_routing ON settlement(routing_id);

-- RLS: all tables scoped by workspace_id
ALTER TABLE budget_settings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "budget_settings_workspace" ON budget_settings FOR ALL
  USING (workspace_id = public.get_my_workspace_id())
  WITH CHECK (workspace_id = public.get_my_workspace_id());

ALTER TABLE budget_commissions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "budget_commissions_workspace" ON budget_commissions FOR ALL
  USING (workspace_id = public.get_my_workspace_id())
  WITH CHECK (workspace_id = public.get_my_workspace_id());

ALTER TABLE budget_income ENABLE ROW LEVEL SECURITY;
CREATE POLICY "budget_income_workspace" ON budget_income FOR ALL
  USING (workspace_id = public.get_my_workspace_id())
  WITH CHECK (workspace_id = public.get_my_workspace_id());

ALTER TABLE budget_line_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY "budget_line_items_workspace" ON budget_line_items FOR ALL
  USING (workspace_id = public.get_my_workspace_id())
  WITH CHECK (workspace_id = public.get_my_workspace_id());

ALTER TABLE personnel_rates ENABLE ROW LEVEL SECURITY;
CREATE POLICY "personnel_rates_workspace" ON personnel_rates FOR ALL
  USING (workspace_id = public.get_my_workspace_id())
  WITH CHECK (workspace_id = public.get_my_workspace_id());

ALTER TABLE payroll_entries ENABLE ROW LEVEL SECURITY;
CREATE POLICY "payroll_entries_workspace" ON payroll_entries FOR ALL
  USING (workspace_id = public.get_my_workspace_id())
  WITH CHECK (workspace_id = public.get_my_workspace_id());

ALTER TABLE rooming_grid ENABLE ROW LEVEL SECURITY;
CREATE POLICY "rooming_grid_workspace" ON rooming_grid FOR ALL
  USING (workspace_id = public.get_my_workspace_id())
  WITH CHECK (workspace_id = public.get_my_workspace_id());

ALTER TABLE hotel_bookings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "hotel_bookings_workspace" ON hotel_bookings FOR ALL
  USING (workspace_id = public.get_my_workspace_id())
  WITH CHECK (workspace_id = public.get_my_workspace_id());

ALTER TABLE hotel_room_assignments ENABLE ROW LEVEL SECURITY;
CREATE POLICY "hotel_room_assignments_workspace" ON hotel_room_assignments FOR ALL
  USING (workspace_id = public.get_my_workspace_id())
  WITH CHECK (workspace_id = public.get_my_workspace_id());

ALTER TABLE flight_bookings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "flight_bookings_workspace" ON flight_bookings FOR ALL
  USING (workspace_id = public.get_my_workspace_id())
  WITH CHECK (workspace_id = public.get_my_workspace_id());

ALTER TABLE expense_receipts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "expense_receipts_workspace" ON expense_receipts FOR ALL
  USING (workspace_id = public.get_my_workspace_id())
  WITH CHECK (workspace_id = public.get_my_workspace_id());

ALTER TABLE settlement ENABLE ROW LEVEL SECURITY;
CREATE POLICY "settlement_workspace" ON settlement FOR ALL
  USING (workspace_id = public.get_my_workspace_id())
  WITH CHECK (workspace_id = public.get_my_workspace_id());
</think>
Removing the invalid index and fixing the migration.
<｜tool▁calls▁begin｜><｜tool▁call▁begin｜>
StrReplace