/* ============================================
   LOWPASS — File & folder share links: the server (Nov 2026, Adam)

   Two sides, one rule set (src/lib/files/shareLinks.ts):

   PUBLIC (no session) — called by /api/public/file-link/[token]/* with the
   SERVICE-ROLE client, so every scope check below is the only lock:
     openLink        token → live link (+ password), or why not
     linkContents    what the holder sees (files + subfolders, relative)
     fileInLink      THE scope check: is this file inside this link?
     downloadUrl     60-second signed URL that forces a download
     uploadViaLink   edit links only: new file into the folder, or a new
                     version of a file (old object kept, metadata.versions)

   OWNER (session client, RLS) — called by /api/file-share-links:
     createLink, listLinks, revokeLink, repointFolderLinks, versionUrl

   Storage goes through ShareStorage so this file never names a bucket and the
   tests can watch what was uploaded and removed.
   ============================================ */

import type { SupabaseClient } from '@supabase/supabase-js';
import { generateToken, hashPassword, verifyPassword } from '@/lib/rider-packs/web-links';
import {
  SHARE_DOWNLOAD_SECONDS,
  SHARE_MAX_BYTES,
  SHARE_UPLOADS_PER_HOUR,
  can,
  cleanActorName,
  cleanFileName,
  inFolder,
  linkState,
  relativeFolder,
  repointFolder,
  storagePath,
  uploadFolder,
  versionCount,
  withPreviousVersion,
  type CreateInput,
  type ShareLinkRow,
} from '@/lib/files/shareLinks';

/** The bucket every tour upload lives in (/api/files). Files stored anywhere
 *  else (old Google Drive references) can be listed but not served. */
export const SHARE_BUCKET = 'tour-files';

export interface ShareStorage {
  upload(path: string, body: Uint8Array, contentType: string): Promise<{ error: string | null }>;
  remove(path: string): Promise<void>;
  signedDownloadUrl(path: string, seconds: number, fileName: string): Promise<string | null>;
}

export function supabaseShareStorage(client: SupabaseClient): ShareStorage {
  const b = () => client.storage.from(SHARE_BUCKET);
  return {
    async upload(path, body, contentType) {
      const { error } = await b().upload(path, body, { contentType: contentType || 'application/octet-stream', upsert: false });
      return { error: error ? error.message : null };
    },
    async remove(path) {
      await b().remove([path]);
    },
    async signedDownloadUrl(path, seconds, fileName) {
      // `download` sets Content-Disposition: attachment — an uploaded HTML/SVG
      // is saved, never rendered.
      const { data } = await b().createSignedUrl(path, seconds, { download: fileName });
      return data?.signedUrl ?? null;
    },
  };
}

export class ShareError extends Error {
  constructor(public status: number, public code: string, message: string) {
    super(message);
  }
}

interface FileRow {
  id: string;
  workspace_id: string;
  file_name: string;
  file_type: string;
  file_size: number;
  storage_provider: string;
  provider_file_id: string;
  linked_to_type: string;
  linked_to_id: string | null;
  metadata: Record<string, unknown> | null;
  created_at: string;
}

const FILE_COLS = 'id, workspace_id, file_name, file_type, file_size, storage_provider, provider_file_id, linked_to_type, linked_to_id, metadata, created_at';
const TOKEN_RE = /^[A-Za-z0-9_-]{16,64}$/;

const folderOf = (f: Pick<FileRow, 'metadata'>): string | null => {
  const v = f.metadata?.folder;
  return typeof v === 'string' && v ? v : null;
};

/* ════════════════════════════ PUBLIC ════════════════════════════ */

/** Token (+ password) → the live link. Throws ShareError with the reason. */
export async function openLink(client: SupabaseClient, token: string, password: string | null, now = new Date()): Promise<ShareLinkRow> {
  if (!TOKEN_RE.test(token)) throw new ShareError(404, 'not_found', 'This link doesn’t exist.');
  const { data, error } = await client.from('file_share_links').select('*').eq('token', token).maybeSingle();
  if (error) throw new ShareError(500, 'error', 'Couldn’t open this link.');
  const link = data as ShareLinkRow | null;
  if (!link) throw new ShareError(404, 'not_found', 'This link doesn’t exist.');
  const state = linkState(link, now);
  if (state === 'revoked') throw new ShareError(410, 'revoked', 'This link has been turned off.');
  if (state === 'expired') throw new ShareError(410, 'expired', 'This link has expired.');
  if (link.password_hash) {
    if (!password) throw new ShareError(401, 'password_required', 'This link needs a password.');
    if (!(await verifyPassword(password, link.password_hash))) throw new ShareError(401, 'invalid_password', 'That password isn’t right.');
  }
  return link;
}

