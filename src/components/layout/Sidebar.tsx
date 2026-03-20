/* ============================================
   LOWPASS — Sidebar Navigation

   Light mode: Figma design (white bg, gray nav, orange accents).
   Dark mode: Inverted theme (dark bg, light text, same orange accents).
   ============================================ */

'use client';

import { useState, useRef, useEffect, useLayoutEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { usePathname, useSearchParams } from 'next/navigation';
import {
  ChevronLeft, ChevronRight, LogOut, ChevronDown, X,
  LayoutDashboard, ListMusic, ClipboardList, LineChart,
  Wallet, HandCoins, Bed, FileCheck2, Music, Users, Building2, Settings, Bug,
} from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { useArtistTourContext } from '@/contexts/ArtistTourContext';
import { cn, toTitleCase } from '@/lib/utils';

interface NavItem {
  label: string;
  href: string;
  icon: React.ElementType;
  /** Override active detection. 'exact' = pathname must equal href path. 'includes' = pathname includes segment. */
  activeMode?: 'exact' | 'includes' | 'budget' | 'settlement' | 'never' | 'all_advances' | 'tour_advance' | 'rooming' | 'payroll';
}

interface NavGroup {
  title?: string;
  items: NavItem[];
}

const SIDEBAR_COLLAPSED_KEY = 'lp-sidebar-collapsed';

export function Sidebar() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const {
    selectedArtistId,
    selectedTourId,
    selectedArtist,
    selectedTour,
    setSelectedArtistId,
    setSelectedTourId,
    artists,
    tours,
  } = useArtistTourContext();
  const [collapsed, setCollapsed] = useState<boolean>(() => {
    if (typeof window === 'undefined') return false;
    return localStorage.getItem(SIDEBAR_COLLAPSED_KEY) === 'true';
  });
  const [artistOpen, setArtistOpen] = useState(false);
  const [tourOpen, setTourOpen] = useState(false);
  const artistRef = useRef<HTMLDivElement>(null);
  const tourRef = useRef<HTMLDivElement>(null);

  // Sync sidebar width as CSS variable so AppShell can track it without prop drilling
  useLayoutEffect(() => {
    document.documentElement.style.setProperty('--sidebar-w', collapsed ? '72px' : '260px');
  }, [collapsed]);

  const baseGroups: NavGroup[] = [
    {
      title: 'Data',
      items: [
        { label: 'Artists', href: '/artists', icon: Music, activeMode: 'exact' },
        { label: 'Personnel', href: '/personnel', icon: Users, activeMode: 'exact' },
        { label: 'Venues', href: '/venues', icon: Building2, activeMode: 'exact' },
      ],
    },
    {
      title: 'Admin',
      items: [
        { label: 'Settings', href: '/settings', icon: Settings, activeMode: 'exact' },
        { label: 'Bug Reports', href: '/bugs', icon: Bug, activeMode: 'exact' },
      ],
    },
  ];

  const navGroups: NavGroup[] = [
    {
      title: 'OVERVIEW',
      items: [
        { label: 'Dashboard', href: '/dashboard', icon: LayoutDashboard, activeMode: 'exact' },
        { label: 'All Tours', href: '/tours', icon: ListMusic, activeMode: 'exact' },
        { label: 'All Advances', href: '/advance', icon: ClipboardList, activeMode: 'all_advances' },
        { label: 'Performance', href: '/performance', icon: LineChart, activeMode: 'exact' },
      ],
    },
    {
      title: 'MANAGE',
      items: [
        { label: 'Budget', href: selectedTourId ? `/budget?tour_id=${selectedTourId}` : '/budget', icon: Wallet, activeMode: 'budget' },
        { label: 'Advance', href: selectedTourId ? `/tours/${selectedTourId}/advance` : '/budget', icon: ClipboardList, activeMode: 'tour_advance' },
        { label: 'Settlement', href: selectedTourId ? `/budget?tour_id=${selectedTourId}&tab=settlement` : '/budget', icon: FileCheck2, activeMode: 'settlement' },
        { label: 'Rooming', href: selectedTourId ? `/tours/${selectedTourId}/rooming` : '/budget', icon: Bed, activeMode: 'rooming' },
        { label: 'Payroll', href: selectedTourId ? `/tours/${selectedTourId}/payroll` : '/budget', icon: HandCoins, activeMode: 'payroll' },
      ],
    },
    ...baseGroups,
  ];

  useEffect(() => {
    localStorage.setItem(SIDEBAR_COLLAPSED_KEY, String(collapsed));
  }, [collapsed]);

  useEffect(() => {
    const close = (e: MouseEvent) => {
      if (artistRef.current?.contains(e.target as Node)) return;
      if (tourRef.current?.contains(e.target as Node)) return;
      setArtistOpen(false);
      setTourOpen(false);
    };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, []);

  const onManagePage =
    pathname?.startsWith('/budget') ||
    pathname?.startsWith('/tours/') ||
    pathname?.includes('/payroll') ||
    pathname?.includes('/rooming');

  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const [profile, setProfile] = useState<{ name: string; email?: string; avatar_url?: string | null; job_title?: string | null } | null>(null);
  const { user, signOut } = useAuth();
  const lastDisplay = useRef({ name: '', email: '' });
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (user?.email) {
      lastDisplay.current = {
        name: user.user_metadata?.name ?? user.email ?? '',
        email: user.email ?? '',
      };
    }
  }, [user]);

  useEffect(() => {
    if (!user?.id) return;
    fetch('/api/profile')
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => data && setProfile({ name: data.name, email: data.email, avatar_url: data.avatar_url, job_title: data.job_title }))
      .catch(() => {});
  }, [user?.id]);

  const rawName = profile?.name ?? user?.user_metadata?.name ?? user?.email ?? lastDisplay.current.name;
  const displayName = toTitleCase(rawName) || (user?.email ?? lastDisplay.current.email).split('@')[0] || '…';
  const displayEmail = profile?.email ?? user?.email ?? lastDisplay.current.email;
  const avatarUrl = profile?.avatar_url ?? null;
  const jobTitle = profile?.job_title ?? null;
  const initials = displayName && displayName !== '…'
    ? displayName.split(/\s+/).map((w: string) => w[0]).filter(Boolean).slice(0, 2).join('').toUpperCase()
    : (displayEmail?.charAt(0).toUpperCase() ?? '?');

  useEffect(() => {
    if (!userMenuOpen) return;
    const close = (e: MouseEvent) => {
      if (menuRef.current?.contains(e.target as Node)) return;
      setUserMenuOpen(false);
    };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, [userMenuOpen]);

  return (
    <aside
      className={cn(
        'fixed inset-y-0 left-0 z-30 flex flex-col transition-[width] duration-200 ease-in-out',
        collapsed ? 'w-[72px]' : 'w-[260px]'
      )}
      style={{
        backgroundColor: 'var(--lp-sidebar-bg)',
        borderRightWidth: '1px',
        borderRightColor: 'var(--lp-sidebar-border)',
      }}
    >
      {/* Content layer */}
      <div className="relative flex h-full flex-col" style={{ zIndex: 1 }}>

        {/* Wordmark + collapse toggle */}
        <div
          className="flex h-16 items-center justify-between px-5"
          style={{ borderBottom: '1px solid var(--lp-sidebar-border)' }}
        >
          {!collapsed ? (
            <span
              className="bg-[var(--lp-sidebar-bg)] pr-2 font-extrabold tracking-[0.2em] text-[13px]"
              style={{ color: '#FF4500' }}
            >
              LOWPASS
            </span>
          ) : (
            <span className="font-extrabold text-[13px] tracking-[0.1em]" style={{ color: '#FF4500' }}>
              LP
            </span>
          )}
          <button
            onClick={() => setCollapsed(!collapsed)}
            className={cn(
              'flex h-6 w-6 items-center justify-center rounded transition-colors',
              collapsed && 'mx-auto'
            )}
            style={{ color: '#FF4500' }}
            aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          >
            {collapsed ? <ChevronRight size={14} strokeWidth={2.5} /> : <ChevronLeft size={14} strokeWidth={2.5} />}
          </button>
        </div>

        {/* Navigation */}
        <nav className="sidebar-scroll flex-1 overflow-y-auto px-4 pb-6">
          <style>{`
            .sidebar-scroll::-webkit-scrollbar { width: 4px; }
            .sidebar-scroll::-webkit-scrollbar-track { background: transparent; }
            .sidebar-scroll::-webkit-scrollbar-thumb {
              background-color: var(--lp-sidebar-border);
              border-radius: 10px;
            }
            .sidebar-scroll:hover::-webkit-scrollbar-thumb {
              background-color: var(--lp-sidebar-text-muted);
            }
          `}</style>
          {navGroups.map((group, groupIndex) => (
            <div key={group.title ?? `group-${groupIndex}`} className="mt-8 first:mt-2">
              {group.title && !collapsed && group.title !== 'MANAGE' && (
                <h3
                  className="mb-3 px-3 text-xs font-extrabold uppercase tracking-wider"
                  style={{ color: 'var(--lp-sidebar-text-heading)' }}
                >
                  {group.title}
                </h3>
              )}

              {group.title === 'MANAGE' && !collapsed && (
                <div className="mb-3 flex items-center justify-between px-3">
                  <h3
                    className="text-xs font-extrabold uppercase tracking-wider"
                    style={{ color: 'var(--lp-sidebar-text-heading)' }}
                  >
                    {group.title}
                  </h3>
                  <div className="relative h-9 w-9 shrink-0 overflow-visible rounded-full border border-lp-border bg-lp-bg">
                    <div className="h-full w-full overflow-hidden rounded-full">
                      {selectedArtist?.spotify_image_url ? (
                        <img src={selectedArtist.spotify_image_url} alt="" className="h-full w-full object-cover" />
                      ) : (
                        <div className="flex h-full w-full items-center justify-center text-[10px] font-bold text-lp-text-tertiary">
                          {(selectedArtist?.name ?? '?').charAt(0).toUpperCase()}
                        </div>
                      )}
                    </div>
                    {selectedArtistId && (
                      <button
                        type="button"
                        onClick={() => {
                          setSelectedArtistId(null);
                          setSelectedTourId(null);
                          setArtistOpen(false);
                          setTourOpen(false);
                          if (onManagePage) router.push('/budget');
                        }}
                        className="absolute right-0 top-0 z-30 flex h-4 w-4 -translate-y-1/3 translate-x-1/3 items-center justify-center rounded-full border border-lp-orange bg-lp-bg text-[10px] font-bold leading-none text-lp-orange shadow-sm"
                        aria-label="Clear selected artist"
                        title="Clear selected artist"
                      >
                        <X size={9} strokeWidth={2.5} />
                      </button>
                    )}
                  </div>
                </div>
              )}

              {group.title === 'MANAGE' && !collapsed && (
                <div className="mb-2 rounded-md bg-transparent px-3 py-0">
                  <div className="min-w-0">
                    <div className="relative" ref={artistRef}>
                      <button
                        type="button"
                        onClick={() => {
                          setArtistOpen((v) => !v);
                          setTourOpen(false);
                        }}
                        className="flex w-full items-center justify-between gap-1 text-left py-0.5 leading-none"
                      >
                        <span className="truncate text-[11px] font-semibold text-[var(--lp-sidebar-text-heading)]">
                          {selectedArtist?.name ?? 'Select Artist'}
                        </span>
                        <ChevronDown size={12} className={cn('shrink-0 text-lp-text-tertiary', artistOpen && 'rotate-180')} />
                      </button>
                      {artistOpen && (
                        <div className="absolute left-0 top-full z-50 mt-1 max-h-56 w-full overflow-y-auto rounded-md border border-lp-border bg-lp-surface py-1 shadow-lg">
                          {artists.map((a) => (
                            <button
                              key={a.id}
                              type="button"
                              onClick={() => {
                                setSelectedArtistId(a.id);
                                setArtistOpen(false);
                              }}
                              className={cn(
                                'w-full px-2 py-1.5 text-left text-[11px] hover:bg-lp-surface-hover',
                                selectedArtistId === a.id ? 'text-lp-orange' : 'text-lp-text'
                              )}
                            >
                              <span className="truncate">{a.name}</span>
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                    <div className="relative mt-1" ref={tourRef}>
                      <button
                        type="button"
                        onClick={() => {
                          setTourOpen((v) => !v);
                          setArtistOpen(false);
                        }}
                        disabled={!selectedArtistId}
                        className="flex w-full items-center justify-between gap-1 text-left py-0.5 leading-none disabled:opacity-50"
                      >
                        <span className="truncate text-[11px] font-semibold text-lp-text-secondary">
                          {selectedTour?.name ?? 'Select Tour'}
                        </span>
                        <ChevronDown size={12} className={cn('shrink-0 text-lp-text-tertiary', tourOpen && 'rotate-180')} />
                      </button>
                      {tourOpen && (
                        <div className="absolute left-0 top-full z-50 mt-1 max-h-56 w-full overflow-y-auto rounded-md border border-lp-border bg-lp-surface py-1 shadow-lg">
                          <button
                            type="button"
                            onClick={() => {
                              setSelectedTourId(null);
                              setTourOpen(false);
                                if (onManagePage) router.push('/budget');
                            }}
                            className="w-full px-2 py-1.5 text-left text-[11px] text-lp-text-secondary hover:bg-lp-surface-hover"
                          >
                            Clear tour
                          </button>
                          {tours.map((t) => (
                            <button
                              key={t.id}
                              type="button"
                              onClick={() => {
                                setSelectedTourId(t.id);
                                setTourOpen(false);
                                if (onManagePage) {
                                  if (pathname?.startsWith('/budget')) {
                                    const currentTab = searchParams?.get('tab') ?? 'summary';
                                    router.push(`/budget?tour_id=${t.id}&tab=${currentTab}`);
                                  } else if (pathname?.includes('/advance')) {
                                    router.push(`/tours/${t.id}/advance`);
                                  } else if (pathname?.includes('/rooming')) {
                                    router.push(`/tours/${t.id}/rooming`);
                                  } else if (pathname?.includes('/payroll')) {
                                    router.push(`/tours/${t.id}/payroll`);
                                  } else {
                                    router.push(`/budget?tour_id=${t.id}&tab=summary`);
                                  }
                                }
                              }}
                              className={cn(
                                'w-full px-2 py-1.5 text-left text-[11px] hover:bg-lp-surface-hover',
                                selectedTourId === t.id ? 'text-lp-orange' : 'text-lp-text'
                              )}
                            >
                              <span className="truncate">{t.name}</span>
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              )}

              <div className="space-y-0.5">
                {group.items.map((item) => {
                  const hrefPath = item.href.split('?')[0];
                  const tab = searchParams?.get('tab');
                  const isActive =
                    item.activeMode === 'never'
                      ? false
                      : item.activeMode === 'all_advances'
                        ? pathname === '/advance'
                        : item.activeMode === 'tour_advance'
                          ? /^\/tours\/[^/]+\/advance(?:\/|$)/.test(pathname ?? '')
                          : item.activeMode === 'rooming'
                            ? (pathname === '/rooming' || /^\/tours\/[^/]+\/rooming(?:\/|$)/.test(pathname ?? ''))
                            : item.activeMode === 'payroll'
                              ? /^\/tours\/[^/]+\/payroll(?:\/|$)/.test(pathname ?? '')
                      : item.activeMode === 'settlement'
                      ? pathname?.startsWith('/budget') && tab === 'settlement'
                      : item.activeMode === 'budget'
                        ? pathname?.startsWith('/budget') && tab !== 'settlement'
                        : item.activeMode === 'includes'
                          ? !!pathname?.includes(hrefPath.split('/').pop() ?? '')
                          : /* exact */ pathname === hrefPath;

                  const Icon = item.icon;
                  return (
                    <Link
                      key={`${group.title ?? 'base'}-${item.label}-${item.href}`}
                      href={item.href}
                      title={collapsed ? item.label : undefined}
                      className={cn(
                        'group flex items-center gap-3 rounded-md px-3 py-2 transition-colors',
                        'hover:bg-[var(--lp-sidebar-hover-bg)]',
                        collapsed && 'justify-center px-2'
                      )}
                      style={{
                        backgroundColor: isActive ? 'var(--lp-sidebar-active-bg)' : 'transparent',
                        color: isActive ? '#FF4500' : 'var(--lp-sidebar-text)',
                      }}
                    >
                      {isActive ? (
                        <svg
                          className="h-4 w-4 shrink-0"
                          viewBox="0 0 14 14"
                          fill="none"
                          stroke="#FF4500"
                          strokeWidth="1.5"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          aria-hidden
                        >
                          <path d="M 2 0 L 2 6 L 8 6 L 14 12" />
                        </svg>
                      ) : (
                        <Icon
                          size={20}
                          className="shrink-0 transition-colors group-hover:[color:var(--lp-sidebar-text-heading)]"
                          style={{ color: 'var(--lp-sidebar-icon)' }}
                        />
                      )}
                      {!collapsed && (
                        <span
                          className={cn(
                            'flex-1 text-[11px] font-semibold uppercase tracking-wide',
                            isActive && 'font-bold'
                          )}
                        >
                          {item.label}
                        </span>
                      )}
                    </Link>
                  );
                })}
              </div>
            </div>
          ))}
        </nav>

        {/* Footer — avatar + name (link to profile), Account menu with Log out */}
        <div
          className="border-t px-4 py-4 relative"
          ref={menuRef}
          style={{
            borderTopColor: 'var(--lp-sidebar-border)',
            backgroundColor: 'var(--lp-sidebar-bg)',
          }}
        >
          <Link
            href="/profile"
            className={cn(
              'flex w-full items-center gap-3 text-left transition-colors rounded-md py-1 -my-1',
              collapsed && 'justify-center'
            )}
          >
            <div
              className="flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-md text-xs font-bold text-white shadow-sm"
              style={{ backgroundColor: avatarUrl ? 'transparent' : '#FF4500', boxShadow: avatarUrl ? 'none' : '0 1px 2px 0 rgba(255, 69, 0, 0.3)' }}
            >
              {avatarUrl ? (
                <img src={avatarUrl} alt="" className="h-full w-full object-cover" />
              ) : (
                initials
              )}
            </div>
            {!collapsed && (
              <div className="min-w-0 flex-1">
                <p
                  className="truncate text-[13px] font-semibold leading-tight"
                  style={{ color: 'var(--lp-sidebar-text-heading)' }}
                >
                  {displayName}
                </p>
                {displayEmail && (
                  <p
                    className="truncate text-[11px]"
                    style={{ color: 'var(--lp-sidebar-text-muted)' }}
                  >
                    {displayEmail}
                  </p>
                )}
                {jobTitle && (
                  <p
                    className="truncate text-[11px] mt-0.5"
                    style={{ color: 'var(--lp-sidebar-text-muted)' }}
                  >
                    {jobTitle}
                  </p>
                )}
              </div>
            )}
          </Link>
          <button
            type="button"
            onClick={() => setUserMenuOpen((open) => !open)}
            className={cn(
              'flex w-full items-center gap-2 px-0 py-1.5 text-xs font-medium transition-colors mt-1 hover:opacity-80',
              collapsed && 'justify-center'
            )}
            style={{ color: 'var(--lp-sidebar-text-muted)' }}
            aria-expanded={userMenuOpen}
            aria-label={userMenuOpen ? 'Close account menu' : 'Open account menu'}
          >
            {!collapsed && <span style={{ letterSpacing: '0.05em' }}>Account</span>}
            <ChevronRight
              size={14}
              className={cn('shrink-0 transition-transform', userMenuOpen && 'rotate-90')}
            />
          </button>

          <div
            className={cn(
              'grid transition-[grid-template-rows] duration-200 ease-out',
              userMenuOpen ? 'grid-rows-[1fr]' : 'grid-rows-[0fr]'
            )}
          >
            <div className="overflow-hidden">
              <button
                type="button"
                onClick={() => signOut()}
                className={cn(
                  'flex w-full items-center gap-2.5 px-4 py-2 text-xs font-medium transition-colors',
                  collapsed && 'justify-center'
                )}
                style={{ color: 'var(--lp-sidebar-text-muted)' }}
              >
                <LogOut size={14} />
                {!collapsed && <span style={{ letterSpacing: '0.05em' }}>Log out</span>}
              </button>
            </div>
          </div>
        </div>
      </div>
    </aside>
  );
}
