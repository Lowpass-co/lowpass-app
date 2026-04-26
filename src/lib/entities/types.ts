import type { ComponentType } from 'react';

export type EntityKind = 'person' | 'flight' | 'room' | 'gear' | 'show';

export type EntityDescriptor<T> = {
  kind: EntityKind;
  fetchById: (id: string) => Promise<T | null>;
  search: (query: string, opts?: { limit?: number; tourId?: string }) => Promise<T[]>;
  getLabel: (entity: T) => string;
  getSecondary?: (entity: T) => string;
  getColor?: (entity: T) => string;
  /** Lazy-loaded body for the entity SlideOver (code-split). */
  SlideOverContent: () => Promise<{ default: ComponentType<{ entity: T }> }>;
};
