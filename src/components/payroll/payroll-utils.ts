/** Monday (week_start) for a given YYYY-MM-DD date (ISO week) */
export function getWeekStart(dateStr: string): string {
  const d = new Date(dateStr + 'T12:00:00');
  const day = d.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  d.setDate(d.getDate() + diff);
  return d.toISOString().slice(0, 10);
}

/** Mon–Sun dates for a week_start (Monday) */
export function weekDates(weekStart: string): string[] {
  const out: string[] = [];
  const d = new Date(weekStart + 'T12:00:00');
  for (let i = 0; i < 7; i++) {
    out.push(d.toISOString().slice(0, 10));
    d.setDate(d.getDate() + 1);
  }
  return out;
}

/** Format "WC 18 May" from week start */
export function formatWeekTabLabel(weekStart: string): string {
  const d = new Date(weekStart + 'T12:00:00');
  if (Number.isNaN(d.getTime())) return weekStart;
  const day = d.getDate();
  const month = d.toLocaleDateString('en-GB', { month: 'short' });
  return `WC ${day} ${month}`;
}
