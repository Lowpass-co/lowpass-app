/* ============================================
   LOWPASS — rental jobs, written by the server (Nov 2026, Adam)

   Adam: "make the rental house feature more professional, and reliable".
   The job builder used to write rental_jobs / rental_job_items straight from
   the browser — a failed save could leave half a job, an error on a status
   change was never shown, and opening a job wrote to it. Every write now
   comes here: checked (the job and the stock are this workspace's, the
   numbers are numbers), and answered with the row as saved.

   Stock is the ONE list, `gear` (306). A line names its item by gear_id;
   inventory_id is the old pointer, kept on old lines, never written.
   ============================================ */

import type { SupabaseClient } from '@supabase/supabase-js';
import { weekLength } from '@/lib/rental-pricing';

export class RentalError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

export const JOB_SELECT = `*, artist:artists ( id, name ), tour:tours ( id, name )`;

export const JOB_STATUSES = ['draft', 'confirmed', 'invoiced', 'completed'] as const;
const TEXT_FIELDS = ['name', 'client_name', 'notes', 'billing_address', 'billing_email', 'billing_phone', 'billing_tax_id'] as const;

const text = (v: unknown): string | null => (typeof v === 'string' && v.trim() ? v.trim() : null);
const date = (v: unknown): string | null => (typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : null);
const money = (v: unknown): number | null => {
  if (v === null || v === '' || v === undefined) return null;
  const n = Number(v);
  return Number.isFinite(n) ? Math.round(n * 100) / 100 : NaN;
};

/** A job body → the columns we write. Only fields that were SENT are
 *  written (a PATCH of the discount never touches the dates). Throws 400 on
 *  anything that isn't what the column holds. */
export function jobWrites(body: Record<string, unknown>, opts: { creating: boolean }): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  const has = (k: string) => Object.prototype.hasOwnProperty.call(body, k);

  for (const k of TEXT_FIELDS) if (has(k)) out[k] = text(body[k]);
  if (opts.creating || has('name')) {
    if (!out.name) throw new RentalError(400, 'A job needs a name.');
  }
  for (const k of ['artist_id', 'tour_id'] as const) if (has(k)) out[k] = text(body[k]);
  for (const k of ['start_date', 'end_date'] as const) {
    if (!has(k)) continue;
    const d = date(body[k]);
    if (body[k] && !d) throw new RentalError(400, `${k === 'start_date' ? 'Start' : 'End'} date isn’t a date.`);
    out[k] = d;
  }
  if (opts.creating && (!out.start_date || !out.end_date)) throw new RentalError(400, 'A job needs start and end dates.');
  if (out.start_date && out.end_date && String(out.end_date) < String(out.start_date)) {
    throw new RentalError(400, 'End date must be on or after the start date.');
  }
  for (const k of ['discount_percent', 'discount_fixed'] as const) {
    if (!has(k)) continue;
    const n = money(body[k]) ?? 0;
    if (Number.isNaN(n) || n < 0) throw new RentalError(400, 'Discount must be a positive number.');
    if (k === 'discount_percent' && n > 100) throw new RentalError(400, 'Discount can’t be over 100%.');
    out[k] = n;
  }
  if (has('status')) {
    if (!JOB_STATUSES.includes(body.status as (typeof JOB_STATUSES)[number])) throw new RentalError(400, 'Unknown status.');
    out.status = body.status;
  }
  if (has('display_currency')) {
    const c = text(body.display_currency)?.toUpperCase() ?? null;
    if (c && !/^[A-Z]{3}$/.test(c)) throw new RentalError(400, 'Currency must be a 3-letter code.');
    out.display_currency = c;
  }
  if (has('fx_rate')) {
    const r = money(body.fx_rate);
    if (r !== null && (Number.isNaN(r) || r <= 0)) throw new RentalError(400, 'Bad exchange rate.');
    out.fx_rate = body.fx_rate == null ? null : Number(body.fx_rate);
    out.fx_rate_at = text(body.fx_rate_at) ?? new Date().toISOString();
  }
  if (has('days_per_week')) {
    out.days_per_week = body.days_per_week == null || body.days_per_week === '' ? null : weekLength(body.days_per_week);
  }
  return out;
}

/** The job, if it's in this workspace (else 404). */
export async function jobInWorkspace(client: SupabaseClient, workspaceId: string, jobId: string) {
  const { data } = await client.from('rental_jobs').select('id, workspace_id, status').eq('id', jobId).maybeSingle();
  if (!data || (data as { workspace_id: string | null }).workspace_id !== workspaceId) throw new RentalError(404, 'Job not found.');
  return data as { id: string; workspace_id: string; status: string };
}

export async function createJob(client: SupabaseClient, args: { workspaceId: string; userId: string; body: Record<string, unknown> }) {
  const writes = jobWrites(args.body, { creating: true });
  const { data, error } = await client
    .from('rental_jobs')
    .insert({ ...writes, user_id: args.userId, workspace_id: args.workspaceId })
    .select(JOB_SELECT)
    .single();
  if (error || !data) throw new RentalError(500, error?.message ?? 'Couldn’t save the job.');
  return data;
}

