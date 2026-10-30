/* ============================================
   Airline ticket receipts → the flight(s) they paid for (Oct 2026).
   ============================================ */

import { describe, it, expect } from 'vitest';
import { flightFacts, matchTicket, passengerName, splitAmount } from './ticketMatch';
import { ticketFacts } from './receiptDocuments';

const F = (id: string, o: Partial<Parameters<typeof flightFacts>[0]>, line: string | null = `line-${id}`) =>
  flightFacts({ id, airline: 'DL', flight_number: '1234', depart_at: '2026-09-09T09:10:00', origin_airport: 'jfk', destination_airport: 'bna', ...o }, line);

const flights = [
  F('a', { person_name: 'Adam Rowley', pnr: 'ABC123' }),
  F('b', { person_name: 'Ben Quinton', pnr: 'ABC123' }),
  F('c', { person_name: 'Adam Rowley', flight_number: '999', depart_at: '2026-09-12T08:00:00', origin_airport: 'BNA', destination_airport: 'LAX', confirmation: 'ZZZ999' }),
  F('d', { person_name: 'Dil', flight_number: '1234', pnr: null }, null),
];

describe('reading the ticket', () => {
  it('normalises what the model returned, and ignores a non-ticket', () => {
    expect(ticketFacts({ booking_ref: ' abc 123 ', passengers: ['ROWLEY/ADAM MR', ''], legs: [{ flight_number: 'dl 1234', date: '2026-09-09', from: 'jfk', to: 'bna' }] })).toEqual({
      bookingRef: 'ABC123',
      passengers: ['ROWLEY/ADAM MR'],
      legs: [{ flightNumber: 'DL1234', date: '2026-09-09', from: 'JFK', to: 'BNA' }],
    });
    expect(ticketFacts(null)).toBeNull();
    expect(ticketFacts({ passengers: ['A'] })).toBeNull(); // nothing to match on
  });

  it('reads airline-style names', () => {
    expect(passengerName('ROWLEY/ADAM MR')).toBe('adam rowley');
    expect(passengerName('Mr. Adam Rowley')).toBe('adam rowley');
  });
});

describe('matching', () => {
  it('booking ref + passenger → that one ticket, linked without asking', () => {
    const m = matchTicket({ bookingRef: 'ABC123', passengers: ['ROWLEY/ADAM MR'], legs: [] }, flights)!;
    expect(m.flights.map((f) => f.id)).toEqual(['a']);
    expect(m.auto).toBe(true);
    expect(m.reason).toContain('booking ref ABC123');
  });

  it('a group booking with no names → every ticket on it, for review', () => {
    const m = matchTicket({ bookingRef: 'ABC123', passengers: [], legs: [] }, flights)!;
    expect(m.flights.map((f) => f.id)).toEqual(['a', 'b']);
    expect(m.auto).toBe(false);
  });

  it('no booking ref → flight number and date', () => {
    const m = matchTicket({ bookingRef: null, passengers: ['Adam Rowley'], legs: [{ flightNumber: 'DL0999', date: '2026-09-12', from: null, to: null }] }, flights)!;
    expect(m.flights.map((f) => f.id)).toEqual(['c']);
  });

  it('a ticket for someone not on these flights is not guessed', () => {
    expect(matchTicket({ bookingRef: 'ABC123', passengers: ['Someone Else'], legs: [] }, flights)).toBeNull();
  });

  it('a flight with no budget line can\'t take the receipt', () => {
    expect(matchTicket({ bookingRef: null, passengers: ['Dil'], legs: [{ flightNumber: 'DL1234', date: '2026-09-09', from: null, to: null }] }, flights)).toBeNull();
  });

  it('the wrong date never matches', () => {
    expect(matchTicket({ bookingRef: null, passengers: [], legs: [{ flightNumber: 'DL1234', date: '2026-09-10', from: null, to: null }] }, flights)).toBeNull();
  });
});

describe('splitting a group receipt', () => {
  it('parts add back to the total exactly', () => {
    expect(splitAmount(100, 3)).toEqual([33.33, 33.33, 33.34]);
    expect(splitAmount(1234.5, 1)).toEqual([1234.5]);
    expect(splitAmount(0.05, 2).reduce((a, b) => a + b, 0)).toBeCloseTo(0.05, 10);
  });
});
