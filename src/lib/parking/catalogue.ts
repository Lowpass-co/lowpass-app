/* ============================================
   LOWPASS — Parking maps: what can go on the map (Nov 2026, Adam)

   ONE list each for vehicles and markers. Vehicle sizes are the defaults Adam
   agreed (scope doc, 10 Nov 2026): typical legal maximums, editable per
   vehicle. Heights are typical figures for the 3D page — check them against
   the bus / truck company's spec sheet.
   ============================================ */

export type VehicleType =
  | 'bus_us' | 'bus_us_trailer' | 'bus_eu' | 'bus_eu_trailer'
  | 'truck_us' | 'truck_eu' | 'tractor_eu' | 'trailer_eu' | 'tractor_us' | 'trailer_us'
  | 'luton' | 'box_us' | 'bandwagon' | 'bandwagon_trailer'
  | 'splitter' | 'sprinter' | 'vito' | 'car' | 'generator';

export interface VehicleSpec {
  type: VehicleType;
  label: string;
  /** Default label prefix on the map ("Bus 1"). */
  short: string;
  length: number;
  width: number;
  height: number;
  /** Fill role — the colour token family it is drawn in. */
  role: 'bus' | 'truck' | 'van' | 'car' | 'power';
  /** A towed trailer at the rear, drawn as its own section behind a drawbar
   *  gap. `length` above is the WHOLE rig, nose to trailer tail. */
  trailer?: { length: number; gap: number };
  /** Ground to keep clear behind the tail when the back is opened — a trailer's
   *  drop-down ramp, a tail lift, van doors. Drawn as a red hatched box
   *  (`rearClearCorners`, model.ts). Trucks have none: their doors open flush. */
  rear?: { length: number; what: string };
}

