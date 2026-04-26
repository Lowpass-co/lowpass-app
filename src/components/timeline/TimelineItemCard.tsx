'use client';

import { CARD_BLOCK } from './layoutItems';
import type { ReactNode } from 'react';

type TimelineItemCardProps = {
  leftPx: number;
  widthPx: number;
  topPx: number;
  color?: string;
  onClick?: () => void;
  children: ReactNode;
};

export function TimelineItemCard({
  leftPx,
  widthPx,
  topPx,
  color,
  onClick,
  children,
}: TimelineItemCardProps) {
  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onClick}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onClick?.();
        }
      }}
      className="absolute overflow-hidden text-ellipsis rounded border text-left text-xs"
      style={{
        left: leftPx,
        top: topPx,
        width: widthPx,
        minHeight: CARD_BLOCK,
        maxHeight: CARD_BLOCK,
        lineHeight: `${CARD_BLOCK - 4}px`,
        borderColor: 'var(--lp-border)',
        background: 'var(--lp-surface)',
        color: 'var(--lp-text)',
        borderLeftWidth: 3,
        borderLeftColor: color ?? 'var(--lp-orange)',
        padding: '0 4px',
        boxShadow: 'var(--lp-shadow-sm)',
        cursor: onClick ? 'pointer' : 'default',
      }}
      title={typeof children === 'string' ? children : undefined}
    >
      <span className="block min-w-0 truncate">{children}</span>
    </div>
  );
}
