'use client';

/* ============================================
   LOWPASS — Field editors for the rider/pack editor

   Exports <FieldEditor> which dispatches on field.type.
   All editors are controlled: they call `onChange(nextField)`
   on every keystroke. Parent is responsible for persisting
   on blur / explicit save.

   Asset field renders a placeholder — a full asset picker UI
   is coming in R3b (it consumes the R2b API already shipped).
   Contact field uses the R2c /api/contacts/pick endpoint.
   ============================================ */

import { useEffect, useState } from 'react';
import type {
  Field,
  FieldText,
  FieldTable,
  FieldContact,
  FieldAsset,
  FieldTime,
  FieldCurrency,
  FieldNumber,
  FieldCheckboxList,
  FieldUrl,
} from '@/lib/rider-packs/types';
import { pickContacts, type PickedContact } from '@/lib/rider-packs/client';
import { AssetPicker, type PackContext } from './AssetPicker';

type FieldEditorProps<F extends Field = Field> = {
  field: F;
  onChange: (next: F) => void;
  onRemove?: () => void;
  /** Tour id for the containing pack, if any. Contact picker uses it. */
  tourId?: string | null;
  /** Full pack context. Asset picker uses it. */
  packContext?: PackContext;
};

export function FieldEditor({
  field,
  onChange,
  onRemove,
  tourId,
  packContext,
}: FieldEditorProps) {
  return (
    <div className="space-y-2 rounded-lg border border-lp-border bg-lp-bg-secondary p-4">
      <div className="flex items-center justify-between gap-2">
        <LabelInput field={field} onChange={onChange} />
        {onRemove && (
          <button
            type="button"
            onClick={onRemove}
            className="text-xs text-lp-text-secondary hover:text-lp-error"
          >
            Remove
          </button>
        )}
      </div>
      <Dispatcher
        field={field}
        onChange={onChange}
        tourId={tourId ?? null}
        packContext={packContext ?? null}
      />
    </div>
  );
}

function LabelInput({ field, onChange }: { field: Field; onChange: (n: Field) => void }) {
  return (
    <input
      type="text"
      value={field.label ?? ''}
      onChange={(e) => onChange({ ...field, label: e.target.value })}
      placeholder="Field label"
      className="flex-1 border-b border-transparent bg-transparent py-1 text-base font-medium outline-none focus:border-lp-border"
    />
  );
}

function Dispatcher({
  field,
  onChange,
  tourId,
  packContext,
}: {
  field: Field;
  onChange: (n: Field) => void;
  tourId: string | null;
  packContext: PackContext | null;
}) {
  switch (field.type) {
    case 'text':
      return <TextEditor field={field} onChange={onChange as (n: FieldText) => void} />;
    case 'table':
      return <TableEditor field={field} onChange={onChange as (n: FieldTable) => void} />;
    case 'contact':
      return (
        <ContactEditor
          field={field}
          onChange={onChange as (n: FieldContact) => void}
          tourId={tourId}
        />
      );
    case 'asset':
      return (
        <AssetEditor
          field={field}
          onChange={onChange as (n: FieldAsset) => void}
          packContext={packContext}
        />
      );
    case 'time':
      return <TimeEditor field={field} onChange={onChange as (n: FieldTime) => void} />;
    case 'currency':
      return <CurrencyEditor field={field} onChange={onChange as (n: FieldCurrency) => void} />;
    case 'number':
      return <NumberEditor field={field} onChange={onChange as (n: FieldNumber) => void} />;
    case 'checkbox_list':
      return (
        <CheckboxListEditor
          field={field}
          onChange={onChange as (n: FieldCheckboxList) => void}
        />
      );
    case 'url':
      return <UrlEditor field={field} onChange={onChange as (n: FieldUrl) => void} />;
    default:
      return <div className="text-xs text-lp-text-secondary">Unknown field type.</div>;
  }
}

// ----- Per-type editors -----

