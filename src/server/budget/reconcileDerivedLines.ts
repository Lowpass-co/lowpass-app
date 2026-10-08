/* ============================================
   LOWPASS — Budget ← Operations derived-line reconcile (THE one writer)

   Every automatic budget line is written HERE and nowhere else:

     family            source (owner)                         line identity
     ───────────────── ────────────────────────────────────── ─────────────────
     hotel_booking     hotels / rooms / room_assignments       hotels.id
     payroll           personnel_rate_lines × day statuses     personnel_rates.id
     payroll_per_diem  personnel_rate_lines × day statuses     personnel_rates.id
     flight            flights                                 flights.id
     gear              tour_gear × gear (hired_to_client)      gear.id

   WHO CALLS IT (money repair, Oct 2026):
     - every route that WRITES a source (payroll paint, rates, roster, routing,
       rooming, hotels, flights, gear) — via refreshDerivedLines(), scoped to
       the families that write can affect, so the budget is current the moment
       the owner saves;
     - every money READER (budget page, line-items GET, summary, artist
       summary, exports) — so a reader never shows a stale cache even if a
       writer's refresh failed.

   WHAT CHANGED vs the old pass (each one an audited leak):
     - errors are CHECKED, not swallowed. A failed source read SKIPS that
       family — it never reads "no rows" and deletes the budget's lines;
     - families run even when their source is empty, so the last hotel /
       person / flight deleted no longer leaves its cost behind;
     - the plan (src/lib/budget/derivedPlan.ts) never overwrites a receipt-set
       actual, never deletes a line with transactions on it, merges duplicates
       instead of keeping both, and writes only what changed;
     - flights and gear are reconciled here too, so the flight editor and the
       gear editor reach the budget through the same door as everything else;
     - each derived line carries its source currency, and transaction sums are
       converted into the line's currency before they become its actual.
   ============================================ */

import type { SupabaseClient } from '@supabase/supabase-js';
import { countDayStatuses, computeTotals } from '@/lib/payroll/fees';
import { effectiveStatuses } from '@/lib/payroll/effectiveDayType';
import { loadTourRateContext, rateLinesFor } from '@/lib/payroll/loadRateLines';
import { PLACEHOLDER_HOTEL_PREFIX } from '@/lib/rooming/nightsSummary';
import { logServerError } from '@/lib/log/serverError';
import { loadTourMoneyContext, loadTxnAggregates, type TourMoneyContext } from '@/lib/budget/moneyContext';
import {
  DERIVED_FAMILIES,
  planFamily,
  type DerivedFamily,
  type DesiredLine,
  type DraftSnapshot,
  type ExistingLine,
  type MirrorRow,
  type PlanContext,
  type PlanOp,
  } from '@/lib/budget/derivedPlan';

export { DERIVED_FAMILIES, type DerivedFamily } from '@/lib/budget/derivedPlan';
export { loadTourMoneyContext, loadTxnAggregates, type TourMoneyContext } from '@/lib/budget/moneyContext';

/** Kept for existing importers. */
export const DERIVED_SOURCE_TYPES = DERIVED_FAMILIES;

export interface ReconcileResult {
  /** True when every requested family reconciled without an error. */
  ok: boolean;
  /** Families that completed. */
  families: DerivedFamily[];
  /** Human-readable failures (also logged server-side). */
  errors: string[];
  /** Row writes performed (0 on a pass with nothing to change). */
  writes: number;
  /** True when every failure was a permission refusal (read-only member). */
  permissionOnly: boolean;
}

const SECTION_ACCOMMODATION = 'Accommodation';
const SECTION_SALARY = 'Salaries';
const SALARY_ALIASES = ['Salary'];
const SECTION_PER_DIEM = 'Per Diems';
const PER_DIEM_ALIASES = ['Per Diem'];
const FLIGHT_SECTIONS = ['Flights', 'Travel', 'Transport', 'Transportation'];
const GEAR_SECTIONS = ['Equipment Hire', 'Hire', 'Production', 'Equipment'];

const LINE_COLUMNS =
  'id, source_entity_type, source_entity_id, label, category, proposed_cost, actual_cost, actual_cost_override, currency, section_id, quantity, created_at, hotel_id, flight_id, gear_id, tour_gear_id';

