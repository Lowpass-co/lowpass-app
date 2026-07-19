/* ============================================
   LOWPASS — Operations · Payroll (Phase 4 unblock)

   /operations/[tourId]/payroll — live weekly payroll sheets + summary.
   Ports /tours/[id]/payroll, inner content only (ProductShell +
   TourHeader come from /operations/[tourId]/layout.tsx).
   ============================================ */

import { notFound } from 'next/navigation';
import { createServerSupabaseClient } from '@/lib/supabase-server';
import { PayrollView } from '@/components/payroll/PayrollView';

export const dynamic = 'force-dynamic';

export default async function OperationsTourPayrollPage({ params }: { params: Promise<{ tourId: string }> }) {
  const { tourId } = await params;
  const supabase = await createServerSupabaseClient();

  const { data: tour, error: tourError } = await supabase
    .from('tours')
    .select('id, name, currency, workspace_id')
    .eq('id', tourId)
    .single();

  if (tourError || !tour) notFound();

  // Personnel unification — FOUNDATION FIX.
  // ROW SOURCE is the roster (`tour_personnel`), NOT the rate cards. The
  // earlier "filter rate cards by tour_personnel_id" approach silently
  // dropped every roster member who has no rate card yet — so people on the
  // tour were invisible in Payroll. We now derive rows from the roster.
  //
  // Payroll has a hard FK floor: `payroll_entries.personnel_id NOT NULL
  // REFERENCES personnel_rates(id)`, so an editable payroll row REQUIRES a
  // rate card. We therefore LEFT JOIN the roster to its card and seed a
  // blank, linked card for any roster member missing one (idempotent — only
  // inserts where no `tour_personnel_id`-linked card exists). The downstream
  // grids keep keying on `personnel_rates.id`, which now exists for everyone.
  const [{ data: routingDates }, { data: rosterRows }, { data: payrollRows }] = await Promise.all([
    supabase.from('routing').select('*').eq('tour_id', tourId).order('date', { ascending: true }),
    supabase
      .from('tour_personnel')
      .select('id, person_id, role, created_at')
      .eq('tour_id', tourId)
      .order('created_at', { ascending: true }),
    supabase
      .from('payroll_entries')
      .select(`
        *,
        personnel_rates(person_name, role, person_type, rate_type, per_diem, advance_fee, order_index)
      `)
      .eq('tour_id', tourId)
      .order('week_start'),
  ]);

  const roster = (rosterRows ?? []) as Array<{ id: string; person_id: string | null; role: string | null }>;

  // Names for the roster (full_name is the canonical key Rooming also uses).
  const rosterPersonIds = roster.map((r) => r.person_id).filter((id): id is string => Boolean(id));
  const nameByPersonId = new Map<string, string>();
  if (rosterPersonIds.length > 0) {
    const { data: personsRows } = await supabase
      .from('persons')
      .select('id, full_name, preferred_name')
      .in('id', rosterPersonIds);
    for (const p of (personsRows ?? []) as Array<{ id: string; full_name?: string | null; preferred_name?: string | null }>) {
      nameByPersonId.set(p.id, (p.full_name?.trim() || p.preferred_name?.trim() || ''));
    }
  }

  // Existing roster-linked rate cards → which roster members already have one.
  const { data: existingCards } = await supabase
    .from('personnel_rates')
    .select('id, tour_personnel_id, order_index')
    .eq('tour_id', tourId)
    .not('tour_personnel_id', 'is', null);
  const linkedMemberIds = new Set(
    ((existingCards ?? []) as Array<{ tour_personnel_id?: string | null }>)
      .map((c) => c.tour_personnel_id)
      .filter((id): id is string => Boolean(id)),
  );
  let maxOrder = 0;
  for (const c of (existingCards ?? []) as Array<{ order_index?: number | null }>) {
    if (typeof c.order_index === 'number' && c.order_index > maxOrder) maxOrder = c.order_index;
  }

  // Seed a blank, linked card for every roster member missing one. Idempotent
  // (skips members that already have a tour_personnel_id-linked card), so a
  // page refresh never duplicates. Best-effort: if RLS blocks the write we
  // still render whatever cards exist.
  const missing = roster.filter((m) => !linkedMemberIds.has(m.id));
  if (missing.length > 0) {
    const toInsert = missing.map((m, i) => ({
      tour_id: tourId,
      workspace_id: tour.workspace_id,
      person_id: m.person_id ?? null,
      tour_personnel_id: m.id,
      person_name: (m.person_id ? nameByPersonId.get(m.person_id) : '') || m.role || 'Unknown',
      role: m.role ?? '',
      person_type: 'crew',
      order_index: maxOrder + 1 + i,
    }));
    try {
      await supabase.from('personnel_rates').insert(toInsert);
    } catch {
      /* best-effort seed; render existing cards regardless */
    }
  }

  // Final row set: every roster-linked card, in order. After the seed this is
  // exactly one card per roster member — so Payroll, Rooming and the
  // Personnel page now agree.
  const { data: ratesRows } = await supabase
    .from('personnel_rates')
    .select('*')
    .eq('tour_id', tourId)
    .not('tour_personnel_id', 'is', null)
    .order('order_index');

  // OPS-16 — display the LIVE roster name. The card's stored person_name
  // can be stale (e.g. after a swap that didn't reach it); the authoritative
  // name is persons.full_name via the card's person_id. Override it here so
  // Payroll always shows the current person.
  const personnelRates = ((ratesRows ?? []) as Array<Record<string, unknown>>).map((r) => {
    const liveName = r.person_id ? nameByPersonId.get(r.person_id as string) : '';
    return liveName ? { ...r, person_name: liveName } : r;
  });

  // b2 — the rate catalog (global defaults + this workspace's customs) + every
  // person's rate line amounts, for the dynamic Rates grid.
  const [{ data: rateTypeRows }, { data: rateLineRows }] = await Promise.all([
    supabase
      .from('rate_types')
      .select('id, name, bucket, basis, day_statuses, order_index')
      .or(`workspace_id.is.null,workspace_id.eq.${tour.workspace_id}`)
      .order('order_index', { ascending: true }),
    supabase
      .from('personnel_rate_lines')
      .select('personnel_rate_id, rate_type_id, amount')
      .eq('tour_id', tourId),
  ]);
  const payrollEntries = (payrollRows ?? [])
    .map((row: { personnel_rates?: unknown; personnel?: unknown }) => {
      const p = row.personnel_rates ?? row.personnel;
      return { ...row, personnel: Array.isArray(p) ? p[0] : p };
    })
    .sort(
      (
        a: { week_start?: string; personnel?: { order_index?: number } },
        b: { week_start?: string; personnel?: { order_index?: number } },
      ) => {
        const ws = (a.week_start ?? '').localeCompare(b.week_start ?? '');
        if (ws !== 0) return ws;
        return (a.personnel?.order_index ?? 0) - (b.personnel?.order_index ?? 0);
      },
    );

  return (
    // G2-2b — the payroll matrix is the work surface: full-bleed (no narrow
    // max-w wrapper) and full-height so the grid fills the page and scrolls
    // internally instead of leaving dead space below.
    <div className="flex h-full min-h-0 flex-col px-4 pt-4 pb-3">
      <PayrollView
        tourId={tour.id}
        tourName={tour.name}
        currency={tour.currency}
        routingDates={routingDates ?? []}
        personnelRates={personnelRates}
        payrollEntries={payrollEntries}
        rateTypes={rateTypeRows ?? []}
        rateLines={rateLineRows ?? []}
      />
    </div>
  );
}
