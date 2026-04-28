import { createHmac, timingSafeEqual } from 'crypto';

/** Signed token: public read-only advance (no DB). Verified in GET /api/share/advance/[token]. */

const PREFIX = 'lpa1';

function secret(): string {
  const s = process.env.ADVANCE_SHARE_HMAC_SECRET ?? process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!s) return '';
  return s;
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