/** Thrown by a loader so the family is skipped, never treated as empty. */
class SourceReadError extends Error {
  constructor(what: string, public readonly cause: { message?: string; code?: string } | null) {
    super(`${what}: ${cause?.message ?? 'unknown error'}`);
  }
}

function must<T>(what: string, res: { data: T | null; error: { message?: string; code?: string } | null }): T {
  if (res.error) throw new SourceReadError(what, res.error);
  return (res.data ?? ([] as unknown)) as T;
}

const isPermissionError = (code?: string | null): boolean =>
  code === '42501' || code === 'PGRST301' || code === '401' || code === '403';

function nightsBetween(start: unknown, end: unknown): number {
  if (!start || !end) return 0;
  const a = new Date(`${String(start).slice(0, 10)}T12:00:00Z`);
  const b = new Date(`${String(end).slice(0, 10)}T12:00:00Z`);
  const ms = b.getTime() - a.getTime();
  if (!Number.isFinite(ms) || ms <= 0) return 0;
  return Math.round(ms / 86_400_000);
}

/* ---- Sources → desired lines ------------------------------------ */

/**
 * The currency a source amount is really in.
 *
 * Rooms, flights and gear all carry a currency column that DEFAULTS to 'GBP'
 * and several write paths stamp 'GBP' unconditionally (the budget flight
 * route did, on every tour). So 'GBP' on a non-GBP tour is not evidence that
 * someone priced it in pounds — it is usually the default. Rule:
 *   - any non-GBP code is deliberate → honoured (converted at the tour rate);
 *   - 'GBP' on a GBP tour → the tour currency (nothing to convert);
 *   - 'GBP' on a non-GBP tour → ambiguous → treated as the tour currency,
 *     which is exactly how the budget has always counted it. No money moves
 *     for data entered before this rule existed.
 * Returns null for "tour currency".
 */
export function sourceCurrency(raw: string | null | undefined, tourCurrency: string): string | null {
  const c = (raw ?? '').trim().toUpperCase();
  if (!c || c === tourCurrency.toUpperCase() || c === 'GBP') return null;
  return c;
}


export interface HotelTotal {
  hotelId: string;
  total: number;
  currency: string | null;
  rooms: number;
}

/** Per-hotel cost: Σ(room.cost_amount × nights) with each room's assignments
 *  collapsed to one range, so a shared room is counted once, not per occupant.
 *  THE hotel formula — the rooming API reads this too. */
