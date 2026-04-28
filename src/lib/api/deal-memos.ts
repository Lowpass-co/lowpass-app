import type { DealMemoInput, DealMemoListRow } from '@/lib/types/deal-memo';
import { mapListRow } from '@/lib/deal-memos/mapDealMemo';

async function parseJson(res: Response): Promise<unknown> {
  try {
    return await res.json();
  } catch {
    return {};
  }
}

export { mapDealMemo, mapListRow } from '@/lib/deal-memos/mapDealMemo';

export async function listDealMemosForTour(tourId: string): Promise<DealMemoListRow[]> {
  const res = await fetch(`/api/deal-memos?tour_id=${encodeURIComponent(tourId)}`, { cache: 'no-store' });
  const json = await parseJson(res);
  if (!res.ok) throw new Error(((json as { error?: string }).error ?? 'Failed to list') as string);
  const rows = (json as { dealMemos?: unknown[] }).dealMemos ?? [];
  return rows.map((r) => mapListRow(r as Record<string, unknown>));
}

export async function listDealMemosForShow(showId: string): Promise<DealMemoListRow[]> {
  const res = await fetch(`/api/deal-memos?show_id=${encodeURIComponent(showId)}`, { cache: 'no-store' });
  const json = await parseJson(res);
  if (!res.ok) throw new Error(((json as { error?: string }).error ?? 'Failed to list') as string);
  const rows = (json as { dealMemos?: unknown[] }).dealMemos ?? [];
  return rows.map((r) => mapListRow(r as Record<string, unknown>));
}

export async function getDealMemoById(id: string): Promise<DealMemoListRow | null> {
  const res = await fetch(`/api/deal-memos/${encodeURIComponent(id)}`, { cache: 'no-store' });
  if (res.status === 404) return null;
  const json = await parseJson(res);
  if (!res.ok) throw new Error(((json as { error?: string }).error ?? 'Not found') as string);
  return mapListRow((json as { dealMemo: Record<string, unknown> }).dealMemo);
}

export async function createDealMemo(input: DealMemoInput): Promise<DealMemoListRow> {
  const res = await fetch('/api/deal-memos', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  });
  const json = await parseJson(res);
  if (!res.ok) throw new Error(((json as { error?: string }).error ?? 'Failed to create') as string);
  return mapListRow((json as { dealMemo: Record<string, unknown> }).dealMemo);
}

export async function updateDealMemo(id: string, patch: DealMemoInput): Promise<DealMemoListRow> {
  const res = await fetch(`/api/deal-memos/${encodeURIComponent(id)}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(patch),
  });
  const json = await parseJson(res);
  if (!res.ok) throw new Error(((json as { error?: string }).error ?? 'Failed to update') as string);
  return mapListRow((json as { dealMemo: Record<string, unknown> }).dealMemo);
}

export async function deleteDealMemo(id: string): Promise<void> {
  const res = await fetch(`/api/deal-memos/${encodeURIComponent(id)}`, {
    method: 'DELETE',
  });
  if (res.status === 204) return;
  const json = await parseJson(res);
  throw new Error(((json as { error?: string }).error ?? 'Failed to delete') as string);
}

export async function searchDealMemos(
  query: string,
  opts?: { tourId?: string; limit?: number },
): Promise<DealMemoListRow[]> {
  const qs = new URLSearchParams({ q: query });
  if (opts?.tourId) qs.set('tour_id', opts.tourId);
  qs.set('limit', String(opts?.limit ?? 20));
  const res = await fetch(`/api/deal-memos?${qs}`, { cache: 'no-store' });
  const json = await parseJson(res);
  if (!res.ok) return [];
  const rows = (json as { dealMemos?: unknown[] }).dealMemos ?? [];
  return rows.map((r) => mapListRow(r as Record<string, unknown>));
}

export type DealMemoListFilters = {
  tour_id?: string;
  status?: string;
  year?: string;
  scope?: 'show' | 'tour-wide';
  q?: string;
  limit?: number;
};

/** Workspace-wide library list (same GET as tour filter omitted). */
export async function listDealMemos(filters?: DealMemoListFilters): Promise<DealMemoListRow[]> {
  const qs = new URLSearchParams();
  if (filters?.tour_id) qs.set('tour_id', filters.tour_id);
  if (filters?.status) qs.set('status', filters.status);
  if (filters?.year) qs.set('year', filters.year);
  if (filters?.scope) qs.set('scope', filters.scope);
  if (filters?.q?.trim()) qs.set('q', filters.q.trim());
  qs.set('limit', String(filters?.limit ?? 200));
  const res = await fetch(`/api/deal-memos?${qs}`, { cache: 'no-store' });
  const json = await parseJson(res);
  if (!res.ok) throw new Error(((json as { error?: string }).error ?? 'Failed to list deal memos') as string);
  const rows = (json as { dealMemos?: unknown[] }).dealMemos ?? [];
  return rows.map((r) => mapListRow(r as Record<string, unknown>));
}

export async function getSignedDealMemoDocumentUrl(id: string): Promise<string | null> {
  const res = await fetch(`/api/deal-memos/${encodeURIComponent(id)}/signed-document`, { cache: 'no-store' });
  const json = (await parseJson(res)) as { url?: string; error?: string };
  if (!res.ok || !json.url) return null;
  return json.url;
}
