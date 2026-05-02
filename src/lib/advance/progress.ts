/* ============================================
   LOWPASS — Advance · Progress computation

   One source of truth for the "X complete / Y pending / Z overdue
   out of N total" math used by both the page-level chunky progress
   strip (AdvanceShowHeader) and any client surface that needs to
   show the same numbers. Avoids the past-sprint bug where the
   server and client computed progress differently and the chunky
   strip showed 0/0/0 while the section pills underneath read
   different statuses.

   Definitions:
   - complete: section_statuses[id]?.status === 'complete'
   - overdue: status is 'not_started' AND show date is in the past.
              not_started + future show date = pending, not overdue.
   - pending: total minus complete minus overdue. Soaks up
              in_progress / needs_review / unrecorded statuses.
   - percent: round(complete / total * 100). 0% if total is 0.

   Pure function — no Supabase, no React. Safe to call from a server
   component or a client effect.
   ============================================ */

type SectionLite = {
  template_id: string;
  label: string;
};

type StatusEntry = {
  status?: string;
};

export type AdvanceProgress = {
  complete: number;
  pending: number;
  overdue: number;
  total: number;
  percent: number;
};

export function computeAdvanceProgress(
  sections: SectionLite[] | null | undefined,
  sectionStatuses: Record<string, StatusEntry> | null | undefined,
  showIsPast: boolean,
): AdvanceProgress {
  const list = sections ?? [];
  const statuses = sectionStatuses ?? {};
  const total = list.length;
  let complete = 0;
  let overdue = 0;
  for (const s of list) {
    const key = s.template_id ?? s.label;
    const st = statuses[key]?.status ?? 'not_started';
    if (st === 'complete') {
      complete += 1;
    } else if (st === 'not_started' && showIsPast) {
      overdue += 1;
    }
  }
  const pending = Math.max(0, total - complete - overdue);
  const percent = total > 0 ? Math.round((complete / total) * 100) : 0;
  return { complete, pending, overdue, total, percent };
}
