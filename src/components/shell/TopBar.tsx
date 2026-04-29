'use client';

import Image from 'next/image';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useId, useMemo, useRef, useState } from 'react';
import {
  Check,
  ChevronDown,
  LogOut,
  Search,
  Settings,
  User,
  Users,
} from 'lucide-react';

type NavItem = {
  label: string;
  href: string;
  activeMatch: (pathname: string) => boolean;
};

/** Workspace-level destinations — top-level on desktop, fold into Library on narrow viewports. */
const WORKSPACE_NAV: NavItem[] = [
  { label: 'Dashboard', href: '/dashboard', activeMatch: (p) => p === '/dashboard' || p === '/' },
  { label: 'Personnel', href: '/personnel', activeMatch: (p) => p.startsWith('/personnel') },
  { label: 'Calendar', href: '/calendar', activeMatch: (p) => p.startsWith('/calendar') },
  { label: 'Equipment', href: '/equipment', activeMatch: (p) => p.startsWith('/equipment') },
];

/** Library dropdown — always reached through the Library button; never on the top bar surface. */
const LIBRARY_MENU_ITEMS: NavItem[] = [
  { label: 'Rider Packs', href: '/rider-packs', activeMatch: (p) => p.startsWith('/rider-packs') },
  { label: 'Deal Memos', href: '/library/deal-memos', activeMatch: (p) => p.startsWith('/library/deal-memos') },
  { label: 'Gear', href: '/gear', activeMatch: (p) => p.startsWith('/gear') },
  { label: 'Templates', href: '/templates', activeMatch: (p) => p.startsWith('/templates') },
  { label: 'Performance', href: '/performance', activeMatch: (p) => p.startsWith('/performance') },
  { label: 'Venues', href: '/venues', activeMatch: (p) => p.startsWith('/venues') },
];

