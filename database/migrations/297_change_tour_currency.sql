-- ============================================================================
-- 297_change_tour_currency.sql  (Nov 2026, Adam: "where do I change the tour
-- to display as $?" — and change it from the budget too)
--
-- A tour's currency can change, and the money stays right. Exchange rates are
-- stored RELATIVE TO THE TOUR CURRENCY ("1 EUR = 0.85 GBP"), and so are the
-- rates locked on actuals. Flipping tours.currency alone would misread every
-- one of them (an actual locked at 0.85 GBP per EUR read as 0.85 USD per EUR,
-- for good). change_tour_currency() restates them in ONE transaction:
--
--   p_rate = 1 old currency in the new one (the route fetches it live).
--   - budget_line_items.locked_fx_rate  × p_rate   (locked actuals)
--   - budget_income.locked_fx_rate      × p_rate   (settled shows)
--   - budget_fx_rates: every row × p_rate; the NEW currency's row goes (it is
--     the tour currency now); the OLD currency gets a row = p_rate.
--   - tours.currency = the new code.
--
-- Amounts with no currency of their own (rates, per diems, most lines) are IN
-- the tour currency, so they keep their numbers: £350 → $350 (what Adam
-- wants — they were meant as dollars). Anything with its own currency keeps it
-- and converts at the restated rates.
--
-- SECURITY INVOKER: the caller's own rules decide (tours / budget writes are
-- admin / manager). Re-runnable: already in that currency → nothing happens,
-- so a double call can never multiply twice.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.change_tour_currency(
  p_tour_id uuid,
  p_currency text,
  p_rate numeric
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_old text;
  v_new text := upper(btrim(coalesce(p_currency, '')));
  v_lines int := 0;
  v_income int := 0;
  v_rates int := 0;
BEGIN
  IF v_new !~ '^[A-Z]{3}$' THEN
    RAISE EXCEPTION 'Not a currency code: %', p_currency USING ERRCODE = '22023';
  END IF;

  SELECT upper(coalesce(currency, 'GBP')) INTO v_old
  FROM public.tours WHERE id = p_tour_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Tour not found' USING ERRCODE = 'P0002';
  END IF;

  IF v_old = v_new THEN
    RETURN jsonb_build_object('changed', false, 'currency', v_new);
  END IF;

  IF p_rate IS NULL OR p_rate <= 0 THEN
    RAISE EXCEPTION 'A live % → % rate is needed', v_old, v_new USING ERRCODE = '22023';
  END IF;

  UPDATE public.budget_line_items
     SET locked_fx_rate = locked_fx_rate * p_rate
   WHERE tour_id = p_tour_id AND locked_fx_rate IS NOT NULL;
  GET DIAGNOSTICS v_lines = ROW_COUNT;

  UPDATE public.budget_income
     SET locked_fx_rate = locked_fx_rate * p_rate
   WHERE tour_id = p_tour_id AND locked_fx_rate IS NOT NULL;
  GET DIAGNOSTICS v_income = ROW_COUNT;

  -- The new currency IS the tour currency now — no rate for it.
  DELETE FROM public.budget_fx_rates
   WHERE tour_id = p_tour_id AND upper(currency) = v_new;
  -- 1 X = r old  →  1 X = r × p_rate new.
  UPDATE public.budget_fx_rates
     SET rate_to_tour_currency = rate_to_tour_currency * p_rate, updated_at = now()
   WHERE tour_id = p_tour_id;
  GET DIAGNOSTICS v_rates = ROW_COUNT;
  -- The old currency is now a foreign one: 1 old = p_rate new.
  INSERT INTO public.budget_fx_rates (tour_id, workspace_id, currency, rate_to_tour_currency, updated_at)
  SELECT t.id, t.workspace_id, v_old, p_rate, now() FROM public.tours t WHERE t.id = p_tour_id
  ON CONFLICT (tour_id, currency) DO UPDATE
    SET rate_to_tour_currency = EXCLUDED.rate_to_tour_currency, updated_at = now();

  UPDATE public.tours SET currency = v_new WHERE id = p_tour_id;

  RETURN jsonb_build_object(
    'changed', true, 'from', v_old, 'to', v_new, 'rate', p_rate,
    'locked_lines', v_lines, 'locked_income', v_income, 'rates', v_rates
  );
END;
$$;

REVOKE ALL ON FUNCTION public.change_tour_currency(uuid, text, numeric) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.change_tour_currency(uuid, text, numeric) TO authenticated;

-- ============================================
-- DOWN (manual): DROP FUNCTION IF EXISTS public.change_tour_currency(uuid, text, numeric);
-- ============================================
