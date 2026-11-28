/* The job builder's calls to the server (server/rental/jobs.ts). Every write
   goes through here — never straight to the database from the browser. Each
   throws an Error with the server's message. */
import type { RentalJob, RentalJobItem } from './types';

async function call<T>(url: string, method: string, body?: unknown): Promise<T> {
  const res = await fetch(url, {
    method,
    headers: body === undefined ? undefined : { 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const j = (await res.json().catch(() => ({}))) as T & { error?: string };
  if (!res.ok) throw new Error(j.error ?? `Request failed (${res.status})`);
  return j;
}

export const rentalApi = {
  createJob: (body: Record<string, unknown>) => call<{ job: RentalJob }>('/api/rental/jobs', 'POST', body).then((r) => r.job),
  updateJob: (id: string, body: Record<string, unknown>) => call<{ job: RentalJob }>(`/api/rental/jobs/${id}`, 'PATCH', body).then((r) => r.job),
  deleteJob: (id: string) => call<{ ok: true }>(`/api/rental/jobs/${id}`, 'DELETE'),
  lines: (id: string) => call<{ items: RentalJobItem[] }>(`/api/rental/jobs/${id}/items`, 'GET').then((r) => r.items),
  addLines: (id: string, items: Array<{ gear_id: string; quantity: number; day_rate_override: number | null }>) =>
    call<{ items: RentalJobItem[] }>(`/api/rental/jobs/${id}/items`, 'POST', { items }).then((r) => r.items),
  updateLine: (id: string, lineId: string, body: { quantity?: number; day_rate_override?: number | null }) =>
    call<{ item: RentalJobItem }>(`/api/rental/jobs/${id}/items/${lineId}`, 'PATCH', body).then((r) => r.item),
  deleteLine: (id: string, lineId: string) => call<{ ok: true }>(`/api/rental/jobs/${id}/items/${lineId}`, 'DELETE'),
};

/** USD → `cur` today, or null when no rate can be had. */
export async function liveUsdRate(cur: string): Promise<{ rate: number; at: string } | null> {
  if (cur === 'USD') return { rate: 1, at: new Date().toISOString() };
  try {
    const res = await fetch(`/api/budget/exchange-rate?from=USD&to=${encodeURIComponent(cur)}`);
    const body = (await res.json()) as { rate?: number; fetched_at?: string };
    return typeof body.rate === 'number' ? { rate: body.rate, at: body.fetched_at ?? new Date().toISOString() } : null;
  } catch {
    return null;
  }
}

/** The PATCH for a status change. The first time a job leaves Draft its
 *  exchange rate is frozen — a client who accepted Tuesday's number must not
 *  find another on Friday. Never re-stamped once frozen. `known` is a rate the
 *  caller already has (the job page's live one); else it's fetched. */
export async function statusPatch(
  job: Pick<RentalJob, 'status' | 'fx_rate' | 'display_currency'>,
  next: RentalJob['status'],
  known?: { rate: number; at: string } | null,
): Promise<Record<string, unknown>> {
  const patch: Record<string, unknown> = { status: next };
  const cur = (job.display_currency || 'USD').toUpperCase();
  if (job.status === 'draft' && next !== 'draft' && job.fx_rate == null && cur !== 'USD') {
    const r = known ?? (await liveUsdRate(cur));
    if (r) {
      patch.fx_rate = r.rate;
      patch.fx_rate_at = r.at;
    }
  }
  return patch;
}
