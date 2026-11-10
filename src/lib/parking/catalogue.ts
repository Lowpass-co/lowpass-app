/* ============================================
   LOWPASS — Parking maps: what can go on the map (Nov 2026, Adam)

   ONE list each for vehicles and markers. Vehicle sizes are the defaults Adam
   agreed (scope doc, 10 Nov 2026): typical legal maximums, editable per
   vehicle. Heights are typical figures for the 3D page — check them against
   the bus / truck company's spec sheet.
   ============================================ */

export type VehicleType = 'bus_us' | 'bus_us_trailer' | 'bus_eu' | 'bus_eu_trailer' | 'truck_us' | 'truck_eu' | 'splitter' | 'car' | 'generator';

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
}

export const VEHICLES: readonly VehicleSpec[] = [
  { type: 'bus_eu', label: 'Tour bus, EU / UK', short: 'Bus', length: 13.5, width: 2.55, height: 4.0, role: 'bus' },
  /* Nov 2026 (Adam: "a trailer option for UK and US bus"). 18.75 m is the UK
     maximum for a vehicle towing a trailer; the trailer is a typical enclosed
     luggage / backline trailer. Check the bus company's figures. */
  { type: 'bus_eu_trailer', label: 'Tour bus + trailer, EU / UK', short: 'Bus', length: 18.75, width: 2.55, height: 4.0, role: 'bus', trailer: { length: 4.3, gap: 1.0 } },
  { type: 'bus_us', label: 'Tour bus, US (45 ft)', short: 'Bus', length: 13.7, width: 2.6, height: 3.7, role: 'bus' },
  /* 45 ft coach + ~14 ft enclosed trailer + drawbar ≈ 19 m (US states commonly
     allow 65 ft combined). */
  { type: 'bus_us_trailer', label: 'Tour bus + trailer, US', short: 'Bus', length: 19, width: 2.6, height: 3.7, role: 'bus', trailer: { length: 4.3, gap: 1.0 } },
  { type: 'truck_eu', label: 'Truck, EU (artic)', short: 'Truck', length: 16.5, width: 2.55, height: 4.0, role: 'truck' },
  { type: 'truck_us', label: 'Truck, US (53 ft)', short: 'Truck', length: 22, width: 2.6, height: 4.1, role: 'truck' },
  { type: 'splitter', label: 'Splitter van + trailer', short: 'Van', length: 12, width: 2.1, height: 2.8, role: 'van' },
  { type: 'car', label: 'Car / runner', short: 'Car', length: 5, width: 2, height: 1.5, role: 'car' },
  { type: 'generator', label: 'Generator', short: 'Generator', length: 6, width: 2.5, height: 2.6, role: 'power' },
];

export const vehicleSpec = (t: string): VehicleSpec | undefined => VEHICLES.find((v) => v.type === t);

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
