'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Building2, Calendar, FileText, Hotel, LayoutGrid, Plane, Users } from 'lucide-react';
import { DocumentCanvas } from '@/components/document/DocumentCanvas';
import { LeftRail, type LeftRailVariant, type ListFilterDef } from '@/components/shell/LeftRail';
import { PageShell, type PageShellArchetype } from '@/components/shell/PageShell';
import { TopBar } from '@/components/shell/TopBar';
import { SlideOver } from '@/components/shell/SlideOver';
import { TimelineDashboard } from '@/components/timeline';
import type { TimelineRow } from '@/components/timeline/types';
import { EntityChip, useEntityRouting } from '@/components/entity';
import { SpreadsheetGrid } from '@/components/spreadsheet-grid/SpreadsheetGrid';
import type { GridColumn, GridRow } from '@/components/spreadsheet-grid/types';
import { useArtistTourContext } from '@/contexts/ArtistTourContext';
import { createClient } from '@/lib/supabase-client';
import type { EntityKind } from '@/lib/entities/types';

const LOREM =
  'Lorem ipsum dolor sit amet, consectetur adipiscing elit. Sed do eiusmod tempor incididunt ut labore. Ut enim ad minim veniam, quis nostrud exercitation.';

const UX_DOC_SECS: Array<{ id: string; label: string; href: string }> = [
  { id: 'docsec-overview', label: 'Overview', href: '#docsec-overview' },
  { id: 'docsec-travel', label: 'Travel', href: '#docsec-travel' },
  { id: 'docsec-hotel', label: 'Hotel', href: '#docsec-hotel' },
  { id: 'docsec-venue', label: 'Venue', href: '#docsec-venue' },
  { id: 'docsec-show', label: 'Show', href: '#docsec-show' },
  { id: 'docsec-settlement', label: 'Settlement', href: '#docsec-settlement' },
];

const TL_START = '2026-01-01';
const TL_END = '2026-03-31';
const TL_TODAY = '2026-01-31';

function makeTimelineRows(): TimelineRow<string>[] {
  const item = (id: string, s: string, e: string, label: string) => ({
    id,
    startDate: s,
    endDate: e,
    data: label,
    color: 'var(--lp-orange)' as const,
    render: (d: string) => <span className="truncate font-medium">{d}</span>,
  });
  return [
    {
      id: 'shows',
      label: 'Shows',
      icon: Calendar,
      items: [
        item('sh1', '2026-01-10', '2026-01-12', 'Headline — NYC'),
        item('sh2', '2026-01-18', '2026-01-18', 'Festival set'),
        item('sh3', '2026-02-01', '2026-02-04', 'Multi-city run'),
        item('sh4', '2026-02-14', '2026-02-14', 'Club night'),
        item('sh5', '2026-03-01', '2026-03-02', 'Arena A'),
        item('sh6', '2026-03-20', '2026-03-22', 'Festival B'),
        item('sh7', '2026-01-25', '2026-01-27', 'Residency'),
        item('sh8', '2026-02-20', '2026-02-20', 'Off show'),
      ],
    },
    {
      id: 'hotels',
      label: 'Hotels',
      icon: Hotel,
      items: [
        item('h1', '2026-01-09', '2026-01-13', 'Hudson Hotel'),
        item('h2', '2026-01-17', '2026-01-19', 'Downtown'),
        item('h3', '2026-02-05', '2026-02-08', 'Marriott leg'),
        item('h4', '2026-03-05', '2026-03-07', 'Airport'),
        item('h5', '2026-03-18', '2026-03-21', 'Final city'),
        item('h6', '2026-02-10', '2026-02-12', 'Boutique'),
        item('h7', '2026-01-28', '2026-01-30', 'Quick night'),
        item('h8', '2026-03-12', '2026-03-14', 'Outskirts'),
      ],
    },
    {
      id: 'flights',
      label: 'Flights',
      icon: Plane,
      items: [
        item('f1', '2026-01-08', '2026-01-08', 'JFK–ORD'),
        item('f2', '2026-01-16', '2026-01-16', 'CHI–BOS'),
        item('f3', '2026-02-02', '2026-02-02', 'BOS–SEA'),
        item('f4', '2026-02-18', '2026-02-18', 'LAX–DEN'),
        item('f5', '2026-03-10', '2026-03-10', 'DEN–PHX'),
        item('f6', '2026-01-22', '2026-01-22', 'Shuttle'),
        item('f7', '2026-03-25', '2026-03-25', 'PHX–LAX'),
      ],
    },
    {
      id: 'tasks',
      label: 'Tasks',
      icon: FileText,
      items: [
        item('t1', '2026-01-05', '2026-01-05', 'Visa check'),
        item('t2', '2026-01-20', '2026-01-20', 'Carnet'),
        item('t3', '2026-02-08', '2026-02-08', 'Backline list'),
        item('t4', '2026-02-25', '2026-02-25', 'Crew call'),
        item('t5', '2026-03-15', '2026-03-15', 'Settle run'),
        item('t6', '2026-01-12', '2026-01-12', 'Rehearsal block'),
        item('t7', '2026-03-28', '2026-03-28', 'Load out'),
        item('t8', '2026-02-15', '2026-02-15', 'SFX check'),
        item('t9', '2026-02-16', '2026-02-16', 'Comm matrix'),
        item('t10', '2026-03-02', '2026-03-02', 'Per diem'),
      ],
    },
  ];
}

