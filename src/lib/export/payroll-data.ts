/* ============================================
   LOWPASS — Payroll export data loader (#8 Document Export, Payroll slice)

   Mirrors the payroll PAGE's loaders (src/app/(app)/operations/[tourId]/payroll/
   page.tsx) so the exported run sheet + statements match the Payroll tab exactly:
   the canonical roster (tour_personnel → persons), the rate cards
   (personnel_rates, tour_personnel_id NOT NULL), the persisted weekly entries
   (payroll_entries.day_statuses), and the SAME fee math (src/lib/payroll/fees.ts —
   countDayStatuses / computeTotalFee / computeTotalPerDiem). Totals are NOT
   re-derived here; they come from that shared pure module.

   SECURITY (D5): personnel_rates.internal_rate (the company's cost) is NEVER read
   or exposed — not in the run sheet, not in a statement. Only show/off/rehearsal
   rates + per-diem reach the document.

   Read-only. Caller has auth'd + workspace-scoped the tour.
   ============================================ */

import type { SupabaseClient } from '@supabase/supabase-js';
import { resolveArtistLogoUrl } from '@/lib/artists/imageUrl';
import { countDayStatuses, computeTotalFee, computeTotalPerDiem, type DayCounts } from '@/lib/payroll/fees';

export interface PayrollWeek {
  weekStart: string;
  counts: DayCounts;
  fee: number;
  perDiem: number;
}

export interface PayrollPerson {
  name: string;
  role: string | null;
  showRate: number;
  offRate: number;
  rehearsalRate: number;
  perDiemRate: number;
  /** Aggregated day counts across all the person's weekly entries. */
  days: DayCounts;
  /** Σ fee across weeks (incl. advance_fee, which sits on the week-1 entry). */
  fee: number;
  perDiemTotal: number;
  /** fee + perDiemTotal. */
  total: number;
  /** Per-week breakdown for the statement page. */
  weeks: PayrollWeek[];
}

export interface PayrollExportData {
  tour: { id: string; name: string; currency: string; start_date: string | null; end_date: string | null };
  artist: { name: string } | null;
  logoUrl: string | null;
  currency: string;
  persons: PayrollPerson[];
  grandFee: number;
  grandPerDiem: number;
  grandTotal: number;
}

const num = (v: unknown): number => Number(v) || 0;

export async function loadPayrollExportData(
  supabase: SupabaseClient,
  tour: { id: string; name: string; currency: string | null; start_date: string | null; end_date: string | null; artist_id: string | null },
  workspaceId: string,
): Promise<PayrollExportData> {
  const tourId = tour.id;
  const currency = (tour.currency || 'GBP').toUpperCase();

  const [rosterRes, ratesRes, entriesRes, artistRes] = await Promise.all([
    supabase.from('tour_personnel').select('id, person_id, role').eq('tour_id', tourId).eq('workspace_id', workspaceId),
    // EXCLUDE internal_rate from the projection — never selected, never exposed.
    supabase
      .from('personnel_rates')
      .select('id, tour_personnel_id, person_name, role, show_rate, off_rate, rehearsal_rate, per_diem, order_index')
      .eq('tour_id', tourId)
      .eq('workspace_id', workspaceId)
      .not('tour_personnel_id', 'is', null)
      .order('order_index', { ascending: true }),
    supabase.from('payroll_entries').select('id, personnel_id, week_start, day_statuses, advance_fee').eq('tour_id', tourId).eq('workspace_id', workspaceId).order('week_start', { ascending: true }),
    tour.artist_id
      ? supabase.from('artists').select('id, name, branding, spotify_id, spotify_image_url').eq('id', tour.artist_id).maybeSingle()
      : Promise.resolve({ data: null }),
  ]);

  const roster = (rosterRes.data ?? []) as Array<{ id: string; person_id: string | null; role: string | null }>;
  const rosterById = new Map(roster.map((r) => [r.id, r]));
  const personIds = roster.map((r) => r.person_id).filter((id): id is string => Boolean(id));

  // Person display names (full_name → preferred_name).
  const namesRes = personIds.length
    ? await supabase.from('persons').select('id, full_name, preferred_name').in('id', personIds)
    : { data: [] as Array<{ id: string; full_name: string | null; preferred_name: string | null }> };
  const nameByPersonId = new Map(
    ((namesRes.data ?? []) as Array<{ id: string; full_name: string | null; preferred_name: string | null }>).map((p) => [
      p.id,
      (p.full_name?.trim() || p.preferred_name?.trim() || '') as string,
    ]),
  );

  const rates = (ratesRes.data ?? []) as Array<{
    id: string;
    tour_personnel_id: string | null;
    person_name: string | null;
    role: string | null;
    show_rate: number | string | null;
    off_rate: number | string | null;
    rehearsal_rate: number | string | null;
    per_diem: number | string | null;
    order_index: number | null;
  }>;

  const entries = (entriesRes.data ?? []) as Array<{
    id: string;
    personnel_id: string;
    week_start: string;
    day_statuses: Record<string, string> | null;
    advance_fee: number | string | null;
  }>;
  const entriesByRateId = new Map<string, typeof entries>();
  for (const e of entries) {
    const arr = entriesByRateId.get(e.personnel_id) ?? [];
    arr.push(e);
    entriesByRateId.set(e.personnel_id, arr);
  }

  const persons: PayrollPerson[] = rates.map((rate) => {
    const rosterRow = rate.tour_personnel_id ? rosterById.get(rate.tour_personnel_id) : undefined;
    const liveName = rosterRow?.person_id ? nameByPersonId.get(rosterRow.person_id) : undefined;
    const name = (liveName && liveName.length ? liveName : rate.person_name?.trim() || '—') as string;
    const role = rosterRow?.role ?? rate.role ?? null;

    const myEntries = entriesByRateId.get(rate.id) ?? [];
    const agg: DayCounts = { show: 0, offTravel: 0, rehearsal: 0, active: 0 };
    let fee = 0;
    let perDiemTotal = 0;
    const weeks: PayrollWeek[] = [];
    for (const e of myEntries) {
      const counts = countDayStatuses(e.day_statuses);
      const wFee = computeTotalFee(rate, counts, e.advance_fee);
      const wPd = computeTotalPerDiem(rate, counts);
      agg.show += counts.show;
      agg.offTravel += counts.offTravel;
      agg.rehearsal += counts.rehearsal;
      agg.active += counts.active;
      fee += wFee;
      perDiemTotal += wPd;
      weeks.push({ weekStart: e.week_start, counts, fee: wFee, perDiem: wPd });
    }

    return {
      name,
      role,
      showRate: num(rate.show_rate),
      offRate: num(rate.off_rate),
      rehearsalRate: num(rate.rehearsal_rate),
      perDiemRate: num(rate.per_diem),
      days: agg,
      fee,
      perDiemTotal,
      total: fee + perDiemTotal,
      weeks,
    };
  });

  const grandFee = persons.reduce((s, p) => s + p.fee, 0);
  const grandPerDiem = persons.reduce((s, p) => s + p.perDiemTotal, 0);

  const artistRow = artistRes.data as { id: string; name: string; branding: unknown; spotify_id: string | null; spotify_image_url: string | null } | null;
  const logoUrl = artistRow ? await resolveArtistLogoUrl(artistRow) : null;

  return {
    tour: { id: tourId, name: tour.name, currency, start_date: tour.start_date, end_date: tour.end_date },
    artist: artistRow ? { name: artistRow.name } : null,
    logoUrl,
    currency,
    persons,
    grandFee,
    grandPerDiem,
    grandTotal: grandFee + grandPerDiem,
  };
}
