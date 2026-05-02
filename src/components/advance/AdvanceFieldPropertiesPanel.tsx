/* ============================================
   LOWPASS — Advance · Field Properties Panel (Variant parity §D.5)

   300px right rail in builder mode (replaces AdvanceShowRightRail's
   slot in this mode). When no field is selected, shows a muted
   "Select a field to edit its properties." placeholder. When a
   field is selected, renders:
     - 5-button field-type icon grid (text, checkbox, number,
       dropdown, file). EXPLICITLY NO "photo proof" button per
       Adam's lock.
     - Field Label input
     - Default Assignee select
     - Due Offset number + " Days" suffix
     - Required Field checkbox
     - Help Text input
     - Conditional Logic card

   Selection wiring: the existing AdvanceSectionBuilder is 5346
   lines and owns its own field-def selection state internally. This
   panel renders the visual scaffold; deeper integration (lifting
   selection up + wiring change handlers to the builder's PATCH
   path) is left for a follow-up. The panel currently shows the
   placeholder by default.
   ============================================ */

'use client';

import {
  Type,
  CheckSquare,
  Hash,
  ChevronDown,
  Paperclip,
} from 'lucide-react';

type FieldType = 'text' | 'checkbox' | 'number' | 'dropdown' | 'file';

interface SelectedField {
  id: string;
  type: FieldType;
  label: string;
  required: boolean;
  helpText?: string;
  /** ISO id of the workspace member who's the default assignee, or
   *  null. Resolved server-side. */
  defaultAssigneeId?: string | null;
  dueOffsetDays?: number | null;
}

interface AdvanceFieldPropertiesPanelProps {
  selected: SelectedField | null;
  /** Optional list of workspace members for the assignee select. */
  assigneeOptions?: { id: string; name: string }[];
  onChange?: (next: SelectedField) => void;
}

const TYPE_BUTTONS: { value: FieldType; label: string; Icon: React.ComponentType<{ size?: number }> }[] = [
  { value: 'text', label: 'Text', Icon: Type },
  { value: 'checkbox', label: 'Checkbox', Icon: CheckSquare },
  { value: 'number', label: 'Number', Icon: Hash },
  { value: 'dropdown', label: 'Dropdown', Icon: ChevronDown },
  { value: 'file', label: 'File', Icon: Paperclip },
];

export function AdvanceFieldPropertiesPanel({
  selected,
  assigneeOptions = [],
  onChange,
}: AdvanceFieldPropertiesPanelProps) {
  if (!selected) {
    return (
      <aside
        className="advance-read-no-print flex shrink-0 items-center justify-center"
        style={{
          width: 300,
          borderLeft: '1px solid var(--lp-border-strong)',
          background: 'var(--lp-panel)',
          padding: 16,
          color: 'var(--lp-text-tertiary)',
          fontSize: '13px',
          fontStyle: 'italic',
          textAlign: 'center',
        }}
      >
        Select a field to edit its properties.
      </aside>
    );
  }

  const update = <K extends keyof SelectedField>(key: K, value: SelectedField[K]) => {
    if (onChange) onChange({ ...selected, [key]: value });
  };

  return (
    <aside
      className="advance-read-no-print flex shrink-0 flex-col gap-3"
      style={{
        width: 300,
        borderLeft: '1px solid var(--lp-border-strong)',
        background: 'var(--lp-panel)',
        padding: 16,
      }}
    >
      <Section title="Field type">
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
                className="btn-transition flex flex-col items-center justify-center gap-1"
                style={{
                  height: 48,
                  background: active
                    ? 'var(--lp-surface)'
                    : 'var(--lp-bg-deep)',
                  border: `1px solid ${active ? 'var(--color-lp-orange)' : 'var(--lp-border-strong)'}`,
                  borderRadius: 4,
                  color: active ? 'var(--color-lp-orange)' : 'var(--lp-text-secondary)',
                  cursor: 'pointer',
                  fontSize: 0,
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
        label="Field label"
        value={selected.label}
        onChange={(v) => update('label', v)}
      />

      <PropSelect
        label="Default assignee"
        value={selected.defaultAssigneeId ?? ''}
        onChange={(v) => update('defaultAssigneeId', v || null)}
        options={[
          { value: '', label: 'Unassigned' },
          ...assigneeOptions.map((a) => ({ value: a.id, label: a.name })),
        ]}
      />

      <Section title="Due offset">
        <div className="flex items-center gap-2">
          <input
            type="number"
            value={selected.dueOffsetDays ?? 0}
            onChange={(e) => {
              const n = Number(e.target.value);
              update('dueOffsetDays', Number.isFinite(n) ? n : 0);
            }}
            className="lp-mono"
            style={{
              width: 72,
              padding: '4px 8px',
              fontSize: '13px',
              background: 'var(--lp-bg-deep)',
              color: 'var(--lp-text)',
              border: '1px solid var(--lp-border-strong)',
              borderRadius: 2,
              outline: 'none',
            }}
          />
          <span style={{ fontSize: '12px', color: 'var(--lp-text-tertiary)' }}>
            Days
          </span>
        </div>
      </Section>

      <label
        className="flex cursor-pointer items-center gap-2"
        style={{ fontSize: '13px', color: 'var(--lp-text)' }}
      >
        <input
          type="checkbox"
          checked={selected.required}
          onChange={(e) => update('required', e.target.checked)}
        />
        Required field
      </label>

      <PropInput
        label="Help text"
        value={selected.helpText ?? ''}
        onChange={(v) => update('helpText', v)}
      />

      {/* Conditional logic — visual scaffold only. The dropdown's
          "Specific conditions…" branch isn't wired further; the panel
          surfaces the affordance per Variant. */}
      <div
        style={{
          background: 'var(--lp-surface)',
          borderLeft: '2px solid var(--color-lp-orange)',
          padding: 10,
          borderRadius: 2,
        }}
      >
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
          Conditional logic
        </div>
        <select
          defaultValue="always"
          aria-label="Show this field only when"
          style={{
            width: '100%',
            padding: '6px 8px',
            fontSize: '13px',
            background: 'var(--lp-bg-deep)',
            color: 'var(--lp-text)',
            border: '1px solid var(--lp-border-strong)',
            borderRadius: 2,
          }}
        >
          <option value="always">Always show</option>
          <option value="conditions">Specific conditions…</option>
        </select>
      </div>
    </aside>
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
  onChange,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <Section title={label}>
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        style={{
          width: '100%',
          padding: '6px 8px',
          fontSize: '13px',
          background: 'var(--lp-bg-deep)',
          color: 'var(--lp-text)',
          border: '1px solid var(--lp-border-strong)',
          borderRadius: 2,
          outline: 'none',
        }}
      />
    </Section>
  );
}

function PropSelect({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: { value: string; label: string }[];
}) {
  return (
    <Section title={label}>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        style={{
          width: '100%',
          padding: '6px 8px',
          fontSize: '13px',
          background: 'var(--lp-bg-deep)',
          color: 'var(--lp-text)',
          border: '1px solid var(--lp-border-strong)',
          borderRadius: 2,
        }}
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </Section>
  );
}
