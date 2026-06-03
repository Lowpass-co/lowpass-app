'use client';

/* ============================================
   LOWPASS — Field editors for the rider/pack editor

   Exports <FieldEditor> which dispatches on field.type.
   Text-like editors keep a local draft so server merges never
   clobber in-flight typing; parent is responsible for persisting
   (debounced + flush on blur from PackEditor).
   ============================================ */

import { useCallback, useEffect, useRef, useState, type FocusEvent } from 'react';
import clsx from 'clsx';
import { useDebouncedSave } from '@/hooks/useDebouncedSave';
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

export const FIELD_TYPE_LABELS: Record<Field['type'], string> = {
  text: 'Long text',
  table: 'Table',
  contact: 'Contacts',
  asset: 'Attachment',
  time: 'Date / time',
  currency: 'Currency',
  number: 'Number',
  checkbox_list: 'Yes / No list',
  url: 'Link',
};

type FieldEditorProps<F extends Field = Field> = {
  field: F;
  onChange: (next: F) => void;
  onRemove?: () => void;
  onDuplicate?: () => void;
  onFieldBlur?: () => void;
  isLast?: boolean;
  /** Tour id for the containing pack, if any. Contact picker uses it. */
  tourId?: string | null;
  /** Full pack context. Asset picker uses it. */
  packContext?: PackContext;
};

export function isFieldConsideredEmpty(field: Field): boolean {
  switch (field.type) {
    case 'text':
      return !(field.value && field.value.trim());
    case 'url':
      return !(field.href && field.href.trim());
    case 'time':
      return !(field.value && field.value.trim());
    case 'currency':
      return field.amount === 0 && field.currency === 'USD';
    case 'number':
      return field.value === 0 && !(field.unit && field.unit.trim());
    case 'table':
      return (field.rows?.length ?? 0) === 0;
    case 'contact':
      return (field.entries?.length ?? 0) === 0;
    case 'asset':
      return !field.asset_id;
    case 'checkbox_list':
      return (field.items?.length ?? 0) === 0;
    default:
      return false;
  }
}

export function FieldEditor({
  field,
  onChange,
  onRemove,
  onDuplicate,
  onFieldBlur,
  isLast,
  tourId,
  packContext,
}: FieldEditorProps) {
  const showTypeHint = isFieldConsideredEmpty(field);

  return (
    <div
      className={clsx(
        'group relative flex flex-col gap-3 border-b border-lp-border-light px-4 py-3 md:flex-row md:items-start',
        isLast && 'border-b-0',
      )}
    >
      <div className="w-full shrink-0 md:w-[28%] md:pr-2">
        <LabelInput field={field} onChange={onChange} onFieldBlur={onFieldBlur} />
        {showTypeHint && (
          <div className="mt-0.5 text-xs text-lp-text-tertiary">{FIELD_TYPE_LABELS[field.type]}</div>
        )}
      </div>
      <div className="min-w-0 flex-1">
        <Dispatcher
          field={field}
          onChange={onChange}
          onFieldBlur={onFieldBlur}
          tourId={tourId ?? null}
          packContext={packContext ?? null}
        />
      </div>
      {(onRemove || onDuplicate) && (
        <div className="flex shrink-0 items-start justify-end gap-1 self-end opacity-100 transition-opacity md:opacity-0 md:group-hover:opacity-100">
          {onDuplicate && (
            <button
              type="button"
              onClick={onDuplicate}
              className="text-xs text-lp-text-secondary hover:text-lp-text"
            >
              Duplicate
            </button>
          )}
          {onRemove && (
            <button
              type="button"
              onClick={onRemove}
              className="text-xs text-lp-text-secondary hover:text-lp-error"
            >
              Delete
            </button>
          )}
        </div>
      )}
    </div>
  );
}

function LabelInput({
  field,
  onChange,
  onFieldBlur,
}: {
  field: Field;
  onChange: (n: Field) => void;
  onFieldBlur?: () => void;
}) {
  const v = field.label ?? '';
  const [draft, setDraft] = useState(v);
  const dirtyRef = useRef(false);
  const commit = useCallback(
    async (label: string) => {
      dirtyRef.current = false;
      onChange({ ...field, label });
    },
    [field, onChange],
  );
  const save = useDebouncedSave(commit, 400);
  useEffect(() => {
    if (save.isPending() || dirtyRef.current) return;
    if (v !== draft) setDraft(v);
  }, [v, draft, save]);

  return (
    <input
      type="text"
      value={draft}
      onChange={(e) => {
        const next = e.target.value;
        dirtyRef.current = true;
        setDraft(next);
        save.schedule(next);
      }}
      onBlur={() => {
        void save.flush();
        onFieldBlur?.();
      }}
      placeholder="Field label"
      className="flex-1 border-b border-transparent bg-transparent py-1 text-base font-medium outline-none focus:border-lp-border"
    />
  );
}

