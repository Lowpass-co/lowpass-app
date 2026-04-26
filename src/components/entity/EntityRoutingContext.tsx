'use client';

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
  type ComponentType,
} from 'react';
import { registerAllEntities } from '@/lib/entities/registerAll';
import { getEntityDescriptor } from '@/lib/entities/registry';
import type { EntityKind } from '@/lib/entities/types';
import { SlideOver } from '@/components/shell/SlideOver';

export type EntityOpenTarget = { kind: EntityKind; id: string };

type RoutingValue = {
  open: (target: EntityOpenTarget) => void;
  close: () => void;
};

const EntityRoutingContext = createContext<RoutingValue | null>(null);

type InnerProps = { target: EntityOpenTarget; onClose: () => void };

function EntitySlideOverRoute({ target, onClose }: InnerProps) {
  const [title, setTitle] = useState('Loading…');
  const [subtitle, setSubtitle] = useState<string | undefined>(undefined);
  const [entity, setEntity] = useState<unknown | null>(null);
  const [Body, setBody] = useState<ComponentType<{ entity: unknown }> | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [fetchMiss, setFetchMiss] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setErr(null);
    setFetchMiss(false);
    setEntity(null);
    setBody(null);
    setTitle('Loading…');
    setSubtitle(undefined);

    const run = async () => {
      const desc = getEntityDescriptor(target.kind);
      if (!desc) {
        if (!cancelled) {
          setLoading(false);
          setErr(`Unknown entity kind: ${target.kind}`);
        }
        return;
      }
      const row = await desc.fetchById(target.id);
      if (cancelled) return;
      if (!row) {
        setLoading(false);
        setFetchMiss(true);
        setTitle('Not found');
        setSubtitle(target.id);
        return;
      }
      setTitle(desc.getLabel(row as never));
      setSubtitle(desc.getSecondary ? desc.getSecondary(row as never) : undefined);
      setEntity(row);
      try {
        const mod = await desc.SlideOverContent();
        if (!cancelled) setBody(() => mod.default as ComponentType<{ entity: unknown }>);
      } catch (e) {
        if (!cancelled) setErr(e instanceof Error ? e.message : 'Failed to load detail panel');
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    void run();
    return () => {
      cancelled = true;
    };
  }, [target]);

  return (
    <SlideOver
      open
      onClose={onClose}
      title={err ? 'Error' : title}
      subtitle={subtitle}
      ariaLabel={err ? 'Entity error' : `Entity: ${title}`}
    >
      {loading && !err && !fetchMiss && (
        <p className="text-sm" style={{ color: 'var(--lp-text-secondary)' }}>
          Loading…
        </p>
      )}
      {err && (
        <p className="text-sm" style={{ color: 'var(--color-lp-error)' }}>
          {err}
        </p>
      )}
      {fetchMiss && (
        <p className="text-sm" style={{ color: 'var(--lp-text-secondary)' }}>
          This entity could not be found or you don’t have access.
        </p>
      )}
      {!loading && !err && !fetchMiss && entity != null && Body != null ? (
        <Body entity={entity} />
      ) : null}
    </SlideOver>
  );
}

export function EntityRoutingProvider({ children }: { children: ReactNode }) {
  const [target, setTarget] = useState<EntityOpenTarget | null>(null);

  useEffect(() => {
    registerAllEntities();
  }, []);

  const open = useCallback((t: EntityOpenTarget) => {
    setTarget(t);
  }, []);

  const close = useCallback(() => {
    setTarget(null);
  }, []);

  const value = useMemo<RoutingValue>(
    () => ({ open, close }),
    [open, close]
  );

  return (
    <EntityRoutingContext.Provider value={value}>
      {children}
      {target && <EntitySlideOverRoute target={target} onClose={close} />}
    </EntityRoutingContext.Provider>
  );
}

export function useEntityRouting(): RoutingValue {
  const ctx = useContext(EntityRoutingContext);
  if (!ctx) {
    throw new Error('useEntityRouting must be used within EntityRoutingProvider');
  }
  return ctx;
}

export function useEntityRoutingIfPresent(): RoutingValue | null {
  return useContext(EntityRoutingContext);
}
