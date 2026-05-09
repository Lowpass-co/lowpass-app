'use client';

/* ============================================
   LOWPASS — <PersonnelGrid> (Sprint 10 §2.1)

   Bug-Reports-style div grid replacing the prior DataTable
   mount on /personnel. Per row:

     [avatar w/ status dot]   Name                 [GROUP] [GROUP]   email          phone     [ring] [⋯]
                              Role/job-title

   - Avatar: 36px circle, image or initials. Small green/grey
     status dot bottom-right indicates recent activity (green
     when updatedAt is within the last 7 days).
   - Name: text-sm semibold, toTitleCase. Role on the line below
     in text-xs lp-text-tertiary.
   - Group badges (ADMIN / ARTIST / BAND / CREW / MGMT / TM /
     PROD): rounded chips, tone-coded.
   - Email: text-xs lp-text-tertiary, truncated.
   - Phone: text-xs lp-text-secondary.
   - Profile ring: existing <CompletenessRing>.
   - Action menu: existing <ContextMenu> kebab.

   Drops Tours (Sprint 9 §13.A.10 column) per spec — phone is
   more useful at-a-glance. Tours count still exposed on the
   detail slide-over.

   Selection / row-click / sort-by-status work the same way as
   the DataTable mount: parent owns selectedIds, passes
   onRowClick + onSelectionChange.
   ============================================ */

import { AlertTriangle } from 'lucide-react';
import { CompletenessRing } from './CompletenessRing';
import { ContextMenu, type ContextMenuItem } from '@/components/ui/ContextMenu';
import { toTitleCase } from '@/lib/text/toTitleCase';

export type PersonnelGroupKey =
  | 'admin'
  | 'artist'
  | 'band'
  | 'crew'
  | 'mgmt'
  | 'tour_manager'
  | 'production';

export interface PersonnelGridRow {
  id: string;
  fullName: string;
  preferredName: string | null;
  email: string | null;
  phone: string | null;
  /** Free-form workspace title (e.g. "Sound Engineer"). Shown
   *  on the second line under the display name. */
  jobTitle: string | null;
  /** Image URL when the head shot has been uploaded; null else. */
  avatarUrl: string | null;
  /** Group keys (extended_profile.groups[]). Renders as chips. */
  groups: PersonnelGroupKey[];
  hasIssue: boolean;
  issueLabels: string[];
  updatedAt: string;
  completenessPercent: number;
  completenessMissingLabels: string[];
  completenessFirstMissingId: string | null;
}

interface PersonnelGridProps {
  rows: PersonnelGridRow[];
  selectedIds: string[];
  onSelectionChange: (ids: string[]) => void;
  onRowClick: (row: PersonnelGridRow) => void;
  onRingClick: (row: PersonnelGridRow) => void;
  rowMenuItems: (row: PersonnelGridRow) => ContextMenuItem[];
  emptyState: string;
}

const GROUP_META: Record<PersonnelGroupKey, { label: string; fg: string; bg: string; border: string }> = {
  admin:        { label: 'ADMIN',  fg: '#b85a00', bg: '#FF45001a', border: '#FF450055' },
  artist:       { label: 'ARTIST', fg: '#7c3aed', bg: '#7c3aed1a', border: '#7c3aed55' },
  band:         { label: 'BAND',   fg: '#1d4ed8', bg: '#1d4ed81a', border: '#1d4ed855' },
  crew:         { label: 'CREW',   fg: '#a16207', bg: '#a162071a', border: '#a1620755' },
  mgmt:         { label: 'MGMT',   fg: '#1f8a4c', bg: '#1f8a4c1a', border: '#1f8a4c55' },
  tour_manager: { label: 'TM',     fg: '#0d9488', bg: '#0d94881a', border: '#0d948855' },
  production:   { label: 'PROD',   fg: '#be185d', bg: '#be185d1a', border: '#be185d55' },
};

const RECENT_ACTIVITY_MS = 7 * 86400000;
const GRID_COLUMNS = '36px 56px minmax(0, 1.4fr) auto minmax(0, 1.6fr) minmax(0, 0.9fr) 80px 36px';

function getInitials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

function isRecentlyActive(updatedAt: string): boolean {
  const t = new Date(updatedAt).getTime();
  return Number.isFinite(t) && Date.now() - t < RECENT_ACTIVITY_MS;
}

