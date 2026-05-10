'use client';

/* ============================================
   LOWPASS — <GroupsEditor> (Sprint 10 §2.2)

   Multi-select chip editor for personnel groups (admin /
   artist / band / crew / mgmt / tour_manager / production).
   Mounted inside the PersonnelDetailSlideOver as its own
   "Groups" section. Saves into
   personnel.extended_profile.groups.

   Active chip = orange filled. Inactive = neutral outline.
   Click toggles membership. Cap of "no chip" empty state
   matches the in-grid empty state ("—").
   ============================================ */

import type { PersonnelGroupKey } from './PersonnelGrid';

const GROUP_DEFS: ReadonlyArray<{ key: PersonnelGroupKey; label: string }> = [
  { key: 'admin', label: 'Admin' },
  { key: 'artist', label: 'Artist' },
  { key: 'band', label: 'Band' },
  { key: 'crew', label: 'Crew' },
  { key: 'mgmt', label: 'Mgmt' },
  { key: 'tour_manager', label: 'Tour Manager' },
  { key: 'production', label: 'Production' },
];

interface GroupsEditorProps {
  value: string[];
  onChange: (next: string[]) => void;
}

export function GroupsEditor({ value, onChange }: GroupsEditorProps) {
  const set = new Set(value);
  const toggle = (key: PersonnelGroupKey) => {
    const next = new Set(set);
    if (next.has(key)) next.delete(key);
    else next.add(key);
    onChange(Array.from(next));
  };
  return (
    <div className="flex flex-wrap" style={{ gap: 6 }}>
      {GROUP_DEFS.map((g) => {
        const active = set.has(g.key);
        return (
          <button
            key={g.key}
            type="button"
            onClick={() => toggle(g.key)}
            aria-pressed={active}
            className="btn-transition"
            style={{
              padding: '4px 10px',
              fontSize: 'var(--lp-text-xs)',
              fontWeight: active
                ? 'var(--lp-weight-semibold)'
                : 'var(--lp-weight-medium)',
              color: active ? 'var(--lp-text-inverse)' : 'var(--lp-text)',
              background: active ? 'var(--color-lp-orange)' : 'var(--lp-surface)',
              border: `1px solid ${active ? 'transparent' : 'var(--lp-border-strong)'}`,
              borderRadius: 999,
              cursor: 'pointer',
            }}
          >
            {g.label}
          </button>
        );
      })}
    </div>
  );
}
