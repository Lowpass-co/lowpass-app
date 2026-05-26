'use client';

import Image from 'next/image';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useId, useMemo, useRef, useState } from 'react';
import {
  Building2,
  Check,
  ChevronDown,
  LogOut,
  Package,
  Search,
  Settings,
  SunMoon,
  Users,
} from 'lucide-react';
import { AccountAvatar } from '@/components/shell/AccountAvatar';
import { DarkModeToggle } from '@/components/layout/DarkModeToggle';
import { WorkspaceSwitcher } from '@/components/shell-v2/WorkspaceSwitcher';

type NavItem = {
  label: string;
  href: string;
  activeMatch: (pathname: string) => boolean;
};

/** Sprint 9 §7.4 — workspace-level destinations rebuilt for the
 *  modernised TopBar. "Dashboard" was removed (Product Split moved
 *  Home to /artists/[id]); "Home" now points at /artists. Calendar
 *  link only renders if the route exists (currently false in this
 *  branch — kept in the array but hidden via the `available` flag
 *  consumed by the renderer). Personnel / Equipment continue to
 *  link to existing workspace surfaces. Settings is exposed
 *  explicitly so users have a top-level entry point. */
const WORKSPACE_NAV: NavItem[] = [
  { label: 'Home', href: '/artists', activeMatch: (p) => p === '/' || p.startsWith('/artists') },
  /* IA Cleanup §I3 — Personnel + Equipment removed from
     shell-v1 TopBar nav; they're now workspace dashboard
     tabs (Artists / Personnel / Equipment), reachable
     directly via /personnel and /equipment under the
     (workspace) route group. */
  // Calendar: route doesn't exist yet. Excluded from the array
  // until it does — don't ship dead links.
  { label: 'Settings', href: '/settings', activeMatch: (p) => p.startsWith('/settings') },
];

/** Library dropdown — Phase 1 §D retires this. Contents migrate per
 *  Adam's decision #4: Rider Packs → Operations, Deal Memos → Budget,
 *  Gear → /account/rental (per-user), Templates → retired entirely in
 *  Sprint 12 §7 (artist-level templates now live under
 *  /artists/[id]/{riders,channel-lists}), Venues → /venues,
 *  Performance → deleted entirely. The dropdown UI itself
 *  is hidden below (libraryButton renders null). The state machinery
 *  (libraryRef / libraryOpen) stays so other dropdowns' "close
 *  siblings" handlers don't break — full TopBar retirement happens
 *  when product migrations cut over to <ProductHeader>. */
const LIBRARY_MENU_ITEMS: NavItem[] = [];

export type TopBarTour = {
  id: string;
  name: string;
  status: 'active' | 'archived';
  /** Artist this tour belongs to. Used to group + scope the dropdown. */
  artistId?: string | null;
  artistName?: string | null;
};

export type TopBarProps = {
  logoHref?: string;
  activeTourId?: string;
  tours: TopBarTour[];
  isSiteAdmin?: boolean;
  onTourSelect: (id: string) => void;
  onCreateTour: () => void;
  /** Optional override; defaults to the WORKSPACE_NAV constant above. */
  navItems?: NavItem[];
  onCommandPaletteOpen: () => void;
  user: { name: string; email: string; avatarUrl?: string | null };
  onSignOut?: () => void;
};

function useViewportWidth(): number | undefined {
  const [w, setW] = useState<number | undefined>(undefined);
  useEffect(() => {
    const ro = () => setW(window.innerWidth);
    ro();
    window.addEventListener('resize', ro);
    return () => window.removeEventListener('resize', ro);
  }, []);
  return w;
}

/**
 * Group tours by artistName (preserving the existing date-desc order
 * within each group). Returns ordered group keys + a map of key → tours.
 * Artist names sort alphabetically; "Unassigned" lands at the bottom.
 */
function groupToursByArtist<T extends TopBarTour>(tours: T[]): {
  keys: string[];
  byArtist: Record<string, T[]>;
} {
  const byArtist: Record<string, T[]> = {};
  for (const t of tours) {
    const key = t.artistName?.trim() || 'Unassigned';
    (byArtist[key] ??= []).push(t);
  }
  const keys = Object.keys(byArtist).sort((a, b) => {
    if (a === 'Unassigned') return 1;
    if (b === 'Unassigned') return -1;
    return a.localeCompare(b);
  });
  return { keys, byArtist };
}

