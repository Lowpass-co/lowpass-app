'use client';

import { useCallback, useMemo, useState } from 'react';
import { Building2, Calendar, FileText, LayoutGrid, Users } from 'lucide-react';
import { LeftRail, type LeftRailVariant, type ListFilterDef } from '@/components/shell/LeftRail';
import { PageShell, type PageShellArchetype } from '@/components/shell/PageShell';
import { TopBar } from '@/components/shell/TopBar';
import { SlideOver } from '@/components/shell/SlideOver';

type PlayTab =
  | 'list'
  | 'spreadsheet'
  | 'dashboard'
  | 'document-days'
  | 'document-sections'
  | 'builder'
  | 'none';

const MOCK_TOURS = [
  { id: '1', name: 'North America 2026', status: 'active' as const },
  { id: '2', name: 'EU Summer', status: 'active' as const },
  { id: '3', name: 'Legacy 2024', status: 'archived' as const },
];

export default function ShellPlaygroundClient() {
  const [tab, setTab] = useState<PlayTab>('list');
  const [tourId, setTourId] = useState('1');
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
      case 'none':
      default:
        return {
          archetype: 'list' as PageShellArchetype,
          leftRail: null,
          mainLabel: 'No left rail',
        };
    }
  }, [tab, listFilters, tourId]);

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
            <div className="flex items-center gap-2 text-sm" style={{ color: 'var(--lp-text-tertiary)' }}>
              <FileText className="h-4 w-4" />
              <span>Main column padding follows PageShell rules for this archetype.</span>
            </div>

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
