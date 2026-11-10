/* ============================================================
   MIGRATION 288 — put parking maps back on their venue (Nov 2026, Adam)

   The bug: the server rounded each map's anchor (its lat/lng pin) to 3
   decimals, which is roughly 111 m north–south and 66 m east–west in the UK.
   The editor kept the exact pin while you drew, but saved the rounded one.
   Every item is stored as metres east / north of the anchor, so after a
   reload the whole drawing jumped by up to ~55 m against the imagery.
   The code fix (parseAnchor keeps 1e-7°, ~1 cm) stops it from happening
   again. This migration repairs the maps that were already saved.

   What it can repair: a map whose pin came from its venue. The editor
   starts there, so the true pin is canonical_venues.lat/lng. A map is
   treated as rounded only when all three hold:
     · its anchor is exactly a 3-decimal value
     · it is within 0.0005° of its venue (the most rounding can move it)
     · it is not already equal to the venue
   It gets the venue's exact pin, and its version goes up by one. That way
   a tab that was open before the repair gets "changed elsewhere" instead of
   quietly saving the rounded pin back.

   What it can't repair: a pin that came from an address search or pasted
   coordinates (no venue pin to restore). The read-only query at the end
   lists those maps.

   CAUTION: anything placed AFTER a reload was placed against the rounded
   pin, so the repair shifts it by the same amount. Run the PREVIEW first.

   HAND-PASTE into the Supabase SQL editor. Idempotent: a re-run matches
   nothing, because a repaired anchor equals its venue.
   ============================================================ */

/* ── PREVIEW (read-only): what would move, and how far ──────────────
SELECT pm.id, pm.routing_id, pm.updated_at,
       pm.anchor_lat, pm.anchor_lng, cv.lat AS venue_lat, cv.lng AS venue_lng,
       round(((cv.lat - pm.anchor_lat) * 111320)::numeric, 1) AS north_m,
       round(((cv.lng - pm.anchor_lng) * 111320 * cos(radians(cv.lat)))::numeric, 1) AS east_m
FROM public.parking_maps pm
JOIN public.canonical_venues cv ON cv.id = pm.canonical_venue_id
WHERE cv.lat IS NOT NULL AND cv.lng IS NOT NULL
  AND pm.anchor_lat = round(pm.anchor_lat::numeric, 3)
  AND pm.anchor_lng = round(pm.anchor_lng::numeric, 3)
  AND abs(pm.anchor_lat - cv.lat) <= 0.00050001
  AND abs(pm.anchor_lng - cv.lng) <= 0.00050001
  AND (pm.anchor_lat <> cv.lat OR pm.anchor_lng <> cv.lng);
*/

UPDATE public.parking_maps pm
SET anchor_lat = cv.lat,
    anchor_lng = cv.lng,
    version = pm.version + 1,
    updated_at = now()
FROM public.canonical_venues cv
WHERE cv.id = pm.canonical_venue_id
  AND cv.lat IS NOT NULL AND cv.lng IS NOT NULL
  AND pm.anchor_lat = round(pm.anchor_lat::numeric, 3)
  AND pm.anchor_lng = round(pm.anchor_lng::numeric, 3)
  AND abs(pm.anchor_lat - cv.lat) <= 0.00050001
  AND abs(pm.anchor_lng - cv.lng) <= 0.00050001
  AND (pm.anchor_lat <> cv.lat OR pm.anchor_lng <> cv.lng);

/* ── LEFT AS THEY ARE (read-only): rounded pins with no venue pin to restore ──
SELECT pm.id, pm.routing_id, pm.anchor_lat, pm.anchor_lng, pm.updated_at
FROM public.parking_maps pm
LEFT JOIN public.canonical_venues cv ON cv.id = pm.canonical_venue_id
WHERE pm.anchor_lat = round(pm.anchor_lat::numeric, 3)
  AND pm.anchor_lng = round(pm.anchor_lng::numeric, 3)
  AND (cv.lat IS NULL OR cv.lng IS NULL
       OR pm.anchor_lat <> cv.lat OR pm.anchor_lng <> cv.lng);
*/

/* ============================================================
   DOWN MIGRATION (manual)
   ----------------------------------------------------------
   None. The rounded pins were the bug; there is nothing to go back to.
   ============================================================ */
