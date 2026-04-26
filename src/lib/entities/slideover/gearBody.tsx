'use client';

import { PlaceholderEntityDetail } from './PlaceholderEntityDetail';
import type { GearEntity } from '../gear';

export default function GearEntitySlideOverBody({ entity }: { entity: GearEntity }) {
  return (
    <PlaceholderEntityDetail
      kind="gear"
      label={entity.name}
      entityId={entity.id}
      secondary={entity.type}
    />
  );
}
