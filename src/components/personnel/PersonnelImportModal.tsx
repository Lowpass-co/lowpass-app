'use client';

import { useCallback, useMemo, useState } from 'react';
import { X, Upload } from 'lucide-react';
import type { Personnel } from '@/types';
import type { PersonnelImportPerson } from '@/lib/personnel-import';
import {
  analyzePersonnelCsv,
  rowCellsToImportPerson,
} from '@/lib/personnel-csv';
import { cn } from '@/lib/utils';
import { useToast } from '@/components/ui/Toast';

const FIELD_OPTIONS: { value: string; label: string }[] = [
  { value: '__ignore', label: '— Ignore —' },
  { value: 'name', label: 'Name (required)' },
  { value: 'first_name', label: 'First name' },
  { value: 'middle_names', label: 'Middle name(s)' },
  { value: 'surname', label: 'Surname' },
  { value: 'last_name', label: 'Last name (→ surname)' },
  { value: 'nickname', label: 'Nickname' },
  { value: 'role', label: 'Role / position' },
  { value: 'email', label: 'Email' },
  { value: 'phone', label: 'Phone' },
  { value: 'home_airport', label: 'Home airport' },
  { value: 'dietary_needs', label: 'Dietary' },
  { value: 'merch_size', label: 'Merch size' },
  { value: 'preferences', label: 'Preferences / notes' },
  { value: 'marital_status', label: 'Marital status' },
  { value: 'sex', label: 'Sex' },
  { value: 'partner_name', label: "Partner's name" },
  { value: 'legal_name', label: 'Legal name' },
  { value: 'pronouns', label: 'Pronouns' },
  { value: 'nationality', label: 'Nationality' },
  { value: 'date_of_birth', label: 'Date of birth' },
  { value: 'address_line1', label: 'Address line 1' },
  { value: 'address_line2', label: 'Address line 2' },
  { value: 'address_city', label: 'City' },
  { value: 'address_region', label: 'Region / state' },
  { value: 'address_postcode', label: 'Postcode' },
  { value: 'address_country', label: 'Country' },
  { value: 'emergency_name', label: 'Emergency name' },
  { value: 'emergency_relationship', label: 'Emergency relation' },
  { value: 'emergency_phone', label: 'Emergency phone' },
  { value: 'emergency_email', label: 'Emergency email' },
  { value: 'passport_number', label: 'Passport 1 — number' },
  { value: 'passport_type', label: 'Passport 1 — type' },
  { value: 'passport_code', label: 'Passport 1 — code' },
  { value: 'passport_authority', label: 'Passport 1 — authority' },
  { value: 'passport_place_of_birth', label: 'Passport 1 — place of birth' },
  { value: 'passport_valid_from', label: 'Passport 1 — valid from' },
  { value: 'passport_empty_pages', label: 'Passport 1 — empty pages' },
  { value: 'passport_empty_dbl_pages', label: 'Passport 1 — empty dbl pages' },
  { value: 'passport_citizenship', label: 'Passport 1 — citizenship' },
  { value: 'passport_expiry', label: 'Passport 1 — expiry' },
  { value: 'passport_country', label: 'Passport 1 — country (legacy)' },
  { value: 'passport2_number', label: 'Passport 2 — number' },
  { value: 'passport2_expiry', label: 'Passport 2 — expiry' },
  { value: 'passport2_citizenship', label: 'Passport 2 — citizenship' },
  { value: 'ssn', label: 'US — Social Security #' },
  { value: 'green_card', label: 'US — Green Card #' },
  { value: 'tsa_precheck', label: 'TSA Pre-Check' },
  { value: 'aisle_window', label: 'Aisle / window' },
  { value: 'ff1', label: 'Frequent flyer line 1' },
  { value: 'ff2', label: 'Frequent flyer line 2' },
  { value: 'ff3', label: 'Frequent flyer line 3' },
  { value: 'ff4', label: 'Frequent flyer line 4' },
  { value: 'allergies_medicine', label: 'Allergies to medicine' },
  { value: 'medical_conditions', label: 'Medical conditions' },
  { value: 'criminal_convictions', label: 'Criminal convictions' },
  { value: 'insurance_crew', label: 'Insurance (crew)' },
  { value: 'medical_notes', label: 'Medical notes' },
  { value: 'coffee_order', label: 'Coffee order' },
  { value: 'pizza_order', label: 'Pizza order' },
  { value: 'travel_notes', label: 'Notes for travel' },
  { value: 'instruments', label: 'Instruments / skills' },
  { value: 'show_day_rate', label: 'Show day rate' },
  { value: 'off_day_rate', label: 'Off day rate' },
  { value: 'travel_day_rate', label: 'Travel / rehearsal rate' },
  { value: 'per_diem_rate', label: 'Per diem' },
  { value: 'currency', label: 'Currency' },
  { value: 'internal_notes', label: 'Internal notes' },
];

