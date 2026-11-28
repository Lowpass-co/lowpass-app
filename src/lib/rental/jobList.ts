/* ============================================
   LOWPASS — the rental jobs list, grouped (Nov 2026)

   Adam: "months and then optional sort by status". By month of the start
   date — this month and later first, soonest at the top (the next job out),
   then earlier months, most recent first; undated jobs last. Or by status, in
   the order a job moves through.
   ============================================ */

export type JobStatus = 'draft' | 'confirmed' | 'invoiced' | 'completed';
export const JOB_STATUS_ORDER: readonly JobStatus[] = ['draft', 'confirmed', 'invoiced', 'completed'];
export const JOB_STATUS_LABEL: Record<JobStatus, string> = {
  draft: 'Draft',
  confirmed: 'Confirmed',
  invoiced: 'Invoiced',
  completed: 'Completed',
};

export interface ListJob {
  id: string;
  status: string;
  start_date: string | null;
  name: string;
}

export interface JobGroup<J> {
  key: string;
  label: string;
  /** True for months before this one. */
  past?: boolean;
  jobs: J[];
}

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

function byStart<J extends ListJob>(a: J, b: J): number {
  const sa = a.start_date ?? '9999-99-99';
  const sb = b.start_date ?? '9999-99-99';
  return sa.localeCompare(sb) || a.name.localeCompare(b.name);
}

export function groupJobsByMonth<J extends ListJob>(jobs: J[], today: Date): JobGroup<J>[] {
  const thisMonth = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}`;
  const map = new Map<string, J[]>();
  for (const j of jobs) {
    const key = j.start_date && /^\d{4}-\d{2}/.test(j.start_date) ? j.start_date.slice(0, 7) : 'none';
    const arr = map.get(key) ?? [];
    arr.push(j);
    map.set(key, arr);
  }
  const keys = [...map.keys()].filter((k) => k !== 'none');
  const upcoming = keys.filter((k) => k >= thisMonth).sort();
  const past = keys.filter((k) => k < thisMonth).sort().reverse();
  const label = (k: string) => {
    const [y, m] = k.split('-').map(Number);
    return `${MONTHS[m - 1]} ${y}`;
  };
  const groups: JobGroup<J>[] = [
    ...upcoming.map((k) => ({ key: k, label: label(k), jobs: map.get(k)!.sort(byStart) })),
    ...past.map((k) => ({ key: k, label: label(k), past: true, jobs: map.get(k)!.sort(byStart) })),
  ];
  if (map.has('none')) groups.push({ key: 'none', label: 'No dates yet', jobs: map.get('none')!.sort(byStart) });
  return groups;
}

export function groupJobsByStatus<J extends ListJob>(jobs: J[]): JobGroup<J>[] {
  const known = new Set<string>(JOB_STATUS_ORDER);
  const out: JobGroup<J>[] = [];
  for (const s of JOB_STATUS_ORDER) {
    const list = jobs.filter((j) => j.status === s).sort(byStart);
    if (list.length) out.push({ key: s, label: JOB_STATUS_LABEL[s], jobs: list });
  }
  const other = jobs.filter((j) => !known.has(j.status)).sort(byStart);
  if (other.length) out.push({ key: 'other', label: 'Other', jobs: other });
  return out;
}

const SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
function parts(d: string): [number, number, number] | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(d);
  return m ? [Number(m[1]), Number(m[2]), Number(m[3])] : null;
}

/** "3–16 Mar 2026", "28 Feb – 3 Mar 2026", "29 Dec 2026 – 4 Jan 2027". */
export function fmtRange(start: string | null, end: string | null): string {
  const a = start ? parts(start) : null;
  const b = end ? parts(end) : null;
  const one = (p: [number, number, number]) => `${p[2]} ${SHORT[p[1] - 1]} ${p[0]}`;
  if (!a && !b) return 'No dates';
  if (!a || !b) return one((a ?? b)!);
  if (a[0] !== b[0]) return `${one(a)} – ${one(b)}`;
  if (a[1] !== b[1]) return `${a[2]} ${SHORT[a[1] - 1]} – ${one(b)}`;
  if (a[2] === b[2]) return one(a);
  return `${a[2]}–${b[2]} ${SHORT[a[1] - 1]} ${a[0]}`;
}

/** Calendar days on hire, both ends counted (3 → 16 Mar = 14). */
export function hireDays(start: string | null, end: string | null): number {
  if (!start || !end) return 0;
  const a = Date.parse(start.slice(0, 10) + 'T00:00:00Z');
  const b = Date.parse(end.slice(0, 10) + 'T00:00:00Z');
  if (!Number.isFinite(a) || !Number.isFinite(b) || b < a) return 0;
  return Math.round((b - a) / 86_400_000) + 1;
}
