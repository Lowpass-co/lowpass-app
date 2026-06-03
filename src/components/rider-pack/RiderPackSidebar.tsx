/* ============================================
   LOWPASS — Rider · Pack sidebar (§RA3)

   280px left rail listing the rider packs in the current context
   (a tour's packs, or an artist's templates). Active pack gets the
   brand-orange left border + tinted background; click another →
   navigate to it. Mirrors AdvanceUpcomingSidebar.tsx:144-394 (rail
   chrome, search box, group header, active-row treatment).

   Rider deviations (justified by data shape):
   - Lists kind='rider' packs for the scope, not show routing rows.
   - Drops the Advance-only "Copy advance from…" dropdown + modal —
     riders have no per-show copy flow here.
   - Artist-scope rows link with ?mode=edit (§RA14 lock: opening an
     artist template lands in builder mode).
   - Per-row completion bar is an optional hook filled in §RA11
     (section status tracking); until then rows show title + updated.

   Reads GET /api/rider-packs (RLS-gated). Empty/loading/error states.
   ============================================ */

'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { FileText, Loader2, Search } from 'lucide-react';
import type { RiderProgress } from '@/lib/rider-packs/progress';

interface RiderPackRow {
  id: string;
  title: string | null;
  kind: string | null;
  scope: string | null;
  updated_at: string | null;
  /** §RA11 — per-pack completion summary from GET /api/rider-packs. */
  progress?: RiderProgress | null;
}

interface RiderPackSidebarProps {
  /** Which context the rail lists. */
  scope: 'tour' | 'artist';
  /** Tour id (scope='tour') or artist id (scope='artist'). */
  contextId: string;
  /** Group-header label (tour name / artist name). */
  contextName: string;
  /** Active pack id to highlight. */
  activePackId: string;
}

function updatedLabel(iso: string | null): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
}

export function RiderPackSidebar({ scope, contextId, contextName, activePackId }: RiderPackSidebarProps) {
  const [packs, setPacks] = useState<RiderPackRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');

  useEffect(() => {
    let alive = true;
    const param = scope === 'tour' ? `tour_id=${contextId}` : `artist_id=${contextId}`;
    fetch(`/api/rider-packs?scope=${scope}&${param}`)
      .then((res) => {
        if (!res.ok) throw new Error(`Failed (${res.status})`);
        return res.json() as Promise<{ packs?: RiderPackRow[] }>;
      })
      .then((data) => {
        if (alive) setPacks((data.packs ?? []).filter((p) => p.kind === 'rider'));
      })
      .catch((e: Error) => {
        if (alive) setError(e.message);
      });
    return () => {
      alive = false;
    };
  }, [scope, contextId]);

  const rows = useMemo(() => {
    const all = packs ?? [];
    const q = search.trim().toLowerCase();
    return q ? all.filter((p) => (p.title ?? '').toLowerCase().includes(q)) : all;
  }, [packs, search]);

  return (
    <aside
      className="hidden flex-shrink-0 flex-col border-r lg:flex"
      style={{ width: 280, borderColor: 'var(--lp-border-strong)', background: 'var(--lp-bg-deep)' }}
      aria-label="Rider packs"
    >
      {/* Search */}
      <div className="border-b p-3" style={{ borderColor: 'var(--lp-border-subtle)' }}>
        <div
          className="flex items-center gap-2 rounded-md border px-2 py-1"
          style={{ borderColor: 'var(--lp-border-strong)', background: 'var(--lp-bg)' }}
        >
          <Search className="h-3.5 w-3.5" style={{ color: 'var(--lp-text-tertiary)' }} />
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search rider packs…"
            className="w-full bg-transparent outline-none"
            style={{ fontSize: '12px', color: 'var(--lp-text)' }}
            aria-label="Search rider packs"
          />
        </div>
      </div>

      {/* Context group header */}
      <div className="border-b px-3 py-2" style={{ borderColor: 'var(--lp-border-subtle)' }}>
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
          {contextName}
        </span>
      </div>

      {/* Pack list */}
      <div className="min-h-0 flex-1 overflow-y-auto">
        {packs === null && !error ? (
          <div className="flex items-center gap-2 px-3 py-4" style={{ fontSize: '12px', color: 'var(--lp-text-tertiary)' }}>
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
            Loading packs…
          </div>
        ) : error ? (
          <div className="px-3 py-4" style={{ fontSize: '12px', color: 'var(--lp-text-tertiary)' }}>
            Couldn’t load packs: {error}
          </div>
        ) : rows.length === 0 ? (
          <div className="px-3 py-4" style={{ fontSize: '12px', color: 'var(--lp-text-tertiary)' }}>
            No rider packs in this context yet.
          </div>
        ) : (
          <ul className="space-y-px">
            {rows.map((p) => {
              const active = p.id === activePackId;
              const href = `/rider-packs/${p.id}${scope === 'artist' ? '?mode=edit' : ''}`;
              const updated = updatedLabel(p.updated_at);
              return (
                <li key={p.id}>
                  <Link
                    href={href}
                    className="btn-transition block px-3 py-2"
                    style={{
                      borderLeft: active ? '2px solid var(--color-lp-orange)' : '2px solid transparent',
                      background: active ? 'var(--lp-surface)' : 'transparent',
                    }}
                  >
                    <div className="flex items-center gap-1.5">
                      <FileText
                        className="h-3.5 w-3.5 shrink-0"
                        style={{ color: active ? 'var(--color-lp-orange)' : 'var(--lp-text-tertiary)' }}
                      />
                      <span
                        className="truncate"
                        style={{ fontSize: '13px', fontWeight: 500, color: 'var(--lp-text)' }}
                      >
                        {p.title || 'Untitled rider'}
                      </span>
                    </div>
                    {updated ? (
                      <div className="mt-0.5 truncate" style={{ fontSize: '11px', color: 'var(--lp-text-tertiary)', paddingLeft: 20 }}>
                        Updated {updated}
                      </div>
                    ) : null}
                    {p.progress && p.progress.sectionsTotal > 0 ? (
                      <div className="mt-1 flex items-center gap-1.5" style={{ paddingLeft: 20 }}>
                        <div
                          className="flex-1 overflow-hidden"
                          style={{ height: 3, borderRadius: 9999, background: 'var(--lp-border-subtle)' }}
                        >
                          <div
                            style={{
                              width: `${Math.round((p.progress.sectionsComplete / p.progress.sectionsTotal) * 100)}%`,
                              height: '100%',
                              background: 'var(--color-lp-status-complete)',
                            }}
                          />
                        </div>
                        <span className="lp-mono shrink-0" style={{ fontSize: '10px', color: 'var(--lp-text-tertiary)' }}>
                          {p.progress.sectionsComplete}/{p.progress.sectionsTotal}
                        </span>
                      </div>
                    ) : null}
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </aside>
  );
}
