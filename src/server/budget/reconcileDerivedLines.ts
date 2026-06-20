/* ============================================
   LOWPASS — Budget ← Operations derived-line reconcile

   Populates the budget's Accommodation / Salary / Per Diem sections
   from the source Operations modules, mirroring the existing gear-hire
   reconcile in GET /api/budget/line-items. Derived lines are read-only
   in the budget and edited at source.

   Sources (READ-only — we never write the Operations tables):
     - Accommodation ← hotels / rooms / room_assignments
         one derived line per hotel; est/actual = Σ(room.cost_amount ×
         nights) over that hotel's room assignments.
         source_entity_type='hotel_booking', hotel_id = hotels.id.
         (Enhances the cost=0 placeholder line that budget/hotels
         already creates — same source_entity_type + hotel_id, so this
         find-or-creates and fills in the real total without colliding.)
     - Salary  ← payroll_entries.total_fee summed per personnel_rates
         person. source_entity_type='payroll'.
     - Per Diem ← payroll_entries.total_per_diem per person.
         source_entity_type='payroll_per_diem'.

   Idempotent: create / update / delete only rows carrying the matching
   source_entity_type; manual lines are never touched. Target sections
   are auto-created when there's derived data to place. The whole pass
   is wrapped so a source hiccup can never break the budget page render.
   ============================================ */

import type { SupabaseClient } from '@supabase/supabase-js';
import { countDayStatuses, computeTotalFee, computeTotalPerDiem } from '@/lib/payroll/fees';

const SECTION_ACCOMMODATION = 'Accommodation';
const SECTION_SALARY = 'Salary';
const SECTION_PER_DIEM = 'Per Diem';

/** Distinguishes the two payroll-derived line families (same person id,
 *  different budget line) and the hotel family. */
export const DERIVED_SOURCE_TYPES = [
  'hotel_booking',
  'payroll',
  'payroll_per_diem',
] as const;

type Desired = {
  /** budget_line_items.source_entity_id (hotels.id or personnel_rates.id) */
  sourceId: string;
  label: string;
  /** proposed_cost === actual_cost === total (recomputed each pass) */
  total: number;
  /** hotels only — sets the hotel_id FK (→ hotels.id). */
  hotelId?: string;
};

function nightsBetween(start: unknown, end: unknown): number {
  if (!start || !end) return 0;
  const a = new Date(String(start));
  const b = new Date(String(end));
  const ms = b.getTime() - a.getTime();
  if (!Number.isFinite(ms) || ms <= 0) return 0;
  return Math.round(ms / 86_400_000);
}

/* ---- Source → desired-line computations ------------------------- */

async function computeHotelDesired(
  supabase: SupabaseClient,
  tourId: string,
  workspaceId: string,
): Promise<Desired[]> {
  const { data: hotels } = await supabase
    .from('hotels')
    .select('id, name')
    .eq('tour_id', tourId)
    .eq('workspace_id', workspaceId);
  if (!hotels?.length) return [];

  const hotelIds = hotels.map((h) => h.id as string);
  const { data: rooms } = await supabase
    .from('rooms')
    .select('id, hotel_id, cost_amount, room_type')
    .eq('workspace_id', workspaceId)
    .in('hotel_id', hotelIds);

  const roomById = new Map(
    (rooms ?? []).map((r) => [r.id as string, r as { hotel_id: string; cost_amount: number | null; room_type: string | null }]),
  );
  const roomIds = (rooms ?? []).map((r) => r.id as string);

  // Distinct room types per hotel, for an informative line label
  // (OPS-04 — "Hotel — SGL, DBL" rather than a bare, unnamed-looking row).
  const typesByHotel = new Map<string, Set<string>>();
  for (const r of rooms ?? []) {
    const type = String((r as { room_type?: string | null }).room_type ?? '').trim();
    if (!type || type === '-') continue;
    const hid = (r as { hotel_id: string }).hotel_id;
    if (!typesByHotel.has(hid)) typesByHotel.set(hid, new Set());
    typesByHotel.get(hid)!.add(type);
  }

  const totalByHotel = new Map<string, number>();
  if (roomIds.length) {
    const { data: assignments } = await supabase
      .from('room_assignments')
      .select('room_id, starts_on, ends_on')
      .eq('workspace_id', workspaceId)
      .in('room_id', roomIds);

    // Collapse each room's assignments into a single date range
    // (earliest start → latest end) so a room shared by multiple people
    // is counted ONCE, not once per occupant.
    const rangeByRoom = new Map<string, { start: string; end: string }>();
    for (const a of assignments ?? []) {
      const roomId = a.room_id as string;
      const start = a.starts_on as string | null;
      const end = a.ends_on as string | null;
      if (!start || !end) continue;
      const prev = rangeByRoom.get(roomId);
      if (!prev) {
        rangeByRoom.set(roomId, { start, end });
      } else {
        rangeByRoom.set(roomId, {
          start: start < prev.start ? start : prev.start,
          end: end > prev.end ? end : prev.end,
        });
      }
    }

    // Sum cost_amount × nights once per distinct room.
    for (const [roomId, range] of rangeByRoom.entries()) {
      const room = roomById.get(roomId);
      if (!room) continue;
      const cost = Number(room.cost_amount ?? 0) * nightsBetween(range.start, range.end);
      totalByHotel.set(
        room.hotel_id,
        (totalByHotel.get(room.hotel_id) ?? 0) + cost,
      );
    }
  }

  return hotels.map((h) => {
    const hid = h.id as string;
    const name = String(h.name ?? 'Hotel');
    const types = Array.from(typesByHotel.get(hid) ?? []).sort();
    return {
      sourceId: hid,
      label: types.length ? `${name} — ${types.join(', ')}` : name,
      total: totalByHotel.get(hid) ?? 0,
      hotelId: hid,
    };
  });
}

