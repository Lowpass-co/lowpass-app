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
    .select('id, name, currency')
    .eq('id', tourId)
    .single();

  if (tourError || !tour) notFound();

  const [{ data: routingDates }, { data: ratesRows }, { data: payrollRows }] = await Promise.all([
    supabase.from('routing').select('*').eq('tour_id', tourId).order('date', { ascending: true }),
    supabase.from('personnel_rates').select('*').eq('tour_id', tourId).order('order_index'),
    supabase
      .from('payroll_entries')
      .select(`
        *,
        personnel_rates(person_name, role, person_type, rate_type, show_rate, off_rate, rehearsal_rate, per_diem, advance_fee, order_index)
      `)
      .eq('tour_id', tourId)
      .order('week_start'),
  ]);

  const personnelRates = ratesRows ?? [];
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
    <div className="mx-auto max-w-[1400px] space-y-4 px-4 pt-6 pb-12">
      <PayrollView
        tourId={tour.id}
        tourName={tour.name}
        currency={tour.currency}
        routingDates={routingDates ?? []}
        personnelRates={personnelRates}
        payrollEntries={payrollEntries}
      />
    </div>
  );
}