function TextEditor({ field, onChange }: { field: FieldText; onChange: (n: FieldText) => void }) {
  return (
    <textarea
      value={field.value ?? ''}
      onChange={(e) => onChange({ ...field, value: e.target.value })}
      placeholder="Text..."
      className="min-h-[140px] w-full rounded-md border border-lp-border px-3 py-2 text-sm outline-none focus:border-lp-border-light"
    />
  );
}

function TimeEditor({ field, onChange }: { field: FieldTime; onChange: (n: FieldTime) => void }) {
  return (
    <div className="flex items-center gap-2">
      <input
        type="time"
        value={field.value ?? ''}
        onChange={(e) => onChange({ ...field, value: e.target.value })}
        className="rounded-md border border-lp-border px-3 py-2 text-sm"
      />
      <input
        type="text"
        value={field.tz ?? ''}
        onChange={(e) => onChange({ ...field, tz: e.target.value })}
        placeholder="Timezone (optional)"
        className="flex-1 rounded-md border border-lp-border px-3 py-2 text-sm"
      />
    </div>
  );
}

function CurrencyEditor({
  field,
  onChange,
}: {
  field: FieldCurrency;
  onChange: (n: FieldCurrency) => void;
}) {
  return (
    <div className="flex items-center gap-2">
      <input
        type="number"
        value={Number.isFinite(field.amount) ? field.amount : 0}
        onChange={(e) => onChange({ ...field, amount: Number(e.target.value) || 0 })}
        step="0.01"
        className="flex-1 rounded-md border border-lp-border px-3 py-2 text-sm"
      />
      <input
        type="text"
        value={field.currency ?? 'USD'}
        onChange={(e) => onChange({ ...field, currency: e.target.value.toUpperCase() })}
        maxLength={3}
        className="w-20 rounded-md border border-lp-border px-3 py-2 text-sm uppercase"
      />
    </div>
  );
}

function NumberEditor({
  field,
  onChange,
}: {
  field: FieldNumber;
  onChange: (n: FieldNumber) => void;
}) {
  return (
    <div className="flex items-center gap-2">
      <input
        type="number"
        value={Number.isFinite(field.value) ? field.value : 0}
        onChange={(e) => onChange({ ...field, value: Number(e.target.value) || 0 })}
        className="flex-1 rounded-md border border-lp-border px-3 py-2 text-sm"
      />
      <input
        type="text"
        value={field.unit ?? ''}
        onChange={(e) => onChange({ ...field, unit: e.target.value })}
        placeholder="unit"
        className="w-28 rounded-md border border-lp-border px-3 py-2 text-sm"
      />
    </div>
  );
}

function UrlEditor({ field, onChange }: { field: FieldUrl; onChange: (n: FieldUrl) => void }) {
  return (
    <div className="space-y-2">
      <input
        type="url"
        value={field.href ?? ''}
        onChange={(e) => onChange({ ...field, href: e.target.value })}
        placeholder="https://..."
        className="w-full rounded-md border border-lp-border px-3 py-2 text-sm"
      />
      <input
        type="text"
        value={field.display_text ?? ''}
        onChange={(e) => onChange({ ...field, display_text: e.target.value })}
        placeholder="Link text (optional)"
        className="w-full rounded-md border border-lp-border px-3 py-2 text-sm"
      />
    </div>
  );
}

