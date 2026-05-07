/* ============================================
   LOWPASS — Sprint 8.6 §6 — <AddPlatformFieldModal>

   Modal that adds a custom field to a platform-template section,
   forking the template into a workspace-scoped copy via
   POST /api/advance/templates/[id]/fork-add-field.

   Triggered by the "+ Add custom field" button at the bottom of
   each section card in the builder canvas. Distinguished from
   the existing <CustomFieldModal> (Sprint 6 era) which adds a
   field to the per-show advance instance only — this modal adds
   it to the workspace's library copy of the section, so future
   tours inherit the customization.

   Adam's UX warning text per Sprint 8.6 §6 sign-off: "Future
   {sectionName} sections only — existing ones won't change."
   ============================================ */

'use client';

import { useEffect, useId, useRef, useState } from 'react';
import { useToast } from '@/components/ui/Toast';

type FieldType =
  | 'text'
  | 'textarea'
  | 'number'
  | 'currency'
  | 'date'
  | 'time'
  | 'boolean'
  | 'select'
  | 'file'
  | 'url';

const FIELD_TYPE_OPTIONS: ReadonlyArray<{ value: FieldType; label: string }> = [
  { value: 'text', label: 'Text' },
  { value: 'textarea', label: 'Long text' },
  { value: 'number', label: 'Number' },
  { value: 'currency', label: 'Currency' },
  { value: 'date', label: 'Date' },
  { value: 'time', label: 'Time' },
  { value: 'boolean', label: 'Checkbox' },
  { value: 'select', label: 'Dropdown' },
  { value: 'file', label: 'File' },
  { value: 'url', label: 'Link' },
];

function slugify(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40);
}

export interface AddPlatformFieldModalProps {
  open: boolean;
  /** Template id being forked (platform OR workspace original). */
  templateId: string;
  /** Section name shown in the heading + warning. */
  sectionName: string;
  onClose: () => void;
  /** Called after a successful fork-add-field roundtrip with
   *  the (new or updated) workspace template. Caller should
   *  refresh the templates list + add the new field to the
   *  current section. */
  onFielded: (template: {
    id: string;
    workspace_id: string | null;
    name: string;
    fields: Array<{ id: string; label: string; type: string; required?: boolean }>;
    forked_from_id: string | null;
  }) => void;
}

