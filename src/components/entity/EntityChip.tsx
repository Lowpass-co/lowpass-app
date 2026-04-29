'use client';

import { useCallback, useEffect, useState } from 'react';
import { BedDouble, Briefcase, ChevronRight, FileSignature, Music, Plane, Speaker, User } from "lucide-react";
import { cn } from '@/lib/utils';
import { getEntityDescriptor } from '@/lib/entities/registry';
import type { EntityKind } from '@/lib/entities/types';
import { useEntityRoutingIfPresent } from './EntityRoutingContext';

const kindIcon: Record<EntityKind, typeof User> = {
  person: User,
  flight: Plane,
  room: BedDouble,
  gear: Speaker,
  show: Music,
  tour: Briefcase,
  'deal-memo': FileSignature,
};

export type EntityChipProps = {
  kind: EntityKind;
  id: string;
  prefetch?: { label: string; secondary?: string; color?: string };
  variant?: 'default' | 'compact' | 'inline';
  clickable?: boolean;
  onClick?: () => void;
  className?: string;
};

type FetchedDisplay = {
  label: string;
  secondary?: string;
  color?: string;
  missing: boolean;
};

export function EntityChip({
  kind,
  id,
  prefetch,
  variant = 'default',
  clickable = true,
  onClick,
  className,
}: EntityChipProps) {
  const routing = useEntityRoutingIfPresent();
  const [fetched, setFetched] = useState<FetchedDisplay | null>(null);
  const [loading, setLoading] = useState(!prefetch);

  useEffect(() => {
    if (prefetch) {
      return;
    }
    let cancelled = false;
    // Defer state to microtask: avoids react-hooks/set-state-in-effect (sync) while keeping one paint of loading
    const tick = () => {
      if (cancelled) return;
      setLoading(true);
      setFetched(null);
      const d = getEntityDescriptor(kind);
      if (!d) {
        if (!cancelled) {
          setFetched({ label: id, missing: true });
          setLoading(false);
        }
        return;
      }
      void d.fetchById(id).then((row) => {
        if (cancelled) return;
        if (!row) {
          setFetched({ label: id, missing: true });
          setLoading(false);
          return;
        }
        setFetched({
          label: d.getLabel(row as never),
          secondary: d.getSecondary ? d.getSecondary(row as never) : undefined,
          color: d.getColor ? d.getColor(row as never) : undefined,
          missing: false,
        });
        setLoading(false);
      });
    };
    queueMicrotask(tick);
    return () => {
      cancelled = true;
    };
  }, [kind, id, prefetch]);

  const label = prefetch ? prefetch.label : (fetched?.label ?? '');
  const secondary = prefetch ? prefetch.secondary : fetched?.secondary;
  const color = prefetch ? prefetch.color : fetched?.color;
  const missing = prefetch ? false : (fetched?.missing ?? false);
  const showLoading = !prefetch && loading;

  const open = useCallback(() => {
    if (onClick) onClick();
    else routing?.open({ kind, id });
  }, [onClick, routing, kind, id]);

  const Icon = kindIcon[kind];
  const aria = missing
    ? `${kind} not found: ${id}`
    : `Open ${kind} ${label || id}`.trim();

  if (variant === 'inline') {
    return (
      <button
        type="button"
        className={cn('bg-transparent p-0 text-left underline', className)}
        style={{
          color: missing ? 'var(--lp-text-tertiary)' : 'var(--lp-orange)',
          cursor: clickable && (onClick || routing) ? 'pointer' : 'default',
          textDecoration: 'underline',
        }}
        onClick={e => {
          e.stopPropagation();
          if (!clickable) return;
          open();
        }}
        disabled={!clickable}
        title={missing ? 'Entity not found' : label}
        aria-label={aria}
      >
        {showLoading ? '…' : missing ? id : label || id}
      </button>
    );
  }

  if (variant === 'compact') {
    return (
      <button
        type="button"
        onClick={e => {
          e.stopPropagation();
          if (!clickable) return;
          open();
        }}
        disabled={!clickable}
        className={cn('inline-flex max-w-full min-w-0 items-center gap-0.5 rounded-full border text-left', className)}
        style={{
          padding: '1px 8px 1px 8px',
          fontSize: 'var(--lp-text-xs)',
          borderColor: missing ? 'var(--lp-border-light)' : 'var(--lp-border-light)',
          background: missing ? 'var(--lp-bg-secondary)' : 'var(--lp-surface)',
          color: 'var(--lp-text)',
          cursor: clickable && (onClick || routing) ? 'pointer' : 'default',
          textDecoration: missing ? 'line-through' : undefined,
        }}
        title={missing ? 'Entity not found' : (secondary ? `${label} — ${secondary}` : label) || id}
        aria-label={aria}
      >
        {showLoading ? (
          <span className="h-3 w-12 animate-pulse rounded bg-lp-bg-tertiary" style={{ minWidth: 40 }} />
        ) : (
          <span className="min-w-0 truncate">
            {missing ? id : label || id}
          </span>
        )}
        {clickable && (onClick || routing) && !showLoading && (
          <ChevronRight className="h-2.5 w-2.5 shrink-0 opacity-60" aria-hidden />
        )}
      </button>
    );
  }

  return (
    <button
      type="button"
      onClick={e => {
        e.stopPropagation();
        if (!clickable) return;
        open();
      }}
      disabled={!clickable}
      className={cn(
        'inline-flex max-w-full min-w-0 items-center gap-1 rounded-full border text-left',
        'hover:opacity-95',
        className
      )}
      style={{
        padding: 'var(--lp-space-1) var(--lp-space-3)',
        fontSize: 'var(--lp-text-sm)',
        borderColor: 'var(--lp-border-light)',
        background: missing ? 'var(--lp-bg-secondary)' : 'var(--lp-surface)',
        color: 'var(--lp-text)',
        cursor: clickable && (onClick || routing) ? 'pointer' : 'default',
        textDecoration: missing ? 'line-through' : undefined,
      }}
      title={missing ? 'Entity not found' : (secondary ? `${label} — ${secondary}` : label) || id}
      aria-label={aria}
    >
      {showLoading ? (
        <span className="h-4 w-24 animate-pulse rounded" style={{ background: 'var(--lp-border-light)' }} />
      ) : (
        <>
          <Icon
            className="h-3.5 w-3.5 shrink-0"
            style={{ color: color || 'var(--lp-text-tertiary)' }}
            aria-hidden
          />
          <span className="min-w-0 flex-1 truncate">
            {missing ? id : label || id}
          </span>
          {clickable && (onClick || routing) && (
            <ChevronRight className="h-3.5 w-3.5 shrink-0 opacity-60" aria-hidden />
          )}
        </>
      )}
    </button>
  );
}
