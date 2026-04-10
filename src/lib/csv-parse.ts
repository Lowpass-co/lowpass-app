/** Minimal RFC4180-style CSV parse (handles quoted fields). */
export function parseCSV(text: string): string[][] {
  const lines: string[][] = [];
  let row: string[] = [];
  let field = '';
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    const next = text[i + 1];
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
    if (c === ',') {
      row.push(field.trim());
      field = '';
      continue;
    }
    if (c === '\n' || (c === '\r' && next === '\n')) {
      if (c === '\r') i++;
      row.push(field.trim());
      if (row.some((cell) => cell.length > 0)) lines.push(row);
      row = [];
      field = '';
      continue;
    }
    if (c === '\r') continue;
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
