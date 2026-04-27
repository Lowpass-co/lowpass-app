import { formatDate } from '@/lib/utils';
import { getFlightById, searchFlights } from '@/lib/api/flights';
import { registerEntity } from './registry';

registerEntity({
  kind: 'flight',
  fetchById: getFlightById,
  search: async (query: string, opts?: { tourId?: string; limit?: number }) =>
    searchFlights(query, opts),
  getLabel: (f) =>
    `${f.airline ?? '?'} ${f.flightNumber ?? ''}`.trim() || `Flight ${f.id.slice(0, 6)}`,
  getSecondary: (f) =>
    `${f.originAirport} → ${f.destinationAirport} · ${formatDate(f.departAt)}`,
  SlideOverContent: () => import('@/components/entity/flight/FlightSlideOver'),
});