export type TopBarProps = {
  logoHref?: string;
  activeTourId?: string;
  tours: Array<{ id: string; name: string; status: 'active' | 'archived' }>;
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

function TourMenuList({
  tours,
  activeTourId,
  onSelect,
  onNewTour,
  onClose,
}: {
  tours: Array<{ id: string; name: string; status: 'active' | 'archived' }>;
  activeTourId?: string;
  onSelect: (id: string) => void;
  onNewTour: () => void;
  onClose: () => void;
}) {
  const active = tours.filter((t) => t.status === 'active');
  const archived = tours.filter((t) => t.status === 'archived');
  return (
    <>
      {active.map((t) => (
        <button
          key={t.id}
          type="button"
          className="flex w-full min-w-0 items-center gap-2 px-3 py-2 text-left text-sm"
          style={{ color: 'var(--lp-text)' }}
          onClick={() => {
            onSelect(t.id);
            onClose();
          }}
        >
          {t.id === activeTourId && (
            <Check className="h-4 w-4 shrink-0" style={{ color: 'var(--color-lp-orange)' }} />
          )}
          <span className="truncate font-medium">{t.name}</span>
        </button>
      ))}
      {archived.length > 0 && (
        <div
          className="px-3 py-1 text-xs font-semibold uppercase"
          style={{ color: 'var(--lp-text-tertiary)', letterSpacing: 'var(--lp-tracking-caps)' }}
        >
          Archived
        </div>
      )}
      {archived.map((t) => (
        <button
          key={t.id}
          type="button"
          className="flex w-full min-w-0 items-center gap-2 px-3 py-2 text-left text-sm"
          style={{ color: 'var(--lp-text-secondary)' }}
          onClick={() => {
            onSelect(t.id);
            onClose();
          }}
        >
          {t.id === activeTourId && <Check className="h-4 w-4" />}
          <span className="truncate">{t.name}</span>
        </button>
      ))}
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
  onSignOut,
  onClose,
}: {
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
  logoHref = '/dashboard',
  activeTourId,
  tours,
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
   * Top-level workspace items shown directly on the bar.
   * - Desktop (≥1024): all four (Dashboard / Personnel / Calendar / Equipment)
   * - Mid (640–1023): Dashboard + Personnel only (Calendar + Equipment fold into Library)
   * - Mobile (<640): none (everything goes into Library)
   */
  const topLevelItems = useMemo<NavItem[]>(() => {
    if (viewportW === undefined) return navItems;
    if (isMobile) return [];
    if (isCompact) return navItems.slice(0, 2);
    return navItems;
  }, [navItems, viewportW, isMobile, isCompact]);

  /** Workspace items to fold INTO the Library dropdown (above a divider). */
  const foldedWorkspaceItems = useMemo<NavItem[]>(() => {
    if (viewportW === undefined) return [];
    if (isMobile) return navItems;
    if (isCompact) return navItems.slice(2);
    return [];
  }, [navItems, viewportW, isMobile, isCompact]);

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

  useEffect(() => {
    const onK = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && (e.key === 'k' || e.key === 'K')) {
        e.preventDefault();
        onCommandPaletteOpen();
      }
    };
    document.addEventListener('keydown', onK);
    return () => document.removeEventListener('keydown', onK);
  }, [onCommandPaletteOpen]);

  const activeTour = tours.find((t) => t.id === activeTourId);
  const displayTourName = activeTour?.name ?? 'Select tour';

  const libraryButton = (
    <div className="relative" ref={libraryRef}>
      <button
        type="button"
        onClick={() => {
          setLibraryOpen((o) => !o);
          setTourOpen(false);
          setAccountOpen(false);
        }}
        className="btn-transition flex items-center gap-1.5 rounded-md px-3 py-2 text-sm font-medium"
        style={
          libraryActive
            ? {
                color: 'var(--lp-text)',
                borderBottom: '2px solid var(--color-lp-orange)',
              }
            : { color: 'var(--lp-text-secondary)' }
        }
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
                {user.avatarUrl ? (
                  <Image
                    src={user.avatarUrl}
                    alt=""
                    width={32}
                    height={32}
                    className="h-full w-full object-cover"
                  />
                ) : (
                  <User className="h-4 w-4" style={{ color: 'var(--lp-text-secondary)' }} />
                )}
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
                  <AccountMenuContent onSignOut={onSignOut} onClose={() => setAccountOpen(false)} />
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
                  className="lp-dropdown-layer absolute left-0 mt-1 min-w-64 max-w-sm rounded-xl border py-1 shadow-lg"
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
                    className="btn-transition rounded-md px-3 py-2 text-sm font-medium"
                    style={
                      active
                        ? {
                            color: 'var(--lp-text)',
                            borderBottom: '2px solid var(--color-lp-orange)',
                          }
                        : { color: 'var(--lp-text-secondary)' }
                    }
                    onMouseEnter={(e) => {
                      if (!active) {
                        e.currentTarget.style.color = 'var(--lp-text)';
                        e.currentTarget.style.background = 'var(--lp-surface-hover)';
                      }
                    }}
                    onMouseLeave={(e) => {
                      if (!active) {
                        e.currentTarget.style.color = 'var(--lp-text-secondary)';
                        e.currentTarget.style.background = 'transparent';
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
                {user.avatarUrl ? (
                  <Image
                    src={user.avatarUrl}
                    alt=""
                    width={28}
                    height={28}
                    className="h-7 w-7 rounded-full object-cover"
                  />
                ) : (
                  <span
                    className="flex h-7 w-7 items-center justify-center rounded-full text-xs font-semibold"
                    style={{ background: 'var(--lp-surface-hover)', color: 'var(--lp-text)' }}
                  >
                    {user.name.slice(0, 1).toUpperCase()}
                  </span>
                )}
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
                  <AccountMenuContent onSignOut={onSignOut} onClose={() => setAccountOpen(false)} />
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </header>
  );
}
