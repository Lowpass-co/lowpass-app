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
    <div className="rounded-md border border-neutral-200 bg-white p-3 space-y-2">
      <div className="flex items-center justify-between gap-2">
        <LabelInput field={field} onChange={onChange} />
        {onRemove && (
          <button
            type="button"
            onClick={onRemove}
            className="text-xs text-neutral-500 hover:text-red-600"
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
      className="flex-1 text-sm font-medium bg-transparent outline-none border-b border-transparent focus:border-neutral-300"
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
      return <div className="text-xs text-neutral-500">Unknown field type.</div>;
  }
}

// ----- Per-type editors -----

function TextEditor({ field, onChange }: { field: FieldText; onChange: (n: FieldText) => void }) {
  return (
    <textarea
      value={field.value ?? ''}
      onChange={(e) => onChange({ ...field, value: e.target.value })}
      placeholder="Text..."
      className="w-full min-h-[80px] rounded border border-neutral-200 p-2 text-sm outline-none focus:border-neutral-400"
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
        className="rounded border border-neutral-200 px-2 py-1 text-sm"
      />
      <input
        type="text"
        value={field.tz ?? ''}
        onChange={(e) => onChange({ ...field, tz: e.target.value })}
        placeholder="Timezone (optional)"
        className="flex-1 rounded border border-neutral-200 px-2 py-1 text-sm"
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
        className="flex-1 rounded border border-neutral-200 px-2 py-1 text-sm"
      />
      <input
        type="text"
        value={field.currency ?? 'USD'}
        onChange={(e) => onChange({ ...field, currency: e.target.value.toUpperCase() })}
        maxLength={3}
        className="w-16 rounded border border-neutral-200 px-2 py-1 text-sm uppercase"
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
        className="flex-1 rounded border border-neutral-200 px-2 py-1 text-sm"
      />
      <input
        type="text"
        value={field.unit ?? ''}
        onChange={(e) => onChange({ ...field, unit: e.target.value })}
        placeholder="unit"
        className="w-24 rounded border border-neutral-200 px-2 py-1 text-sm"
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
        className="w-full rounded border border-neutral-200 px-2 py-1 text-sm"
      />
      <input
        type="text"
        value={field.display_text ?? ''}
        onChange={(e) => onChange({ ...field, display_text: e.target.value })}
        placeholder="Link text (optional)"
        className="w-full rounded border border-neutral-200 px-2 py-1 text-sm"
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
      <div className="flex flex-wrap items-center gap-2 text-xs text-neutral-500">
        <span>Columns:</span>
        {columns.map((c, i) => (
          <span key={i} className="inline-flex items-center gap-1 rounded bg-neutral-100 px-2 py-0.5">
            <input
              value={c.label}
              onChange={(e) => {
                const next = [...columns];
                next[i] = { ...c, label: e.target.value };
                setColumns(next);
              }}
              className="bg-transparent outline-none w-24"
            />
            <button
              type="button"
              className="text-neutral-400 hover:text-red-600"
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
          className="rounded bg-neutral-200 px-2 py-0.5 hover:bg-neutral-300"
        >
          + column
        </button>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr>
              {columns.map((c) => (
                <th key={c.key} className="px-2 py-1 text-left font-medium text-neutral-600">
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
                  <td key={c.key} className="border-t border-neutral-100 px-1 py-1">
                    <input
                      value={row[c.key] ?? ''}
                      onChange={(e) => {
                        const next = [...rows];
                        next[rowIdx] = { ...row, [c.key]: e.target.value };
                        setRows(next);
                      }}
                      className="w-full rounded border border-transparent px-1 py-0.5 text-sm outline-none focus:border-neutral-300"
                    />
                  </td>
                ))}
                <td className="border-t border-neutral-100 px-1 py-1 text-right">
                  <button
                    type="button"
                    onClick={() => setRows(rows.filter((_, j) => j !== rowIdx))}
                    className="text-xs text-neutral-400 hover:text-red-600"
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
        className="rounded bg-neutral-200 px-2 py-0.5 text-xs hover:bg-neutral-300"
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
            className="flex-1 rounded border border-neutral-200 px-2 py-1 text-sm"
          />
          <button
            type="button"
            onClick={() => onChange({ ...field, items: items.filter((_, j) => j !== i) })}
            className="text-xs text-neutral-400 hover:text-red-600"
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
        className="rounded bg-neutral-200 px-2 py-0.5 text-xs hover:bg-neutral-300"
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
      <div className="text-xs text-red-600">
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
          className="rounded border border-neutral-200 p-2 text-sm space-y-1 bg-neutral-50"
        >
          <div className="flex items-center justify-between gap-2">
            <span className="text-xs text-neutral-500">
              {entry.source === 'tour_personnel' && 'On tour'}
              {entry.source === 'contact' && 'Contact'}
              {entry.source === 'external' && 'External'}
            </span>
            <button
              type="button"
              className="text-xs text-neutral-400 hover:text-red-600"
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
              className="rounded border border-neutral-200 px-2 py-1 text-sm"
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
              className="rounded border border-neutral-200 px-2 py-1 text-sm"
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
              className="rounded border border-neutral-200 px-2 py-1 text-sm"
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
              className="rounded border border-neutral-200 px-2 py-1 text-sm"
            />
          </div>
        </div>
      ))}

      {open ? (
        <div className="rounded border border-neutral-200 p-2 space-y-2 bg-white">
          <input
            type="text"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search tour personnel & contacts..."
            className="w-full rounded border border-neutral-200 px-2 py-1 text-sm"
            autoFocus
          />
          <div className="max-h-48 overflow-y-auto space-y-1">
            {picker?.tour_personnel?.length ? (
              <>
                <div className="text-xs font-medium text-neutral-500 px-1">On tour</div>
                {picker.tour_personnel.map((c) => (
                  <button
                    key={c.id}
                    type="button"
                    onClick={() => addEntry(c)}
                    className="w-full text-left rounded px-2 py-1 text-sm hover:bg-neutral-100"
                  >
                    <div className="font-medium">{c.name || '(unnamed)'}</div>
                    <div className="text-xs text-neutral-500">{c.role ?? ''}</div>
                  </button>
                ))}
              </>
            ) : null}
            {picker?.contacts?.length ? (
              <>
                <div className="text-xs font-medium text-neutral-500 px-1 pt-1">Contacts</div>
                {picker.contacts.map((c) => (
                  <button
                    key={c.id}
                    type="button"
                    onClick={() => addEntry(c)}
                    className="w-full text-left rounded px-2 py-1 text-sm hover:bg-neutral-100"
                  >
                    <div className="font-medium">{c.name || '(unnamed)'}</div>
                    <div className="text-xs text-neutral-500">
                      {c.role ?? ''}
                      {c.company ? ` — ${c.company}` : ''}
                    </div>
                  </button>
                ))}
              </>
            ) : null}
            {!picker?.tour_personnel?.length && !picker?.contacts?.length && (
              <div className="text-xs text-neutral-500 px-1 py-2">No matches.</div>
            )}
          </div>
          <div className="flex items-center justify-between">
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="text-xs text-neutral-500 hover:text-neutral-900"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={addExternal}
              className="text-xs text-neutral-500 hover:text-neutral-900"
            >
              Add external...
            </button>
          </div>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="rounded bg-neutral-200 px-2 py-1 text-xs hover:bg-neutral-300"
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