async function computePayrollDesired(
  supabase: SupabaseClient,
  tourId: string,
  workspaceId: string,
): Promise<{ salary: Desired[]; perDiem: Desired[] }> {
  // Personnel unification — derived Salary/Per-diem lines come from every
  // roster member (rate cards linked to a live tour_personnel row). Orphan /
  // un-rostered cards don't generate budget lines.
  const { data: persons } = await supabase
    .from('personnel_rates')
    .select('id, person_name, role, order_index, show_rate, off_rate, rehearsal_rate, per_diem, advance_fee')
    .eq('tour_id', tourId)
    .eq('workspace_id', workspaceId)
    .not('tour_personnel_id', 'is', null);
  if (!persons?.length) return { salary: [], perDiem: [] };

  // OPS-17b — compute fees from day_statuses + the rate card via the SAME
  // shared helper the payroll sheets use, instead of trusting the persisted
  // total_fee column (which can lag behind the rates after the OPS-17a math
  // fix). This guarantees the budget Salary/Per-Diem == the payroll display.
  // Day counts come from the per-week entries; the advance comes from the rate
  // card (below) — NOT entries.advance_fee — so we no longer select it.
  const { data: entries } = await supabase
    .from('payroll_entries')
    .select('personnel_id, day_statuses')
    .eq('tour_id', tourId)
    .eq('workspace_id', workspaceId);

  const countsBy = new Map<string, { show: number; offTravel: number; rehearsal: number; active: number }>();
  for (const e of entries ?? []) {
    const id = e.personnel_id as string;
    const c = countDayStatuses((e.day_statuses as Record<string, string>) ?? {});
    const acc = countsBy.get(id) ?? { show: 0, offTravel: 0, rehearsal: 0, active: 0 };
    acc.show += c.show;
    acc.offTravel += c.offTravel;
    acc.rehearsal += c.rehearsal;
    acc.active += c.active;
    countsBy.set(id, acc);
  }

  const salary: Desired[] = [];
  const perDiem: Desired[] = [];
  for (const p of persons) {
    const id = p.id as string;
    const label = p.role
      ? `${String(p.person_name)} — ${String(p.role)}`
      : String(p.person_name);
    const counts = countsBy.get(id) ?? { show: 0, offTravel: 0, rehearsal: 0, active: 0 };
    // PAY-04: rate-card advance is the single source (matches the payroll
    // displays + budget/summary routes; survives a day-status edit, which
    // zeroes the per-week entries.advance_fee).
    const fee = computeTotalFee(p, counts, Number(p.advance_fee) || 0);
    const pd = computeTotalPerDiem(p, counts);
    // One Salary line per roster member (named + costed; 0 until days set).
    salary.push({ sourceId: id, label, total: fee });
    // Per-diem line only when there's a non-zero total.
    if (pd > 0) perDiem.push({ sourceId: id, label, total: pd });
  }
  return { salary, perDiem };
}

/* ---- Section auto-create (find-or-create by name) --------------- */