/** Is the file inside the link? The ONLY gate between a token and a file. */
export async function fileInLink(client: SupabaseClient, link: ShareLinkRow, fileId: string): Promise<FileRow | null> {
  if (typeof fileId !== 'string' || !fileId) return null;
  if (link.target_kind === 'file' && fileId !== link.file_id) return null;
  const { data } = await client.from('file_references').select(FILE_COLS).eq('id', fileId).eq('workspace_id', link.workspace_id).maybeSingle();
  const f = data as FileRow | null;
  if (!f) return null;
  if (link.target_kind === 'folder') {
    return f.linked_to_type === 'tour' && f.linked_to_id === link.tour_id && inFolder(link.folder_path!, folderOf(f)) ? f : null;
  }
  // A single file may live on the tour or on one of its shows.
  if (f.linked_to_type === 'tour') return f.linked_to_id === link.tour_id ? f : null;
  if (f.linked_to_type === 'routing' && f.linked_to_id) {
    const { data: r } = await client.from('routing').select('tour_id').eq('id', f.linked_to_id).maybeSingle();
    return (r as { tour_id?: string } | null)?.tour_id === link.tour_id ? f : null;
  }
  return null;
}

export interface SharedFile {
  id: string;
  name: string;
  size: number;
  type: string;
  /** Folder relative to the shared folder ('' = top level). Always '' for a file link. */
  folder: string;
  addedAt: string;
  versions: number;
  /** False for old references not stored in Lowpass (they can't be downloaded here). */
  available: boolean;
}

export interface LinkContents {
  kind: 'file' | 'folder';
  access: 'view' | 'edit';
  title: string;
  tourName: string | null;
  artistName: string | null;
  expiresAt: string | null;
  files: SharedFile[];
  /** Every subfolder (relative), so empty-looking levels still navigate. */
  folders: string[];
  /** The shared file was deleted. */
  gone: boolean;
}

const toShared = (f: FileRow, folder: string): SharedFile => ({
  id: f.id,
  name: f.file_name,
  size: f.file_size,
  type: f.file_type,
  folder,
  addedAt: f.created_at,
  versions: versionCount(f.metadata),
  available: f.storage_provider === SHARE_BUCKET && !!f.provider_file_id,
});

export async function linkContents(client: SupabaseClient, link: ShareLinkRow, now = new Date()): Promise<LinkContents> {
  const { data: tour } = await client.from('tours').select('name, artist_id').eq('id', link.tour_id).maybeSingle();
  const t = tour as { name?: string; artist_id?: string | null } | null;
  let artistName: string | null = null;
  if (t?.artist_id) {
    const { data: a } = await client.from('artists').select('name').eq('id', t.artist_id).maybeSingle();
    artistName = (a as { name?: string } | null)?.name ?? null;
  }
  const base = { kind: link.target_kind, access: link.access, tourName: t?.name ?? null, artistName, expiresAt: link.expires_at };

  // When the link was last opened — best effort, but awaited (serverless may
  // drop un-awaited work when the response ends).
  try {
    await client.from('file_share_links').update({ last_viewed_at: now.toISOString() }).eq('id', link.id);
  } catch {
    /* a missed stamp never blocks the person opening the link */
  }

  if (link.target_kind === 'file') {
    const f = await fileInLink(client, link, link.file_id!);
    return { ...base, title: f?.file_name ?? 'File', files: f ? [toShared(f, '')] : [], folders: [], gone: !f };
  }

  const root = link.folder_path!;
  const { data } = await client
    .from('file_references')
    .select(FILE_COLS)
    .eq('workspace_id', link.workspace_id)
    .eq('linked_to_type', 'tour')
    .eq('linked_to_id', link.tour_id);
  const files: SharedFile[] = [];
  const folders = new Set<string>();
  for (const f of (data ?? []) as FileRow[]) {
    const ff = folderOf(f);
    if (!inFolder(root, ff)) continue;
    const rel = relativeFolder(root, ff!);
    files.push(toShared(f, rel));
    if (rel) rel.split('/').forEach((_, i, parts) => folders.add(parts.slice(0, i + 1).join('/')));
  }
  files.sort((a, b) => a.name.localeCompare(b.name));
  const title = root.split('/').pop() ?? root;
  return { ...base, title, files, folders: [...folders].sort(), gone: false };
}

