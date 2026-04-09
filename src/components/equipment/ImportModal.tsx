/* ============================================
   LOWPASS — Equipment / Import Modal
   Supports: CSV, XLSX (drag-drop or browse), Google Sheets URL
   ============================================ */

'use client';

import { useState, useRef, useCallback, DragEvent, ChangeEvent } from 'react';
import { X, Upload, Link2, ChevronRight, Check, Loader2, AlertCircle } from 'lucide-react';
import * as XLSX from 'xlsx';
import { createClient } from '@/lib/supabase-client';
import type { RentalInventoryItem } from './types';

/* ─── Types ─────────────────────────────────────────────────────────── */

type Step = 'source' | 'map' | 'importing' | 'done';
type SourceTab = 'file' | 'sheets';

interface ParsedData {
  fileName: string;
  headers: string[];
  rows: Record<string, string>[];
}

type FieldKey =
  | 'name'
  | 'category'
  | 'serial_number'
  | 'country_of_origin'
  | 'purchase_cost'
  | 'day_rate'
  | 'weight_kg'
  | 'notes';

type ColumnMap = Record<FieldKey, string>;

const FIELDS: { key: FieldKey; label: string; required?: boolean }[] = [
  { key: 'name',             label: 'Name',               required: true },
  { key: 'category',         label: 'Category'                           },
  { key: 'serial_number',    label: 'Serial Number'                      },
  { key: 'country_of_origin',label: 'Country of Origin'                  },
  { key: 'purchase_cost',    label: 'Purchase Cost ($)'                  },
  { key: 'day_rate',         label: 'Day Rate ($/day)'                   },
  { key: 'weight_kg',        label: 'Weight (kg)'                        },
  { key: 'notes',            label: 'Notes'                              },
];

/* ─── Helpers ────────────────────────────────────────────────────────── */

/** Normalise a header string for fuzzy matching */
const n = (s: string) => s.toLowerCase().replace(/[\s_\-\/().]/g, '');

/** Find the first header whose normalised form includes any of the given terms */
function match(headers: string[], ...terms: string[]): string {
  return headers.find(h => terms.some(t => n(h).includes(t))) ?? '';
}

function autoMap(headers: string[]): ColumnMap {
  // 'name' takes priority over 'description' for notes field, so map name first
  const nameCol = match(headers, 'name', 'item', 'description', 'gear', 'equipment', 'title');
  return {
    name:             nameCol,
    category:         match(headers, 'category', 'type', 'cat', 'class', 'kind'),
    serial_number:    match(headers, 'serial', 'sn', 'serialno', 'serialnum'),
    country_of_origin:match(headers, 'countryoforigin', 'origin', 'country', 'manufacture', 'mfr', 'madein'),
    // "VALUE ($)" normalises to "value$" — includes "value" ✓
    purchase_cost:    match(headers, 'purchasecost', 'purchaseprice', 'value', 'cost', 'price'),
    day_rate:         match(headers, 'dayrate', 'dailyrate', 'rentalrate', 'rate', 'daily'),
    // "WEIGHT (lb)" and "WEIGHT (kg)" both normalise to include "weight"
    weight_kg:        match(headers, 'weightkg', 'weight', 'kg', 'lb'),
    // Only map notes to 'description' if it wasn't already used for name
    notes:            match(
      headers.filter(h => h !== nameCol),
      'notes', 'note', 'comment', 'remarks', 'description'
    ),
  };
}

function parseWorkbook(data: ArrayBuffer | string, type: XLSX.ParsingOptions['type']): ParsedData {
  const wb = XLSX.read(data, { type });
  const ws = wb.Sheets[wb.SheetNames[0]];
  const raw = XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1, defval: '' }) as string[][];
  if (!raw.length) return { fileName: '', headers: [], rows: [] };

  // Skip leading blank rows and single-cell title rows (e.g. "EQUIPMENT MANIFEST,,,,,,,")
  // Find the first row that has at least 2 non-empty cells — that's the real header row.
  const headerIdx = raw.findIndex(
    row => row.filter(c => String(c).trim() !== '').length >= 2
  );
  if (headerIdx === -1) return { fileName: '', headers: [], rows: [] };

  const headers = raw[headerIdx]
    .map(h => String(h).trim())
    .filter(Boolean);

  const rows = raw
    .slice(headerIdx + 1)
    .filter(r => r.some(c => String(c).trim() !== '')) // drop fully empty rows
    .map(r =>
      Object.fromEntries(headers.map((h, i) => [h, String(r[i] ?? '').trim()]))
    );

  return { fileName: '', headers, rows };
}