export async function computeHotelTotals(
  supabase: SupabaseClient,
  tourId: string,
  workspaceId: string,
  money: TourMoneyContext,
): Promise<{ hotels: Array<{ id: string; name: string; city: string; check_in_at: string | null }>; totals: Map<string, HotelTotal> }> {
  const hotels = must<Array<{ id: string; name: string | null; city: string | null; check_in_at: string | null }>>(
    'hotels',
    await supabase.from('hotels').select('id, name, city, check_in_at').eq('tour_id', tourId).eq('workspace_id', workspaceId),
  );
  const totals = new Map<string, HotelTotal>();
  const out = hotels.map((h) => ({ id: h.id, name: String(h.name ?? 'Hotel'), city: String(h.city ?? '').trim(), check_in_at: h.check_in_at }));
  if (hotels.length === 0) return { hotels: out, totals };

  const hotelIds = hotels.map((h) => h.id);
  const rooms = must<Array<{ id: string; hotel_id: string; cost_amount: number | null; cost_currency: string | null; room_type: string | null }>>(
    'rooms',
    await supabase.from('rooms').select('id, hotel_id, cost_amount, cost_currency, room_type').eq('workspace_id', workspaceId).in('hotel_id', hotelIds),
  );
  const roomIds = rooms.map((r) => r.id);
  const assignments = roomIds.length
    ? must<Array<{ room_id: string; starts_on: string | null; ends_on: string | null }>>(
        'room assignments',
        await supabase.from('room_assignments').select('room_id, starts_on, ends_on').eq('workspace_id', workspaceId).in('room_id', roomIds),
      )
    : [];

  const rangeByRoom = new Map<string, { start: string; end: string }>();
  for (const a of assignments) {
    if (!a.starts_on || !a.ends_on) continue;
    const prev = rangeByRoom.get(a.room_id);
    rangeByRoom.set(a.room_id, prev
      ? { start: a.starts_on < prev.start ? a.starts_on : prev.start, end: a.ends_on > prev.end ? a.ends_on : prev.end }
      : { start: a.starts_on, end: a.ends_on });
  }

  // Each hotel's line currency = the currency most of its costed rooms use.
  const ccyVotes = new Map<string, Map<string, number>>();
  for (const r of rooms) {
    if (!Number(r.cost_amount)) continue;
    const c = sourceCurrency(r.cost_currency, money.tourCurrency) ?? money.tourCurrency;
    const votes = ccyVotes.get(r.hotel_id) ?? new Map<string, number>();
    votes.set(c, (votes.get(c) ?? 0) + 1);
    ccyVotes.set(r.hotel_id, votes);
  }
  const hotelCcy = (hid: string): string => {
    const votes = ccyVotes.get(hid);
    if (!votes) return money.tourCurrency;
    return [...votes.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0][0];
  };

  for (const h of hotels) totals.set(h.id, { hotelId: h.id, total: 0, currency: hotelCcy(h.id), rooms: 0 });
  for (const r of rooms) {
    const t = totals.get(r.hotel_id);
    if (!t) continue;
    const type = String(r.room_type ?? '').trim();
    if (type && type !== '-') t.rooms += 1;
    const range = rangeByRoom.get(r.id);
    if (!range) continue;
    const cost = Number(r.cost_amount ?? 0) * nightsBetween(range.start, range.end);
    const roomCcy = sourceCurrency(r.cost_currency, money.tourCurrency) ?? money.tourCurrency;
    t.total += money.convert(cost, roomCcy, t.currency);
  }
  return { hotels: out, totals };
}

async function desiredHotels(supabase: SupabaseClient, tourId: string, workspaceId: string, money: TourMoneyContext): Promise<DesiredLine[]> {
  const { hotels, totals } = await computeHotelTotals(supabase, tourId, workspaceId, money);
  return hotels.map((h) => {
    const t = totals.get(h.id);
    const checkIn = String(h.check_in_at ?? '').slice(0, 10);
    const base = h.name.startsWith(PLACEHOLDER_HOTEL_PREFIX)
      ? h.name
      : `${h.city ? `${h.name} — ${h.city}` : h.name}${checkIn ? ` · ${checkIn}` : ''}`;
    const n = t?.rooms ?? 0;
    return {
      sourceId: h.id,
      label: n > 0 ? `${base} · ${n} room${n === 1 ? '' : 's'}` : base,
      total: t?.total ?? 0,
      currency: t?.currency === money.tourCurrency ? null : t?.currency ?? null,
      category: 'hotels',
      legacySection: 'hotels',
      sectionId: null, // filled by the caller (ensureSection)
      links: { hotel_id: h.id },
    };
  });
}

async function desiredPayroll(
  supabase: SupabaseClient,
  tourId: string,
  workspaceId: string,
): Promise<{ salary: DesiredLine[]; perDiem: DesiredLine[] }> {
  // Every roster member (rate card linked to a live tour_personnel row).
  const persons = must<Array<{ id: string; person_name: string | null; role: string | null }>>(
    'personnel rates',
    await supabase
      .from('personnel_rates')
      .select('id, person_name, role, order_index')
      .eq('tour_id', tourId)
      .eq('workspace_id', workspaceId)
      .not('tour_personnel_id', 'is', null),
  );
  if (persons.length === 0) return { salary: [], perDiem: [] };

  const [rateCtx, entriesRes, routingRes] = await Promise.all([
    loadTourRateContext(supabase, tourId, workspaceId, { strict: true }),
    supabase.from('payroll_entries').select('personnel_id, day_statuses').eq('tour_id', tourId).eq('workspace_id', workspaceId),
    supabase.from('routing').select('date, day_type').eq('tour_id', tourId),
  ]);
  const entries = must<Array<{ personnel_id: string; day_statuses: Record<string, string> | null }>>('payroll entries', entriesRes);
  const routing = must<Array<{ date: string; day_type?: string | null }>>('routing', routingRes);

  const paintedBy = new Map<string, Record<string, string>>();
  for (const e of entries) {
    const merged = paintedBy.get(e.personnel_id) ?? {};
    Object.assign(merged, e.day_statuses ?? {});
    paintedBy.set(e.personnel_id, merged);
  }

  const salary: DesiredLine[] = [];
  const perDiem: DesiredLine[] = [];
  for (const p of persons) {
    const label = p.role ? `${String(p.person_name)} — ${String(p.role)}` : String(p.person_name);
    const counts = countDayStatuses(effectiveStatuses(routing, paintedBy.get(p.id)));
    const { totalFee, totalPerDiem } = computeTotals(rateLinesFor(rateCtx, p.id), counts);
    salary.push({ sourceId: p.id, label, total: totalFee, currency: null, category: 'crew', legacySection: 'payroll', sectionId: null });
    perDiem.push({ sourceId: p.id, label, total: totalPerDiem, currency: null, category: 'per_diems', legacySection: 'per_diems', sectionId: null });
  }
  return { salary, perDiem };
}

