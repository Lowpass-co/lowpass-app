/** Parse Y-M-D in local time (noon to avoid DST edge). */
export function parseYmd(ymd: string): Date {
  const [y, m, d] = ymd.split('-').map(Number);
  return new Date(y, (m ?? 1) - 1, d ?? 1, 12, 0, 0, 0);
}

export function toLocalYmd(d: Date): string {
  return d.toLocaleDateString('en-CA');
}

/** Inclusive start..end, ISO strings (en-CA). */
export function eachDayInclusive(start: string, end: string): string[] {
  const a = parseYmd(start);
  const b = parseYmd(end);
  if (a > b) return [];
  const out: string[] = [];
  const cur = new Date(a);
  while (cur <= b) {
    out.push(toLocalYmd(cur));
    cur.setDate(cur.getDate() + 1);
  }
  return out;
}

export function dayIndex(days: string[], ymd: string): number {
  return days.indexOf(ymd);
}

export function ymdToMonthTitle(ymd: string): string {
  const d = parseYmd(ymd);
  return d.toLocaleString(undefined, { month: 'long', year: 'numeric' });
}

export function isWeekend(ymd: string): boolean {
  const d = parseYmd(ymd);
  const day = d.getDay();
  return day === 0 || day === 6;
}
