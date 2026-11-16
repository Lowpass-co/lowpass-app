/* Validation for tour-access rows coming from the browser (invite + member
   access routes). Shape only; the database checks the tour is in the
   workspace (tour_access trigger, 292) and RLS checks the caller is admin. */
import { isArea, isLevel, type Area, type Level } from './areas';

export type AccessRow = { tour_id: string | null; area: Area; level: Level };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Parsed rows (duplicates collapsed, edit wins) or an error message. */
export function parseAccessRows(input: unknown): AccessRow[] | string {
  if (input == null) return [];
  if (!Array.isArray(input)) return 'access must be an array';
  if (input.length > 2000) return 'too many access rows';
  const byKey = new Map<string, AccessRow>();
  for (const raw of input) {
    if (!raw || typeof raw !== 'object') return 'each access row must be an object';
    const r = raw as Record<string, unknown>;
    const tour = r.tour_id ?? null;
    if (tour !== null && (typeof tour !== 'string' || !UUID.test(tour))) return 'tour_id must be a uuid or null';
    if (!isArea(r.area)) return `unknown area ${String(r.area)}`;
    if (!isLevel(r.level)) return `level must be view or edit`;
    const key = `${tour ?? '*'}:${r.area}`;
    const prev = byKey.get(key);
    if (!prev || r.level === 'edit') byKey.set(key, { tour_id: tour as string | null, area: r.area, level: r.level });
  }
  return [...byKey.values()];
}