async function desiredFlights(supabase: SupabaseClient, tourId: string, workspaceId: string, money: TourMoneyContext): Promise<DesiredLine[]> {
  const flights = must<Array<{
    id: string; person_name: string | null; origin_airport: string | null; destination_airport: string | null;
    cost_amount: number | null; cost_currency: string | null;
  }>>(
    'flights',
    await supabase
      .from('flights')
      .select('id, person_name, origin_airport, destination_airport, cost_amount, cost_currency')
      .eq('tour_id', tourId)
      .eq('workspace_id', workspaceId),
  );
  return flights.map((f) => {
    const ccy = sourceCurrency(f.cost_currency, money.tourCurrency);
    return {
      sourceId: f.id,
      label: `${f.person_name ?? 'Flight'}: ${(f.origin_airport ?? 'TBD').toUpperCase()}→${(f.destination_airport ?? 'TBD').toUpperCase()}`,
      total: Number(f.cost_amount) || 0,
      currency: ccy,
      category: 'flights',
      legacySection: 'travel',
      sectionId: null,
      links: { flight_id: f.id },
    };
  });
}

async function desiredGear(supabase: SupabaseClient, tourId: string, workspaceId: string, money: TourMoneyContext): Promise<DesiredLine[]> {
  const rows = must<Array<{
    id: string; quantity: number | null; tour_ownership: string | null; tour_hire_cost_amount: number | null;
    tour_hire_cost_currency: string | null;
    gear: { id?: string; name?: string; ownership?: string; hire_cost_amount?: number | null; hire_cost_currency?: string | null }
      | Array<{ id?: string; name?: string; ownership?: string; hire_cost_amount?: number | null; hire_cost_currency?: string | null }>
      | null;
  }>>(
    'tour gear',
    await supabase
      .from('tour_gear')
      .select('id, quantity, tour_ownership, tour_hire_cost_amount, tour_hire_cost_currency, gear:gear_id(id, name, ownership, hire_cost_amount, hire_cost_currency)')
      .eq('workspace_id', workspaceId)
      .eq('tour_id', tourId),
  );
  const byGear = new Map<string, DesiredLine>();
  for (const row of rows) {
    const g = Array.isArray(row.gear) ? row.gear[0] : row.gear;
    if (!g?.id) continue;
    const ownership = row.tour_ownership ?? g.ownership ?? 'owned';
    if (ownership !== 'hired_to_client') continue;
    const qty = Math.max(1, Number(row.quantity ?? 1));
    const unit = Number(row.tour_hire_cost_amount ?? g.hire_cost_amount ?? 0);
    const ccy = sourceCurrency(
      (row.tour_hire_cost_amount != null ? row.tour_hire_cost_currency : null) ?? g.hire_cost_currency,
      money.tourCurrency,
    );
    byGear.set(g.id, {
      sourceId: g.id,
      label: String(g.name ?? 'Gear hire'),
      total: unit * qty,
      currency: ccy,
      category: 'prod_equipment',
      legacySection: 'hire',
      sectionId: null,
      quantity: qty,
      links: { gear_id: g.id, tour_gear_id: row.id },
    });
  }
  return [...byGear.values()];
}

/* ---- Sections ---------------------------------------------------- */