function parseNum(raw: string): number | null {
  if (!raw) return null;
  const n = parseFloat(raw.replace(/[^0-9.-]/g, ''));
  return isNaN(n) ? null : n;
}

/* ─── Component ──────────────────────────────────────────────────────── */

interface Props {
  userId: string;
  onImported: (items: RentalInventoryItem[]) => void;
  onClose: () => void;
}

export function ImportModal({ userId, onImported, onClose }: Props) {
  const [step, setStep]         = useState<Step>('source');
  const [tab, setTab]           = useState<SourceTab>('file');
  const [dragging, setDragging] = useState(false);
  const [sheetsUrl, setSheetsUrl] = useState('');
  const [fetching, setFetching] = useState(false);
  const [fetchErr, setFetchErr] = useState('');
  const [parsed, setParsed]     = useState<ParsedData | null>(null);
  const [colMap, setColMap]     = useState<ColumnMap>({
    name: '', category: '', serial_number: '', country_of_origin: '',
    purchase_cost: '', day_rate: '', weight_kg: '', notes: '',
  });
  const [importResult, setImportResult] = useState({ success: 0, skipped: 0, errors: 0 });
  const fileRef = useRef<HTMLInputElement>(null);
  const supabase = createClient();

  /* ── File handling ── */
  const loadFile = useCallback(async (file: File) => {
    try {
      const buf = await file.arrayBuffer();
      const data = parseWorkbook(buf, 'array');
      data.fileName = file.name;
      if (!data.headers.length) throw new Error('No columns found — check the file has a header row.');
      setParsed(data);
      setColMap(autoMap(data.headers));
      setStep('map');
    } catch (e: any) {
      alert('Could not read file: ' + e.message);
    }
  }, []);

  const onDrop = useCallback((e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setDragging(false);
    const file = e.dataTransfer.files[0];
    if (file) loadFile(file);
  }, [loadFile]);

  const onFileChange = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) loadFile(file);
  };

  /* ── Google Sheets fetch ── */
  async function fetchSheet() {
    setFetchErr('');
    const m = sheetsUrl.match(/\/d\/([a-zA-Z0-9_-]+)/);
    if (!m) { setFetchErr('No sheet ID found in that URL.'); return; }
    setFetching(true);
    try {
      const res = await fetch(`/api/equipment/import-sheet?id=${m[1]}`);
      const text = await res.text();
      if (!res.ok) throw new Error(text);
      const data = parseWorkbook(text, 'string');
      data.fileName = 'Google Sheet';
      if (!data.headers.length) throw new Error('Sheet looks empty — check the URL and try again.');
      setParsed(data);
      setColMap(autoMap(data.headers));
      setStep('map');
    } catch (e: any) {
      setFetchErr(e.message || 'Could not fetch sheet.');
    } finally {
      setFetching(false);
    }
  }

  /* ── Import ── */
  async function doImport() {
    if (!parsed) return;
    setStep('importing');
    let success = 0, skipped = 0, errors = 0;

    // Build insert rows
    const rows: Omit<RentalInventoryItem, 'id' | 'created_at'>[] = [];
    for (const row of parsed.rows) {
      const nameVal = colMap.name ? row[colMap.name]?.trim() : '';
      if (!nameVal) { skipped++; continue; }
      rows.push({
        user_id:           userId,
        name:              nameVal,
        category:          colMap.category          ? row[colMap.category]          || null : null,
        serial_number:     colMap.serial_number     ? row[colMap.serial_number]     || null : null,
        country_of_origin: colMap.country_of_origin ? row[colMap.country_of_origin] || null : null,
        purchase_cost:     parseNum(colMap.purchase_cost     ? row[colMap.purchase_cost]     : ''),
        day_rate:          parseNum(colMap.day_rate          ? row[colMap.day_rate]          : ''),
        weight_kg:         parseNum(colMap.weight_kg         ? row[colMap.weight_kg]         : ''),
        notes:             colMap.notes             ? row[colMap.notes]             || null : null,
        image_url:         null,
      });
    }

    // Batch insert in chunks of 50
    for (let i = 0; i < rows.length; i += 50) {
      const chunk = rows.slice(i, i + 50);
      const { data, error } = await supabase
        .from('rental_inventory')
        .insert(chunk)
        .select();
      if (error) {
        errors += chunk.length;
      } else {
        success += data.length;
        onImported(data as RentalInventoryItem[]);
      }
    }

    setImportResult({ success, skipped, errors });
    setStep('done');
  }

  /* ── Render helpers ── */
  const HeaderOption = ({ src }: { src: SourceTab }) => (
    <button
      type="button"
      onClick={() => setTab(src)}
      className="flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-semibold transition-colors"
      style={{
        backgroundColor: tab === src ? 'rgba(255,69,0,0.1)' : 'transparent',
        color: tab === src ? '#FF4500' : 'var(--lp-text-secondary)',
        border: `1px solid ${tab === src ? '#FF4500' : 'transparent'}`,
      }}
    >
      {src === 'file' ? <Upload size={15} /> : <Link2 size={15} />}
      {src === 'file' ? 'Upload File' : 'Google Sheets'}
    </button>
  );

  /* ── Backdrop ── */
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ backgroundColor: 'rgba(0,0,0,0.55)', backdropFilter: 'blur(4px)' }}
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div
        className="relative flex w-full max-w-2xl flex-col rounded-2xl shadow-2xl"
        style={{ backgroundColor: 'var(--lp-surface)', border: '1px solid var(--lp-border)' }}
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b px-6 py-4" style={{ borderColor: 'var(--lp-border)' }}>
          <div>
            <h2 className="text-base font-bold" style={{ color: 'var(--lp-text)' }}>
              Import Gear
            </h2>
            <p className="mt-0.5 text-xs" style={{ color: 'var(--lp-text-tertiary)' }}>
              {step === 'source' && 'Upload a CSV / Excel file or link a Google Sheet.'}
              {step === 'map'    && `${parsed?.rows.length ?? 0} rows found in ${parsed?.fileName} — map the columns below.`}
              {step === 'importing' && 'Importing…'}
              {step === 'done'   && 'Import complete.'}
            </p>
          </div>
          <button
            onClick={onClose}
            className="rounded-lg p-1.5 transition-colors"
            style={{ color: 'var(--lp-text-tertiary)' }}
            onMouseOver={e => (e.currentTarget.style.color = 'var(--lp-text)')}
            onMouseOut={e => (e.currentTarget.style.color = 'var(--lp-text-tertiary)')}
          >
            <X size={18} />
          </button>
        </div>

        {/* ── Step: source ─────────────────────────────────── */}
        {step === 'source' && (
          <div className="flex flex-col gap-5 p-6">
            {/* Tabs */}
            <div className="flex gap-2">
              <HeaderOption src="file" />
              <HeaderOption src="sheets" />
            </div>

            {/* File tab */}
            {tab === 'file' && (
              <>
                <div
                  className="flex cursor-pointer flex-col items-center justify-center gap-3 rounded-xl border-2 border-dashed px-6 py-12 text-center transition-colors"
                  style={{
                    borderColor: dragging ? '#FF4500' : 'var(--lp-border)',
                    backgroundColor: dragging ? 'rgba(255,69,0,0.04)' : 'var(--lp-bg-secondary)',
                  }}
                  onDragOver={e => { e.preventDefault(); setDragging(true); }}
                  onDragLeave={() => setDragging(false)}
                  onDrop={onDrop}
                  onClick={() => fileRef.current?.click()}
                >
                  <div
                    className="flex h-12 w-12 items-center justify-center rounded-full"
                    style={{ backgroundColor: 'rgba(255,69,0,0.1)' }}
                  >
                    <Upload size={22} style={{ color: '#FF4500' }} />
                  </div>
                  <div>
                    <p className="text-sm font-semibold" style={{ color: 'var(--lp-text)' }}>
                      Drop a file here, or <span style={{ color: '#FF4500' }}>browse</span>
                    </p>
                    <p className="mt-1 text-xs" style={{ color: 'var(--lp-text-tertiary)' }}>
                      Supports .csv and .xlsx
                    </p>
                  </div>
                </div>
                <input
                  ref={fileRef}
                  type="file"
                  accept=".csv,.xlsx,.xls"
                  className="hidden"
                  onChange={onFileChange}
                />
              </>
            )}

            {/* Google Sheets tab */}
            {tab === 'sheets' && (
              <div className="flex flex-col gap-3">
                <p className="text-xs" style={{ color: 'var(--lp-text-secondary)' }}>
                  The sheet must be set to{' '}
                  <strong style={{ color: 'var(--lp-text)' }}>"Anyone with the link can view"</strong>
                  {' '}in Google Sheets sharing settings.
                </p>
                <div className="flex gap-2">
                  <input
                    value={sheetsUrl}
                    onChange={e => setSheetsUrl(e.target.value)}
                    placeholder="https://docs.google.com/spreadsheets/d/…"
                    className="lp-input flex-1 text-sm"
                    onKeyDown={e => { if (e.key === 'Enter' && sheetsUrl) fetchSheet(); }}
                  />
                  <button
                    type="button"
                    disabled={!sheetsUrl || fetching}
                    onClick={fetchSheet}
                    className="flex shrink-0 items-center gap-2 rounded-lg px-4 py-2 text-sm font-semibold text-white transition-colors disabled:opacity-50"
                    style={{ backgroundColor: '#FF4500' }}
                    onMouseOver={e => { if (!fetching) e.currentTarget.style.backgroundColor = '#E63E00'; }}
                    onMouseOut={e => (e.currentTarget.style.backgroundColor = '#FF4500')}
                  >
                    {fetching ? <Loader2 size={14} className="animate-spin" /> : <ChevronRight size={14} />}
                    {fetching ? 'Fetching…' : 'Fetch'}
                  </button>
                </div>
                {fetchErr && (
                  <div className="flex items-start gap-2 rounded-lg px-3 py-2.5 text-xs" style={{ backgroundColor: 'rgba(239,68,68,0.08)', color: '#EF4444' }}>
                    <AlertCircle size={13} className="mt-0.5 shrink-0" />
                    {fetchErr}
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* ── Step: map ────────────────────────────────────── */}
        {step === 'map' && parsed && (
          <div className="flex flex-col gap-5 p-6">
            {/* Column mapper */}
            <div
              className="overflow-hidden rounded-xl border"
              style={{ borderColor: 'var(--lp-border)' }}
            >
              <table className="w-full text-sm">
                <thead>
                  <tr style={{ backgroundColor: 'var(--lp-bg-secondary)', borderBottom: '1px solid var(--lp-border)' }}>
                    <th className="px-4 py-2.5 text-left text-xs font-extrabold uppercase tracking-wider" style={{ color: 'var(--lp-text-tertiary)' }}>
                      Inventory Field
                    </th>
                    <th className="px-4 py-2.5 text-left text-xs font-extrabold uppercase tracking-wider" style={{ color: 'var(--lp-text-tertiary)' }}>
                      Source Column
                    </th>
                    <th className="px-4 py-2.5 text-left text-xs font-extrabold uppercase tracking-wider" style={{ color: 'var(--lp-text-tertiary)' }}>
                      Preview
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {FIELDS.map(({ key, label, required }, idx) => {
                    const selectedCol = colMap[key];
                    const preview = selectedCol ? (parsed.rows[0]?.[selectedCol] ?? '') : '';
                    return (
                      <tr
                        key={key}
                        style={{ borderBottom: idx < FIELDS.length - 1 ? '1px solid var(--lp-border-light)' : 'none' }}
                      >
                        <td className="px-4 py-2">
                          <span className="text-sm font-medium" style={{ color: 'var(--lp-text)' }}>
                            {label}
                          </span>
                          {required && (
                            <span className="ml-1 text-xs font-bold" style={{ color: '#FF4500' }}>*</span>
                          )}
                        </td>
                        <td className="px-4 py-2">
                          <select
                            value={selectedCol}
                            onChange={e => setColMap(m => ({ ...m, [key]: e.target.value }))}
                            className="w-full rounded-md border px-2 py-1.5 text-xs"
                            style={{
                              backgroundColor: 'var(--lp-surface)',
                              borderColor: 'var(--lp-border)',
                              color: 'var(--lp-text)',
                            }}
                          >
                            <option value="">— skip —</option>
                            {parsed.headers.map(h => (
                              <option key={h} value={h}>{h}</option>
                            ))}
                          </select>
                        </td>
                        <td className="max-w-[180px] truncate px-4 py-2 text-xs" style={{ color: 'var(--lp-text-tertiary)' }}>
                          {preview || <span style={{ opacity: 0.4 }}>—</span>}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* Action row */}
            <div className="flex items-center justify-between">
              <button
                type="button"
                onClick={() => setStep('source')}
                className="text-sm font-medium"
                style={{ color: 'var(--lp-text-secondary)' }}
              >
                ← Back
              </button>
              <div className="flex items-center gap-3">
                <span className="text-xs" style={{ color: 'var(--lp-text-tertiary)' }}>
                  {parsed.rows.length} row{parsed.rows.length !== 1 ? 's' : ''} to import
                </span>
                <button
                  type="button"
                  disabled={!colMap.name}
                  onClick={doImport}
                  className="flex items-center gap-2 rounded-lg px-5 py-2 text-sm font-bold text-white transition-colors disabled:opacity-40"
                  style={{ backgroundColor: '#FF4500' }}
                  onMouseOver={e => { if (colMap.name) e.currentTarget.style.backgroundColor = '#E63E00'; }}
                  onMouseOut={e => (e.currentTarget.style.backgroundColor = '#FF4500')}
                >
                  <ChevronRight size={15} strokeWidth={2.5} />
                  Import {parsed.rows.length} item{parsed.rows.length !== 1 ? 's' : ''}
                </button>
              </div>
            </div>
            {!colMap.name && (
              <p className="text-center text-xs" style={{ color: '#EF4444' }}>
                Map the "Name" field to continue — it's required.
              </p>
            )}
          </div>
        )}

        {/* ── Step: importing ──────────────────────────────── */}
        {step === 'importing' && (
          <div className="flex flex-col items-center justify-center gap-4 py-16">
            <Loader2 size={32} className="animate-spin" style={{ color: '#FF4500' }} />
            <p className="text-sm font-medium" style={{ color: 'var(--lp-text-secondary)' }}>
              Importing gear…
            </p>
          </div>
        )}

        {/* ── Step: done ────────────────────────────────────── */}
        {step === 'done' && (
          <div className="flex flex-col items-center gap-5 py-12 px-6 text-center">
            <div
              className="flex h-14 w-14 items-center justify-center rounded-full"
              style={{ backgroundColor: 'rgba(34,197,94,0.12)' }}
            >
              <Check size={26} style={{ color: '#22C55E' }} />
            </div>
            <div>
              <p className="text-base font-bold" style={{ color: 'var(--lp-text)' }}>
                {importResult.success} item{importResult.success !== 1 ? 's' : ''} added
              </p>
              {(importResult.skipped > 0 || importResult.errors > 0) && (
                <p className="mt-1 text-xs" style={{ color: 'var(--lp-text-tertiary)' }}>
                  {importResult.skipped > 0 && `${importResult.skipped} row${importResult.skipped !== 1 ? 's' : ''} skipped (no name)`}
                  {importResult.skipped > 0 && importResult.errors > 0 && ' · '}
                  {importResult.errors > 0 && `${importResult.errors} error${importResult.errors !== 1 ? 's' : ''}`}
                </p>
              )}
            </div>
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg px-6 py-2 text-sm font-semibold text-white"
              style={{ backgroundColor: '#FF4500' }}
              onMouseOver={e => (e.currentTarget.style.backgroundColor = '#E63E00')}
              onMouseOut={e => (e.currentTarget.style.backgroundColor = '#FF4500')}
            >
              Done
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
