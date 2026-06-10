/* ============================================
   LOWPASS — ISO-week helpers for day rails (Monday-based)

   Canonical home for "bucket a date into its Monday week + label it".
   `<RoutingRail grouping="week">` uses these. Payroll currently has its own
   copy in components/payroll/payroll-utils.ts; when payroll is rebuilt to the
   3-view model it should adopt these and drop its copy. Kept here (not imported
   from payroll) so routing has no dependency on a soon-to-be-rebuilt surface.
   ============================================ */

/** Monday (week start, YYYY-MM-DD) for a given YYYY-MM-DD date (ISO week). */
export function getWeekStart(dateStr: string): string {
  const d = new Date(dateStr.slice(0, 10) + 'T12:00:00');
  if (Number.isNaN(d.getTime())) return dateStr;
  const day = d.getDay(); // 0 = Sun
  const diff = day === 0 ? -6 : 1 - day;
  d.setDate(d.getDate() + diff);
  return d.toISOString().slice(0, 10);
}

/** "WC 18 May" from a week-start date. */
export function formatWeekLabel(weekStart: string): string {
  const d = new Date(weekStart + 'T12:00:00');
  if (Number.isNaN(d.getTime())) return weekStart;
  const day = d.getDate();
  const month = d.toLocaleDateString('en-GB', { month: 'short' });
  return `WC ${day} ${month}`;
}