async function findOrCreateSection(
  supabase: SupabaseClient,
  tourId: string,
  workspaceId: string,
  name: string,
  aliases: string[],
  create: boolean,
): Promise<string | null> {
  const existing = must<Array<{ id: string; name: string; sort_order: number | null; created_at: string | null }>>(
    'budget sections',
    await supabase.from('budget_sections').select('id, name, sort_order, created_at').eq('tour_id', tourId).eq('workspace_id', workspaceId),
  );
  const wanted = [name, ...aliases].map((n) => n.toLowerCase());
  // Prefer the earliest-created match so two passes that both created the
  // section converge on the same one.
  const matches = existing
    .filter((s) => wanted.includes(String(s.name).toLowerCase()))
    .sort((a, b) => wanted.indexOf(String(a.name).toLowerCase()) - wanted.indexOf(String(b.name).toLowerCase())
      || String(a.created_at ?? '').localeCompare(String(b.created_at ?? '')));
  if (matches.length) return matches[0].id;
  if (!create) return null;
  const maxSort = existing.reduce((m, s) => Math.max(m, Number(s.sort_order ?? 0)), -1);
  const { data, error } = await supabase
    .from('budget_sections')
    .insert({ tour_id: tourId, workspace_id: workspaceId, name, sort_order: maxSort + 1 })
    .select('id')
    .maybeSingle();
  if (error) throw new SourceReadError(`create section ${name}`, error);
  return (data?.id as string | undefined) ?? null;
}

/* ---- Cache state ------------------------------------------------- */

async function loadExisting(
  supabase: SupabaseClient,
  tourId: string,
  workspaceId: string,
  families: DerivedFamily[],
): Promise<Map<DerivedFamily, ExistingLine[]>> {
  const rows = must<Array<ExistingLine & { source_entity_type: string }>>(
    'derived lines',
    await supabase
      .from('budget_line_items')
      .select(LINE_COLUMNS)
      .eq('tour_id', tourId)
      .eq('workspace_id', workspaceId)
      .in('source_entity_type', families),
  );
  const out = new Map<DerivedFamily, ExistingLine[]>();
  for (const f of families) out.set(f, []);
  for (const r of rows) out.get(r.source_entity_type as DerivedFamily)?.push(r);
  return out;
}

/** Lines that carry notes, attachments or a linked receipt document. */
async function loadAttached(supabase: SupabaseClient, lineIds: string[]): Promise<Set<string>> {
  const out = new Set<string>();
  if (lineIds.length === 0) return out;
  const sources: Array<[string, string]> = [
    ['budget_line_item_notes', 'line_item_id'],
    ['budget_line_item_attachments', 'line_item_id'],
    ['expense_receipts', 'linked_line_item_id'],
  ];
  for (const [table, col] of sources) {
    for (let i = 0; i < lineIds.length; i += 200) {
      const res = await supabase.from(table).select(col).in(col, lineIds.slice(i, i + 200));
      if (res.error) {
        // A table this database doesn't have holds nothing; anything else is a
        // real failure and must stop the family (we can't prove a delete safe).
        if (res.error.code === '42P01' || res.error.code === 'PGRST205') break;
        throw new SourceReadError(table, res.error);
      }
      for (const r of (res.data ?? []) as unknown as Array<Record<string, string | null>>) {
        const id = r[col];
        if (id) out.add(id);
      }
    }
  }
  return out;
}

async function loadSnapshots(
  supabase: SupabaseClient,
  versionId: string | null,
  lineIds: string[],
): Promise<Map<string, DraftSnapshot>> {
  const out = new Map<string, DraftSnapshot>();
  if (!versionId || lineIds.length === 0) return out;
  for (let i = 0; i < lineIds.length; i += 200) {
    const rows = must<Array<DraftSnapshot & { line_item_id: string }>>(
      'version lines',
      await supabase
        .from('budget_version_lines')
        .select('line_item_id, proposed_cost, label, section_id, currency')
        .eq('version_id', versionId)
        .in('line_item_id', lineIds.slice(i, i + 200)),
    );
    for (const r of rows) out.set(r.line_item_id, r);
  }
  return out;
}

/* ---- Executor ---------------------------------------------------- */