type PlayTab =
  | 'list'
  | 'spreadsheet'
  | 'dashboard'
  | 'document-days'
  | 'document-sections'
  | 'builder'
  | 'ux-timeline'
  | 'ux-doc'
  | 'ux-canvas'
  | 'ux-entity'
  | 'none';

const MOCK_TOURS = [
  { id: '1', name: 'North America 2026', status: 'active' as const },
  { id: '2', name: 'EU Summer', status: 'active' as const },
  { id: '3', name: 'Legacy 2024', status: 'archived' as const },
];

const ENTITY_KINDS: EntityKind[] = ['person', 'flight', 'room', 'gear', 'show'];

type EntityDemoRow = { name: string; personId: string };

export default function ShellPlaygroundClient() {
  const { open } = useEntityRouting();
  const { selectedTourId } = useArtistTourContext();
  const [tab, setTab] = useState<PlayTab>('list');
  const [tourId, setTourId] = useState('1');
  const [activeDoc, setActiveDoc] = useState('docsec-overview');
  const [builderZoom, setBuilderZoom] = useState(1);
  const [showGrid, setShowGrid] = useState(true);
  const [entitySamples, setEntitySamples] = useState<Partial<Record<EntityKind, string>>>({});
  const [entRows, setEntRows] = useState<GridRow<EntityDemoRow>[]>(() => [
    { id: 'er-1', data: { name: 'FOH', personId: '' } },
    { id: 'er-2', data: { name: 'Mon', personId: '' } },
    { id: 'er-3', data: { name: 'TM', personId: '' } },
  ]);
  const [q, setQ] = useState('');
  const [sel, setSel] = useState('all');
  const [from, setFrom] = useState('2026-04-01');
  const [to, setTo] = useState('2026-04-30');
  const [tags, setTags] = useState<string[]>(['band']);
  const [slideOverOpen, setSlideOverOpen] = useState(false);
  const [slideOverMode, setSlideOverMode] = useState<'default' | 'wideBackdrop'>('default');

  const onPalette = useCallback(() => {
    console.log('[shell-playground] Command palette open (UX08b placeholder)');
  }, []);

  const entCols: GridColumn<EntityDemoRow>[] = useMemo(
    () => [
      {
        id: 'name',
        header: 'Role',
        accessor: 'name',
        type: { kind: 'text' },
        width: 120,
        frozen: true,
      },
      {
        id: 'personId',
        header: 'Person',
        accessor: 'personId',
        type: { kind: 'entityRef', entity: 'person' },
        width: 220,
      },
    ],
    []
  );

  const onEntCommit = useCallback(async (rowId: string, columnId: string, value: unknown) => {
    if (columnId !== 'personId') return;
    setEntRows(prev =>
      prev.map(r => (r.id === rowId ? { ...r, data: { ...r.data, personId: String(value ?? '') } } : r))
    );
  }, []);

  const timelineRows = useMemo(() => makeTimelineRows(), []);

  useEffect(() => {
    if (tab !== 'ux-entity') return;
    const supabase = createClient();
    void (async () => {
      const [p, f, r, g, s] = await Promise.all([
        supabase.from('personnel').select('id').limit(1).maybeSingle(),
        supabase.from('flight_bookings').select('id').limit(1).maybeSingle(),
        supabase.from('hotel_bookings').select('id').limit(1).maybeSingle(),
        supabase.from('mic_library').select('id').limit(1).maybeSingle(),
        supabase.from('routing').select('id').limit(1).maybeSingle(),
      ]);
      setEntitySamples({
        person: p.data?.id,
        flight: f.data?.id,
        room: r.data?.id,
        gear: g.data?.id,
        show: s.data?.id,
      });
      const pid = p.data?.id;
      if (pid) {
        setEntRows(prev => {
          if (prev[0]?.data.personId) return prev;
          return prev.map((row, i) => (i === 0 ? { ...row, data: { ...row.data, personId: pid } } : row));
        });
      }
    })();
  }, [tab]);

  useEffect(() => {
    if (tab !== 'ux-doc') return;
    const fromHash = () => {
      const h = window.location.hash.slice(1);
      if (h.startsWith('docsec-')) {
        setActiveDoc(h);
        requestAnimationFrame(() => {
          document.getElementById(h)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
        });
      }
    };
    fromHash();
    window.addEventListener('hashchange', fromHash);
    return () => window.removeEventListener('hashchange', fromHash);
  }, [tab]);

  const listFilters: ListFilterDef[] = useMemo(
    () => [
      {
        id: 'q',
        type: 'text',
        label: 'Search',
        value: q,
        onChange: setQ,
      },
      {
        id: 'status',
        type: 'select',
        label: 'Status',
        value: sel,
        options: [
          { value: 'all', label: 'All' },
          { value: 'open', label: 'Open' },
        ],
        onChange: setSel,
      },
      {
        id: 'dr',
        type: 'dateRange',
        label: 'Date range',
        from,
        to,
        onChange: (a, b) => {
          setFrom(a);
          setTo(b);
        },
      },
      {
        id: 'tags',
        type: 'multiSelect',
        label: 'Tags',
        value: tags,
        options: [
          { value: 'band', label: 'Band' },
          { value: 'crew', label: 'Crew' },
        ],
        onChange: setTags,
      },
    ],
    [q, sel, from, to, tags],
  );

  const { archetype, leftRail, mainLabel } = useMemo(() => {
    switch (tab) {
      case 'list': {
        const v: LeftRailVariant = {
          kind: 'list',
          filters: listFilters,
          savedViews: [
            { id: 'sv1', name: 'My open bugs' },
            { id: 'sv2', name: 'This week' },
          ],
          onSavedViewSelect: (id) => console.log('[playground] saved view', id),
        };
        return {
          archetype: 'list' as PageShellArchetype,
          leftRail: <LeftRail variant={v} />,
          mainLabel: 'List archetype',
        };
      }
      case 'spreadsheet': {
        const v: LeftRailVariant = {
          kind: 'spreadsheet',
          activeId: 'inc',
          sections: [
            { id: 'inc', label: 'Income', href: '#' },
            { id: 'exp', label: 'Expenses', href: '#' },
            { id: 'hot', label: 'Hotels', href: '#' },
          ],
        };
        return {
          archetype: 'spreadsheet' as PageShellArchetype,
          leftRail: <LeftRail variant={v} />,
          mainLabel: 'Spreadsheet archetype',
        };
      }
      case 'dashboard': {
        const v: LeftRailVariant = {
          kind: 'dashboard',
          tourId: tourId,
          structure: [
            { label: 'Overview', href: '/dashboard', icon: LayoutGrid },
            { label: 'Advance', href: '/advance', icon: Calendar },
            { label: 'Personnel', href: '/personnel', icon: Users },
            { label: 'Budget', href: '/budget', icon: Building2 },
          ],
        };
        return {
          archetype: 'dashboard' as PageShellArchetype,
          leftRail: <LeftRail variant={v} />,
          mainLabel: 'Dashboard archetype',
        };
      }
      case 'document-days': {
        const y = new Date();
        const startD = new Date(y);
        startD.setDate(startD.getDate() - 2);
        const endD = new Date(y);
        endD.setDate(endD.getDate() + 4);
        const iso = (d: Date) => d.toLocaleDateString('en-CA');
        const start = iso(startD);
        const end = iso(endD);
        const active = iso(y);
        const v: LeftRailVariant = {
          kind: 'docDays',
          tourStartDate: start,
          tourEndDate: end,
          activeDate: active,
          days: [
            { date: start, label: 'Show', type: 'show' },
            { date: active, label: 'Today city', type: 'festival' },
          ],
          onDayClick: (d) => console.log('[playground] day', d),
        };
        return {
          archetype: 'document' as PageShellArchetype,
          leftRail: <LeftRail variant={v} />,
          mainLabel: 'Document (days) archetype',
        };
      }
      case 'document-sections': {
        const v: LeftRailVariant = {
          kind: 'docSections',
          activeId: 'io',
          sections: [
            { id: 'io', label: 'Inputs', href: '#' },
            { id: 'mon', label: 'Monitors', href: '#' },
            { id: 'back', label: 'Backline', href: '#' },
          ],
        };
        return {
          archetype: 'document' as PageShellArchetype,
          leftRail: <LeftRail variant={v} />,
          mainLabel: 'Document (sections) archetype',
        };
      }
      case 'builder': {
        const v: LeftRailVariant = {
          kind: 'spreadsheet',
          activeId: 'a',
          sections: [
            { id: 'a', label: 'Inputs / Mon', href: '#' },
            { id: 'b', label: 'Patch', href: '#' },
          ],
        };
        return {
          archetype: 'builder' as PageShellArchetype,
          leftRail: <LeftRail variant={v} />,
          mainLabel: 'Builder (sheet-style rail)',
        };
      }
      case 'ux-timeline': {
        const v: LeftRailVariant = {
          kind: 'dashboard',
          tourId: tourId,
          structure: [
            { label: 'Overview', href: '/admin/shell-playground', icon: LayoutGrid },
            { label: 'Budget', href: '/admin/shell-playground', icon: Building2 },
            { label: 'Advance', href: '/admin/shell-playground', icon: Calendar },
            { label: 'Personnel', href: '/admin/shell-playground', icon: Users },
          ],
        };
        return {
          archetype: 'dashboard' as PageShellArchetype,
          leftRail: <LeftRail variant={v} />,
          mainLabel: 'UX07 — TimelineDashboard',
        };
      }
      case 'ux-doc': {
        const v: LeftRailVariant = {
          kind: 'docSections',
          activeId: activeDoc,
          sections: UX_DOC_SECS,
        };
        return {
          archetype: 'document' as PageShellArchetype,
          leftRail: <LeftRail variant={v} />,
          mainLabel: 'UX07 — DocumentCanvas (prose)',
        };
      }
      case 'ux-canvas': {
        const v: LeftRailVariant = {
          kind: 'spreadsheet',
          activeId: 'patch',
          sections: [
            { id: 'patch', label: 'Stage plot', href: '#patch' },
            { id: 'io', label: 'I/O', href: '#io' },
          ],
        };
        return {
          archetype: 'builder' as PageShellArchetype,
          leftRail: <LeftRail variant={v} />,
          mainLabel: 'UX07 — DocumentCanvas (builder)',
        };
      }
      case 'ux-entity': {
        return {
          archetype: 'list' as PageShellArchetype,
          leftRail: null,
          mainLabel: 'UX08 — EntityChip + routing',
        };
      }
      case 'none':
      default:
        return {
          archetype: 'list' as PageShellArchetype,
          leftRail: null,
          mainLabel: 'No left rail',
        };
    }
  }, [tab, listFilters, tourId, activeDoc]);

  const topBar = (
    <TopBar
      activeTourId={tourId}
      tours={MOCK_TOURS}
      onTourSelect={setTourId}
      onCreateTour={() => console.log('[playground] create tour')}
      onCommandPaletteOpen={onPalette}
      user={{ name: 'Playground Admin', email: 'dev@lowpass.app' }}
    />
  );

  const tabs: { id: PlayTab; label: string }[] = [
    { id: 'list', label: 'List' },
    { id: 'spreadsheet', label: 'Spreadsheet' },
    { id: 'dashboard', label: 'Dashboard' },
    { id: 'document-days', label: 'Doc days' },
    { id: 'document-sections', label: 'Doc sections' },
    { id: 'builder', label: 'Builder' },
    { id: 'ux-timeline', label: 'UX07 timeline' },
    { id: 'ux-doc', label: 'UX07 document' },
    { id: 'ux-canvas', label: 'UX07 canvas' },
    { id: 'ux-entity', label: 'UX08 entities' },
    { id: 'none', label: 'None' },
  ];

  return (
    <div className="flex min-h-0 w-full min-w-0 flex-1 flex-col">
      <div
        className="mb-2 flex flex-wrap gap-1 border-b p-1"
        style={{ borderColor: 'var(--lp-border)' }}
      >
        {tabs.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setTab(t.id)}
            className="rounded-md px-2 py-1 text-sm font-medium"
            style={
              tab === t.id
                ? { background: 'var(--lp-surface-hover)', color: 'var(--lp-text)' }
                : { color: 'var(--lp-text-secondary)' }
            }
          >
            {t.label}
          </button>
        ))}
      </div>
      <p className="mb-2 text-sm" style={{ color: 'var(--lp-text-secondary)' }}>
        Nested inside the legacy app layout for QA. Press ⌘K (or Ctrl+K) to log the palette callback.
      </p>
      <div
        className="min-h-0 flex-1 overflow-hidden rounded-lg border"
        style={{ borderColor: 'var(--lp-border)' }}
      >
        <PageShell topBar={topBar} leftRail={leftRail} archetype={archetype}>
          <div
            className={
              archetype === 'spreadsheet' || archetype === 'builder' ? 'space-y-4 p-4' : 'space-y-4'
            }
          >
            <h2 className="text-lg font-semibold" style={{ color: 'var(--lp-text)' }}>
              {mainLabel}
            </h2>
            {tab === 'ux-timeline' && (
              <div className="h-[min(70vh,560px)] min-h-0 w-full min-w-0">
                <TimelineDashboard
                  rows={timelineRows}
                  startDate={TL_START}
                  endDate={TL_END}
                  todayDate={TL_TODAY}
                  dayWidth={80}
                  areaHeight="min(70vh,560px)"
                  toolbarExtra={
                    <div className="flex flex-wrap gap-1">
                      <span
                        className="rounded-full border px-2 py-0.5 text-xs font-medium"
                        style={{ borderColor: 'var(--lp-border)', color: 'var(--lp-text-secondary)' }}
                      >
                        Band
                      </span>
                      <span
                        className="rounded-full border px-2 py-0.5 text-xs font-medium"
                        style={{ borderColor: 'var(--lp-border)', color: 'var(--lp-text-secondary)' }}
                      >
                        Crew
                      </span>
                    </div>
                  }
                />
              </div>
            )}
            {tab === 'ux-doc' && (
              <div className="h-[min(75vh,640px)] min-h-0 overflow-hidden rounded-xl border" style={{ borderColor: 'var(--lp-border)' }}>
                <DocumentCanvas
                  mode="prose"
                  sections={UX_DOC_SECS.map(s => ({ id: s.id, label: s.label }))}
                  activeSection={activeDoc}
                  onSectionChange={setActiveDoc}
                  maxHeight="min(75vh,640px)"
                >
                  {UX_DOC_SECS.map(s => (
                    <section
                      key={s.id}
                      id={s.id}
                      className="border-b last:border-0"
                      style={{ borderColor: 'var(--lp-border-light)', paddingBottom: 'var(--lp-space-8)' }}
                    >
                      <h1>{s.label}</h1>
                      <p>{LOREM}</p>
                      <p>{LOREM}</p>
                      <p>{LOREM}</p>
                    </section>
                  ))}
                </DocumentCanvas>
              </div>
            )}
            {tab === 'ux-canvas' && (
              <div className="min-h-0 w-full min-w-0">
                <label className="mb-2 flex items-center gap-2 text-sm" style={{ color: 'var(--lp-text-secondary)' }}>
                  <input
                    type="checkbox"
                    checked={showGrid}
                    onChange={e => setShowGrid(e.target.checked)}
                    className="rounded border"
                  />
                  Show grid
                </label>
                <div className="h-[min(70vh,560px)] min-h-0 w-full min-w-0">
                  <DocumentCanvas
                    mode="builder"
                    aspectRatio={16 / 9}
                    zoom={builderZoom}
                    onZoomChange={setBuilderZoom}
                    showGrid={showGrid}
                    minHeight="min(70vh,560px)"
                  >
                    <div className="absolute left-[4%] top-[8%] h-[20%] w-[22%] rounded border text-xs" style={{ borderColor: 'var(--lp-orange)', background: 'var(--lp-surface)', color: 'var(--lp-text)', padding: 4 }}>FOH L</div>
                    <div className="absolute right-[4%] top-[8%] h-[20%] w-[22%] rounded border text-xs" style={{ borderColor: 'var(--lp-orange)', background: 'var(--lp-surface)', color: 'var(--lp-text)', padding: 4 }}>FOH R</div>
                    <div className="absolute bottom-[12%] left-1/2 h-[16%] w-[28%] -translate-x-1/2 rounded border text-xs" style={{ borderColor: 'var(--lp-orange)', background: 'var(--lp-surface)', color: 'var(--lp-text)', padding: 4 }}>Mon A</div>
                    <div className="absolute left-[18%] top-[38%] h-[12%] w-[10%] rounded border text-xs" style={{ borderColor: 'var(--lp-border)', background: 'var(--lp-bg-secondary)', color: 'var(--lp-text)', padding: 4 }}>Sub 1</div>
                    <div className="absolute right-[18%] top-[38%] h-[12%] w-[10%] rounded border text-xs" style={{ borderColor: 'var(--lp-border)', background: 'var(--lp-bg-secondary)', color: 'var(--lp-text)', padding: 4 }}>Sub 2</div>
                  </DocumentCanvas>
                </div>
              </div>
            )}
            {tab === 'ux-entity' && (
              <div className="space-y-6">
                <p className="text-sm" style={{ color: 'var(--lp-text-secondary)' }}>
                  Registry-backed chips and SlideOver. Use the TopBar tour for scoped search. Click a filled chip
                  to open detail (placeholder body until UX09–12). In the grid, double-click or type to edit the
                  person cell—search and pick, then Enter commits.
                </p>
                <div>
                  <h3 className="mb-2 text-sm font-semibold" style={{ color: 'var(--lp-text)' }}>
                    One chip per kind
                  </h3>
                  <div className="flex flex-wrap items-end gap-3">
                    {ENTITY_KINDS.map((k) => {
                      const id = entitySamples[k];
                      return (
                        <div key={k} className="flex flex-col gap-0.5">
                          <span className="text-[10px] font-medium uppercase" style={{ color: 'var(--lp-text-tertiary)' }}>
                            {k}
                          </span>
                          {id ? (
                            <EntityChip kind={k} id={id} />
                          ) : (
                            <span className="text-xs" style={{ color: 'var(--lp-text-tertiary)' }}>
                              (no row)
                            </span>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
                {entitySamples.person && (
                  <div>
                    <h3 className="mb-2 text-sm font-semibold" style={{ color: 'var(--lp-text)' }}>
                      Variants (person)
                    </h3>
                    <div className="flex flex-wrap items-center gap-2">
                      <EntityChip kind="person" id={entitySamples.person} variant="default" />
                      <EntityChip kind="person" id={entitySamples.person} variant="compact" />
                      <EntityChip kind="person" id={entitySamples.person} variant="inline" />
                    </div>
                  </div>
                )}
                <div>
                  <h3 className="mb-2 text-sm font-semibold" style={{ color: 'var(--lp-text)' }}>
                    useEntityRouting().open(…)
                  </h3>
                  <button
                    type="button"
                    className="rounded-md border px-3 py-1.5 text-sm font-medium"
                    style={{ borderColor: 'var(--lp-border)', color: 'var(--lp-text)' }}
                    disabled={!entitySamples.person}
                    onClick={() => entitySamples.person && open({ kind: 'person', id: entitySamples.person })}
                  >
                    Open first person
                  </button>
                </div>
                <div>
                  <h3 className="mb-2 text-sm font-semibold" style={{ color: 'var(--lp-text)' }}>
                    SpreadsheetGrid person column
                  </h3>
                  <div className="h-[min(320px,40vh)] min-h-0 w-full min-w-0">
                    <SpreadsheetGrid<EntityDemoRow>
                      columns={entCols}
                      rows={entRows}
                      density="compact"
                      entitySearchTourId={selectedTourId}
                      onCommitCell={onEntCommit}
                      containerHeight="100%"
                      ariaLabel="Entity ref spreadsheet demo"
                    />
                  </div>
                </div>
              </div>
            )}
            {tab !== 'ux-timeline' && tab !== 'ux-doc' && tab !== 'ux-canvas' && tab !== 'ux-entity' && (
            <div
              className="rounded-lg border p-4"
              style={{
                background: 'var(--lp-surface)',
                borderColor: 'var(--lp-border)',
                boxShadow: 'var(--lp-shadow-sm)',
              }}
            >
              <p className="text-sm" style={{ color: 'var(--lp-text-secondary)' }}>
                Sample content card. Tab: {tab} · Tour: {tourId}
              </p>
            </div>
            )}
            {tab !== 'ux-timeline' && tab !== 'ux-doc' && tab !== 'ux-canvas' && tab !== 'ux-entity' && (
            <div className="flex items-center gap-2 text-sm" style={{ color: 'var(--lp-text-tertiary)' }}>
              <FileText className="h-4 w-4" />
              <span>Main column padding follows PageShell rules for this archetype.</span>
            </div>
            )}

            <div
              className="flex flex-wrap items-center gap-2 rounded-lg border p-3"
              style={{ borderColor: 'var(--lp-border)', background: 'var(--lp-bg-secondary)' }}
            >
              <label className="flex items-center gap-2 text-sm" style={{ color: 'var(--lp-text)' }}>
                <span className="whitespace-nowrap">SlideOver demo</span>
                <select
                  className="rounded-md border px-2 py-1.5 text-sm"
                  style={{
                    borderColor: 'var(--lp-border)',
                    background: 'var(--lp-bg)',
                    color: 'var(--lp-text)',
                  }}
                  value={slideOverMode}
                  onChange={e => setSlideOverMode(e.target.value as 'default' | 'wideBackdrop')}
                >
                  <option value="default">Default width, no backdrop</option>
                  <option value="wideBackdrop">Wide + backdrop</option>
                </select>
              </label>
              <button
                type="button"
                onClick={() => setSlideOverOpen(true)}
                className="rounded-lg px-3 py-1.5 text-sm font-semibold"
                style={{
                  background: 'var(--lp-orange)',
                  color: '#fff',
                }}
              >
                Open SlideOver demo
              </button>
            </div>
          </div>
        </PageShell>
      </div>
      <SlideOver
        open={slideOverOpen}
        onClose={() => setSlideOverOpen(false)}
        title="Britannia Row Audio Rental"
        subtitle="£12,500.00 · Expense · 12 Aug 2026"
        width={slideOverMode === 'wideBackdrop' ? 'wide' : 'default'}
        backdrop={slideOverMode === 'wideBackdrop'}
        footer={
          <button
            type="button"
            className="text-sm font-medium"
            style={{ color: 'var(--lp-text-secondary)' }}
            onClick={() => {}}
          >
            View source
          </button>
        }
      >
        <div className="space-y-4 text-sm" style={{ color: 'var(--lp-text)' }}>
          <div>
            <div className="mb-1 text-[11px] font-bold uppercase tracking-wider" style={{ color: 'var(--lp-text-tertiary)' }}>
              Notes
            </div>
            <p style={{ color: 'var(--lp-text-secondary)' }}>Placeholder for notes or markdown.</p>
          </div>
          <div>
            <div className="mb-1 text-[11px] font-bold uppercase tracking-wider" style={{ color: 'var(--lp-text-tertiary)' }}>
              Attachments
            </div>
            <p style={{ color: 'var(--lp-text-secondary)' }}>Placeholder for file list + upload.</p>
          </div>
          <div>
            <div className="mb-1 text-[11px] font-bold uppercase tracking-wider" style={{ color: 'var(--lp-text-tertiary)' }}>
              Comments
            </div>
            <p style={{ color: 'var(--lp-text-secondary)' }}>Placeholder for threaded comments.</p>
          </div>
        </div>
      </SlideOver>
    </div>
  );
}
