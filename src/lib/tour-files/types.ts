/** Tour files list — unified row for storage refs and DB file rows. */

export type FileVm = {
  id: string;
  source: 'advance' | 'personnel' | 'rider-pack' | 'other';
  /** Display name */
  filename: string;
  mimeType: string | null;
  size: number | null;
  uploadedAt: string;
  uploadedByName: string | null;
  showId: string | null;
  personId: string | null;
  riderPackId: string | null;
  storageBucket: string;
  storagePath: string;
  externalUrl?: string | null;
  /** Short-lived preview URL when server could sign storage */
  previewUrl?: string | null;
  linkedSummary: string;
  linkedHref?: string | null;
};