export const VEHICLES: readonly VehicleSpec[] = [
  { type: 'bus_eu', label: 'Tour bus, EU / UK', short: 'Bus', length: 13.5, width: 2.55, height: 4.0, role: 'bus' },
  /* Nov 2026 (Adam: "a trailer option for UK and US bus"). 18.75 m is the UK
     maximum for a vehicle towing a trailer; the trailer is a typical enclosed
     luggage / backline trailer. Check the bus company's figures. */
  { type: 'bus_eu_trailer', label: 'Tour bus + trailer, EU / UK', short: 'Bus', length: 18.75, width: 2.55, height: 4.0, role: 'bus', trailer: { length: 4.3, gap: 1.0 }, rear: { length: 2.0, what: 'Tail lift / ramp' } },
  { type: 'bus_us', label: 'Tour bus, US (45 ft)', short: 'Bus', length: 13.7, width: 2.6, height: 3.7, role: 'bus' },
  /* 45 ft coach + ~14 ft enclosed trailer + drawbar ≈ 19 m (US states commonly
     allow 65 ft combined). */
  { type: 'bus_us_trailer', label: 'Tour bus + trailer, US', short: 'Bus', length: 19, width: 2.6, height: 3.7, role: 'bus', trailer: { length: 4.3, gap: 1.0 }, rear: { length: 2.1, what: 'Ramp door' } },
  { type: 'truck_eu', label: 'Truck, EU (artic)', short: 'Truck', length: 16.5, width: 2.55, height: 4.0, role: 'truck' },
  { type: 'truck_us', label: 'Truck, US (53 ft)', short: 'Truck', length: 22, width: 2.6, height: 4.1, role: 'truck' },
  /* Nov 2026 (Adam: "EU/UK truck cabs without trailer, and then trailers
     without cabs"). A 4×2 tractor unit (DAF XF / Volvo FH class) ≈ 6.0 m, and
     the standard 13.6 m box semi-trailer on its own. Typical figures. */
  { type: 'tractor_eu', label: 'Truck cab only (tractor unit), EU / UK', short: 'Cab', length: 6.0, width: 2.55, height: 3.9, role: 'truck' },
  { type: 'trailer_eu', label: 'Trailer only (13.6 m), EU / UK', short: 'Trailer', length: 13.6, width: 2.55, height: 4.0, role: 'truck' },
  /* US (Adam, Nov 2026: "cab / trailer on the USA side too"): a sleeper
     tractor (Cascadia 126, 72 in raised roof: 227–235 in wheelbase listed) ≈
     27 ft overall — an estimate from the wheelbase; and the 53 ft dry van,
     53 ft × 102 in × 13 ft 6 in (Wabash / Hyundai Translead sheets). */
  { type: 'tractor_us', label: 'Truck cab only (sleeper tractor), US', short: 'Cab', length: 8.3, width: 2.6, height: 4.1, role: 'truck' },
  { type: 'trailer_us', label: 'Trailer only (53 ft), US', short: 'Trailer', length: 16.15, width: 2.6, height: 4.11, role: 'truck' },
  /* "Box trucks in the UK and US" — UK: a Luton van (Adam), the 3.5 t
     Transit / Sprinter box with the peak over the cab: ≈ 6.9 m × 2.2 m (box)
     × 3.3 m. US: a 26 ft box truck, ≈ 34 ft overall, 102" wide, ≈ 12 ft 6 in. */
  { type: 'luton', label: 'Luton van (3.5 t), UK', short: 'Luton', length: 6.9, width: 2.2, height: 3.3, role: 'van', rear: { length: 1.6, what: 'Tail lift' } },
  { type: 'box_us', label: 'Box truck, US (26 ft)', short: 'Box truck', length: 10.4, width: 2.6, height: 3.8, role: 'truck' },
  /* Rear clearances (`rear`, Nov 2026 — Adam: "a hashed red box behind for the
     drop distance"): BandWagon says allow 66 ft kerb for 59 ft rigs → 7 ft
     (2.1 m) for the ramp; US enclosed-trailer ramp doors are 69–78 in tall, so
     a 2.1 m drop for bus trailers too. EU bus trailers carry a tail lift or
     ramp — 2.0 m is typical, not a maker figure. Luton tail-lift platforms
     are 1.3–1.6 m deep (Dhollandia / Anteo / Zepro sheets). Sprinter barn
     doors: 1,555 mm opening, two leaves ≈ 0.8 m swing. Vito tailgate ≈ 1.0 m
     (estimate from its 1.26 m opening). Splitter trailer doors ≈ 0.8 m
     (estimate). Turn it off per vehicle in the editor. */
  /* "Bandwagon / Pullman / Yoda coach" — the US mid-level sleeper on a
     Freightliner cab. BandWagon RV Rentals (FAQ, Nov 2026): 38 ft long, 8.5 ft
     wide, 13 ft high; with one of their 8 × 16 ft trailers, 59 ft overall.
     (Street parking: they say allow 66 ft for the drop-down ramp/door.) */
  { type: 'bandwagon', label: 'Bandwagon / Pullman (38 ft), US', short: 'Bandwagon', length: 11.6, width: 2.6, height: 3.96, role: 'bus' },
  { type: 'bandwagon_trailer', label: 'Bandwagon / Pullman + trailer, US', short: 'Bandwagon', length: 18.0, width: 2.6, height: 3.96, role: 'bus', trailer: { length: 5.5, gap: 0.9 }, rear: { length: 2.1, what: 'Ramp door' } },
  { type: 'splitter', label: 'Splitter van + trailer', short: 'Van', length: 12, width: 2.1, height: 2.8, role: 'van', rear: { length: 0.8, what: 'Trailer doors' } },
  /* Nov 2026 (Adam: "a sprinter without trailer"). Mercedes Sprinter extra-
     long wheelbase, high roof: 7.37 m × 2.02 m (body, mirrors folded) × 2.8 m. */
  { type: 'sprinter', label: 'Sprinter / splitter van, no trailer', short: 'Van', length: 7.4, width: 2.02, height: 2.8, role: 'van', rear: { length: 0.8, what: 'Rear doors' } },
  /* "In the UK add Mercedes Vito too". Vito Tourer extra-long: 5.37 m ×
     1.93 m (body, mirrors folded) × 1.91 m. */
  { type: 'vito', label: 'Mercedes Vito (extra long)', short: 'Vito', length: 5.4, width: 1.93, height: 1.91, role: 'van', rear: { length: 1.0, what: 'Tailgate' } },
  { type: 'car', label: 'Car / runner', short: 'Car', length: 5, width: 2, height: 1.5, role: 'car' },
  { type: 'generator', label: 'Generator', short: 'Generator', length: 6, width: 2.5, height: 2.6, role: 'power' },
];

export const vehicleSpec = (t: string): VehicleSpec | undefined => VEHICLES.find((v) => v.type === t);

/* The editor's Add tab (Nov 2026, Adam): a UK / EU | US switch, and one tile
   per kind of vehicle in that region's sizes. */
