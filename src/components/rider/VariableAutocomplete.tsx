'use client';

/* ============================================
   LOWPASS — <VariableAutocomplete> (Sprint 12 §9c1.b)

   Popover that surfaces when the operator types `{` in a
   RichTextEditor. Lists registry variables filtered by pack
   scope and the typed query; selecting one inserts a
   VariableNode at the trigger position.

   Trigger detection runs in RichTextEditor — this component
   is a render-only surface that takes:
     - the trigger anchor (page coordinates)
     - the current query text (chars typed after `{`)
     - the pack scope (drives the suggestion filter)
     - onPick / onClose callbacks
   …and emits a positioned popover with keyboard handling.

   Keyboard:
     - ↑/↓ navigate the visible suggestions.
     - Enter picks the highlighted suggestion (or first match).
     - Esc closes via onClose (no pick).

   The parent owns the open / closed state + the query string
   so this component stays pure. Keyboard events get
   forwarded from the parent's editor-level handler.
   ============================================ */

import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  variablesForPackScope,
  type VariableDefinition,
} from '@/lib/rider-packs/variable-registry';

interface VariableAutocompleteProps {
  /** Page coordinates of the `{` character — popover anchors
   *  here. Pass null to hide. */
  anchor: { top: number; left: number; lineHeight: number } | null;
  /** Text after the `{` (excludes the brace). */
  query: string;
  /** Pack scope drives the filter — artist-scope hides tour +
   *  contact variables. */
  packScope: 'artist' | 'tour' | 'show';
  onPick: (token: string) => void;
  onClose: () => void;
}

const MAX_VISIBLE = 8;

