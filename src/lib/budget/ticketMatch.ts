/* ============================================
   LOWPASS — airline ticket → the flight(s) it paid for (pure, Oct 2026)

   A ticket receipt carries a booking reference, passenger names and legs
   (flight number, date, from, to) — see TicketFacts. A flight row in Lowpass is
   one person's ticket for one leg (flights are added one ticket per person).

   Matching, strongest first:
     1. booking reference = the flight's confirmation / PNR;
     2. else a leg: same date AND (same flight number, or same route when the
        ticket has no number);
   then narrowed to the ticket's passengers when it names any. Nothing is
   guessed: if the passengers named match none of the candidates, there is no
   match (the receipt goes to normal review).

   `auto` is true only when exactly one flight is left — then the receipt can
   be linked without asking. Several (a round trip, or one receipt for a group)
   are proposed with the amount split evenly, for the TM to confirm.
   ============================================ */

import { nameSimilarity } from '@/lib/import/dedupe';
import type { TicketFacts } from './receiptDocuments';

export interface FlightFacts {
  id: string;
  /** The flight's budget line (derived, flight_id). Null → can't take a receipt. */
  lineItemId: string | null;
  personName: string | null;
  airline: string | null;
  flightNumber: string | null;
  bookingRef: string | null;
  /** YYYY-MM-DD (wall clock). */
  date: string | null;
  from: string | null;
  to: string | null;
}

export interface TicketMatch {
  flights: FlightFacts[];
  auto: boolean;
  reason: string;
}

const clean = (s: string | null | undefined) => (s ?? '').replace(/[\s-]+/g, '').toUpperCase();

/** "DL 1234" / "Delta 1234" / "1234" → comparable parts. */
function flightKey(airline: string | null, number: string | null): { code: string; digits: string } {
  const n = clean(number);
  const m = /^([A-Z0-9]{2})(\d{1,4}[A-Z]?)$/.exec(n);
  if (m && /[A-Z]/.test(m[1])) return { code: m[1], digits: m[2].replace(/^0+/, '') };
  const digits = n.replace(/^[A-Z]+/, '').replace(/^0+/, '');
  const a = clean(airline);
  return { code: /^[A-Z0-9]{2}$/.test(a) ? a : '', digits };
}

function sameFlightNumber(f: FlightFacts, ticketNumber: string): boolean {
  const t = flightKey(null, ticketNumber);
  const k = flightKey(f.airline, f.flightNumber);
  if (!t.digits || !k.digits || t.digits !== k.digits) return false;
  return !t.code || !k.code || t.code === k.code;
}

const TITLES = new Set(['MR', 'MRS', 'MS', 'MISS', 'MSTR', 'DR', 'MX']);

/** "ROWLEY/ADAM MR" → "adam rowley"; "Adam Rowley" → "adam rowley". */
export function passengerName(raw: string): string {
  const s = raw.trim();
  const [last, first] = s.includes('/') ? s.split('/', 2) : [null, s];
  const parts = `${first ?? ''} ${last ?? ''}`
    .toUpperCase()
    .split(/\s+/)
    .filter((p) => p && !TITLES.has(p.replace(/\./g, '')));
  return parts.join(' ').toLowerCase();
}

function samePerson(flightPerson: string | null, passenger: string): boolean {
  const a = passengerName(flightPerson ?? '');
  const b = passengerName(passenger);
  if (!a || !b) return false;
  const ta = a.split(' ');
  const tb = b.split(' ');
  const [short, long] = ta.length <= tb.length ? [ta, tb] : [tb, ta];
  if (short.every((t) => long.includes(t))) return true;
  return nameSimilarity(a, b) >= 0.85;
}

export function matchTicket(t: TicketFacts | null | undefined, flights: FlightFacts[]): TicketMatch | null {
  if (!t) return null;
  const usable = flights.filter((f) => f.lineItemId);
  let candidates: FlightFacts[] = [];
  let by = '';
  const ref = clean(t.bookingRef);
  if (ref) {
    candidates = usable.filter((f) => clean(f.bookingRef) === ref);
    if (candidates.length) by = `booking ref ${ref}`;
  }
  if (!candidates.length) {
    const hit = new Set<string>();
    for (const leg of t.legs) {
      if (!leg.date) continue;
      for (const f of usable) {
        if (f.date !== leg.date) continue;
        const ok = leg.flightNumber
          ? sameFlightNumber(f, leg.flightNumber)
          : !!leg.from && !!leg.to && f.from === leg.from && f.to === leg.to;
        if (ok) hit.add(f.id);
      }
    }
    candidates = usable.filter((f) => hit.has(f.id));
    if (candidates.length) by = 'flight and date';
  }
  if (!candidates.length) return null;

  if (t.passengers.length) {
    const named = candidates.filter((f) => t.passengers.some((p) => samePerson(f.personName, p)));
    if (!named.length) return null; // a ticket for someone else — don't guess
    candidates = named;
  }

  const first = candidates[0];
  const route = first.from && first.to ? `${first.from}→${first.to}` : '';
  const who = candidates.length === 1 ? first.personName ?? '' : `${candidates.length} tickets`;
  return {
    flights: candidates,
    auto: candidates.length === 1,
    reason: [`Ticket — ${by}`, who, candidates.length === 1 ? route : null].filter(Boolean).join(' · '),
  };
}

/** Split a ticket receipt's total across the flights it paid for, in cents, so
 *  the parts always add back to the total (the last part takes the remainder). */
export function splitAmount(total: number, parts: number): number[] {
  if (parts <= 1) return [total];
  const cents = Math.round(total * 100);
  const each = Math.trunc(cents / parts);
  return Array.from({ length: parts }, (_, i) => (i === parts - 1 ? cents - each * (parts - 1) : each) / 100);
}

/** A flights row (as stored) → what matchTicket reads. `lineItemId` is the
 *  flight's derived budget line, if it has one. */
export function flightFacts(
  f: {
    id: string;
    person_name?: string | null;
    airline?: string | null;
    flight_number?: string | null;
    pnr?: string | null;
    confirmation?: string | null;
    depart_at?: string | null;
    origin_airport?: string | null;
    destination_airport?: string | null;
  },
  lineItemId: string | null,
): FlightFacts {
  const up = (s: string | null | undefined) => (s ? s.trim().toUpperCase() || null : null);
  return {
    id: f.id,
    lineItemId,
    personName: f.person_name ?? null,
    airline: f.airline ?? null,
    flightNumber: f.flight_number ?? null,
    bookingRef: up(f.pnr) ?? up(f.confirmation),
    date: f.depart_at ? f.depart_at.slice(0, 10) : null,
    from: up(f.origin_airport),
    to: up(f.destination_airport),
  };
}
