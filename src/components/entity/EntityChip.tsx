'use client';

import { FileSignature, type LucideIcon } from 'lucide-react';
import type { EntityKind } from '@/lib/entities/registry';
import { cn } from '@/lib/utils';

const KIND_ICONS: Partial<Record<EntityKind, LucideIcon>> = {
  'deal-memo': FileSignature,
};

type ChipProps = {
  kind: EntityKind;
  /** Primary row */
  title: string;
  /** Secondary line */
  subtitle?: string;
  /** Optional status-derived colour emphasis */
  color?: string | null;
  className?: string;
};

/**
 * Lightweight entity row chip (canonical kinds + extensions).
 */
export function EntityChip({ kind, title, subtitle, color, className }: ChipProps) {
  const Icon = KIND_ICONS[kind];

  let borderAccent = false;
  if (kind === 'deal-memo' && color) {
    borderAccent = true;
  }

  return (
    <span
      className={cn(
        'inline-flex max-w-full items-center gap-2 rounded-full border px-2 py-0.5 text-left text-[11px] font-medium leading-tight text-lp-text',
        borderAccent ? 'border-[var(--lp-border)]' : 'border-transparent',
        className
      )}
      style={
        color
          ? {
              borderLeft: `3px solid ${color}`,
            }
          : undefined
      }
    >
      {Icon ? (
        <Icon className="h-3.5 w-3.5 shrink-0" style={{ color: color ?? 'var(--lp-text-tertiary)' }} aria-hidden />
      ) : null}
      <span className="min-w-0">
        <span className="block truncate">{title}</span>
        {subtitle ? (
          <span className="block truncate text-[10px] font-normal text-lp-text-tertiary">{subtitle}</span>
        ) : null}
      </span>
    </span>
  );
}
