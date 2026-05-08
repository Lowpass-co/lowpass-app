'use client';

/* ============================================
   LOWPASS — TagEditor (Sprint 9 §3)

   Chip-style tag editor with inline add input + autocomplete
   from a workspace's existing tag values. Used inside
   MemberManageSlideOver and InviteMemberSlideOver.

   Tag rules:
     - Free-form lowercase strings, trimmed.
     - Disallow whitespace and characters that don't fit a
       URL slug aesthetic (we keep validation gentle: just
       disallow whitespace).
     - Duplicate-add is a silent no-op.
   ============================================ */

import { useId, useMemo, useRef, useState } from 'react';
import { X, Plus } from 'lucide-react';

interface TagEditorProps {
  value: string[];
  onChange: (next: string[]) => void;
  /** Distinct tags already used in this workspace, for autocomplete. */
  knownTags?: string[];
  /** Up to 6 most-used tags surfaced as quick-pick buttons. */
  suggestedTags?: string[];
  disabled?: boolean;
}

function normalize(raw: string): string {
  return raw.trim().toLowerCase().replace(/\s+/g, '');
}

export function TagEditor({
  value,
  onChange,
  knownTags = [],
  suggestedTags = [],
  disabled = false,
}: TagEditorProps) {
  const inputId = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const [draft, setDraft] = useState('');
  const [showSuggest, setShowSuggest] = useState(false);

  const valueSet = useMemo(() => new Set(value), [value]);

  const autocompleteHits = useMemo(() => {
    const d = normalize(draft);
    if (!d) return [];
    return knownTags
      .filter((t) => t.startsWith(d) && !valueSet.has(t) && t !== d)
      .slice(0, 5);
  }, [draft, knownTags, valueSet]);

  const visibleSuggestions = useMemo(
    () => suggestedTags.filter((t) => !valueSet.has(t)).slice(0, 6),
    [suggestedTags, valueSet],
  );

  function addTag(rawTag: string) {
    const t = normalize(rawTag);
    if (!t) return;
    if (valueSet.has(t)) return;
    onChange([...value, t]);
    setDraft('');
    setShowSuggest(false);
    inputRef.current?.focus();
  }

  function removeTag(t: string) {
    onChange(value.filter((x) => x !== t));
  }

  function handleKey(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Enter' || e.key === ',' || e.key === 'Tab') {
      if (draft.trim()) {
        e.preventDefault();
        addTag(draft);
      }
    } else if (e.key === 'Backspace' && !draft && value.length > 0) {
      // Backspace on empty draft removes the last chip.
      removeTag(value[value.length - 1]);
    } else if (e.key === 'Escape') {
      setDraft('');
      setShowSuggest(false);
    }
  }

  return (
    <div className="lp-tag-editor" style={{ display: 'flex', flexDirection: 'column', gap: 'var(--lp-space-2)' }}>
      <div
        className="flex flex-wrap items-center"
        style={{
          gap: 'var(--lp-space-2)',
          padding: 'var(--lp-space-2)',
          background: 'var(--lp-bg)',
          border: '1px solid var(--lp-border-strong)',
          borderRadius: 'var(--lp-radius-md)',
          minHeight: 40,
        }}
      >
        {value.map((t) => (
          <span
            key={t}
            className="inline-flex items-center"
            style={{
              gap: 4,
              padding: '2px 8px',
              fontSize: 'var(--lp-text-sm)',
              fontWeight: 'var(--lp-weight-medium)',
              color: 'var(--lp-text)',
              background: 'color-mix(in srgb, var(--color-lp-orange) 8%, transparent)',
              border: '1px solid color-mix(in srgb, var(--color-lp-orange) 30%, transparent)',
              borderRadius: 999,
            }}
          >
            {t}
            {!disabled ? (
              <button
                type="button"
                onClick={() => removeTag(t)}
                aria-label={`Remove ${t}`}
                className="btn-transition flex items-center justify-center"
                style={{
                  width: 14,
                  height: 14,
                  borderRadius: 999,
                  color: 'var(--lp-text-tertiary)',
                  background: 'transparent',
                  cursor: 'pointer',
                }}
              >
                <X size={12} strokeWidth={2.4} />
              </button>
            ) : null}
          </span>
        ))}
        <input
          id={inputId}
          ref={inputRef}
          type="text"
          value={draft}
          onChange={(e) => {
            setDraft(e.target.value);
            setShowSuggest(true);
          }}
          onKeyDown={handleKey}
          onFocus={() => setShowSuggest(true)}
          onBlur={() => {
            // Let click-handlers on suggestion buttons run before
            // we hide the panel.
            setTimeout(() => setShowSuggest(false), 120);
          }}
          placeholder={value.length === 0 ? 'e.g. crew, content' : '+ add tag…'}
          disabled={disabled}
          autoComplete="off"
          spellCheck={false}
          style={{
            flex: 1,
            minWidth: 120,
            padding: '2px 4px',
            fontSize: 'var(--lp-text-sm)',
            color: 'var(--lp-text)',
            background: 'transparent',
            border: 'none',
            outline: 'none',
          }}
        />
      </div>

      {/* Autocomplete panel */}
      {showSuggest && autocompleteHits.length > 0 ? (
        <div
          style={{
            display: 'flex',
            flexWrap: 'wrap',
            gap: 'var(--lp-space-1)',
            padding: 'var(--lp-space-2)',
            background: 'var(--lp-panel)',
            border: '1px solid var(--lp-border-subtle)',
            borderRadius: 'var(--lp-radius-md)',
            fontSize: 'var(--lp-text-xs)',
            color: 'var(--lp-text-secondary)',
          }}
        >
          <span style={{ color: 'var(--lp-text-tertiary)', alignSelf: 'center' }}>
            existing:
          </span>
          {autocompleteHits.map((t) => (
            <button
              key={t}
              type="button"
              onMouseDown={(e) => {
                // Use mousedown so the input's onBlur doesn't hide
                // the panel before this click registers.
                e.preventDefault();
                addTag(t);
              }}
              className="btn-transition"
              style={{
                padding: '2px 8px',
                fontSize: 'var(--lp-text-xs)',
                color: 'var(--lp-text)',
                background: 'var(--lp-surface-hover)',
                border: '1px solid var(--lp-border-subtle)',
                borderRadius: 999,
                cursor: 'pointer',
              }}
            >
              {t}
            </button>
          ))}
        </div>
      ) : null}

      {/* Suggested tags (workspace's most-used) */}
      {visibleSuggestions.length > 0 && !showSuggest ? (
        <div
          style={{
            display: 'flex',
            flexWrap: 'wrap',
            gap: 'var(--lp-space-1)',
            fontSize: 'var(--lp-text-xs)',
            color: 'var(--lp-text-tertiary)',
          }}
        >
          <span style={{ alignSelf: 'center' }}>Suggested:</span>
          {visibleSuggestions.map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => addTag(t)}
              disabled={disabled}
              className="btn-transition inline-flex items-center"
              style={{
                gap: 2,
                padding: '2px 8px',
                fontSize: 'var(--lp-text-xs)',
                color: 'var(--lp-text-secondary)',
                background: 'transparent',
                border: '1px dashed var(--lp-border-subtle)',
                borderRadius: 999,
                cursor: disabled ? 'not-allowed' : 'pointer',
              }}
            >
              <Plus size={10} strokeWidth={2.4} />
              {t}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}
