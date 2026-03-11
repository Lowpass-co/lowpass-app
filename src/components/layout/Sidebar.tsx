/* ============================================
   LOWPASS — Sidebar Navigation (Variant)

   Dark gradient sidebar with text-only nav,
   orange dot active indicator, and square avatar footer.
   ============================================ */

'use client';

import { useState, useRef, useEffect } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  ChevronLeft, ChevronRight, LogOut,
  LayoutDashboard, Map, ClipboardList, Calendar,
  DollarSign, Bed, Music, Users, Building2, Settings, Bug,
} from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { cn } from '@/lib/utils';

interface NavItem {
  label: string;
  href: string;
  icon: React.ElementType;
  badge?: number;
  adminOnly?: boolean;
}

interface NavGroup {
  title?: string;
  items: NavItem[];
}

const navGroups: NavGroup[] = [
  {
    items: [
      { label: 'Dashboard', href: '/dashboard', icon: LayoutDashboard },
    ],
  },
  {
    title: 'Tour Management',
    items: [
      { label: 'Tours', href: '/tours', icon: Map },
      { label: 'Advance', href: '/advance', icon: ClipboardList },
      { label: 'Calendar', href: '/calendar', icon: Calendar },
    ],
  },
  {
    title: 'Finance',
    items: [
      { label: 'Budget', href: '/budget', icon: DollarSign },
      { label: 'Rooming', href: '/rooming', icon: Bed },
    ],
  },
  {
    title: 'Data',
    items: [
      { label: 'Artists', href: '/artists', icon: Music },
      { label: 'Personnel', href: '/personnel', icon: Users },
      { label: 'Venues', href: '/venues', icon: Building2 },
    ],
  },
  {
    title: 'Admin',
    items: [
      { label: 'Settings', href: '/settings', icon: Settings },
      { label: 'Bug Reports', href: '/bugs', icon: Bug, adminOnly: true },
    ],
  },
];

const SIDEBAR_COLLAPSED_KEY = 'lp-sidebar-collapsed';

