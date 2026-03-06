/* ============================================
   LOWPASS — Sidebar Navigation

   Main nav for the app. Shows workspace context,
   navigation links, and user info.

   Links are grouped:
   - Overview (Dashboard)
   - Tour Management (Tours, Calendar)
   - Data (Personnel, Venues)
   - Admin (Users, Bug Reports) — God role only
   ============================================ */

'use client';

import { useState, useRef, useEffect } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  LayoutDashboard,
  Map,
  Calendar,
  Users,
  Building2,
  Settings,
  Bug,
  ChevronLeft,
  ChevronRight,
  Plus,
  LogOut,
  ClipboardList,
} from 'lucide-react';
import { LowpassLogo } from '@/components/common/LowpassLogo';
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
    title: 'Data',
    items: [
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

  return (
    <aside
      className={cn(
        'fixed inset-y-0 left-0 z-30 flex flex-col',
        'bg-lp-surface border-r border-lp-border',
        'transition-[width] duration-200 ease-in-out',
        collapsed ? 'w-[72px]' : 'w-[260px]'
      )}
    >
      {/* Logo + collapse toggle */}
      <div className="flex h-16 items-center justify-between px-4 border-b border-lp-border">
        <LowpassLogo size="sm" />
        <button
          onClick={() => setCollapsed(!collapsed)}
          className={cn(
            'flex h-7 w-7 items-center justify-center rounded-md',
            'text-lp-text-tertiary hover:text-lp-text-secondary',
            'hover:bg-lp-bg-tertiary transition-colors',
            collapsed && 'mx-auto'
          )}
          aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
        >
          {collapsed ? <ChevronRight size={16} /> : <ChevronLeft size={16} />}
        </button>
      </div>

      {/* New Tour button */}
      <div className="px-3 py-3">
        <Link
          href="/tours/create"
          className={cn(
            'flex items-center gap-2 rounded-lg px-3 py-2.5',
            'bg-lp-orange text-white font-medium text-sm',
            'hover:bg-lp-orange-hover btn-transition btn-primary-press',
            collapsed && 'justify-center px-0'
          )}
        >
          <Plus size={18} />
          {!collapsed && <span>New Tour</span>}
        </Link>
      </div>

      {/* Navigation */}
      <nav className="flex-1 overflow-y-auto px-3 py-2">
        {navGroups.map((group, groupIndex) => (
          <div key={groupIndex} className="mb-4">
            {/* Group title */}
            {group.title && !collapsed && (
              <p className="mb-1.5 px-3 text-xs font-medium uppercase tracking-wider text-lp-text-tertiary">
                {group.title}
              </p>
            )}

            {/* Group items */}
            {group.items.map((item) => {
              const isActive =
                item.href === '/advance'
                  ? pathname?.includes('/advance')
                  : item.href === '/tours'
                    ? pathname?.startsWith('/tours') && !pathname?.includes('/advance')
                    : pathname === item.href || pathname?.startsWith(item.href + '/');
              const Icon = item.icon;

              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={cn(
                    'flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium',
                    'transition-colors duration-100',
                    isActive
                      ? 'bg-lp-orange-subtle text-lp-orange'
                      : 'text-lp-text-secondary hover:text-lp-text hover:bg-lp-surface-hover',
                    collapsed && 'justify-center px-0'
                  )}
                  title={collapsed ? item.label : undefined}
                >
                  <Icon size={20} className={isActive ? 'text-lp-orange' : ''} />
                  {!collapsed && (
                    <span className="flex-1">{item.label}</span>
                  )}
                  {!collapsed && item.badge !== undefined && item.badge > 0 && (
                    <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-lp-orange px-1.5 text-xs font-semibold text-white">
                      {item.badge}
                    </span>
                  )}
                </Link>
              );
            })}
          </div>
        ))}
      </nav>

      {/* User section at bottom — click to reveal Log out */}
      <div className="border-t border-lp-border px-3 py-3">
        <button
          type="button"
          onClick={() => setUserMenuOpen((open) => !open)}
          className={cn(
            'flex w-full items-center gap-3 rounded-lg px-3 py-2',
            'text-lp-text-secondary hover:bg-lp-surface-hover transition-colors',
            'text-left',
            collapsed && 'justify-center px-0'
          )}
          aria-expanded={userMenuOpen}
          aria-label={userMenuOpen ? 'Close menu' : 'Open user menu'}
        >
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-lp-orange text-sm font-bold text-white">
            {(displayEmail || user?.email)?.charAt(0).toUpperCase() ?? '?'}
          </div>
          {!collapsed && (
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium text-lp-text">
                {displayName || '…'}
              </p>
              {displayEmail && (
                <p className="truncate text-xs text-lp-text-tertiary">
                  {displayEmail}
                </p>
              )}
            </div>
          )}
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
                'flex w-full items-center gap-3 rounded-lg px-3 py-2.5 mt-1 text-sm font-medium',
                'text-lp-text-secondary hover:text-lp-text hover:bg-lp-surface-hover',
                'transition-colors',
                collapsed && 'justify-center px-0'
              )}
            >
              <LogOut size={20} />
              {!collapsed && <span>Log out</span>}
            </button>
          </div>
        </div>
      </div>
    </aside>
  );
}
