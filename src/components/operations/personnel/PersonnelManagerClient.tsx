'use client';

/* ============================================
   LOWPASS — Crew list (/operations/[tourId]/personnel) — redesigned
   Nov 2026 (Adam: "more visually pleasing, better flow, less restrictive")

   One panel, rows split by hairlines, grouped by department (from the role
   tag) or A–Z. Each row: who, their dates ("Whole tour" unless different),
   a clash with another of your tours, role + tag, and their app login on
   this tour. Status (Confirmed / Tentative / …) is RETIRED — someone on the
   list is on the crew; remove them if they're not.

   - Live: refetches on any tour_personnel change (useRealtimeRows) — no
     Refresh button.
   - Click a row (admin / manager) → <PersonnelManageSlideOver>.
   - "+ Add crew" → <AddCrewSlideOver>. `assignPersonId` (from People ›
     Assign to tour, ?assign=) opens it with that person ticked.
   - Members who can see Logistics get the list read-only.
   ============================================ */

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ChevronRight, KeyRound, Loader2, Plus, AlertTriangle } from 'lucide-react';
import { useRealtimeRows } from '@/lib/realtime/useRealtimeRows';
import { useToast } from '@/components/ui/Toast';
import { toTitleCase } from '@/lib/text/toTitleCase';
import { ROLE_TAG_LABEL, type RoleTag } from '@/lib/personnel/role-tags';
import { DEPARTMENT_LABELS, groupByDepartment, isWholeTour, type LoginState } from '@/lib/personnel/crew';
import { PRESET_LABELS } from '@/lib/permissions/areas';
import { PersonnelManageSlideOver } from './PersonnelManageSlideOver';
import { AddCrewSlideOver } from './AddCrewSlideOver';
import { PersonnelDetailSlideOver } from '@/components/personnel/PersonnelDetailSlideOver';
import { DeleteConfirmationModal } from '@/components/ui/DeleteConfirmationModal';
import { GridMenu, type MenuConfig, type MenuItem } from '@/components/grid/GridMenu';
import type { ConflictsResponse, ConflictRow, PersonnelListItem, PersonnelListResponse } from '@/lib/personnel/types';
import './crewRoster.css';

interface PersonnelManagerClientProps {
  tourId: string;
  /** The tour's currency — rates are shown in it (Oct 2026). */
  tourCurrency?: string;
  tourStartDate: string | null;
  tourEndDate: string | null;
  /** ?filter=conflicts — read on the server, passed down. */
  conflictsOnly: boolean;
  /** Admin / manager: add, edit, remove. Members see the list only. */
  canEdit: boolean;
  /** ?assign=<personId> from People › Assign to tour. */
  assignPersonId?: string | null;
  /** Workspace admin — may change app access (the database's rule). */
  canChangeLogin?: boolean;
}

type GroupMode = 'dept' | 'az';

type CrewLoad = { ok: true; personnel: PersonnelListItem[] } | { ok: false; error: string };

async function loadCrew(tourId: string): Promise<CrewLoad> {
  try {
    const res = await fetch(`/api/tours/${tourId}/personnel`, { cache: 'no-store' });
    if (!res.ok) {
      const body = (await res.json().catch(() => null)) as { error?: string } | null;
      return { ok: false, error: body?.error ?? `Couldn't load the crew (${res.status})` };
    }
    return { ok: true, personnel: ((await res.json()) as PersonnelListResponse).personnel };
  } catch {
    return { ok: false, error: "Couldn't load the crew — check your connection" };
  }
}

const NO_CONFLICTS: ConflictsResponse = { by_canonical: {}, by_email: {} };

/** Clashes are informational: any failure is "none". */
async function loadConflicts(
  tourId: string,
  rows: PersonnelListItem[],
  start: string | null,
  end: string | null,
): Promise<ConflictsResponse> {
  if (rows.length === 0 || !start || !end) return NO_CONFLICTS;
  const canonicalIds = Array.from(new Set(rows.map((r) => r.canonical_person_id).filter((v): v is string => !!v)));
  const emails = Array.from(
    new Set(rows.filter((r) => !r.canonical_person_id && r.email).map((r) => (r.email as string).toLowerCase())),
  );
  try {
    const res = await fetch(`/api/tours/${tourId}/personnel/conflicts`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ canonical_person_ids: canonicalIds, emails, start_date: start, end_date: end }),
    });
    return res.ok ? ((await res.json()) as ConflictsResponse) : NO_CONFLICTS;
  } catch {
    return NO_CONFLICTS;
  }
}