export function Sidebar() {
  const pathname = usePathname();
  const [collapsed, setCollapsed] = useState(false);

  useEffect(() => {
    const saved = localStorage.getItem(SIDEBAR_COLLAPSED_KEY);
    if (saved === 'true') setCollapsed(true);
  }, []);

  useEffect(() => {
    localStorage.setItem(SIDEBAR_COLLAPSED_KEY, String(collapsed));
  }, [collapsed]);

  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const { user, signOut } = useAuth();
  const lastDisplay = useRef({ name: '', email: '' });

  useEffect(() => {
    if (user?.email) {
      lastDisplay.current = {
        name: user.user_metadata?.name ?? user.email ?? '',
        email: user.email ?? '',
      };
    }
  }, [user]);

  const displayName = user?.user_metadata?.name ?? user?.email ?? lastDisplay.current.name;
  const displayEmail = user?.email ?? lastDisplay.current.email;
  const initials = displayName
    ? displayName.split(' ').map((w: string) => w[0]).slice(0, 2).join('').toUpperCase()
    : (displayEmail?.charAt(0).toUpperCase() ?? '?');

  return (
    <aside
      style={{ background: 'linear-gradient(to top, #000000 0%, #000000 45%, #1D0900 100%)' }}
      className={cn(
        'fixed inset-y-0 left-0 z-30 flex flex-col',
        'border-r border-white/5',
        'transition-[width] duration-200 ease-in-out',
        collapsed ? 'w-[72px]' : 'w-[260px]'
      )}
    >
      {/* Decorative orange watermark — subtle SVG lines */}
      {!collapsed && (
        <div className="pointer-events-none absolute inset-0 overflow-hidden" style={{ zIndex: 0 }}>
          <svg
            width="260"
            height="638"
            viewBox="0 0 260 638"
            fill="none"
            className="absolute top-0 left-0"
          >
            <defs>
              <filter id="sb-glow" x="-300%" y="-300%" width="700%" height="700%">
                <feGaussianBlur in="SourceGraphic" stdDeviation="6" result="blur" />
              </filter>
            </defs>

            {/*
              Logo geometry starting from the bottom of the header divider (y=64).
              Vertical hugs left edge: (4,64)→(4,340).
              Horizontal: (4,340)→(200,340). Diagonal: (200,340)→(260,620).
            */}
            <polyline
              points="4,64 4,438 200,438 260,638"
              stroke="#FF4500"
              strokeWidth="1.5"
              strokeLinejoin="miter"
              fill="none"
              opacity="0.24"
            />

            {/* Flare — outer glow */}
            <circle r="12" fill="#FF4500" opacity="0.17" filter="url(#sb-glow)">
              <animateMotion
                dur="9s"
                repeatCount="indefinite"
                calcMode="paced"
                path="M4,64 L4,438 L200,438 L260,638"
              />
            </circle>

            {/* Flare — bright white core */}
            <circle r="2.5" fill="white" opacity="0.77">
              <animateMotion
                dur="9s"
                repeatCount="indefinite"
                calcMode="paced"
                path="M4,64 L4,438 L200,438 L260,638"
              />
            </circle>
          </svg>
        </div>
      )}

      {/* Content layer */}
      <div className="relative flex h-full flex-col" style={{ zIndex: 1 }}>

        {/* Wordmark + collapse toggle */}
        <div className="flex h-16 items-center justify-between px-5 border-b border-white/5">
          {!collapsed ? (
            <span style={{
              color: '#FF4500',
              fontWeight: 700,
              fontSize: '13px',
              letterSpacing: '0.22em',
              fontFamily: 'inherit',
            }}>
              LOWPASS
            </span>
          ) : (
            <span style={{ color: '#FF4500', fontWeight: 700, fontSize: '13px', letterSpacing: '0.1em' }}>
              LP
            </span>
          )}
          <button
            onClick={() => setCollapsed(!collapsed)}
            className={cn(
              'flex h-6 w-6 items-center justify-center rounded',
              'transition-colors',
              collapsed && 'mx-auto'
            )}
            style={{ color: 'rgba(255,255,255,0.25)' }}
            aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          >
            {collapsed ? <ChevronRight size={14} /> : <ChevronLeft size={14} />}
          </button>
        </div>

        {/* New Tour button — outline style */}
        <div className="px-4 pt-5 pb-3">
          <Link
            href="/tours/create"
            className={cn(
              'flex items-center justify-center rounded-md py-2.5 text-xs font-semibold tracking-widest',
              'transition-colors hover:bg-lp-orange/10',
              collapsed ? 'px-2' : 'px-3'
            )}
            style={{
              border: '1px solid rgba(255,69,0,0.6)',
              color: '#FF4500',
              letterSpacing: '0.15em',
            }}
          >
            {collapsed ? '+' : '+ NEW TOUR'}
          </Link>
        </div>

        {/* Navigation — text only, no icons */}
        <nav className="flex-1 overflow-y-auto px-4 py-2">
          {navGroups.map((group, groupIndex) => (
            <div key={groupIndex} className="mb-6">
              {group.title && !collapsed && (
                <p
                  className="mb-2 text-[11px] font-bold uppercase tracking-widest"
                  style={{
                    color: 'rgba(255,255,255,0.8)',
                    textShadow: '0 0 12px #000, 0 0 20px #000, 0 1px 3px #000',
                  }}
                >
                  {group.title}
                </p>
              )}

              {group.items.map((item) => {
                const isActive =
                  item.href === '/advance'
                    ? pathname?.includes('/advance')
                    : item.href === '/tours'
                      ? pathname?.startsWith('/tours') && !pathname?.includes('/advance')
                      : item.href === '/budget'
                        ? pathname?.startsWith('/budget')
                        : item.href === '/rooming'
                          ? pathname?.startsWith('/rooming')
                          : pathname === item.href || pathname?.startsWith(item.href + '/');

                const Icon = item.icon;
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    title={collapsed ? item.label : undefined}
                    className={cn(
                      'group flex items-center gap-2.5 py-1.5 transition-colors duration-100 rounded-md',
                      !collapsed && 'px-2 -mx-2',
                      collapsed && 'justify-center',
                      isActive
                        ? 'bg-lp-orange/[0.08]'
                        : 'hover:bg-lp-orange/[0.05]'
                    )}
                    style={{
                      color: isActive ? '#ffffff' : 'rgba(255,255,255,0.35)',
                    }}
                  >
                    {/* Active → bullet dot; Inactive → icon */}
                    {isActive ? (
                      <span
                        className="h-1.5 w-1.5 shrink-0 rounded-full"
                        style={{ background: '#FF4500' }}
                      />
                    ) : (
                      <Icon
                        size={15}
                        className="shrink-0 transition-colors duration-100"
                        style={{ color: 'rgba(255,69,0,0.45)' }}
                      />
                    )}
                    {!collapsed && (
                      <span className={cn('flex-1 uppercase tracking-wider text-xs', isActive && 'font-semibold')}>
                        {item.label}
                      </span>
                    )}
                  </Link>
                );
              })}
            </div>
          ))}
        </nav>

        {/* Footer — square avatar + name + logout */}
        <div className="border-t border-white/5 px-4 py-4">
          <button
            type="button"
            onClick={() => setUserMenuOpen((open) => !open)}
            className={cn(
              'flex w-full items-center gap-3 text-left transition-colors',
              collapsed && 'justify-center'
            )}
            aria-expanded={userMenuOpen}
          >
            {/* Square avatar */}
            <div
              className="flex h-8 w-8 shrink-0 items-center justify-center rounded text-xs font-bold text-white"
              style={{ background: '#FF4500' }}
            >
              {initials}
            </div>
            {!collapsed && (
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium" style={{ color: 'rgba(255,255,255,0.85)' }}>
                  {displayName || '…'}
                </p>
                {displayEmail && (
                  <p className="truncate text-xs" style={{ color: 'rgba(255,255,255,0.3)' }}>
                    {displayEmail}
                  </p>
                )}
              </div>
            )}
          </button>

          {/* Logout — animated expand */}
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
                  'flex w-full items-center gap-2.5 rounded py-2 mt-2 text-xs font-medium',
                  'transition-colors',
                  collapsed && 'justify-center'
                )}
                style={{ color: 'rgba(255,255,255,0.35)' }}
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
