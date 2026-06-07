import { createHmac, timingSafeEqual } from 'crypto';

/** Signed token: public read-only advance (no DB). Verified in GET /api/share/advance/[token]. */

const PREFIX = 'lpa1';

function secret(): string {
  /* Security audit §M2 — share links are signed with a DEDICATED secret,
     never the Supabase service-role key. Reusing the database master key
     as an HMAC signing secret widened its blast radius and coupled link
     signing to the most sensitive credential we hold. Set
     ADVANCE_SHARE_HMAC_SECRET (a long random string) in every environment
     that issues share links. If unset, signing is disabled (the route
     returns 503) rather than silently falling back to the master key.

     NOTE: dropping the fallback invalidates any links previously signed
     with the service-role key. Issue fresh links after setting the env. */
  return process.env.ADVANCE_SHARE_HMAC_SECRET ?? '';
}

export function hasAdvanceShareSecret(): boolean {
  return secret().length > 0;
}

export function signAdvanceShare(payload: {
  tourId: string;
  routingId: string;
  /** Unix seconds */
  exp: number;
}): string {
  const payloadJson = Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url');
  const mac = createHmac('sha256', secret()).update(payloadJson).digest('base64url');
  return `${PREFIX}.${payloadJson}.${mac}`;
}

export function verifyAdvanceShareToken(token: string):
  | { tourId: string; routingId: string; exp: number }
  | null {
  const sec = secret();
  if (!sec) return null;
  const parts = token.split('.');
  if (parts.length !== 3 || parts[0] !== PREFIX) return null;
  const [, payloadB64, sig] = parts;
  if (!payloadB64 || !sig) return null;
  const mac = createHmac('sha256', sec).update(payloadB64).digest('base64url');
  const a = Buffer.from(mac);
  const b = Buffer.from(sig);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  try {
    const json = Buffer.from(payloadB64, 'base64url').toString('utf8');
    const o = JSON.parse(json) as { tourId?: string; routingId?: string; exp?: number };
    if (!o.tourId || !o.routingId || typeof o.exp !== 'number') return null;
    if (Date.now() / 1000 > o.exp) return null;
    return { tourId: o.tourId, routingId: o.routingId, exp: o.exp };
  } catch {
    return null;
  }
}
