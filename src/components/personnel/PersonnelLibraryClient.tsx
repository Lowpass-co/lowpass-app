'use client';

/* ============================================
   LOWPASS — PersonnelLibraryClient (Sprint 9 §9 + Phase 13.A)

   Modern workspace Personnel surface. Replaces the simpler
   <PersonLibraryClient> wrapper for /personnel/page.tsx.

   Surface composition:
     - Header strip: count + active issues + passport-expiring
       count.
     - 3-action row: [+ Add new] / [Import] / [Assign to tour].
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

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { AlertTriangle, Plus, Trash2, Upload, UserCog, UserPlus } from 'lucide-react';
import { ContextMenu } from '@/components/ui/ContextMenu';
import { useToast } from '@/components/ui/Toast';
import { DataTable } from '@/components/data-table/DataTable';
import type { ColumnDef } from '@/components/data-table/types';
import { PersonnelImportModal } from './PersonnelImportModal';
import { AssignToTourSlideOver } from './AssignToTourSlideOver';
import {
  PersonnelDetailSlideOver,
  type PersonnelPanelState,
} from './PersonnelDetailSlideOver';
import { FilterChips, type FilterChipOption } from '@/components/ui/FilterChips';
import { CompletenessRing } from './CompletenessRing';
import { DeleteConfirmationModal } from '@/components/ui/DeleteConfirmationModal';
import { toTitleCase } from '@/lib/text/toTitleCase';

export interface PersonnelLibraryRow {
  id: string;
  workspaceId: string;
  fullName: string;
  preferredName: string | null;
  email: string | null;
  phone: string | null;
  pronouns: string | null;
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

type FilterKey = 'all' | 'conflicts' | 'issues' | 'recent' | 'untouched';

const FILTER_LABELS: Record<FilterKey, string> = {
  all: 'All',
  conflicts: 'Conflicts',
  issues: 'Issues',
  recent: 'Recently updated',
  untouched: 'Untouched',
};

/** Stable chip order presented to the user. The corresponding
 *  count for each chip is computed in the component body and
 *  merged into the option list passed to <FilterChips>. */
const FILTER_KEYS: ReadonlyArray<FilterKey> = [
  'all',
  'conflicts',
  'issues',
  'recent',
  'untouched',
];