async function ensureSection(
  supabase: SupabaseClient,
  tourId: string,
  workspaceId: string,
  name: string,
): Promise<string | null> {
  const { data: existing } = await supabase
    .from('budget_sections')
    .select('id, name, sort_order')
    .eq('tour_id', tourId)
    .eq('workspace_id', workspaceId);
  const found = (existing ?? []).find(
    (s) => String(s.name).toLowerCase() === name.toLowerCase(),
  );
  if (found) return found.id as string;
  const maxSort = (existing ?? []).reduce(
    (m, s) => Math.max(m, Number(s.sort_order ?? 0)),
    -1,
  );
  const { data: created } = await supabase
    .from('budget_sections')
    .insert({ tour_id: tourId, workspace_id: workspaceId, name, sort_order: maxSort + 1 })
    .select('id')
    .maybeSingle();
  return (created?.id as string | undefined) ?? null;
}

/* ---- Generic reconcile for one source_entity_type --------------- */

async function reconcileType(
  supabase: SupabaseClient,
  opts: {
    tourId: string;
    workspaceId: string;
    sourceType: string;
    sectionId: string | null;
    category: string;
    legacySection: string;
    desired: Desired[];
    setHotelId?: boolean;
  },
): Promise<void> {
  const { tourId, workspaceId, sourceType, sectionId, category, legacySection, desired, setHotelId } =
    opts;

  const { data: existing } = await supabase
    .from('budget_line_items')
    .select('id, source_entity_id')
    .eq('workspace_id', workspaceId)
    .eq('tour_id', tourId)
    .eq('source_entity_type', sourceType);

  const desiredIds = new Set(desired.map((d) => d.sourceId));
  const idBySource = new Map<string, string>();
  for (const r of existing ?? []) {
    const sid = r.source_entity_id as string | null;
    if (sid) idBySource.set(sid, r.id as string);
    // Delete derived rows whose source entity no longer exists.
    if (!sid || !desiredIds.has(sid)) {
      await supabase
        .from('budget_line_items')
        .delete()
        .eq('id', r.id as string)
        .eq('workspace_id', workspaceId);
    }
  }

  for (const d of desired) {
    const existingId = idBySource.get(d.sourceId);
    if (existingId) {
      const payload: Record<string, unknown> = {
        label: d.label,
        proposed_cost: d.total,
        actual_cost: d.total,
        section_id: sectionId,
        updated_at: new Date().toISOString(),
      };
      if (setHotelId && d.hotelId) payload.hotel_id = d.hotelId;
      await supabase
        .from('budget_line_items')
        .update(payload)
        .eq('id', existingId)
        .eq('workspace_id', workspaceId);
    } else {
      await supabase.from('budget_line_items').insert({
        tour_id: tourId,
        workspace_id: workspaceId,
        category,
        label: d.label,
        quantity: 1,
        proposed_cost: d.total,
        actual_cost: d.total,
        source_entity_type: sourceType,
        source_entity_id: d.sourceId,
        section_id: sectionId,
        section: legacySection,
        order_index: 0,
        sort_order: 0,
        ...(setHotelId && d.hotelId ? { hotel_id: d.hotelId } : {}),
      });
    }
  }
}

/* ---- Public entry point ----------------------------------------- */

export async function reconcileDerivedBudgetLines(
  supabase: SupabaseClient,
  tourId: string,
  workspaceId: string,
): Promise<void> {
  try {
    const [hotelDesired, payroll] = await Promise.all([
      computeHotelDesired(supabase, tourId, workspaceId),
      computePayrollDesired(supabase, tourId, workspaceId),
    ]);

    if (hotelDesired.length > 0) {
      const sectionId = await ensureSection(
        supabase,
        tourId,
        workspaceId,
        SECTION_ACCOMMODATION,
      );
      await reconcileType(supabase, {
        tourId,
        workspaceId,
        sourceType: 'hotel_booking',
        sectionId,
        category: 'hotels',
        legacySection: 'hotels',
        desired: hotelDesired,
        setHotelId: true,
      });
    }

    if (payroll.salary.length > 0) {
      const sectionId = await ensureSection(supabase, tourId, workspaceId, SECTION_SALARY);
      await reconcileType(supabase, {
        tourId,
        workspaceId,
        sourceType: 'payroll',
        sectionId,
        category: 'crew',
        legacySection: 'payroll',
        desired: payroll.salary,
      });
    }

    if (payroll.perDiem.length > 0) {
      const sectionId = await ensureSection(supabase, tourId, workspaceId, SECTION_PER_DIEM);
      await reconcileType(supabase, {
        tourId,
        workspaceId,
        sourceType: 'payroll_per_diem',
        sectionId,
        category: 'per_diems',
        legacySection: 'per_diems',
        desired: payroll.perDiem,
      });
    }
  } catch {
    // Never let a source hiccup break the budget page render — the grid
    // still shows whatever derived lines were last persisted.
  }
}
