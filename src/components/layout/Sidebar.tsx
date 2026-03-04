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

import { useState } from 'react';
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
} from 'lucide-react';
import { LowpassLogo } from '@/components/common/LowpassLogo';
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

export function Sidebar() {
  const pathname = usePathname();
  const [collapsed, setCollapsed] = useState(false);

  return (
    <aside
      className={cn(
        'fixed inset-y-0 left-0 z-30 flex flex-col',
        'bg-lp-surface border-r border-lp-border',
        'transition-all duration-200 ease-in-out',
        collapsed ? 'w-[72px]' : 'w-[260px]'
      )}
    >
      {/* Logo + collapse toggle */}
      <div className="flex h-16 items-center justify-between px-4 border-b border-lp-border">
        <LowpassLogo size="sm" showText={!collapsed} />
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
            'hover:bg-lp-orange-hover transition-colors',
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
              const isActive = pathname === item.href || pathname?.startsWith(item.href + '/');
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

      {/* User section at bottom */}
      <div className="border-t border-lp-border px-3 py-3">
        <div
          className={cn(
            'flex items-center gap-3 rounded-lg px-3 py-2',
            'text-lp-text-secondary hover:bg-lp-surface-hover',
            'cursor-pointer transition-colors',
            collapsed && 'justify-center px-0'
          )}
        >
          {/* Avatar placeholder */}
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-lp-orange text-sm font-bold text-white">
            A
          </div>
          {!collapsed && (
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium text-lp-text">Adam Rowley</p>
              <p className="truncate text-xs text-lp-text-tertiary">Tour Manager</p>
            </div>
          )}
        </div>
      </div>
    </aside>
  );
}
