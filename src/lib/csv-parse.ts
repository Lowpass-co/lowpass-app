/** Strip UTF-8 BOM and normalize newlines (Excel / Sheets export safe). */
export function normalizeCsvText(text: string): string {
  return text.replace(/^\uFEFF/, '').replace(/\r\n/g, '\n').replace(/\r/g, '\n');
}

/** Pick delimiter from a single logical line (first non-empty line of file is typical). */
export function detectDelimiter(line: string): ',' | ';' | '\t' {
  const comma = (line.match(/,/g) ?? []).length;
  const semi = (line.match(/;/g) ?? []).length;
  const tab = (line.match(/\t/g) ?? []).length;
  if (tab > 0 && tab >= comma && tab >= semi) return '\t';
  if (semi > comma) return ';';
  return ',';
}

export function detectDelimiterFromText(text: string): ',' | ';' | '\t' {
  const t = normalizeCsvText(text);
  for (const line of t.split('\n')) {
    const s = line.trimEnd();
    if (s.trim().length > 0) return detectDelimiter(s);
  }
  return ',';
}

/**
 * RFC4180-style parse; `delimiter` is usually ',' (US) or ';' (European Excel) or tab.
 */
export function parseCSV(text: string, delimiter: string = ','): string[][] {
  const norm = normalizeCsvText(text);
  const lines: string[][] = [];
  let row: string[] = [];
  let field = '';
  let inQuotes = false;
  for (let i = 0; i < norm.length; i++) {
    const c = norm[i];
    const next = norm[i + 1];
    if (inQuotes) {
      if (c === '"' && next === '"') {
        field += '"';
        i++;
      } else if (c === '"') {
        inQuotes = false;
      } else {
        field += c;
      }
      continue;
    }
    if (c === '"') {
      inQuotes = true;
      continue;
    }
    if (c === delimiter) {
      row.push(field.trim());
      field = '';
      continue;
    }
    if (c === '\n') {
      row.push(field.trim());
      if (row.some((cell) => cell.length > 0)) lines.push(row);
      row = [];
      field = '';
      continue;
    }
    field += c;
  }
  row.push(field.trim());
  if (row.some((cell) => cell.length > 0)) lines.push(row);
  return lines;
}

export function rowsToObjects(headers: string[], dataRows: string[][]): Record<string, string>[] {
  return dataRows.map((cells) => {
    const o: Record<string, string> = {};
    headers.forEach((h, j) => {
      o[h] = cells[j] ?? '';
    });
    return o;
  });
}

/** Pad row to length (trailing empty cells). */
export function padRow(row: string[], len: number): string[] {
  const r = [...row];
  while (r.length < len) r.push('');
  return r.slice(0, len);
}
