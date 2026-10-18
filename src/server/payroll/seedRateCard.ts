/* ============================================
   LOWPASS — seed a new tour rate card from the person's last tour (Oct 2026)

   The DB half of src/lib/payroll/seedFromLastTour.ts. Used by every path that
   creates a rate card (roster add, the budget personnel-rates POST), so a new
   card is pre-filled the same way wherever it's born. Best-effort: any read
   failure seeds the five zero lines, never fails the add.
   ============================================ */

import type { SupabaseClient } from '@supabase/supabase-js';
import { perDiemOf, pickLatestCard, seedLines, type PriorCard } from '@/lib/payroll/seedFromLastTour';
import type { RateLineRow } from '@/lib/payroll/rateLines';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export interface RateSeed {
  lines: Array<{ rate_type_id: string; amount: number }>;
  perDiem: number;
  /** The tour the amounts were copied from (null = none, blank card). */
  fromTourId: string | null;
}

export async function lastTourSeed(
  supabase: SupabaseClient,
  args: { workspaceId: string; tourId: string; personId: string | null | undefined },
): Promise<RateSeed> {
  const blank = (): RateSeed => {
    const lines = seedLines(null);
    return { lines, perDiem: perDiemOf(lines), fromTourId: null };
  };
  const personId = args.personId ?? '';
  if (!UUID.test(personId)) return blank();
  try {
    // A card names its person by person_id (persons) and/or roster_personnel_id
    // (personnel) — the two share UUIDs, and older cards may carry only one.
    let res = await supabase
      .from('personnel_rates')
      .select('id, tour_id, created_at')
      .eq('workspace_id', args.workspaceId)
      .or(`person_id.eq.${personId},roster_personnel_id.eq.${personId}`);
    if (res.error) {
      res = await supabase
        .from('personnel_rates')
        .select('id, tour_id, created_at')
        .eq('workspace_id', args.workspaceId)
        .eq('person_id', personId);
    }
    const cards = (res.data ?? []) as PriorCard[];
    const others = cards.filter((c) => c.tour_id !== args.tourId);
    if (others.length === 0) return blank();

    const { data: tours } = await supabase
      .from('tours')
      .select('id, start_date')
      .in('id', [...new Set(others.map((c) => c.tour_id))]);
    const starts = new Map(((tours ?? []) as Array<{ id: string; start_date: string | null }>).map((t) => [t.id, t.start_date]));
    const latest = pickLatestCard(others, starts, args.tourId);
    if (!latest) return blank();

    const { data: prior } = await supabase
      .from('personnel_rate_lines')
      .select('rate_type_id, amount')
      .eq('personnel_rate_id', latest.id)
      .eq('workspace_id', args.workspaceId);
    const lines = seedLines((prior ?? []) as RateLineRow[]);
    return { lines, perDiem: perDiemOf(lines), fromTourId: latest.tour_id };
  } catch {
    return blank();
  }
}

/** Write the seed lines for a just-created card. */
export async function insertSeedLines(
  supabase: SupabaseClient,
  args: { workspaceId: string; tourId: string; cardId: string; seed: RateSeed },
): Promise<void> {
  await supabase.from('personnel_rate_lines').insert(
    args.seed.lines.map((l) => ({
      tour_id: args.tourId,
      workspace_id: args.workspaceId,
      personnel_rate_id: args.cardId,
      rate_type_id: l.rate_type_id,
      amount: l.amount,
    })),
  );
}