function delimiterLabel(d: ',' | ';' | '\t'): string {
  if (d === ';') return 'semicolon (;) — common for Excel in EU';
  if (d === '\t') return 'tab';
  return 'comma (,)';
}

export function PersonnelImportModal({
  open,
  onClose,
  onImported,
}: {
  open: boolean;
  onClose: () => void;
  onImported: (rows: Personnel[]) => void;
}) {
  const { showToast } = useToast();
  const [step, setStep] = useState<'idle' | 'map' | 'preview'>('idle');
  const [csvText, setCsvText] = useState<string | null>(null);
  const [headerRowIndex, setHeaderRowIndex] = useState(0);
  const [mapping, setMapping] = useState<Record<number, string>>({});
  const [people, setPeople] = useState<PersonnelImportPerson[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [hint, setHint] = useState<string | null>(null);

  const analysis = useMemo(() => (csvText ? analyzePersonnelCsv(csvText, headerRowIndex) : null), [csvText, headerRowIndex]);

  const reset = useCallback(() => {
    setStep('idle');
    setCsvText(null);
    setHeaderRowIndex(0);
    setMapping({});
    setPeople([]);
    setHint(null);
  }, []);

  const onFile = (file: File | null) => {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const text = String(reader.result ?? '');
      const trimmed = text.trim();
      if (!trimmed) {
        showToast('File is empty', 'error');
        return;
      }
      const auto = analyzePersonnelCsv(text);
      if (auto.dataRows.length === 0) {
        showToast('No data rows after the header — check the header row or add rows below it.', 'error');
        return;
      }
      setCsvText(text);
      setHeaderRowIndex(auto.headerRowIndex);
      setMapping({ ...auto.suggestedMapping });
      setStep('map');
      setHint(
        `Detected ${delimiterLabel(auto.delimiter)} · ${auto.dataRows.length} data rows · header on row ${auto.headerRowIndex + 1}. ` +
          'If columns look wrong, change which row is the header. Google Sheets: File → Download → CSV.'
      );
    };
    reader.readAsText(file, 'UTF-8');
  };

  const redetectHeaderRow = () => {
    if (!csvText) return;
    const auto = analyzePersonnelCsv(csvText);
    setHeaderRowIndex(auto.headerRowIndex);
    setMapping({ ...auto.suggestedMapping });
    showToast(`Using row ${auto.headerRowIndex + 1} as header`);
  };

  const onHeaderRowChange = (idx: number) => {
    if (!csvText) return;
    setHeaderRowIndex(idx);
    const next = analyzePersonnelCsv(csvText, idx);
    setMapping({ ...next.suggestedMapping });
  };

  const buildPreview = () => {
    if (!analysis) return;
    const list: PersonnelImportPerson[] = [];
    for (const row of analysis.dataRows) {
      const p = rowCellsToImportPerson(row, analysis.colCount, mapping);
      if (p.name?.trim()) list.push(p);
    }
    if (list.length === 0) {
      showToast('No rows with a name — map a name column or first + last', 'error');
      return;
    }
    setPeople(list);
    setStep('preview');
  };

  const submit = async () => {
    setSubmitting(true);
    try {
      const res = await fetch('/api/personnel/import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ people }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? 'Import failed');
      showToast(`Imported ${data.created ?? 0} people`);
      onImported((data.personnel ?? []) as Personnel[]);
      reset();
      onClose();
    } catch (e) {
      showToast(e instanceof Error ? e.message : 'Import failed', 'error');
    } finally {
      setSubmitting(false);
    }
  };

  const previewSlice = useMemo(() => people.slice(0, 8), [people]);

  const headerRowOptions = analysis
    ? Array.from({ length: Math.min(analysis.totalParsedRows, 200) }, (_, i) => i)
    : [];

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[95] flex items-center justify-center p-4">
      <button
        type="button"
        className="absolute inset-0 bg-black/50"
        aria-label="Close"
        onClick={() => {
          reset();
          onClose();
        }}
      />
      <div
        className="relative z-[96] flex max-h-[90vh] w-full max-w-3xl flex-col overflow-hidden rounded-xl border border-lp-border bg-lp-surface shadow-xl"
        role="dialog"
      >
        <div className="flex items-start justify-between gap-4 border-b border-lp-border p-4">
          <div>
            <h2 className="text-lg font-semibold text-lp-text">Import personnel (CSV)</h2>
            <p className="mt-1 text-xs text-lp-text-secondary">
              Comma or semicolon separated · UTF-8. We pick the header row automatically; override if your sheet has a title
              row.
            </p>
          </div>
          <button
            type="button"
            onClick={() => {
              reset();
              onClose();
            }}
            className="rounded-lg p-1 text-lp-text-tertiary hover:bg-lp-bg-tertiary hover:text-lp-text"
          >
            <X size={20} />
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto p-4">
          {step === 'idle' && (
            <label className="flex cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed border-lp-border bg-lp-bg/50 px-6 py-14 transition-colors hover:border-lp-orange/50">
              <Upload className="mb-2 text-lp-text-tertiary" size={32} />
              <span className="text-sm font-medium text-lp-text">Choose CSV file</span>
              <span className="mt-1 text-xs text-lp-text-tertiary">UTF-8 · comma or semicolon · header row</span>
              <input type="file" accept=".csv,text/csv" className="sr-only" onChange={(e) => onFile(e.target.files?.[0] ?? null)} />
            </label>
          )}

          {step === 'map' && analysis && (
            <div className="space-y-4">
              {hint && <p className="rounded-lg bg-lp-bg-tertiary/40 px-3 py-2 text-xs text-lp-text-secondary">{hint}</p>}
              <div className="flex flex-wrap items-end gap-3">
                <div>
                  <label className="mb-1 block text-[10px] font-semibold uppercase tracking-wide text-lp-text-tertiary">
                    Header row (1-based)
                  </label>
                  <select
                    value={headerRowIndex}
                    onChange={(e) => onHeaderRowChange(Number(e.target.value))}
                    className="rounded-lg border border-lp-border bg-lp-bg px-3 py-2 text-sm text-lp-text outline-none focus:border-lp-orange"
                  >
                    {headerRowOptions.map((i) => (
                      <option key={i} value={i}>
                        Row {i + 1}
                      </option>
                    ))}
                  </select>
                </div>
                <button
                  type="button"
                  onClick={redetectHeaderRow}
                  className="rounded-lg border border-lp-border px-3 py-2 text-xs font-medium text-lp-text hover:bg-lp-surface-hover"
                >
                  Re-detect header
                </button>
              </div>
              <p className="text-sm text-lp-text-secondary">
                Match each column to a field ({analysis.dataRows.length} data rows, {analysis.columns.length} columns).
              </p>
              {analysis.dataRows[0] && (
                <details
                  open
                  className="rounded-lg border border-lp-border/80 bg-lp-bg/40 text-sm dark:bg-lp-surface/30"
                >
                  <summary className="cursor-pointer list-none px-3 py-2 text-xs font-semibold text-lp-text marker:content-none [&::-webkit-details-marker]:hidden">
                    <span className="text-lp-orange">▸</span>{' '}
                    <span className="text-lp-text">First data row</span>
                    <span className="ml-2 font-normal text-lp-text-secondary">
                      — if this looks like column titles, move the header row up one.
                    </span>
                  </summary>
                  <div className="max-h-48 overflow-auto border-t border-lp-border/60 px-3 py-2">
                    <ul className="space-y-1 font-mono text-[11px]">
                      {analysis.columns.map((col) => {
                        const raw = analysis.dataRows[0]?.[col.index] ?? '';
                        const v = raw.replace(/\u00A0/g, ' ').trim();
                        const show = v.length > 72 ? `${v.slice(0, 72)}…` : v;
                        return (
                          <li key={col.index} className="flex gap-2 border-b border-lp-border/30 py-1 last:border-0">
                            <span className="w-[min(11rem,32%)] shrink-0 truncate text-lp-text-tertiary" title={col.label}>
                              {col.label}
                            </span>
                            <span className="min-w-0 break-all text-lp-text">{show || '—'}</span>
                          </li>
                        );
                      })}
                    </ul>
                  </div>
                </details>
              )}
              <div className="space-y-2">
                {analysis.columns.map((col) => (
                  <div key={col.index} className="flex flex-wrap items-center gap-2 sm:gap-4">
                    <span className="min-w-[10rem] max-w-[14rem] truncate text-sm font-medium text-lp-text" title={col.label}>
                      {col.label}
                    </span>
                    <select
                      value={mapping[col.index] ?? '__ignore'}
                      onChange={(e) => setMapping((m) => ({ ...m, [col.index]: e.target.value }))}
                      className={cn(
                        'min-w-[12rem] flex-1 rounded-lg border border-lp-border bg-lp-bg px-3 py-2 text-sm text-lp-text outline-none focus:border-lp-orange'
                      )}
                    >
                      {FIELD_OPTIONS.map((o) => (
                        <option key={o.value} value={o.value}>
                          {o.label}
                        </option>
                      ))}
                    </select>
                  </div>
                ))}
              </div>
            </div>
          )}

          {step === 'preview' && (
            <div className="space-y-3">
              <p className="text-sm text-lp-text-secondary">
                Importing <strong className="text-lp-text">{people.length}</strong> people (showing first {previewSlice.length}).
              </p>
              <div className="overflow-x-auto rounded-lg border border-lp-border">
                <table className="w-full text-left text-xs">
                  <thead>
                    <tr className="border-b border-lp-border bg-lp-bg-tertiary/40 text-lp-text-tertiary">
                      <th className="px-2 py-2">Name</th>
                      <th className="px-2 py-2">Role</th>
                      <th className="px-2 py-2">Email</th>
                    </tr>
                  </thead>
                  <tbody>
                    {previewSlice.map((p, i) => (
                      <tr key={i} className="border-b border-lp-border/60">
                        <td className="px-2 py-2 font-medium text-lp-text">{p.name}</td>
                        <td className="px-2 py-2 text-lp-text-secondary">{p.role ?? '—'}</td>
                        <td className="px-2 py-2 text-lp-text-secondary">{p.email ?? '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>

        <div className="flex justify-end gap-2 border-t border-lp-border p-4">
          {step === 'map' && (
            <>
              <button
                type="button"
                onClick={() => setStep('idle')}
                className="rounded-lg border border-lp-border px-4 py-2 text-sm text-lp-text hover:bg-lp-surface-hover"
              >
                Back
              </button>
              <button
                type="button"
                onClick={buildPreview}
                className="rounded-lg bg-lp-orange px-4 py-2 text-sm font-medium text-white hover:opacity-90"
              >
                Review
              </button>
            </>
          )}
          {step === 'preview' && (
            <>
              <button
                type="button"
                onClick={() => setStep('map')}
                className="rounded-lg border border-lp-border px-4 py-2 text-sm text-lp-text hover:bg-lp-surface-hover"
              >
                Back
              </button>
              <button
                type="button"
                disabled={submitting}
                onClick={() => void submit()}
                className="rounded-lg bg-lp-orange px-4 py-2 text-sm font-medium text-white hover:opacity-90 disabled:opacity-50"
              >
                {submitting ? 'Importing…' : 'Import all'}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
