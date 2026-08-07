/* ============================================
   LOWPASS — the ONE rate writer (Stage 1 · rates convergence)

   Every path that sets a person's tour rates goes through here so
   personnel_rate_lines (the SSOT) and the legacy personnel_rates.* columns (the
   mirror, until migration 231 drops them) can never diverge, and so the table is
   only ever keyed one way: (tour_id, roster_personnel_id). Row-id callers pass
   cardId and it's translated to the canonical row internally.

   CANONICAL MODEL (migration 261): there is no per-person rate_type gating any
   more — every rate line bills independently (sum), so this writer no longer
   prunes "unowned" fee lines. It writes EXACTLY the lines whose rate keys the
   caller PROVIDED (partial edits never touch — and never resurrect — other
   lines):
     showRate → a1 Show · offRate → a2 Travel · rehearsalRate → a3 Rehearsal ·
     perDiem → a4 Per diem · advanceFee → a5 Advance
   Flat day (a6), Flat tour (a7) and Press/Radio (a9) have no legacy-column
   source — they are entered directly in the Rates grid (→ /api/budget/
   rate-lines) and this writer never fabricates or deletes them.
   MONEY: values written to the lines are the SAME legacy values written to the
   mirror columns — no arithmetic here, so no money can move.

   Sequenced writes with early return on error (Supabase has no multi-statement
   txn from the JS client; the line write is idempotent so a re-run heals a
   partial failure).
   ============================================ */

import type { SupabaseClient } from '@supabase/supabase-js';
import { DEFAULT_RATE_TYPE_IDS } from '@/lib/payroll/rateLines';

const num = (v: unknown): number => Number(v) || 0;

/** The five rate values, mirrored to legacy columns + converted to lines. Keys
 *  are grep-clean (camelCase, not the legacy column names) so call sites never
 *  name a legacy column. Only provided keys are written (partial edits preserve
 *  the rest). */
export interface RateMirror {
  showRate?: number | null;
  offRate?: number | null;
  rehearsalRate?: number | null;
  perDiem?: number | null;
  advanceFee?: number | null;
}

/** RateMirror key → [legacy personnel_rates column, canonical rate_type id]. */
const RATE_KEY_MAP: Array<[keyof RateMirror, string, string]> = [
  ['showRate', 'show_rate', DEFAULT_RATE_TYPE_IDS.show],
  ['offRate', 'off_rate', DEFAULT_RATE_TYPE_IDS.offTravel],
  ['rehearsalRate', 'rehearsal_rate', DEFAULT_RATE_TYPE_IDS.rehearsal],
  ['perDiem', 'per_diem', DEFAULT_RATE_TYPE_IDS.perDiem],
  ['advanceFee', 'advance_fee', DEFAULT_RATE_TYPE_IDS.advance],
];

/** Identity fields used only when CREATING a card (no-op on update unless given). */
export interface CardIdentity {
  person_name?: string | null;
  role?: string | null;
  person_type?: string | null;
  person_id?: string | null;
  tour_personnel_id?: string | null;
}

export interface WriteRatesArgs {
  /** Required for the rosterPersonnelId (lookup/create) path; for the cardId path
   *  it's derived from the resolved card. */
  tourId?: string;
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

  // 1. Resolve the canonical card. cardId is unique (workspace-scoped); the
  //    roster path additionally needs tourId.
  let card: Record<string, unknown> | null = null;
  if (cardId) {
    const { data } = await supabase
      .from('personnel_rates')
      .select('*')
      .eq('id', cardId)
      .eq('workspace_id', workspaceId)
      .maybeSingle();
    card = (data as Record<string, unknown> | null) ?? null;
    if (!card) return { card: null, error: 'Rate card not found' };
  } else if (rosterPersonnelId) {
    if (!tourId) return { card: null, error: 'writeRates roster path requires tourId' };
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
  // The tour the lines belong to — from the resolved card, else the arg (create).
  const resolvedTourId = String((card?.tour_id as string | undefined) ?? tourId ?? '');

  // 2. Mirror columns (only provided rate keys) + optional identity/internal_rate.
  const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
  for (const [k, col] of RATE_KEY_MAP) {
    if (rates[k] !== undefined) patch[col] = num(rates[k]);
  }
  if (internalRate !== undefined) patch.internal_rate = internalRate === null ? null : num(internalRate);

  let created = false;
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
      tour_id: resolvedTourId,
      workspace_id: workspaceId,
      roster_personnel_id: rosterPersonnelId,
      ...(identity ?? {}),
      show_rate: num(rates.showRate),
      off_rate: num(rates.offRate),
      rehearsal_rate: num(rates.rehearsalRate),
      per_diem: num(rates.perDiem),
      advance_fee: num(rates.advanceFee),
    };
    if (internalRate !== undefined) insert.internal_rate = internalRate === null ? null : num(internalRate);
    const { data, error } = await supabase.from('personnel_rates').insert(insert).select('*').maybeSingle();
    if (error || !data) return { card: null, error: error?.message ?? 'Failed to create rate card' };
    card = data as Record<string, unknown>;
    created = true;
  }

  // 3. Write the SSOT lines — EXACTLY the provided rate keys (a create writes
  //    all five from the insert's values). Partial edits never touch other
  //    lines, and nothing is ever pruned: under the sum model a line the caller
  //    didn't name is a line the caller didn't change.
  const cid = card.id as string;
  const provided = created ? RATE_KEY_MAP : RATE_KEY_MAP.filter(([k]) => rates[k] !== undefined);
  const lineRows = provided.map(([k, , typeId]) => ({ rate_type_id: typeId, amount: num(rates[k]) }));

  if (lineRows.length > 0) {
    const { error: lineErr } = await supabase.from('personnel_rate_lines').upsert(
      lineRows.map((l) => ({
        tour_id: resolvedTourId,
        workspace_id: workspaceId,
        personnel_rate_id: cid,
        rate_type_id: l.rate_type_id,
        amount: l.amount,
      })),
      { onConflict: 'personnel_rate_id,rate_type_id' },
    );
    if (lineErr) return { card, error: `Rates saved but rate lines failed: ${lineErr.message}` };
  }

  return { card };
}
