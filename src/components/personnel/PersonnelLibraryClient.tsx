'use client';

/* ============================================
   LOWPASS — PersonnelLibraryClient (Sprint 9 §9 + Phase 13.A)

   Modern workspace Personnel surface. Replaces the simpler
   <PersonLibraryClient> wrapper for /personnel/page.tsx.

   Surface composition:
     - Header strip: count + active issues + passport-expiring
       count.
     - 3-action row: [+ Add new] / [Import] / [Assign to tour] (the ticked person).
     - Filter chips (Phase 13.A.10): All / Conflicts / Issues /
       Recently updated / Untouched. Each chip carries a count
       computed from `initial`. Filter applied client-side over
       the full `initial` set so it composes with DataTable's
       search.
     - <DataTable> with row-selection enabled (Phase 13.A.12);
       the `selectionActions` slot renders a "Delete N selected"
       button that POSTs to /api/personnel/bulk-delete.

   Click-through routing:
     - Row click → opens <PersonnelDetailSlideOver> in `edit`
       mode (the rich Daysheets-style slide-over, with the Files
       section). Phase 13.A.6 fix: the previous version routed
       through entityRouting → PersonSlideOver, which (a) lacked
       the Files section, and (b) emitted "Person not found" for
       newly-created rows because the persons-table sibling row
       hadn't been written yet.
     - "+ Add new" → opens the same slide-over in `create` mode;
       the slide-over owns its own POST /api/personnel call so
       there's no placeholder row to clean up.

   Issue indicators (⚠ prefix on the Name cell):
     - any passport (extended_profile.passports[i].expiry_date
       OR legacy passport_info.expiry) within 180 days.
     - extended_profile.visa.expiry < today.
   ============================================ */

import { useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Plus, Search, Trash2, Upload, UserCog, UserPlus } from 'lucide-react';
import { useToast } from '@/components/ui/Toast';
import { PersonnelImportModal } from './PersonnelImportModal';
import {
  PersonnelDensityProvider,
  PersonnelDensityToggle,
} from './PersonnelDensityContext';
import { AssignToTourSlideOver } from './AssignToTourSlideOver';
import {
  PersonnelDetailSlideOver,
  type PersonnelPanelState,
} from './PersonnelDetailSlideOver';
import { FilterChips, type FilterChipOption } from '@/components/ui/FilterChips';
import { DeleteConfirmationModal } from '@/components/ui/DeleteConfirmationModal';
import { PersonnelGrid } from './PersonnelGrid';
import { toTitleCase } from '@/lib/text/toTitleCase';
import { searchPeople } from '@/lib/personnel/search';

export interface PersonnelLibraryRow {
  id: string;
  workspaceId: string;
  fullName: string;
  preferredName: string | null;
  email: string | null;
  phone: string | null;
  pronouns: string | null;
  /** Sprint 10 §2.1 — job title (e.g. "Sound Engineer") shown
   *  on the second line under the display name in the new
   *  PersonnelGrid. Lifted from personnel.role. */
  jobTitle: string | null;
  /** Sprint 10 §2.1 — head shot URL for the row avatar. Null
   *  when no head shot uploaded — avatar falls back to
   *  initials chip. */
  avatarUrl: string | null;
  /** Sprint 10 §2.2 — group keys from extended_profile.groups.
   *  Drives the colored badges on each row + the new "by
   *  group" filter chips. */
  groups: import('./PersonnelGrid').PersonnelGroupKey[];
  /** Combined "issue" flag derived server-side. */
  hasIssue: boolean;
  issueLabels: string[];
  lastTouredAt: string | null;
  totalTours: number;
  updatedAt: string;
  /** Sprint 9 §13.B.2 — profile completeness scored server-side
   *  per viewer role (Q5 re-normalisation already applied). */
  completenessPercent: number;
  completenessMissingLabels: string[];
  /** Stable section id of the FIRST missing section, used to
   *  scroll the slide-over to that section on ring click. Null
   *  when the row is at 100%. */
  completenessFirstMissingId: string | null;
}

interface PersonnelLibraryClientProps {
  initial: PersonnelLibraryRow[];
  /** Sprint 9 §13.B.2 (Q5) — admin / manager viewers see the
   *  Pay section in the detail slide-over and the Pay weight in
   *  the completeness ring. Non-admin viewers re-normalise
   *  without it. Page server-fetches the role and threads it
   *  down. */
  viewerCanSeePay?: boolean;
}

