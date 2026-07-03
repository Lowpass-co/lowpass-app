'use client';

/* ============================================
   LOWPASS — Rate-type toolbar (b2 UI phase)

   "Add rate type" + "Manage" for the dynamic Rates grid. Add creates a
   workspace rate_type (name · bucket · basis · day statuses) and seeds a 0 line
   for everyone on the tour; Manage renames / reorders / deletes CUSTOM types
   (defaults are locked). Delete soft-blocks when any amount is non-zero — the
   server returns 409 and we surface the reason.
   ============================================ */

import { useState, type ReactNode, type CSSProperties } from 'react';
import type { RateTypeMeta } from '@/lib/payroll/rateLines';
import { useToast } from '@/components/ui/Toast';

type Bucket = 'fee' | 'per_diem';
type Basis = 'per_day_status' | 'per_active_day' | 'flat_once';
const DAY_STATUSES: { value: 'show' | 'off_travel' | 'rehearsal'; label: string }[] = [
  { value: 'show', label: 'Show' },
  { value: 'off_travel', label: 'Off / Travel' },
  { value: 'rehearsal', label: 'Rehearsal' },
];

export function RateTypeToolbar({
  tourId,
  types,
  onAdded,
  onChanged,
  onDeleted,
}: {
  tourId: string;
  types: RateTypeMeta[];
  onAdded: (t: RateTypeMeta) => void;
  onChanged: (t: RateTypeMeta) => void;
  onDeleted: (id: string) => void;
}) {
  const { showToast } = useToast();
  const [mode, setMode] = useState<null | 'add' | 'manage'>(null);

  // Custom (workspace-owned) types are the ones with an order_index past the
  // six seeded defaults; the server only lets us edit/delete those anyway.
  const custom = types.filter((t) => !DEFAULT_IDS.has(t.id));

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
      <ToolbarButton onClick={() => setMode(mode === 'add' ? null : 'add')} active={mode === 'add'}>
        + Add rate type
      </ToolbarButton>
      <ToolbarButton onClick={() => setMode(mode === 'manage' ? null : 'manage')} active={mode === 'manage'}>
        Manage
      </ToolbarButton>

      {mode === 'add' ? (
        <Backdrop onClose={() => setMode(null)}>
          <AddForm
            onCancel={() => setMode(null)}
            onSubmit={async (payload) => {
              try {
                const res = await fetch('/api/budget/rate-types', {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ ...payload, tour_id: tourId }),
                });
                const j = await res.json();
                if (!res.ok) throw new Error(typeof j.error === 'string' ? j.error : 'Create failed');
                onAdded(toMeta(j));
                showToast(`Added rate type "${j.name}"`, 'success');
                setMode(null);
              } catch (e) {
                showToast(e instanceof Error ? e.message : 'Create failed', 'error');
              }
            }}
          />
        </Backdrop>
      ) : null}

      {mode === 'manage' ? (
        <Backdrop onClose={() => setMode(null)}>
          <ManageList
            custom={custom}
            onClose={() => setMode(null)}
            onRename={async (id, name) => {
              try {
                const res = await fetch('/api/budget/rate-types', {
                  method: 'PATCH',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ id, name }),
                });
                const j = await res.json();
                if (!res.ok) throw new Error(typeof j.error === 'string' ? j.error : 'Rename failed');
                onChanged(toMeta(j));
              } catch (e) {
                showToast(e instanceof Error ? e.message : 'Rename failed', 'error');
              }
            }}
            onReorder={async (id, order_index) => {
              try {
                const res = await fetch('/api/budget/rate-types', {
                  method: 'PATCH',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ id, order_index }),
                });
                const j = await res.json();
                if (!res.ok) throw new Error(typeof j.error === 'string' ? j.error : 'Reorder failed');
                onChanged(toMeta(j));
              } catch (e) {
                showToast(e instanceof Error ? e.message : 'Reorder failed', 'error');
              }
            }}
            onDelete={async (id) => {
              try {
                const res = await fetch(`/api/budget/rate-types?id=${encodeURIComponent(id)}`, { method: 'DELETE' });
                const j = await res.json();
                if (!res.ok) throw new Error(typeof j.error === 'string' ? j.error : 'Delete failed');
                onDeleted(id);
                showToast('Rate type deleted', 'success');
              } catch (e) {
                showToast(e instanceof Error ? e.message : 'Delete failed', 'error');
              }
            }}
          />
        </Backdrop>
      ) : null}
    </div>
  );
}