interface ExecState {
  writes: number;
  errors: Array<{ message: string; code?: string }>;
}

async function writeMirror(
  supabase: SupabaseClient,
  versionId: string,
  workspaceId: string,
  lineId: string,
  m: MirrorRow,
  st: ExecState,
): Promise<void> {
  const { error } = await supabase.from('budget_version_lines').upsert(
    {
      version_id: versionId,
      line_item_id: lineId,
      workspace_id: workspaceId,
      section_id: m.section_id,
      label: m.label,
      category: m.category,
      proposed_cost: m.proposed_cost,
      currency: m.currency,
    },
    { onConflict: 'version_id,line_item_id' },
  );
  if (error) st.errors.push({ message: `mirror ${lineId}: ${error.message}`, code: error.code });
  else st.writes++;
}

/** Child tables whose rows must follow a merged duplicate to its survivor. */
const CHILD_TABLES: Array<{ table: string; column: string }> = [
  { table: 'budget_line_item_transactions', column: 'line_item_id' },
  { table: 'budget_line_item_notes', column: 'line_item_id' },
  { table: 'budget_line_item_attachments', column: 'line_item_id' },
  { table: 'expense_receipts', column: 'linked_line_item_id' },
];

async function execOps(
  supabase: SupabaseClient,
  tourId: string,
  workspaceId: string,
  family: DerivedFamily,
  ops: PlanOp[],
  ctx: PlanContext,
  st: ExecState,
): Promise<void> {
  const now = () => new Date().toISOString();
  for (const op of ops) {
    if (op.kind === 'merge') {
      for (const loserId of op.loserIds) {
        let movedAll = true;
        for (const { table, column } of CHILD_TABLES) {
          const { error } = await supabase.from(table).update({ [column]: op.survivorId }).eq(column, loserId);
          // A table that doesn't exist on this database holds nothing to move.
          if (error && error.code !== '42P01' && error.code !== 'PGRST205') {
            movedAll = false;
            st.errors.push({ message: `merge ${loserId} → ${op.survivorId} (${table}): ${error.message}`, code: error.code });
          }
        }
        // Only delete once everything attached has moved — delete cascades.
        const del = movedAll
          ? await supabase.from('budget_line_items').delete().eq('id', loserId).eq('workspace_id', workspaceId)
          : { error: { message: 'children not moved' } as { message: string; code?: string } };
        if (!del.error) {
          st.writes++;
          continue;
        }
        // Couldn't delete (an approved snapshot references it, or children
        // didn't move): neutralise so it can never be counted twice again.
        const neutral: Record<string, unknown> = {
          source_entity_type: null,
          source_entity_id: null,
          hotel_id: null,
          flight_id: null,
          gear_id: null,
          tour_gear_id: null,
          updated_at: now(),
        };
        if (movedAll) neutral.actual_cost = 0;
        if (!ctx.locked) neutral.proposed_cost = 0;
        const { error } = await supabase.from('budget_line_items').update(neutral).eq('id', loserId).eq('workspace_id', workspaceId);
        if (error) st.errors.push({ message: `neutralise duplicate ${loserId}: ${error.message}`, code: error.code });
        else st.writes++;
      }
    } else if (op.kind === 'delete') {
      const { error } = await supabase.from('budget_line_items').delete().eq('id', op.id).eq('workspace_id', workspaceId);
      if (!error) {
        st.writes++;
        continue;
      }
      // Refused (an approved/superseded snapshot references it): detach.
      const { error: e2 } = await supabase
        .from('budget_line_items')
        .update({ ...op.fallback.patch, updated_at: now() })
        .eq('id', op.id)
        .eq('workspace_id', workspaceId);
      if (e2) {
        st.errors.push({ message: `remove ${op.id}: ${error.message}; detach: ${e2.message}`, code: e2.code });
        continue;
      }
      st.writes++;
      if (op.fallback.mirror && ctx.draftVersionId) {
        await writeMirror(supabase, ctx.draftVersionId, workspaceId, op.id, op.fallback.mirror, st);
      }
    } else if (op.kind === 'update') {
      if (Object.keys(op.patch).length > 0) {
        const { error } = await supabase
          .from('budget_line_items')
          .update({ ...op.patch, updated_at: now() })
          .eq('id', op.id)
          .eq('workspace_id', workspaceId);
        if (error) {
          st.errors.push({ message: `update ${op.id}: ${error.message}`, code: error.code });
          continue;
        }
        st.writes++;
      }
      if (op.mirror && ctx.draftVersionId) await writeMirror(supabase, ctx.draftVersionId, workspaceId, op.id, op.mirror, st);
    } else {
      const { data, error } = await supabase
        .from('budget_line_items')
        .insert({ ...op.row, tour_id: tourId, workspace_id: workspaceId })
        .select('id')
        .maybeSingle();
      if (error) {
        // 23505: a concurrent pass inserted this source's line first (the
        // unique index from migration 269). Its values are the same; done.
        if (error.code !== '23505') st.errors.push({ message: `insert ${family} ${op.sourceId}: ${error.message}`, code: error.code });
        continue;
      }
      st.writes++;
      if (op.mirror && ctx.draftVersionId && data?.id) {
        await writeMirror(supabase, ctx.draftVersionId, workspaceId, data.id as string, op.mirror, st);
      }
    }
  }
}

