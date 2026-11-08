/* ============================================
   LOWPASS — File & folder share links: the rules (Nov 2026, Adam)

   Pure. The server (src/server/files/shareLinks.ts) and both UIs use these, so
   "what is inside this link" and "can this link do that" are answered in one
   place and tested once.

   Adam's model:
     · a link points at ONE tour file, or ONE tour folder (and everything
       under it, including files added later);
     · anyone with the link can open it (optional password, optional expiry);
     · VIEW = see + download; EDIT = also upload into the folder and upload a
       new version of a file. Never rename, move or delete. Old versions kept.
   ============================================ */

export type ShareAccess = 'view' | 'edit';
export type ShareTargetKind = 'file' | 'folder';

/** Uploads through a link are capped like every upload (src/lib/uploads/limits.ts). */
export { MAX_UPLOAD_BYTES as SHARE_MAX_BYTES } from '@/lib/uploads/limits';
/** Per link, per rolling hour — counted from file_share_events, so it holds
 *  across server instances (the in-memory limiter does not). */
export const SHARE_UPLOADS_PER_HOUR = 60;
/** Signed download URLs live this long. */
export const SHARE_DOWNLOAD_SECONDS = 60;
/** Furthest an expiry date may be set. */
export const SHARE_MAX_EXPIRY_DAYS = 730;

export interface ShareLinkRow {
  id: string;
  workspace_id: string;
  tour_id: string;
  target_kind: ShareTargetKind;
  file_id: string | null;
  folder_path: string | null;
  access: ShareAccess;
  token: string;
  password_hash: string | null;
  expires_at: string | null;
  label: string | null;
  created_at: string;
  revoked_at: string | null;
  last_viewed_at: string | null;
}

/* ── Folders ─────────────────────────────────────────────────────────────── */

/** A metadata.folder path: '/'-joined non-empty trimmed segments, ≤512 chars.
 *  Anything else (null, empty, non-string, too long) → null = the tour's root.
 *  The one copy — /api/files uses it too. */
export function sanitizeFolder(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  const parts = raw
    .split('/')
    .map((s) => s.trim())
    .filter(Boolean);
  if (parts.length === 0) return null;
  const joined = parts.join('/');
  return joined.length > 512 ? null : joined;
}

/** Is a file's folder inside a folder link? The folder itself and everything
 *  under it — "Contracts" covers "Contracts/2026", never "Contracts 2". */
export function inFolder(linkFolder: string, fileFolder: string | null | undefined): boolean {
  if (!fileFolder) return false;
  return fileFolder === linkFolder || fileFolder.startsWith(`${linkFolder}/`);
}

/** The file's folder as seen from inside the link ('' = the shared folder itself). */
export function relativeFolder(linkFolder: string, fileFolder: string): string {
  return fileFolder === linkFolder ? '' : fileFolder.slice(linkFolder.length + 1);
}

/** Where an upload into `relative` (as sent by the public page) lands.
 *  Always inside the link's folder — there is no way to climb out, because
 *  folders are labels, not paths: ".." is just a folder called "..". */
export function uploadFolder(linkFolder: string, relative: unknown): string {
  const rel = sanitizeFolder(relative);
  const full = rel ? `${linkFolder}/${rel}` : linkFolder;
  return sanitizeFolder(full) ?? linkFolder;
}

/** After a folder rename "from" → "to", where does a folder link point? */
export function repointFolder(linkFolder: string, from: string, to: string): string | null {
  if (linkFolder === from) return to;
  if (linkFolder.startsWith(`${from}/`)) return `${to}${linkFolder.slice(from.length)}`;
  return null;
}

/* ── Link state ──────────────────────────────────────────────────────────── */

export type LinkState = 'ok' | 'revoked' | 'expired';

export function linkState(link: Pick<ShareLinkRow, 'revoked_at' | 'expires_at'>, now: Date = new Date()): LinkState {
  if (link.revoked_at) return 'revoked';
  if (link.expires_at && new Date(link.expires_at).getTime() <= now.getTime()) return 'expired';
  return 'ok';
}

/** What a link lets the holder do. Only an edit link that is live can write. */
export function can(link: Pick<ShareLinkRow, 'access' | 'revoked_at' | 'expires_at'>, action: 'view' | 'download' | 'upload' | 'new_version', now?: Date): boolean {
  if (linkState(link, now) !== 'ok') return false;
  if (action === 'view' || action === 'download') return true;
  return link.access === 'edit';
}

/* ── Input from people ───────────────────────────────────────────────────── */

/** The name someone gives before editing — logged against what they did. */
export function cleanActorName(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  const s = raw.replace(/[\u0000-\u001f\u007f]/g, '').replace(/\s+/g, ' ').trim();
  if (s.length < 1) return null;
  return s.slice(0, 60);
}

/** Storage object name for an upload: <workspace>/<scope>/<id>/<name>-<time>.<ext>.
 *  The one shape for Files and share links; the finish step checks a path
 *  starts with scopePrefix() before accepting it. */
