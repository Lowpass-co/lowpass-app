'use client';

/* ============================================
   LOWPASS — PersonnelManagerClient (Sprint 9 §6)

   Manager view of /operations/[tourId]/personnel. Lists
   assigned personnel, supports filter/search, opens the per-
   assignment Manage slide-over, and surfaces cross-tour
   conflict warnings inline.

   Real-time: subscribes to tour_personnel changes filtered by
   tour_id (Phase 4's useRealtimeRows hook). Edits in another
   tab refresh the list.

   Tags: tour_personnel doesn't have a tags column. The list
   column shows "—" for now; the tag filter dropdown is hidden
   when no rows have tags. Per-personnel-record tagging is a
   future-sprint concern.
   ============================================ */

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { Loader2, Plus, RefreshCw } from 'lucide-react';
import { useRealtimeRows } from '@/lib/realtime/useRealtimeRows';
import { RealtimeIndicator } from '@/components/realtime/RealtimeIndicator';
import { useToast } from '@/components/ui/Toast';
import { toTitleCase } from '@/lib/text/toTitleCase';
import { ConflictBanner } from './ConflictBanner';
import { PersonnelManageSlideOver } from './PersonnelManageSlideOver';
import { AddPersonnelSlideOver } from './AddPersonnelSlideOver';
import type {
  ConflictsResponse,
  ConflictRow,
  PersonnelListItem,
  PersonnelListResponse,
  PersonnelStatus,
} from '@/lib/personnel/types';

interface PersonnelManagerClientProps {
  tourId: string;
  tourStartDate: string | null;
  tourEndDate: string | null;
}

type StatusFilter = 'all' | PersonnelStatus;

const STATUS_OPTIONS: ReadonlyArray<{ value: StatusFilter; label: string }> = [
  { value: 'all', label: 'All' },
  { value: 'confirmed', label: 'Confirmed' },
  { value: 'tentative', label: 'Tentative' },
  { value: 'awaiting_contract', label: 'Awaiting contract' },
  { value: 'cancelled', label: 'Cancelled' },
  { value: 'fired', label: 'Fired' },
];

const STATUS_BADGE: Record<PersonnelStatus, { label: string; bg: string; fg: string }> = {
  confirmed: {
    label: 'Confirmed',
    bg: 'color-mix(in srgb, var(--color-lp-success, #10b981) 12%, transparent)',
    fg: 'var(--color-lp-success, #10b981)',
  },
  tentative: {
    label: 'Tentative',
    bg: 'color-mix(in srgb, var(--color-lp-orange) 10%, transparent)',
    fg: 'var(--color-lp-orange)',
  },
  awaiting_contract: {
    label: 'Awaiting contract',
    bg: 'var(--lp-panel)',
    fg: 'var(--lp-text-secondary)',
  },
  cancelled: {
    label: 'Cancelled',
    bg: 'var(--lp-panel)',
    fg: 'var(--lp-text-tertiary)',
  },
  fired: {
    label: 'Fired',
    bg: 'color-mix(in srgb, var(--color-lp-error) 10%, transparent)',
    fg: 'var(--color-lp-error)',
  },
};

