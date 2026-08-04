-- 253_rental_jobs_display_currency.sql
--
-- Equipment quote — item 2: the quote is denominated ONCE, on the job.
--
-- A quote is a document a client signs. Denominating it per line would let one
-- page carry two currencies, which is not a pricing model, it is a mistake
-- waiting to be printed. So the currency lives on rental_jobs; rental_inventory
-- keeps its own value_currency as the SOURCE unit and conversion happens at
-- render.
--
-- THE FREEZE. fx_rate / fx_rate_at are NULL while the quote is a draft — the
-- rate is live and the numbers move with the market, which is right while you
-- are still quoting. On the first transition OUT of 'draft' the app stamps the
-- rate it last showed. A client who accepted Tuesday's number must never open
-- the same quote on Friday and see a different one. Same live-until-committed
-- rule as tour FX.
--
-- Nothing is backfilled. display_currency NULL means "USD", which is what every
-- existing job already was, so the 33-row inventory and every existing quote
-- read identically the moment this lands.
--
-- IDEMPOTENT: re-running is a no-op (ADD COLUMN IF NOT EXISTS throughout).

ALTER TABLE public.rental_jobs
  ADD COLUMN IF NOT EXISTS display_currency text;

COMMENT ON COLUMN public.rental_jobs.display_currency IS
  'ISO-4217 the quote is denominated in. NULL = USD (pre-currency-switcher default).';

ALTER TABLE public.rental_jobs
  ADD COLUMN IF NOT EXISTS fx_rate numeric;

COMMENT ON COLUMN public.rental_jobs.fx_rate IS
  'Frozen 1 <item currency> = fx_rate <display_currency>. NULL while the job is a '
  'draft (live rate). Stamped on the first transition out of draft.';

ALTER TABLE public.rental_jobs
  ADD COLUMN IF NOT EXISTS fx_rate_at timestamptz;

COMMENT ON COLUMN public.rental_jobs.fx_rate_at IS
  'When fx_rate was captured. Printed on the quote — a converted price with no '
  'visible rate and date is unauditable, and this document goes to clients.';

-- ── down ──────────────────────────────────────────────────────────────────
-- ALTER TABLE public.rental_jobs DROP COLUMN IF EXISTS fx_rate_at;
-- ALTER TABLE public.rental_jobs DROP COLUMN IF EXISTS fx_rate;
-- ALTER TABLE public.rental_jobs DROP COLUMN IF EXISTS display_currency;
