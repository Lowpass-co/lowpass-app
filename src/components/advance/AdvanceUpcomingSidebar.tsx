/* ============================================
   LOWPASS — Advance · Upcoming shows sidebar (visual redesign §A.2)

   280px-wide left rail on the per-show advance page. Lists every
   show / festival routing row for this tour with its advance
   completion %. Active show gets a brand-orange left border + tinted
   background. Click another row → navigates to that show's advance.

   "Copy advance from..." dropdown at the top is a quick-access
   wrapper around the existing CopyAdvanceModal — selecting a source
   show pops the same modal AdvanceOverview opens via ?copy=…

   R5-2: renders the canonical <RoutingRail> (presentational, props-only) and
   keeps its own chrome — search, copy-from, and the per-entry progress/overdue
   accessory via the rail's renderMeta slot. Data comes from the shared
   useAdvanceRailEntries hook, which the below-lg AdvanceDateStrip also reads.
   RLS-gated; renders an empty state if the tour has no shows yet.
   ============================================ */

'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ChevronDown, Loader2, Search } from 'lucide-react';
import { CopyAdvanceModal, type AdvanceDateItem } from '@/components/advance/CopyAdvanceModal';
import { RoutingRail, type RailEntry } from '@/components/routing/RoutingRail';
import { parseRoutingDate } from '@/lib/utils';
import { useAdvanceRailEntries } from '@/components/advance/useAdvanceRailEntries';

interface AdvanceUpcomingSidebarProps {
  tourId: string;
  tourName: string;
  /** The currently-active routingId so we can highlight it. */
  activeRoutingId: string;
}

function isShowDay(dayType: string | null | undefined): boolean {
  const t = (dayType ?? '').toLowerCase();
  return t.includes('show') || t.includes('festival');
}

function completionPercent(d: AdvanceDateItem): number {
  if (!d.advance?.sections?.length) return 0;
  const statuses = d.advance.section_statuses ?? {};
  const sections = d.advance.sections;
  let complete = 0;
  for (const sec of sections) {
    const key = sec.template_id ?? sec.label;
    if (statuses[key]?.status === 'complete') complete += 1;
  }
  return Math.round((complete / sections.length) * 100);
}

function overdueCount(d: AdvanceDateItem): number {
  // Shows whose advance is in_progress / not_started AND whose date
  // is in the past read as "overdue" for the sidebar's quick signal.
  const dt = parseRoutingDate(d.date).getTime();
  if (Number.isNaN(dt)) return 0;
  if (dt > Date.now()) return 0;
  if (!d.advance) return 1;
  const status = d.advance.status?.toLowerCase();
  return status === 'complete' ? 0 : 1;
}

function dateLabel(d: AdvanceDateItem): string {
  const date = parseRoutingDate(d.date);
  if (Number.isNaN(date.getTime())) return d.date;
  return date
    .toLocaleDateString('en-GB', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
    })
    .toUpperCase();
}

