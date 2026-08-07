'use client';

/* ============================================
   LOWPASS — <RiderPackTitleEditable> (the rider rename fix, 2026-08-07)

   Adam: "it's not possible to rename the rider, it just says untitled …
   it does not save." Root cause: the builder hero rendered the title as a
   STATIC <h1> — there was no rename affordance anywhere in the builder.

   This is the h1, made real: click the title (or the pencil) → an input in
   the same type style → Enter/blur PATCHes /api/rider-packs/[id] { title }
   (allow-listed; the route also syncs a linked rider_folders title) →
   router.refresh() so every surface showing the title updates. Escape
   cancels. Optimistic text while the save is in flight; revert + toast on
   failure. Empty input keeps the old title (never saves '').
   ============================================ */

import { useCallback, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Pencil } from 'lucide-react';
import { useToast } from '@/components/ui/Toast';

export function RiderPackTitleEditable({ packId, title }: { packId: string; title: string }) {
  const router = useRouter();
  const { showToast } = useToast();
  const [editing, setEditing] = useState(false);
  const [display, setDisplay] = useState(title);
  const inputRef = useRef<HTMLInputElement>(null);

  const commit = useCallback(
    async (raw: string) => {
      const next = raw.trim();
      setEditing(false);
      if (!next || next === display) return; // empty / unchanged → keep as-is
      const prev = display;
      setDisplay(next); // optimistic
      try {
        const res = await fetch(`/api/rider-packs/${packId}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ title: next }),
        });
        if (!res.ok) {
          const j = await res.json().catch(() => ({}));
          throw new Error(typeof j.error === 'string' ? j.error : 'Rename failed');
        }
        router.refresh();
      } catch (e) {
        setDisplay(prev);
        showToast(e instanceof Error ? e.message : 'Rename failed', 'error');
      }
    },
    [packId, display, router, showToast],
  );

  if (editing) {
    return (
      <input
        ref={inputRef}
        autoFocus
        defaultValue={display === 'Untitled rider' ? '' : display}
        placeholder="Rider title"
        aria-label="Rider title"
        onBlur={(e) => void commit(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
          if (e.key === 'Escape') setEditing(false);
        }}
        className="lp-h1"
        style={{
          letterSpacing: '-0.01em', width: '100%', maxWidth: 560,
          background: 'var(--lp-bg)', color: 'var(--lp-text)',
          border: '1px solid var(--lp-orange)', borderRadius: 'var(--lp-radius-md)',
          padding: '2px 10px', outline: 'none',
        }}
      />
    );
  }

  return (
    <h1
      className="lp-h1 truncate"
      style={{ letterSpacing: '-0.01em', cursor: 'text', display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}
      title="Click to rename this rider"
      onClick={() => setEditing(true)}
    >
      <span className="truncate">{display}</span>
      <button
        type="button"
        aria-label="Rename rider"
        onClick={(e) => { e.stopPropagation(); setEditing(true); }}
        style={{ border: 0, background: 'transparent', color: 'var(--lp-text-tertiary)', cursor: 'pointer', padding: 2, lineHeight: 0, flexShrink: 0 }}
      >
        <Pencil className="h-4 w-4" />
      </button>
    </h1>
  );
}
