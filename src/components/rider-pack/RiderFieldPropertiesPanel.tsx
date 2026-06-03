/* ============================================
   LOWPASS — Rider · Field Properties Panel (§RA8)

   300px right rail in builder mode. Ports
   src/components/advance/AdvanceFieldPropertiesPanel.tsx:81-260 — same
   titled "Field Properties" panel, PanelHeader/Section chrome, type
   switcher, label input, and destructive footer.

   Rider adaptations (data-shape):
   - 9-type switcher (text/table/contact/asset/time/currency/number/
     checkbox_list/url) in a 3-col icon+label grid, vs Advance's 5-button
     icon-only row. Reuses RIDER_FIELD_META/FIELD_TYPE_ORDER from the
     builder so the icons match the section's field rows + library picker.
   - DROPPED Advance's Placeholder, Help Text, and Validation (Required /
     Read-only) sections: the rider Field union has no slot for any of
     them (it stores type + key + label + type-specific value only). A
     muted note explains values are entered in Show mode (the builder
     edits structure, not data).
   - Type change re-shapes the field (RiderSectionBuilder's listener
     rebuilds it via makeField, preserving key + label) — there's no user
     value to lose while editing a template's structure.

   Wiring: the canvas emits rider:field-selected; this panel renders the
   editor and emits changes back via onChange (→ rider:field-updated) and
   onDelete (→ rider:field-delete), both dispatched by the shell.
   ============================================ */

'use client';

import { Trash2 } from 'lucide-react';
import type { FieldType } from '@/lib/rider-packs/types';
import { RIDER_FIELD_META, FIELD_TYPE_ORDER } from './RiderSectionBuilder';

type SelectedRiderField = { id: string; type: string; label: string };

interface RiderFieldPropertiesPanelProps {
  selected: SelectedRiderField | null;
  onChange?: (next: { id: string; type: FieldType; label: string }) => void;
  onDelete?: (id: string) => void;
}

function isFieldType(t: string): t is FieldType {
  return (FIELD_TYPE_ORDER as string[]).includes(t);
}

export function RiderFieldPropertiesPanel({ selected, onChange, onDelete }: RiderFieldPropertiesPanelProps) {
  if (!selected) {
    return (
      <aside
        className="advance-read-no-print hidden shrink-0 flex-col lg:flex"
        style={{ width: 300, borderLeft: '1px solid var(--lp-border-strong)', background: 'var(--lp-panel)' }}
      >
        <PanelHeader />
        <div
          className="flex flex-1 items-center justify-center"
          style={{ padding: 24, color: 'var(--lp-text-tertiary)', fontSize: '13px', fontStyle: 'italic', textAlign: 'center' }}
        >
          Select a field to edit its properties.
        </div>
      </aside>
    );
  }

  const type: FieldType = isFieldType(selected.type) ? selected.type : 'text';
  const ActiveIcon = RIDER_FIELD_META[type].Icon;

  return (
    <aside
      className="advance-read-no-print hidden shrink-0 flex-col lg:flex"
      style={{ width: 300, borderLeft: '1px solid var(--lp-border-strong)', background: 'var(--lp-panel)' }}
    >
      <PanelHeader />

      <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto" style={{ padding: 16 }}>
        {/* TYPE — friendly name + 9-button switcher grid. */}
        <Section title="Type">
          <div className="flex items-center gap-2" style={{ marginBottom: 8, color: 'var(--lp-text)', fontSize: '13px' }}>
            <span
              className="flex items-center justify-center"
              style={{ width: 24, height: 24, borderRadius: 4, background: 'var(--lp-bg-deep)', border: '1px solid var(--lp-border-subtle)', color: 'var(--lp-text-secondary)' }}
            >
              <ActiveIcon size={13} />
            </span>
            {RIDER_FIELD_META[type].label}
          </div>
          <div className="grid grid-cols-3 gap-1.5">
            {FIELD_TYPE_ORDER.map((value) => {
              const { label, Icon } = RIDER_FIELD_META[value];
              const active = type === value;
              return (
                <button
                  key={value}
                  type="button"
                  onClick={() => onChange?.({ id: selected.id, type: value, label: selected.label })}
                  aria-pressed={active}
                  aria-label={label}
                  title={label}
                  className="btn-transition flex flex-col items-center justify-center gap-1"
                  style={{
                    height: 48,
                    background: active ? 'var(--lp-surface)' : 'var(--lp-bg-deep)',
                    border: `1px solid ${active ? 'var(--color-lp-orange)' : 'var(--lp-border-strong)'}`,
                    borderRadius: 4,
                    color: active ? 'var(--color-lp-orange)' : 'var(--lp-text-secondary)',
                    cursor: 'pointer',
                  }}
                >
                  <Icon size={14} />
                  <span style={{ fontSize: '10px', color: active ? 'var(--color-lp-orange)' : 'var(--lp-text-tertiary)' }}>{label}</span>
                </button>
              );
            })}
          </div>
        </Section>

        <Section title="Field Label">
          <input
            type="text"
            value={selected.label}
            placeholder="e.g. Tour Manager"
            onChange={(e) => onChange?.({ id: selected.id, type, label: e.target.value })}
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

        <p style={{ fontSize: '12px', color: 'var(--lp-text-tertiary)', fontStyle: 'italic', lineHeight: 1.5 }}>
          The builder edits a field’s structure. Its value is entered in Show mode.
        </p>
      </div>

      {/* Footer — destructive delete. */}
      <div className="shrink-0" style={{ padding: 12, borderTop: '1px solid var(--lp-border-subtle)' }}>
        <button
          type="button"
          onClick={() => onDelete?.(selected.id)}
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

function Section({ title, children }: { title: string; children: React.ReactNode }) {
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
