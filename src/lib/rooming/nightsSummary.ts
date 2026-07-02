/* ============================================
   LOWPASS — Rooming Nights summary (pure)

   Extracted from <RoomingNightsOverview> so the per-hotel STAY roll-up is
   unit-testable (node harness) and shares ONE nights/checkout convention with
   the export loader (src/lib/export/rooming-data.ts stayNights).

   Two defects fixed here (revamp Phase 0):
     - #8  Single-night stays: a block whose stored check_out is on/before its
           check_in is ONE night — check-out becomes the day AFTER check-in and
           nights = 1 (never 0 / same-day "in → out"). Mirrors the export.
     - #9  Room-count collision: two rooms with a NULL room_id and the same
           room_type were collapsed to one (keyed on room_type alone), so two
           singles counted as one. A null room_id now keys per-ASSIGNMENT, so
           each unlinked room counts on its own. A real room_id still collapses
           shared occupants into one room (the intended grouping).

   Pure — no React, no I/O. Never mutates the source rows.
   ============================================ */

export interface HotelAssignment {
  id: string;
  room_id?: string | null;
  person_name: string | null;
  check_in: string | null;
  check_out: string | null;
  room_type: string | null;
  rate_per_night: number;
}

export interface RoomingHotel {
  id: string;
  hotel_name: string;
  city?: string | null;
  room_assignments?: HotelAssignment[];
}

export interface StayRow {
  id: string;
  hotel: string;
  city: string;
  inDate: string | null;
  outDate: string | null;
  nights: number;
  s: number;
  d: number;
  t: number;
  pax: number;
  cost: number;
}

export function nightsBetween(start?: string | null, end?: string | null): number {
  if (!start || !end) return 0;
  const ms = new Date(`${end}T12:00:00`).getTime() - new Date(`${start}T12:00:00`).getTime();
  return Number.isFinite(ms) && ms > 0 ? Math.round(ms / 86_400_000) : 0;
}

export function addDays(date: string, days: number): string {
  const d = new Date(`${date}T12:00:00`);
  if (Number.isNaN(d.getTime())) return date;
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

/** #8 — single-night normalisation: a stay whose stored check_out is on/before
 *  check_in is ONE night; check-out = the day after check-in. Multi-day stays
 *  are returned unchanged. Mirrors export stayNights. */
export function effectiveStay(checkIn: string | null, checkOut: string | null): {
  nights: number;
  checkOut: string | null;
} {
  if (!checkIn) return { nights: nightsBetween(checkIn, checkOut), checkOut: checkOut ?? null };
  const raw = nightsBetween(checkIn, checkOut);
  if (raw < 1) return { nights: 1, checkOut: addDays(checkIn, 1) };
  return { nights: raw, checkOut: checkOut ?? null };
}

export function summariseHotel(h: RoomingHotel): StayRow {
  const assignments = h.room_assignments ?? [];
  // group by room_id → one room. A NULL room_id can't be reliably grouped with
  // any other room, so key it per-ASSIGNMENT (#9) — two unlinked singles stay two.
  const rooms = new Map<string, { type: string; rate: number; start: string | null; end: string | null }>();
  const pax = new Set<string>();
  let inDate: string | null = null;
  let outDate: string | null = null;
  for (const a of assignments) {
    if (a.person_name) pax.add(a.person_name);
    const { checkOut: effOut } = effectiveStay(a.check_in, a.check_out);
    if (a.check_in && (!inDate || a.check_in < inDate)) inDate = a.check_in;
    if (effOut && (!outDate || effOut > outDate)) outDate = effOut;
    const type = (a.room_type ?? '').trim();
    if (!type || type === '-') continue;
    const key = a.room_id ?? `__a:${a.id}`;
    const prev = rooms.get(key);
    if (!prev) {
      rooms.set(key, { type, rate: Number(a.rate_per_night) || 0, start: a.check_in, end: a.check_out });
    } else {
      if (a.check_in && (!prev.start || a.check_in < prev.start)) prev.start = a.check_in;
      if (a.check_out && (!prev.end || a.check_out > prev.end)) prev.end = a.check_out;
    }
  }
  let s = 0;
  let d = 0;
  let t = 0;
  let cost = 0;
  for (const room of rooms.values()) {
    const up = room.type.toUpperCase();
    if (up.startsWith('SGL') || up.startsWith('SINGLE')) s += 1;
    else if (up.startsWith('DBL') || up.startsWith('DOUBLE') || up.startsWith('TWIN')) d += 1;
    else if (up.startsWith('TPL') || up.startsWith('TRP') || up.startsWith('TRIPLE')) t += 1;
    else d += 1; // default unknown paid rooms to "double" bucket
    const { nights } = effectiveStay(room.start, room.end);
    cost += room.rate * nights;
  }
  return {
    id: h.id,
    hotel: h.hotel_name,
    city: h.city ?? '',
    inDate,
    outDate,
    nights: nightsBetween(inDate, outDate),
    s,
    d,
    t,
    pax: pax.size,
    cost,
  };
}