export async function updateJob(client: SupabaseClient, args: { workspaceId: string; jobId: string; body: Record<string, unknown> }) {
  await jobInWorkspace(client, args.workspaceId, args.jobId);
  const writes = jobWrites(args.body, { creating: false });
  if (Object.keys(writes).length === 0) throw new RentalError(400, 'Nothing to change.');
  const { data, error } = await client.from('rental_jobs').update(writes).eq('id', args.jobId).select(JOB_SELECT).single();
  if (error || !data) throw new RentalError(500, error?.message ?? 'Couldn’t save the job.');
  return data;
}

export async function deleteJob(client: SupabaseClient, args: { workspaceId: string; jobId: string }) {
  await jobInWorkspace(client, args.workspaceId, args.jobId);
  const { error } = await client.from('rental_jobs').delete().eq('id', args.jobId);
  if (error) throw new RentalError(500, error.message);
}

/* ── lines ───────────────────────────────────────────────────────────────── */

export const LINE_COLS = 'id, job_id, gear_id, inventory_id, quantity, day_rate_override, created_at';

export async function listLines(client: SupabaseClient, args: { workspaceId: string; jobId: string }) {
  await jobInWorkspace(client, args.workspaceId, args.jobId);
  const { data, error } = await client.from('rental_job_items').select(LINE_COLS).eq('job_id', args.jobId).order('created_at');
  if (error) throw new RentalError(500, error.message);
  return data ?? [];
}

const qty = (v: unknown, fallback: number): number => {
  const n = Math.round(Number(v));
  return Number.isFinite(n) && n >= 1 ? n : fallback;
};

/** Add items to a job. An item already on the job adds to its quantity
 *  instead of making a second line. Every item must be this workspace's. */
export async function addLines(
  client: SupabaseClient,
  args: { workspaceId: string; jobId: string; items: Array<{ gear_id?: unknown; quantity?: unknown; day_rate_override?: unknown }> },
) {
  await jobInWorkspace(client, args.workspaceId, args.jobId);
  const wanted = args.items
    .map((i) => ({ gearId: typeof i.gear_id === 'string' ? i.gear_id : '', quantity: qty(i.quantity, 1), rate: money(i.day_rate_override) }))
    .filter((i) => i.gearId);
  if (wanted.length === 0) throw new RentalError(400, 'Pick at least one item.');
  if (wanted.some((i) => Number.isNaN(i.rate) || (i.rate !== null && i.rate < 0))) throw new RentalError(400, 'Day rate must be a positive number.');

  const ids = [...new Set(wanted.map((i) => i.gearId))];
  const { data: stock } = await client.from('gear').select('id').eq('workspace_id', args.workspaceId).in('id', ids);
  const known = new Set(((stock ?? []) as { id: string }[]).map((g) => g.id));
  const missing = ids.filter((id) => !known.has(id));
  if (missing.length > 0) throw new RentalError(400, 'One of those items isn’t in your stock.');

  const { data: onJob } = await client.from('rental_job_items').select('id, gear_id, quantity').eq('job_id', args.jobId);
  const byGear = new Map(((onJob ?? []) as { id: string; gear_id: string | null; quantity: number }[]).filter((l) => l.gear_id).map((l) => [l.gear_id as string, l]));

  const fresh: Record<string, unknown>[] = [];
  for (const w of wanted) {
    const existing = byGear.get(w.gearId);
    if (existing) {
      const next = (existing.quantity || 1) + w.quantity;
      const { error } = await client.from('rental_job_items').update({ quantity: next }).eq('id', existing.id);
      if (error) throw new RentalError(500, error.message);
      existing.quantity = next;
    } else {
      fresh.push({ job_id: args.jobId, workspace_id: args.workspaceId, gear_id: w.gearId, quantity: w.quantity, day_rate_override: w.rate });
    }
  }
  if (fresh.length > 0) {
    const { error } = await client.from('rental_job_items').insert(fresh);
    if (error) throw new RentalError(500, error.message);
  }
  return listLines(client, args);
}

export async function updateLine(
  client: SupabaseClient,
  args: { workspaceId: string; jobId: string; lineId: string; body: Record<string, unknown> },
) {
  await jobInWorkspace(client, args.workspaceId, args.jobId);
  const writes: Record<string, unknown> = {};
  if ('quantity' in args.body) {
    const q = qty(args.body.quantity, 0);
    if (q < 1) throw new RentalError(400, 'Quantity must be 1 or more.');
    writes.quantity = q;
  }
  if ('day_rate_override' in args.body) {
    const r = money(args.body.day_rate_override);
    if (Number.isNaN(r) || (r !== null && r < 0)) throw new RentalError(400, 'Day rate must be a positive number.');
    writes.day_rate_override = r;
  }
  if (Object.keys(writes).length === 0) throw new RentalError(400, 'Nothing to change.');
  const { data, error } = await client
    .from('rental_job_items')
    .update(writes)
    .eq('id', args.lineId)
    .eq('job_id', args.jobId)
    .select(LINE_COLS)
    .maybeSingle();
  if (error) throw new RentalError(500, error.message);
  if (!data) throw new RentalError(404, 'Line not found.');
  return data;
}

export async function deleteLine(client: SupabaseClient, args: { workspaceId: string; jobId: string; lineId: string }) {
  await jobInWorkspace(client, args.workspaceId, args.jobId);
  const { data, error } = await client.from('rental_job_items').delete().eq('id', args.lineId).eq('job_id', args.jobId).select('id');
  if (error) throw new RentalError(500, error.message);
  if (!data || (data as unknown[]).length === 0) throw new RentalError(404, 'Line not found.');
}