function formatDate(value: string | null): string {
  if (!value) return '—';
  const dt = new Date(value);
  if (Number.isNaN(dt.getTime())) return '—';
  return dt.toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

function relativeTime(iso: string): string {
  const d = new Date(iso);
  const diff = Date.now() - d.getTime();
  const m = Math.floor(diff / 60000);
  const h = Math.floor(diff / 3600000);
  const day = Math.floor(diff / 86400000);
  if (m < 1) return 'just now';
  if (m < 60) return `${m}m ago`;
  if (h < 24) return `${h}h ago`;
  if (day < 30) return `${day}d ago`;
  return d.toLocaleDateString();
}

export function PersonnelLibraryClient({
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
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
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

  const filteredRows = useMemo(() => {
    if (filter === 'all') return initial;
    return initial.filter((r) => {
      switch (filter) {
        case 'conflicts':
          // Wired against issueLabels so it activates when the
          // server starts surfacing conflict-typed labels (Sprint
          // 10). Currently the server only emits passport/visa
          // labels so this filter naturally yields zero rows on
          // /personnel — but the chip is still wired.
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

  const filterCounts = useMemo(() => {
    let conflicts = 0;
    let issues = 0;
    let recent = 0;
    let untouched = 0;
    for (const r of initial) {
      if (r.issueLabels.some((l) => l.toLowerCase().includes('conflict'))) conflicts++;
      if (r.hasIssue) issues++;
      const t = new Date(r.updatedAt).getTime();
      if (!Number.isFinite(t)) continue;
      if (t >= recentlyUpdatedCutoff) recent++;
      if (t < untouchedCutoff) untouched++;
    }
    return { all: initial.length, conflicts, issues, recent, untouched };
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

  const columns = useMemo<ColumnDef<PersonnelLibraryRow>[]>(
    () => [
      {
        id: 'name',
        header: 'Name',
        accessor: (p) => toTitleCase(p.preferredName ?? p.fullName),
        sortable: true,
        frozen: true,
        minWidth: 200,
        /* Sprint 9 §14.1 — title cell formatted to match the
           Bug Reports list pattern: text-sm semibold lp-text.
           Truncation applied so long names don't push the
           remaining columns. */
        cell: (value) => (
          <span
            className="block truncate"
            style={{
              fontSize: 'var(--lp-text-sm)',
              fontWeight: 'var(--lp-weight-semibold)',
              color: 'var(--lp-text)',
            }}
          >
            {String(value ?? '—')}
          </span>
        ),
      },
      {
        id: 'status',
        header: 'Status',
        width: 160,
        minWidth: 140,
        /* Sprint 9 §14.1 — pill reflects the row's actual
           combined state. Action-required when EITHER (a) there
           are expiring docs (passport ≤180d, visa expired —
           deriveIssues server-side), OR (b) profile completeness
           is < 70% (the same threshold the ring uses). When
           neither applies the row is genuinely "OK". The
           combined accessor lets the column sort attention-first
           rows to the top by default. */
        accessor: (p) => {
          const incomplete = p.completenessPercent < 70 ? 1 : 0;
          return p.hasIssue ? 2 : incomplete;
        },
        sortable: true,
        cell: (_value, row) => {
          const r = row as PersonnelLibraryRow;
          const incomplete = r.completenessPercent < 70;
          const needsAttention = r.hasIssue || incomplete;
          if (!needsAttention) {
            return (
              <span
                className="inline-flex items-center"
                style={{
                  gap: 6,
                  padding: '2px 8px',
                  fontSize: 'var(--lp-text-xs)',
                  fontWeight: 'var(--lp-weight-medium)',
                  color: 'var(--lp-text-tertiary)',
                  background: 'var(--lp-bg-tertiary)',
                  border: '1px solid var(--lp-border-subtle)',
                  borderRadius: 999,
                }}
              >
                <span
                  aria-hidden
                  style={{
                    width: 6,
                    height: 6,
                    borderRadius: 999,
                    background: 'var(--lp-text-tertiary)',
                  }}
                />
                OK
              </span>
            );
          }
          // Pick the dominant cause for the pill label. Expiring
          // docs (issueLabels) win over profile-incomplete since
          // they have a deadline. Tooltip carries the full list.
          const labels: string[] = [...r.issueLabels];
          if (incomplete) {
            labels.push(`Profile ${r.completenessPercent}%`);
          }
          const headline = r.issueLabels[0] ?? 'Profile incomplete';
          return (
            <span
              className="inline-flex items-center"
              role="status"
              title={labels.join(' · ')}
              style={{
                gap: 6,
                padding: '2px 8px',
                fontSize: 'var(--lp-text-xs)',
                fontWeight: 'var(--lp-weight-semibold)',
                color: 'var(--color-lp-orange)',
                background: 'color-mix(in srgb, var(--color-lp-orange) 10%, transparent)',
                border: '1px solid color-mix(in srgb, var(--color-lp-orange) 35%, transparent)',
                borderRadius: 999,
              }}
            >
              <AlertTriangle size={12} strokeWidth={2.4} aria-hidden />
              {headline}
              {labels.length > 1 ? (
                <span
                  style={{
                    marginLeft: 2,
                    color: 'var(--color-lp-orange)',
                    opacity: 0.7,
                  }}
                >
                  +{labels.length - 1}
                </span>
              ) : null}
            </span>
          );
        },
      },
      {
        id: 'completeness',
        header: 'Profile',
        accessor: 'completenessPercent',
        align: 'left',
        sortable: true,
        width: 110,
        minWidth: 100,
        cell: (_value, row) => {
          const r = row as PersonnelLibraryRow;
          return (
            <CompletenessRing
              percent={r.completenessPercent}
              missingLabels={r.completenessMissingLabels}
              onClick={() =>
                setPanel({
                  mode: 'edit',
                  id: r.id,
                  scrollToSection: r.completenessFirstMissingId,
                })
              }
            />
          );
        },
      },
      {
        /* Sprint 9 §14.1 — email gets a fixed-width column so
           long addresses don't push into Last toured (Adam's
           smoke: the two were overlapping at default viewport).
           Text formatting matches the Bug Reports list:
           text-xs lp-text-tertiary truncate. */
        id: 'email',
        header: 'Email',
        accessor: (p) => p.email ?? '',
        width: 240,
        minWidth: 200,
        cell: (value) => (
          <span
            className="block truncate"
            style={{
              fontSize: 'var(--lp-text-xs)',
              color: 'var(--lp-text-tertiary)',
            }}
          >
            {String(value || '—')}
          </span>
        ),
      },
      {
        id: 'last_toured',
        header: 'Last toured',
        accessor: (p) => p.lastTouredAt ?? '',
        sortable: true,
        width: 140,
        minWidth: 120,
        cell: (value) => (
          <span
            style={{
              fontSize: 'var(--lp-text-xs)',
              color: 'var(--lp-text-secondary)',
            }}
          >
            {formatDate((value as string) || null)}
          </span>
        ),
      },
      {
        id: 'total_tours',
        header: 'Tours',
        accessor: 'totalTours',
        align: 'right',
        sortable: true,
        width: 80,
        minWidth: 70,
        cell: (value) => (
          <span
            style={{
              fontSize: 'var(--lp-text-xs)',
              color: 'var(--lp-text-secondary)',
            }}
          >
            {Number(value ?? 0).toLocaleString()}
          </span>
        ),
      },
      {
        id: 'updated',
        header: 'Last updated',
        accessor: 'updatedAt',
        sortable: true,
        width: 140,
        minWidth: 120,
        cell: (value) => (
          <span
            style={{
              fontSize: 'var(--lp-text-xs)',
              color: 'var(--lp-text-tertiary)',
            }}
          >
            {relativeTime(String(value ?? new Date().toISOString()))}
          </span>
        ),
      },
      {
        id: 'actions',
        header: '',
        accessor: () => '',
        align: 'right',
        width: 56,
        minWidth: 48,
        cell: (_value, row) => {
          const r = row as PersonnelLibraryRow;
          const displayName = toTitleCase(r.preferredName ?? r.fullName);
          return (
            <ContextMenu
              align="right"
              items={[
                {
                  label: 'Open profile',
                  icon: UserCog,
                  onClick: () => setPanel({ mode: 'edit', id: r.id }),
                },
                {
                  label: 'Assign to tour',
                  icon: UserPlus,
                  onClick: () =>
                    setAssignOpen({
                      personId: r.id,
                      personName: displayName,
                    }),
                },
                {
                  label: 'Delete',
                  icon: Trash2,
                  variant: 'danger',
                  onClick: () => requestDeleteOne(r.id, displayName),
                },
              ]}
            />
          );
        },
      },
    ],
    [],
  );

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
          {initial.length} {initial.length === 1 ? 'person' : 'people'}
          {totals.issues > 0
            ? ` · ${totals.issues} active issue${totals.issues === 1 ? '' : 's'}`
            : ''}
          {totals.passport > 0
            ? ` · ${totals.passport} passport${totals.passport === 1 ? '' : 's'} expiring soon`
            : ''}
        </div>
        <div className="flex items-center" style={{ gap: 'var(--lp-space-2)' }}>
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
          {/* Assign to tour: shown disabled when nothing selected;
              the simplest flow is to require the user to click a
              row first. For v1 we let them pick from the row's
              kebab. Until that lands, this button opens the
              slide-over with the first selected row OR — if no
              selection — disabled. We keep it visible per Adam's
              spec but disable it when no person is "active". */}
          <button
            type="button"
            onClick={() => {
              if (initial.length === 0) return;
              // Placeholder: no row-selection state yet, so for
              // v1 we open assignment for whichever person the
              // user opens via the detail slide-over. The button
              // is visible for affordance; clicking does nothing
              // unless a row is selected via the slide-over.
              showToast(
                'Open a person from the list, then use Assign to tour from their detail panel.',
              );
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
              cursor: 'pointer',
            }}
            title="Open a person, then Assign to tour from their detail panel"
          >
            <UserPlus size={14} strokeWidth={2} />
            Assign to tour
          </button>
        </div>
      </div>

      {/* Filter chips. Filter is client-side over `initial` so
          it composes cleanly with DataTable's search. The
          <FilterChips> primitive is shared with any future chip
          row; visual style matches the existing FilterSelect
          dropdowns so chip + select read as one filter row. */}
      <FilterChips<FilterKey>
        ariaLabel="Personnel filters"
        value={filter}
        onChange={setFilter}
        options={FILTER_KEYS.map<FilterChipOption<FilterKey>>((key) => ({
          value: key,
          label: FILTER_LABELS[key],
          count: filterCounts[key],
        }))}
      />

      {/* Table */}
      <DataTable<PersonnelLibraryRow>
        rows={filteredRows}
        columns={columns}
        rowKey={(row) => row.id}
        searchPlaceholder="Search by name, email, or phone…"
        onRowClick={(row) => setPanel({ mode: 'edit', id: row.id })}
        selectable
        selectedIds={selectedIds}
        onSelectionChange={setSelectedIds}
        selectionActions={
          selectedIds.length > 0 ? (
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
          ) : null
        }
        emptyState={
          initial.length === 0
            ? 'No people in this workspace yet — click + Add new or Import to get started.'
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