function TourGroupHeader({ children }: { children: React.ReactNode }) {
  // F3.2 round 2: more breathing room between artist sub-headers and
  // the rows below; consistent spacing top + sides matches other
  // Lowpass dropdowns (LibraryMenuList, AccountMenuContent).
  return (
    <div
      className="px-3 pb-1.5 pt-3 text-[10px] font-semibold uppercase"
      style={{
        color: 'var(--lp-text-tertiary)',
        letterSpacing: 'var(--lp-tracking-caps, 0.08em)',
      }}
    >
      {children}
    </div>
  );
}

function TourMenuRow({
  tour,
  active,
  muted,
  onClick,
}: {
  tour: TopBarTour;
  active: boolean;
  muted: boolean;
  onClick: () => void;
}) {
  // F3.2 round 2: hover + active styling. Hovered rows tint with
  // surface-hover; the active row picks up an 8% orange tint instead
  // of relying solely on the check icon. Padding bumped to match
  // other dropdowns. Text truncates cleanly with ellipsis at the
  // 320px wrapper cap.
  return (
    <button
      type="button"
      className="lp-tour-menu-row flex w-full min-w-0 items-center gap-2 px-3 py-2 text-left text-sm transition-colors"
      style={{
        color: muted ? 'var(--lp-text-secondary)' : 'var(--lp-text)',
        background: active
          ? 'color-mix(in srgb, var(--color-lp-orange) 8%, transparent)'
          : 'transparent',
      }}
      onMouseEnter={(e) => {
        if (!active) e.currentTarget.style.background = 'var(--lp-surface-hover)';
      }}
      onMouseLeave={(e) => {
        if (!active) e.currentTarget.style.background = 'transparent';
      }}
      onClick={onClick}
    >
      {active ? (
        <Check className="h-4 w-4 shrink-0" style={{ color: 'var(--color-lp-orange)' }} />
      ) : (
        <span aria-hidden className="block h-4 w-4 shrink-0" />
      )}
      <span className={muted ? 'truncate' : 'truncate font-medium'}>{tour.name}</span>
    </button>
  );
}

function TourMenuList({
  tours,
  activeTourId,
  onSelect,
  onNewTour,
  onClose,
}: {
  tours: TopBarTour[];
  activeTourId?: string;
  onSelect: (id: string) => void;
  onNewTour: () => void;
  onClose: () => void;
}) {
  const active = tours.filter((t) => t.status === 'active');
  const archived = tours.filter((t) => t.status === 'archived');

  const activeGroups = groupToursByArtist(active);
  const archivedGroups = groupToursByArtist(archived);

  // Single-artist degenerate case: hide group headers entirely. Operators in
  // a one-artist workspace get the same flat experience as before this
  // sprint; group headers only earn their place when there's a choice.
  const distinctArtists = new Set([
    ...activeGroups.keys.filter((k) => k !== 'Unassigned'),
    ...archivedGroups.keys.filter((k) => k !== 'Unassigned'),
  ]);
  const showGroupHeaders = distinctArtists.size > 1;

  const handle = (id: string) => {
    onSelect(id);
    onClose();
  };

  return (
    <>
      {activeGroups.keys.map((key) => (
        <div key={`active-${key}`}>
          {showGroupHeaders ? <TourGroupHeader>{key}</TourGroupHeader> : null}
          {activeGroups.byArtist[key].map((t) => (
            <TourMenuRow
              key={t.id}
              tour={t}
              active={t.id === activeTourId}
              muted={false}
              onClick={() => handle(t.id)}
            />
          ))}
        </div>
      ))}

      {archived.length > 0 ? (
        <>
          <div className="my-1" style={{ borderTop: '1px solid var(--lp-border)' }} />
          {archivedGroups.keys.map((key) => (
            <div key={`archived-${key}`}>
              {showGroupHeaders ? (
                <TourGroupHeader>{`${key} · Archived`}</TourGroupHeader>
              ) : (
                <TourGroupHeader>Archived</TourGroupHeader>
              )}
              {archivedGroups.byArtist[key].map((t) => (
                <TourMenuRow
                  key={t.id}
                  tour={t}
                  active={t.id === activeTourId}
                  muted
                  onClick={() => handle(t.id)}
                />
              ))}
            </div>
          ))}
        </>
      ) : null}

      <div className="mt-1" style={{ borderTop: '1px solid var(--lp-border)' }} />
      <button
        type="button"
        className="w-full px-3 py-2 text-left text-sm font-medium"
        style={{ color: 'var(--color-lp-orange)' }}
        onClick={() => {
          onNewTour();
          onClose();
        }}
      >
        New tour
      </button>
    </>
  );
}