export function VariableAutocomplete({
  anchor,
  query,
  packScope,
  onPick,
  onClose,
}: VariableAutocompleteProps) {
  const [highlightIdx, setHighlightIdx] = useState(0);
  const listRef = useRef<HTMLDivElement>(null);

  const candidates = useMemo<VariableDefinition[]>(() => {
    const pool = variablesForPackScope(packScope);
    if (!query) return [...pool].slice(0, 50);
    const needle = query.toLowerCase();
    return pool
      .filter((v) => {
        /* Match against the bare token (artist, contact.tm.phone)
           OR the user-facing label / description so the operator
           can type either way. */
        const bare = v.token.slice(1, -1).toLowerCase();
        return (
          bare.includes(needle) ||
          v.label.toLowerCase().includes(needle) ||
          v.description.toLowerCase().includes(needle)
        );
      })
      .slice(0, 50);
  }, [packScope, query]);

  /* Clamp the highlight at read time rather than via a sync
     effect — avoids the react-hooks/set-state-in-effect rule
     and is equivalent semantically because all writes happen
     in user-event handlers. When the query shrinks the
     candidates list, the next render uses the clamped value
     and the highlight visibly snaps to 0. */
  const safeHighlightIdx =
    candidates.length === 0 ? 0 : Math.min(highlightIdx, candidates.length - 1);

  /* Auto-scroll the highlighted row into view. */
  useLayoutEffect(() => {
    const row = listRef.current?.querySelector<HTMLElement>(
      `[data-idx="${safeHighlightIdx}"]`,
    );
    row?.scrollIntoView({ block: 'nearest' });
  }, [safeHighlightIdx]);

  /* Document-level keydown for Arrow / Enter / Esc. Tab is
     reserved for the editor to do normal indentation; the
     editor's own keymap fires for everything else. */
  useEffect(() => {
    if (!anchor) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setHighlightIdx((i) => (candidates.length === 0 ? 0 : (i + 1) % candidates.length));
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        setHighlightIdx((i) =>
          candidates.length === 0 ? 0 : (i - 1 + candidates.length) % candidates.length,
        );
      } else if (e.key === 'Enter') {
        if (candidates.length === 0) return;
        e.preventDefault();
        const idx = Math.min(highlightIdx, candidates.length - 1);
        const pick = candidates[idx] ?? candidates[0];
        if (pick) onPick(pick.token);
      } else if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
      }
    };
    /* Capture phase so we beat the editor's own handlers when
       the popover is open. */
    document.addEventListener('keydown', onKey, true);
    return () => document.removeEventListener('keydown', onKey, true);
  }, [anchor, candidates, highlightIdx, onClose, onPick]);

  if (!anchor) return null;
  if (typeof document === 'undefined') return null;

  /* Position below the caret line. If the popover would clip
     the viewport bottom, flip above. We use a hardcoded max
     height; finer positioning is overkill for this surface. */
  const flipUp = anchor.top + 280 > window.innerHeight;
  const top = flipUp ? anchor.top - 8 : anchor.top + anchor.lineHeight + 4;
  const left = Math.min(anchor.left, window.innerWidth - 320);

  const visible = candidates.slice(0, MAX_VISIBLE);
  const overflow = Math.max(0, candidates.length - MAX_VISIBLE);

  return createPortal(
    <div
      ref={listRef}
      role="listbox"
      style={{
        position: 'fixed',
        top,
        left,
        width: 300,
        maxHeight: 280,
        overflowY: 'auto',
        background: 'var(--lp-surface)',
        border: '1px solid var(--lp-border-strong)',
        borderRadius: 'var(--lp-radius-md)',
        boxShadow: '0 4px 16px color-mix(in srgb, black 25%, transparent)',
        zIndex: 9999,
        transform: flipUp ? 'translateY(-100%)' : undefined,
        transformOrigin: flipUp ? 'bottom' : 'top',
      }}
    >
      <div
        style={{
          padding: 'var(--lp-space-1) var(--lp-space-2)',
          fontSize: '10px',
          fontWeight: 600,
          letterSpacing: '0.08em',
          textTransform: 'uppercase',
          color: 'var(--lp-text-tertiary)',
          borderBottom: '1px solid var(--lp-border)',
          background: 'var(--lp-panel)',
        }}
      >
        Insert variable
        {query ? (
          <span style={{ marginLeft: 6, color: 'var(--lp-text)' }}>· {`{${query}`}</span>
        ) : null}
        <span style={{ marginLeft: 6, color: 'var(--lp-text-tertiary)' }}>
          ({candidates.length})
        </span>
      </div>

      {candidates.length === 0 ? (
        <div
          style={{
            padding: 'var(--lp-space-3)',
            fontSize: 'var(--lp-text-xs)',
            color: 'var(--lp-text-tertiary)',
            fontStyle: 'italic',
            textAlign: 'center',
          }}
        >
          No variables match.
        </div>
      ) : (
        visible.map((v, idx) => {
          const isActive = idx === safeHighlightIdx;
          return (
            <button
              key={v.token}
              type="button"
              role="option"
              data-idx={idx}
              aria-selected={isActive}
              onMouseEnter={() => setHighlightIdx(idx)}
              onMouseDown={(e) => {
                /* mousedown beats blur — fires before the
                   editor loses focus, so the insert lands at
                   the trigger position. */
                e.preventDefault();
                onPick(v.token);
              }}
              style={{
                display: 'block',
                width: '100%',
                padding: 'var(--lp-space-2) var(--lp-space-3)',
                textAlign: 'left',
                background: isActive ? 'var(--lp-surface-hover)' : 'transparent',
                border: 'none',
                cursor: 'pointer',
              }}
            >
              <div
                className="font-mono"
                style={{
                  fontSize: '11px',
                  color: 'var(--color-lp-orange)',
                }}
              >
                {v.token}
              </div>
              <div
                style={{
                  fontSize: 'var(--lp-text-xs)',
                  color: 'var(--lp-text)',
                  fontWeight: 600,
                  marginTop: 2,
                }}
              >
                {v.label}
              </div>
              <div
                style={{
                  fontSize: '10px',
                  color: 'var(--lp-text-tertiary)',
                  marginTop: 1,
                  lineHeight: 1.3,
                }}
              >
                {v.description}
              </div>
            </button>
          );
        })
      )}

      {overflow > 0 ? (
        <div
          style={{
            padding: 'var(--lp-space-1) var(--lp-space-2)',
            fontSize: '10px',
            color: 'var(--lp-text-tertiary)',
            textAlign: 'center',
            borderTop: '1px solid var(--lp-border)',
          }}
        >
          …and {overflow} more — keep typing to narrow.
        </div>
      ) : null}
    </div>,
    document.body,
  );
}
