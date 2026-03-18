/* ============================================
   LOWPASS — Sidebar Navigation

   Light mode: Figma design (white bg, gray nav, orange accents).
   Dark mode: Inverted theme (dark bg, light text, same orange accents).
   ============================================ */

'use client';

import { useState, useRef, useEffect } from 'react';
import Link from 'next/link';
import { usePathname, useSearchParams } from 'next/navigation';
import {
  ChevronLeft, ChevronRight, LogOut,
  LayoutDashboard, Map, Route, ClipboardList,
  DollarSign, Bed, Music, Users, Building2, Settings, Bug,
} from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { useArtistTourContext } from '@/contexts/ArtistTourContext';
import { cn, toTitleCase } from '@/lib/utils';

interface NavItem {
  label: string;
  href: string;
  icon: React.ElementType;
  /** Override active detection. 'exact' = pathname must equal href path. 'includes' = pathname includes segment. */
  activeMode?: 'exact' | 'includes' | 'budget' | 'settlement';
}

interface NavGroup {
  title?: string;
  items: NavItem[];
}

const SIDEBAR_COLLAPSED_KEY = 'lp-sidebar-collapsed';

export function Sidebar() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const { selectedTourId } = useArtistTourContext();
  const [collapsed, setCollapsed] = useState(false);

  // Auto-collapse when entering budget, restore when leaving
  useEffect(() => {
    if (pathname?.startsWith('/budget')) {
      setCollapsed(true);
    }
  }, [pathname]);

  // Sync sidebar width as CSS variable so AppShell can track it without prop drilling
  useEffect(() => {
    document.documentElement.style.setProperty('--sidebar-w', collapsed ? '72px' : '260px');
  }, [collapsed]);

  const baseGroups: NavGroup[] = [
    { items: [{ label: 'Dashboard', href: '/dashboard', icon: LayoutDashboard, activeMode: 'exact' }] },
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

  const tourGroups: NavGroup[] = selectedTourId
    ? [
        {
          title: 'TOUR',
          items: [
            { label: 'Overview', href: `/tours/${selectedTourId}`, icon: Map, activeMode: 'exact' },
            { label: 'Routing', href: `/tours/${selectedTourId}/routing`, icon: Route, activeMode: 'includes' },
            { label: 'Advance', href: `/tours/${selectedTourId}/advance`, icon: ClipboardList, activeMode: 'includes' },
          ],
        },
        {
          title: 'FINANCE',
          items: [
            { label: 'Budget', href: `/budget?tour_id=${selectedTourId}`, icon: DollarSign, activeMode: 'budget' },
            { label: 'Payroll', href: `/tours/${selectedTourId}/payroll`, icon: DollarSign, activeMode: 'includes' },
            { label: 'Rooming', href: `/tours/${selectedTourId}/rooming`, icon: Bed, activeMode: 'includes' },
            { label: 'Settlement', href: `/budget?tour_id=${selectedTourId}&tab=settlement`, icon: DollarSign, activeMode: 'settlement' },
          ],
        },
        ...baseGroups,
      ]
    : baseGroups;

  const navGroups = tourGroups;

  useEffect(() => {
    const saved = localStorage.getItem(SIDEBAR_COLLAPSED_KEY);
    if (saved === 'true') setCollapsed(true);
  }, []);

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

        {/* New Tour button — outline (Figma). Hover: light → white text, dark → black text. */}
        <div className="px-4 pt-5 pb-3">
          <Link
            href="/tours/create"
            className={cn(
              'flex items-center justify-center rounded-lg py-2.5 text-xs font-bold tracking-widest transition-colors duration-200',
              'text-lp-orange hover:bg-lp-orange hover:text-white dark:hover:text-black',
              collapsed ? 'px-2' : 'px-3'
            )}
            style={{
              border: '1px solid #FF4500',
              letterSpacing: '0.15em',
            }}
          >
            {collapsed ? '+' : '+ NEW TOUR'}
          </Link>
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
              {group.title && !collapsed && (
                <h3
                  className="mb-3 px-3 text-xs font-extrabold uppercase tracking-wider"
                  style={{ color: 'var(--lp-sidebar-text-heading)' }}
                >
                  {group.title}
                </h3>
              )}

              <div className="space-y-0.5">
                {group.items.map((item) => {
                  const hrefPath = item.href.split('?')[0];
                  const tab = searchParams?.get('tab');
                  const isActive =
                    item.activeMode === 'settlement'
                      ? pathname?.startsWith('/budget') && tab === 'settlement'
                      : item.activeMode === 'budget'
                        ? pathname?.startsWith('/budget') && tab !== 'settlement'
                        : item.activeMode === 'includes'
                          ? !!pathname?.includes(hrefPath.split('/').pop() ?? '')
                          : /* exact */ pathname === hrefPath;

                  const Icon = item.icon;
                  return (
                    <Link
                      key={item.href}
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
