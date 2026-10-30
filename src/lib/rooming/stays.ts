/* ============================================
   LOWPASS — Rooming: assignments → stays (pure)

   The rooming grid stores ONE assignment per person per night
   (starts_on = ends_on = the night) in a room row keyed by hotel + room code,
   so every single on a night shares one "SGL" room row and a 3-night stay is
   three rows. Read naively that makes a rooming list that repeats people
   night by night and merges every single into one "shared" room.

   This turns any mix of per-night and ranged assignments into the stays a
   hotel expects:
     1. expand each assignment to the nights it covers (a range is
        [starts_on, ends_on); a same-day / reversed one is that one night);
     2. decide which physical room each guest-night is in: a room row is one
        room (the grid keeps one row per hotel + code, so DBL (A) is one room
        shared by everyone on it), EXCEPT a single (SGL / Single), which is one
        room per person even when the grid files every single under one row.
        With no room row id (unbooked nights grouped across placeholder
        hotels) the code itself identifies the room;
     3. merge consecutive nights where the same room holds the same guests.

   Pure — no I/O. Used by the rooming export (PDF + Excel) and the hotel
   budget lines (computeHotelTotals).
   ============================================ */

export interface NightInput {
  /** The hotel group this stay belongs to (a hotel id, or a placeholder key). */
  hotelKey: string;
  person: string | null;
  /** The room row; null → the room is identified by its code + number. */
  roomId: string | null;
  roomType: string | null;
  roomNumber: string | null;
  startsOn: string;
  endsOn: string;
}

export interface Stay {
  hotelKey: string;
  /** The room row the stay is in (null when identified by code). */
  roomId: string | null;
  roomType: string | null;
  roomNumber: string | null;
  guests: string[];
  checkIn: string;
  /** The morning after the last night. */
  checkOut: string;
  nights: number;
}

const DAY = 86_400_000;
const iso = (t: number) => new Date(t).toISOString().slice(0, 10);
const at = (d: string) => Date.parse(`${d.slice(0, 10)}T00:00:00Z`);

/** The nights an assignment covers, as YYYY-MM-DD. */
export function nightsOf(startsOn: string, endsOn: string): string[] {
  const a = at(startsOn);
  const b = at(endsOn);
  if (!Number.isFinite(a)) return [];
  if (!Number.isFinite(b) || b <= a) return [iso(a)];
  const out: string[] = [];
  for (let t = a; t < b && out.length < 400; t += DAY) out.push(iso(t));
  return out;
}

export function isSingle(type: string | null | undefined): boolean {
  const t = (type ?? '').trim().toUpperCase();
  return t === 'SGL' || t.startsWith('SGL ') || t.startsWith('SINGLE');
}

/** Rooms read "SGL" / "DBL (A)" in the grid; a hotel reads Single / Double (A). */
export function roomLabel(type: string | null, number: string | null): string {
  const t = (type ?? '').trim();
  let label = t;
  if (/^SGL\b/i.test(t)) label = `Single${t.slice(3)}`;
  else if (/^DBL\b/i.test(t)) label = `Double${t.slice(3)}`;
  else if (/^TWN\b/i.test(t)) label = `Twin${t.slice(3)}`;
  else if (/^TPL\b|^TRP\b/i.test(t)) label = `Triple${t.slice(3)}`;
  label = label.trim() || 'Room';
  return number ? `${label} · #${number}` : label;
}

/** Sort rooms as a hotel lists them: singles first, then shared rooms by code. */
function roomRank(type: string | null): string {
  const t = (type ?? '').trim().toUpperCase();
  if (isSingle(t)) return `0${t}`;
  if (t.startsWith('DBL') || t.startsWith('DOUBLE')) return `1${t}`;
  if (t.startsWith('TW')) return `2${t}`;
  return `3${t}`;
}

const isEmptyRoom = (type: string | null) => {
  const t = (type ?? '').trim();
  return !t || t === '-';
};

