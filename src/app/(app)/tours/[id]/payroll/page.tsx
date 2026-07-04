/* ============================================
   LOWPASS — Payroll Page

   Weekly payroll sheets + summary.
   ============================================ */

import { notFound } from 'next/navigation';
import { listAppPageShell } from '@/components/shell/app-page-shells';
import { createServerSupabaseClient } from '@/lib/supabase-server';
import { PayrollView } from '@/components/payroll/PayrollView';

export default async function PayrollPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id: tourId } = await params;
  const supabase = await createServerSupabaseClient();

  const { data: tour, error: tourError } = await supabase
    .from('tours')
    .select('id, name, currency, workspace_id')
    .eq('id', tourId)
    .single();

  if (tourError || !tour) notFound();

  const [
    { data: routingDates },
    { data: ratesRows },
    { data: payrollRows },
    { data: rateTypeRows },
    { data: rateLineRows },
  ] = await Promise.all([
    supabase.from('routing').select('*').eq('tour_id', tourId).order('date', { ascending: true }),
    supabase.from('personnel_rates').select('*').eq('tour_id', tourId).order('order_index'),
    supabase
      .from('payroll_entries')
      .select(`
        *,
        personnel_rates(person_name, role, person_type, rate_type, per_diem, advance_fee, order_index)
      `)
      .eq('tour_id', tourId)
      .order('week_start'),
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

  const personnelRates = ratesRows ?? [];
  const payrollEntries = (payrollRows ?? [])
    .map((row: { personnel_rates?: unknown; personnel?: unknown }) => {
      const p = row.personnel_rates ?? row.personnel;
      return { ...row, personnel: Array.isArray(p) ? p[0] : p };
    })
    .sort((a: { week_start?: string; personnel?: { order_index?: number } }, b: { week_start?: string; personnel?: { order_index?: number } }) => {
      const ws = (a.week_start ?? '').localeCompare(b.week_start ?? '');
      if (ws !== 0) return ws;
      return ((a.personnel?.order_index ?? 0) - (b.personnel?.order_index ?? 0));
    });

  return listAppPageShell(
    <div className="mx-auto max-w-[1400px] space-y-4 pb-12">
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
