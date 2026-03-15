/* ============================================
   LOWPASS — Server-side encryption helpers

   AES-256-GCM for passport numbers and other
   sensitive fields. Key from ENCRYPTION_KEY env var.
   ============================================ */

import crypto from 'crypto';

const ALGO = 'aes-256-gcm';
const IV_LEN = 12;
const TAG_LEN = 16;

function getKey(): Buffer {
  const raw = process.env.ENCRYPTION_KEY;
  if (!raw) throw new Error('ENCRYPTION_KEY env var is not set');
  // Accept hex (64 chars) or base64 (44 chars) or raw 32-byte string
  if (/^[0-9a-f]{64}$/i.test(raw)) return Buffer.from(raw, 'hex');
  const b64 = Buffer.from(raw, 'base64');
  if (b64.length === 32) return b64;
  // Fall back to SHA-256 hash of the raw string (allows any passphrase)
  return crypto.createHash('sha256').update(raw).digest();
}

/**
 * Encrypt a plaintext string → hex-encoded "iv:ciphertext:tag".
 */
export function encrypt(plaintext: string): string {
  const key = getKey();
  const iv = crypto.randomBytes(IV_LEN);
  const cipher = crypto.createCipheriv(ALGO, key, iv);
  const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [iv.toString('hex'), encrypted.toString('hex'), tag.toString('hex')].join(':');
}

/**
 * Decrypt a hex-encoded "iv:ciphertext:tag" → plaintext string.
 * Returns null if decryption fails (wrong key, tampered data, etc).
 */
export function decrypt(packed: string): string | null {
  try {
    const key = getKey();
    const [ivHex, ctHex, tagHex] = packed.split(':');
    if (!ivHex || !ctHex || !tagHex) return null;
    const iv = Buffer.from(ivHex, 'hex');
    const ct = Buffer.from(ctHex, 'hex');
    const tag = Buffer.from(tagHex, 'hex');
    const decipher = crypto.createDecipheriv(ALGO, key, iv);
    decipher.setAuthTag(tag);
    const decrypted = Buffer.concat([decipher.update(ct), decipher.final()]);
    return decrypted.toString('utf8');
  } catch {
    return null;
  }
}
