/* ============================================
   LOWPASS — <AppShellV3> (S-1)

   The canonical shell: top bar + nav rail + content. One component for every
   scope, because the differences between scopes are DATA (ia.ts), not markup.

   SERVER COMPONENT. It resolves scope, mode and active item from the pathname it
   is handed and passes the result down; only the rail's collapse state and the
   picker are client. That ordering is the deep-link requirement made structural
   — the shell cannot depend on ambient client state because, on the server,
   there isn't any. A cold load of /budget/[id]/settlement renders Money mode
   with Settlements active in the FIRST response, before React hydrates.

   The pathname is passed in rather than read from a hook: server components
   have no usePathname, and threading it from each layout keeps the resolution
   honest — every mount states which URL it is rendering.

   COEXISTING WITH THE DAY RAIL (R5): `denseRail` starts this rail collapsed on
   pages that carry a <RoutingRail>. Two full-width rails at 1440 leaves ~950px
   of content, which is not enough for the routing ledger. The app rail is a
   glance ("where am I"); the day rail is a working surface. So the glance
   shrinks and the work keeps its width — and because collapse is user-persisted,
   anyone who disagrees can expand it and it stays expanded.
   ============================================ */

import {
  resolveScope,
  activeItemFor,
  railFor,
  upFrom,
  SCOPE_LABEL,
  MODE_LABEL,
} from '@/lib/nav/ia';
import { NavRail } from './NavRail';
import { TopBarV3 } from './TopBarV3';

export interface AppShellV3Props {
  /** The URL being rendered. Everything else is derived from it. */
  pathname: string;
  /** Query string, for the budget tabs (?tab=). Include the leading '?'. */
  search?: string;
  workspaceName?: string;
  /** The ONE picker, supplied by the layout that has its server data. */
  switcher?: React.ReactNode;
  /** Known at tour scope from server data — the path doesn't carry it. */
  artistId?: string | null;
  badges?: Record<string, string | number | null | undefined>;
  /** Collapse the nav rail by default (pages with a day rail). */
  denseRail?: boolean;
  /** Avatar / actions, far right of the top bar. */
  headerRight?: React.ReactNode;
  children: React.ReactNode;
}

export function AppShellV3({
  pathname,
  search = '',
  workspaceName = 'Workspace',
  switcher,
  artistId,
  badges,
  denseRail = false,
  headerRight,
  children,
}: AppShellV3Props) {
  /* Derived, in this order, from the URL and nothing else. */
  const base = resolveScope(pathname, search);
  const ctx = { ...base, artistId: base.artistId ?? artistId ?? null };
  const activeId = activeItemFor(pathname, search);
  const entries = railFor(ctx.scope, ctx.mode);
  const up = upFrom(ctx);

  /* At tour scope the rail head names the MODE ("TOUR" / "MONEY" /
     "PRODUCTION"), matching the mock — the pill and the rail agree on where you
     are. Elsewhere it names the scope. */
  const scopeLabel =
    ctx.scope === 'tour' && ctx.mode ? MODE_LABEL[ctx.mode].toUpperCase() : SCOPE_LABEL[ctx.scope].toUpperCase();

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100dvh', minHeight: 0 }}>
      <TopBarV3
        ctx={ctx}
        workspaceName={workspaceName}
        switcher={switcher}
        right={headerRight}
      />
      <div style={{ display: 'flex', flex: 1, minHeight: 0 }}>
        <NavRail
          entries={entries}
          ctx={ctx}
          activeId={activeId}
          scopeLabel={scopeLabel}
          up={up}
          badges={badges}
          defaultCollapsed={denseRail}
        />
        <main style={{ flex: 1, minWidth: 0, minHeight: 0, overflow: 'auto' }}>{children}</main>
      </div>
    </div>
  );
}
