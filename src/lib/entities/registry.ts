import type { EntityDescriptor, EntityKind } from './types';

const registry = new Map<EntityKind, EntityDescriptor<unknown>>();

export function registerEntity<T>(desc: EntityDescriptor<T>): void {
  if (registry.has(desc.kind) && process.env.NODE_ENV === 'development') {
    if (typeof globalThis !== 'undefined' && 'console' in globalThis) {
      globalThis.console.warn(`[entities] re-registering kind "${desc.kind}"`);
    }
  }
  registry.set(desc.kind, desc as EntityDescriptor<unknown>);
}

export function getEntityDescriptor(kind: EntityKind): EntityDescriptor<unknown> | null {
  return registry.get(kind) ?? null;
}

export type { EntityDescriptor, EntityKind } from './types';
