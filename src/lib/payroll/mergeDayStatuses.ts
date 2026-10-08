/* ============================================
   LOWPASS — payroll day-status merge (pure)

   A paint sends only the cells it changed: `{ "2026-08-15": "show" }`, or
   `null` to clear a cell back to the tour default. The server merges those
   changes INTO the stored week — it never replaces the week with the
   client's copy.

   Why: the grid used to send the whole week, built from whatever the browser
   last received. Two quick paints in the same week went out as two full maps;
   the second was built before the first's reply arrived, so it didn't contain
   the first paint — and it overwrote it. The screen kept showing both (the
   browser's optimistic copy) while the database kept one. That is audit #1.

   Same semantics as the SQL in migration 269 (payroll_merge_day_statuses):
   stored || changes, then drop the keys whose value is null.
   ============================================ */

export type DayStatusChanges = Record<string, string | null>;

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/** Validate a changes map from a request body. Returns null when invalid. */
export function parseDayStatusChanges(raw: unknown): DayStatusChanges | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const out: DayStatusChanges = {};
  for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
    if (!DATE_RE.test(k)) return null;
    if (v !== null && typeof v !== 'string') return null;
    out[k] = v === null ? null : String(v);
  }
  return out;
}

export function mergeDayStatuses(
  stored: Record<string, string> | null | undefined,
  changes: DayStatusChanges,
): Record<string, string> {
  const out: Record<string, string> = { ...(stored ?? {}) };
  for (const [date, status] of Object.entries(changes)) {
    if (status === null) delete out[date];
    else out[date] = status;
  }
  return out;
}