function GroupBadge({ group }: { group: PersonnelGroupKey }) {
  const meta = GROUP_META[group];
  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        padding: '1px 6px',
        fontSize: '10px',
        fontWeight: 700,
        letterSpacing: '0.04em',
        color: meta.fg,
        background: meta.bg,
        border: `1px solid ${meta.border}`,
        borderRadius: 999,
        flexShrink: 0,
      }}
    >
      {meta.label}
    </span>
  );
}

function Avatar({ name, imageUrl, recentlyActive }: { name: string; imageUrl: string | null; recentlyActive: boolean }) {
  return (
    <span
      style={{
        position: 'relative',
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        width: 36,
        height: 36,
        borderRadius: 999,
        overflow: 'visible',
        background: 'var(--lp-bg-tertiary)',
        border: '1px solid var(--lp-border)',
        flexShrink: 0,
      }}
    >
      {imageUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={imageUrl}
          alt=""
          style={{
            width: '100%',
            height: '100%',
            borderRadius: 999,
            objectFit: 'cover',
          }}
        />
      ) : (
        <span
          aria-hidden
          style={{
            fontSize: '12px',
            fontWeight: 600,
            color: 'var(--lp-text-secondary)',
            letterSpacing: 0,
          }}
        >
          {getInitials(name)}
        </span>
      )}
      {/* Status dot — bottom-right. Green when recently active,
          grey otherwise. The white border separates it from the
          avatar. */}
      <span
        aria-hidden
        style={{
          position: 'absolute',
          bottom: -1,
          right: -1,
          width: 10,
          height: 10,
          borderRadius: 999,
          background: recentlyActive ? '#1f8a4c' : 'var(--lp-text-tertiary)',
          border: '2px solid var(--lp-bg)',
        }}
      />
    </span>
  );
}

