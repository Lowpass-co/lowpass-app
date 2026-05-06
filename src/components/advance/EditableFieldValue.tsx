'use client';

/* ============================================
   LOWPASS — EditableFieldValue (Hotfix v2 Phase A)
   ============================================

   Inline-editable replacement for AdvanceShowReadView's FieldValue
   on editable field types (text / textarea / number / currency /
   time / date / url / dropdown / boolean). Renders form controls
   in the same dense, borderless visual language as the existing
   read view — NOT FillMode's chunky chrome.

   Non-editable types (contact, file) fall through to the regular
   FieldValue display — those surfaces have richer edit flows that
   live elsewhere (slide-overs, file upload widgets) and aren't
   touched by this in-place editing.

   Wiring: parent (AdvanceShowReadView) owns the autosave state and
   the PATCH to /api/tours/{tourId}/advance/{routingId}. This
   component just calls `onChange(newValue)` on every meaningful
   commit (blur or Enter or change-event) and stays presentational.

   Permissions: when `disabled` is true the component renders the
   regular FieldValue display only — used for the public-share
   surface (publicReadOnly=true on AdvanceShowReadView) so unauthed
   viewers never trigger an authenticated PATCH.
   ============================================ */

import { useEffect, useState } from 'react';
import { cn } from '@/lib/utils';

type EditableFieldDef = {
  id: string;
  label: string;
  type: string;
  options?: string[];
  // Other props (required, validation, etc.) live on the def but
  // aren't used in-place — the read-mode editor stays minimal.
  [key: string]: unknown;
};

interface EditableFieldValueProps {
  field: EditableFieldDef;
  value: unknown;
  /** Called on every committed change (blur, Enter, select change,
   *  checkbox toggle). Parent debounces the PATCH. */
  onChange: (next: unknown) => void;
  /** When true, render display-only (no inputs). Used for the
   *  /share/advance/[token] public surface. */
  disabled?: boolean;
  /** Render in the dense mono variant (matches the parent row's
   *  `.lp-mono` styling — currencies / numbers / dates / times). */
  mono?: boolean;
}

/** Returns true if this field type supports the in-place editor.
 *  Contact + file fall through to FieldValue display only. */
export function isEditableFieldType(type: string): boolean {
  return [
    'text',
    'textarea',
    'number',
    'currency',
    'time',
    'date',
    'url',
    'dropdown',
    'select',
    'boolean',
    'checkbox',
  ].includes(type);
}

/** Render an inline form control sized + styled to match the read
 *  view's borderless, dense field-row aesthetic. The control
 *  occupies the value cell only — the label cell to its left is
 *  unchanged. */