async function logEvent(
  client: SupabaseClient,
  link: ShareLinkRow,
  e: { action: 'download' | 'upload' | 'new_version'; fileId: string | null; actor: string | null; fileName: string | null; bytes?: number | null; previousPath?: string | null; previousName?: string | null },
): Promise<void> {
  const { error } = await client.from('file_share_events').insert({
    link_id: link.id,
    workspace_id: link.workspace_id,
    tour_id: link.tour_id,
    file_id: e.fileId,
    action: e.action,
    actor_name: e.actor,
    file_name: e.fileName,
    bytes: e.bytes ?? null,
    previous_path: e.previousPath ?? null,
    previous_name: e.previousName ?? null,
  });
  // The new_version log is the owner's way back to the old file — don't lose it quietly.
  if (error && e.action === 'new_version') throw new ShareError(500, 'error', 'The new version saved, but its history didn’t. Tell the person who shared this.');
}

export async function downloadUrl(client: SupabaseClient, storage: ShareStorage, link: ShareLinkRow, fileId: string, actor: string | null): Promise<string> {
  if (!can(link, 'download')) throw new ShareError(410, 'gone', 'This link is no longer active.');
  const f = await fileInLink(client, link, fileId);
  if (!f) throw new ShareError(404, 'not_found', 'That file isn’t in this link.');
  if (f.storage_provider !== SHARE_BUCKET || !f.provider_file_id) throw new ShareError(409, 'unavailable', 'This file isn’t stored in Lowpass, so it can’t be downloaded here.');
  const url = await storage.signedDownloadUrl(f.provider_file_id, SHARE_DOWNLOAD_SECONDS, f.file_name);
  if (!url) throw new ShareError(500, 'error', 'Couldn’t prepare the download.');
  await logEvent(client, link, { action: 'download', fileId: f.id, actor: cleanActorName(actor), fileName: f.file_name, bytes: f.file_size });
  return url;
}

export interface UploadInput {
  fileName: string;
  contentType: string;
  bytes: Uint8Array;
  actor: unknown;
  /** Folder inside the shared folder (folder links). */
  folder?: unknown;
  /** Upload as a new version of this file instead of a new file. */
  replaceFileId?: string | null;
}