function fireBlur(
  onFieldBlur: (() => void) | undefined,
  e: FocusEvent<HTMLElement>,
) {
  const next = e.relatedTarget;
  if (next && e.currentTarget.contains(next as Node)) return;
  onFieldBlur?.();
}

export function Dispatcher({
  field,
  onChange,
  onFieldBlur,
  tourId,
  packContext,
}: {
  field: Field;
  onChange: (n: Field) => void;
  onFieldBlur?: () => void;
  tourId: string | null;
  packContext: PackContext | null;
}) {
  switch (field.type) {
    case 'text':
      return (
        <TextEditor
          field={field}
          onChange={onChange as (n: FieldText) => void}
          onFieldBlur={onFieldBlur}
        />
      );
    case 'table':
      return (
        <TableEditor
          field={field}
          onChange={onChange as (n: FieldTable) => void}
          onFieldBlur={onFieldBlur}
        />
      );
    case 'contact':
      return (
        <ContactEditor
          field={field}
          onChange={onChange as (n: FieldContact) => void}
          tourId={tourId}
          onFieldBlur={onFieldBlur}
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
      return (
        <TimeEditor
          field={field}
          onChange={onChange as (n: FieldTime) => void}
          onFieldBlur={onFieldBlur}
        />
      );
    case 'currency':
      return (
        <CurrencyEditor
          field={field}
          onChange={onChange as (n: FieldCurrency) => void}
          onFieldBlur={onFieldBlur}
        />
      );
    case 'number':
      return (
        <NumberEditor
          field={field}
          onChange={onChange as (n: FieldNumber) => void}
          onFieldBlur={onFieldBlur}
        />
      );
    case 'checkbox_list':
      return (
        <CheckboxListEditor
          field={field}
          onChange={onChange as (n: FieldCheckboxList) => void}
          onFieldBlur={onFieldBlur}
        />
      );
    case 'url':
      return (
        <UrlEditor
          field={field}
          onChange={onChange as (n: FieldUrl) => void}
          onFieldBlur={onFieldBlur}
        />
      );
    default:
      return <div className="text-xs text-lp-text-secondary">Unknown field type.</div>;
  }
}

// ----- Per-type editors -----

function TextEditor({
  field,
  onChange,
  onFieldBlur,
}: {
  field: FieldText;
  onChange: (n: FieldText) => void;
  onFieldBlur?: () => void;
}) {
  const v = field.value ?? '';
  const [draft, setDraft] = useState(v);
  const dirtyRef = useRef(false);
  const commit = useCallback(
    async (value: string) => {
      dirtyRef.current = false;
      onChange({ ...field, value });
    },
    [field, onChange],
  );
  const save = useDebouncedSave(commit, 400);
  useEffect(() => {
    if (save.isPending() || dirtyRef.current) return;
    if (v !== draft) setDraft(v);
  }, [v, draft, save]);

  return (
    <textarea
      value={draft}
      onChange={(e) => {
        const next = e.target.value;
        dirtyRef.current = true;
        setDraft(next);
        save.schedule(next);
      }}
      onBlur={() => {
        void save.flush();
        onFieldBlur?.();
      }}
      placeholder="Text..."
      className="min-h-[140px] w-full rounded-md border border-lp-border px-3 py-2 text-sm outline-none focus:border-lp-border-light"
    />
  );
}

function TimeEditor({
  field,
  onChange,
  onFieldBlur,
}: {
  field: FieldTime;
  onChange: (n: FieldTime) => void;
  onFieldBlur?: () => void;
}) {
  const v = field.value ?? '';
  const tzV = field.tz ?? '';
  const [valDraft, setValDraft] = useState(v);
  const [tzDraft, setTzDraft] = useState(tzV);
  const dirtyRef = useRef(false);
  const commit = useCallback(
    async (payload: { value: string; tz: string }) => {
      dirtyRef.current = false;
      onChange({ ...field, value: payload.value, tz: payload.tz });
    },
    [field, onChange],
  );
  const save = useDebouncedSave(commit, 400);
  useEffect(() => {
    if (save.isPending() || dirtyRef.current) return;
    if (v !== valDraft) setValDraft(v);
  }, [v, valDraft, save]);
  useEffect(() => {
    if (save.isPending() || dirtyRef.current) return;
    if (tzV !== tzDraft) setTzDraft(tzV);
  }, [tzV, tzDraft, save]);

  return (
    <div
      className="flex items-center gap-2"
      onBlur={(e) => fireBlur(onFieldBlur, e)}
    >
      <input
        type="time"
        value={valDraft}
        onChange={(e) => {
          const next = e.target.value;
          dirtyRef.current = true;
          setValDraft(next);
          save.schedule({ value: next, tz: tzDraft });
        }}
        onBlur={() => {
          void save.flush();
        }}
        className="rounded-md border border-lp-border px-3 py-2 text-sm"
      />
      <input
        type="text"
        value={tzDraft}
        onChange={(e) => {
          const next = e.target.value;
          dirtyRef.current = true;
          setTzDraft(next);
          save.schedule({ value: valDraft, tz: next });
        }}
        onBlur={() => {
          void save.flush();
        }}
        placeholder="Timezone (optional)"
        className="flex-1 rounded-md border border-lp-border px-3 py-2 text-sm"
      />
    </div>
  );
}

function CurrencyEditor({
  field,
  onChange,
  onFieldBlur,
}: {
  field: FieldCurrency;
  onChange: (n: FieldCurrency) => void;
  onFieldBlur?: () => void;
}) {
  const [amountDraft, setAmountDraft] = useState(() =>
    Number.isFinite(field.amount) ? String(field.amount) : '',
  );
  const [curDraft, setCurDraft] = useState(field.currency ?? 'USD');
  const dirtyRef = useRef(false);
  const commit = useCallback(
    async (payload: { amount: number; currency: string }) => {
      dirtyRef.current = false;
      onChange({ ...field, amount: payload.amount, currency: payload.currency });
    },
    [field, onChange],
  );
  const save = useDebouncedSave(commit, 400);
  useEffect(() => {
    if (save.isPending() || dirtyRef.current) return;
    setAmountDraft(Number.isFinite(field.amount) ? String(field.amount) : '');
  }, [field.amount, save]);
  useEffect(() => {
    if (save.isPending() || dirtyRef.current) return;
    setCurDraft(field.currency ?? 'USD');
  }, [field.currency, save]);

  return (
    <div
      className="flex items-center gap-2"
      onBlur={(e) => {
        void save.flush();
        fireBlur(onFieldBlur, e);
      }}
    >
      <input
        type="number"
        value={amountDraft}
        onChange={(e) => {
          const s = e.target.value;
          const amount = Number(s) || 0;
          dirtyRef.current = true;
          setAmountDraft(s);
          save.schedule({ amount, currency: curDraft });
        }}
        step="0.01"
        className="flex-1 rounded-md border border-lp-border px-3 py-2 text-sm"
      />
      <input
        type="text"
        value={curDraft}
        onChange={(e) => {
          const next = e.target.value.toUpperCase();
          dirtyRef.current = true;
          setCurDraft(next);
          save.schedule({ amount: Number(amountDraft) || 0, currency: next });
        }}
        maxLength={3}
        className="w-20 rounded-md border border-lp-border px-3 py-2 text-sm uppercase"
      />
    </div>
  );
}

function NumberEditor({
  field,
  onChange,
  onFieldBlur,
}: {
  field: FieldNumber;
  onChange: (n: FieldNumber) => void;
  onFieldBlur?: () => void;
}) {
  const [numDraft, setNumDraft] = useState(() =>
    Number.isFinite(field.value) ? String(field.value) : '',
  );
  const [unitDraft, setUnitDraft] = useState(field.unit ?? '');
  const dirtyRef = useRef(false);
  const commit = useCallback(
    async (payload: { value: number; unit: string }) => {
      dirtyRef.current = false;
      onChange({ ...field, value: payload.value, unit: payload.unit });
    },
    [field, onChange],
  );
  const save = useDebouncedSave(commit, 400);
  useEffect(() => {
    if (save.isPending() || dirtyRef.current) return;
    setNumDraft(Number.isFinite(field.value) ? String(field.value) : '');
  }, [field.value, save]);
  useEffect(() => {
    if (save.isPending() || dirtyRef.current) return;
    setUnitDraft(field.unit ?? '');
  }, [field.unit, save]);

  return (
    <div
      className="flex items-center gap-2"
      onBlur={(e) => {
        void save.flush();
        fireBlur(onFieldBlur, e);
      }}
    >
      <input
        type="number"
        value={numDraft}
        onChange={(e) => {
          const s = e.target.value;
          const value = Number(s) || 0;
          dirtyRef.current = true;
          setNumDraft(s);
          save.schedule({ value, unit: unitDraft });
        }}
        className="flex-1 rounded-md border border-lp-border px-3 py-2 text-sm"
      />
      <input
        type="text"
        value={unitDraft}
        onChange={(e) => {
          const next = e.target.value;
          dirtyRef.current = true;
          setUnitDraft(next);
          save.schedule({ value: Number(numDraft) || 0, unit: next });
        }}
        placeholder="unit"
        className="w-28 rounded-md border border-lp-border px-3 py-2 text-sm"
      />
    </div>
  );
}

function UrlEditor({
  field,
  onChange,
  onFieldBlur,
}: {
  field: FieldUrl;
  onChange: (n: FieldUrl) => void;
  onFieldBlur?: () => void;
}) {
  const h = field.href ?? '';
  const d = field.display_text ?? '';
  const [hrefDraft, setHrefDraft] = useState(h);
  const [displayDraft, setDisplayDraft] = useState(d);
  const dirtyRef = useRef(false);
  const commit = useCallback(
    async (payload: { href: string; display_text: string }) => {
      dirtyRef.current = false;
      onChange({ ...field, href: payload.href, display_text: payload.display_text });
    },
    [field, onChange],
  );
  const save = useDebouncedSave(commit, 400);
  useEffect(() => {
    if (save.isPending() || dirtyRef.current) return;
    setHrefDraft(h);
  }, [h, save]);
  useEffect(() => {
    if (save.isPending() || dirtyRef.current) return;
    setDisplayDraft(d);
  }, [d, save]);

  return (
    <div
      className="space-y-2"
      onBlur={(e) => {
        void save.flush();
        fireBlur(onFieldBlur, e);
      }}
    >
      <input
        type="url"
        value={hrefDraft}
        onChange={(e) => {
          const next = e.target.value;
          dirtyRef.current = true;
          setHrefDraft(next);
          save.schedule({ href: next, display_text: displayDraft });
        }}
        placeholder="https://..."
        className="w-full rounded-md border border-lp-border px-3 py-2 text-sm"
      />
      <input
        type="text"
        value={displayDraft}
        onChange={(e) => {
          const next = e.target.value;
          dirtyRef.current = true;
          setDisplayDraft(next);
          save.schedule({ href: hrefDraft, display_text: next });
        }}
        placeholder="Link text (optional)"
        className="w-full rounded-md border border-lp-border px-3 py-2 text-sm"
      />
    </div>
  );
}

function TableEditor({
  field,
  onChange,
  onFieldBlur,
}: {
  field: FieldTable;
  onChange: (n: FieldTable) => void;
  onFieldBlur?: () => void;
}) {
  const columns = field.columns ?? [];
  const rows = field.rows ?? [];

  const setColumns = (next: typeof columns) => onChange({ ...field, columns: next });
  const setRows = (next: typeof rows) => onChange({ ...field, rows: next });

  return (
    <div
      className="space-y-2"
      onBlur={(e) => fireBlur(onFieldBlur, e)}
    >
      <div className="flex flex-wrap items-center gap-2 text-xs text-lp-text-secondary">
        <span>Columns:</span>
        {columns.map((c, i) => (
          <span
            key={c.key}
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
              onBlur={() => onFieldBlur?.()}
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
                      onBlur={() => onFieldBlur?.()}
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
  onFieldBlur,
}: {
  field: FieldCheckboxList;
  onChange: (n: FieldCheckboxList) => void;
  onFieldBlur?: () => void;
}) {
  const items = field.items ?? [];
  return (
    <div
      className="space-y-1"
      onBlur={(e) => fireBlur(onFieldBlur, e)}
    >
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
          <CheckboxItemLabel
            value={item.label}
            onChangeValue={(label) => {
              const next = [...items];
              next[i] = { ...item, label };
              onChange({ ...field, items: next });
            }}
            onFieldBlur={onFieldBlur}
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

function CheckboxItemLabel({
  value,
  onChangeValue,
  onFieldBlur,
}: {
  value: string;
  onChangeValue: (v: string) => void;
  onFieldBlur?: () => void;
}) {
  const [draft, setDraft] = useState(value);
  useEffect(() => {
    setDraft(value);
  }, [value]);

  return (
    <input
      type="text"
      value={draft}
      onChange={(e) => {
        const next = e.target.value;
        setDraft(next);
        onChangeValue(next);
      }}
      onBlur={() => onFieldBlur?.()}
      className="flex-1 rounded-md border border-lp-border px-3 py-2 text-sm"
    />
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
  onFieldBlur,
}: {
  field: FieldContact;
  onChange: (n: FieldContact) => void;
  tourId: string | null;
  onFieldBlur?: () => void;
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
    <div
      className="space-y-2"
      onBlur={(e) => fireBlur(onFieldBlur, e)}
    >
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
              onBlur={() => onFieldBlur?.()}
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
              onBlur={() => onFieldBlur?.()}
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
              onBlur={() => onFieldBlur?.()}
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
              onBlur={() => onFieldBlur?.()}
              placeholder="Phone"
              className="rounded-md border border-lp-border px-3 py-2 text-sm"
            />
          </div>
        </div>
      ))}

      {open ? (
        <div
          className="space-y-2 rounded-md border border-lp-border bg-lp-surface p-2"
          onClick={(e) => e.stopPropagation()}
        >
          <input
            type="text"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search tour personnel & contacts..."
            className="w-full rounded-md border border-lp-border px-3 py-2 text-sm"
            autoFocus
          />
          <div className="max-h-48 space-y-1 overflow-y-auto">
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
