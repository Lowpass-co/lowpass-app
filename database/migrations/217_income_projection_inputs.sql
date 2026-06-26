-- ============================================
-- LOWPASS — Income projection inputs (Income Redesign Phase 3)
-- Migration 217
-- ============================================
--
-- The deal-aware projection engine (INCOME_P3_PROJECTION_MAP.md, decisions
-- LOCKED 2026-06-25). Per-show PROPOSED inputs that drive the projected
-- overage / merch / VIP, plus the per-tour conversion config they read.
--
--   • budget_income.*          — per-show projection inputs (PROPOSED → VERSIONED).
--   • budget_version_income.*  — the snapshot mirror (versioning tax).
--   • budget_settings.*        — per-tour defaults + config (UNVERSIONED, like the
--                                overhead %s + FX map): tax off the top + the
--                                overage haircut, + fallback sell-thru / $-head / fee%.
--
-- Units (match the existing income cols): percentages stored 0–100 on budget_income
-- (deal_pct, est_sell_thru, merch_fee_pct, deal_pct_above — like withholding_pct);
-- budget_settings keeps the overhead convention (fractions: default_sell_thru,
-- default_merch_fee_pct, overage_haircut, overage_tax_pct). The income route
-- normalises both to fractions before calling the engine.
--
-- Additive, nullable, idempotent. Down-block at the end.

-- ---- per-show projection inputs (proposed structure → versioned) ----
ALTER TABLE public.budget_income
  ADD COLUMN IF NOT EXISTS capacity        INTEGER,   -- venue cap for this show
  ADD COLUMN IF NOT EXISTS est_sell_thru   NUMERIC,   -- sell-through %, 0–100 (NULL → tour default)
  ADD COLUMN IF NOT EXISTS face_value      NUMERIC,   -- ticket face price (native ccy)
  ADD COLUMN IF NOT EXISTS deal_type       TEXT,      -- 'VS' | 'PLUS' | 'FLAT' (VS auto-projects)
  ADD COLUMN IF NOT EXISTS deal_pct        NUMERIC,   -- base deal %, 0–100
  ADD COLUMN IF NOT EXISTS deal_threshold  NUMERIC,   -- TIERED escalator: ticket count (nullable)
  ADD COLUMN IF NOT EXISTS deal_pct_above  NUMERIC,   -- escalated % above threshold, 0–100 (NULL → = deal_pct)
  ADD COLUMN IF NOT EXISTS dollars_per_head NUMERIC,  -- net merch $/head (NULL → tour default)
  ADD COLUMN IF NOT EXISTS merch_fee_pct   NUMERIC,   -- avg merch fee %, 0–100 (NULL → tour default)
  ADD COLUMN IF NOT EXISTS vip_tickets     INTEGER,   -- VIP ticket count
  ADD COLUMN IF NOT EXISTS vip_price       NUMERIC;   -- VIP price (native ccy)

-- ---- the version snapshot mirror (versioning tax) ----
ALTER TABLE public.budget_version_income
  ADD COLUMN IF NOT EXISTS capacity        INTEGER,
  ADD COLUMN IF NOT EXISTS est_sell_thru   NUMERIC,
  ADD COLUMN IF NOT EXISTS face_value      NUMERIC,
  ADD COLUMN IF NOT EXISTS deal_type       TEXT,
  ADD COLUMN IF NOT EXISTS deal_pct        NUMERIC,
  ADD COLUMN IF NOT EXISTS deal_threshold  NUMERIC,
  ADD COLUMN IF NOT EXISTS deal_pct_above  NUMERIC,
  ADD COLUMN IF NOT EXISTS dollars_per_head NUMERIC,
  ADD COLUMN IF NOT EXISTS merch_fee_pct   NUMERIC,
  ADD COLUMN IF NOT EXISTS vip_tickets     INTEGER,
  ADD COLUMN IF NOT EXISTS vip_price       NUMERIC;

-- ---- per-tour projection config + defaults (UNVERSIONED) ----
ALTER TABLE public.budget_settings
  ADD COLUMN IF NOT EXISTS default_sell_thru        NUMERIC,                  -- fraction
  ADD COLUMN IF NOT EXISTS default_dollars_per_head NUMERIC,                  -- native ccy
  ADD COLUMN IF NOT EXISTS default_merch_fee_pct    NUMERIC,                  -- fraction
  ADD COLUMN IF NOT EXISTS overage_haircut          NUMERIC NOT NULL DEFAULT 0.65,  -- projection conservatism
  ADD COLUMN IF NOT EXISTS overage_tax_pct          NUMERIC NOT NULL DEFAULT 0.08;  -- tax off the top

-- ============================================
-- DOWN MIGRATION (manual — uncomment to roll back)
-- ============================================
-- ALTER TABLE public.budget_settings
--   DROP COLUMN IF EXISTS default_sell_thru,
--   DROP COLUMN IF EXISTS default_dollars_per_head,
--   DROP COLUMN IF EXISTS default_merch_fee_pct,
--   DROP COLUMN IF EXISTS overage_haircut,
--   DROP COLUMN IF EXISTS overage_tax_pct;
-- ALTER TABLE public.budget_version_income
--   DROP COLUMN IF EXISTS capacity, DROP COLUMN IF EXISTS est_sell_thru,
--   DROP COLUMN IF EXISTS face_value, DROP COLUMN IF EXISTS deal_type,
--   DROP COLUMN IF EXISTS deal_pct, DROP COLUMN IF EXISTS deal_threshold,
--   DROP COLUMN IF EXISTS deal_pct_above, DROP COLUMN IF EXISTS dollars_per_head,
--   DROP COLUMN IF EXISTS merch_fee_pct, DROP COLUMN IF EXISTS vip_tickets,
--   DROP COLUMN IF EXISTS vip_price;
-- ALTER TABLE public.budget_income
--   DROP COLUMN IF EXISTS capacity, DROP COLUMN IF EXISTS est_sell_thru,
--   DROP COLUMN IF EXISTS face_value, DROP COLUMN IF EXISTS deal_type,
--   DROP COLUMN IF EXISTS deal_pct, DROP COLUMN IF EXISTS deal_threshold,
--   DROP COLUMN IF EXISTS deal_pct_above, DROP COLUMN IF EXISTS dollars_per_head,
--   DROP COLUMN IF EXISTS merch_fee_pct, DROP COLUMN IF EXISTS vip_tickets,
--   DROP COLUMN IF EXISTS vip_price;
