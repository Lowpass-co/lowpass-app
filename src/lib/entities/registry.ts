import type { EntityDescriptor, EntityKind } from './types';

export type { EntityDescriptor, EntityKind } from './types';

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
