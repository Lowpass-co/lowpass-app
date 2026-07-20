/* ============================================================
   LOWPASS — Tour role links: token grammar (D1-4)

   Per-person tokenized Day links (tour_role_links, mig 245). Reuses the shipped
   advance-intake grammar: an opaque plaintext token (randomBytes(24).base64url),
   resolved by the public /m/day/[token] route via the SERVICE-ROLE client — never
   through RLS. A revoked or expired token resolves to a reason, and the public
   page 404s on it (ROLE-03).

   resolveDayToken is pure over the client it's handed, so a fake service client
   drives it in the harness.
   ============================================================ */

import type { SupabaseClient } from '@supabase/supabase-js';
import { isTourRole, type TourRole } from '@/lib/roles/slices';
import { generateToken } from '@/lib/rider-packs/web-links';

/** Mint a fresh opaque link token (crypto.randomBytes(24).base64url). */
export function mintDayLinkToken(): string {
  return generateToken();
}

export type DayTokenResolution =
  | { ok: true; role: TourRole; tourId: string; workspaceId: string; personId: string | null; linkId: string }
  | { ok: false; reason: 'missing' | 'revoked' | 'expired' };

function isExpired(iso: string | null): boolean {
  if (!iso) return false;
  const t = new Date(iso).getTime();
  return Number.isFinite(t) && t < Date.now();
}

/**
 * Resolve a Day-link token → the viewer's role + tour scope. SERVICE-ROLE only
 * (bypasses RLS; resolves strictly by token). Returns `{ ok:false, reason }` for
 * a missing / revoked / expired token so the caller can 404.
 */
export async function resolveDayToken(
  service: SupabaseClient,
  token: string,
): Promise<DayTokenResolution> {
  const { data: link } = await service
    .from('tour_role_links')
    .select('id, tour_id, workspace_id, tour_role_id, status, expires_at, revoked_at')
    .eq('token', token)
    .maybeSingle();
  if (!link) return { ok: false, reason: 'missing' };
  if (link.revoked_at || link.status === 'revoked') return { ok: false, reason: 'revoked' };
  if (isExpired(link.expires_at as string | null)) return { ok: false, reason: 'expired' };

  const { data: tr } = await service
    .from('tour_roles')
    .select('role, person_id')
    .eq('id', link.tour_role_id as string)
    .maybeSingle();
  const role: TourRole = isTourRole(tr?.role) ? tr.role : 'crew';
  return {
    ok: true,
    role,
    tourId: link.tour_id as string,
    workspaceId: link.workspace_id as string,
    personId: (tr?.person_id as string | null) ?? null,
    linkId: link.id as string,
  };
}

/** Pick the routing row to show for a day link: today's show, else the next
 *  upcoming, else the most recent past. `dates` sorted or not. */
export function pickDayRouting(
  dates: Array<{ id: string; date: string | null }>,
  todayIso: string,
): string | null {
  const sorted = [...dates].filter((d) => d.date).sort((a, b) => (a.date ?? '').localeCompare(b.date ?? ''));
  if (sorted.length === 0) return null;
  const today = sorted.find((d) => (d.date ?? '').slice(0, 10) === todayIso);
  if (today) return today.id;
  const next = sorted.find((d) => (d.date ?? '') > todayIso);
  if (next) return next.id;
  return sorted[sorted.length - 1].id;
}
