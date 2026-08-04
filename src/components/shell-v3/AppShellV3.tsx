'use client';

/* ============================================
   LOWPASS — <AppShellV3> (S-1 · client since S-3b fix)

   The canonical shell: top bar + nav rail + content. One component for every
   scope, because the differences between scopes are DATA (ia.ts), not markup.

   CLIENT COMPONENT, deliberately, since the S-3b highlight fix. It began life
   as a server component fed a pathname by its layout — which was correct for a
   COLD load and silently wrong for every navigation after it: Next does NOT
   re-render a layout on soft navigation between pages inside it, so the rail's
   active item, the mode pill, and even WHICH rail (Tour/Money/Production)
   froze at whatever URL the layout first mounted on. The smoke items that
   would have caught it (SHELL-08, -21) sat in the "nobody has checked these"
   list from S-1 until Adam walked the S-3b build.

   The fix keeps the deep-link contract and adds the live one:

   · SSR / cold load — usePathname()/useSearchParams() resolve on the server
     for client components, so the FIRST paint still derives everything from
     the request URL. Nothing ambient, nothing hydrated-in-late.
   · Soft navigation — the hooks update, the pure resolvers in ia.ts rerun,
     and the chrome follows the URL. The resolvers are plain functions with no
     server dependency, so the client importing them directly is exactly as
     honest as the server calling them was — the RSC serialisation boundary
     (see ia.ts) exists for DATA CROSSING, and here nothing crosses.
   · The `pathname`/`search` props remain as the fallback when the hooks
     return null (jsdom, and any render outside a router). Every mount still
     states which URL it believes it is rendering.

   COEXISTING WITH THE DAY RAIL (R5): `denseRail` starts this rail collapsed on
   pages that carry their own rail. Since the fix it is ALSO recomputed live
   from hasOwnRail(pathname) — riders list → rider editor is a same-layout
   navigation, so the prop alone would freeze at the list's answer.
   ============================================ */

import { usePathname, useSearchParams } from 'next/navigation';
import {
  resolveScope, resolveRailView, upFrom, productForPath, hasOwnRail,
  SCOPE_LABEL, MODE_LABEL,
} from '@/lib/nav/ia';
import { RememberTourProduct } from '@/components/shell-v2/RememberTourProduct';
import { NavRail } from './NavRail';
import { TopBarV3 } from './TopBarV3';

export interface AppShellV3Props {
  /** The URL at mount — SSR/test fallback; the live URL comes from the router. */
  pathname: string;
  /** Query string, for the budget tabs (?tab=). Include the leading '?'. */
  search?: string;
  workspaceName?: string;
  /** The ONE picker, supplied by the layout that has its server data. */
  switcher?: React.ReactNode;
  /** Known at tour scope from server data — the path doesn't carry it. */
  artistId?: string | null;
  badges?: Record<string, string | number | null | undefined>;
  /** P-1 — resource ids this caller may read. `null`/absent = don't filter. */
  visibleResources?: readonly string[] | null;
  /** Collapse the nav rail by default (pages with a day rail). Live-computed
   *  from hasOwnRail() as well; this prop forces it on regardless of path. */
  denseRail?: boolean;
  /** Avatar / actions, far right of the top bar. */
  headerRight?: React.ReactNode;
  /** S-3b — tourless product landing: greyed (disabled) mode pill + picker in
   *  the top bar, workspace rail fully visible. See TopBarV3. */
  landing?: boolean;
  children: React.ReactNode;
}

export function AppShellV3({
  pathname: pathnameProp,
  search: searchProp = '',
  workspaceName = 'Workspace',
  switcher,
  artistId,
  badges,
  visibleResources = null,
  denseRail = false,
  headerRight,
  landing = false,
  children,
}: AppShellV3Props) {
  /* THE LIVE URL. On the server render these resolve from the request, so the
     cold-load contract is unchanged; on the client they follow every soft
     navigation, which is the whole point of the S-3b fix. Null (no router —
     jsdom) falls back to the mount props. */
  const livePathname = usePathname();
  const liveSearch = useSearchParams();
  const pathname = livePathname ?? pathnameProp;
  const search =
    liveSearch != null
      ? (liveSearch.toString() ? `?${liveSearch.toString()}` : '')
      : searchProp;

  /* Derived, in this order, from the URL and nothing else. */
  const base = resolveScope(pathname, search);
  const ctx = { ...base, artistId: base.artistId ?? artistId ?? null };
  /* Hrefs built, matchers run, badges read — on every URL change now, not once
     per layout mount. resolveRailView returns plain data either way. */
  const entries = resolveRailView(ctx, pathname, search, badges ?? {}, visibleResources);
  const up = upFrom(ctx);

  /* At tour scope the rail head names the MODE ("TOUR" / "MONEY" /
     "PRODUCTION"), matching the mock — the pill and the rail agree on where you
     are. Elsewhere it names the scope. */
  const scopeLabel =
    ctx.scope === 'tour' && ctx.mode ? MODE_LABEL[ctx.mode].toUpperCase() : SCOPE_LABEL[ctx.scope].toUpperCase();

  /* S-2a — "open this tour where I left it". One zero-render island; now keyed
     to the live URL so product memory tracks navigation too. */
  const product = ctx.scope === 'tour' && ctx.tourId ? productForPath(pathname) : null;

  /* Collapse where the CURRENT page carries a rail of its own — the prop alone
     goes stale on same-layout navigation (riders list → rider editor). */
  const dense = denseRail || hasOwnRail(pathname);

  return (
    <div
      style={{
        display: 'flex', flexDirection: 'column', height: '100dvh', minHeight: 0,
        /* Same frame the old shell painted: h-screen, overflow hidden, <main>
           the only scroll surface — so sticky headers inside a page body still
           anchor to <main> and not to the document. */
        overflow: 'hidden',
        background: 'var(--lp-bg)',
        color: 'var(--lp-text)',
      }}
    >
      {product && ctx.tourId ? <RememberTourProduct tourId={ctx.tourId} product={product} /> : null}
      <TopBarV3
        ctx={ctx}
        workspaceName={workspaceName}
        switcher={switcher}
        right={headerRight}
        landing={landing}
      />
      <div style={{ display: 'flex', flex: 1, minHeight: 0 }}>
        <NavRail
          entries={entries}
          scopeLabel={scopeLabel}
          up={up}
          defaultCollapsed={dense}
        />
        <main style={{ flex: 1, minWidth: 0, minHeight: 0, overflow: 'auto', background: 'var(--lp-bg)' }}>
          {children}
        </main>
      </div>
    </div>
  );
}
