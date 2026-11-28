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
