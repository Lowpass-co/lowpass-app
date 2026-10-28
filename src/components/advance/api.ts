/* Browser calls for the Advance pages. Every error comes back as a readable
   message (the routes say what went wrong in words). */

import type { AdvSection } from '@/lib/advance/board';
import type { FieldSource } from '@/server/advance/show';

async function call<T>(url: string, init: RequestInit): Promise<T> {
  const res = await fetch(url, { ...init, headers: { 'Content-Type': 'application/json', ...(init.headers ?? {}) } });
  const text = await res.text();
  const body = text ? (JSON.parse(text) as Record<string, unknown>) : {};
  if (!res.ok) {
    const err = body.error === 'ai_usage_cap_exceeded' ? 'You’ve reached this month’s AI limit.' : (body.error as string) || `Something went wrong (${res.status})`;
    throw new Error(err);
  }
  return body as T;
}

const base = (tourId: string, routingId: string) => `/api/tours/${tourId}/advance/${routingId}`;

export function saveAnswers(
  tourId: string,
  routingId: string,
  changes: Record<string, Record<string, unknown>>,
  sources?: Record<string, FieldSource | null>,
) {
  return call<{ instanceId: string; data: Record<string, Record<string, unknown>>; field_sources: Record<string, FieldSource> }>(
    `${base(tourId, routingId)}/answers`,
    { method: 'POST', body: JSON.stringify({ changes, sources }) },
  );
}

export function saveSections(tourId: string, routingId: string, sections: AdvSection[], alsoTemplate = false) {
  return call<{ sections: AdvSection[]; customised: boolean; templateDays?: { updated: number; kept: number } }>(`${base(tourId, routingId)}/sections`, {
    method: 'PUT',
    body: JSON.stringify({ sections, alsoTemplate }),
  });
}

export function resetSections(tourId: string, routingId: string, templateId?: string) {
  return call<{ sections: AdvSection[]; template: { id: string; name: string } }>(`${base(tourId, routingId)}/sections`, {
    method: 'POST',
    body: JSON.stringify(templateId ? { action: 'use-template', templateId } : { action: 'reset' }),
  });
}

export function makeRequest(tourId: string, routingId: string, body: { recipientName?: string; recipientEmail?: string; askFields?: string[] | null }) {
  return call<{ link: { id: string; token: string; path: string }; questions: number }>(`${base(tourId, routingId)}/request`, {
    method: 'POST',
    body: JSON.stringify(body),
  });
}

export function markSent(tourId: string, routingId: string, linkId: string) {
  return call<{ updated: number }>(`${base(tourId, routingId)}/request`, { method: 'PATCH', body: JSON.stringify({ linkId, sent: true }) });
}

export function reviewPending(instanceId: string, accept: string[], reject: string[]) {
  return call<{ ok?: boolean }>(`/api/advance/intake/pending`, {
    method: 'POST',
    body: JSON.stringify({ advance_instance_id: instanceId, accept, reject }),
  });
}

export function packFileUrl(tourId: string, q: { path?: string; doc?: string }) {
  const qs = q.doc ? `doc=${encodeURIComponent(q.doc)}` : `path=${encodeURIComponent(q.path ?? '')}`;
  return call<{ url: string }>(`/api/tours/${tourId}/advance/packs/file?${qs}`, { method: 'GET' });
}

export { call as advanceCall };
