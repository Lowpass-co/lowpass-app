'use client';

import { useCallback, useMemo, useState } from 'react';
import { X, Upload } from 'lucide-react';
import { parseCSV, rowsToObjects } from '@/lib/csv-parse';
import type { Personnel } from '@/types';
import type { PersonnelImportPerson } from '@/lib/personnel-import';
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
  { value: 'marital_status', label: 'Marital status' },
  { value: 'sex', label: 'Sex' },
  { value: 'partner_name', label: "Partner's name" },
  { value: 'legal_name', label: 'Legal name' },
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

function guessField(header: string): string {
  const h = header.trim().toLowerCase().replace(/\s+/g, ' ');
  if (/^name$|^full name$|^display name$/i.test(header.trim())) return 'name';
  if (h === 'first name' || h === 'firstname' || h === 'given name') return 'first_name';
  if (h.includes('middle')) return 'middle_names';
  if (h === 'last name' || h === 'lastname' || h === 'surname' || h === 'family name') return 'surname';
  if (h.includes('nick')) return 'nickname';
  if (h.includes('email')) return 'email';
  if (h.includes('phone') || h.includes('mobile') || h.includes('tel')) return 'phone';
  if (h.includes('role') || h.includes('position') || h.includes('job title')) return 'role';
  if (h.includes('airport')) return 'home_airport';
  if (h.includes('diet')) return 'dietary_needs';
  if (h.includes('merch') || h.includes('shirt size') || h.includes('t-shirt')) return 'merch_size';
  if (h.includes('marital')) return 'marital_status';
  if (h === 'sex' || h.includes('gender')) return 'sex';
  if (h.includes('partner')) return 'partner_name';
  if (h.includes('legal')) return 'legal_name';
  if (h.includes('nationality') || h.includes('citizen')) return 'nationality';
  if (h.includes('birth') || h === 'dob') return 'date_of_birth';
  if (h.includes('address') && (h.includes('first') || h.includes('1') || (h.includes('line') && !h.includes('2'))))
    return 'address_line1';
  if (h.includes('address') && (h.includes('second') || h.includes('2'))) return 'address_line2';
  if (h.includes('city') && !h.includes('capacity')) return 'address_city';
  if (h.includes('post') && h.includes('code')) return 'address_postcode';
  if (h === 'country' || h.includes('nation') && h.includes('country')) return 'address_country';
  if (h.includes('emergency') && h.includes('name')) return 'emergency_name';
  if (h.includes('emergency') && (h.includes('relation') || h.includes('relation to'))) return 'emergency_relationship';
  if (h.includes('emergency') && (h.includes('phone') || h.includes('mobile') || h.includes('contact number')))
    return 'emergency_phone';
  if (h.includes('emergency') && h.includes('email')) return 'emergency_email';
  if (h.includes('social security') || h === 'ssn') return 'ssn';
  if (h.includes('green card')) return 'green_card';
  if (h.includes('tsa')) return 'tsa_precheck';
  if (h.includes('aisle') || h.includes('window')) return 'aisle_window';
  if (h.includes('frequent flyer') || h.includes('ff #')) return 'ff1';
  if (h.includes('passport') && h.includes('number')) return 'passport_number';
  if (h.includes('passport') && h.includes('type')) return 'passport_type';
  if (h.includes('passport') && h.includes('code')) return 'passport_code';
  if (h.includes('passport') && h.includes('authority')) return 'passport_authority';
  if (h.includes('place of birth')) return 'passport_place_of_birth';
  if (h.includes('passport') && h.includes('valid from')) return 'passport_valid_from';
  if (h.includes('empty pages') && h.includes('dbl')) return 'passport_empty_dbl_pages';
  if (h.includes('empty pages')) return 'passport_empty_pages';
  if (h.includes('citizenship')) return 'passport_citizenship';
  if (h.includes('passport') && (h.includes('expir') || h.endsWith(' expiry'))) return 'passport_expiry';
  if (h.includes('medicine') && h.includes('allerg')) return 'allergies_medicine';
  if (h.includes('medical condition')) return 'medical_conditions';
  if (h.includes('criminal')) return 'criminal_convictions';
  if (h.includes('insurance') && h.includes('crew')) return 'insurance_crew';
  if (h.includes('coffee')) return 'coffee_order';
  if (h.includes('pizza')) return 'pizza_order';
  if (h.includes('notes for travel') || h.includes('travel notes')) return 'travel_notes';
  if (h.includes('show') && h.includes('rate')) return 'show_day_rate';
  if (h.includes('off') && h.includes('rate')) return 'off_day_rate';
  if (h.includes('travel') || h.includes('rehearsal')) return 'travel_day_rate';
  if (h.includes('per diem') || h.includes('perdiem')) return 'per_diem_rate';
  if (h === 'currency') return 'currency';
  return '__ignore';
}

