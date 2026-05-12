/* ============================================
   LOWPASS — Rider web-link helpers

   Token generation + password hashing for public
   rider share links.

   Tokens: 24 bytes of random, base64url-encoded
   (~32 chars). More than enough entropy to make
   guessing infeasible.

   Passwords: scrypt from node's built-in crypto.
   Format stored in DB:
     s1:<saltHex>:<hashHex>
   where "s1" is a version prefix that lets us
   migrate params later without breaking old links.
   ============================================ */

import crypto from 'crypto';
import { promisify } from 'util';

const scryptAsync = promisify(crypto.scrypt) as (
  password: string | Buffer,
  salt: string | Buffer,
  keylen: number,
) => Promise<Buffer>;

const SCRYPT_KEYLEN = 32;
const SALT_BYTES = 16;
const VERSION = 's1';

/** Generate a URL-safe public token. */
export function generateToken(): string {
  return crypto.randomBytes(24).toString('base64url');
}

/** Hash a password for storage. Returns the full "s1:<salt>:<hash>" string. */
export async function hashPassword(password: string): Promise<string> {
  const salt = crypto.randomBytes(SALT_BYTES);
  const derived = await scryptAsync(password, salt, SCRYPT_KEYLEN);
  return `${VERSION}:${salt.toString('hex')}:${derived.toString('hex')}`;
}

/** Verify a password against a stored hash. Returns false on any parse failure. */
export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  try {
    const [version, saltHex, hashHex] = stored.split(':');
    if (version !== VERSION || !saltHex || !hashHex) return false;
    const salt = Buffer.from(saltHex, 'hex');
    const expected = Buffer.from(hashHex, 'hex');
    const derived = await scryptAsync(password, salt, expected.length);
    if (derived.length !== expected.length) return false;
    return crypto.timingSafeEqual(derived, expected);
  } catch {
    return false;
  }
}

/** rider_web_links row, minus password_hash (never leaves the server). */
export type WebLinkPublic = {
  id: string;
  pack_id: string;
  token: string;
  has_password: boolean;
  created_by: string | null;
  created_at: string;
  revoked_at: string | null;
  revoked_reason: string | null;
};

/** Shape of the payload returned by /api/public/rider/[token] on success. */
export type PublicRiderPayload = {
  pack: {
    id: string;
    title: string | null;
    scope: 'artist' | 'tour' | 'show';
    artist_id: string;
    artist_name: string;
    /* Sprint 12 §9b — cover page fields. cover_logo_url
       resolves on the server: rider-level override falls back
       to artists.default_logo_url, which falls back to null.
       Always a signed URL when present; the client renders
       it directly without further resolution. updated_at
       drives the "Rider Updated — <ordinal date>" timestamp. */
    cover_logo_url: string | null;
    cover_subtitle: string | null;
    cover_disclaimer: string | null;
    updated_at: string;
  };
  sections: Array<{
    id: string;
    section_key: string;
    title: string;
    sort_order: number;
    section_type?: string;
    fields: unknown[];
    /* Sprint 12 §9b — surfaced so the TOC can see rich_text
       + advance_summary sections too. The legacy fields-only
       render path stays unchanged for sections without a
       rich-text body. */
    metadata?: Record<string, unknown> | null;
    inherited_from: 'artist' | 'tour' | 'show' | null;
    source_pack_id: string;
  }>;
  signedUrls: Record<string, string | null>;
};