export function AddPlatformFieldModal({
  open,
  templateId,
  sectionName,
  onClose,
  onFielded,
}: AddPlatformFieldModalProps) {
  const inputId = useId();
  const inputRef = useRef<HTMLInputElement | null>(null);
  const { showToast } = useToast();
  const [label, setLabel] = useState('');
  const [type, setType] = useState<FieldType>('text');
  const [required, setRequired] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Reset state on each open. queueMicrotask avoids the
  // react-hooks/set-state-in-effect lint.
  useEffect(() => {
    if (!open) return;
    queueMicrotask(() => {
      setLabel('');
      setType('text');
      setRequired(false);
      setError(null);
      setSubmitting(false);
    });
    const t = setTimeout(() => inputRef.current?.focus(), 50);
    return () => clearTimeout(t);
  }, [open]);

  // Esc closes when not submitting.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !submitting) onClose();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, submitting, onClose]);

  if (!open) return null;

  const trimmed = label.trim();
  const canSubmit = !!trimmed && !submitting;

  async function handleSubmit() {
    if (!canSubmit) return;
    setSubmitting(true);
    setError(null);
    try {
      const id = `${slugify(trimmed)}-${Math.random().toString(36).slice(2, 8)}`;
      const res = await fetch(
        `/api/advance/templates/${templateId}/fork-add-field`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            field: { id, label: trimmed, type, required },
          }),
        },
      );
      const body = (await res.json().catch(() => null)) as
        | {
            template?: AddPlatformFieldModalProps['onFielded'] extends (
              t: infer T,
            ) => void
              ? T
              : never;
            error?: string;
          }
        | null;
      if (!res.ok || !body?.template) {
        setError(body?.error ?? `Add failed (${res.status})`);
        setSubmitting(false);
        return;
      }
      showToast('Field added to workspace template');
      onFielded(body.template);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Network error');
      setSubmitting(false);
    }
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="lp-add-platform-field-title"
      className="fixed inset-0 z-[2500] flex items-center justify-center p-4"
      style={{
        background: 'color-mix(in srgb, black 55%, transparent)',
      }}
      onClick={() => !submitting && onClose()}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-md rounded-xl border shadow-xl animate-scale-in"
        style={{
          background: 'var(--lp-surface)',
          borderColor: 'var(--lp-border-strong)',
          padding: 'var(--lp-space-6)',
        }}
      >
        <h3
          id="lp-add-platform-field-title"
          className="lp-h3"
          style={{ margin: 0, color: 'var(--lp-text)' }}
        >
          Add field to {sectionName}
        </h3>
        <p
          className="mt-1"
          style={{
            fontSize: 'var(--lp-text-sm)',
            color: 'var(--lp-text-secondary)',
          }}
        >
          Field label, type, and required state.
        </p>

        {/* Label */}
        <label
          htmlFor={`${inputId}-label`}
          className="lp-label-caps mt-4"
          style={{
            display: 'block',
            color: 'var(--lp-text-secondary)',
            marginBottom: 'var(--lp-space-1)',
          }}
        >
          Field label *
        </label>
        <input
          id={`${inputId}-label`}
          ref={inputRef}
          type="text"
          value={label}
          onChange={(e) => {
            setLabel(e.target.value);
            setError(null);
          }}
          placeholder="e.g. Catering preferences"
          disabled={submitting}
          autoComplete="off"
          style={{
            width: '100%',
            padding: 'var(--lp-space-2) var(--lp-space-3)',
            fontSize: 'var(--lp-text-base)',
            color: 'var(--lp-text)',
            background: 'var(--lp-bg)',
            border: '1px solid var(--lp-border-strong)',
            borderRadius: 'var(--lp-radius-md)',
            outline: 'none',
          }}
        />

        {/* Type — radio group */}
        <label
          className="lp-label-caps"
          style={{
            display: 'block',
            color: 'var(--lp-text-secondary)',
            marginTop: 'var(--lp-space-3)',
            marginBottom: 'var(--lp-space-1)',
          }}
        >
          Field type *
        </label>
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: '1fr 1fr',
            gap: 'var(--lp-space-2)',
          }}
        >
          {FIELD_TYPE_OPTIONS.map((opt) => (
            <label
              key={opt.value}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 'var(--lp-space-2)',
                padding: 'var(--lp-space-2)',
                fontSize: 'var(--lp-text-sm)',
                color:
                  type === opt.value
                    ? 'var(--lp-text)'
                    : 'var(--lp-text-secondary)',
                background:
                  type === opt.value
                    ? 'color-mix(in srgb, var(--color-lp-orange) 8%, transparent)'
                    : 'transparent',
                border:
                  type === opt.value
                    ? '1px solid var(--color-lp-orange)'
                    : '1px solid var(--lp-border-strong)',
                borderRadius: 'var(--lp-radius-sm)',
                cursor: submitting ? 'not-allowed' : 'pointer',
              }}
            >
              <input
                type="radio"
                name="lp-platform-field-type"
                value={opt.value}
                checked={type === opt.value}
                onChange={() => setType(opt.value)}
                disabled={submitting}
                style={{ accentColor: 'var(--color-lp-orange)' }}
              />
              {opt.label}
            </label>
          ))}
        </div>

        {/* Required */}
        <label
          className="mt-4 inline-flex items-center"
          style={{
            gap: 'var(--lp-space-2)',
            fontSize: 'var(--lp-text-sm)',
            color: 'var(--lp-text)',
            cursor: submitting ? 'not-allowed' : 'pointer',
          }}
        >
          <input
            type="checkbox"
            checked={required}
            onChange={(e) => setRequired(e.target.checked)}
            disabled={submitting}
            style={{ accentColor: 'var(--color-lp-orange)' }}
          />
          Required field
        </label>

        {/* Sprint 8.6 §6 warning */}
        <div
          className="mt-4"
          style={{
            padding: 'var(--lp-space-3)',
            fontSize: 'var(--lp-text-xs)',
            color: 'var(--lp-text-secondary)',
            background: 'var(--lp-panel)',
            border: '1px solid var(--lp-border-subtle)',
            borderRadius: 'var(--lp-radius-md)',
            lineHeight: 1.5,
          }}
        >
          <span
            aria-hidden
            style={{
              color: 'var(--color-lp-orange)',
              marginRight: 'var(--lp-space-1)',
            }}
          >
            ⚠
          </span>
          Future <strong>{sectionName}</strong> sections only —
          existing ones won&apos;t change.
        </div>

        {error ? (
          <p
            className="mt-3"
            role="alert"
            style={{
              margin: 0,
              fontSize: 'var(--lp-text-sm)',
              color: 'var(--color-lp-error)',
            }}
          >
            {error}
          </p>
        ) : null}

        {/* Footer */}
        <div
          className="mt-6 flex justify-end"
          style={{ gap: 'var(--lp-space-3)' }}
        >
          <button
            type="button"
            onClick={() => !submitting && onClose()}
            disabled={submitting}
            className="btn-transition"
            style={{
              padding: 'var(--lp-space-2) var(--lp-space-4)',
              fontSize: 'var(--lp-text-sm)',
              fontWeight: 'var(--lp-weight-medium)',
              color: 'var(--lp-text-secondary)',
              background: 'transparent',
              border: '1px solid var(--lp-border-strong)',
              borderRadius: 'var(--lp-radius-md)',
              cursor: submitting ? 'not-allowed' : 'pointer',
              opacity: submitting ? 0.6 : 1,
            }}
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={() => void handleSubmit()}
            disabled={!canSubmit}
            className="btn-transition"
            style={{
              padding: 'var(--lp-space-2) var(--lp-space-4)',
              fontSize: 'var(--lp-text-sm)',
              fontWeight: 'var(--lp-weight-semibold)',
              color: canSubmit
                ? 'var(--lp-text-inverse)'
                : 'var(--lp-text-tertiary)',
              background: canSubmit
                ? 'var(--color-lp-orange)'
                : 'var(--lp-surface-hover)',
              border: '1px solid transparent',
              borderRadius: 'var(--lp-radius-md)',
              cursor: canSubmit ? 'pointer' : 'not-allowed',
              opacity: canSubmit ? 1 : 0.7,
            }}
          >
            {submitting ? 'Adding…' : 'Add field'}
          </button>
        </div>
      </div>
    </div>
  );
}