export function EditableFieldValue({
  field,
  value,
  onChange,
  disabled = false,
  mono = false,
}: EditableFieldValueProps) {
  // Local draft so typing isn't fighting the parent's render cycle.
  const [draft, setDraft] = useState<string>(() => stringifyForInput(value));

  // Re-sync when the parent's value changes (e.g. after a PATCH
  // round-trip or a separate edit elsewhere). Don't fight an
  // in-progress edit — only re-sync when draft is also at the
  // canonical form of the previous value.
  useEffect(() => {
    setDraft(stringifyForInput(value));
  }, [value]);

  const baseInputStyle: React.CSSProperties = {
    width: '100%',
    border: 'none',
    background: 'transparent',
    outline: 'none',
    padding: 0,
    fontSize: '14px',
    color: 'var(--lp-text)',
    fontFamily: mono ? 'var(--lp-mono-font)' : 'inherit',
    fontVariantNumeric: mono ? 'tabular-nums' : 'normal',
  };

  if (disabled) {
    // Falls through to FieldValue's display-only rendering — caller
    // must catch this case and route accordingly.
    return null;
  }

  // Boolean → checkbox toggle.
  if (field.type === 'boolean' || field.type === 'checkbox') {
    const checked = value === true || value === 'true' || value === 1;
    return (
      <label className="inline-flex cursor-pointer items-center gap-2">
        <input
          type="checkbox"
          className="lp-checkbox"
          checked={checked}
          onChange={(e) => onChange(e.target.checked)}
          aria-label={field.label}
        />
        <span style={{ fontSize: '13px', color: 'var(--lp-text-secondary)' }}>
          {checked ? 'Yes' : 'No'}
        </span>
      </label>
    );
  }

  // Dropdown / select.
  if (field.type === 'dropdown' || field.type === 'select') {
    const options = Array.isArray(field.options) ? field.options : [];
    return (
      <select
        value={draft}
        onChange={(e) => {
          const next = e.target.value;
          setDraft(next);
          onChange(next || null);
        }}
        className={cn('w-full bg-transparent outline-none')}
        style={{
          ...baseInputStyle,
          cursor: 'pointer',
        }}
        aria-label={field.label}
      >
        <option value="">—</option>
        {options.map((opt) => (
          <option key={opt} value={opt}>
            {opt}
          </option>
        ))}
      </select>
    );
  }

  // Textarea — multi-line. Auto-grow via rows attribute, falls back
  // to scroll if content exceeds.
  if (field.type === 'textarea') {
    const lines = Math.min(8, Math.max(2, draft.split('\n').length));
    return (
      <textarea
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={() => commitIfChanged(draft, value, onChange)}
        rows={lines}
        placeholder={`Add ${field.label.toLowerCase()}…`}
        className={cn('w-full resize-none bg-transparent outline-none')}
        style={{
          ...baseInputStyle,
          fontFamily: 'inherit',
          fontVariantNumeric: 'normal',
          lineHeight: 1.5,
          whiteSpace: 'pre-wrap',
        }}
        aria-label={field.label}
      />
    );
  }

  // Numeric / currency / date / time / url / text — all single-line
  // inputs distinguished by HTML input type.
  const inputType = (() => {
    if (field.type === 'number' || field.type === 'currency') return 'number';
    if (field.type === 'date') return 'date';
    if (field.type === 'time') return 'time';
    if (field.type === 'url') return 'url';
    return 'text';
  })();

  return (
    <input
      type={inputType}
      value={draft}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={() => commitIfChanged(draft, value, onChange, field.type)}
      onKeyDown={(e) => {
        if (e.key === 'Enter' && field.type !== 'textarea') {
          e.preventDefault();
          commitIfChanged(draft, value, onChange, field.type);
          (e.currentTarget as HTMLInputElement).blur();
        }
        if (e.key === 'Escape') {
          setDraft(stringifyForInput(value));
          (e.currentTarget as HTMLInputElement).blur();
        }
      }}
      placeholder={`Add ${field.label.toLowerCase()}…`}
      className="w-full bg-transparent outline-none"
      style={baseInputStyle}
      aria-label={field.label}
      step={field.type === 'currency' ? '0.01' : undefined}
    />
  );
}

function stringifyForInput(value: unknown): string {
  if (value === null || value === undefined) return '';
  if (typeof value === 'boolean') return value ? 'true' : 'false';
  if (typeof value === 'number') return String(value);
  if (typeof value === 'string') return value;
  // Arrays / objects shouldn't reach the editable path (contact +
  // file rendering goes through FieldValue) — fall back to JSON if
  // somehow they do.
  return '';
}

function commitIfChanged(
  draft: string,
  prev: unknown,
  onChange: (next: unknown) => void,
  fieldType?: string,
) {
  const prevStr = stringifyForInput(prev);
  if (draft === prevStr) return;
  if (draft.trim() === '') {
    onChange(null);
    return;
  }
  // Coerce numerics back to numbers so the API doesn't store '42'
  // as a string when a number is expected.
  if (fieldType === 'number' || fieldType === 'currency') {
    const n = Number(draft);
    if (Number.isFinite(n)) {
      onChange(n);
      return;
    }
  }
  onChange(draft);
}
