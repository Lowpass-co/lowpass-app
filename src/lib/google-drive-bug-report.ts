/* ============================================
   LOWPASS — Google Drive uploads (bug reports)

   Uses a service account with drive.file scope.
   Share the destination folder with the service account email
   (Editor). Env: GOOGLE_DRIVE_SERVICE_ACCOUNT_JSON,
   GOOGLE_DRIVE_BUG_REPORTS_FOLDER_ID.
   ============================================ */

import { google } from 'googleapis';
import { JWT } from 'google-auth-library';

export type DriveBugReportClient = {
  drive: ReturnType<typeof google.drive>;
  folderId: string;
};

export function getDriveBugReportClient(): DriveBugReportClient | null {
  const json = process.env.GOOGLE_DRIVE_SERVICE_ACCOUNT_JSON;
  const folderId = process.env.GOOGLE_DRIVE_BUG_REPORTS_FOLDER_ID;
  if (!json?.trim() || !folderId?.trim()) return null;

  let creds: { client_email: string; private_key: string };
  try {
    creds = JSON.parse(json) as { client_email: string; private_key: string };
  } catch {
    return null;
  }

  const auth = new JWT({
    email: creds.client_email,
    key: creds.private_key,
    scopes: ['https://www.googleapis.com/auth/drive.file'],
  });

  return {
    drive: google.drive({ version: 'v3', auth }),
    folderId: folderId.trim(),
  };
}

export async function uploadBugReportFile(
  client: DriveBugReportClient,
  params: { fileName: string; mimeType: string; body: Buffer }
): Promise<void> {
  const { drive, folderId } = client;
  await drive.files.create({
    requestBody: {
      name: params.fileName,
      parents: [folderId],
    },
    media: {
      mimeType: params.mimeType,
      body: params.body,
    },
    fields: 'id',
    supportsAllDrives: true,
  });
}