export async function uploadViaLink(
  client: SupabaseClient,
  storage: ShareStorage,
  link: ShareLinkRow,
  input: UploadInput,
  now = new Date(),
): Promise<{ file: SharedFile; action: 'upload' | 'new_version' }> {
  const replacing = !!input.replaceFileId;
  if (!can(link, replacing ? 'new_version' : 'upload', now)) throw new ShareError(403, 'view_only', 'This link is view-only.');
  if (!replacing && link.target_kind !== 'folder') throw new ShareError(400, 'bad_request', 'A file link can only take a new version of that file.');
  const actor = cleanActorName(input.actor);
  if (!actor) throw new ShareError(400, 'name_required', 'Add your name so they know who sent it.');
  if (input.bytes.byteLength === 0) throw new ShareError(400, 'empty', 'That file is empty.');
  if (input.bytes.byteLength > SHARE_MAX_BYTES) throw new ShareError(413, 'too_large', 'That file is over 25MB.');

  // Quota from the log, so it holds across server instances.
  const since = new Date(now.getTime() - 3_600_000).toISOString();
  const { count, error: qErr } = await client
    .from('file_share_events')
    .select('id', { count: 'exact', head: true })
    .eq('link_id', link.id)
    .in('action', ['upload', 'new_version'])
    .gte('created_at', since);
  if (qErr) throw new ShareError(500, 'error', 'Couldn’t check this link’s upload limit.');
  if ((count ?? 0) >= SHARE_UPLOADS_PER_HOUR) throw new ShareError(429, 'rate_limited', 'Too many uploads through this link in the last hour. Try again later.');

  const name = cleanFileName(input.fileName);
  const path = storagePath(link.workspace_id, link.tour_id, name, now.getTime());
  const type = input.contentType || 'application/octet-stream';

  if (replacing) {
    const f = await fileInLink(client, link, input.replaceFileId!);
    if (!f) throw new ShareError(404, 'not_found', 'That file isn’t in this link.');
    if (f.storage_provider !== SHARE_BUCKET) throw new ShareError(409, 'unavailable', 'This file isn’t stored in Lowpass, so it can’t take a new version here.');
    const up = await storage.upload(path, input.bytes, type);
    if (up.error) throw new ShareError(500, 'error', 'Upload failed. Try again.');
    const metadata = withPreviousVersion(f.metadata, {
      path: f.provider_file_id,
      name: f.file_name,
      size: f.file_size,
      type: f.file_type,
      replaced_at: now.toISOString(),
      replaced_by: actor,
    });
    // Only if nobody replaced it since we read it — otherwise their version would vanish from history.
    const { data: hit, error } = await client
      .from('file_references')
      .update({ provider_file_id: path, file_size: input.bytes.byteLength, file_type: type, metadata })
      .eq('id', f.id)
      .eq('provider_file_id', f.provider_file_id)
      .select('id');
    if (error || !hit || (hit as unknown[]).length !== 1) {
      await storage.remove(path);
      if (error) throw new ShareError(500, 'error', 'Couldn’t save the new version.');
      throw new ShareError(409, 'conflict', 'Someone just replaced this file. Refresh and try again.');
    }
    await logEvent(client, link, { action: 'new_version', fileId: f.id, actor, fileName: name, bytes: input.bytes.byteLength, previousPath: f.provider_file_id, previousName: f.file_name });
    const after: FileRow = { ...f, provider_file_id: path, file_size: input.bytes.byteLength, file_type: type, metadata };
    return { action: 'new_version', file: toShared(after, link.target_kind === 'folder' ? relativeFolder(link.folder_path!, folderOf(f)!) : '') };
  }

  const folder = uploadFolder(link.folder_path!, input.folder);
  const up = await storage.upload(path, input.bytes, type);
  if (up.error) throw new ShareError(500, 'error', 'Upload failed. Try again.');
  const { data: row, error } = await client
    .from('file_references')
    .insert({
      workspace_id: link.workspace_id,
      file_name: name,
      file_type: type,
      file_size: input.bytes.byteLength,
      storage_provider: SHARE_BUCKET,
      provider_file_id: path,
      linked_to_type: 'tour',
      linked_to_id: link.tour_id,
      metadata: { folder, uploaded_via_link: { link_id: link.id, by: actor } },
    })
    .select(FILE_COLS)
    .single();
  if (error || !row) {
    await storage.remove(path);
    throw new ShareError(500, 'error', 'Couldn’t save the upload.');
  }
  const f = row as FileRow;
  await logEvent(client, link, { action: 'upload', fileId: f.id, actor, fileName: name, bytes: input.bytes.byteLength });
  return { action: 'upload', file: toShared(f, relativeFolder(link.folder_path!, folder)) };
}

/* ════════════════════════════ OWNER ════════════════════════════ */

export interface OwnerLink {
  id: string;
  kind: 'file' | 'folder';
  fileId: string | null;
  folder: string | null;
  access: 'view' | 'edit';
  token: string;
  label: string | null;
  hasPassword: boolean;
  expiresAt: string | null;
  createdAt: string;
  revokedAt: string | null;
  lastViewedAt: string | null;
}

export interface OwnerEvent {
  id: string;
  linkId: string;
  action: 'download' | 'upload' | 'new_version';
  actor: string | null;
  fileName: string | null;
  previousName: string | null;
  hasPrevious: boolean;
  at: string;
}

const toOwner = (l: ShareLinkRow): OwnerLink => ({
  id: l.id,
  kind: l.target_kind,
  fileId: l.file_id,
  folder: l.folder_path,
  access: l.access,
  token: l.token,
  label: l.label,
  hasPassword: !!l.password_hash,
  expiresAt: l.expires_at,
  createdAt: l.created_at,
  revokedAt: l.revoked_at,
  lastViewedAt: l.last_viewed_at,
});

/** The tour is in the caller's workspace, and the file (if any) is on it. */
async function assertTarget(client: SupabaseClient, workspaceId: string, input: Pick<CreateInput, 'tourId' | 'fileId'>): Promise<void> {
  const { data: tour } = await client.from('tours').select('id').eq('id', input.tourId).eq('workspace_id', workspaceId).maybeSingle();
  if (!tour) throw new ShareError(404, 'not_found', 'Tour not found.');
  if (!input.fileId) return;
  const probe = { id: '', workspace_id: workspaceId, tour_id: input.tourId, target_kind: 'file', file_id: input.fileId } as ShareLinkRow;
  if (!(await fileInLink(client, probe, input.fileId))) throw new ShareError(404, 'not_found', 'That file isn’t on this tour.');
}