export function buildStays(input: NightInput[], range?: { from: string | null; to: string | null }): Stay[] {
  // night → room identity → occupants
  type Slot = { hotelKey: string; roomId: string | null; roomType: string | null; roomNumber: string | null; guests: Set<string> };
  const byNight = new Map<string, Map<string, Slot>>();
  for (const a of input) {
    if (isEmptyRoom(a.roomType) && !a.roomNumber) continue;
    const guest = (a.person ?? '').trim() || 'Unnamed guest';
    for (const night of nightsOf(a.startsOn, a.endsOn)) {
      if (range?.from && night < range.from) continue;
      if (range?.to && night > range.to) continue;
      const room = `${a.hotelKey}|${a.roomId ?? `${(a.roomType ?? '').trim().toUpperCase()}#${a.roomNumber ?? ''}`}`;
      const roomKey = isSingle(a.roomType) ? `${room}|${guest}` : room;
      const rooms = byNight.get(night) ?? new Map<string, Slot>();
      byNight.set(night, rooms);
      const slot = rooms.get(roomKey) ?? { hotelKey: a.hotelKey, roomId: a.roomId, roomType: a.roomType, roomNumber: a.roomNumber, guests: new Set<string>() };
      slot.guests.add(guest);
      rooms.set(roomKey, slot);
    }
  }

  // Walk the nights in order, extending a stay while the same room holds the
  // same guests on the next night.
  const open = new Map<string, Stay & { sig: string; last: string }>();
  const done: Stay[] = [];
  const closeStay = (s: Stay & { sig: string; last: string }) => {
    done.push({ hotelKey: s.hotelKey, roomId: s.roomId, roomType: s.roomType, roomNumber: s.roomNumber, guests: s.guests, checkIn: s.checkIn, checkOut: s.checkOut, nights: s.nights });
  };
  for (const night of [...byNight.keys()].sort()) {
    const rooms = byNight.get(night)!;
    const prevNight = iso(at(night) - DAY);
    for (const [roomKey, slot] of rooms) {
      const guests = [...slot.guests].sort((x, y) => x.localeCompare(y));
      const sig = guests.join('\u0001');
      const cur = open.get(roomKey);
      if (cur && cur.sig === sig && cur.last === prevNight) {
        cur.last = night;
        cur.nights += 1;
        cur.checkOut = iso(at(night) + DAY);
        continue;
      }
      if (cur) closeStay(cur);
      open.set(roomKey, {
        hotelKey: slot.hotelKey,
        roomId: slot.roomId,
        roomType: slot.roomType,
        roomNumber: slot.roomNumber,
        guests,
        checkIn: night,
        checkOut: iso(at(night) + DAY),
        nights: 1,
        sig,
        last: night,
      });
    }
  }
  for (const s of open.values()) closeStay(s);

  return done.sort(
    (a, b) =>
      a.hotelKey.localeCompare(b.hotelKey) ||
      a.checkIn.localeCompare(b.checkIn) ||
      roomRank(a.roomType).localeCompare(roomRank(b.roomType)) ||
      (a.guests[0] ?? '').localeCompare(b.guests[0] ?? ''),
  );
}

export interface StaySummary {
  people: number;
  roomNights: number;
  /** Rooms needed each night, in date order. */
  perNight: { night: string; rooms: number }[];
  peakRooms: number;
}

export function summariseStays(stays: Stay[]): StaySummary {
  const people = new Set<string>();
  const perNight = new Map<string, number>();
  let roomNights = 0;
  for (const s of stays) {
    s.guests.forEach((g) => people.add(g));
    roomNights += s.nights;
    for (const n of nightsOf(s.checkIn, s.checkOut)) perNight.set(n, (perNight.get(n) ?? 0) + 1);
  }
  const list = [...perNight.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([night, rooms]) => ({ night, rooms }));
  return { people: people.size, roomNights, perNight: list, peakRooms: list.reduce((m, x) => Math.max(m, x.rooms), 0) };
}
