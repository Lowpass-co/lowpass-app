'use client';

import type { EntityKind } from '../types';

type Props = {
  kind: EntityKind;
  label: string;
  entityId: string;
  secondary?: string;
};

/**
 * Full entity detail bodies replace this per-entity in UX09–UX12. See also SLIDE_OVER_CONTRACT.md
 */
export function PlaceholderEntityDetail({ kind, label, entityId, secondary }: Props) {
  return (
    <div className="space-y-3 text-sm" style={{ color: 'var(--lp-text)' }}>
      <p style={{ color: 'var(--lp-text-secondary)' }}>
        Full content for {kind} records is coming in UX09–UX12. This panel is a placeholder for navigation and
        layout only.
      </p>
      <div
        className="rounded-md border p-3"
        style={{ borderColor: 'var(--lp-border)', background: 'var(--lp-surface)' }}
      >
        <div className="text-xs font-semibold uppercase" style={{ color: 'var(--lp-text-tertiary)' }}>
          {kind}
        </div>
        <p className="mt-1 font-medium">{label}</p>
        {secondary && (
          <p className="text-xs" style={{ color: 'var(--lp-text-secondary)' }}>
            {secondary}
          </p>
        )}
        <p className="mt-2 break-all font-mono text-xs" style={{ color: 'var(--lp-text-tertiary)' }}>
          {entityId}
        </p>
      </div>
    </div>
  );
}
