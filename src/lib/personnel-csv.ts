/* ============================================
   Personnel CSV: delimiter + header detection,
   column mapping by index (fixes duplicate headers).
   ============================================ */

import {
  detectDelimiterFromText,
  normalizeCsvText,
  parseCSV,
  padRow,
} from '@/lib/csv-parse';
import type { PersonnelImportPerson } from '@/lib/personnel-import';

export function normalizeHeaderLabel(raw: string): string {
  return raw
    .replace(/^\uFEFF/, '')
    .replace(/\u00A0/g, ' ')
    .trim()
    .replace(/\s+/g, ' ');
}

/** Map CSV header text → import field key (see PersonnelImportModal FIELD_OPTIONS). */
export function guessPersonnelImportField(header: string): string {
  const h = normalizeHeaderLabel(header).toLowerCase();
  if (!h) return '__ignore';

  if (/\blp[\s-]*id\b/i.test(h) || h === 'lpid' || h.includes('lowpass id')) return '__ignore';

  if (/^name$|^full name$|^display name$|crew name|person name/i.test(normalizeHeaderLabel(header))) return 'name';
  if (h === 'first name' || h === 'firstname' || h === 'given name' || h === 'forename') return 'first_name';
  if (h.includes('middle') && h.includes('name')) return 'middle_names';
  if (
    h === 'last name' ||
    h === 'lastname' ||
    h === 'surname' ||
    h === 'family name' ||
    h === 'second name'
  )
    return 'surname';
  if (h.includes('nick')) return 'nickname';
  if (h.includes('email') || h === 'e-mail') return 'email';
  if (h.includes('phone') || h.includes('mobile') || h.includes('tel') || h === 'gsm') return 'phone';
  if (h.includes('role') || h.includes('position') || h.includes('job title') || h === 'title') return 'role';
  if (h.includes('airport') || h === 'home base') return 'home_airport';
  if (h.includes('diet')) return 'dietary_needs';
  if (h.includes('merch') || h.includes('shirt size') || h.includes('t-shirt') || h.includes('tshirt'))
    return 'merch_size';
  if (h.includes('preference') && !h.includes('seat')) return 'preferences';
  if (h.includes('pronoun')) return 'pronouns';
  if (h.includes('marital')) return 'marital_status';
  if (h === 'sex' || (h.includes('gender') && !h.includes('pronoun'))) return 'sex';
  if (h.includes('partner')) return 'partner_name';
  if (h.includes('legal') && h.includes('name')) return 'legal_name';
  if (h.includes('nationality') || (h.includes('citizen') && !h.includes('passport'))) return 'nationality';
  if (h.includes('birth') || h === 'dob' || h === 'date of birth') return 'date_of_birth';

  if (h.includes('address') && (h.includes('first') || h.includes('1') || (h.includes('line') && !h.includes('2'))))
    return 'address_line1';
  if (h.includes('address') && (h.includes('second') || h.includes('2'))) return 'address_line2';
  if ((h.includes('city') || h === 'town') && !h.includes('capacity')) return 'address_city';
  if (
    h.includes('region') ||
    h.includes('state') ||
    h.includes('province') ||
    (h.includes('county') && !h.includes('country'))
  )
    return 'address_region';
  if ((h.includes('post') && h.includes('code')) || h === 'zip' || h === 'zip code' || h === 'postcode')
    return 'address_postcode';
  if (h === 'country' && !h.includes('of origin')) return 'address_country';

  if (h.includes('emergency') && h.includes('name')) return 'emergency_name';
  if (h.includes('emergency') && (h.includes('relation') || h.includes('relation to')))
    return 'emergency_relationship';
  if (h.includes('emergency') && (h.includes('phone') || h.includes('mobile') || h.includes('contact number')))
    return 'emergency_phone';
  if (h.includes('emergency') && h.includes('email')) return 'emergency_email';

  if (h.includes('social security') || h === 'ssn') return 'ssn';
  if (h.includes('green card')) return 'green_card';
  if (h.includes('tsa')) return 'tsa_precheck';
  if (h.includes('aisle') || h.includes('window')) return 'aisle_window';
  if (h.includes('frequent flyer') || h.includes('ff #') || h === 'ff1') return 'ff1';
  if (h === 'ff2' || h.includes('frequent flyer 2')) return 'ff2';
  if (h === 'ff3' || h.includes('frequent flyer 3')) return 'ff3';
  if (h === 'ff4' || h.includes('frequent flyer 4')) return 'ff4';

  if (h.includes('notes for travel') || h.includes('travel notes') || (h.includes('travel') && h.includes('note')))
    return 'travel_notes';

  if (
    (h.includes('travel') && (h.includes('rate') || h.includes('fee') || h.includes('/ day'))) ||
    (h.includes('rehearsal') && h.includes('rate')) ||
    h.includes('travel day rate')
  )
    return 'travel_day_rate';

  if (h.includes('passport') && h.includes('number')) return 'passport_number';
  if (h.includes('passport') && h.includes('type')) return 'passport_type';
  if (h.includes('passport') && h.includes('code')) return 'passport_code';
  if (h.includes('passport') && h.includes('authority')) return 'passport_authority';
  if (h.includes('place of birth')) return 'passport_place_of_birth';
  if (h.includes('passport') && h.includes('valid from')) return 'passport_valid_from';
  if (h.includes('empty pages') && h.includes('dbl')) return 'passport_empty_dbl_pages';
  if (h.includes('empty pages')) return 'passport_empty_pages';
  if (h.includes('citizenship') && !h.includes('passport 2')) return 'passport_citizenship';
  if (h.includes('passport') && (h.includes('expir') || h.endsWith(' expiry'))) return 'passport_expiry';
  if (h.includes('passport') && h.includes('country') && !h.includes('2')) return 'passport_country';

  if (h.includes('passport') && (h.includes('2') || h.includes('two') || h.includes('second'))) {
    if (h.includes('number')) return 'passport2_number';
    if (h.includes('expir')) return 'passport2_expiry';
    if (h.includes('citizen')) return 'passport2_citizenship';
  }

  if (h.includes('medicine') && h.includes('allerg')) return 'allergies_medicine';
  if (h.includes('medical condition')) return 'medical_conditions';
  if (h.includes('criminal')) return 'criminal_convictions';
  if (h.includes('insurance') && h.includes('crew')) return 'insurance_crew';
  if (h.includes('coffee')) return 'coffee_order';
  if (h.includes('pizza')) return 'pizza_order';
  if (h.includes('show') && h.includes('rate')) return 'show_day_rate';
  if ((h.includes('off') && h.includes('rate')) || h.includes('off day')) return 'off_day_rate';
  if (h.includes('per diem') || h.includes('perdiem')) return 'per_diem_rate';
  if (h === 'currency' || h === 'curr') return 'currency';
  if (h.includes('internal') && h.includes('note')) return 'internal_notes';
  if (h.includes('instrument') || h === 'skills') return 'instruments';
  if (h.includes('medical') && h.includes('note')) return 'medical_notes';

  return '__ignore';
}