type FilterKey =
  | 'all'
  | 'conflicts'
  | 'issues'
  | 'recent'
  | 'untouched'
  /* Sprint 10 §2.1 — by-group filter keys. Match a value in
     personnel.extended_profile.groups[]. */
  | 'group:admin'
  | 'group:artist'
  | 'group:band'
  | 'group:crew'
  | 'group:mgmt'
  | 'group:tour_manager'
  | 'group:production';

const FILTER_LABELS: Record<FilterKey, string> = {
  all: 'All',
  conflicts: 'Conflicts',
  issues: 'Issues',
  recent: 'Recently updated',
  untouched: 'Untouched',
  'group:admin': 'Admin',
  'group:artist': 'Artist',
  'group:band': 'Band',
  'group:crew': 'Crew',
  'group:mgmt': 'Mgmt',
  'group:tour_manager': 'TM',
  'group:production': 'Prod',
};

const FILTER_KEYS: ReadonlyArray<FilterKey> = [
  'all',
  'conflicts',
  'issues',
  'recent',
  'untouched',
  'group:admin',
  'group:artist',
  'group:band',
  'group:crew',
  'group:mgmt',
  'group:tour_manager',
  'group:production',
];

function groupKeyFromFilter(filter: FilterKey): string | null {
  return filter.startsWith('group:') ? filter.slice('group:'.length) : null;
}

/* Sprint 10 §2.1 — formatDate + relativeTime helpers retired
   alongside the DataTable mount. PersonnelGrid renders avatar +
   two-line name + groups + email + phone + ring; no date
   columns remain. updated_at is still read by the recent /
   untouched filter chips above. */

export function PersonnelLibraryClient(props: PersonnelLibraryClientProps) {
  /* §B5 — wrap in PersonnelDensityProvider so the toggle +
     the PersonnelGrid + any sub-table cells share one
     preference. data-lp-density on the wrapper cascades to
     descendant <td>s via globals.css. */
  return (
    <PersonnelDensityProvider>
      <PersonnelLibraryClientBody {...props} />
    </PersonnelDensityProvider>
  );
}

