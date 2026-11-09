/* ============================================================
   MIGRATION 286 — one deal, one place for the night's money (Nov 2026, Adam)

   Income & settlements had three places to type a show's money:
     · the Income deal (budget_income: VS / PLUS / FLAT, %, escalator, cap, price)
     · a SECOND deal on the settlement (settlement: guarantee / guarantee_plus /
       door_deal / flat / festival, %, per-ticket bonus, cap, price) — stored
       apart, never filled in from the first;
     · Income's "Manual override", which typed actuals straight onto the income
       row — and once a row was Manual, the settlement silently stopped
       carrying anything to it.

   Adam's rules:
     · ONE deal per show, on budget_income. One list: FLAT (Flat guarantee —
       festival fees are flat too), VS (Versus), PLUS (Guarantee plus %),
       DOOR (Door deal). One escalator: a higher % above N tickets.
     · Actual money is typed ONLY on the settlement. Manual override is gone.

   What this does (re-runnable — a second paste changes nothing):
     1. Income deal types → the one list (guarantee_plus → VS, door_deal → DOOR,
        guarantee / flat / festival → FLAT, any case).
     2. Where a show's Income deal is blank, it takes the settlement's terms:
        type, deal %, capacity, ticket price. Income wins wherever it has a
        value. The settlement's per-ticket bonus is NOT carried (it isn't the
        escalator) — the last query lists those shows to re-enter.
     3. Manual actuals move to the settlement: where the settlement is blank,
        it takes the Manual guarantee / overage / merch / tickets / gross.
        Where the settlement already had a figure, the SETTLEMENT wins. Then
        the income row is re-filled from the settlement and marked 'settlement',
        so from now on the settlement carries it.
        (VIP has no settlement figure; its actual stays on the income row.)

   OPTIONAL — run first to see every show whose actual money will change
   (Manual figures that the settlement disagrees with):

     SELECT r.date, r.city, i.actual_guarantee AS manual_gtd,
            coalesce(s.reconciled_guarantee, s.day_of_guarantee) AS settlement_gtd,
            i.actual_overage AS manual_ov,
            coalesce(s.reconciled_overage, s.day_of_overage) AS settlement_ov,
            i.actual_merch AS manual_merch,
            coalesce(s.reconciled_merch, s.day_of_merch) AS settlement_merch
     FROM budget_income i
     JOIN routing r ON r.id = i.routing_id
     JOIN settlement s ON s.routing_id = i.routing_id
     WHERE i.actuals_source = 'manual'
       AND ((coalesce(s.reconciled_guarantee, s.day_of_guarantee) IS NOT NULL
             AND coalesce(s.reconciled_guarantee, s.day_of_guarantee) IS DISTINCT FROM i.actual_guarantee)
         OR (coalesce(s.reconciled_overage, s.day_of_overage) IS NOT NULL
             AND coalesce(s.reconciled_overage, s.day_of_overage) IS DISTINCT FROM i.actual_overage)
         OR (coalesce(s.reconciled_merch, s.day_of_merch) IS NOT NULL
             AND coalesce(s.reconciled_merch, s.day_of_merch) IS DISTINCT FROM i.actual_merch))
     ORDER BY r.date;

   HAND-PASTE into the Supabase SQL editor. Ends with three read-only lists.
   ============================================================ */


-- ── 1. Income deal types → the one list ─────────────────────────────────
UPDATE public.budget_income
SET deal_type = CASE lower(btrim(deal_type))
      WHEN 'vs' THEN 'VS' WHEN 'versus' THEN 'VS' WHEN 'guarantee_plus' THEN 'VS'
      WHEN 'plus' THEN 'PLUS'
      WHEN 'door' THEN 'DOOR' WHEN 'door_deal' THEN 'DOOR'
      WHEN 'flat' THEN 'FLAT' WHEN 'guarantee' THEN 'FLAT' WHEN 'festival' THEN 'FLAT'
      ELSE deal_type END
WHERE deal_type IS NOT NULL
  AND deal_type IS DISTINCT FROM CASE lower(btrim(deal_type))
      WHEN 'vs' THEN 'VS' WHEN 'versus' THEN 'VS' WHEN 'guarantee_plus' THEN 'VS'
      WHEN 'plus' THEN 'PLUS'
      WHEN 'door' THEN 'DOOR' WHEN 'door_deal' THEN 'DOOR'
      WHEN 'flat' THEN 'FLAT' WHEN 'guarantee' THEN 'FLAT' WHEN 'festival' THEN 'FLAT'
      ELSE deal_type END;


-- ── 2. Blank Income deal terms take the settlement's ─────────────────────
WITH t AS (
  SELECT
    i.id,
    coalesce(i.deal_type, CASE lower(btrim(s.deal_type))
        WHEN 'guarantee_plus' THEN 'VS' WHEN 'door_deal' THEN 'DOOR'
        WHEN 'guarantee' THEN 'FLAT' WHEN 'flat' THEN 'FLAT' WHEN 'festival' THEN 'FLAT'
        ELSE NULL END) AS deal_type,
    coalesce(i.deal_pct, s.deal_pct) AS deal_pct,
    coalesce(i.capacity, s.ticket_capacity) AS capacity,
    coalesce(i.face_value, s.ticket_price) AS face_value
  FROM public.budget_income i
  JOIN public.settlement s ON s.routing_id = i.routing_id AND s.workspace_id = i.workspace_id
)
UPDATE public.budget_income i
SET deal_type = t.deal_type,
    deal_pct = t.deal_pct,
    capacity = t.capacity,
    face_value = t.face_value
