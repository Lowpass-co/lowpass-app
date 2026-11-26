'use client';

/* ⌘↵ / Ctrl+↵ presses the focused form's OK — see src/lib/keyboard/submitShortcut.ts.
   Mounted ONCE in the root layout, so every page, dialog and slide-over gets it. */

import { useEffect } from 'react';
import { handleSubmitShortcut } from '@/lib/keyboard/submitShortcut';

export function SubmitShortcut() {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      handleSubmitShortcut(e);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);
  return null;
}
