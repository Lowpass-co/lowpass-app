/* ============================================
   LOWPASS — Header Component

   Artist-first: artist selector (left), tour selector when artist selected,
   then page title, search, notifications, dark mode.
   ============================================ */

'use client';

import Link from 'next/link';
import { Bell, Search, Menu, Plus } from 'lucide-react';
import { DarkModeToggle } from './DarkModeToggle';
import { cn } from '@/lib/utils';

interface HeaderProps {
  title?: string;
  subtitle?: string;
  onMenuClick?: () => void;
}

export function Header({ title, subtitle, onMenuClick }: HeaderProps) {
  return (
    <header className="sticky top-0 z-20 flex h-16 items-center justify-between border-b border-lp-border bg-lp-bg/80 px-6 backdrop-blur-sm">
      {/* Left: mobile menu + title */}
      <div className="flex items-center gap-3 min-w-0">
        <button
          onClick={onMenuClick}
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-lp-text-secondary hover:bg-lp-bg-tertiary lg:hidden"
          aria-label="Open menu"
        >
          <Menu size={20} />
        </button>

        <Link
          href="/tours/create"
          className={cn(
            'flex shrink-0 items-center gap-1.5 rounded-lg border border-lp-orange px-2.5 py-2 text-xs font-bold tracking-widest',
            'text-lp-orange hover:bg-lp-orange hover:text-white dark:hover:text-black transition-colors duration-200'
          )}
          style={{ letterSpacing: '0.12em' }}
        >
          <Plus size={14} strokeWidth={2.5} className="shrink-0" />
          <span className="hidden sm:inline">NEW TOUR</span>
        </Link>

        {/* Page title (when no artist/tour or as extra context) */}
        <div className="min-w-0 flex-1">
          {title && (
            <h1 className="truncate text-lg font-semibold text-lp-text">{title}</h1>
          )}
          {subtitle && (
            <p className="truncate text-sm text-lp-text-secondary">{subtitle}</p>
          )}
        </div>
      </div>

      {/* Right: search, notifications, dark mode */}
      <div className="flex shrink-0 items-center gap-1">
        <button
          className={cn(
            'flex h-9 w-9 items-center justify-center rounded-lg',
            'text-lp-text-secondary hover:text-lp-text hover:bg-lp-bg-tertiary transition-colors'
          )}
          aria-label="Search"
        >
          <Search size={18} />
        </button>
        <button
          className={cn(
            'relative flex h-9 w-9 items-center justify-center rounded-lg',
            'text-lp-text-secondary hover:text-lp-text hover:bg-lp-bg-tertiary transition-colors'
          )}
          aria-label="Notifications"
        >
          <Bell size={18} />
          <span className="absolute right-1.5 top-1.5 h-2 w-2 rounded-full bg-lp-orange" />
        </button>
        <DarkModeToggle />
      </div>
    </header>
  );
}
