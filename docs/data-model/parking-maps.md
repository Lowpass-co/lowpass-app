# Parking maps (`parking_maps`, migration 287 — Nov 2026)

One map per show (routing row). Phase 1 of the parking-maps scope: an overhead
satellite plan pinned to the venue, with vehicles at true size, exported as an
A4 PDF into tour Files.

## Table

| Column | Meaning |
| --- | --- |
| `workspace_id`, `tour_id`, `routing_id` | Owner. `routing_id` is UNIQUE (one map per show). RLS checks the routing row belongs to the tour, and the tour to the caller's workspace. |
| `canonical_venue_id` | The venue at save time; lets a later map at the same venue start from this one (phase 3). |
| `anchor_lat`, `anchor_lng` | The fixed point every item is measured from. Set from `canonical_venues.lat/lng`, else found by geocode / pasted coordinates on first open. Never moves once saved. |
| `view` | `{ cx, cy, ppm, rotation, cam3d? }` — where the editor was left: centre (metres), pixels per metre, compass bearing pointing up the screen; `cam3d` = the 3D page's chosen camera `{ x, y, alt, heading, pitch, roll }` (ground-frame position, ellipsoid height in m, degrees) used for PDF page 2. |
| `items` | The drawing (jsonb array) — see below. Written ONLY through `parseMapBody()`. |
| `notes` | Free text printed on the PDF. ≤ 4,000 chars. |
| `version` | Optimistic lock. `PUT` names the version it edited; stale → 409 with the current row. |
| `pdf_file_id`, `pdf_exported_at` | The last exported PDF (a `file_references` row in tour Files, folder "Parking maps", linked to the show). |

No imagery is stored anywhere — Google's Map Tiles terms forbid caching it.

## Items — metres around the anchor

Every position is **metres east (`x`) and north (`y`) of the anchor**
(`src/lib/parking/geo.ts`, a local equirectangular frame: distance error far
below 1 % within a few km). Headings are compass degrees: 0 = the vehicle's front
faces north, 90 = east.

| `kind` | Fields |
| --- | --- |
| `vehicle` | `type` (`VEHICLES` in `src/lib/parking/catalogue.ts`), `label`, `x`, `y`, `heading`, `length`, `width`, `height` (m), optional `colour` (a `PAINTS` id; absent = the type's colour) |
| `marker` | `type` (`MARKERS`), `label`, `detail`, `x`, `y` |
| `route` | `label`, `points[]` (≥ 2) |
| `area` | `type` (`crew` / `guest` / `no_go` / `other`), `label`, `points[]` (≥ 3) |
| `measure` | `a`, `b` |

Bounds enforced by `parseMapBody()` (`src/lib/parking/model.ts`): ≤ 300 items,
≤ 200 points per shape, everything within 5 km of the anchor, vehicle sizes
0.5–40 m long / ≤ 6 m wide / ≤ 8 m high, ids `[A-Za-z0-9_-]{1,40}`, unknown
fields dropped, text trimmed and capped.

Heights drive the 3D page (`vehicleBlocks`, `src/lib/parking/blocks3d.ts`); the overhead plan ignores them.

## Code

- Rules: `src/lib/parking/{geo,catalogue,model,edit,summary,print,silhouettes}.ts` (pure, tested) — `print.ts` frames the PDF on the drawing; `silhouettes.ts` is each vehicle's parts (cab, hood, glass, drawbar, trailer…) with heights for the 3D page
- Server: `src/server/parking/maps.ts` (`loadParkingShow`, `loadParkingMap`, `saveParkingMap`, `recordPdf`, `loadParkingIndex`); API `/api/tours/[id]/parking/[routingId]` (GET / PUT / PATCH)
- UI: `src/components/parking/` — `ParkingIndex` (the tour's shows), `ParkingEditor` (one show), `ParkingScene` (the ONE renderer: editor + PDF), `exportPdf`, `googleTiles`
- Pages: Production › Parking — `/operations/[tourId]/parking` and `/operations/[tourId]/parking/[routingId]`. The show's advance links to it (`linked.parking` in `loadAdvanceShow`).