/**
 * Library dropdown contents. Renders an optional "folded workspace items"
 * group above a divider, then the canonical 6 library items.
 */
function LibraryMenuList({
  foldedItems,
  pathname,
  onClose,
}: {
  foldedItems: NavItem[];
  pathname: string;
  onClose: () => void;
}) {
  const renderItem = (item: NavItem) => {
    const active = item.activeMatch(pathname);
    return (
      <Link
        key={item.href}
        href={item.href}
        className="block px-3 py-2 text-sm"
        style={{
          color: active ? 'var(--lp-text)' : 'var(--lp-text-secondary)',
          background: active ? 'var(--lp-surface-hover)' : 'transparent',
        }}
        onClick={onClose}
      >
        {item.label}
      </Link>
    );
  };

  return (
    <>
      {foldedItems.length > 0 ? (
        <>
          {foldedItems.map(renderItem)}
          <div className="my-1" style={{ borderTop: '1px solid var(--lp-border)' }} />
        </>
      ) : null}
      {LIBRARY_MENU_ITEMS.map(renderItem)}
    </>
  );
}

function AccountMenuContent({
  isSiteAdmin = false,
  onSignOut,
  onClose,
}: {
  isSiteAdmin?: boolean;
  onSignOut?: () => void;
  onClose: () => void;
}) {
  return (
    <>
      <Link
        href="/settings"
        className="block px-3 py-2 text-sm"
        style={{ color: 'var(--lp-text)' }}
        onClick={onClose}
      >
        <span className="inline-flex items-center gap-2">
          <Settings className="h-4 w-4" style={{ color: 'var(--lp-text-tertiary)' }} />
          Settings
        </span>
      </Link>
      <Link
        href="/settings"
        className="block px-3 py-2 text-sm"
        style={{ color: 'var(--lp-text)' }}
        onClick={onClose}
      >
        <span className="inline-flex items-center gap-2">
          <Users className="h-4 w-4" style={{ color: 'var(--lp-text-tertiary)' }} />
          Workspace
        </span>
      </Link>
      {/* IA Cleanup §I3 — Personnel entry retired from the
          shell-v1 account dropdown; Personnel is now a
          workspace dashboard tab reachable from /artists
          via the WorkspaceTabs row. */}
      <div className="my-1" style={{ borderTop: '1px solid var(--lp-border)' }} />
      {/* Sprint 12 §7 — workspace-level /templates page retired.
          Rider + channel-list templates now live under
          /artists/[id]/{riders,channel-lists}. The
          advance_templates / advance_layout_templates /
          advance_schedule_templates tables stay intact and
          power the Advance product as before; the unified
          /templates VIEW over them is what's gone. */}
      <Link
        href="/venues"
        className="block px-3 py-2 text-sm"
        style={{ color: 'var(--lp-text)' }}
        onClick={onClose}
      >
        <span className="inline-flex items-center gap-2">
          <Building2
            className="h-4 w-4"
            style={{ color: 'var(--lp-text-tertiary)' }}
          />
          Venues
        </span>
      </Link>
      <Link
        href="/account/rental"
        className="block px-3 py-2 text-sm"
        style={{ color: 'var(--lp-text)' }}
        onClick={onClose}
      >
        <span className="inline-flex items-center gap-2">
          <Package
            className="h-4 w-4"
            style={{ color: 'var(--lp-text-tertiary)' }}
          />
          Rental
        </span>
      </Link>
      {isSiteAdmin ? (
        <Link
          href="/bugs"
          className="block px-3 py-2 text-sm"
          style={{ color: 'var(--lp-text)' }}
          onClick={onClose}
        >
          <span className="inline-flex items-center gap-2">
            <Settings className="h-4 w-4" style={{ color: 'var(--lp-text-tertiary)' }} />
            Bug Reports
          </span>
        </Link>
      ) : null}
      <div className="my-1" style={{ borderTop: '1px solid var(--lp-border)' }} />
      <div
        className="flex items-center justify-between px-3 py-1.5 text-sm"
        style={{ color: 'var(--lp-text)' }}
      >
        <span className="inline-flex items-center gap-2">
          <SunMoon className="h-4 w-4" style={{ color: 'var(--lp-text-tertiary)' }} />
          Theme
        </span>
        <DarkModeToggle />
      </div>
      <div className="my-1" style={{ borderTop: '1px solid var(--lp-border)' }} />
      <button
        type="button"
        className="w-full px-3 py-2 text-left text-sm"
        style={{ color: 'var(--lp-text)' }}
        onClick={() => {
          onClose();
          onSignOut?.();
        }}
      >
        <span className="inline-flex items-center gap-2">
          <LogOut className="h-4 w-4" style={{ color: 'var(--lp-text-tertiary)' }} />
          Sign out
        </span>
      </button>
    </>
  );
}

