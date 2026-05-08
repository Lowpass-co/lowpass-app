'use client';

/* ============================================
   LOWPASS — PermissionMatrix (Sprint 9 §3)

   Read/write checkbox matrix for the canonical resource catalog.
   Used by both MemberManageSlideOver (per-member grants) and
   InviteMemberSlideOver (initial grants on invite).

   Behavior rules:
     - Toggling Write ON auto-toggles Read ON (write implies
       read at the can_access() helper layer; the UI mirrors).
     - Toggling Read OFF auto-toggles Write OFF (you can't
       have write without read).
     - When `disabled` (admin/manager role selected — the
       matrix is meaningless for them), the whole grid is
       overlaid + ignored on submit.

   Sensitive resources (per Adam's sign-off list) get a small
   warning indicator in their label and are surfaced in the
   sensitive-grants summary block emitted via the
   `onSensitiveGrantsChange` callback so the parent slide-over
   can show its inline warning + arm the confirm-on-save modal.
   ============================================ */

import { useEffect, useMemo } from 'react';
import { AlertTriangle } from 'lucide-react';
import {
  RESOURCE_CATALOG,
  RESOURCE_GROUP_LABELS,
  RESOURCE_GROUP_ORDER,
  isSensitive,
  type GrantInput,
  type ResourceDef,
  type ResourceGroup,
  type ResourcePermission,
} from '@/lib/permissions/resources';

interface PermissionMatrixProps {
  value: GrantInput[];
  onChange: (next: GrantInput[]) => void;
  /** True when the role is admin or manager — matrix is moot. */
  disabled?: boolean;
  /** Reports the list of currently-selected sensitive resource_ids
   *  upstream so the slide-over can render the warning + arm confirm-on-save. */
  onSensitiveGrantsChange?: (sensitiveResourceIds: string[]) => void;
}

function hasGrant(
  grants: GrantInput[],
  resource_id: string,
  permission: ResourcePermission,
): boolean {
  return grants.some(
    (g) => g.resource_id === resource_id && g.permission === permission,
  );
}

function setGrant(
  grants: GrantInput[],
  resource: ResourceDef,
  permission: ResourcePermission,
  on: boolean,
): GrantInput[] {
  // Filter out any existing grant for this resource_id+permission.
  const without = grants.filter(
    (g) => !(g.resource_id === resource.id && g.permission === permission),
  );
  if (!on) return without;
  return [
    ...without,
    {
      resource_type: resource.type,
      resource_id: resource.id,
      permission,
    },
  ];
}