export function AdvanceUpcomingSidebar({
  tourId,
  tourName,
  activeRoutingId,
}: AdvanceUpcomingSidebarProps) {
  const router = useRouter();
  const [search, setSearch] = useState('');
  const [copySource, setCopySource] = useState<string | null>(null);
  const [copyOpen, setCopyOpen] = useState(false);

  // R5-2 — ONE advance-side data path. The fetch, the show-day filter, the sort
  // and the RailEntry mapping live in useAdvanceRailEntries, shared with the
  // horizontal AdvanceDateStrip (which renders below lg). The hook de-dupes the
  // in-flight request, so mounting both rails costs one `?all=true` call.
  const { items, entries: allEntries, itemById, error } = useAdvanceRailEntries(tourId);

  // Search stays caller-owned — the rail is presentational, props-only.
  const railEntries = useMemo<RailEntry[]>(() => {
    const q = search.trim().toLowerCase();
    if (!q) return allEntries;
    return allEntries.filter((e) =>
      [e.venueName, e.city, e.dayType, e.date].filter(Boolean).some((s) => String(s).toLowerCase().includes(q)),
    );
  }, [allEntries, search]);

  // Source list for the "Copy advance from…" dropdown — every show
  // that already has an advance instance to copy from.
  const copyableItems = useMemo(
    () => (items ?? []).filter((d) => isShowDay(d.day_type) && d.advance),
    [items],
  );

  function handleCopySelect(routingId: string) {
    setCopySource(routingId);
    setCopyOpen(true);
  }

  function handleCopySuccess() {
    setCopyOpen(false);
    setCopySource(null);
    router.refresh();
  }

  return (
    <aside
      className="hidden flex-shrink-0 flex-col border-r lg:flex"
      style={{
        width: 280,
        borderColor: 'var(--lp-border-strong)',
        background: 'var(--lp-bg-deep)',
      }}
      aria-label="Upcoming shows"
    >
      {/* Search + copy-from dropdown */}
      <div
        className="space-y-2 border-b p-3"
        style={{ borderColor: 'var(--lp-border-subtle)' }}
      >
        <div
          className="flex items-center gap-2 rounded-md border px-2 py-1"
          style={{
            borderColor: 'var(--lp-border-strong)',
            background: 'var(--lp-bg)',
          }}
        >
          <Search
            className="h-3.5 w-3.5"
            style={{ color: 'var(--lp-text-tertiary)' }}
          />
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search upcoming shows…"
            className="w-full bg-transparent outline-none"
            style={{ fontSize: '12px', color: 'var(--lp-text)' }}
            aria-label="Search upcoming shows"
          />
        </div>

        <div>
          <label
            style={{
              fontSize: '11px',
              fontWeight: 600,
              letterSpacing: '0.1em',
              textTransform: 'uppercase',
              color: 'var(--lp-text-tertiary)',
            }}
          >
            Copy advance from…
          </label>
          <div
            className="mt-1 flex items-center gap-1 rounded-md border px-2 py-1"
            style={{
              borderColor: 'var(--lp-border-strong)',
              background: 'var(--lp-bg)',
            }}
          >
            <select
              value=""
              onChange={(e) => {
                const v = e.target.value;
                if (v) handleCopySelect(v);
                e.currentTarget.blur();
              }}
              className="w-full bg-transparent outline-none"
              style={{ fontSize: '12px', color: 'var(--lp-text)' }}
              aria-label="Pick a source show to copy advance from"
            >
              <option value="">Select a previous show…</option>
              {copyableItems.length === 0 ? (
                <option value="" disabled>
                  No prior advances on this tour
                </option>
              ) : (
                copyableItems.map((d) => (
                  <option key={d.routing_id} value={d.routing_id}>
                    {dateLabel(d)} — {d.venue_name || d.city || '—'}
                  </option>
                ))
              )}
            </select>
            <ChevronDown
              className="h-3.5 w-3.5 shrink-0"
              style={{ color: 'var(--lp-text-tertiary)' }}
            />
          </div>
        </div>
      </div>

      {/* Tour name — group header */}
      <div
        className="border-b px-3 py-2"
        style={{ borderColor: 'var(--lp-border-subtle)' }}
      >
        <span
          className="truncate"
          style={{
            display: 'block',
            fontSize: '11px',
            fontWeight: 700,
            letterSpacing: '0.12em',
            textTransform: 'uppercase',
            color: 'var(--lp-text-tertiary)',
          }}
        >
          {tourName}
        </span>
      </div>

      {/* Show list */}
      <div className="min-h-0 flex-1 overflow-y-auto">
        {items === null && !error ? (
          <div
            className="flex items-center gap-2 px-3 py-4"
            style={{ fontSize: '12px', color: 'var(--lp-text-tertiary)' }}
          >
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
            Loading shows…
          </div>
        ) : error ? (
          <div
            className="px-3 py-4"
            style={{ fontSize: '12px', color: 'var(--lp-text-tertiary)' }}
          >
            Couldn’t load shows: {error}
          </div>
        ) : railEntries.length === 0 ? (
          <div
            className="px-3 py-4"
            style={{ fontSize: '12px', color: 'var(--lp-text-tertiary)' }}
          >
            No show days in routing yet.
          </div>
        ) : (
          <RoutingRail
            entries={railEntries}
            selected={activeRoutingId}
            onSelect={() => {}}
            grouping="night"
            showDayTypePill={false}
            ariaLabel="Upcoming shows"
            hrefForEntry={(e) => `/advance/${tourId}/${e.id}`}
            renderMeta={(e) => {
              const d = itemById.get(e.id);
              if (!d) return null;
              const pct = completionPercent(d);
              const overdue = overdueCount(d);
              return (
                <>
                  <div
                    className="mt-1.5 overflow-hidden rounded-full"
                    style={{ height: 4, background: 'var(--lp-bg)' }}
                    aria-hidden
                  >
                    <div
                      style={{
                        width: `${pct}%`,
                        height: '100%',
                        background:
                          pct >= 100
                            ? 'var(--color-lp-status-complete)'
                            : 'var(--lp-orange)',
                        transition: 'width 200ms var(--lp-ease-standard, ease)',
                      }}
                    />
                  </div>
                  <div
                    className="mt-1 flex items-baseline justify-between gap-2"
                    style={{ fontSize: '11px', color: 'var(--lp-text-tertiary)' }}
                  >
                    <span>
                      <span className="lp-mono">{pct}%</span> complete
                    </span>
                    {overdue > 0 ? (
                      <span style={{ color: 'var(--color-lp-error, #EF4444)', fontWeight: 600 }}>
                        {overdue} overdue
                      </span>
                    ) : null}
                  </div>
                </>
              );
            }}
          />
        )}
      </div>

      {/* CopyAdvanceModal — same component AdvanceOverview opens. */}
      {copyOpen && copySource && items ? (
        <CopyAdvanceModal
          tourId={tourId}
          dates={items}
          initialSourceRoutingId={copySource}
          open={copyOpen}
          onClose={() => {
            setCopyOpen(false);
            setCopySource(null);
          }}
          onSuccess={handleCopySuccess}
        />
      ) : null}
    </aside>
  );
}