/** The six seeded global defaults (a1–a6) — never editable/deletable. */
const DEFAULT_IDS = new Set([
  '00000000-0000-0000-0000-0000000000a1',
  '00000000-0000-0000-0000-0000000000a2',
  '00000000-0000-0000-0000-0000000000a3',
  '00000000-0000-0000-0000-0000000000a4',
  '00000000-0000-0000-0000-0000000000a5',
  '00000000-0000-0000-0000-0000000000a6',
]);

function toMeta(row: {
  id: string; name: string; bucket: string; basis: string; day_statuses?: string[] | null; order_index: number;
}): RateTypeMeta {
  return {
    id: row.id,
    name: row.name,
    bucket: row.bucket as Bucket,
    basis: row.basis as Basis,
    dayStatuses: (row.day_statuses ?? []) as ('show' | 'off_travel' | 'rehearsal')[],
    orderIndex: row.order_index,
  };
}

function ToolbarButton({ children, onClick, active }: { children: ReactNode; onClick: () => void; active?: boolean }) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        border: '1px solid var(--lp-border)',
        borderRadius: 'var(--lp-radius-full)',
        padding: '4px 12px',
        fontSize: 12,
        fontWeight: 600,
        cursor: 'pointer',
        background: active ? 'var(--lp-orange)' : 'var(--lp-panel)',
        color: active ? 'var(--lp-text-inverse)' : 'var(--lp-text-secondary)',
      }}
    >
      {children}
    </button>
  );
}

function Backdrop({ children, onClose }: { children: ReactNode; onClose: () => void }) {
  return (
    <div
      onClick={onClose}
      style={{ position: 'fixed', inset: 0, background: 'color-mix(in srgb, black 40%, transparent)', zIndex: 60, display: 'flex', alignItems: 'flex-start', justifyContent: 'center', paddingTop: '12vh' }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{ width: 'min(440px, 92vw)', background: 'var(--lp-panel)', border: '1px solid var(--lp-border)', borderRadius: 'var(--lp-radius-lg)', boxShadow: 'var(--lp-shadow-lg)', padding: 20 }}
      >
        {children}
      </div>
    </div>
  );
}

function AddForm({ onSubmit, onCancel }: { onSubmit: (p: { name: string; bucket: Bucket; basis: Basis; day_statuses: string[] }) => void; onCancel: () => void }) {
  const [name, setName] = useState('');
  const [bucket, setBucket] = useState<Bucket>('fee');
  const [basis, setBasis] = useState<Basis>('per_day_status');
  const [days, setDays] = useState<Set<string>>(new Set(['show']));

  const canSave = name.trim().length > 0 && (basis !== 'per_day_status' || days.size > 0);

  return (
    <form
      onSubmit={(e) => { e.preventDefault(); if (canSave) onSubmit({ name: name.trim(), bucket, basis, day_statuses: [...days] }); }}
      style={{ display: 'flex', flexDirection: 'column', gap: 14 }}
    >
      <h3 style={{ fontSize: 15, fontWeight: 700, color: 'var(--lp-text)' }}>Add rate type</h3>
      <Field label="Name">
        <input autoFocus value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Overtime, Buyout" style={inputStyle} />
      </Field>
      <Field label="Bucket">
        <Segmented value={bucket} onChange={(v) => setBucket(v as Bucket)} options={[{ value: 'fee', label: 'Fee' }, { value: 'per_diem', label: 'Per diem' }]} />
      </Field>
      <Field label="Basis">
        <Segmented
          value={basis}
          onChange={(v) => setBasis(v as Basis)}
          options={[
            { value: 'per_day_status', label: 'Per day-status' },
            { value: 'per_active_day', label: 'Per active day' },
            { value: 'flat_once', label: 'Flat once' },
          ]}
        />
      </Field>
      {basis === 'per_day_status' ? (
        <Field label="Bills on which days">
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            {DAY_STATUSES.map((d) => {
              const on = days.has(d.value);
              return (
                <button
                  key={d.value}
                  type="button"
                  onClick={() => setDays((prev) => { const n = new Set(prev); if (n.has(d.value)) n.delete(d.value); else n.add(d.value); return n; })}
                  style={{ border: '1px solid var(--lp-border)', borderRadius: 'var(--lp-radius-full)', padding: '3px 10px', fontSize: 12, cursor: 'pointer', background: on ? 'var(--lp-orange)' : 'transparent', color: on ? 'var(--lp-text-inverse)' : 'var(--lp-text-secondary)' }}
                >
                  {d.label}
                </button>
              );
            })}
          </div>
        </Field>
      ) : null}
      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 4 }}>
        <GhostBtn onClick={onCancel}>Cancel</GhostBtn>
        <PrimaryBtn disabled={!canSave}>Add</PrimaryBtn>
      </div>
    </form>
  );
}