function fmtDay(iso: string): string {
  const d = new Date(`${iso.slice(0, 10)}T12:00:00`);
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
}
function fmtRange(start: string | null, end: string | null): string {
  if (start && end) return start === end ? fmtDay(start) : `${fmtDay(start)} – ${fmtDay(end)}`;
  if (start) return `From ${fmtDay(start)}`;
  if (end) return `Until ${fmtDay(end)}`;
  return '';
}
function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  return ((parts[0]?.[0] ?? '') + (parts.length > 1 ? parts[parts.length - 1][0] : '')).toUpperCase() || '?';
}

/** What the access column says. Managers can't read invites or others'
 *  access (RLS), so for them a login shows without its preset. */
export function loginLabel(l: LoginState): string {
  switch (l.state) {
    case 'full':
      return 'Sees every tour';
    case 'member':
      return l.preset === 'custom' ? 'Custom access' : l.preset ? PRESET_LABELS[l.preset] : 'Has login';
    case 'invited':
      return l.preset && l.preset !== 'custom' ? `Invited · ${PRESET_LABELS[l.preset]}` : 'Invited';
    default:
      return 'No login';
  }
}

export function PersonnelManagerClient({
  tourId,
  tourCurrency = 'GBP',
  tourStartDate,
  tourEndDate,
  conflictsOnly,
  canEdit,
  assignPersonId = null,
  canChangeLogin = false,
}: PersonnelManagerClientProps) {
  const { showToast } = useToast();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [list, setList] = useState<PersonnelListItem[]>([]);
  const [conflicts, setConflicts] = useState<ConflictsResponse>(NO_CONFLICTS);
  const [search, setSearch] = useState('');
  const [group, setGroup] = useState<GroupMode>('dept');
  const [manageId, setManageId] = useState<string | null>(null);
  const [addOpen, setAddOpen] = useState(!!assignPersonId && canEdit);
  // The person's People record, opened from the Manage panel's "Edit person".
  const [personId, setPersonId] = useState<string | null>(null);
  const router = useRouter();
  // Right-click a crew row (Nov 2026, Adam: "I want right click menu on crew too").
  const [menu, setMenu] = useState<MenuConfig | null>(null);
  const [removing, setRemoving] = useState<PersonnelListItem | null>(null);
  const openRowMenu = (e: React.MouseEvent, p: PersonnelListItem) => {
    const items: MenuItem[] = [];
    if (canEdit) {
      items.push({ value: 'manage', label: 'Edit on this tour' });
      items.push({ value: 'profile', label: 'Open full profile' });
      items.push({ value: 'payroll', label: 'Rates in Payroll' });
    }
    if (p.email) items.push({ value: 'email', label: 'Copy email', sep: items.length > 0 });
    if (p.phone) items.push({ value: 'phone', label: 'Copy phone', sep: items.length > 0 && !p.email });
    if (canEdit) items.push({ value: 'remove', label: 'Remove from tour…', danger: true, sep: true });
    if (!items.length) return; // nothing to offer → the browser's menu
    e.preventDefault();
    const copy = (text: string, what: string) =>
      void navigator.clipboard?.writeText(text).then(
        () => showToast(`${what} copied`),
        () => showToast(`Could not copy the ${what.toLowerCase()}`, 'error'),
      );
    setMenu({
      anchor: { left: e.clientX, bottom: e.clientY },
      gap: 0,
      title: toTitleCase(p.display_name),
      options: items,
      onPick: (v) => {
        setMenu(null);
        if (v === 'manage') setManageId(p.id);
        else if (v === 'profile') setPersonId(p.person_id);
        else if (v === 'payroll') router.push(`/operations/${tourId}/payroll`);
        else if (v === 'email' && p.email) copy(p.email, 'Email');
        else if (v === 'phone' && p.phone) copy(p.phone, 'Phone');
        else if (v === 'remove') setRemoving(p);
      },
    });
  };

  // Loads return values; state is set only in callbacks (never synchronously
  // inside an effect).
  const applyLoad = useCallback((r: CrewLoad) => {
    if (r.ok) {
      setList(r.personnel);
      setError(null);
    } else setError(r.error);
  }, []);
  const fetchList = useCallback(() => loadCrew(tourId).then(applyLoad), [tourId, applyLoad]);

  useEffect(() => {
    let live = true;
    void loadCrew(tourId).then((r) => {
      if (!live) return;
      applyLoad(r);
      setLoading(false);
    });
    return () => {
      live = false;
    };
  }, [tourId, applyLoad]);

  // Clashes with your other tours — re-checked whenever the list changes.
  useEffect(() => {
    let live = true;
    void loadConflicts(tourId, list, tourStartDate, tourEndDate).then((c) => {
      if (live) setConflicts(c);
    });
    return () => {
      live = false;
    };
  }, [tourId, list, tourStartDate, tourEndDate]);

  useRealtimeRows({
    table: 'tour_personnel',
    filterColumn: 'tour_id',
    filterValue: tourId,
    onChange: () => {
      void fetchList();
    },
  });

  const conflictsFor = useCallback(
    (p: PersonnelListItem): ConflictRow[] => {
      if (p.canonical_person_id) return conflicts.by_canonical[p.canonical_person_id] ?? [];
      if (p.email) return conflicts.by_email[p.email.toLowerCase()] ?? [];
      return [];
    },
    [conflicts],
  );

  const filtered = useMemo(() => {
    const words = search.toLowerCase().split(/\s+/).filter(Boolean);
    return list
      .filter((p) => {
        if (conflictsOnly && conflictsFor(p).length === 0) return false;
        if (!words.length) return true;
        const hay = `${p.display_name} ${p.email ?? ''} ${p.role} ${ROLE_TAG_LABEL[p.role_tag as RoleTag] ?? ''}`.toLowerCase();
        return words.every((w) => hay.includes(w));
      })
      .sort((a, b) => a.display_name.localeCompare(b.display_name, undefined, { sensitivity: 'base' }));
  }, [list, search, conflictsOnly, conflictsFor]);

  const groups = useMemo(
    () => (group === 'dept' ? groupByDepartment(filtered, (p) => p.role_tag) : [{ dept: null, rows: filtered }]),
    [filtered, group],
  );
  const clashCount = useMemo(() => list.filter((p) => conflictsFor(p).length > 0).length, [list, conflictsFor]);
  const manageMember = manageId ? list.find((p) => p.id === manageId) ?? null : null;

  if (loading) {
    return (
      <div className="cr-muted" style={{ fontSize: 'var(--lp-text-sm)' }}>
        <Loader2 size={14} className="animate-spin" style={{ display: 'inline', marginRight: 6 }} />
        Loading the crew…
      </div>
    );
  }
  if (error) {
    return (
      <div className="cr-error" role="alert">
        {error}
      </div>
    );
  }

  const facts = [`${list.length} on the crew`, clashCount ? `${clashCount} ${clashCount === 1 ? 'clash' : 'clashes'}` : null]
    .filter(Boolean)
    .join(' · ');

  return (
    <div className="cr-page" style={{ containerType: 'inline-size' }}>
      <p className="cr-facts">{facts}</p>

      <div className="cr-toolbar">
        <input
          className="cr-input cr-search"
          type="search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search crew"
          aria-label="Search crew"
        />
        <div className="cr-seg" role="group" aria-label="Group by">
          <button type="button" className={group === 'dept' ? 'is-on' : ''} onClick={() => setGroup('dept')} aria-pressed={group === 'dept'}>
            Department
          </button>
          <button type="button" className={group === 'az' ? 'is-on' : ''} onClick={() => setGroup('az')} aria-pressed={group === 'az'}>
            A–Z
          </button>
        </div>
        {conflictsOnly ? (
          <a href={`/operations/${tourId}/personnel`} className="cr-chip is-on" style={{ textDecoration: 'none' }}>
            Clashes only · clear
          </a>
        ) : null}
        <span className="cr-spacer" />
        {canEdit ? (
          <button type="button" className="cr-btn is-primary" onClick={() => setAddOpen(true)}>
            <Plus size={14} strokeWidth={2.4} />
            Add crew
          </button>
        ) : null}
      </div>

      <div className="cr-panel">
        {filtered.length === 0 ? (
          <div className="cr-empty">
            {list.length === 0 ? (
              canEdit ? (
                <>
                  No one on this tour yet.{' '}
                  <button type="button" className="cr-chip is-on" onClick={() => setAddOpen(true)} style={{ marginLeft: 6 }}>
                    <Plus size={12} /> Add crew
                  </button>
                </>
              ) : (
                'No one on this tour yet.'
              )
            ) : (
              'No one matches.'
            )}
          </div>
        ) : (
          groups.map((g) => (
            <div key={g.dept ?? 'all'}>
              {g.dept ? (
                <div className="cr-group">
                  {DEPARTMENT_LABELS[g.dept]} · {g.rows.length}
                </div>
              ) : null}
              {g.rows.map((p) => (
                <CrewRow
                  key={p.id}
                  p={p}
                  clashes={conflictsFor(p)}
                  whole={isWholeTour(p.starts_on, p.ends_on, tourStartDate, tourEndDate)}
                  onOpen={canEdit ? () => setManageId(p.id) : undefined}
                  onContextMenu={(e) => openRowMenu(e, p)}
                />
              ))}
            </div>
          ))
        )}
      </div>

      {menu ? <GridMenu config={menu} onClose={() => setMenu(null)} /> : null}
      {canEdit ? (
        <>
          <DeleteConfirmationModal
            open={!!removing}
            itemName={removing ? toTitleCase(removing.display_name) : ''}
            description="They come off this tour's crew. Their People record and their other tours stay."
            onClose={() => setRemoving(null)}
            onConfirm={async () => {
              if (!removing) return;
              const res = await fetch(`/api/tours/${tourId}/personnel/${removing.id}`, { method: 'DELETE' });
              const body = (await res.json().catch(() => null)) as { error?: string } | null;
              if (!res.ok) throw new Error(body?.error ?? `Remove failed (${res.status})`);
              showToast('Removed from the crew');
              setRemoving(null);
              void fetchList();
            }}
          />
          <PersonnelManageSlideOver
            open={!!manageMember}
            tourId={tourId}
            tourCurrency={tourCurrency}
            member={manageMember}
            onClose={() => setManageId(null)}
            onSaved={() => void fetchList()}
            onRemoved={() => {
              showToast('Removed from the crew');
              void fetchList();
            }}
            onEditPerson={(id) => {
              setManageId(null);
              setPersonId(id);
            }}
            canChangeLogin={canChangeLogin}
          />
          <PersonnelDetailSlideOver
            panel={personId ? { mode: 'edit', id: personId } : null}
            onClose={() => setPersonId(null)}
            onSaved={() => void fetchList()}
          />
          <AddCrewSlideOver
            open={addOpen}
            tourId={tourId}
            tourStartDate={tourStartDate}
            tourEndDate={tourEndDate}
            preselectPersonId={assignPersonId}
            onClose={() => {
              setAddOpen(false);
              void fetchList();
            }}
            onAdded={() => void fetchList()}
          />
        </>
      ) : null}
    </div>
  );
}

