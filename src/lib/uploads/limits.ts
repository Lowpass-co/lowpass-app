/* ============================================
   LOWPASS — upload limits, in one place (Nov 2026, Adam)

   Every upload into the tour-files bucket — tour/artist Files, share links,
   advance info packs — goes straight from the browser to Storage, so these
   are the only caps (no Vercel 4.5 MB body limit in the way).

   100 MB per file: venue packs with diagrams run to ~50 MB; double that is
   headroom without letting a leaked edit link fill storage with video.
   Migration 282 sets the bucket to the same number. The Supabase project's
   global limit (Dashboard → Storage → Settings) must be at least this too —
   it is 50 MB on the Free plan.
   ============================================ */

export const MAX_UPLOAD_MB = 100;
export const MAX_UPLOAD_BYTES = MAX_UPLOAD_MB * 1024 * 1024;

/** Above this, uploads are resumable (TUS, 6 MB chunks — Supabase's required
 *  chunk size): a dropped connection resumes instead of restarting. */
export const RESUMABLE_ABOVE_BYTES = 6 * 1024 * 1024;

/** An upload that hasn't finished within this long is swept (object + grant). */
export const UPLOAD_GRANT_TTL_HOURS = 24;

export const TOUR_FILES_BUCKET = 'tour-files';

/** "Each file must be 100 MB or less." */
export const tooLargeMessage = (): string => `Each file must be ${MAX_UPLOAD_MB} MB or less.`;