export function PersonnelGrid({
  rows,
  selectedIds,
  onSelectionChange,
  onRowClick,
  onRingClick,
  rowMenuItems,
  emptyState,
}: PersonnelGridProps) {
  const selectedSet = new Set(selectedIds);
  const allSelected = rows.length > 0 && rows.every((r) => selectedSet.has(r.id));
  const someSelected = !allSelected && rows.some((r) => selectedSet.has(r.id));

  const toggleAll = () => {
    if (allSelected) {
      onSelectionChange([]);
    } else {
      onSelectionChange(rows.map((r) => r.id));
    }
  };
  const toggleRow = (id: string) => {
    const next = new Set(selectedSet);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    onSelectionChange(Array.from(next));
  };

  if (rows.length === 0) {
    return (
      <div
        role="status"
        style={{
          padding: 'var(--lp-space-6) var(--lp-space-4)',
          textAlign: 'center',
          fontSize: 'var(--lp-text-sm)',
          color: 'var(--lp-text-tertiary)',
          background: 'var(--lp-panel)',
          border: '1px solid var(--lp-border)',
          borderRadius: 'var(--lp-radius-md)',
        }}
      >
        {emptyState}
      </div>
    );
  }

  return (
    <div
      role="grid"
      aria-rowcount={rows.length + 1}
      style={{
        display: 'flex',
        flexDirection: 'column',
        background: 'var(--lp-bg)',
        border: '1px solid var(--lp-border)',
        borderRadius: 'var(--lp-radius-md)',
        overflow: 'hidden',
      }}
    >
      {/* Sticky header row */}
      <div
        role="row"
        style={{
          position: 'sticky',
          top: 0,
          zIndex: 1,
          display: 'grid',
          alignItems: 'center',
          gridTemplateColumns: GRID_COLUMNS,
          gap: 'var(--lp-space-3)',
          padding: '0 var(--lp-space-4)',
          height: 36,
          fontSize: 'var(--lp-text-2xs)',
          fontWeight: 'var(--lp-weight-semibold)',
          textTransform: 'uppercase',
          letterSpacing: '0.06em',
          color: 'var(--lp-text-tertiary)',
          background: 'var(--lp-panel)',
          borderBottom: '1px solid var(--lp-border-strong)',
        }}
      >
        <div role="columnheader" onClick={(e) => e.stopPropagation()}>
          <input
            type="checkbox"
            aria-label="Select all"
            checked={allSelected}
            ref={(el) => {
              if (el) el.indeterminate = someSelected;
            }}
            onChange={toggleAll}
            style={{ accentColor: 'var(--color-lp-orange)', cursor: 'pointer' }}
          />
        </div>
        <div role="columnheader" />
        <div role="columnheader">Name</div>
        <div role="columnheader">Groups</div>
        <div role="columnheader">Email</div>
        <div role="columnheader">Phone</div>
        <div role="columnheader">Profile</div>
        <div role="columnheader" />
      </div>

      {rows.map((r) => {
        const selected = selectedSet.has(r.id);
        const displayName = toTitleCase(r.preferredName ?? r.fullName);
        const recentlyActive = isRecentlyActive(r.updatedAt);
        return (
          <div
            key={r.id}
            role="row"
            tabIndex={0}
            onClick={() => onRowClick(r)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                onRowClick(r);
              }
            }}
            className="lp-personnel-grid-row"
            style={{
              display: 'grid',
              alignItems: 'center',
              gridTemplateColumns: GRID_COLUMNS,
              gap: 'var(--lp-space-3)',
              padding: 'var(--lp-space-3) var(--lp-space-4)',
              cursor: 'pointer',
              borderBottom: '1px solid var(--lp-border-light, var(--lp-border))',
              background: selected
                ? 'color-mix(in srgb, var(--color-lp-orange) 8%, transparent)'
                : undefined,
              transition: 'background 120ms ease-out',
            }}
            onMouseEnter={(e) => {
              if (!selected) {
                e.currentTarget.style.background = 'var(--lp-surface-hover)';
              }
            }}
            onMouseLeave={(e) => {
              if (!selected) {
                e.currentTarget.style.background = '';
              }
            }}
          >
            <div onClick={(e) => e.stopPropagation()}>
              <input
                type="checkbox"
                aria-label={`Select ${displayName}`}
                checked={selected}
                onChange={() => toggleRow(r.id)}
                style={{ accentColor: 'var(--color-lp-orange)', cursor: 'pointer' }}
              />
            </div>
            <Avatar
              name={displayName}
              imageUrl={r.avatarUrl}
              recentlyActive={recentlyActive}
            />
            <div className="min-w-0">
              <div
                className="truncate"
                style={{
                  fontSize: 'var(--lp-text-sm)',
                  fontWeight: 'var(--lp-weight-semibold)',
                  color: 'var(--lp-text)',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 6,
                }}
              >
                {r.hasIssue ? (
                  <AlertTriangle
                    size={12}
                    strokeWidth={2.4}
                    aria-label="Action required"
                    style={{ color: 'var(--color-lp-orange)', flexShrink: 0 }}
                  />
                ) : null}
                <span className="truncate">{displayName}</span>
              </div>
              <div
                className="truncate"
                style={{
                  marginTop: 1,
                  fontSize: 'var(--lp-text-xs)',
                  color: 'var(--lp-text-tertiary)',
                }}
              >
                {r.jobTitle?.trim() || '—'}
              </div>
            </div>
            <div
              className="flex flex-wrap"
              style={{ gap: 4 }}
              onClick={(e) => e.stopPropagation()}
            >
              {r.groups.length === 0 ? (
                <span style={{ fontSize: 'var(--lp-text-xs)', color: 'var(--lp-text-tertiary)' }}>—</span>
              ) : (
                r.groups.map((g) => <GroupBadge key={g} group={g} />)
              )}
            </div>
            <div
              className="truncate"
              style={{
                fontSize: 'var(--lp-text-xs)',
                color: 'var(--lp-text-tertiary)',
              }}
            >
              {r.email || '—'}
            </div>
            <div
              className="truncate"
              style={{
                fontSize: 'var(--lp-text-xs)',
                color: 'var(--lp-text-secondary)',
              }}
            >
              {r.phone || '—'}
            </div>
            <div onClick={(e) => e.stopPropagation()}>
              <CompletenessRing
                percent={r.completenessPercent}
                missingLabels={r.completenessMissingLabels}
                onClick={() => onRingClick(r)}
              />
            </div>
            <div onClick={(e) => e.stopPropagation()} className="flex justify-end">
              <ContextMenu align="right" items={rowMenuItems(r)} />
            </div>
          </div>
        );
      })}
    </div>
  );
}