function formatRange(start: string | null, end: string | null): string {
  if (!start && !end) return '—';
  const fmt = (iso: string) => {
    const d = new Date(iso);
    return d.toLocaleDateString(undefined, {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
  };
  if (start && end) return start === end ? fmt(start) : `${fmt(start)} – ${fmt(end)}`;
  return fmt((start ?? end) as string);
}

export function PersonnelManagerClient({
  tourId,
  tourStartDate,
  tourEndDate,
}: PersonnelManagerClientProps) {
  const { showToast } = useToast();
  const searchParams = useSearchParams();
  const conflictsOnly = searchParams?.get('filter') === 'conflicts';
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [list, setList] = useState<PersonnelListItem[]>([]);
  const [conflicts, setConflicts] = useState<ConflictsResponse>({
    by_canonical: {},
    by_email: {},
  });
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [tagFilter, setTagFilter] = useState<string>('all');
  const [search, setSearch] = useState('');
  const [manageId, setManageId] = useState<string | null>(null);
  const [addOpen, setAddOpen] = useState(false);

  const fetchList = useCallback(async () => {
    try {
      const res = await fetch(`/api/tours/${tourId}/personnel`, {
        cache: 'no-store',
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as { error?: string } | null;
        setError(body?.error ?? `Failed to load (${res.status})`);
        return;
      }
      const body = (await res.json()) as PersonnelListResponse;
      setList(body.personnel);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Network error');
    }
  }, [tourId]);

  const fetchConflicts = useCallback(
    async (rows: PersonnelListItem[]) => {
      if (rows.length === 0 || !tourStartDate || !tourEndDate) {
        setConflicts({ by_canonical: {}, by_email: {} });
        return;
      }
      const canonicalIds = Array.from(
        new Set(
          rows
            .map((r) => r.canonical_person_id)
            .filter((v): v is string => !!v),
        ),
      );
      const emails = Array.from(
        new Set(
          rows
            .filter((r) => !r.canonical_person_id && r.email)
            .map((r) => (r.email as string).toLowerCase()),
        ),
      );
      try {
        const res = await fetch(`/api/tours/${tourId}/personnel/conflicts`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            canonical_person_ids: canonicalIds,
            emails,
            start_date: tourStartDate,
            end_date: tourEndDate,
          }),
        });
        if (res.ok) {
          const body = (await res.json()) as ConflictsResponse;
          setConflicts(body);
        }
      } catch {
        // Conflicts are informational; never block.
      }
    },
    [tourId, tourStartDate, tourEndDate],
  );

  useEffect(() => {
    let cancelled = false;
    void fetchList().finally(() => {
      if (!cancelled) setLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, [fetchList]);

  // Re-run conflict check whenever the list changes.
  useEffect(() => {
    void fetchConflicts(list);
  }, [list, fetchConflicts]);

  // Realtime sync — refetch on any tour_personnel change for this tour.
  const { connected: realtimeConnected } = useRealtimeRows({
    table: 'tour_personnel',
    filterColumn: 'tour_id',
    filterValue: tourId,
    onChange: () => {
      void fetchList();
    },
  });

  const handleRefresh = async () => {
    setRefreshing(true);
    await fetchList();
    setRefreshing(false);
  };

  // Derived data
  const knownTags = useMemo(() => {
    const set = new Set<string>();
    for (const p of list) for (const t of p.tags) set.add(t);
    return Array.from(set).sort();
  }, [list]);

  function conflictsFor(p: PersonnelListItem): ConflictRow[] {
    if (p.canonical_person_id) {
      return conflicts.by_canonical[p.canonical_person_id] ?? [];
    }
    if (p.email) {
      return conflicts.by_email[p.email.toLowerCase()] ?? [];
    }
    return [];
  }

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return list.filter((p) => {
      // Sprint 9 §8 — ?filter=conflicts narrows to people with
      // at least one cross-tour conflict. Linked from the
      // Operations summary's Conflicts card.
      if (conflictsOnly && conflictsFor(p).length === 0) return false;
      if (statusFilter !== 'all' && p.status !== statusFilter) return false;
      if (tagFilter !== 'all' && !p.tags.includes(tagFilter)) return false;
      if (!q) return true;
      const hay = `${p.display_name} ${p.email ?? ''} ${p.role}`.toLowerCase();
      return hay.includes(q);
    });
    // conflictsFor closes over `conflicts` state; include it.
    // eslint-disable-next-line react-hooks/exhaustive-deps -- conflictsFor is a closure over conflicts state
  }, [list, search, statusFilter, tagFilter, conflictsOnly, conflicts]);

  const manageMember = manageId ? list.find((p) => p.id === manageId) ?? null : null;
  const excludePersonIds = useMemo(() => list.map((p) => p.person_id), [list]);

  if (loading) {
    return (
      <div
        className="flex items-center"
        style={{
          gap: 'var(--lp-space-2)',
          padding: 'var(--lp-space-6)',
          color: 'var(--lp-text-tertiary)',
        }}
      >
        <Loader2 size={14} className="animate-spin" />
        Loading personnel…
      </div>
    );
  }

  if (error) {
    return (
      <div
        role="alert"
        style={{
          padding: 'var(--lp-space-3)',
          fontSize: 'var(--lp-text-sm)',
          color: 'var(--color-lp-error)',
          background: 'color-mix(in srgb, var(--color-lp-error) 8%, transparent)',
          border: '1px solid color-mix(in srgb, var(--color-lp-error) 25%, transparent)',
          borderRadius: 'var(--lp-radius-md)',
        }}
      >
        {error}
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--lp-space-4)' }}>
      {/* Header strip with realtime + refresh + add */}
      <div
        className="flex flex-wrap items-center justify-between"
        style={{ gap: 'var(--lp-space-3)' }}
      >
        <div className="flex items-center" style={{ gap: 'var(--lp-space-2)' }}>
          <RealtimeIndicator connected={realtimeConnected} />
          <span
            style={{
              fontSize: 'var(--lp-text-sm)',
              color: 'var(--lp-text-secondary)',
            }}
          >
            {list.length} assigned
          </span>
          {conflictsOnly ? (
            <a
              href={`/operations/${tourId}/personnel`}
              className="lp-label-caps inline-flex items-center"
              style={{
                gap: 4,
                padding: '2px 8px',
                fontSize: 'var(--lp-text-2xs)',
                color: 'var(--color-lp-orange)',
                background: 'color-mix(in srgb, var(--color-lp-orange) 10%, transparent)',
                border: '1px solid color-mix(in srgb, var(--color-lp-orange) 30%, transparent)',
                borderRadius: 999,
                textDecoration: 'none',
              }}
              title="Click to clear filter"
            >
              Conflicts only · clear ✕
            </a>
          ) : null}
        </div>
        <div className="flex items-center" style={{ gap: 'var(--lp-space-2)' }}>
          <button
            type="button"
            onClick={() => void handleRefresh()}
            disabled={refreshing}
            className="btn-transition inline-flex items-center"
            style={{
              gap: 4,
              padding: 'var(--lp-space-2) var(--lp-space-3)',
              fontSize: 'var(--lp-text-sm)',
              color: 'var(--lp-text-secondary)',
              background: 'transparent',
              border: '1px solid var(--lp-border-strong)',
              borderRadius: 'var(--lp-radius-md)',
              cursor: 'pointer',
            }}
          >
            <RefreshCw
              size={14}
              strokeWidth={2.4}
              className={refreshing ? 'animate-spin' : ''}
            />
            Refresh
          </button>
          <button
            type="button"
            onClick={() => setAddOpen(true)}
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
            Add personnel
          </button>
        </div>
      </div>

      {/* Filter row */}
      <div
        className="flex flex-wrap items-center"
        style={{ gap: 'var(--lp-space-2)' }}
      >
        <FilterSelect
          label="Status"
          value={statusFilter}
          onChange={(v) => setStatusFilter(v as StatusFilter)}
          options={STATUS_OPTIONS}
        />
        {knownTags.length > 0 ? (
          <FilterSelect
            label="Tag"
            value={tagFilter}
            onChange={setTagFilter}
            options={[
              { value: 'all', label: 'Any' },
              ...knownTags.map((t) => ({ value: t, label: t })),
            ]}
          />
        ) : null}
        <input
          type="text"
          placeholder="Search by name, email, or role…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          style={{
            flex: 1,
            minWidth: 200,
            padding: 'var(--lp-space-2) var(--lp-space-3)',
            fontSize: 'var(--lp-text-sm)',
            color: 'var(--lp-text)',
            background: 'var(--lp-bg)',
            border: '1px solid var(--lp-border-strong)',
            borderRadius: 'var(--lp-radius-md)',
            outline: 'none',
          }}
        />
      </div>

      {/* List */}
      {filtered.length === 0 ? (
        <div
          style={{
            padding: 'var(--lp-space-6)',
            textAlign: 'center',
            fontSize: 'var(--lp-text-sm)',
            color: 'var(--lp-text-tertiary)',
            background: 'var(--lp-panel)',
            border: '1px dashed var(--lp-border-strong)',
            borderRadius: 'var(--lp-radius-md)',
          }}
        >
          {list.length === 0
            ? 'No personnel assigned yet — click + Add personnel to get started.'
            : 'No personnel match your filters.'}
        </div>
      ) : (
        <ul
          style={{
            listStyle: 'none',
            padding: 0,
            margin: 0,
            display: 'flex',
            flexDirection: 'column',
            gap: 'var(--lp-space-2)',
          }}
        >
          {filtered.map((p) => {
            const personConflicts = conflictsFor(p);
            const badge = STATUS_BADGE[p.status];
            return (
              <li key={p.id}>
                <button
                  type="button"
                  onClick={() => setManageId(p.id)}
                  className="btn-transition flex w-full items-start"
                  style={{
                    gap: 'var(--lp-space-3)',
                    padding: 'var(--lp-space-3) var(--lp-space-4)',
                    background: 'var(--lp-surface)',
                    border: '1px solid var(--lp-border-subtle)',
                    borderRadius: 'var(--lp-radius-md)',
                    cursor: 'pointer',
                    textAlign: 'left',
                  }}
                >
                  <span style={{ flex: 1, minWidth: 0 }}>
                    <span className="flex items-center" style={{ gap: 'var(--lp-space-2)' }}>
                      <span
                        style={{
                          fontSize: 'var(--lp-text-base)',
                          fontWeight: 'var(--lp-weight-semibold)',
                          color: 'var(--lp-text)',
                        }}
                      >
                        {toTitleCase(p.display_name)}
                      </span>
                      <span
                        style={{
                          fontSize: 'var(--lp-text-sm)',
                          color: 'var(--lp-text-secondary)',
                        }}
                      >
                        {p.role}
                      </span>
                    </span>
                    <span
                      className="block"
                      style={{
                        marginTop: 2,
                        fontSize: 'var(--lp-text-xs)',
                        color: 'var(--lp-text-tertiary)',
                      }}
                    >
                      {formatRange(p.starts_on, p.ends_on)}
                      {p.tags.length > 0 ? ` · ${p.tags.join(', ')}` : ''}
                    </span>
                  </span>
                  <span
                    className="lp-label-caps"
                    style={{
                      flexShrink: 0,
                      padding: '2px 8px',
                      fontSize: 'var(--lp-text-2xs)',
                      fontWeight: 'var(--lp-weight-semibold)',
                      color: badge.fg,
                      background: badge.bg,
                      border: `1px solid ${badge.fg}`,
                      borderRadius: 999,
                    }}
                  >
                    {badge.label}
                  </span>
                </button>
                {personConflicts.length > 0 ? (
                  <ConflictBanner personName={toTitleCase(p.display_name)} conflicts={personConflicts} />
                ) : null}
              </li>
            );
          })}
        </ul>
      )}

      <PersonnelManageSlideOver
        open={!!manageMember}
        tourId={tourId}
        member={manageMember}
        onClose={() => setManageId(null)}
        onSaved={() => void fetchList()}
        onRemoved={() => {
          showToast('Personnel removed.');
          void fetchList();
        }}
      />

      <AddPersonnelSlideOver
        open={addOpen}
        tourId={tourId}
        excludePersonIds={excludePersonIds}
        tourStartDate={tourStartDate}
        tourEndDate={tourEndDate}
        onClose={() => setAddOpen(false)}
        onAdded={() => {
          showToast('Personnel added.');
          void fetchList();
        }}
      />
    </div>
  );
}

interface FilterSelectProps<T extends string> {
  label: string;
  value: T;
  onChange: (v: T) => void;
  options: ReadonlyArray<{ value: T; label: string }>;
}

function FilterSelect<T extends string>({
  label,
  value,
  onChange,
  options,
}: FilterSelectProps<T>) {
  return (
    <label
      className="inline-flex items-center"
      style={{
        gap: 6,
        fontSize: 'var(--lp-text-xs)',
        color: 'var(--lp-text-tertiary)',
      }}
    >
      <span>{label}:</span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value as T)}
        style={{
          padding: '2px 8px',
          fontSize: 'var(--lp-text-sm)',
          color: 'var(--lp-text)',
          background: 'var(--lp-bg)',
          border: '1px solid var(--lp-border-strong)',
          borderRadius: 'var(--lp-radius-sm)',
          cursor: 'pointer',
        }}
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </label>
  );
}