/* ---- Public entry point ----------------------------------------- */

/**
 * Bring the tour's derived budget lines in line with their sources.
 * Never throws. A family whose source can't be read is SKIPPED (its lines are
 * left exactly as they were) and reported in `errors`.
 */
export async function reconcileDerivedBudgetLines(
  supabase: SupabaseClient,
  tourId: string,
  workspaceId: string,
  opts: { families?: readonly DerivedFamily[] } = {},
): Promise<ReconcileResult> {
  const requested = [...new Set(opts.families ?? DERIVED_FAMILIES)];
  const st: ExecState = { writes: 0, errors: [] };
  const done: DerivedFamily[] = [];
  const finish = (): ReconcileResult => {
    const errors = st.errors.map((e) => e.message);
    if (errors.length) logServerError('reconcileDerivedBudgetLines', errors.join(' | '), { tourId, families: requested });
    return {
      ok: errors.length === 0,
      families: done,
      errors,
      writes: st.writes,
      permissionOnly: st.errors.length > 0 && st.errors.every((e) => isPermissionError(e.code)),
    };
  };

  let money: TourMoneyContext;
  let ctx: PlanContext;
  try {
    money = await loadTourMoneyContext(supabase, tourId, workspaceId);
    const { data: version, error: vErr } = await supabase
      .from('budget_versions')
      .select('id, status')
      .eq('tour_id', tourId)
      .eq('workspace_id', workspaceId)
      .not('status', 'in', '(superseded,rolled_back)')
      .order('version_number', { ascending: false })
      .limit(1)
      .maybeSingle();
    // An unknown lock state must never be treated as "unlocked" — that would
    // let the pass rewrite an approved baseline.
    if (vErr) throw new SourceReadError('budget versions', vErr);
    const status = (version as { status?: string } | null)?.status;
    ctx = {
      locked: status === 'approved',
      draftVersionId: status === 'draft' ? ((version as { id: string }).id) : null,
      convert: money.convert,
    };
  } catch (e) {
    const err = e as SourceReadError;
    st.errors.push({ message: err.message, code: err.cause?.code });
    return finish();
  }

  // Sources, computed per family. A payroll read serves both payroll families.
  let payroll: Promise<{ salary: DesiredLine[]; perDiem: DesiredLine[] }> | null = null;
  const payrollOnce = () => (payroll ??= desiredPayroll(supabase, tourId, workspaceId));

  const sectionFor = async (family: DerivedFamily, needed: boolean): Promise<string | null> => {
    switch (family) {
      case 'hotel_booking':
        return findOrCreateSection(supabase, tourId, workspaceId, SECTION_ACCOMMODATION, [], needed);
      case 'payroll':
        return findOrCreateSection(supabase, tourId, workspaceId, SECTION_SALARY, SALARY_ALIASES, needed);
      case 'payroll_per_diem':
        return findOrCreateSection(supabase, tourId, workspaceId, SECTION_PER_DIEM, PER_DIEM_ALIASES, needed);
      case 'flight':
        return findOrCreateSection(supabase, tourId, workspaceId, FLIGHT_SECTIONS[0], FLIGHT_SECTIONS.slice(1), false);
      case 'gear':
        return findOrCreateSection(supabase, tourId, workspaceId, GEAR_SECTIONS[0], GEAR_SECTIONS.slice(1), false);
    }
  };

  let existingByFamily: Map<DerivedFamily, ExistingLine[]>;
  try {
    existingByFamily = await loadExisting(supabase, tourId, workspaceId, requested);
  } catch (e) {
    const err = e as SourceReadError;
    st.errors.push({ message: err.message, code: err.cause?.code });
    return finish();
  }

  for (const family of requested) {
    try {
      let desired: DesiredLine[];
      switch (family) {
        case 'hotel_booking': desired = await desiredHotels(supabase, tourId, workspaceId, money); break;
        case 'payroll': desired = (await payrollOnce()).salary; break;
        case 'payroll_per_diem': desired = (await payrollOnce()).perDiem; break;
        case 'flight': desired = await desiredFlights(supabase, tourId, workspaceId, money); break;
        case 'gear': desired = await desiredGear(supabase, tourId, workspaceId, money); break;
      }
      const existing = existingByFamily.get(family) ?? [];
      const sectionId = await sectionFor(family, desired.length > 0);
      // Flights and gear only ADOPT a matching section (never create one), and
      // never move a line the user has already filed somewhere.
      const managesSection = family === 'hotel_booking' || family === 'payroll' || family === 'payroll_per_diem';
      const bySource = new Map(existing.map((l) => [l.source_entity_id, l]));
      for (const d of desired) {
        d.sectionId = managesSection ? sectionId : (bySource.get(d.sourceId)?.section_id ?? sectionId);
      }
      const [txns, snapshots, attached] = await Promise.all([
        loadTxnAggregates(supabase, existing, money),
        loadSnapshots(supabase, ctx.draftVersionId, existing.map((l) => l.id)),
        loadAttached(supabase, existing.map((l) => l.id)),
      ]);
      const ops = planFamily({ family, desired, existing, txns, snapshots, attached, ctx });
      const before = st.errors.length;
      await execOps(supabase, tourId, workspaceId, family, ops, ctx, st);
      if (st.errors.length === before) done.push(family);
    } catch (e) {
      const err = e as SourceReadError;
      st.errors.push({ message: `${family}: ${err.message}`, code: err.cause?.code });
    }
  }

  return finish();
}

