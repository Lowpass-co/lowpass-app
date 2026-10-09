export type Flight = {
  id: string;
  workspaceId: string;
  tourId: string;
  airline: string | null;
  flightNumber: string | null;
  pnr: string | null;
  originAirport: string;
  destinationAirport: string;
  departAt: string;
  arriveAt: string;
  costAmount: number | null;
  costCurrency: string;
  passengerIds: string[];
  notes: string | null;
  showId: string | null;
  /** Who is flying (free text — flights predate canonical passengers). */
  personName?: string | null;
  role?: string | null;
  /** Booking reference. Falls back to pnr for older rows. */
  confirmation?: string | null;
  createdAt: string;
  updatedAt: string;
};
