/* ============================================
   LOWPASS — beta codes (Nov 2026, Adam): sign-up is by code only.

   One code per tester, bound to their email (Daysheets-style: add an email,
   make a code, send it). Redeemed once, at sign-up, which creates the account
   server-side — so public sign-up can stay OFF in Supabase. The code reached
   the tester at that email, so holding it stands in for confirming the email.
   ============================================ */
import { randomBytes } from 'node:crypto';

/** No 0/O/1/I/L — read aloud and typed from a phone without mistakes. */
const ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';

/** 12 characters as XXXX-XXXX-XXXX (~59 bits). */
export function generateBetaCode(): string {
  const bytes = randomBytes(12);
  let out = '';
  for (let i = 0; i < 12; i++) {
    out += ALPHABET[bytes[i] % ALPHABET.length];
    if (i === 3 || i === 7) out += '-';
  }
  return out;
}

/** What a person typed → the stored form: upper case, dashes where they go. */
export function normaliseBetaCode(input: string): string {
  const raw = input.toUpperCase().replace(/[^A-Z0-9]/g, '');
  if (raw.length !== 12) return raw;
  return `${raw.slice(0, 4)}-${raw.slice(4, 8)}-${raw.slice(8)}`;
}

export type BetaCodeRow = {
  id: string;
  email: string;
  expires_at: string;
  revoked_at: string | null;
  redeemed_at: string | null;
};

/** Why a code can't be used for `email` now, or null if it can. */
export function betaCodeProblem(row: BetaCodeRow | null, email: string, now = new Date()): string | null {
  if (!row) return 'That code isn’t right.';
  if (row.email !== email.trim().toLowerCase()) return 'That code was made for a different email.';
  if (row.revoked_at) return 'That code has been turned off.';
  if (row.redeemed_at) return 'That code has already been used.';
  if (new Date(row.expires_at) < now) return 'That code has expired — ask for a new one.';
  return null;
}