function scoreHeaderRow(row: string[]): number {
  const cells = row.map((c) => normalizeHeaderLabel(c)).filter(Boolean);
  if (cells.length < 2) return -1;

  let score = 0;
  for (const cell of cells) {
    const g = guessPersonnelImportField(cell);
    if (g !== '__ignore') score += 4;
    else if (cell.length > 1 && !/^\d+$/.test(cell)) score += 1;
  }

  const joined = cells.join(' ').toLowerCase();
  if (/\bname\b/.test(joined) || joined.includes('first name') || joined.includes('email')) score += 6;

  const numericLike = cells.filter((c) => /^[\d.,$€£\s%-]+$/u.test(c) && /\d/.test(c)).length;
  if (numericLike >= Math.ceil(cells.length * 0.55)) score -= 12;

  return score;
}

export function findBestHeaderRowIndex(grid: string[][], maxScan = 40): number {
  const limit = Math.min(maxScan, grid.length);
  if (limit === 0) return 0;
  let bestIdx = 0;
  let bestScore = -Infinity;
  for (let i = 0; i < limit; i++) {
    const s = scoreHeaderRow(grid[i] ?? []);
    if (s > bestScore) {
      bestScore = s;
      bestIdx = i;
    }
  }
  if (bestScore < 0) return 0;
  return bestIdx;
}

export type PersonnelCsvColumn = { index: number; label: string; rawHeader: string };

function buildColumns(headerCells: string[]): { columns: PersonnelCsvColumn[]; colCount: number } {
  const maxCols = Math.max(headerCells.length, 1);
  const seen = new Map<string, number>();
  const columns: PersonnelCsvColumn[] = [];

  for (let index = 0; index < maxCols; index++) {
    const raw = headerCells[index] ?? '';
    const normalized = normalizeHeaderLabel(raw);
    const base = normalized || `Column ${index + 1}`;
    const n = (seen.get(base) ?? 0) + 1;
    seen.set(base, n);
    const label = n > 1 ? `${base} (${n})` : base;
    columns.push({ index, label, rawHeader: raw });
  }

  return { columns, colCount: maxCols };
}

