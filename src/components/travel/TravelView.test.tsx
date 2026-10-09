/* ============================================
   LOWPASS — Travel (UX simplification, Oct 2026)

   What these pin:
   - times are read from the stored string, never shifted by the viewer's zone;
   - a blank (00:00) time is not shown as a midnight departure;
   - totals never add one currency to another;
   - the slide-over's wall-clock round trip is lossless — the old one moved a
     flight an hour per save in BST;
   - the page lists flights, and Add posts what was typed to the create route.
   ============================================ */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { TravelView, flightDateLabel, flightTimeLabel, totalsByCurrency } from './TravelView';
import { toWallClockInput, fromWallClockInput } from '@/components/entity/flight/FlightSlideOver';
import type { Flight } from '@/lib/types/flight';

const flight = (over: Partial<Flight> = {}): Flight => ({
  id: 'f1', workspaceId: 'w', tourId: 't', airline: 'BA', flightNumber: '117', pnr: null,
  originAirport: 'LHR', destinationAirport: 'JFK',
  departAt: '2026-10-14T10:05:00+00:00', arriveAt: '2026-10-14T13:00:00+00:00',
  costAmount: 500, costCurrency: 'GBP', passengerIds: [], notes: null, showId: null,
  personName: 'Sam Lee', role: null, confirmation: 'ABC123',
  createdAt: '', updatedAt: '', ...over,
});

describe('formatting reads the stored string', () => {
  it('date and time come straight from the ISO text', () => {
    expect(flightDateLabel('2026-10-14T23:30:00+00:00')).toBe('Wed 14 Oct');
    expect(flightTimeLabel('2026-10-14T23:30:00+00:00')).toBe('23:30');
  });

  it('a midnight default is not a departure time', () => {
    expect(flightTimeLabel('2026-10-14T00:00:00+00:00')).toBe('—');
  });

  it('garbage reads as a dash, not "Invalid Date"', () => {
    expect(flightDateLabel(null)).toBe('—');
    expect(flightDateLabel('nope')).toBe('—');
  });
});

describe('totals are per currency', () => {
  it('never sums GBP with USD', () => {
    const t = totalsByCurrency([
      flight({ id: 'a', costAmount: 100, costCurrency: 'GBP' }),
      flight({ id: 'b', costAmount: 50, costCurrency: 'USD' }),
      flight({ id: 'c', costAmount: 25, costCurrency: 'gbp' }),
      flight({ id: 'd', costAmount: null }),
    ]);
    expect(t).toEqual([{ currency: 'GBP', amount: 125 }, { currency: 'USD', amount: 50 }]);
  });
});

describe('the slide-over keeps wall-clock time', () => {
  it('round-trips without moving the flight', () => {
    const stored = '2026-07-14T10:05:00+00:00';
    const box = toWallClockInput(stored);
    expect(box).toBe('2026-07-14T10:05');
    expect(fromWallClockInput(box)).toBe('2026-07-14T10:05:00.000Z');
    expect(toWallClockInput(fromWallClockInput(box))).toBe(box);
  });

  it('an incomplete box is no time at all', () => {
    expect(fromWallClockInput('')).toBeNull();
    expect(fromWallClockInput('2026-07-14')).toBeNull();
  });
});

describe('<TravelView>', () => {
  const fetchMock = vi.fn();
  beforeEach(() => {
    fetchMock.mockReset();
    vi.stubGlobal('fetch', fetchMock);
  });
  afterEach(() => vi.unstubAllGlobals());

  const row = {
    id: 'f1', workspace_id: 'w', tour_id: 't', airline: 'BA', flight_number: '117', pnr: null,
    origin_airport: 'LHR', destination_airport: 'JFK',
    depart_at: '2026-10-14T10:05:00+00:00', arrive_at: '2026-10-14T13:00:00+00:00',
    cost_amount: 500, cost_currency: 'GBP', passenger_ids: [], notes: null, show_id: null,
    person_name: 'Sam Lee', role: null, confirmation: 'ABC123', created_at: '', updated_at: '',
  };

  it('lists the tour’s flights with who, route and a per-currency total', async () => {
    fetchMock.mockResolvedValue(new Response(JSON.stringify({ flights: [row] }), { status: 200 }));
    render(<TravelView tourId="t" tourCurrency="GBP" crewNames={['Sam Lee']} />);
    expect(await screen.findByText('Sam Lee')).toBeTruthy();
    expect(screen.getByText('LHR → JFK')).toBeTruthy();
    expect(screen.getByTestId('travel-summary').textContent).toBe('1 flight · £500.00');
    expect(fetchMock.mock.calls[0][0]).toBe('/api/flights?tour_id=t&limit=200');
  });

  it('an empty tour says what to do next', async () => {
    fetchMock.mockResolvedValue(new Response(JSON.stringify({ flights: [] }), { status: 200 }));
    render(<TravelView tourId="t" tourCurrency="GBP" crewNames={[]} />);
    expect(await screen.findByText(/No flights yet/)).toBeTruthy();
  });

  it('Add flight posts what was typed, in wall-clock form, to the create route', async () => {
    fetchMock.mockImplementation((url: string) =>
      Promise.resolve(new Response(JSON.stringify(url.startsWith('/api/budget/flights') ? { id: 'n' } : { flights: [] }), { status: 200 })),
    );
    render(<TravelView tourId="t" tourCurrency="GBP" crewNames={[]} />);
    fireEvent.click(await screen.findByText('Add flight'));
    fireEvent.change(screen.getByLabelText(/^Who/), { target: { value: 'Sam Lee' } });
    fireEvent.change(screen.getByLabelText('From'), { target: { value: 'lhr' } });
    fireEvent.change(screen.getByLabelText('To'), { target: { value: 'jfk' } });
    fireEvent.change(screen.getByLabelText(/^Date/), { target: { value: '2026-10-14' } });
    fireEvent.change(screen.getByLabelText('Departs'), { target: { value: '10:05' } });
    fireEvent.change(screen.getByLabelText('Cost (GBP)'), { target: { value: '499.5' } });
    fireEvent.submit(screen.getByTestId('travel-add-form'));

    await waitFor(() => expect(fetchMock.mock.calls.some((c) => c[0] === '/api/budget/flights')).toBe(true));
    const call = fetchMock.mock.calls.find((c) => c[0] === '/api/budget/flights')!;
    expect(JSON.parse((call[1] as RequestInit).body as string)).toMatchObject({
      tour_id: 't', person_name: 'Sam Lee', origin_code: 'LHR', destination_code: 'JFK',
      departure_date: '2026-10-14', departure_time: '10:05', actual_cost: 499.5,
    });
  });

  it('Add refuses a flight with nobody on it, and says why', async () => {
    fetchMock.mockResolvedValue(new Response(JSON.stringify({ flights: [] }), { status: 200 }));
    render(<TravelView tourId="t" tourCurrency="GBP" crewNames={[]} />);
    fireEvent.click(await screen.findByText('Add flight'));
    fireEvent.submit(screen.getByTestId('travel-add-form'));
    expect((await screen.findByRole('alert')).textContent).toBe('Who is flying?');
    expect(fetchMock.mock.calls.some((c) => c[0] === '/api/budget/flights')).toBe(false);
  });
});
