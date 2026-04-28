'use client';

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ComponentType,
  type ReactNode,
} from 'react';
// Side-effect import: registers all canonical entity descriptors with the registry
import '@/lib/entities';
import { getEntityDescriptor } from '@/lib/entities/registry';
import type { EntityKind } from '@/lib/entities/types';

export type EntityOpenTarget = { kind: EntityKind; id: string };

type RoutingValue = {
  open: (target: EntityOpenTarget) => void;
  close: () => void;
};

const EntityRoutingContext = createContext<RoutingValue | null>(null);

type InnerProps = { target: EntityOpenTarget; onClose: () => void };

/**
 * Lazy-loads the entity-specific SlideOver component and renders it directly.
 * The SlideOver components own their own chrome (via the shell/SlideOver
 * primitive) and fetch their own data given an id — this route just resolves
 * the descriptor and forwards id + onClose.
 */
function EntitySlideOverRoute({ target, onClose }: InnerProps) {
  const [Body, setBody] = useState<ComponentType<{ id: string; onClose: () => void }> | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setBody(null);
    setErr(null);

    const run = async () => {
      const desc = getEntityDescriptor(target.kind);
      if (!desc) {
        if (!cancelled) setErr(`Unknown entity kind: ${target.kind}`);
        return;
      }
      try {
        const mod = await desc.SlideOverContent();
        if (!cancelled) {
          setBody(() => mod.default as ComponentType<{ id: string; onClose: () => void }>);
        }
      } catch (e) {
        if (!cancelled) setErr(e instanceof Error ? e.message : 'Failed to load detail panel');
      }
    };
    void run();
    return () => {
      cancelled = true;
    };
  }, [target]);

  if (err) {
    return (
      <div
        role="alert"
        className="fixed inset-0 z-50 flex items-center justify-center"
        style={{ color: 'var(--color-lp-error)' }}
      >
        <div
          className="max-w-md rounded-lg p-6"
          style={{
            background: 'var(--lp-surface)',
            border: '1px solid var(--lp-border)',
            boxShadow: 'var(--lp-shadow-lg)',
          }}
        >
          <p className="text-sm">{err}</p>
          <button
            type="button"
            className="mt-3 rounded-md px-3 py-1.5 text-sm"
            style={{ background: 'var(--lp-surface-hover)', color: 'var(--lp-text)' }}
            onClick={onClose}
          >
            Close
          </button>
        </div>
      </div>
    );
  }

  if (!Body) return null;
  return <Body id={target.id} onClose={onClose} />;
}

export function EntityRoutingProvider({ children }: { children: ReactNode }) {
  const [target, setTarget] = useState<EntityOpenTarget | null>(null);

  const open = useCallback((t: EntityOpenTarget) => setTarget(t), []);
  const close = useCallback(() => setTarget(null), []);

  const value = useMemo<RoutingValue>(() => ({ open, close }), [open, close]);

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
