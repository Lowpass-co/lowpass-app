'use client';

import { PlaceholderEntityDetail } from './PlaceholderEntityDetail';
import type { RoomEntity } from '../room';

export default function RoomEntitySlideOverBody({ entity }: { entity: RoomEntity }) {
  return (
    <PlaceholderEntityDetail
      kind="room"
      label={entity.hotel_name}
      entityId={entity.id}
      secondary={entity.city ? String(entity.city) : undefined}
    />
  );
}
