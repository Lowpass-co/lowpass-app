import type { ComponentType } from 'react';

export type EntityKind = 'flight' | 'person' | 'room' | 'show' | 'tour';

export type EntityDescriptor<T> = {
  kind: EntityKind;
  fetchById: (id: string) => Promise<T | null>;
  search: (query: string, opts?: { tourId?: string; limit?: number }) => Promise<T[]>;
  getLabel: (entity: T) => string;
  getSecondary: (entity: T) => string;
  SlideOverContent: () => Promise<{ default: ComponentType<{ id: string; onClose: () => void }> }>;
};

const registry = new Map<EntityKind, EntityDescriptor<unknown>>();

export function registerEntity<T>(descriptor: EntityDescriptor<T>): void {
  registry.set(descriptor.kind, descriptor as EntityDescriptor<unknown>);
}

export function getEntityDescriptor<T>(kind: EntityKind): EntityDescriptor<T> | null {
  return (registry.get(kind) as EntityDescriptor<T> | undefined) ?? null;
}

export function getRegisteredEntityKinds(): EntityKind[] {
  return Array.from(registry.keys());
}
