/* ============================================
   LOWPASS — Google service-account auth

   Returns a GoogleAuth client scoped for
   Docs + Drive. Used by the rider/pack
   Google Doc export endpoint.

   Env vars required:
     GOOGLE_SERVICE_ACCOUNT_EMAIL
     GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY   (PEM; literal \n escapes are unescaped here)

   Docs kept intentionally tiny — all the
   retry / refresh logic lives inside googleapis.
   ============================================ */

import { google } from 'googleapis';

const SCOPES = [
  'https://www.googleapis.com/auth/documents',
  'https://www.googleapis.com/auth/drive.file',
];

let cachedAuth: InstanceType<typeof google.auth.JWT> | null = null;

export function getGoogleAuth() {
  if (cachedAuth) return cachedAuth;

  const email = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL;
  const rawKey = process.env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY;
  if (!email || !rawKey) {
    throw new Error('Missing GOOGLE_SERVICE_ACCOUNT_EMAIL or GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY');
  }

  const privateKey = rawKey.replace(/\\n/g, '\n');

  cachedAuth = new google.auth.JWT({
    email,
    key: privateKey,
    scopes: SCOPES,
  });

  return cachedAuth;
}

export function getDocsClient() {
  return google.docs({ version: 'v1', auth: getGoogleAuth() });
}

export function getDriveClient() {
  return google.drive({ version: 'v3', auth: getGoogleAuth() });
}
