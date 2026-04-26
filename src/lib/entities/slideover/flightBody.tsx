'use client';

import { PlaceholderEntityDetail } from './PlaceholderEntityDetail';
import type { FlightEntity } from '../flight';

function flightLabel(f: FlightEntity): string {
  const route = [f.origin_code, f.destination_code].filter(Boolean).join(' → ');
  return f.flight_number ? `${f.flight_number} ${route}`.trim() : f.person_name;
}

export default function FlightEntitySlideOverBody({ entity }: { entity: FlightEntity }) {
  return (
    <PlaceholderEntityDetail
      kind="flight"
      label={flightLabel(entity)}
      entityId={entity.id}
      secondary={entity.airline ? String(entity.airline) : undefined}
    />
  );
}