function ManageList({ custom, onRename, onReorder, onDelete, onClose }: {
  custom: RateTypeMeta[];
  onRename: (id: string, name: string) => void;
  onReorder: (id: string, order_index: number) => void;
  onDelete: (id: string) => void;
  onClose: () => void;
}) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <h3 style={{ fontSize: 15, fontWeight: 700, color: 'var(--lp-text)' }}>Manage custom rate types</h3>
      {custom.length === 0 ? (
        <p style={{ fontSize: 13, color: 'var(--lp-text-secondary)' }}>No custom types yet. The six defaults (Show, Off/Travel, Rehearsal, Per diem, Advance, Day rate) can’t be edited.</p>
      ) : (
        <ul style={{ display: 'flex', flexDirection: 'column', gap: 6, listStyle: 'none', padding: 0, margin: 0 }}>
          {custom.map((t) => (
            <li key={t.id} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <input
                defaultValue={t.name}
                onBlur={(e) => { const v = e.target.value.trim(); if (v && v !== t.name) onRename(t.id, v); }}
                style={{ ...inputStyle, flex: 1 }}
              />
              <span style={{ fontSize: 10, color: 'var(--lp-text-tertiary)', width: 56, textAlign: 'right' }}>{t.bucket === 'per_diem' ? 'per diem' : 'fee'}</span>
              <IconBtn title="Move up" onClick={() => onReorder(t.id, Math.max(0, t.orderIndex - 1))}>↑</IconBtn>
              <IconBtn title="Move down" onClick={() => onReorder(t.id, t.orderIndex + 1)}>↓</IconBtn>
              <IconBtn title="Delete" danger onClick={() => onDelete(t.id)}>✕</IconBtn>
            </li>
          ))}
        </ul>
      )}
      <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
        <GhostBtn onClick={onClose}>Done</GhostBtn>
      </div>
    </div>
  );
}

const inputStyle: CSSProperties = {
  border: '1px solid var(--lp-border)', borderRadius: 'var(--lp-radius-md)', padding: '6px 10px', fontSize: 13, background: 'var(--lp-surface)', color: 'var(--lp-text)', width: '100%',
};

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
      <span style={{ fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--lp-text-secondary)' }}>{label}</span>
      {children}
    </label>
  );
}

function Segmented({ value, onChange, options }: { value: string; onChange: (v: string) => void; options: { value: string; label: string }[] }) {
  return (
    <div style={{ display: 'inline-flex', gap: 2, border: '1px solid var(--lp-border)', borderRadius: 'var(--lp-radius-full)', padding: 3, background: 'var(--lp-surface)' }}>
      {options.map((o) => {
        const on = value === o.value;
        return (
          <button key={o.value} type="button" onClick={() => onChange(o.value)} style={{ border: 0, cursor: 'pointer', borderRadius: 'var(--lp-radius-full)', padding: '4px 12px', fontSize: 12, fontWeight: 600, background: on ? 'var(--lp-orange)' : 'transparent', color: on ? 'var(--lp-text-inverse)' : 'var(--lp-text-secondary)' }}>
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

function GhostBtn({ children, onClick }: { children: ReactNode; onClick: () => void }) {
  return <button type="button" onClick={onClick} style={{ border: '1px solid var(--lp-border)', borderRadius: 'var(--lp-radius-md)', padding: '6px 14px', fontSize: 13, fontWeight: 600, cursor: 'pointer', background: 'transparent', color: 'var(--lp-text-secondary)' }}>{children}</button>;
}

function PrimaryBtn({ children, disabled }: { children: ReactNode; disabled?: boolean }) {
  return <button type="submit" disabled={disabled} style={{ border: 0, borderRadius: 'var(--lp-radius-md)', padding: '6px 16px', fontSize: 13, fontWeight: 700, cursor: disabled ? 'not-allowed' : 'pointer', background: disabled ? 'var(--lp-border)' : 'var(--lp-orange)', color: 'var(--lp-text-inverse)', opacity: disabled ? 0.6 : 1 }}>{children}</button>;
}

function IconBtn({ children, onClick, title, danger }: { children: ReactNode; onClick: () => void; title: string; danger?: boolean }) {
  return <button type="button" title={title} onClick={onClick} style={{ border: '1px solid var(--lp-border)', borderRadius: 'var(--lp-radius-sm)', width: 26, height: 26, cursor: 'pointer', background: 'transparent', color: danger ? 'var(--lp-danger)' : 'var(--lp-text-secondary)', fontSize: 12 }}>{children}</button>;
}
