'use client';

/* ============================================
   LOWPASS — Import stock (Nov 2026)
   Paste a list ("8 x SM58", one per line) or a spreadsheet (copied cells,
   or a CSV file read in the browser — nothing is uploaded). Columns are
   recognised by name (parseImport). Every row is shown with a tick; names
   already in stock come unticked. One "Add N items".
   ============================================ */

import { useMemo, useRef, useState } from 'react';
import { FileText } from 'lucide-react';
import { SlideOver } from '@/components/ui/SlideOver';
import { Button } from '@/components/ui/Button';
import { useToast } from '@/components/ui/Toast';
import { alreadyInStock, parseImport, type ImportRow } from '@/lib/gear/importList';
import { fmtMoney } from '@/components/equipment/types';

const FIELD_LABEL: Record<string, string> = {
  name: 'Name', quantity: 'Qty', category: 'Category', manufacturer: 'Make', model: 'Model', serial: 'Serial',
  purchaseCost: 'Cost', dayRate: 'Day rate', value: 'Value', weightKg: 'Weight', notes: 'Notes',
};

export function ImportStockPanel({
  open,
  existingNames,
  onClose,
  onImported,
}: {
  open: boolean;
  existingNames: string[];
  onClose: () => void;
  onImported: () => void;
}) {
  return (
    <SlideOver open={open} onClose={onClose} title="Import stock" width="wide">
      {open ? <Body existingNames={existingNames} onClose={onClose} onImported={onImported} /> : null}
    </SlideOver>
  );
}

function Body({ existingNames, onClose, onImported }: { existingNames: string[]; onClose: () => void; onImported: () => void }) {
  const { showToast } = useToast();
  const fileRef = useRef<HTMLInputElement>(null);
  const [text, setText] = useState('');
  const [off, setOff] = useState<Set<number> | null>(null);
  const [busy, setBusy] = useState(false);

  const parsed = useMemo(() => parseImport(text), [text]);
  const dupes = useMemo(() => alreadyInStock(parsed.rows, existingNames), [parsed.rows, existingNames]);
  // Unticked: what you untick, else the names already in stock.
  const unticked = off ?? dupes;
  const picked = parsed.rows.filter((_, i) => !unticked.has(i));

  function toggle(i: number) {
    const next = new Set(unticked);
    if (next.has(i)) next.delete(i);
    else next.add(i);
    setOff(next);
  }

  async function readFile(f: File | undefined) {
    if (!f) return;
    if (f.size > 2_000_000) {
      showToast('That file is too big — 2 MB of text at most.', 'error');
      return;
    }
    setText(await f.text());
    setOff(null);
  }

  async function add() {
    setBusy(true);
    const res = await fetch('/api/gear/import', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ rows: picked }),
    });
    const j = (await res.json().catch(() => ({}))) as { added?: number; error?: string };
    setBusy(false);
    if (!res.ok) {
      showToast('Couldn’t import: ' + (j.error ?? res.status), 'error');
      return;
    }
    showToast(`${j.added ?? picked.length} item${(j.added ?? picked.length) === 1 ? '' : 's'} added to stock`, 'success');
    onImported();
    onClose();
  }

  const shownFields = parsed.mode === 'table'
    ? (Object.keys(parsed.columns) as Array<keyof ImportRow>).filter((f) => f !== 'name')
    : (['quantity'] as Array<keyof ImportRow>);

  return (
    <div className="flex flex-col gap-5" data-submit-scope>
      <div className="flex flex-col gap-2">
        <textarea
          value={text}
          onChange={(e) => { setText(e.target.value); setOff(null); }}
          rows={7}
          placeholder={'8 x Shure SM58\n2 x Beta 91A\nAvid S6L-24C\n\n…or paste cells copied from a spreadsheet, with a header row'}
          aria-label="Paste your list"
          className="w-full rounded-lg border bg-lp-surface px-3 py-2 font-mono text-sm text-lp-text outline-none placeholder:text-lp-text-tertiary focus-visible:border-[var(--color-lp-orange)]"
          style={{ borderColor: 'var(--lp-border)', resize: 'vertical' }}
          autoFocus
        />
        <div className="flex items-center justify-between gap-3 text-xs text-lp-text-tertiary">
          <button type="button" className="inline-flex items-center gap-1.5 text-lp-text-secondary hover:text-lp-text" onClick={() => fileRef.current?.click()}>
            <FileText size={13} aria-hidden /> Choose a CSV file
          </button>
          <input ref={fileRef} type="file" accept=".csv,.tsv,.txt,text/csv,text/plain" className="hidden" onChange={(e) => void readFile(e.target.files?.[0])} />
          {parsed.rows.length ? (
            <span>
              {parsed.mode === 'table'
                ? `Columns: ${Object.keys(parsed.columns).map((k) => FIELD_LABEL[k] ?? k).join(', ')}`
                : 'One item per line'}
              {parsed.skipped ? ` · ${parsed.skipped} line${parsed.skipped === 1 ? '' : 's'} skipped` : ''}
            </span>
          ) : null}
        </div>
      </div>

      {parsed.rows.length ? (
        <div className="overflow-hidden rounded-xl border" style={{ borderColor: 'var(--lp-border)' }}>
          <div className="max-h-[45vh] overflow-y-auto">
            {parsed.rows.map((r, i) => {
              const on = !unticked.has(i);
              return (
                <label
                  key={i}
                  className="flex cursor-pointer items-center gap-3 px-3 py-2 text-sm"
                  style={{ borderTop: i ? '1px solid var(--lp-border-light)' : undefined, opacity: on ? 1 : 0.55 }}
                >
                  <input type="checkbox" className="lp-checkbox" checked={on} onChange={() => toggle(i)} />
                  <span className="min-w-0 flex-1 truncate text-lp-text">{r.name}</span>
                  {dupes.has(i) ? <span className="shrink-0 text-xs" style={{ color: 'var(--color-lp-warning)' }}>already in stock</span> : null}
                  {shownFields.map((f) => {
                    const v = r[f];
                    if (v == null || v === '' || (f === 'quantity' && v === 1 && parsed.mode === 'list')) return null;
                    const shown = f === 'purchaseCost' || f === 'dayRate' || f === 'value' ? fmtMoney(Number(v), 'USD') : f === 'weightKg' ? `${v} kg` : f === 'quantity' ? `× ${v}` : String(v);
                    return <span key={f} className="shrink-0 max-w-[10rem] truncate text-xs tabular-nums text-lp-text-secondary">{shown}</span>;
                  })}
                </label>
              );
            })}
          </div>
        </div>
      ) : null}

      <div className="flex items-center justify-end gap-2 border-t pt-4" style={{ borderColor: 'var(--lp-border)' }}>
        <span className="mr-auto text-xs text-lp-text-tertiary">Money is read as USD, like the rest of your stock.</span>
        <Button variant="ghost" size="sm" onClick={onClose}>Cancel</Button>
        <Button variant="primary" size="sm" loading={busy} disabled={picked.length === 0} onClick={() => void add()} data-submit>
          {picked.length ? `Add ${picked.length} item${picked.length === 1 ? '' : 's'}` : 'Add items'}
        </Button>
      </div>
    </div>
  );
}
