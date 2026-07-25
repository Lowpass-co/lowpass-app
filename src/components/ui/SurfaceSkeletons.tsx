/* ============================================
   LOWPASS — per-surface loading compositions (F-3a)

   Each surface's skeleton, assembled from the <Skeleton> primitives — matching
   that surface's REAL final layout so nothing jumps when data lands. All of them
   go through <SkeletonBlock>, so every one announces itself to assistive tech and
   picks up the ~10s "server is waking up" line for free.

   These live together on purpose: it keeps the shapes comparable, makes it obvious
   when a new surface needs one, and stops per-surface bespoke loaders from
   reappearing. If a surface's layout changes, its skeleton is one edit away.
   ============================================ */

'use client';

import { SkeletonBlock, SkeletonCard, SkeletonGrid, SkeletonText, Skeleton } from './Skeleton';

/** Routing ledger — real 46px rows on the ledger's own column grammar.
 *  Only the UNSEEDED path can reach this now: once the page seeds initialRows
 *  (F-3b) the ledger paints from the server payload and never shows a loader. */
export function RoutingLedgerSkeleton({ rows = 10 }: { rows?: number }) {
  return (
    <SkeletonBlock label="Loading routing">
      <SkeletonGrid
        rows={rows}
        rowHeight={46}
        columns={['118px', '108px', 'minmax(0,1fr)', '170px', '130px', '88px']}
      />
    </SkeletonBlock>
  );
}

/** Personnel — the rates mirror is a dense name/role/rate table. */
export function PersonnelSkeleton({ rows = 8 }: { rows?: number }) {
  return (
    <SkeletonBlock label="Loading personnel">
      <SkeletonGrid rows={rows} rowHeight={40} columns={['minmax(0,1fr)', '140px', '120px', '100px']} />
    </SkeletonBlock>
  );
}

/** Payroll — two-grid surface; wider numeric columns. */
export function PayrollSkeleton({ rows = 8 }: { rows?: number }) {
  return (
    <SkeletonBlock label="Loading payroll">
      <SkeletonGrid rows={rows} rowHeight={40} columns={['minmax(0,1fr)', '110px', '110px', '110px', '110px']} />
    </SkeletonBlock>
  );
}

/** Budget grids — spreadsheet shape, tighter rows. */
export function BudgetGridSkeleton({ rows = 10 }: { rows?: number }) {
  return (
    <SkeletonBlock label="Loading budget">
      <SkeletonGrid rows={rows} rowHeight={36} columns={['minmax(0,1fr)', '120px', '120px', '90px']} />
    </SkeletonBlock>
  );
}

/** Day — the three-zone surface: rail · schedule · stacked cards. */
export function DaySkeleton() {
  return (
    <SkeletonBlock label="Loading day">
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'minmax(220px, 260px) minmax(0, 1fr) minmax(260px, 320px)',
          gap: 'var(--lp-space-4)',
          alignItems: 'start',
        }}
      >
        <SkeletonGrid rows={8} rowHeight={52} columns={['46px', 'minmax(0,1fr)']} />
        <SkeletonCard lines={8} minHeight={240} />
        <div style={{ display: 'grid', gap: 'var(--lp-space-4)' }}>
          <SkeletonCard lines={3} />
          <SkeletonCard lines={3} />
        </div>
      </div>
    </SkeletonBlock>
  );
}

/** Advance — section accordion: a stack of panel blocks. */
export function AdvanceSkeleton({ sections = 4 }: { sections?: number }) {
  return (
    <SkeletonBlock label="Loading advance">
      <div style={{ display: 'grid', gap: 'var(--lp-space-3)' }}>
        {Array.from({ length: sections }, (_, i) => (
          <SkeletonCard key={i} lines={i === 0 ? 4 : 2} />
        ))}
      </div>
    </SkeletonBlock>
  );
}

/** Assets / equipment — card list with a leading meta line. */
export function AssetsSkeleton({ cards = 5 }: { cards?: number }) {
  return (
    <SkeletonBlock label="Loading assets">
      <div style={{ display: 'grid', gap: 'var(--lp-space-3)' }}>
        <Skeleton height={11} width={160} />
        {Array.from({ length: cards }, (_, i) => (
          <SkeletonCard key={i} lines={2} />
        ))}
      </div>
    </SkeletonBlock>
  );
}

/** Rooming — matrix/cards; nights down the side. */
export function RoomingSkeleton({ rows = 8 }: { rows?: number }) {
  return (
    <SkeletonBlock label="Loading rooming">
      <SkeletonGrid rows={rows} rowHeight={44} columns={['160px', 'minmax(0,1fr)', '120px']} />
    </SkeletonBlock>
  );
}

/** Small inline panel loader — for slide-overs and side panels. */
export function PanelSkeleton({ lines = 4, label = 'Loading' }: { lines?: number; label?: string }) {
  return (
    <SkeletonBlock label={label}>
      <div style={{ padding: 'var(--lp-space-4)' }}>
        <SkeletonText lines={lines} />
      </div>
    </SkeletonBlock>
  );
}
