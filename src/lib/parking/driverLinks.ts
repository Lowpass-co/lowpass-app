/* ============================================
   LOWPASS — Parking: driver links, the rules (Nov 2026, Adam)

   A short-lived link to ONE show's parking map, for a driver: the plan
   first (2D tiles — free at tour scale), the 3D view one tap away (each open
   is a billed Google session, so a link may open 3D only so many times),
   and "Navigate here" hand-offs to Google Maps / Waze / Apple Maps for the
   driving itself. Pure: the server (src/server/parking/driverLinks.ts), the
   editor and the public page share these.
   ============================================ */

import type { LatLng } from './geo';

export const DRIVER_LINK = {
  defaultHours: 48,
  maxHours: 14 * 24,
  default3d: 20,
  max3d: 100,
  labelMax: 60,
} as const;

export const EXPIRY_CHOICES: readonly { hours: number; label: string }[] = [
  { hours: 12, label: '12 hours' },
  { hours: 24, label: '1 day' },
  { hours: 48, label: '2 days' },
  { hours: 72, label: '3 days' },
  { hours: 168, label: '1 week' },
];

export const TOKEN_RE = /^[A-Za-z0-9_-]{16,64}$/;

export interface DriverLinkRow {
  id: string;
  workspace_id: string;
  tour_id: string;
  routing_id: string;
  label: string | null;
  expires_at: string;
  revoked_at: string | null;
  max_3d_opens: number;
  opens_3d: number;
  views: number;
  last_viewed_at?: string | null;
  created_at?: string;
}

export type DriverLinkState = 'live' | 'expired' | 'revoked';

export function linkState(row: Pick<DriverLinkRow, 'expires_at' | 'revoked_at'>, now = new Date()): DriverLinkState {
  if (row.revoked_at) return 'revoked';
  return new Date(row.expires_at).getTime() <= now.getTime() ? 'expired' : 'live';
}

export const remaining3d = (row: Pick<DriverLinkRow, 'max_3d_opens' | 'opens_3d'>) => Math.max(0, row.max_3d_opens - row.opens_3d);

export class DriverLinkInputError extends Error {}

/** What the owner sends to make a link. */
export function parseCreate(raw: unknown): { label: string | null; hours: number; max3d: number } {
  const o = (typeof raw === 'object' && raw !== null ? raw : {}) as Record<string, unknown>;
  const label = typeof o.label === 'string' ? o.label.replace(/[\u0000-\u001F]/g, '').trim().slice(0, DRIVER_LINK.labelMax) || null : null;
  const hours = o.hours == null ? DRIVER_LINK.defaultHours : Number(o.hours);
  if (!Number.isFinite(hours) || hours < 1 || hours > DRIVER_LINK.maxHours) throw new DriverLinkInputError(`A link lasts between 1 hour and ${DRIVER_LINK.maxHours / 24} days.`);
  const max3d = o.max3d == null ? DRIVER_LINK.default3d : Number(o.max3d);
  if (!Number.isInteger(max3d) || max3d < 0 || max3d > DRIVER_LINK.max3d) throw new DriverLinkInputError(`3D opens: 0 to ${DRIVER_LINK.max3d}.`);
  return { label, hours: Math.round(hours), max3d };
}

/** Turn-by-turn is the phone's job: hand the point to the driver's own app. */
export function navigateUrls(p: LatLng): { google: string; waze: string; apple: string } {
  const ll = `${p.lat.toFixed(6)},${p.lng.toFixed(6)}`;
  return {
    google: `https://www.google.com/maps/dir/?api=1&destination=${ll}&travelmode=driving`,
    waze: `https://waze.com/ul?ll=${ll}&navigate=yes`,
    apple: `https://maps.apple.com/?daddr=${ll}&dirflg=d`,
  };
}
