/* ============================================
   LOWPASS — Advance · Field Properties Panel
   (Variant parity §D.5 · UX Audit 2026 T2.5b re-skin)

   300px right rail in builder mode (replaces AdvanceShowRightRail's
   slot in this mode). Reworked to match Adam's Template Builder
   screenshot: a titled "Field Properties" panel with

     - TYPE row (friendly name + 5-button type switcher)
     - Field Label
     - Placeholder Text
     - Help Text (Optional)
     - VALIDATION group: Required Field + Read-only toggles
     - Delete Field (footer, destructive)

   Adaptive via --lp tokens. Required toggle is wired through the
   existing onChange → builder dispatch loop; Placeholder / Read-only
   are design-surfaced now and wired to the builder's PATCH path in a
   follow-up (Adam's note: improve working functionality after the
   design lands). Delete Field dispatches `advance:field-delete` for
   the canvas to consume once wired — a harmless no-op until then.

   Selection wiring: AdvanceSectionBuilder owns field-def selection
   state and emits `advance:field-selected`; this panel renders the
   editor scaffold and emits changes back up via onChange.
   ============================================ */

'use client';

import {
  Type,
  CheckSquare,
  Hash,
  ChevronDown,
  Paperclip,
  Trash2,
} from 'lucide-react';

type FieldType = 'text' | 'checkbox' | 'number' | 'dropdown' | 'file';

interface SelectedField {
  id: string;
  type: FieldType;
  label: string;
  required: boolean;
  helpText?: string;
  /** Design-surfaced now; wired to the builder PATCH path in a follow-up. */
  placeholder?: string;
  readOnly?: boolean;
  /** Retained on the type for back-compat with the selection payload;
   *  no longer shown in the panel. */
  defaultAssigneeId?: string | null;
  dueOffsetDays?: number | null;
}

interface AdvanceFieldPropertiesPanelProps {
  selected: SelectedField | null;
  onChange?: (next: SelectedField) => void;
}

const TYPE_BUTTONS: {
  value: FieldType;
  label: string;
  Icon: React.ComponentType<{ size?: number }>;
}[] = [
  { value: 'text', label: 'Text', Icon: Type },
  { value: 'checkbox', label: 'Checkbox', Icon: CheckSquare },
  { value: 'number', label: 'Number', Icon: Hash },
  { value: 'dropdown', label: 'Dropdown', Icon: ChevronDown },
  { value: 'file', label: 'File', Icon: Paperclip },
];

const TYPE_FRIENDLY: Record<FieldType, string> = {
  text: 'Text (Single Line)',
  checkbox: 'Checkbox',
  number: 'Number',
  dropdown: 'Dropdown',
  file: 'File Upload',
};

