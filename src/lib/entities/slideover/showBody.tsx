'use client';

import { PlaceholderEntityDetail } from './PlaceholderEntityDetail';
import type { ShowEntity } from '../show';

function label(s: ShowEntity): string {
  return s.venue_name || s.city || s.date;
}

export default function ShowEntitySlideOverBody({ entity }: { entity: ShowEntity }) {
  return (
    <PlaceholderEntityDetail
      kind="show"
      label={label(entity)}
      entityId={entity.id}
      secondary={`${entity.date} · ${entity.day_type}`}
    />
  );
}