export function TopBar({
  logoHref = '/',
  activeTourId,
  tours,
  isSiteAdmin = false,
  onTourSelect,
  onCreateTour,
  navItems = WORKSPACE_NAV,
  onCommandPaletteOpen,
  user,
  onSignOut,
}: TopBarProps) {
  const pathname = usePathname() ?? '';
  const viewportW = useViewportWidth();
  const isMobile = viewportW !== undefined && viewportW < 640;
  const isCompact = viewportW !== undefined && viewportW < 1024;
  const tourBtnId = useId();

  const [tourOpen, setTourOpen] = useState(false);
  const [accountOpen, setAccountOpen] = useState(false);
  const [libraryOpen, setLibraryOpen] = useState(false);
  const tourRef = useRef<HTMLDivElement | null>(null);
  const accountRef = useRef<HTMLDivElement | null>(null);
  const libraryRef = useRef<HTMLDivElement | null>(null);

  const closeAll = () => {
    setTourOpen(false);
    setAccountOpen(false);
    setLibraryOpen(false);
  };

  /**
   * Sprint 9 §13.A.4 — site admins get an extra "Admin" entry
   * appended to the workspace nav. Pathname /admin → active.
   * Only rendered when isSiteAdmin is true; non-admins never
   * see the link (defense in depth — the /admin layout 403s
   * non-admins anyway).
   */
  const navItemsWithAdmin = useMemo<NavItem[]>(() => {
    if (!isSiteAdmin) return navItems;
    return [
      ...navItems,
      {
        label: 'Admin',
        href: '/admin',
        activeMatch: (p) => p === '/admin' || p.startsWith('/admin/'),
      },
    ];
  }, [navItems, isSiteAdmin]);

  /**
   * Top-level workspace items shown directly on the bar.
   * - Desktop (≥1024): all four (Dashboard / Personnel / Calendar / Equipment)
   * - Mid (640–1023): Dashboard + Personnel only (Calendar + Equipment fold into Library)
   * - Mobile (<640): none (everything goes into Library)
   */
  const topLevelItems = useMemo<NavItem[]>(() => {
    if (viewportW === undefined) return navItemsWithAdmin;
    if (isMobile) return [];
    if (isCompact) return navItemsWithAdmin.slice(0, 2);
    return navItemsWithAdmin;
  }, [navItemsWithAdmin, viewportW, isMobile, isCompact]);

  /** Workspace items to fold INTO the Library dropdown (above a divider). */
  const foldedWorkspaceItems = useMemo<NavItem[]>(() => {
    if (viewportW === undefined) return [];
    if (isMobile) return navItemsWithAdmin;
    if (isCompact) return navItemsWithAdmin.slice(2);
    return [];
  }, [navItemsWithAdmin, viewportW, isMobile, isCompact]);

  /** Library button is active when pathname matches any of its dropdown items. */
  const libraryActive = useMemo(() => {
    return (
      LIBRARY_MENU_ITEMS.some((it) => it.activeMatch(pathname)) ||
      foldedWorkspaceItems.some((it) => it.activeMatch(pathname))
    );
  }, [pathname, foldedWorkspaceItems]);

  useEffect(() => {
    const onDoc = (e: MouseEvent) => {
      const t = e.target as Node;
      if (tourRef.current && !tourRef.current.contains(t)) setTourOpen(false);
      if (accountRef.current && !accountRef.current.contains(t)) setAccountOpen(false);
      if (libraryRef.current && !libraryRef.current.contains(t)) setLibraryOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') closeAll();
    };
    document.addEventListener('mousedown', onDoc);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDoc);
      document.removeEventListener('keydown', onKey);
    };
  }, []);

  // ⌘K listener lives in AppShell (UX08b) so the keyboard shortcut works
  // whether or not the TopBar is mounted. The trigger button still calls
  // `onCommandPaletteOpen` which routes through CommandPaletteContext.

  const activeTour = tours.find((t) => t.id === activeTourId);
  const displayTourName = activeTour?.name ?? 'Select tour';

  // Phase 1 §D: Library dropdown retired — render nothing. The
  // unrendered branch below stays in source so other onClick handlers
  // that reference setLibraryOpen still typecheck; full removal lands
  // when each product migrates onto <ProductHeader> (Phases 2-4).
  const libraryButton: React.ReactNode = null;
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const _retiredLibraryButton = (
    <div className="relative" ref={libraryRef}>
      <button
        type="button"
        onClick={() => {
          setLibraryOpen((o) => !o);
          setTourOpen(false);
          setAccountOpen(false);
        }}
        // No rounded-* on this button — bottom corners stay square so the
        // active 2px orange underline runs edge-to-edge instead of tapering
        // into a rounded corner (which is what made the previous render
        // read as a glow "behind" the text). Transparent border on the
        // inactive state holds the same height so toggling active doesn't
        // jolt the row.
        className="btn-transition flex items-center gap-1.5 px-3 py-2 text-sm font-medium"
        style={{
          color: libraryActive ? 'var(--lp-text)' : 'var(--lp-text-secondary)',
          borderBottom: libraryActive
            ? '2px solid var(--color-lp-orange)'
            : '2px solid transparent',
          background: libraryActive
            ? 'color-mix(in srgb, var(--color-lp-orange) 6%, transparent)'
            : 'transparent',
        }}
        onMouseEnter={(e) => {
          if (!libraryActive) {
            e.currentTarget.style.color = 'var(--lp-text)';
            e.currentTarget.style.background = 'var(--lp-surface-hover)';
          }
        }}
        onMouseLeave={(e) => {
          if (!libraryActive) {
            e.currentTarget.style.color = 'var(--lp-text-secondary)';
            e.currentTarget.style.background = 'transparent';
          }
        }}
        aria-expanded={libraryOpen}
        aria-haspopup="menu"
      >
        Library
        <ChevronDown className="h-3.5 w-3.5" style={{ color: 'var(--lp-text-tertiary)' }} />
      </button>
      {libraryOpen && (
        <div
          className="lp-dropdown-layer absolute right-0 mt-1 w-56 rounded-xl border py-1 shadow-lg"
          style={{
            zIndex: 'var(--lp-z-dropdown)',
            background: 'var(--lp-surface)',
            borderColor: 'var(--lp-border)',
          }}
          role="menu"
        >
          <LibraryMenuList
            foldedItems={foldedWorkspaceItems}
            pathname={pathname}
            onClose={() => setLibraryOpen(false)}
          />
        </div>
      )}
    </div>
  );

  return (
    <header
      className="lp-shell-topbar"
      style={{
        position: 'sticky',
        top: 0,
        zIndex: 'var(--lp-z-sticky)',
        background: 'var(--lp-bg)',
        borderBottom: '1px solid var(--lp-border)',
        boxShadow: 'var(--lp-shadow-xs)',
      }}
    >
      {isMobile ? (
        <div
          className="flex w-full min-w-0 items-center justify-between gap-1"
          style={{ height: 'var(--lp-topbar-height)', padding: `0 var(--lp-content-padding-x)` }}
        >
          <div className="flex min-w-0 items-center gap-1">
            <Link href={logoHref} className="shrink-0" aria-label="Home">
              <Image src="/lowpass-logo.png" alt="" width={48} height={40} className="h-8 w-auto" />
            </Link>
            <div className="relative" ref={tourRef}>
              <button
                type="button"
                className="flex h-9 w-9 items-center justify-center rounded-md border"
                style={{ borderColor: 'var(--lp-border)', color: 'var(--lp-text)' }}
                onClick={() => {
                  setTourOpen((o) => !o);
                  setAccountOpen(false);
                  setLibraryOpen(false);
                }}
                aria-expanded={tourOpen}
                aria-haspopup="listbox"
                aria-label="Tours"
              >
                <ChevronDown className="h-4 w-4" style={{ color: 'var(--lp-text-secondary)' }} />
              </button>
              {tourOpen && (
                <div
                  className="lp-dropdown-layer absolute left-0 mt-1 min-w-56 max-w-[90vw] rounded-xl border py-1 shadow-lg"
                  style={{
                    zIndex: 'var(--lp-z-dropdown)',
                    background: 'var(--lp-surface)',
                    borderColor: 'var(--lp-border)',
                  }}
                  role="listbox"
                >
                  <TourMenuList
                    tours={tours}
                    activeTourId={activeTourId}
                    onSelect={onTourSelect}
                    onNewTour={onCreateTour}
                    onClose={() => setTourOpen(false)}
                  />
                </div>
              )}
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-0.5">
            {libraryButton}
            <button
              type="button"
              onClick={onCommandPaletteOpen}
              className="btn-transition flex h-9 w-9 items-center justify-center rounded-md border"
              style={{ borderColor: 'var(--lp-border)', color: 'var(--lp-text-secondary)' }}
              aria-label="Open search"
            >
              <Search className="h-4 w-4" />
            </button>
            <div className="relative" ref={accountRef}>
              <button
                type="button"
                onClick={() => {
                  setAccountOpen((o) => !o);
                  setTourOpen(false);
                  setLibraryOpen(false);
                }}
                className="btn-transition flex h-9 w-9 items-center justify-center overflow-hidden rounded-full border"
                style={{ borderColor: 'var(--lp-border)' }}
                aria-label="Account"
                aria-haspopup="menu"
                aria-expanded={accountOpen}
              >
                <AccountAvatar user={user} size={32} />
              </button>
              {accountOpen && (
                <div
                  className="lp-dropdown-layer absolute right-0 mt-1 w-48 rounded-xl border py-1"
                  style={{
                    zIndex: 'var(--lp-z-dropdown)',
                    background: 'var(--lp-surface)',
                    borderColor: 'var(--lp-border)',
                  }}
                  role="menu"
                >
                  <AccountMenuContent isSiteAdmin={isSiteAdmin} onSignOut={onSignOut} onClose={() => setAccountOpen(false)} />
                </div>
              )}
            </div>
          </div>
        </div>
      ) : (
        <div
          className="flex w-full min-w-0 items-center justify-between gap-4"
          style={{ height: 'var(--lp-topbar-height)', padding: `0 var(--lp-content-padding-x)` }}
        >
          <div className="flex min-w-0 flex-1 items-center gap-4">
            <Link href={logoHref} className="shrink-0" aria-label="Home">
              <Image src="/lowpass-logo.png" alt="Lowpass" width={64} height={50} className="h-9 w-auto" />
            </Link>
            {/* Sprint 9 §13.A.2 — workspace switcher inline in
                the TopBar (the AppShell-level slot it used to
                share with the artist/tour switcher was removed
                to kill the duplicate-bar). Shell-v1 routes
                (/personnel, /settings, /admin, /equipment) are
                workspace-scoped so they don't carry the artist/
                tour switcher; only the workspace switcher lands
                here. */}
            <WorkspaceSwitcher />
            <span
              aria-hidden
              style={{
                width: 1,
                height: 20,
                background: 'var(--lp-border-subtle)',
              }}
            />
            <div className="relative" ref={tourRef}>
              <button
                type="button"
                id={tourBtnId}
                className="btn-transition flex max-w-[200px] min-w-0 items-center gap-2 rounded-md border px-2 py-1.5 text-left text-sm font-medium"
                style={{ borderColor: 'var(--lp-border)', color: 'var(--lp-text)' }}
                onClick={() => {
                  setTourOpen((o) => !o);
                  setAccountOpen(false);
                  setLibraryOpen(false);
                }}
                aria-expanded={tourOpen}
                aria-haspopup="listbox"
              >
                <span className="truncate">{displayTourName}</span>
                <ChevronDown className="h-4 w-4 shrink-0" style={{ color: 'var(--lp-text-secondary)' }} />
              </button>
              {tourOpen && (
                <div
                  className="lp-dropdown-layer absolute left-0 mt-1 min-w-72 max-w-[20rem] overflow-hidden rounded-xl border py-1 shadow-lg"
                  style={{
                    zIndex: 'var(--lp-z-dropdown)',
                    background: 'var(--lp-surface)',
                    borderColor: 'var(--lp-border)',
                  }}
                  role="listbox"
                  aria-labelledby={tourBtnId}
                >
                  <TourMenuList
                    tours={tours}
                    activeTourId={activeTourId}
                    onSelect={onTourSelect}
                    onNewTour={onCreateTour}
                    onClose={() => setTourOpen(false)}
                  />
                </div>
              )}
            </div>
            <nav className="flex min-w-0 items-center gap-1" aria-label="Main">
              {topLevelItems.map((item) => {
                const active = item.activeMatch(pathname);
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    /* Sprint 9 §7.4 — visual style aligned with
                       OperationsSubNav: orange text + 2px underline
                       when active, secondary text otherwise, hover
                       to var(--lp-text). No background tint —
                       sub-nav style is underline only. */
                    className="btn-transition px-3 py-2 text-sm"
                    style={{
                      color: active
                        ? 'var(--color-lp-orange)'
                        : 'var(--lp-text-secondary)',
                      fontWeight: active
                        ? 'var(--lp-weight-semibold)'
                        : 'var(--lp-weight-medium)',
                      borderBottom: active
                        ? '2px solid var(--color-lp-orange)'
                        : '2px solid transparent',
                      background: 'transparent',
                    }}
                    onMouseEnter={(e) => {
                      if (!active) {
                        e.currentTarget.style.color = 'var(--lp-text)';
                      }
                    }}
                    onMouseLeave={(e) => {
                      if (!active) {
                        e.currentTarget.style.color = 'var(--lp-text-secondary)';
                      }
                    }}
                  >
                    {item.label}
                  </Link>
                );
              })}
              {libraryButton}
            </nav>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <button
              type="button"
              onClick={onCommandPaletteOpen}
              className="btn-transition flex min-w-0 max-w-full items-center justify-between gap-2 rounded-md border px-3 py-2 text-left"
              style={{
                width: 'var(--lp-search-trigger-width)',
                borderColor: 'var(--lp-border)',
                color: 'var(--lp-text-secondary)',
                background: 'var(--lp-bg-secondary)',
              }}
              aria-label="Open command palette"
            >
              <span className="inline-flex min-w-0 items-center gap-2">
                <Search className="h-4 w-4 shrink-0" />
                <span className="truncate text-sm">Search…</span>
              </span>
              <kbd
                className="pointer-events-none hidden select-none rounded border px-1.5 py-0.5 font-mono sm:inline"
                style={{
                  fontSize: 'var(--lp-text-2xs)',
                  borderColor: 'var(--lp-border)',
                  color: 'var(--lp-text-tertiary)',
                  background: 'var(--lp-surface)',
                }}
              >
                ⌘K
              </kbd>
            </button>
            {/* Sprint 9 §13.A.3 — ADMIN pill is now a sibling
                element between the Search trigger and the user
                pill, not nested inside the user button. Per Q2:
                "outside the user-pill button, on its left." */}
            {isSiteAdmin ? (
              <span
                className="lp-label-caps"
                title="You have site admin access — visible across all workspaces"
                style={{
                  flexShrink: 0,
                  padding: '2px 8px',
                  fontSize: 'var(--lp-text-2xs)',
                  fontWeight: 'var(--lp-weight-semibold)',
                  color: 'var(--lp-text)',
                  background: 'var(--lp-bg-tertiary)',
                  border: '1px solid var(--lp-border-subtle)',
                  borderRadius: 999,
                }}
              >
                Admin
              </span>
            ) : null}
            <div className="relative" ref={accountRef}>
              <button
                type="button"
                onClick={() => {
                  setAccountOpen((o) => !o);
                  setTourOpen(false);
                  setLibraryOpen(false);
                }}
                className="btn-transition flex max-w-[200px] min-w-0 items-center gap-2 rounded-md border px-2 py-1.5"
                style={{ borderColor: 'var(--lp-border)', color: 'var(--lp-text)' }}
                aria-label="Account menu"
                aria-haspopup="menu"
                aria-expanded={accountOpen}
              >
                <AccountAvatar user={user} size={28} />
                <span className="truncate text-sm font-medium">{user.name}</span>
              </button>
              {accountOpen && (
                <div
                  className="absolute right-0 mt-1 w-56 rounded-xl border py-1"
                  style={{
                    zIndex: 'var(--lp-z-dropdown)',
                    background: 'var(--lp-surface)',
                    borderColor: 'var(--lp-border)',
                  }}
                  role="menu"
                >
                  <AccountMenuContent isSiteAdmin={isSiteAdmin} onSignOut={onSignOut} onClose={() => setAccountOpen(false)} />
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </header>
  );
}
