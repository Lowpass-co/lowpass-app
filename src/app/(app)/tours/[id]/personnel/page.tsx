/* ============================================
   LOWPASS — Tour Personnel

   Assign workspace roster to tour (personnel_rates).
   ============================================ */

import { notFound } from 'next/navigation';
import { listAppPageShell } from '@/components/shell/app-page-shells';
import { createServerSupabaseClient } from '@/lib/supabase-server';
import { loadTourRateContext, rateAmountsFor } from '@/lib/payroll/loadRateLines';
import { TourPersonnelClient } from '@/components/personnel/TourPersonnelClient';
import type { Personnel, PersonnelRate } from '@/types';

export const dynamic = 'force-dynamic';

export default async function TourPersonnelPage({ params }: { params: Promise<{ id: string }> }) {
  const { id: tourId } = await params;
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return (
      <div className="mx-auto max-w-6xl">
        <p className="text-lp-text-secondary">Please sign in.</p>
      </div>
    );
  }

  const { data: profile } = await supabase
    .from('profiles')
    .select('workspace_id')
    .eq('id', user.id)
    .single();

  if (!profile?.workspace_id) {
    return (
      <div className="mx-auto max-w-6xl">
        <p className="text-lp-text-secondary">No workspace.</p>
      </div>
    );
  }

  const { data: tour, error: tourErr } = await supabase
    .from('tours')
    .select('id, name, currency, workspace_id')
    .eq('id', tourId)
    .eq('workspace_id', profile.workspace_id)
    .single();

  if (tourErr || !tour) notFound();

  const [ratesRes, rosterRes] = await Promise.all([
    supabase
      .from('personnel_rates')
      .select('*')
      .eq('tour_id', tourId)
      .eq('workspace_id', profile.workspace_id)
      .order('order_index', { ascending: true }),
    supabase
      .from('personnel')
      .select('*')
      .eq('workspace_id', profile.workspace_id)
      .order('lp_id', { ascending: true }),
  ]);

  // Rates SSOT — attach each card's camelCase amounts (from personnel_rate_lines)
  // so the client's Rate column reads the SSOT, not the legacy columns.
  const rateCtx = await loadTourRateContext(supabase, tourId, profile.workspace_id);
  const initialRates = ((ratesRes.data ?? []) as PersonnelRate[]).map((r) => {
    const a = rateAmountsFor(rateCtx, r.id);
    return { ...r, showRate: a.showRate, offRate: a.offRate, rehearsalRate: a.rehearsalRate, perDiem: a.perDiem, advanceFee: a.advanceFee };
  });

  return listAppPageShell(
    <div className="mx-auto max-w-6xl space-y-6 pb-12">
      <TourPersonnelClient
        tourId={tour.id}
        tourName={tour.name ?? 'Tour'}
        currency={tour.currency ?? 'GBP'}
        initialRates={initialRates}
        initialRoster={(rosterRes.data ?? []) as Personnel[]}
      />
    </div>
  );
}