export function storagePath(workspaceId: string, scopeId: string, fileName: string, now = Date.now(), scope: 'tour' | 'artist' = 'tour'): string {
  const safe = (fileName || 'file').replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 100) || 'file';
  const dot = safe.lastIndexOf('.');
  const base = dot > 0 ? safe.slice(0, dot) : safe;
  const ext = dot > 0 ? safe.slice(dot + 1) : 'bin';
  // A random tail: two uploads of the same name in the same millisecond never collide.
  const tail = Math.random().toString(36).slice(2, 8);
  return `${scopePrefix(workspaceId, scope, scopeId)}${base}-${now}-${tail}.${ext}`;
}

export function scopePrefix(workspaceId: string, scope: 'tour' | 'artist', scopeId: string): string {
  return `${workspaceId}/${scope}/${scopeId}/`;
}

/** A path the browser hands back is ours only if it sits directly in the scope's folder. */
export function isScopePath(path: unknown, workspaceId: string, scope: 'tour' | 'artist', scopeId: string): path is string {
  if (typeof path !== 'string' || path.length > 400 || path.includes('..') || path.includes('\\')) return false;
  const prefix = scopePrefix(workspaceId, scope, scopeId);
  return path.startsWith(prefix) && !path.slice(prefix.length).includes('/') && path.length > prefix.length;
}

/** A display file name: trimmed, no control characters or slashes, ≤200. */
export function cleanFileName(raw: unknown): string {
  const s = typeof raw === 'string' ? raw.replace(/[\u0000-\u001f\u007f/\\]/g, '').trim() : '';
  return (s || 'file').slice(0, 200);
}

export interface CreateInput {
  tourId: string;
  fileId: string | null;
  folder: string | null;
  access: ShareAccess;
  expiresAt: string | null;
  password: string | null;
  label: string | null;
}

/** Validate the owner's "create link" form. */
export function parseCreate(body: unknown, now: Date = new Date()): { ok: true; value: CreateInput } | { ok: false; error: string } {
  const b = (body && typeof body === 'object' ? body : {}) as Record<string, unknown>;
  const tourId = typeof b.tourId === 'string' ? b.tourId : '';
  if (!tourId) return { ok: false, error: 'tourId is required' };
  const fileId = typeof b.fileId === 'string' && b.fileId ? b.fileId : null;
  const folder = b.folder === undefined || b.folder === null ? null : sanitizeFolder(b.folder);
  if (b.folder !== undefined && b.folder !== null && !folder) return { ok: false, error: 'That folder name isn’t valid' };
  if ((fileId ? 1 : 0) + (folder ? 1 : 0) !== 1) return { ok: false, error: 'Share either one file or one folder' };
  if (b.access !== 'view' && b.access !== 'edit') return { ok: false, error: 'Access must be view or edit' };
  let expiresAt: string | null = null;
  if (b.expiresAt !== undefined && b.expiresAt !== null && b.expiresAt !== '') {
    const t = typeof b.expiresAt === 'string' ? Date.parse(b.expiresAt) : NaN;
    if (!Number.isFinite(t)) return { ok: false, error: 'That expiry date isn’t valid' };
    if (t <= now.getTime()) return { ok: false, error: 'The expiry date is in the past' };
    if (t > now.getTime() + SHARE_MAX_EXPIRY_DAYS * 86_400_000) return { ok: false, error: 'Expiry can be at most two years away' };
    expiresAt = new Date(t).toISOString();
  }
  let password: string | null = null;
  if (typeof b.password === 'string' && b.password !== '') {
    if (b.password.length < 4) return { ok: false, error: 'Use a password of at least 4 characters' };
    if (b.password.length > 200) return { ok: false, error: 'That password is too long' };
    password = b.password;
  }
  const label = typeof b.label === 'string' && b.label.trim() ? b.label.trim().slice(0, 80) : null;
  return { ok: true, value: { tourId, fileId, folder, access: b.access, expiresAt, password, label } };
}

/* ── Versions ────────────────────────────────────────────────────────────── */

export interface FileVersion {
  path: string;
  name: string;
  size: number;
  type: string;
  replaced_at: string;
  replaced_by: string | null;
}

/** metadata after a new version: the old object goes to the front of
 *  metadata.versions (newest first, at most 20 kept on record). */
export function withPreviousVersion(metadata: unknown, prev: FileVersion): Record<string, unknown> {
  const m = (metadata && typeof metadata === 'object' && !Array.isArray(metadata) ? { ...(metadata as Record<string, unknown>) } : {}) as Record<string, unknown>;
  const list = Array.isArray(m.versions) ? (m.versions as FileVersion[]) : [];
  m.versions = [prev, ...list].slice(0, 20);
  return m;
}

export function versionCount(metadata: unknown): number {
  const m = metadata as { versions?: unknown } | null;
  return Array.isArray(m?.versions) ? m!.versions.length : 0;
}

/** "1.2 MB" — for the share dialog and the public page. */
export function formatBytes(n: number | null | undefined): string {
  if (!n || n < 0) return '0 KB';
  if (n < 1024 * 1024) return `${Math.max(1, Math.round(n / 1024))} KB`;
  return `${(n / (1024 * 1024)).toFixed(n < 10 * 1024 * 1024 ? 1 : 0)} MB`;
}

/** A date input's "YYYY-MM-DD" → the end of that day in the viewer's time zone, as ISO. */
export function endOfDayIso(date: string): string | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return null;
  const d = new Date(`${date}T23:59:59`);
  return Number.isFinite(d.getTime()) ? d.toISOString() : null;
}