function CrewRow({
  p,
  clashes,
  whole,
  onOpen,
  onContextMenu,
}: {
  p: PersonnelListItem;
  clashes: ConflictRow[];
  whole: boolean;
  onOpen?: () => void;
  onContextMenu?: (e: React.MouseEvent) => void;
}) {
  const name = toTitleCase(p.display_name);
  const tag = p.role_tag && p.role_tag !== 'other' ? ROLE_TAG_LABEL[p.role_tag as RoleTag] : null;
  const first = clashes[0];
  const clashText = first
    ? `Also on ${first.tour_name}${fmtRange(first.start_date, first.end_date) ? `, ${fmtRange(first.start_date, first.end_date)}` : ''}${
        clashes.length > 1 ? ` +${clashes.length - 1}` : ''
      }`
    : null;
  const clashTitle = clashes
    .map((c) => `${c.tour_name} (${c.workspace_name}) as ${c.role}${fmtRange(c.start_date, c.end_date) ? `, ${fmtRange(c.start_date, c.end_date)}` : ''}`)
    .join('\n');
  const login = loginLabel(p.login);
  const body = (
    <>
      <span className="cr-avatar" aria-hidden>
        {initials(name)}
      </span>
      <span style={{ minWidth: 0 }}>
        <span className="cr-name" style={{ display: 'block' }}>{name}</span>
        {clashText ? (
          <span className="cr-sub cr-warn" style={{ display: 'block' }} title={clashTitle}>
            <AlertTriangle size={11} style={{ display: 'inline', marginRight: 4, verticalAlign: '-1px' }} aria-hidden />
            {clashText}
          </span>
        ) : (
          <span className="cr-sub" style={{ display: 'block' }}>
            {whole ? 'Whole tour' : fmtRange(p.starts_on, p.ends_on)}
          </span>
        )}
      </span>
      <span className="cr-role">
        {p.role}
        {tag ? <span className="cr-tag"> · {tag}</span> : null}
      </span>
      <span className={`cr-access${p.login.state === 'none' ? ' is-none' : ''}`}>
        {p.login.state !== 'none' ? (
          <KeyRound size={11} style={{ display: 'inline', marginRight: 4, verticalAlign: '-1px' }} aria-hidden />
        ) : null}
        {login}
      </span>
      <span aria-hidden className="cr-muted">{onOpen ? <ChevronRight size={14} /> : null}</span>
    </>
  );
  return onOpen ? (
    <button type="button" className="cr-row" onClick={onOpen} onContextMenu={onContextMenu} aria-label={`${name}, ${p.role}`}>
      {body}
    </button>
  ) : (
    <div className="cr-row" onContextMenu={onContextMenu}>
      {body}
    </div>
  );
}
