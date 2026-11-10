'use client';

/* ============================================
   Google Map Tiles API — 2D satellite (Nov 2026, Adam: "use Google for now")

   Browser-side by design: every tile request carries the key, so the key is a
   BROWSER key — NEXT_PUBLIC_GOOGLE_MAP_TILES_KEY, restricted in Google Cloud
   to (a) the Map Tiles API and (b) this site's referrers. It is not the
   server's GOOGLE_PLACES_API_KEY and must never be.

   Terms we follow (developers.google.com/maps/documentation/tile/policies):
   no prefetch, store or cache beyond HTTP cache headers — tiles are fetched
   for the view on screen and dropped; the data attribution from the viewport
   call is shown in full with "Google Maps", bottom right, never covered.
   ============================================ */

import type { TileKey } from '@/lib/parking/geo';

const BASE = 'https://tile.googleapis.com';

export const tilesKey = (): string | null => process.env.NEXT_PUBLIC_GOOGLE_MAP_TILES_KEY?.trim() || null;

export interface TileSession {
  token: string;
  expiresAt: number;
  /** Tile pixels per 256-px cell (2 for a 512-px tile). */
  tileScale: number;
}

let session: Promise<TileSession> | null = null;

function locale(): { language: string; region: string } {
  const lang = (typeof navigator !== 'undefined' && navigator.language) || 'en-GB';
  const region = /-([A-Z]{2})$/.exec(lang)?.[1] ?? 'GB';
  return { language: lang, region };
}

/** One session per page load, renewed a day before Google's expiry. */
export function getTileSession(): Promise<TileSession> {
  const key = tilesKey();
  if (!key) return Promise.reject(new Error('Map imagery is not set up (NEXT_PUBLIC_GOOGLE_MAP_TILES_KEY).'));
  if (session) {
    return session.then((s) => (s.expiresAt - Date.now() > 86_400_000 ? s : ((session = null), getTileSession())));
  }
  session = fetch(`${BASE}/v1/createSession?key=${encodeURIComponent(key)}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ mapType: 'satellite', ...locale() }),
  })
    .then(async (r) => {
      const j = (await r.json().catch(() => ({}))) as { session?: string; expiry?: string; tileWidth?: number; error?: { message?: string } };
      if (!r.ok || !j.session) throw new Error(j.error?.message ?? `Google refused the map session (${r.status})`);
      return { token: j.session, expiresAt: Number(j.expiry ?? 0) * 1000 || Date.now() + 86_400_000 * 13, tileScale: (j.tileWidth ?? 256) / 256 };
    })
    .catch((e) => {
      session = null;
      throw e;
    });
  return session;
}

export function tileUrl(s: TileSession, t: TileKey): string {
  return `${BASE}/v1/2dtiles/${t.z}/${t.x}/${t.y}?session=${encodeURIComponent(s.token)}&key=${encodeURIComponent(tilesKey() ?? '')}`;
}

export interface ViewportInfo {
  copyright: string;
  /** Deepest imagery available at the view's centre. */
  maxZoom: number;
}

export async function viewportInfo(
  s: TileSession,
  zoom: number,
  b: { north: number; south: number; east: number; west: number },
  centre: { lat: number; lng: number },
): Promise<ViewportInfo> {
  const q = new URLSearchParams({
    session: s.token,
    key: tilesKey() ?? '',
    zoom: String(zoom),
    north: b.north.toFixed(7),
    south: b.south.toFixed(7),
    east: b.east.toFixed(7),
    west: b.west.toFixed(7),
  });
  const r = await fetch(`${BASE}/tile/v1/viewport?${q}`);
  if (!r.ok) throw new Error(`Google viewport call failed (${r.status})`);
  const j = (await r.json()) as { copyright?: string; maxZoomRects?: { maxZoom: number; north: number; south: number; east: number; west: number }[] };
  const here = (j.maxZoomRects ?? []).filter((m) => centre.lat <= m.north && centre.lat >= m.south && centre.lng <= m.east && centre.lng >= m.west);
  const maxZoom = here.length ? Math.max(...here.map((m) => m.maxZoom)) : 20;
  return { copyright: j.copyright ?? '', maxZoom };
}

/** Load one tile as an object URL (for the PDF: an SVG drawn to a canvas needs same-origin images). */
export async function tileAsDataUrl(url: string): Promise<string> {
  const r = await fetch(url, { mode: 'cors' });
  if (!r.ok) throw new Error(`A map tile failed to load (${r.status})`);
  const blob = await r.blob();
  return await new Promise<string>((res, rej) => {
    const fr = new FileReader();
    fr.onload = () => res(String(fr.result));
    fr.onerror = () => rej(new Error('A map tile could not be read'));
    fr.readAsDataURL(blob);
  });
}
