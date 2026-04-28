import type { ComponentType } from 'react';

/**
 * Canonical entity kinds. Adding a new kind requires:
 * 1. Adding it to this union
 * 2. Creating a descriptor file at src/lib/entities/<kind>.ts
 * 3. Registering the descriptor in src/lib/entities/registerAll.ts
 * 4. Adding an EntityChip icon mapping in src/components/entity/EntityChip.tsx
 * 5. Building a SlideOver in src/components/entity/<kind>/<Kind>SlideOver.tsx
 */
export type EntityKind =
  | 'person'
  | 'flight'
  | 'room'
  | 'gear'
  | 'show'
  | 'tour'
  | 'deal-memo';

export type EntityDescriptor<T> = {
  kind: EntityKind;
  fetchById: (id: string) => Promise<T | null>;
  search: (query: string, opts?: { limit?: number; tourId?: string }) => Promise<T[]>;
  getLabel: (entity: T) => string;
  getSecondary?: (entity: T) => string;
  getColor?: (entity: T) => string;
  /** Lazy-loaded body for the entity SlideOver (code-split). */
  SlideOverContent: () => Promise<{ default: ComponentType<{ id: string; onClose: () => void }> }>;
};