function TableEditor({ field, onChange }: { field: FieldTable; onChange: (n: FieldTable) => void }) {
  const columns = field.columns ?? [];
  const rows = field.rows ?? [];

  const setColumns = (next: typeof columns) => onChange({ ...field, columns: next });
  const setRows = (next: typeof rows) => onChange({ ...field, rows: next });

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-2 text-xs text-lp-text-secondary">
        <span>Columns:</span>
        {columns.map((c, i) => (
          <span
            key={i}
            className="inline-flex items-center gap-1 rounded px-2 py-0.5"
            style={{ backgroundColor: 'var(--lp-surface-hover)' }}
          >
            <input
              value={c.label}
              onChange={(e) => {
                const next = [...columns];
                next[i] = { ...c, label: e.target.value };
                setColumns(next);
              }}
              className="w-24 bg-transparent outline-none"
            />
            <button
              type="button"
              className="text-lp-text-tertiary hover:text-lp-error"
              onClick={() => {
                const next = columns.filter((_, j) => j !== i);
                setColumns(next);
                setRows(
                  rows.map((r) => {
                    const copy = { ...r };
                    delete copy[c.key];
                    return copy;
                  }),
                );
              }}
            >
              ×
            </button>
          </span>
        ))}
        <button
          type="button"
          onClick={() => {
            const key = `col_${Date.now().toString(36)}`;
            setColumns([...columns, { key, label: 'New column' }]);
          }}
          className="rounded bg-lp-bg-secondary px-2 py-0.5 hover:bg-lp-surface-hover"
        >
          + column
        </button>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr>
              {columns.map((c) => (
                <th key={c.key} className="px-2 py-1 text-left font-medium text-lp-text-secondary">
                  {c.label}
                </th>
              ))}
              <th />
            </tr>
          </thead>
          <tbody>
            {rows.map((row, rowIdx) => (
              <tr key={rowIdx}>
                {columns.map((c) => (
                  <td key={c.key} className="border-t border-lp-border-light px-1 py-1">
                    <input
                      value={row[c.key] ?? ''}
                      onChange={(e) => {
                        const next = [...rows];
                        next[rowIdx] = { ...row, [c.key]: e.target.value };
                        setRows(next);
                      }}
                      className="w-full rounded border border-transparent px-1 py-0.5 text-sm outline-none focus:border-lp-border"
                    />
                  </td>
                ))}
                <td className="border-t border-lp-border-light px-1 py-1 text-right">
                  <button
                    type="button"
                    onClick={() => setRows(rows.filter((_, j) => j !== rowIdx))}
                    className="text-xs text-lp-text-tertiary hover:text-lp-error"
                  >
                    ×
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <button
        type="button"
        onClick={() => setRows([...rows, Object.fromEntries(columns.map((c) => [c.key, '']))])}
        className="rounded bg-lp-bg-secondary px-2 py-0.5 text-xs hover:bg-lp-surface-hover"
      >
        + row
      </button>
    </div>
  );
}

function CheckboxListEditor({
  field,
  onChange,
}: {
  field: FieldCheckboxList;
  onChange: (n: FieldCheckboxList) => void;
}) {
  const items = field.items ?? [];
  return (
    <div className="space-y-1">
      {items.map((item, i) => (
        <div key={item.key} className="flex items-center gap-2">
          <input
            type="checkbox"
            checked={item.checked}
            onChange={(e) => {
              const next = [...items];
              next[i] = { ...item, checked: e.target.checked };
              onChange({ ...field, items: next });
            }}
          />
          <input
            type="text"
            value={item.label}
            onChange={(e) => {
              const next = [...items];
              next[i] = { ...item, label: e.target.value };
              onChange({ ...field, items: next });
            }}
            className="flex-1 rounded-md border border-lp-border px-3 py-2 text-sm"
          />
          <button
            type="button"
            onClick={() => onChange({ ...field, items: items.filter((_, j) => j !== i) })}
            className="text-xs text-lp-text-tertiary hover:text-lp-error"
          >
            ×
          </button>
        </div>
      ))}
      <button
        type="button"
        onClick={() =>
          onChange({
            ...field,
            items: [
              ...items,
              { key: `item_${Date.now().toString(36)}`, label: 'New item', checked: false },
            ],
          })
        }
        className="rounded bg-lp-bg-secondary px-2 py-0.5 text-xs hover:bg-lp-surface-hover"
      >
        + item
      </button>
    </div>
  );
}

function AssetEditor({
  field,
  onChange,
  packContext,
}: {
  field: FieldAsset;
  onChange: (n: FieldAsset) => void;
  packContext: PackContext | null;
}) {
  if (!packContext) {
    // Safety net — parent should always pass context.
    return (
      <div className="text-xs text-lp-error">
        Asset field has no pack context. This is a bug — please report.
      </div>
    );
  }
  return (
    <AssetPicker
      value={field.asset_id ?? ''}
      onChange={(assetId) => onChange({ ...field, asset_id: assetId })}
      packContext={packContext}
    />
  );
}

function ContactEditor({
  field,
  onChange,
  tourId,
}: {
  field: FieldContact;
  onChange: (n: FieldContact) => void;
  tourId: string | null;
}) {
  const [q, setQ] = useState('');
  const [picker, setPicker] = useState<{
    tour_personnel: PickedContact[];
    contacts: PickedContact[];
  } | null>(null);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    const t = setTimeout(async () => {
      try {
        const result = await pickContacts({ tourId: tourId ?? undefined, q, limit: 20 });
        if (!cancelled) setPicker(result);
      } catch {
        /* ignore — show empty */
      }
    }, 200);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [open, q, tourId]);

  const entries = field.entries ?? [];

  const addEntry = (c: PickedContact) => {
    const next: FieldContact['entries'][number] = {
      source: c.source,
      ref_id: c.id,
      name: c.name,
      role: c.role ?? undefined,
      email: c.email ?? undefined,
      phone: c.phone ?? undefined,
      company: c.company ?? undefined,
      notes: c.notes ?? undefined,
      show_fields: ['name', 'role', 'email', 'phone'],
    };
    onChange({ ...field, entries: [...entries, next] });
    setOpen(false);
    setQ('');
  };

  const addExternal = () => {
    onChange({
      ...field,
      entries: [
        ...entries,
        {
          source: 'external',
          name: '',
          role: '',
          email: '',
          phone: '',
          show_fields: ['name', 'role', 'email', 'phone'],
        },
      ],
    });
  };

  return (
    <div className="space-y-2">
      {entries.map((entry, i) => (
        <div
          key={i}
          className="space-y-1 rounded-md border border-lp-border p-2 text-sm"
          style={{ backgroundColor: 'var(--lp-bg-secondary)' }}
        >
          <div className="flex items-center justify-between gap-2">
            <span className="text-xs text-lp-text-secondary">
              {entry.source === 'tour_personnel' && 'On tour'}
              {entry.source === 'contact' && 'Contact'}
              {entry.source === 'external' && 'External'}
            </span>
            <button
              type="button"
              className="text-xs text-lp-text-tertiary hover:text-lp-error"
              onClick={() => onChange({ ...field, entries: entries.filter((_, j) => j !== i) })}
            >
              Remove
            </button>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <input
              type="text"
              value={entry.name ?? ''}
              onChange={(e) => {
                const next = [...entries];
                next[i] = { ...entry, name: e.target.value };
                onChange({ ...field, entries: next });
              }}
              placeholder="Name"
              className="rounded-md border border-lp-border px-3 py-2 text-sm"
            />
            <input
              type="text"
              value={entry.role ?? ''}
              onChange={(e) => {
                const next = [...entries];
                next[i] = { ...entry, role: e.target.value };
                onChange({ ...field, entries: next });
              }}
              placeholder="Role"
              className="rounded-md border border-lp-border px-3 py-2 text-sm"
            />
            <input
              type="email"
              value={entry.email ?? ''}
              onChange={(e) => {
                const next = [...entries];
                next[i] = { ...entry, email: e.target.value };
                onChange({ ...field, entries: next });
              }}
              placeholder="Email"
              className="rounded-md border border-lp-border px-3 py-2 text-sm"
            />
            <input
              type="tel"
              value={entry.phone ?? ''}
              onChange={(e) => {
                const next = [...entries];
                next[i] = { ...entry, phone: e.target.value };
                onChange({ ...field, entries: next });
              }}
              placeholder="Phone"
              className="rounded-md border border-lp-border px-3 py-2 text-sm"
            />
          </div>
        </div>
      ))}

      {open ? (
        <div className="space-y-2 rounded-md border border-lp-border bg-lp-surface p-2">
          <input
            type="text"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search tour personnel & contacts..."
            className="w-full rounded-md border border-lp-border px-3 py-2 text-sm"
            autoFocus
          />
          <div className="max-h-48 overflow-y-auto space-y-1">
            {picker?.tour_personnel?.length ? (
              <>
                <div className="px-1 text-xs font-medium text-lp-text-secondary">On tour</div>
                {picker.tour_personnel.map((c) => (
                  <button
                    key={c.id}
                    type="button"
                    onClick={() => addEntry(c)}
                    className="w-full rounded px-2 py-1 text-left text-sm hover:bg-lp-surface-hover"
                  >
                    <div className="font-medium">{c.name || '(unnamed)'}</div>
                    <div className="text-xs text-lp-text-secondary">{c.role ?? ''}</div>
                  </button>
                ))}
              </>
            ) : null}
            {picker?.contacts?.length ? (
              <>
                <div className="px-1 pt-1 text-xs font-medium text-lp-text-secondary">Contacts</div>
                {picker.contacts.map((c) => (
                  <button
                    key={c.id}
                    type="button"
                    onClick={() => addEntry(c)}
                    className="w-full rounded px-2 py-1 text-left text-sm hover:bg-lp-surface-hover"
                  >
                    <div className="font-medium">{c.name || '(unnamed)'}</div>
                    <div className="text-xs text-lp-text-secondary">
                      {c.role ?? ''}
                      {c.company ? ` — ${c.company}` : ''}
                    </div>
                  </button>
                ))}
              </>
            ) : null}
            {!picker?.tour_personnel?.length && !picker?.contacts?.length && (
              <div className="px-1 py-2 text-xs text-lp-text-secondary">No matches.</div>
            )}
          </div>
          <div className="flex items-center justify-between">
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="text-xs text-lp-text-secondary hover:text-lp-text"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={addExternal}
              className="text-xs text-lp-text-secondary hover:text-lp-text"
            >
              Add external...
            </button>
          </div>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="rounded bg-lp-bg-secondary px-2 py-1 text-xs hover:bg-lp-surface-hover"
        >
          + contact
        </button>
      )}
    </div>
  );
}

// Field type defaults — used by the "add field" dropdown in <PackEditor>.
export function makeDefaultField(type: Field['type']): Field {
  const baseKey = `f_${Date.now().toString(36)}`;
  switch (type) {
    case 'text':
      return { type, key: baseKey, label: 'Text', value: '' };
    case 'table':
      return {
        type,
        key: baseKey,
        label: 'Table',
        columns: [{ key: 'col1', label: 'Column' }],
        rows: [],
      };
    case 'contact':
      return { type, key: baseKey, label: 'Contacts', entries: [] };
    case 'asset':
      return { type, key: baseKey, label: 'Asset', asset_id: '' };
    case 'time':
      return { type, key: baseKey, label: 'Time', value: '' };
    case 'currency':
      return { type, key: baseKey, label: 'Amount', amount: 0, currency: 'USD' };
    case 'number':
      return { type, key: baseKey, label: 'Number', value: 0 };
    case 'checkbox_list':
      return { type, key: baseKey, label: 'Checklist', items: [] };
    case 'url':
      return { type, key: baseKey, label: 'Link', href: '' };
  }
}

export const FIELD_TYPE_LABELS: Record<Field['type'], string> = {
  text: 'Text',
  table: 'Table',
  contact: 'Contacts',
  asset: 'Asset (stub)',
  time: 'Time',
  currency: 'Currency',
  number: 'Number',
  checkbox_list: 'Checklist',
  url: 'Link',
};
