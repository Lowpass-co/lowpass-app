'use client';

/* LOWPASS — Riders: the client's calls (one error shape: ApiError). */

import type { EmbedLinks, RiderEditorData } from '@/server/riders/data';
import type { RiderEmbeds } from '@/lib/riders/types';
import type { RiderBlock } from '@/lib/riders/types';

export class ApiError extends Error {
  constructor(
    message: string,
    public status: number,
    public code: string | null = null,
    public current: unknown = null,
  ) {
    super(message);
  }
}

export async function call<T>(url: string, init: RequestInit = {}): Promise<T> {
  let res: Response;
  try {
    res = await fetch(url, { ...init, headers: { 'Content-Type': 'application/json', ...(init.headers ?? {}) } });
  } catch {
    throw new ApiError('You’re offline — changes will save when you’re back.', 0, 'OFFLINE');
  }
  const text = await res.text();
  let body: Record<string, unknown> = {};
  try {
    body = text ? (JSON.parse(text) as Record<string, unknown>) : {};
  } catch {
    body = {};
  }
  if (!res.ok) throw new ApiError(typeof body.error === 'string' ? body.error : `Something went wrong (${res.status})`, res.status, (body.code as string) ?? null, body.current ?? null);
  return body as T;
}

export function ridersApi(tourId: string) {
  const base = `/api/tours/${tourId}/riders`;
  return {
    load: () => call<RiderEditorData>(base, { method: 'GET' }),
    /** Just the live input list / stage plot (back from their tools). */
    embeds: () => call<{ embeds: RiderEmbeds; embedLinks: EmbedLinks }>(`${base}?part=embeds`, { method: 'GET' }),
    action: <T = unknown>(body: Record<string, unknown>) => call<T>(base, { method: 'POST', body: JSON.stringify(body) }),
    insert: (riderId: string, blocks: Record<string, unknown>[]) => call<{ blocks: RiderBlock[] }>(`${base}/blocks`, { method: 'POST', body: JSON.stringify({ riderId, blocks }) }),
    patch: (body: Record<string, unknown>, keepalive = false) => call<{ block: RiderBlock }>(`${base}/blocks`, { method: 'PATCH', body: JSON.stringify(body), keepalive }),
    remove: (ids: string[]) => call<{ deleted: number }>(`${base}/blocks`, { method: 'DELETE', body: JSON.stringify({ ids }) }),
    /** Item photos: signed URLs, an upload grant + finish, or "get it from the link". */
    photoUrls: (paths: string[]) => call<{ urls: Record<string, string> }>(`${base}/photos`, { method: 'POST', body: JSON.stringify({ action: 'urls', paths }) }),
    photoUpload: (type: string, size: number) => call<{ bucket: string; path: string; token: string }>(`${base}/photos`, { method: 'POST', body: JSON.stringify({ action: 'upload-url', type, size }) }),
    photoDone: (path: string) => call<{ path: string; url: string | null }>(`${base}/photos`, { method: 'POST', body: JSON.stringify({ action: 'complete', path }) }),
    photoFromLink: (url: string) => call<{ path: string; url: string | null; title: string | null }>(`${base}/photos`, { method: 'POST', body: JSON.stringify({ action: 'from-link', url }) }),
    pdfUrl: (o: { version?: string; routingId?: string; kind?: string } = {}) => {
      const q = new URLSearchParams(Object.entries(o).filter(([, v]) => !!v) as [string, string][]);
      return `${base}/pdf${q.toString() ? `?${q}` : ''}`;
    },
  };
}
