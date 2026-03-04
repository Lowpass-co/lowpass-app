/* ============================================
   LOWPASS — Header Component

   Top bar with page title, breadcrumbs,
   notifications, and dark mode toggle.
   ============================================ */

'use client';

import { Bell, Search, Menu } from 'lucide-react';
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
      <div className="flex items-center gap-4">
        {/* Mobile menu button — hidden on desktop */}
        <button
          onClick={onMenuClick}
          className="flex h-9 w-9 items-center justify-center rounded-lg text-lp-text-secondary hover:bg-lp-bg-tertiary lg:hidden"
          aria-label="Open menu"
        >
          <Menu size={20} />
        </button>

        <div>
          {title && (
            <h1 className="text-lg font-semibold text-lp-text">{title}</h1>
          )}
          {subtitle && (
            <p className="text-sm text-lp-text-secondary">{subtitle}</p>
          )}
        </div>
      </div>

      {/* Right: search, notifications, dark mode */}
      <div className="flex items-center gap-1">
        {/* Search */}
        <button
          className={cn(
            'flex h-9 w-9 items-center justify-center rounded-lg',
            'text-lp-text-secondary hover:text-lp-text',
            'hover:bg-lp-bg-tertiary transition-colors'
          )}
          aria-label="Search"
        >
          <Search size={18} />
        </button>

        {/* Notifications */}
        <button
          className={cn(
            'relative flex h-9 w-9 items-center justify-center rounded-lg',
            'text-lp-text-secondary hover:text-lp-text',
            'hover:bg-lp-bg-tertiary transition-colors'
          )}
          aria-label="Notifications"
        >
          <Bell size={18} />
          {/* Unread indicator dot */}
          <span className="absolute right-1.5 top-1.5 h-2 w-2 rounded-full bg-lp-orange" />
        </button>

        {/* Dark mode */}
        <DarkModeToggle />
      </div>
    </header>
  );
}