export function AdvanceFieldPropertiesPanel({
  selected,
  onChange,
}: AdvanceFieldPropertiesPanelProps) {
  if (!selected) {
    return (
      <aside
        className="advance-read-no-print flex shrink-0 flex-col"
        style={{
          width: 300,
          borderLeft: '1px solid var(--lp-border-strong)',
          background: 'var(--lp-panel)',
        }}
      >
        <PanelHeader />
        <div
          className="flex flex-1 items-center justify-center"
          style={{
            padding: 24,
            color: 'var(--lp-text-tertiary)',
            fontSize: '13px',
            fontStyle: 'italic',
            textAlign: 'center',
          }}
        >
          Select a field to edit its properties.
        </div>
      </aside>
    );
  }

  const update = <K extends keyof SelectedField>(
    key: K,
    value: SelectedField[K],
  ) => {
    if (onChange) onChange({ ...selected, [key]: value });
  };

  const ActiveIcon =
    TYPE_BUTTONS.find((b) => b.value === selected.type)?.Icon ?? Type;

  return (
    <aside
      className="advance-read-no-print flex shrink-0 flex-col"
      style={{
        width: 300,
        borderLeft: '1px solid var(--lp-border-strong)',
        background: 'var(--lp-panel)',
      }}
    >
      <PanelHeader />

      <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto" style={{ padding: 16 }}>
        {/* TYPE — friendly name display + switcher grid. */}
        <Section title="Type">
          <div
            className="flex items-center gap-2"
            style={{ marginBottom: 8, color: 'var(--lp-text)', fontSize: '13px' }}
          >
            <span
              className="flex items-center justify-center"
              style={{
                width: 24,
                height: 24,
                borderRadius: 4,
                background: 'var(--lp-bg-deep)',
                border: '1px solid var(--lp-border-subtle)',
                color: 'var(--lp-text-secondary)',
              }}
            >
              <ActiveIcon size={13} />
            </span>
            {TYPE_FRIENDLY[selected.type]}
          </div>
          <div className="grid grid-cols-5 gap-1.5">
            {TYPE_BUTTONS.map(({ value, label, Icon }) => {
              const active = selected.type === value;
              return (
                <button
                  key={value}
                  type="button"
                  onClick={() => update('type', value)}
                  aria-pressed={active}
                  aria-label={label}
                  className="btn-transition flex items-center justify-center"
                  style={{
                    height: 40,
                    background: active ? 'var(--lp-surface)' : 'var(--lp-bg-deep)',
                    border: `1px solid ${active ? 'var(--color-lp-orange)' : 'var(--lp-border-strong)'}`,
                    borderRadius: 4,
                    color: active
                      ? 'var(--color-lp-orange)'
                      : 'var(--lp-text-secondary)',
                    cursor: 'pointer',
                  }}
                  title={label}
                >
                  <Icon size={14} />
                </button>
              );
            })}
          </div>
        </Section>

        <PropInput
          label="Field Label"
          value={selected.label}
          onChange={(v) => update('label', v)}
        />

        <PropInput
          label="Placeholder Text"
          value={selected.placeholder ?? ''}
          placeholder="e.g. The Ritz-Carlton"
          onChange={(v) => update('placeholder', v)}
        />

        <PropInput
          label="Help Text (Optional)"
          value={selected.helpText ?? ''}
          placeholder="Instructions for filling out this field…"
          onChange={(v) => update('helpText', v)}
        />

        {/* VALIDATION — Required + Read-only toggles. */}
        <Section title="Validation">
          <div className="flex flex-col gap-2.5">
            <ToggleRow
              label="Required Field"
              checked={selected.required}
              onChange={(v) => update('required', v)}
            />
            <ToggleRow
              label="Read-only for users"
              checked={selected.readOnly ?? false}
              onChange={(v) => update('readOnly', v)}
            />
          </div>
        </Section>
      </div>

      {/* Footer — destructive delete. Dispatches an event the canvas
          consumes once wired (no-op until then). */}
      <div
        className="shrink-0"
        style={{
          padding: 12,
          borderTop: '1px solid var(--lp-border-subtle)',
        }}
      >
        <button
          type="button"
          onClick={() => {
            if (typeof window !== 'undefined') {
              window.dispatchEvent(
                new CustomEvent('advance:field-delete', {
                  detail: { id: selected.id },
                }),
              );
            }
          }}
          className="btn-transition flex w-full items-center justify-center gap-1.5"
          style={{
            height: 34,
            fontSize: '13px',
            fontWeight: 500,
            color: 'var(--color-lp-error)',
            background: 'transparent',
            border: '1px solid color-mix(in srgb, var(--color-lp-error) 35%, transparent)',
            borderRadius: 6,
            cursor: 'pointer',
          }}
        >
          <Trash2 size={14} />
          Delete Field
        </button>
      </div>
    </aside>
  );
}

function PanelHeader() {
  return (
    <div
      className="shrink-0"
      style={{
        padding: '14px 16px',
        borderBottom: '1px solid var(--lp-border-subtle)',
        fontSize: '13px',
        fontWeight: 600,
        color: 'var(--lp-text)',
        letterSpacing: '0.01em',
      }}
    >
      Field Properties
    </div>
  );
}

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <div
        style={{
          fontSize: '11px',
          fontWeight: 600,
          letterSpacing: '0.06em',
          textTransform: 'uppercase',
          color: 'var(--lp-text-tertiary)',
          marginBottom: 6,
        }}
      >
        {title}
      </div>
      {children}
    </div>
  );
}

function PropInput({
  label,
  value,
  placeholder,
  onChange,
}: {
  label: string;
  value: string;
  placeholder?: string;
  onChange: (v: string) => void;
}) {
  return (
    <Section title={label}>
      <input
        type="text"
        value={value}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
        style={{
          width: '100%',
          padding: '7px 9px',
          fontSize: '13px',
          background: 'var(--lp-bg-deep)',
          color: 'var(--lp-text)',
          border: '1px solid var(--lp-border-strong)',
          borderRadius: 4,
          outline: 'none',
        }}
      />
    </Section>
  );
}

function ToggleRow({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <label
      className="flex cursor-pointer items-center justify-between"
      style={{ fontSize: '13px', color: 'var(--lp-text)' }}
    >
      {label}
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        aria-label={label}
        onClick={() => onChange(!checked)}
        className="btn-transition relative shrink-0"
        style={{
          width: 38,
          height: 20,
          borderRadius: 9999,
          background: checked
            ? 'var(--color-lp-orange)'
            : 'var(--lp-bg-deep)',
          border: `1px solid ${checked ? 'var(--color-lp-orange)' : 'var(--lp-border-strong)'}`,
          cursor: 'pointer',
        }}
      >
        <span
          aria-hidden
          style={{
            position: 'absolute',
            top: 2,
            left: checked ? 19 : 2,
            width: 14,
            height: 14,
            borderRadius: 9999,
            background: checked ? '#ffffff' : 'var(--lp-text-tertiary)',
            transition: 'left 160ms var(--lp-ease-standard, ease)',
          }}
        />
      </button>
    </label>
  );
}