export type PersonnelCsvAnalysis = {
  delimiter: ',' | ';' | '\t';
  headerRowIndex: number;
  columns: PersonnelCsvColumn[];
  colCount: number;
  dataRows: string[][];
  suggestedMapping: Record<number, string>;
  /** Rows returned by parseCSV (for header row picker UI). */
  totalParsedRows: number;
  /**
   * True when the CSV was automatically transposed because names were column
   * headers and field labels were on the left (vertical / Sheets-style layout).
   */
  transposed: boolean;
};

/**
 * Detect whether a parsed CSV grid is in "vertical" format:
 * column 0 = field labels, row 0 = person names (each column = one person).
 *
 * Strategy:
 *  1. Score column 0 as if it were a header row — if it contains recognisable
 *     field keywords (name, email, phone, role, …) it scores positively.
 *  2. Also trigger when there are significantly more columns than rows, which
 *     is a strong structural signal that the sheet has been transposed.
 */
function detectVerticalLayout(grid: string[][]): boolean {
  if (grid.length < 2) return false;
  const numCols = Math.max(...grid.map((r) => r.length));
  if (numCols < 2) return false;

  // Extract column 0 values as a candidate "header"
  const col0 = grid.map((r) => r[0] ?? '').filter(Boolean);
  if (col0.length < 2) return false;

  const col0Score = scoreHeaderRow(col0);

  // If column 0 scores as a reasonable header, almost certainly vertical
  if (col0Score >= 3) return true;

  // Secondary signal: many more columns than rows (e.g. 58 people × 30 fields)
  const numRows = grid.length;
  if (numCols > numRows * 2 && col0Score >= 1) return true;

  return false;
}

/** Rotate a 2-D grid 90°: grid[row][col] → transposed[col][row] */
function transposeGrid(grid: string[][]): string[][] {
  if (grid.length === 0) return [];
  const numCols = Math.max(...grid.map((r) => r.length));
  const result: string[][] = [];
  for (let c = 0; c < numCols; c++) {
    result.push(grid.map((r) => r[c] ?? ''));
  }
  return result;
}

export function analyzePersonnelCsv(text: string, headerRowIndexOverride?: number): PersonnelCsvAnalysis {
  const normalized = normalizeCsvText(text);
  const delimiter = detectDelimiterFromText(normalized);
  const rawGrid = parseCSV(normalized, delimiter);

  // Auto-detect and fix vertical layouts (names as column headers, fields as row labels).
  // Detection always runs on the raw grid so the result is stable across calls
  // even when the user adjusts the header row picker.
  const transposed = detectVerticalLayout(rawGrid);
  const grid = transposed ? transposeGrid(rawGrid) : rawGrid;

  const headerRowIndex =
    headerRowIndexOverride !== undefined
      ? Math.max(0, Math.min(headerRowIndexOverride, Math.max(0, grid.length - 1)))
      : findBestHeaderRowIndex(grid);

  const headerRow = grid[headerRowIndex] ?? [];
  const rest = grid.slice(headerRowIndex + 1);

  let colCount = headerRow.length;
  for (const r of rest) colCount = Math.max(colCount, r.length);
  if (colCount < 1) colCount = 1;

  const paddedHeader = padRow(headerRow, colCount);
  const { columns } = buildColumns(paddedHeader);

  const dataRows = rest
    .map((r) => padRow(r, colCount))
    .filter((r) => r.some((c) => normalizeHeaderLabel(c).length > 0));

  const suggestedMapping: Record<number, string> = {};
  for (const col of columns) {
    suggestedMapping[col.index] = guessPersonnelImportField(col.rawHeader || col.label);
  }

  return {
    delimiter,
    headerRowIndex,
    columns,
    colCount,
    dataRows,
    suggestedMapping,
    totalParsedRows: grid.length,
    transposed,
  };
}

export function rowCellsToImportPerson(
  cells: string[],
  colCount: number,
  mapping: Record<number, string>
): PersonnelImportPerson {
  const acc: Record<string, string | number | undefined> = {};
  for (let j = 0; j < colCount; j++) {
    const field = mapping[j];
    if (!field || field === '__ignore') continue;
    const raw = (cells[j] ?? '').replace(/\u00A0/g, ' ').trim();
    if (
      !raw &&
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
      const n = parseFloat(raw.replace(/[£$€,\s]/g, ''));
      acc[field] = Number.isFinite(n) ? n : 0;
    } else {
      acc[field] = raw;
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
