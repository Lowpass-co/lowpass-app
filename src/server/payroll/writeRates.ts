/* ============================================
   LOWPASS — the ONE rate writer (Stage 1 · rates convergence)

   Every path that sets a person's tour rates goes through here so
   personnel_rate_lines (the SSOT) and the legacy personnel_rates.* columns (the
   mirror, until migration 231 drops them) can never diverge, and so the table is
   only ever keyed one way: (tour_id, roster_personnel_id). Row-id callers pass
   cardId and it's translated to the canonical row internally.

   Line layout mirrors migrations 228/229 exactly, so a read through computeTotals
   over these lines reproduces the legacy ratesToLines() number to the penny:
     split rate → a1 Show / a2 Off / a3 Rehearsal / a4 Per-diem / a5 Advance
     day rate   → a6 Day-rate (= off_rate) / a4 / a5 ; a1/a2/a3 removed
   MONEY: values written to the lines are the SAME legacy values written to the
   mirror columns — no arithmetic here, so no money can move.

   Sequenced writes with early return on error (Supabase has no multi-statement
   txn from the JS client; the line write is idempotent so a re-run heals a
   partial failure).
   ============================================ */

import type { SupabaseClient } from '@supabase/supabase-js';
import { DEFAULT_RATE_TYPE_IDS } from '@/lib/payroll/rateLines';

const num = (v: unknown): number => Number(v) || 0;

/** The five legacy rate values, mirrored to columns + converted to lines. Only
 *  provided keys are written (partial edits preserve the rest). */
export interface RateMirror {
  show_rate?: number | null;
  off_rate?: number | null;
  rehearsal_rate?: number | null;
  per_diem?: number | null;
  advance_fee?: number | null;
}

/** Identity fields used only when CREATING a card (no-op on update unless given). */
export interface CardIdentity {
  person_name?: string | null;
  role?: string | null;
  person_type?: string | null;
  person_id?: string | null;
  tour_personnel_id?: string | null;
}

export interface WriteRatesArgs {
  tourId: string;
  workspaceId: string;
  /** Canonical key (preferred). */
  rosterPersonnelId?: string | null;
  /** Row-id key (translated to the canonical row; rejected if it doesn't resolve). */
  cardId?: string | null;
  /** Used to create a card when none resolves (needs rosterPersonnelId). */
  identity?: CardIdentity;
  rates: RateMirror;
  /** Admin-only company cost — its own path, NOT a rate type. Written when provided. */
  internalRate?: number | null;
}

export interface WriteRatesResult {
  card: Record<string, unknown> | null;
  error?: string;
}

/** THE single rate writer — see file header. */
export async function writeRates(
  supabase: SupabaseClient,
  args: WriteRatesArgs,
): Promise<WriteRatesResult> {
  const { tourId, workspaceId, rosterPersonnelId, cardId, identity, rates, internalRate } = args;

  // 1. Resolve the canonical card.
  let card: Record<string, unknown> | null = null;
  if (cardId) {
    const { data } = await supabase
      .from('personnel_rates')
      .select('*')
      .eq('id', cardId)
      .eq('tour_id', tourId)
      .eq('workspace_id', workspaceId)
      .maybeSingle();
    card = (data as Record<string, unknown> | null) ?? null;
    if (!card) return { card: null, error: 'Rate card not found for this tour' };
  } else if (rosterPersonnelId) {
    const { data } = await supabase
      .from('personnel_rates')
      .select('*')
      .eq('tour_id', tourId)
      .eq('roster_personnel_id', rosterPersonnelId)
      .maybeSingle();
    card = (data as Record<string, unknown> | null) ?? null;
  } else {
    return { card: null, error: 'writeRates requires rosterPersonnelId or cardId' };
  }

  // 2. Mirror columns (only provided rate keys) + optional identity/internal_rate.
  const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
  for (const k of ['show_rate', 'off_rate', 'rehearsal_rate', 'per_diem', 'advance_fee'] as const) {
    if (rates[k] !== undefined) patch[k] = num(rates[k]);
  }
  if (internalRate !== undefined) patch.internal_rate = internalRate === null ? null : num(internalRate);

  if (card) {
    if (identity) for (const [k, v] of Object.entries(identity)) if (v !== undefined) patch[k] = v;
    const { data, error } = await supabase
      .from('personnel_rates')
      .update(patch)
      .eq('id', card.id as string)
      .select('*')
      .maybeSingle();
    if (error) return { card, error: error.message };
    card = (data as Record<string, unknown> | null) ?? card;
  } else {
    if (!rosterPersonnelId) return { card: null, error: 'No card to update and no roster key to create one' };
    const insert: Record<string, unknown> = {
      tour_id: tourId,
      workspace_id: workspaceId,
      roster_personnel_id: rosterPersonnelId,
      ...(identity ?? {}),
      show_rate: num(rates.show_rate),
      off_rate: num(rates.off_rate),
      rehearsal_rate: num(rates.rehearsal_rate),
      per_diem: num(rates.per_diem),
      advance_fee: num(rates.advance_fee),
    };
    if (internalRate !== undefined) insert.internal_rate = internalRate === null ? null : num(internalRate);
    const { data, error } = await supabase.from('personnel_rates').insert(insert).select('*').maybeSingle();
    if (error || !data) return { card: null, error: error?.message ?? 'Failed to create rate card' };
    card = data as Record<string, unknown>;
  }

  // 3. Write the SSOT lines from the card's FINAL values, respecting rate_type.
  const cid = card.id as string;
  const isDayRate = String(card.rate_type ?? '') === 'day_rate';
  const lineRows: Array<{ rate_type_id: string; amount: number }> = [];
  if (isDayRate) {
    lineRows.push({ rate_type_id: DEFAULT_RATE_TYPE_IDS.dayRate, amount: num(card.off_rate) });
  } else {
    lineRows.push(
      { rate_type_id: DEFAULT_RATE_TYPE_IDS.show, amount: num(card.show_rate) },
      { rate_type_id: DEFAULT_RATE_TYPE_IDS.offTravel, amount: num(card.off_rate) },
      { rate_type_id: DEFAULT_RATE_TYPE_IDS.rehearsal, amount: num(card.rehearsal_rate) },
    );
  }
  lineRows.push(
    { rate_type_id: DEFAULT_RATE_TYPE_IDS.perDiem, amount: num(card.per_diem) },
    { rate_type_id: DEFAULT_RATE_TYPE_IDS.advance, amount: num(card.advance_fee) },
  );

  const { error: lineErr } = await supabase.from('personnel_rate_lines').upsert(
    lineRows.map((l) => ({
      tour_id: tourId,
      workspace_id: workspaceId,
      personnel_rate_id: cid,
      rate_type_id: l.rate_type_id,
      amount: l.amount,
    })),
    { onConflict: 'personnel_rate_id,rate_type_id' },
  );
  if (lineErr) return { card, error: `Rates saved but rate lines failed: ${lineErr.message}` };

  // day_rate cards must not keep split lines (a1/a2/a3) — they'd double-count.
  if (isDayRate) {
    await supabase
      .from('personnel_rate_lines')
      .delete()
      .eq('personnel_rate_id', cid)
      .in('rate_type_id', [
        DEFAULT_RATE_TYPE_IDS.show,
        DEFAULT_RATE_TYPE_IDS.offTravel,
        DEFAULT_RATE_TYPE_IDS.rehearsal,
      ]);
  }

  return { card };
}