FROM t
WHERE t.id = i.id
  AND (i.deal_type, i.deal_pct, i.capacity, i.face_value)
      IS DISTINCT FROM (t.deal_type, t.deal_pct, t.capacity, t.face_value);


-- ── 3. Manual actuals move to the settlement ─────────────────────────────
-- 3a. A settlement row for every Manual show that has none.
INSERT INTO public.settlement (routing_id, workspace_id)
SELECT i.routing_id, i.workspace_id
FROM public.budget_income i
WHERE i.actuals_source = 'manual'
  AND NOT EXISTS (SELECT 1 FROM public.settlement s WHERE s.routing_id = i.routing_id)
ON CONFLICT (routing_id) DO NOTHING;

-- 3b. Blank settlement figures take the Manual ones (the settlement wins
--     wherever it already has a figure, day-of or reconciled).
UPDATE public.settlement s
SET reconciled_guarantee = CASE WHEN s.reconciled_guarantee IS NULL AND s.day_of_guarantee IS NULL
                                THEN i.actual_guarantee ELSE s.reconciled_guarantee END,
    reconciled_overage   = CASE WHEN s.reconciled_overage IS NULL AND s.day_of_overage IS NULL
                                THEN i.actual_overage ELSE s.reconciled_overage END,
    reconciled_merch     = CASE WHEN s.reconciled_merch IS NULL AND s.day_of_merch IS NULL
                                THEN i.actual_merch ELSE s.reconciled_merch END,
    reconciled_tickets_sold = CASE WHEN s.reconciled_tickets_sold IS NULL AND s.day_of_tickets_sold IS NULL
                                THEN i.actual_tickets_sold ELSE s.reconciled_tickets_sold END,
    reconciled_gross     = CASE WHEN s.reconciled_gross IS NULL AND s.day_of_gross IS NULL
                                THEN i.actual_gross ELSE s.reconciled_gross END,
    updated_at = now()
FROM public.budget_income i
WHERE i.routing_id = s.routing_id
  AND i.actuals_source = 'manual'
  AND (
       (s.reconciled_guarantee IS NULL AND s.day_of_guarantee IS NULL AND i.actual_guarantee IS NOT NULL)
    OR (s.reconciled_overage IS NULL AND s.day_of_overage IS NULL AND i.actual_overage IS NOT NULL)
    OR (s.reconciled_merch IS NULL AND s.day_of_merch IS NULL AND i.actual_merch IS NOT NULL)
    OR (s.reconciled_tickets_sold IS NULL AND s.day_of_tickets_sold IS NULL AND i.actual_tickets_sold IS NOT NULL)
    OR (s.reconciled_gross IS NULL AND s.day_of_gross IS NULL AND i.actual_gross IS NOT NULL)
  );

-- 3c. The income row is re-filled FROM the settlement (exactly what the
--     settlement's own save would carry) and the settlement owns it from now on.
--     Figures the settlement doesn't carry keep their value (never null-stomped).
UPDATE public.budget_income i
SET actual_guarantee    = coalesce(s.reconciled_guarantee, s.day_of_guarantee, i.actual_guarantee),
    actual_overage      = coalesce(s.reconciled_overage, s.day_of_overage, i.actual_overage),
    actual_merch        = coalesce(s.reconciled_merch, s.day_of_merch, i.actual_merch),
    actual_deductions   = coalesce(s.reconciled_deductions, s.day_of_deductions, i.actual_deductions),
    actual_tickets_sold = coalesce(s.reconciled_tickets_sold, s.day_of_tickets_sold, i.actual_tickets_sold),
    actual_gross        = coalesce(s.reconciled_gross, s.day_of_gross, i.actual_gross),
    actuals_source      = 'settlement',
    updated_at          = now()
FROM public.settlement s
WHERE s.routing_id = i.routing_id
  AND i.actuals_source = 'manual';


-- ── Read-only: things to look at by hand ─────────────────────────────────
-- (a) Shows whose settlement had a per-ticket bonus — re-enter it as the
--     deal's escalator (higher % above N tickets) if it still applies.
SELECT r.date, r.city, s.bonus_threshold, s.bonus_pct
FROM public.settlement s JOIN public.routing r ON r.id = s.routing_id
WHERE s.bonus_threshold IS NOT NULL OR s.bonus_pct IS NOT NULL
ORDER BY r.date;

-- (b) Deal types that aren't on the list (left as they were).
SELECT r.date, r.city, i.deal_type
FROM public.budget_income i JOIN public.routing r ON r.id = i.routing_id
WHERE i.deal_type IS NOT NULL AND i.deal_type NOT IN ('FLAT', 'VS', 'PLUS', 'DOOR')
ORDER BY r.date;

-- (c) Settlement deal terms on a show with no income row (not copied —
--     open the show and set its deal once).
SELECT r.date, r.city, s.deal_type, s.deal_pct
FROM public.settlement s JOIN public.routing r ON r.id = s.routing_id
WHERE (s.deal_type IS NOT NULL OR s.deal_pct IS NOT NULL)
  AND NOT EXISTS (SELECT 1 FROM public.budget_income i WHERE i.routing_id = s.routing_id)
ORDER BY r.date;


/* ============================================================
   DOWN — nothing structural was added (no columns, triggers or constraints).
   The deal-type renames, copied terms and moved actuals are data fixes and
   are kept. The settlement's old deal columns (migration 262) are still
   there, unread and unwritten.
   ============================================================ */