export type VehicleRegion = 'eu' | 'us';
export const VEHICLE_TILES: Record<VehicleRegion, { type: VehicleType; label: string }[]> = {
  eu: [
    { type: 'bus_eu', label: 'Tour bus' },
    { type: 'bus_eu_trailer', label: 'Bus + trailer' },
    { type: 'truck_eu', label: 'Truck (artic)' },
    { type: 'tractor_eu', label: 'Truck cab only' },
    { type: 'trailer_eu', label: 'Trailer only' },
    { type: 'luton', label: 'Luton van' },
    { type: 'splitter', label: 'Splitter + trailer' },
    { type: 'sprinter', label: 'Sprinter' },
    { type: 'vito', label: 'Vito' },
    { type: 'car', label: 'Car / runner' },
    { type: 'generator', label: 'Generator' },
  ],
  us: [
    { type: 'bus_us', label: 'Tour bus 45 ft' },
    { type: 'bus_us_trailer', label: 'Bus + trailer' },
    { type: 'bandwagon', label: 'Bandwagon' },
    { type: 'bandwagon_trailer', label: 'Bandwagon + trailer' },
    { type: 'truck_us', label: 'Truck 53 ft' },
    { type: 'tractor_us', label: 'Truck cab only' },
    { type: 'trailer_us', label: 'Trailer only' },
    { type: 'box_us', label: 'Box truck 26 ft' },
    { type: 'splitter', label: 'Splitter + trailer' },
    { type: 'sprinter', label: 'Sprinter' },
    { type: 'car', label: 'Car / runner' },
    { type: 'generator', label: 'Generator' },
  ],
};

/** The switch's starting side: US sizes in North America, else UK / EU. */
export function regionFor(at: { lat: number; lng: number } | null): VehicleRegion {
  if (!at) return 'eu';
  return at.lng < -50 && at.lng > -170 && at.lat > 10 ? 'us' : 'eu';
}

/** Paints a vehicle can be given instead of its type's colour (Nov 2026,
 *  Adam: "add colours to the vehicles") — e.g. band bus vs crew bus. One
 *  list; each is a `--lp-map-paint-<id>` token. */
export const PAINTS = [
  { id: 'orange', label: 'Orange' },
  { id: 'red', label: 'Red' },
  { id: 'yellow', label: 'Yellow' },
  { id: 'green', label: 'Green' },
  { id: 'teal', label: 'Teal' },
  { id: 'blue', label: 'Blue' },
  { id: 'purple', label: 'Purple' },
  { id: 'pink', label: 'Pink' },
  { id: 'white', label: 'White' },
  { id: 'black', label: 'Black' },
] as const;

export type PaintId = (typeof PAINTS)[number]['id'];

export type MarkerType = 'load_in' | 'shore_power' | 'gate' | 'height_limit' | 'water' | 'dump' | 'security' | 'note';

export interface MarkerSpec {
  type: MarkerType;
  label: string;
  /** What the detail box asks for. */
  detailHint: string;
}

export const MARKERS: readonly MarkerSpec[] = [
  { type: 'load_in', label: 'Load-in door', detailHint: 'e.g. Dock 2, level access' },
  { type: 'shore_power', label: 'Shore power', detailHint: 'e.g. 63 A three-phase, 2 × 32 A' },
  { type: 'gate', label: 'Gate / entrance', detailHint: 'e.g. Code 1234, ask security' },
  { type: 'height_limit', label: 'Height limit', detailHint: 'e.g. 4.2 m' },
  { type: 'water', label: 'Water', detailHint: 'e.g. Standpipe, bring a hose' },
  { type: 'dump', label: 'Dump / waste', detailHint: '' },
  { type: 'security', label: 'Security', detailHint: 'e.g. Gatehouse, 24 h' },
  { type: 'note', label: 'Note', detailHint: '' },
];

export const markerSpec = (t: string): MarkerSpec | undefined => MARKERS.find((m) => m.type === t);

export type AreaType = 'crew' | 'guest' | 'no_go' | 'other';

export const AREAS: readonly { type: AreaType; label: string }[] = [
  { type: 'crew', label: 'Crew parking' },
  { type: 'guest', label: 'Guest parking' },
  { type: 'no_go', label: 'No-go area' },
  { type: 'other', label: 'Area' },
];

export const areaLabel = (t: string): string => AREAS.find((a) => a.type === t)?.label ?? 'Area';