export async function createLink(client: SupabaseClient, args: { workspaceId: string; userId: string; input: CreateInput }): Promise<OwnerLink> {
  const { workspaceId, userId, input } = args;
  await assertTarget(client, workspaceId, input);
  const { data, error } = await client
    .from('file_share_links')
    .insert({
      workspace_id: workspaceId,
      tour_id: input.tourId,
      target_kind: input.fileId ? 'file' : 'folder',
      file_id: input.fileId,
      folder_path: input.fileId ? null : input.folder,
      access: input.access,
      token: generateToken(),
      password_hash: input.password ? await hashPassword(input.password) : null,
      expires_at: input.expiresAt,
      label: input.label,
      created_by: userId,
    })
    .select('*')
    .single();
  if (error || !data) throw new ShareError(500, 'error', error?.message ?? 'Couldn’t create the link.');
  return toOwner(data as ShareLinkRow);
}

export async function listLinks(
  client: SupabaseClient,
  args: { workspaceId: string; tourId: string; fileId?: string | null; folder?: string | null },
): Promise<{ links: OwnerLink[]; events: OwnerEvent[] }> {
  let q = client.from('file_share_links').select('*').eq('workspace_id', args.workspaceId).eq('tour_id', args.tourId);
  if (args.fileId) q = q.eq('file_id', args.fileId);
  else if (args.folder) q = q.eq('folder_path', args.folder);
  const { data, error } = await q.order('created_at', { ascending: false });
  if (error) throw new ShareError(500, 'error', error.message);
  const links = ((data ?? []) as ShareLinkRow[]).map(toOwner);
  if (links.length === 0) return { links, events: [] };
  const { data: ev, error: eErr } = await client
    .from('file_share_events')
    .select('id, link_id, action, actor_name, file_name, previous_name, previous_path, created_at')
    .in('link_id', links.map((l) => l.id))
    .order('created_at', { ascending: false })
    .limit(40);
  if (eErr) throw new ShareError(500, 'error', eErr.message);
  const events = ((ev ?? []) as Array<Record<string, string | null>>).map((e) => ({
    id: e.id!,
    linkId: e.link_id!,
    action: e.action as OwnerEvent['action'],
    actor: e.actor_name,
    fileName: e.file_name,
    previousName: e.previous_name,
    hasPrevious: !!e.previous_path,
    at: e.created_at!,
  }));
  return { links, events };
}

export async function revokeLink(client: SupabaseClient, args: { workspaceId: string; id: string; now?: Date }): Promise<void> {
  const { data, error } = await client
    .from('file_share_links')
    .update({ revoked_at: (args.now ?? new Date()).toISOString() })
    .eq('id', args.id)
    .eq('workspace_id', args.workspaceId)
    .is('revoked_at', null)
    .select('id');
  if (error) throw new ShareError(500, 'error', error.message);
  if (!data || (data as unknown[]).length === 0) throw new ShareError(404, 'not_found', 'Link not found, or already off.');
}

/** A folder was renamed on the canvas: move its links (and its subfolders' links) with it. */
export async function repointFolderLinks(
  client: SupabaseClient,
  args: { workspaceId: string; tourId: string; from: string; to: string },
): Promise<number> {
  const { data, error } = await client
    .from('file_share_links')
    .select('id, folder_path')
    .eq('workspace_id', args.workspaceId)
    .eq('tour_id', args.tourId)
    .eq('target_kind', 'folder');
  if (error) throw new ShareError(500, 'error', error.message);
  let moved = 0;
  for (const l of (data ?? []) as Array<{ id: string; folder_path: string }>) {
    const next = repointFolder(l.folder_path, args.from, args.to);
    if (!next || next === l.folder_path) continue;
    const { error: uErr } = await client.from('file_share_links').update({ folder_path: next }).eq('id', l.id).eq('workspace_id', args.workspaceId);
    if (uErr) throw new ShareError(500, 'error', uErr.message);
    moved += 1;
  }
  return moved;
}

/** The owner downloads a version that a link replaced. */
export async function previousVersionUrl(client: SupabaseClient, storage: ShareStorage, args: { workspaceId: string; eventId: string }): Promise<string> {
  const { data } = await client
    .from('file_share_events')
    .select('previous_path, previous_name')
    .eq('id', args.eventId)
    .eq('workspace_id', args.workspaceId)
    .maybeSingle();
  const e = data as { previous_path: string | null; previous_name: string | null } | null;
  if (!e?.previous_path) throw new ShareError(404, 'not_found', 'No earlier version on record.');
  const url = await storage.signedDownloadUrl(e.previous_path, SHARE_DOWNLOAD_SECONDS, e.previous_name ?? 'previous-version');
  if (!url) throw new ShareError(500, 'error', 'Couldn’t prepare the download.');
  return url;
}
