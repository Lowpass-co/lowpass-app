import type { CSSProperties, ReactNode } from 'react';

export type PageShellArchetype = 'list' | 'spreadsheet' | 'dashboard' | 'document' | 'builder';

export type PageShellProps = {
  topBar: ReactNode;
  /** `null` omits the rail column (e.g. variant `none`). */
  leftRail: ReactNode | null;
  archetype: PageShellArchetype;
  children: ReactNode;
};

/**
 * Canonical app layout: TopBar + optional LeftRail + main. Server component.
 * Used by `app-page-shells` on each route; see `app/(app)/layout.tsx` for global providers.
 */
export function PageShell({ topBar, leftRail, archetype, children }: PageShellProps) {
  const hasRail = leftRail != null;
  const padded =
    archetype === 'list' || archetype === 'dashboard' || archetype === 'document';

  const mainStyle: CSSProperties = {
    overflowY: 'auto',
    overflowX: 'hidden',
    minHeight: 0,
    minWidth: 0,
    flex: 1,
  };

  if (padded) {
    mainStyle.padding = 'var(--lp-content-padding-y) var(--lp-content-padding-x)';
    mainStyle.maxWidth = 'var(--lp-content-max-width)';
    mainStyle.marginLeft = 'auto';
    mainStyle.marginRight = 'auto';
    mainStyle.width = '100%';
  }

  return (
    <div
      style={{
        minHeight: '100vh',
        display: 'grid',
        gridTemplateRows: 'var(--lp-topbar-height) minmax(0, 1fr)',
      }}
    >
      <div style={{ gridRow: 1, minHeight: 0 }}>{topBar}</div>
      <div
        className="flex min-h-0 min-w-0 flex-1 flex-col md:flex-row"
        style={{ gridRow: 2 }}
      >
        {hasRail && (
          <div className="hidden min-h-0 shrink-0 md:block">{leftRail}</div>
        )}
        <main style={mainStyle}>{children}</main>
      </div>
    </div>
  );
}