function PersonnelLibraryClientBody({
  initial,
  viewerCanSeePay = false,
}: PersonnelLibraryClientProps) {
  const router = useRouter();
  const { showToast } = useToast();
  const [importOpen, setImportOpen] = useState(false);
  const [assignOpen, setAssignOpen] = useState<{
    personId: string;
    personName: string;
  } | null>(null);
  const [panel, setPanel] = useState<PersonnelPanelState>(null);
  const [filter, setFilter] = useState<FilterKey>('all');
  /* Nov 2026 — search box. Composes with the chips: the chip picks the set,
     the words narrow it (see searchPeople for what matches). */
  const [query, setQuery] = useState('');
  const searchRef = useRef<HTMLInputElement>(null);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  // "/" jumps to the search box from anywhere on the page (not while typing).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (e.key !== '/' || e.metaKey || e.ctrlKey || e.altKey) return;
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' || t.isContentEditable)) return;
      e.preventDefault();
      searchRef.current?.focus();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);
  /* A search hides rows; a selection that included them would let "Delete N
     selected" remove people you can't see. Typing clears the selection. */
  const onQueryChange = (q: string) => {
    setQuery(q);
    if (selectedIds.length) setSelectedIds([]);
  };
  const [deleting, setDeleting] = useState(false);
  /* Sprint 9 §14.4 — replaced the prior window.confirm with the
     repo's <DeleteConfirmationModal> primitive (type-DELETE-to-
     confirm + shake animation). Tracks a single pending deletion
     target as either a per-row id or a "bulk" sentinel so the
     same modal serves both flows. */
  const [pendingDelete, setPendingDelete] = useState<
    | null
    | { kind: 'one'; id: string; displayName: string }
    | { kind: 'bulk'; ids: string[] }
  >(null);

  const requestDeleteOne = (id: string, displayName: string) =>
    setPendingDelete({ kind: 'one', id, displayName });

  const performDeleteOne = async (id: string, displayName: string) => {
    const res = await fetch('/api/personnel/bulk-delete', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ids: [id] }),
    });
    const body = (await res.json().catch(() => null)) as { error?: string } | null;
    if (!res.ok) {
      throw new Error(body?.error ?? 'Could not delete personnel.');
    }
    showToast(`${displayName} deleted.`);
    router.refresh();
  };

  // Spec 13.A.10 thresholds (CC_SPRINT_09_PHASE_13.md §13.A.10):
  //   - Recently updated = updated_at within the last 7 days
  //   - Untouched        = updated_at older than 90 days
  // Both compare against `updatedAt` (the personnel row's
  // `updated_at` timestamp surfaced by /personnel/page.tsx).
  const recentlyUpdatedCutoff = Date.now() - 7 * 86400000;
  const untouchedCutoff = Date.now() - 90 * 86400000;

  /* Sprint 9 §14.4 — bulk delete now also goes through
     <DeleteConfirmationModal>. The modal owns the deleting +
     error state via its onConfirm contract. The component-level
     `deleting` flag stays for disabling the trigger button. */
  const requestBulkDelete = () => {
    if (deleting || selectedIds.length === 0) return;
    setPendingDelete({ kind: 'bulk', ids: [...selectedIds] });
  };

  const performBulkDelete = async (ids: string[]) => {
    setDeleting(true);
    try {
      const res = await fetch('/api/personnel/bulk-delete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids }),
      });
      const body = (await res.json().catch(() => null)) as
        | { deleted?: number; error?: string }
        | null;
      if (!res.ok) {
        throw new Error(body?.error ?? 'Could not delete personnel.');
      }
      const deleted = typeof body?.deleted === 'number' ? body.deleted : ids.length;
      showToast(`${deleted} ${deleted === 1 ? 'person' : 'people'} deleted.`);
      setSelectedIds([]);
      router.refresh();
    } finally {
      setDeleting(false);
    }
  };

  const chipRows = useMemo(() => {
    if (filter === 'all') return initial;
    const groupKey = groupKeyFromFilter(filter);
    if (groupKey) {
      return initial.filter((r) => r.groups.includes(groupKey as never));
    }
    return initial.filter((r) => {
      switch (filter) {
        case 'conflicts':
          return r.issueLabels.some((l) => l.toLowerCase().includes('conflict'));
        case 'issues':
          return r.hasIssue;
        case 'recent': {
          const t = new Date(r.updatedAt).getTime();
          return Number.isFinite(t) && t >= recentlyUpdatedCutoff;
        }
        case 'untouched': {
          const t = new Date(r.updatedAt).getTime();
          return Number.isFinite(t) && t < untouchedCutoff;
        }
        default:
          return true;
      }
    });
  }, [filter, initial, recentlyUpdatedCutoff, untouchedCutoff]);
  const filteredRows = useMemo(() => searchPeople(chipRows, query), [chipRows, query]);

  const filterCounts = useMemo(() => {
    let conflicts = 0;
    let issues = 0;
    let recent = 0;
    let untouched = 0;
    const groupCounts: Record<string, number> = {};
    for (const r of initial) {
      if (r.issueLabels.some((l) => l.toLowerCase().includes('conflict'))) conflicts++;
      if (r.hasIssue) issues++;
      const t = new Date(r.updatedAt).getTime();
      if (Number.isFinite(t)) {
        if (t >= recentlyUpdatedCutoff) recent++;
        if (t < untouchedCutoff) untouched++;
      }
      for (const g of r.groups) {
        groupCounts[g] = (groupCounts[g] ?? 0) + 1;
      }
    }
    return {
      all: initial.length,
      conflicts,
      issues,
      recent,
      untouched,
      group: groupCounts,
    };
  }, [initial, recentlyUpdatedCutoff, untouchedCutoff]);

  const totals = useMemo(() => {
    let issues = 0;
    let passport = 0;
    for (const r of initial) {
      if (r.hasIssue) issues++;
      // The issueLabels array carries the granular reason; count
      // any starting with "Passport" as passport-expiring.
      if (r.issueLabels.some((l) => l.startsWith('Passport'))) passport++;
    }
    return { issues, passport };
  }, [initial]);


  // Open the rich PersonnelDetailSlideOver directly in `create`
  // mode. The slide-over owns the POST /api/personnel call in its
  // own save flow, so we don't pre-create a placeholder row here
  // (which previously caused a "Person not found" toast when the
  // entity-routing layer tried to look up the new id in the
  // persons table before the sibling upsert had landed).
  const handleAddNew = () => setPanel({ mode: 'create' });

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--lp-space-4)' }}>
      {/* Header strip */}
      <div
        className="flex flex-wrap items-center justify-between"
        style={{ gap: 'var(--lp-space-3)' }}
      >
        <div
          style={{
            fontSize: 'var(--lp-text-sm)',
            color: 'var(--lp-text-secondary)',
          }}
        >
          {query.trim() ? `${filteredRows.length} of ` : ''}
          {initial.length} {initial.length === 1 ? 'person' : 'people'}
          {totals.issues > 0
            ? ` · ${totals.issues} active issue${totals.issues === 1 ? '' : 's'}`
            : ''}
          {totals.passport > 0
            ? ` · ${totals.passport} passport${totals.passport === 1 ? '' : 's'} expiring soon`
            : ''}
        </div>
        <div className="flex items-center" style={{ gap: 'var(--lp-space-2)' }}>
          {/* §B5 — density toggle inline in the header
              action row. Matches Budget + Equipment top-right
              placement. */}
          <PersonnelDensityToggle />
          <button
            type="button"
            onClick={handleAddNew}
            className="btn-transition btn-primary-press inline-flex items-center"
            style={{
              gap: 4,
              padding: 'var(--lp-space-2) var(--lp-space-3)',
              fontSize: 'var(--lp-text-sm)',
              fontWeight: 'var(--lp-weight-semibold)',
              color: 'var(--lp-text-inverse)',
              background: 'var(--color-lp-orange)',
              border: '1px solid transparent',
              borderRadius: 'var(--lp-radius-md)',
              cursor: 'pointer',
            }}
          >
            <Plus size={14} strokeWidth={2.4} />
            Add new
          </button>
          <button
            type="button"
            onClick={() => setImportOpen(true)}
            className="btn-transition inline-flex items-center"
            style={{
              gap: 4,
              padding: 'var(--lp-space-2) var(--lp-space-3)',
              fontSize: 'var(--lp-text-sm)',
              fontWeight: 'var(--lp-weight-medium)',
              color: 'var(--lp-text)',
              background: 'transparent',
              border: '1px solid var(--lp-border-strong)',
              borderRadius: 'var(--lp-radius-md)',
              cursor: 'pointer',
            }}
          >
            <Upload size={14} strokeWidth={2} />
            Import
          </button>
          {/* Assign to tour (Nov 2026): works on the ticked person. It used
              to be a placeholder that only showed a toast. Tick exactly one
              person (or use a row's ⋯ menu); with none or several ticked it
              is disabled and its tooltip says why. */}
          {(() => {
            const one = selectedIds.length === 1 ? initial.find((r) => r.id === selectedIds[0]) : undefined;
            const why =
              selectedIds.length === 0
                ? 'Tick a person in the list (or use a row’s ⋯ menu)'
                : selectedIds.length > 1
                  ? 'One person at a time — tick just one'
                  : `Assign ${one ? toTitleCase(one.preferredName ?? one.fullName) : 'this person'} to a tour`;
            return (
          <button
            type="button"
            disabled={!one}
            onClick={() => {
              if (one) setAssignOpen({ personId: one.id, personName: toTitleCase(one.preferredName ?? one.fullName) });
            }}
            className="btn-transition inline-flex items-center"
            style={{
              gap: 4,
              padding: 'var(--lp-space-2) var(--lp-space-3)',
              fontSize: 'var(--lp-text-sm)',
              fontWeight: 'var(--lp-weight-medium)',
              color: 'var(--lp-text-secondary)',
              background: 'transparent',
              border: '1px solid var(--lp-border-strong)',
              borderRadius: 'var(--lp-radius-md)',
              cursor: one ? 'pointer' : 'not-allowed',
              opacity: one ? 1 : 0.55,
            }}
            title={why}
            aria-label={why}
          >
            <UserPlus size={14} strokeWidth={2} />
            Assign to tour
          </button>
            );
          })()}
        </div>
      </div>

      {/* Filter chips. Filter is client-side over `initial` so
          it composes cleanly with DataTable's search. The
          <FilterChips> primitive is shared with any future chip
          row; visual style matches the existing FilterSelect
          dropdowns so chip + select read as one filter row. */}
      <div
        // The ring sits on the box, not the bare input inside it.
        className="flex min-w-0 items-center border border-[var(--lp-border)] focus-within:border-[var(--lp-orange)]"
        style={{
          gap: 'var(--lp-space-2)',
          width: 'min(100%, 360px)',
          padding: '0 var(--lp-space-3)',
          background: 'var(--lp-bg-secondary)',
          borderRadius: 'var(--lp-radius-md)',
        }}
      >
        <Search size={14} aria-hidden style={{ flexShrink: 0, color: 'var(--lp-text-tertiary)' }} />
        <input
          ref={searchRef}
          type="search"
          value={query}
          onChange={(e) => onQueryChange(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Escape') {
              onQueryChange('');
              e.currentTarget.blur();
            }
          }}
          placeholder="Search name, role, email, phone…"
          aria-label="Search people"
          className="min-w-0 flex-1 bg-transparent outline-none"
          style={{ padding: 'var(--lp-space-2) 0', fontSize: 'var(--lp-text-sm)', color: 'var(--lp-text)', outline: 'none' }}
        />
        <kbd
          aria-hidden
          style={{
            fontSize: 'var(--lp-text-2xs)',
            color: 'var(--lp-text-tertiary)',
            border: '1px solid var(--lp-border)',
            borderRadius: 'var(--lp-radius-sm)',
            padding: '0 var(--lp-space-1)',
          }}
        >
          /
        </kbd>
      </div>

      <FilterChips<FilterKey>
        ariaLabel="Personnel filters"
        value={filter}
        onChange={setFilter}
        options={FILTER_KEYS.map<FilterChipOption<FilterKey>>((key) => ({
          value: key,
          label: FILTER_LABELS[key],
          count: (() => {
            const g = groupKeyFromFilter(key);
            if (g) return filterCounts.group[g] ?? 0;
            const slot = filterCounts[key as keyof typeof filterCounts];
            return typeof slot === 'number' ? slot : 0;
          })(),
        }))}
      />

      {/* Sprint 10 §2.1 — bulk action row replaces DataTable's
          built-in selectionActions slot. */}
      {selectedIds.length > 0 ? (
        <div
          className="flex items-center justify-between"
          style={{
            gap: 'var(--lp-space-3)',
            padding: 'var(--lp-space-2) var(--lp-space-3)',
            background: 'color-mix(in srgb, var(--color-lp-orange) 6%, transparent)',
            border: '1px solid color-mix(in srgb, var(--color-lp-orange) 30%, transparent)',
            borderRadius: 'var(--lp-radius-md)',
          }}
        >
          <span style={{ fontSize: 'var(--lp-text-sm)', color: 'var(--lp-text)' }}>
            {selectedIds.length} selected
          </span>
          <button
            type="button"
            onClick={requestBulkDelete}
            disabled={deleting}
            className="btn-transition inline-flex items-center"
            style={{
              gap: 6,
              padding: 'var(--lp-space-2) var(--lp-space-3)',
              fontSize: 'var(--lp-text-sm)',
              fontWeight: 'var(--lp-weight-semibold)',
              color: 'var(--lp-text-inverse)',
              background: 'var(--color-lp-error)',
              border: '1px solid transparent',
              borderRadius: 'var(--lp-radius-md)',
              cursor: deleting ? 'not-allowed' : 'pointer',
              opacity: deleting ? 0.7 : 1,
            }}
          >
            <Trash2 size={14} strokeWidth={2.4} />
            Delete {selectedIds.length} selected
          </button>
        </div>
      ) : null}

      {/* Sprint 10 §2.1 — Bug-Reports-style div grid replaces
          the prior <DataTable> mount. Avatar + status dot,
          two-line name+role, group badges, email, phone,
          completeness ring, kebab. */}
      <PersonnelGrid
        rows={filteredRows.map((r) => ({
          id: r.id,
          fullName: r.fullName,
          preferredName: r.preferredName,
          email: r.email,
          phone: r.phone,
          jobTitle: r.jobTitle,
          avatarUrl: r.avatarUrl,
          groups: r.groups,
          hasIssue: r.hasIssue,
          issueLabels: r.issueLabels,
          updatedAt: r.updatedAt,
          completenessPercent: r.completenessPercent,
          completenessMissingLabels: r.completenessMissingLabels,
          completenessFirstMissingId: r.completenessFirstMissingId,
        }))}
        selectedIds={selectedIds}
        onSelectionChange={setSelectedIds}
        onRowClick={(row) => setPanel({ mode: 'edit', id: row.id })}
        onRingClick={(row) =>
          setPanel({
            mode: 'edit',
            id: row.id,
            scrollToSection: row.completenessFirstMissingId,
          })
        }
        rowMenuItems={(row) => {
          const displayName = toTitleCase(row.preferredName ?? row.fullName);
          return [
            {
              label: 'Open profile',
              icon: UserCog,
              onClick: () => setPanel({ mode: 'edit', id: row.id }),
            },
            {
              label: 'Assign to tour',
              icon: UserPlus,
              onClick: () =>
                setAssignOpen({ personId: row.id, personName: displayName }),
            },
            {
              label: 'Delete',
              icon: Trash2,
              variant: 'danger',
              onClick: () => requestDeleteOne(row.id, displayName),
            },
          ];
        }}
        emptyState={
          initial.length === 0
            ? 'No people in this workspace yet — click + Add new or Import to get started.'
            : query.trim()
            ? `No one matches “${query.trim()}”${filter !== 'all' ? ` in ${FILTER_LABELS[filter]}` : ''}.`
            : filter !== 'all' && filteredRows.length === 0
            ? `No people match the "${FILTER_LABELS[filter]}" filter.`
            : 'No people match your search.'
        }
      />

      {/* Modals */}
      <PersonnelImportModal
        open={importOpen}
        onClose={() => setImportOpen(false)}
        onImported={() => {
          showToast('Personnel imported.');
          setImportOpen(false);
          router.refresh();
        }}
      />

      {assignOpen ? (
        <AssignToTourSlideOver
          open
          personId={assignOpen.personId}
          personName={assignOpen.personName}
          onClose={() => setAssignOpen(null)}
        />
      ) : null}

      {/* Rich detail slide-over (Daysheets-style with Files
          section). Owns its own POST/PATCH against /api/personnel
          so we don't need a placeholder row in the table. */}
      <PersonnelDetailSlideOver
        panel={panel}
        viewerCanSeePay={viewerCanSeePay}
        onClose={() => setPanel(null)}
        onSaved={(_row, meta) => {
          // Sprint 9 §14.5 — skip router.refresh() on
          // document uploads. The slide-over already
          // applied the new file metadata to its local
          // `ext.documents` state, so the file appears
          // inline immediately. Refreshing here was
          // causing the slide-over to flicker / appear
          // to close while the page rerendered. Form
          // saves still refresh so the grid picks up
          // name / role / completeness changes.
          if (meta?.source === 'document') return;
          router.refresh();
        }}
      />

      {/* Sprint 9 §14.4 — type-DELETE-to-confirm modal serves
          both the row kebab and the bulk-delete button. The
          modal owns the deleting + error state during its
          onConfirm; we surface either the per-row name or a
          "N people" count as the itemName. */}
      <DeleteConfirmationModal
        open={pendingDelete !== null}
        itemName={
          pendingDelete?.kind === 'one'
            ? pendingDelete.displayName
            : pendingDelete?.kind === 'bulk'
              ? `${pendingDelete.ids.length} ${pendingDelete.ids.length === 1 ? 'person' : 'people'}`
              : ''
        }
        description={
          pendingDelete?.kind === 'bulk'
            ? `${pendingDelete.ids.length} workspace personnel ${pendingDelete.ids.length === 1 ? 'row' : 'rows'} will be removed from this workspace.`
            : 'Removes the workspace personnel row. Tour assignments referencing this person will retain their snapshot data.'
        }
        onClose={() => setPendingDelete(null)}
        onConfirm={async () => {
          if (!pendingDelete) return;
          if (pendingDelete.kind === 'one') {
            await performDeleteOne(pendingDelete.id, pendingDelete.displayName);
          } else {
            await performBulkDelete(pendingDelete.ids);
          }
        }}
      />
    </div>
  );
}
