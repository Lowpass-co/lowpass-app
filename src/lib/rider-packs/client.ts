/* ============================================
   LOWPASS — Rider/Pack client

   Typed fetch helpers for everything under /api/rider-packs,
   /api/rider-assets, and /api/contacts/pick.

   All helpers are thin wrappers around fetch. They throw an
   Error (message = server's error string) on non-2xx so
   components can do try/catch without re-parsing JSON.
   ============================================ */

import type {
  PackScope,
  ResolvedPack,
  RiderPack,
  RiderPackHistoryRow,
  RiderSection,
} from './types';

// --- low-level ---------------------------------------------------------------

async function asJson<T>(res: Response): Promise<T> {
  if (!res.ok) {
    let msg = `HTTP ${res.status}`;
    try {
      const j = await res.json();
      if (j?.error) msg = String(j.error);
    } catch {
      /* ignore */
    }
    throw new Error(msg);
  }
  return res.json() as Promise<T>;
}

// --- packs -------------------------------------------------------------------

export async function listPacks(params: {
  scope?: PackScope;
  artistId?: string;
  tourId?: string;
  routingId?: string;
}): Promise<RiderPack[]> {
  const q = new URLSearchParams();
  if (params.scope) q.set('scope', params.scope);
  if (params.artistId) q.set('artist_id', params.artistId);
  if (params.tourId) q.set('tour_id', params.tourId);
  if (params.routingId) q.set('routing_id', params.routingId);
  const res = await fetch(`/api/rider-packs?${q.toString()}`);
  const { packs } = await asJson<{ packs: RiderPack[] }>(res);
  return packs;
}

export async function createPack(body: {
  scope: PackScope;
  artist_id: string;
  tour_id?: string | null;
  routing_id?: string | null;
  title?: string | null;
  /** Optional: override parent in inheritance chain; omit to default (oldest artist folder for tour, oldest tour for show). */
  inherit_from_folder_id?: string | null;
}): Promise<RiderPack> {
  const res = await fetch('/api/rider-packs', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  return asJson<RiderPack>(res);
}

export async function getPackRaw(id: string): Promise<{
  pack: RiderPack;
  sections: RiderSection[];
}> {
  const res = await fetch(`/api/rider-packs/${id}`);
  return asJson(res);
}

export async function getPackResolved(id: string): Promise<ResolvedPack> {
  const res = await fetch(`/api/rider-packs/${id}/resolved`);
  return asJson(res);
}

export async function updatePack(
  id: string,
  body: Partial<Pick<RiderPack, 'title' | 'google_doc_id' | 'google_doc_url'>>,
): Promise<RiderPack> {
  const res = await fetch(`/api/rider-packs/${id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  return asJson(res);
}

export async function deletePack(id: string): Promise<void> {
  const res = await fetch(`/api/rider-packs/${id}`, { method: 'DELETE' });
  await asJson(res);
}

// --- sections ---------------------------------------------------------------

export async function createSection(
  packId: string,
  body: { section_key: string; title: string; sort_order?: number; fields?: unknown[] },
): Promise<RiderSection> {
  const res = await fetch(`/api/rider-packs/${packId}/sections`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  return asJson(res);
}

export async function updateSection(
  packId: string,
  sectionId: string,
  body: Partial<Pick<RiderSection, 'title' | 'sort_order' | 'fields' | 'section_key'>>,
): Promise<RiderSection> {
  const res = await fetch(`/api/rider-packs/${packId}/sections/${sectionId}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  return asJson(res);
}

export async function deleteSection(packId: string, sectionId: string): Promise<void> {
  const res = await fetch(`/api/rider-packs/${packId}/sections/${sectionId}`, {
    method: 'DELETE',
  });
  await asJson(res);
}

// --- history ---------------------------------------------------------------

export async function listHistory(
  packId: string,
  params?: { limit?: number; before?: string },
): Promise<RiderPackHistoryRow[]> {
  const q = new URLSearchParams();
  if (params?.limit) q.set('limit', String(params.limit));
  if (params?.before) q.set('before', params.before);
  const res = await fetch(`/api/rider-packs/${packId}/history?${q.toString()}`);
  const { history } = await asJson<{ history: RiderPackHistoryRow[] }>(res);
  return history;
}

// --- contact picker --------------------------------------------------------

export type PickedContact = {
  source: 'tour_personnel' | 'contact' | 'external';
  id?: string;
  name: string;
  role: string | null;
  email: string | null;
  phone: string | null;
  company: string | null;
  notes: string | null;
};

export async function pickContacts(params: {
  tourId?: string;
  q?: string;
  limit?: number;
}): Promise<{ tour_personnel: PickedContact[]; contacts: PickedContact[] }> {
  const sp = new URLSearchParams();
  if (params.tourId) sp.set('tour_id', params.tourId);
  if (params.q) sp.set('q', params.q);
  if (params.limit) sp.set('limit', String(params.limit));
  const res = await fetch(`/api/contacts/pick?${sp.toString()}`);
  return asJson(res);
}

// --- assets (read-only from the client for R3) -----------------------------

export type RiderAsset = {
  id: string;
  workspace_id: string;
  scope: PackScope;
  artist_id: string;
  tour_id: string | null;
  routing_id: string | null;
  asset_type: 'image' | 'file' | 'url';
  label: string;
  storage_path: string | null;
  external_url: string | null;
  meta: Record<string, unknown>;
  created_at: string;
  updated_at: string;
};

export async function listAssets(params: {
  artistId?: string;
  scope?: PackScope;
  tourId?: string;
  routingId?: string;
}): Promise<{ assets: RiderAsset[]; signedUrls: Record<string, string | null> }> {
  const q = new URLSearchParams();
  if (params.artistId) q.set('artist_id', params.artistId);
  if (params.scope) q.set('scope', params.scope);
  if (params.tourId) q.set('tour_id', params.tourId);
  if (params.routingId) q.set('routing_id', params.routingId);
  const res = await fetch(`/api/rider-assets?${q.toString()}`);
  return asJson(res);
}

// ============================================================
// Web links (R4)
// ============================================================

export type WebLink = {
  id: string;
  pack_id: string;
  token: string;
  has_password: boolean;
  created_by: string | null;
  created_at: string;
  revoked_at: string | null;
  revoked_reason: string | null;
};

export async function listWebLinks(packId: string): Promise<{ links: WebLink[] }> {
  const res = await fetch(`/api/rider-packs/${packId}/web-links`);
  return asJson(res);
}

export async function createWebLink(
  packId: string,
  body: { password?: string | null } = {},
): Promise<WebLink> {
  const res = await fetch(`/api/rider-packs/${packId}/web-links`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body.password ? { password: body.password } : {}),
  });
  return asJson(res);
}

export async function revokeWebLink(linkId: string): Promise<void> {
  const res = await fetch(`/api/rider-web-links/${linkId}`, { method: 'DELETE' });
  if (!res.ok) throw new Error(`Failed to revoke link (status ${res.status})`);
}

// ============================================================
// Google Doc export (R5)
// ============================================================

export async function exportGoogleDoc(packId: string): Promise<{
  document_id: string;
  document_url: string | null;
  is_new: boolean;
}> {
  const res = await fetch(`/api/rider-packs/${packId}/export/google-doc`, {
    method: 'POST',
  });
  return asJson(res);
}
