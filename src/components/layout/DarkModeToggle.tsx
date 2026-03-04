/* ============================================
   LOWPASS — Dark Mode Toggle

   Simple sun/moon toggle for switching themes.
   ============================================ */

'use client';

import { Moon, Sun } from 'lucide-react';
import { useDarkMode } from '@/hooks/useDarkMode';
import { cn } from '@/lib/utils';

interface DarkModeToggleProps {
  className?: string;
}

export function DarkModeToggle({ className }: DarkModeToggleProps) {
  const { isDark, toggle } = useDarkMode();

  return (
    <button
      onClick={toggle}
      className={cn(
        'flex h-9 w-9 items-center justify-center rounded-lg',
        'text-lp-text-secondary hover:text-lp-text',
        'hover:bg-lp-bg-tertiary',
        'transition-colors duration-150',
        className
      )}
      aria-label={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
    >
      {isDark ? <Sun size={18} /> : <Moon size={18} />}
    </button>
  );
}
