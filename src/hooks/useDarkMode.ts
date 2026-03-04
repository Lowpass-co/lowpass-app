/* ============================================
   LOWPASS — Dark Mode Hook

   Manages dark mode state. Persists preference
   to localStorage. Falls back to system preference.
   ============================================ */

'use client';

import { useEffect, useState, useCallback } from 'react';

type Theme = 'light' | 'dark' | 'system';

export function useDarkMode() {
  const [theme, setThemeState] = useState<Theme>('system');
  const [isDark, setIsDark] = useState(false);

  // On mount, read saved preference
  useEffect(() => {
    const saved = localStorage.getItem('lp-theme') as Theme | null;
    if (saved) {
      setThemeState(saved);
    }
  }, []);

  // Apply dark class to <html> based on theme
  useEffect(() => {
    const root = document.documentElement;
    let dark = false;

    if (theme === 'dark') {
      dark = true;
    } else if (theme === 'system') {
      dark = window.matchMedia('(prefers-color-scheme: dark)').matches;
    }

    if (dark) {
      root.classList.add('dark');
    } else {
      root.classList.remove('dark');
    }

    setIsDark(dark);
  }, [theme]);

  // Listen for system preference changes when in "system" mode
  useEffect(() => {
    if (theme !== 'system') return;

    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
    const handler = (e: MediaQueryListEvent) => {
      setIsDark(e.matches);
      if (e.matches) {
        document.documentElement.classList.add('dark');
      } else {
        document.documentElement.classList.remove('dark');
      }
    };

    mediaQuery.addEventListener('change', handler);
    return () => mediaQuery.removeEventListener('change', handler);
  }, [theme]);

  const setTheme = useCallback((newTheme: Theme) => {
    setThemeState(newTheme);
    localStorage.setItem('lp-theme', newTheme);
  }, []);

  const toggle = useCallback(() => {
    setTheme(isDark ? 'light' : 'dark');
  }, [isDark, setTheme]);

  return { theme, isDark, setTheme, toggle };
}
