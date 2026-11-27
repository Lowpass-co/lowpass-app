/* ============================================
   LOWPASS — Advance: upload questions (Nov 2026, Adam: lighting patch —
   "upload button for sure")

   A `file` question's answer is a list of files the TM or the venue uploaded:
     [{ path, name, size, type }]
   The bytes live in tour-files at a path THE SERVER chose, inside the show's
   own folder:  advance-files/<workspace>/<tour>/<show>/<uuid>.<ext>
   so a stored answer can only ever point inside that show. Every read signs
   only paths that pass `fileBelongs` — a forged path in a venue's answer is
   dropped, never signed. Pure.
   ============================================ */

export const ADVANCE_FILE_BUCKET = 'tour-files';
export const ADVANCE_FILE_MAX_BYTES = 25 * 1024 * 1024;
export const ADVANCE_FILES_PER_QUESTION = 5;

const TYPES: Record<string, string> = {
  'application/pdf': 'pdf',
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/webp': 'webp',
  'image/gif': 'gif',
};

export const ADVANCE_FILE_ACCEPT = 'application/pdf,image/png,image/jpeg,image/webp,image/gif';

export function isAdvanceFileType(t: unknown): t is string {
  return typeof t === 'string' && t in TYPES;
}

export interface FileAnswer {
  path: string;
  name: string;
  size: number;
  type: string;
}

const UUID = '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}';

export function showFolder(ws: string, tourId: string, routingId: string): string {
  return `advance-files/${ws}/${tourId}/${routingId}/`;
}

export function advanceFilePath(ws: string, tourId: string, routingId: string, uuid: string, type: string): string {
  return `${showFolder(ws, tourId, routingId)}${uuid}.${TYPES[type] ?? 'bin'}`;
}

/** Is `path` one of THIS show's upload paths (exact shape — no `..`, no
 *  sub-folders, an id we minted)? */
export function fileBelongs(path: unknown, ws: string, tourId: string, routingId: string): path is string {
  if (typeof path !== 'string') return false;
  const prefix = showFolder(ws, tourId, routingId);
  if (!path.startsWith(prefix)) return false;
  return new RegExp(`^${UUID}\\.(pdf|png|jpg|webp|gif)$`, 'i').test(path.slice(prefix.length));
}

const cleanName = (v: unknown): string =>
  typeof v === 'string' && v.trim() ? v.replace(/[\u0000-\u001f]/g, '').trim().slice(0, 160) : 'File';

/** A stored answer → the files that really belong to this show (bad ones
 *  dropped, at most ADVANCE_FILES_PER_QUESTION). */
export function parseFileAnswer(raw: unknown, ws: string, tourId: string, routingId: string): FileAnswer[] {
  const list = Array.isArray(raw) ? raw : raw && typeof raw === 'object' ? [raw] : [];
  const out: FileAnswer[] = [];
  const seen = new Set<string>();
  for (const x of list) {
    const r = (x && typeof x === 'object' ? x : {}) as Record<string, unknown>;
    if (!fileBelongs(r.path, ws, tourId, routingId) || seen.has(r.path)) continue;
    seen.add(r.path);
    out.push({
      path: r.path,
      name: cleanName(r.name),
      size: typeof r.size === 'number' && r.size >= 0 ? Math.round(r.size) : 0,
      type: isAdvanceFileType(r.type) ? r.type : 'application/octet-stream',
    });
    if (out.length >= ADVANCE_FILES_PER_QUESTION) break;
  }
  return out;
}

/** Every file path anywhere in a day's answers, for the given file
 *  questions (`{ sectionId: [fieldId…] }`). */
export function filePathsIn(data: Record<string, Record<string, unknown>> | null | undefined, fileFields: Record<string, string[]>, ws: string, tourId: string, routingId: string): string[] {
  const out: string[] = [];
  for (const [sid, fids] of Object.entries(fileFields)) {
    for (const fid of fids) for (const f of parseFileAnswer(data?.[sid]?.[fid], ws, tourId, routingId)) out.push(f.path);
  }
  return out;
}

export function fileSizeLabel(n: number): string {
  if (n >= 1024 * 1024) return `${(n / 1024 / 1024).toFixed(1)} MB`;
  if (n >= 1024) return `${Math.round(n / 1024)} KB`;
  return `${n} B`;
}

/** A batch of answers with every upload-question value cleaned to files that
 *  belong to this show (others dropped). Non-file answers pass untouched. */
export function cleanFileChanges<T extends Record<string, Record<string, unknown>>>(
  sections: ReadonlyArray<{ template_id: string; fields?: ReadonlyArray<{ id: string; type: string }> }>,
  changes: T,
  show: { ws: string; tourId: string; routingId: string },
): T {
  const fileFields = new Map<string, Set<string>>();
  for (const s of sections) {
    const ids = (s.fields ?? []).filter((f) => f.type === 'file').map((f) => f.id);
    if (ids.length) fileFields.set(s.template_id, new Set(ids));
  }
  if (!fileFields.size) return changes;
  const out: Record<string, Record<string, unknown>> = {};
  for (const [sid, fields] of Object.entries(changes ?? {})) {
    const files = fileFields.get(sid);
    out[sid] = {};
    for (const [fid, v] of Object.entries(fields ?? {})) {
      out[sid][fid] = files?.has(fid) ? parseFileAnswer(v, show.ws, show.tourId, show.routingId) : v;
    }
  }
  return out as T;
}
