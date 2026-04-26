'use client';

import { PlaceholderEntityDetail } from './PlaceholderEntityDetail';
import type { PersonEntity } from '../person';

export default function PersonEntitySlideOverBody({ entity }: { entity: PersonEntity }) {
  return (
    <PlaceholderEntityDetail
      kind="person"
      label={entity.name}
      entityId={entity.id}
      secondary={entity.lp_id + (entity.role ? ` · ${entity.role}` : '')}
    />
  );
}