export function PermissionMatrix({
  value,
  onChange,
  disabled = false,
  onSensitiveGrantsChange,
}: PermissionMatrixProps) {
  const sensitiveSelected = useMemo(() => {
    const ids = new Set<string>();
    for (const g of value) {
      if (isSensitive(g.resource_id)) ids.add(g.resource_id);
    }
    return Array.from(ids).sort();
  }, [value]);

  // Notify upstream of sensitive selection changes.
  useEffect(() => {
    onSensitiveGrantsChange?.(sensitiveSelected);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sensitiveSelected.join('|')]);

  const grouped = useMemo(() => {
    const map = new Map<ResourceGroup, ResourceDef[]>();
    for (const r of RESOURCE_CATALOG) {
      const arr = map.get(r.group) ?? [];
      arr.push(r);
      map.set(r.group, arr);
    }
    return map;
  }, []);

  function toggle(
    resource: ResourceDef,
    permission: ResourcePermission,
    on: boolean,
  ) {
    let next = setGrant(value, resource, permission, on);
    // Read off → Write off.
    if (permission === 'read' && !on) {
      next = setGrant(next, resource, 'write', false);
    }
    // Write on → Read on.
    if (permission === 'write' && on) {
      next = setGrant(next, resource, 'read', true);
    }
    onChange(next);
  }

  return (
    <div
      className="lp-permission-matrix"
      style={{
        position: 'relative',
        border: '1px solid var(--lp-border-strong)',
        borderRadius: 'var(--lp-radius-md)',
        overflow: 'hidden',
      }}
    >
      {/* Header row */}
      <div
        className="lp-label-caps"
        style={{
          display: 'grid',
          gridTemplateColumns: '1fr 60px 60px',
          alignItems: 'center',
          padding: 'var(--lp-space-2) var(--lp-space-3)',
          fontSize: 'var(--lp-text-2xs)',
          color: 'var(--lp-text-tertiary)',
          background: 'var(--lp-panel)',
          borderBottom: '1px solid var(--lp-border-subtle)',
        }}
      >
        <span>Resource</span>
        <span style={{ textAlign: 'center' }}>Read</span>
        <span style={{ textAlign: 'center' }}>Write</span>
      </div>

      {/* Group sections */}
      {RESOURCE_GROUP_ORDER.map((group) => {
        const items = grouped.get(group) ?? [];
        if (items.length === 0) return null;
        return (
          <div key={group}>
            <div
              className="lp-label-caps"
              style={{
                padding: 'var(--lp-space-2) var(--lp-space-3)',
                fontSize: 'var(--lp-text-2xs)',
                color: 'var(--lp-text-secondary)',
                background: 'var(--lp-bg)',
                borderTop: '1px solid var(--lp-border-subtle)',
              }}
            >
              {RESOURCE_GROUP_LABELS[group]}
            </div>
            {items.map((r) => {
              const readOn = hasGrant(value, r.id, 'read');
              const writeOn = hasGrant(value, r.id, 'write');
              const isSensitiveRow = isSensitive(r.id);
              return (
                <div
                  key={r.id}
                  style={{
                    display: 'grid',
                    gridTemplateColumns: '1fr 60px 60px',
                    alignItems: 'center',
                    padding: 'var(--lp-space-2) var(--lp-space-3)',
                    fontSize: 'var(--lp-text-sm)',
                    color: 'var(--lp-text)',
                    borderTop: '1px solid var(--lp-border-subtle)',
                  }}
                >
                  <div style={{ minWidth: 0 }}>
                    <div className="flex items-center" style={{ gap: 6 }}>
                      <span className="truncate">{r.label}</span>
                      {isSensitiveRow ? (
                        <AlertTriangle
                          size={12}
                          strokeWidth={2.4}
                          aria-label="Sensitive resource"
                          style={{ color: 'var(--color-lp-orange)', flexShrink: 0 }}
                        />
                      ) : null}
                    </div>
                    <div
                      style={{
                        marginTop: 2,
                        fontSize: 'var(--lp-text-xs)',
                        color: 'var(--lp-text-tertiary)',
                      }}
                    >
                      {r.description}
                    </div>
                  </div>
                  <div style={{ textAlign: 'center' }}>
                    <input
                      type="checkbox"
                      checked={readOn}
                      onChange={(e) => toggle(r, 'read', e.target.checked)}
                      disabled={disabled}
                      style={{ accentColor: 'var(--color-lp-orange)' }}
                      aria-label={`Read ${r.label}`}
                    />
                  </div>
                  <div style={{ textAlign: 'center' }}>
                    <input
                      type="checkbox"
                      checked={writeOn}
                      onChange={(e) => toggle(r, 'write', e.target.checked)}
                      disabled={disabled}
                      style={{ accentColor: 'var(--color-lp-orange)' }}
                      aria-label={`Write ${r.label}`}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        );
      })}

      {/* Disabled overlay */}
      {disabled ? (
        <div
          aria-hidden
          style={{
            position: 'absolute',
            inset: 0,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: 'var(--lp-space-3)',
            textAlign: 'center',
            background: 'color-mix(in srgb, var(--lp-panel) 80%, transparent)',
            color: 'var(--lp-text-secondary)',
            fontSize: 'var(--lp-text-sm)',
          }}
        >
          Admins / managers have full access — explicit permissions only apply to read-only members.
        </div>
      ) : null}
    </div>
  );
}
