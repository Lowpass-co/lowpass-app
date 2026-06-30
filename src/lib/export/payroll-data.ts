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
import type { DateRange } from '@/lib/export/template-config';

/** A worked day with its location (Part E — the statement's "where we were" list). */
export interface PayrollDayRow {
  date: string;
  status: string;
  city: string | null;
  venue: string | null;
}

export interface PayrollLoadOptions {
  range?: DateRange;
  personId?: string | null;
  /** People picker — null/undefined = everyone; else only these rate-card ids. */
  selectedIds?: string[] | null;
  venuePerDay?: boolean;
}

export interface PayrollWeek {
  weekStart: string;
  counts: DayCounts;
  fee: number;
  perDiem: number;
}

export interface PayrollPerson {
  /** personnel_rates.id — used by the individual-mode person filter. */
  id: string;
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
  /** Per-day worked rows (date · status · city · venue) — only populated when
   *  venuePerDay is requested. */
  dayRows: PayrollDayRow[];
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

/** Keep only day_statuses whose date falls within [from,to] (null = open). */
function filterStatusesByRange(statuses: Record<string, string> | null, range?: DateRange): Record<string, string> {
  const all = statuses ?? {};
  if (!range || (!range.from && !range.to)) return all;
  const out: Record<string, string> = {};
  for (const [date, status] of Object.entries(all)) {
    if (range.from && date < range.from) continue;
    if (range.to && date > range.to) continue;
    out[date] = status;
  }
  return out;
}

export async function loadPayrollExportData(
  supabase: SupabaseClient,
  tour: { id: string; name: string; currency: string | null; start_date: string | null; end_date: string | null; artist_id: string | null },
  workspaceId: string,
  opts?: PayrollLoadOptions,
): Promise<PayrollExportData> {
  const tourId = tour.id;
  const currency = (tour.currency || 'GBP').toUpperCase();
  const range = opts?.range;

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

  // Per-day venue map (Part E — "where we were") — only when requested.
  const venueByDate = new Map<string, { city: string | null; venue: string | null }>();
  if (opts?.venuePerDay) {
    const { data: rt } = await supabase
      .from('routing')
      .select('date, city, venue_name, canonical_venues(name, city)')
      .eq('tour_id', tourId);
    for (const r of (rt ?? []) as Array<{ date: string; city: string | null; venue_name: string | null; canonical_venues?: { name?: string | null; city?: string | null } | Array<{ name?: string | null; city?: string | null }> | null }>) {
      const canon = Array.isArray(r.canonical_venues) ? r.canonical_venues[0] : r.canonical_venues;
      venueByDate.set(r.date, { city: (canon?.city ?? r.city) || null, venue: (canon?.name ?? r.venue_name) || null });
    }
  }
  const rangeActive = !!(range && (range.from || range.to));

  let persons: PayrollPerson[] = rates.map((rate) => {
    const rosterRow = rate.tour_personnel_id ? rosterById.get(rate.tour_personnel_id) : undefined;
    const liveName = rosterRow?.person_id ? nameByPersonId.get(rosterRow.person_id) : undefined;
    const name = (liveName && liveName.length ? liveName : rate.person_name?.trim() || '—') as string;
    const role = rosterRow?.role ?? rate.role ?? null;

    const myEntries = entriesByRateId.get(rate.id) ?? [];
    const agg: DayCounts = { show: 0, offTravel: 0, rehearsal: 0, active: 0 };
    let fee = 0;
    let perDiemTotal = 0;
    const weeks: PayrollWeek[] = [];
    const dayRows: PayrollDayRow[] = [];
    for (const e of myEntries) {
      const filtered = filterStatusesByRange(e.day_statuses, range);
      const counts = countDayStatuses(filtered);
      // The one-time advance sits on the week-1 entry — drop it only if the date
      // range fully excludes that week (no in-range days). Default (no range) is
      // unchanged: the advance always applies.
      const adv = rangeActive ? (counts.active > 0 ? e.advance_fee : 0) : e.advance_fee;
      const wFee = computeTotalFee(rate, counts, adv);
      const wPd = computeTotalPerDiem(rate, counts);
      agg.show += counts.show;
      agg.offTravel += counts.offTravel;
      agg.rehearsal += counts.rehearsal;
      agg.active += counts.active;
      fee += wFee;
      perDiemTotal += wPd;
      if (counts.active > 0 || !rangeActive) weeks.push({ weekStart: e.week_start, counts, fee: wFee, perDiem: wPd });
      if (opts?.venuePerDay) {
        for (const [date, status] of Object.entries(filtered)) {
          if (status !== 'show' && status !== 'off_travel' && status !== 'rehearsal') continue;
          const v = venueByDate.get(date);
          dayRows.push({ date, status, city: v?.city ?? null, venue: v?.venue ?? null });
        }
      }
    }
    dayRows.sort((a, b) => a.date.localeCompare(b.date));

    return {
      id: rate.id,
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
      dayRows,
    };
  });

  // People picker (multi-select) then the individual-mode single-person filter.
  if (opts?.selectedIds && opts.selectedIds.length) {
    const set = new Set(opts.selectedIds);
    persons = persons.filter((p) => set.has(p.id));
  }
  if (opts?.personId) persons = persons.filter((p) => p.id === opts.personId);

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