/* ---- Writer-side hook -------------------------------------------- */

/** The tour a room belongs to (rooms → hotels.tour_id), for writers that only
 *  know a room or an assignment. Null when it can't be resolved. */
export async function tourIdForRoom(supabase: SupabaseClient, roomId: string | null | undefined): Promise<string | null> {
  if (!roomId) return null;
  const { data } = await supabase.from('rooms').select('hotel_id, hotels(tour_id)').eq('id', roomId).maybeSingle();
  const h = (data as { hotels?: { tour_id?: string } | Array<{ tour_id?: string }> | null } | null)?.hotels;
  return (Array.isArray(h) ? h[0]?.tour_id : h?.tour_id) ?? null;
}

/** Which families a write to each source table can change. */
export const FAMILIES_FOR_SOURCE = {
  payroll: ['payroll', 'payroll_per_diem'],
  routing: ['payroll', 'payroll_per_diem'],
  rooming: ['hotel_booking'],
  flights: ['flight'],
  gear: ['gear'],
  all: DERIVED_FAMILIES,
} as const satisfies Record<string, readonly DerivedFamily[]>;

/**
 * Call after a successful write to a source. Never throws and never fails the
 * write it follows — the write is already committed; this only refreshes the
 * budget's cached copy (and the next money read re-runs it regardless).
 */
export async function refreshDerivedLines(
  supabase: SupabaseClient,
  tourId: string | null | undefined,
  workspaceId: string | null | undefined,
  source: keyof typeof FAMILIES_FOR_SOURCE,
): Promise<ReconcileResult | null> {
  if (!tourId || !workspaceId) return null;
  try {
    return await reconcileDerivedBudgetLines(supabase, tourId, workspaceId, { families: FAMILIES_FOR_SOURCE[source] });
  } catch (e) {
    logServerError('refreshDerivedLines', e, { tourId, source });
    return null;
  }
}