function rowToImportPerson(raw: Record<string, string>, mapping: Record<string, string>): PersonnelImportPerson {
  const acc: Record<string, string | number | undefined> = {};
  for (const [header, value] of Object.entries(raw)) {
    const field = mapping[header];
    if (!field || field === '__ignore') continue;
    const v = value?.trim() ?? '';
    if (
      !v &&
      field !== 'name' &&
      field !== 'first_name' &&
      field !== 'last_name' &&
      field !== 'middle_names' &&
      field !== 'surname'
    ) {
      continue;
    }
    if (
      field === 'show_day_rate' ||
      field === 'off_day_rate' ||
      field === 'per_diem_rate' ||
      field === 'travel_day_rate'
    ) {
      const n = parseFloat(v.replace(/[£$€,\s]/g, ''));
      acc[field] = Number.isFinite(n) ? n : 0;
    } else {
      acc[field] = v;
    }
  }
  let name = String(acc.name ?? '').trim();
  if (!name) {
    name = [acc.first_name, acc.middle_names, acc.surname ?? acc.last_name]
      .filter(Boolean)
      .map((s) => String(s).trim())
      .filter(Boolean)
      .join(' ')
      .trim();
  }
  const out = acc as unknown as PersonnelImportPerson;
  out.name = name;
  return out;
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
  const [headers, setHeaders] = useState<string[]>([]);
  const [objects, setObjects] = useState<Record<string, string>[]>([]);
  const [mapping, setMapping] = useState<Record<string, string>>({});
  const [people, setPeople] = useState<PersonnelImportPerson[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [hint, setHint] = useState<string | null>(null);

  const reset = useCallback(() => {
    setStep('idle');
    setHeaders([]);
    setObjects([]);
    setMapping({});
    setPeople([]);
    setHint(null);
  }, []);

  const onFile = (file: File | null) => {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const text = String(reader.result ?? '');
      const grid = parseCSV(text);
      if (grid.length < 2) {
        showToast('Need a header row and at least one data row', 'error');
        return;
      }
      const hdrs = grid[0]!.map((h) => h.trim());
      const dataRows = grid.slice(1);
      const objs = rowsToObjects(hdrs, dataRows);
      const map: Record<string, string> = {};
      for (const h of hdrs) {
        map[h] = guessField(h);
      }
      setHeaders(hdrs);
      setObjects(objs);
      setMapping(map);
      setStep('map');
      setHint(
        'Google Sheets: File → Download → CSV. PDF: export to CSV or copy tables from Preview — native PDF import is not available yet.'
      );
    };
    reader.readAsText(file);
  };

  const buildPreview = () => {
    const list: PersonnelImportPerson[] = [];
    for (const raw of objects) {
      const p = rowToImportPerson(raw, mapping);
      if (p.name?.trim()) list.push(p);
    }
    if (list.length === 0) {
      showToast('No rows with a name — map a name column or first+last', 'error');
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

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[95] flex items-center justify-center p-4">
      <button type="button" className="absolute inset-0 bg-black/50" aria-label="Close" onClick={() => { reset(); onClose(); }} />
      <div
        className="relative z-[96] max-h-[90vh] w-full max-w-3xl overflow-hidden rounded-xl border border-lp-border bg-lp-surface shadow-xl flex flex-col"
        role="dialog"
      >
        <div className="flex items-start justify-between gap-4 border-b border-lp-border p-4">
          <div>
            <h2 className="text-lg font-semibold text-lp-text">Import personnel (CSV)</h2>
            <p className="mt-1 text-xs text-lp-text-secondary">
              Map columns once, then review. For PDFs, convert to CSV or paste into Sheets first.
            </p>
          </div>
          <button
            type="button"
            onClick={() => { reset(); onClose(); }}
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
              <span className="mt-1 text-xs text-lp-text-tertiary">UTF-8 · comma-separated · header row</span>
              <input type="file" accept=".csv,text/csv" className="sr-only" onChange={(e) => onFile(e.target.files?.[0] ?? null)} />
            </label>
          )}

          {step === 'map' && (
            <div className="space-y-4">
              {hint && <p className="rounded-lg bg-lp-bg-tertiary/40 px-3 py-2 text-xs text-lp-text-secondary">{hint}</p>}
              <p className="text-sm text-lp-text-secondary">Match each column to a field ({objects.length} rows).</p>
              <div className="space-y-2">
                {headers.map((h) => (
                  <div key={h} className="flex flex-wrap items-center gap-2 sm:gap-4">
                    <span className="min-w-[8rem] truncate text-sm font-medium text-lp-text">{h}</span>
                    <select
                      value={mapping[h] ?? '__ignore'}
                      onChange={(e) => setMapping((m) => ({ ...m, [h]: e.target.value }))}
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
              <button type="button" onClick={() => setStep('idle')} className="rounded-lg border border-lp-border px-4 py-2 text-sm text-lp-text hover:bg-lp-surface-hover">
                Back
              </button>
              <button type="button" onClick={buildPreview} className="rounded-lg bg-lp-orange px-4 py-2 text-sm font-medium text-white hover:opacity-90">
                Review
              </button>
            </>
          )}
          {step === 'preview' && (
            <>
              <button type="button" onClick={() => setStep('map')} className="rounded-lg border border-lp-border px-4 py-2 text-sm text-lp-text hover:bg-lp-surface-hover">
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
