/* ============================================
   LOWPASS — Sidebar Navigation

   Light mode: Figma design (white bg, gray nav, orange accents).
   Dark mode: Inverted theme (dark bg, light text, same orange accents).
   ============================================ */

'use client';

import { useState, useRef, useEffect, useLayoutEffect } from 'react';
import Link from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import {
  ChevronLeft, ChevronRight, LogOut,
  LayoutDashboard, ListMusic, ClipboardList, LineChart,
  Wallet, HandCoins, Bed, FileCheck2, Music, Users, Users2, Building2, Settings, Bug, Gauge, Package,
} from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { useArtistTourContext } from '@/contexts/ArtistTourContext';
import { cn, toTitleCase } from '@/lib/utils';

interface NavItem {
  label: string;
  href: string;
  icon: React.ElementType;
  activeMode?:
    | 'exact'
    | 'includes'
    | 'budget'
    | 'settlement'
    | 'never'
    | 'all_advances'
    | 'tour_advance'
    | 'tour_overview'
    | 'rooming'
    | 'payroll'
    | 'tour_personnel'
    | 'dashboard';
}

interface NavGroup {
  title?: string;
  items: NavItem[];
}

const SIDEBAR_COLLAPSED_KEY = 'lp-sidebar-collapsed';

export function Sidebar() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const router = useRouter();
  const { selectedTourId, selectedArtistId } = useArtistTourContext();
  const [collapsed, setCollapsed] = useState<boolean>(() => {
    if (typeof window === 'undefined') return false;
    return localStorage.getItem(SIDEBAR_COLLAPSED_KEY) === 'true';
  });
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
      title: 'Equipment',
      items: [
        { label: 'Rental House', href: '/equipment', icon: Package, activeMode: 'includes' },
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

  const artistQuery = selectedArtistId ? `?artist_id=${selectedArtistId}` : '';

  const overviewItems: NavItem[] = [
    { label: 'Dashboard', href: `/dashboard${artistQuery}`, icon: LayoutDashboard, activeMode: 'dashboard' },
    { label: 'All Tours', href: `/tours${artistQuery}`, icon: ListMusic, activeMode: 'exact' },
    { label: 'Advances', href: `/advance${artistQuery}`, icon: ClipboardList, activeMode: 'all_advances' },
    { label: 'Performance', href: `/performance${artistQuery}`, icon: LineChart, activeMode: 'exact' },
  ];

  const tourManagementItems: NavItem[] = [
    {
      label: 'Tour Summary',
      href: selectedTourId ? `/tours/${selectedTourId}/overview` : '/budget',
      icon: Gauge,
      activeMode: 'tour_overview',
    },
    { label: 'Budget', href: selectedTourId ? `/budget?tour_id=${selectedTourId}` : '/budget', icon: Wallet, activeMode: 'budget' },
    { label: 'Advance', href: selectedTourId ? `/tours/${selectedTourId}/advance` : '/budget', icon: ClipboardList, activeMode: 'tour_advance' },
    {
      label: 'Tour personnel',
      href: selectedTourId ? `/tours/${selectedTourId}/personnel` : '/budget',
      icon: Users2,
      activeMode: 'tour_personnel',
    },
    { label: 'Settlement', href: selectedTourId ? `/budget?tour_id=${selectedTourId}&tab=settlement` : '/budget', icon: FileCheck2, activeMode: 'settlement' },
    { label: 'Rooming', href: selectedTourId ? `/tours/${selectedTourId}/rooming` : '/budget', icon: Bed, activeMode: 'rooming' },
    { label: 'Payroll', href: selectedTourId ? `/tours/${selectedTourId}/payroll` : '/budget', icon: HandCoins, activeMode: 'payroll' },
  ];

  useEffect(() => {
    localStorage.setItem(SIDEBAR_COLLAPSED_KEY, String(collapsed));
  }, [collapsed]);

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

  function isNavItemActive(item: NavItem): boolean {
    const hrefPath = item.href.split('?')[0];
    const tab = searchParams?.get('tab');
    if (item.activeMode === 'never') return false;
    if (item.activeMode === 'all_advances') return pathname === '/advance';
    if (item.activeMode === 'tour_advance') {
      return /^\/tours\/[^/]+\/advance(?:\/|$)/.test(pathname ?? '');
    }
    if (item.activeMode === 'tour_personnel') {
      return /^\/tours\/[^/]+\/personnel(?:\/|$)/.test(pathname ?? '');
    }
    if (item.activeMode === 'rooming') {
      return pathname === '/rooming' || /^\/tours\/[^/]+\/rooming(?:\/|$)/.test(pathname ?? '');
    }
    if (item.activeMode === 'payroll') {
      return /^\/tours\/[^/]+\/payroll(?:\/|$)/.test(pathname ?? '');
    }
    if (item.activeMode === 'tour_overview') {
      return /^\/tours\/[^/]+\/overview(?:\/|$)/.test(pathname ?? '');
    }
    if (item.activeMode === 'settlement') {
      return pathname?.startsWith('/budget') && tab === 'settlement';
    }
    if (item.activeMode === 'budget') {
      return pathname?.startsWith('/budget') && tab !== 'settlement';
    }
    if (item.activeMode === 'dashboard') {
      return pathname?.startsWith('/dashboard') && !!selectedArtistId;
    }
    if (item.activeMode === 'includes') {
      return !!pathname?.includes(hrefPath.split('/').pop() ?? '');
    }
    return pathname === hrefPath;
  }

  function renderNavLinks(items: NavItem[], groupKey: string) {
    return (
      <div className="space-y-0.5">
        {items.map((item) => {
          const isActive = isNavItemActive(item);
          const Icon = item.icon;
          return (
            <Link
              key={`${groupKey}-${item.label}-${item.href}`}
              href={item.href}
              title={collapsed ? item.label : undefined}
              className={cn(
                'group flex items-center gap-3 rounded-md px-3 py-2 transition-colors',
                'hover:bg-[var(--lp-sidebar-hover-bg)]',
                collapsed && 'justify-center px-2'
              )}
              style={{
                backgroundColor: isActive ? '#FF4500' : 'transparent',
                color: isActive ? '#ffffff' : 'var(--lp-sidebar-text)',
              }}
            >
              <Icon
                size={20}
                className={cn(
                  'shrink-0 transition-colors',
                  !isActive && 'group-hover:[color:var(--lp-sidebar-text-heading)]'
                )}
                style={{ color: isActive ? '#ffffff' : 'var(--lp-sidebar-icon)' }}
              />
              {!collapsed && (
                <span
                  className={cn(
                    'flex-1 text-[11px] font-bold uppercase tracking-[0.1em]',
                  )}
                >
                  {item.label}
                </span>
              )}
            </Link>
          );
        })}
      </div>
    );
  }

  return (
    <aside
      className={cn(
        'fixed inset-y-0 left-0 z-30 flex min-h-0 flex-col transition-[width] duration-200 ease-in-out',
        collapsed ? 'w-[72px]' : 'w-[260px]'
      )}
      style={{
        backgroundColor: 'var(--lp-sidebar-bg)',
        borderRightWidth: '1px',
        borderRightColor: 'var(--lp-sidebar-border)',
      }}
    >
      <div className="relative flex h-full min-h-0 flex-col" style={{ zIndex: 1 }}>
        <div
          className="flex h-16 shrink-0 items-center justify-between px-5"
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
            type="button"
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

        <div className="flex min-h-0 flex-1 flex-col overflow-hidden px-4 pb-2">
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

          {selectedTourId ? (
            <div className="sidebar-scroll flex min-h-0 flex-1 flex-col overflow-y-auto pb-6">
              <div className="mt-2 shrink-0">
                {!collapsed && (
                  <h3
                    className="mb-3 px-3 text-xs font-extrabold uppercase tracking-wider"
                    style={{ color: 'var(--lp-sidebar-text-heading)' }}
                  >
                    Artist Overview
                  </h3>
                )}
                {renderNavLinks(overviewItems, 'overview')}
              </div>

              <div className="mt-4 shrink-0 border-t border-[var(--lp-sidebar-border)] pt-4">
                {!collapsed && (
                  <h3
                    className="mb-3 px-3 text-xs font-extrabold uppercase tracking-wider"
                    style={{ color: 'var(--lp-sidebar-text-heading)' }}
                  >
                    Manage Tour
                  </h3>
                )}

                {renderNavLinks(
                  tourManagementItems.filter((i) => i.label === 'Tour Summary'),
                  'tour-summary'
                )}

                {(() => {
                  const isOnAdvance = /^\/tours\/[^/]+\/advance/.test(pathname ?? '');
                  const isOnBudget =
                    (pathname?.startsWith('/budget') ?? false) && searchParams?.get('tab') !== 'settlement';
                  return (
                    <div
                      className={cn(
                        'relative my-2 flex shrink-0 rounded-xl border border-[var(--lp-sidebar-border)] p-1',
                        collapsed && 'flex-col gap-1'
                      )}
                    >
                      {!collapsed && (
                        <div
                          className="absolute top-1 bottom-1 w-[calc(50%-6px)] rounded-lg bg-lp-orange"
                          style={{
                            left: isOnAdvance ? '4px' : 'calc(50% + 2px)',
                            opacity: isOnAdvance || isOnBudget ? 1 : 0,
                            transition: 'left 250ms cubic-bezier(0.34, 1.56, 0.64, 1), opacity 150ms',
                          }}
                        />
                      )}
                      <button
                        type="button"
                        title="Advance"
                        onClick={() => router.push(`/tours/${selectedTourId}/advance`)}
                        className={cn(
                          'lp-label-caps relative z-10 flex flex-1 items-center justify-center gap-1 rounded-md py-2 transition-colors',
                          collapsed && 'px-0'
                        )}
                        style={{ color: isOnAdvance ? '#fff' : 'var(--lp-sidebar-text-muted)' }}
                      >
                        {collapsed ? (
                          <ClipboardList
                            size={18}
                            strokeWidth={2}
                            style={{ color: isOnAdvance ? '#FF4500' : undefined }}
                          />
                        ) : (
                          'Advance'
                        )}
                      </button>
                      <button
                        type="button"
                        title="Budget"
                        onClick={() => router.push(`/budget?tour_id=${selectedTourId}`)}
                        className={cn(
                          'lp-label-caps relative z-10 flex flex-1 items-center justify-center gap-1 rounded-md py-2 transition-colors',
                          collapsed && 'px-0'
                        )}
                        style={{ color: isOnBudget ? '#fff' : 'var(--lp-sidebar-text-muted)' }}
                      >
                        {collapsed ? (
                          <Wallet size={18} strokeWidth={2} style={{ color: isOnBudget ? '#FF4500' : undefined }} />
                        ) : (
                          'Budget'
                        )}
                      </button>
                    </div>
                  );
                })()}

                <div className="mt-1 space-y-0.5">
                  {renderNavLinks(
                    tourManagementItems.filter(
                      (i) => !['Tour Summary', 'Budget', 'Advance'].includes(i.label)
                    ),
                    'tour-secondary'
                  )}
                </div>
              </div>

              <div className="mt-4 shrink-0 border-t border-[var(--lp-sidebar-border)] pt-4">
                {baseGroups.map((group, groupIndex) => (
                  <div key={group.title ?? `group-${groupIndex}`} className={groupIndex > 0 ? 'mt-6' : ''}>
                    {group.title && !collapsed && (
                      <h3
                        className="mb-3 px-3 text-xs font-extrabold uppercase tracking-wider"
                        style={{ color: 'var(--lp-sidebar-text-heading)' }}
                      >
                        {group.title}
                      </h3>
                    )}
                    {renderNavLinks(group.items, `base-${group.title ?? groupIndex}`)}
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <nav className="sidebar-scroll flex min-h-0 flex-1 flex-col overflow-y-auto pb-6">
              <div className="mt-2 shrink-0">
                {!collapsed && (
                  <h3
                    className="mb-3 px-3 text-xs font-extrabold uppercase tracking-wider"
                    style={{ color: 'var(--lp-sidebar-text-heading)' }}
                  >
                    Artist Overview
                  </h3>
                )}
                {renderNavLinks(overviewItems, 'overview')}
              </div>

              <div className="mt-8 shrink-0">
                {!collapsed && (
                  <h3
                    className="mb-3 px-3 text-xs font-extrabold uppercase tracking-wider"
                    style={{ color: 'var(--lp-sidebar-text-heading)' }}
                  >
                    Tour Management
                  </h3>
                )}
                {!collapsed && (
                  <div className="mx-3 rounded-lg border border-lp-border/50 bg-lp-surface/40 px-3 py-4 text-center">
                    <p
                      className="text-[11px] font-medium leading-relaxed"
                      style={{ color: 'var(--lp-sidebar-text-muted)' }}
                    >
                      Select tour
                      <br />
                      from header
                    </p>
                  </div>
                )}
              </div>

              {baseGroups.map((group, groupIndex) => (
                <div key={group.title ?? `group-${groupIndex}`} className="mt-8 shrink-0">
                  {group.title && !collapsed && (
                    <h3
                      className="mb-3 px-3 text-xs font-extrabold uppercase tracking-wider"
                      style={{ color: 'var(--lp-sidebar-text-heading)' }}
                    >
                      {group.title}
                    </h3>
                  )}
                  {renderNavLinks(group.items, `base-${group.title ?? groupIndex}`)}
                </div>
              ))}
            </nav>
          )}
        </div>

        <div
          className="relative shrink-0 border-t px-4 py-4"
          ref={menuRef}
          style={{
            borderTopColor: 'var(--lp-sidebar-border)',
            backgroundColor: 'var(--lp-sidebar-bg)',
          }}
        >
          <Link
            href="/profile"
            className={cn(
              'flex w-full items-center gap-3 rounded-md py-1 -my-1 text-left transition-colors',
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
              'mt-1 flex w-full items-center gap-2 px-0 py-1.5 text-xs font-medium transition-colors hover:opacity-80',
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
