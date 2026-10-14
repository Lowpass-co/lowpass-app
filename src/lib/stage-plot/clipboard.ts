/* ============================================
   LOWPASS — stage plot copy / cut / paste (Oct 2026)

   Pure helpers behind ⌘C / ⌘X / ⌘V (and ⌘D duplicate) in the editor.

   - The clipboard carries JSON with a marker, so a paste works across tabs
     and across plots (the system clipboard), and anything else on the
     clipboard is ignored rather than misread as items.
   - A pasted copy is a NEW item: new id, new group id per copied group (so
     a pasted kit piece never rejoins the original kit), offset so it lands
     visibly next to the original, and with NO channel links — the same
     channel linked to two items by accident is worse than relinking once.
   - Untrusted on the way in: anything that isn't a well-formed item is
     dropped, and at most MAX_PASTE items are taken.
   ============================================ */

import type { EditorItem } from './editor-types';

export const CLIP_MARKER = 'lowpass/stage-plot-items@1';
export const MAX_PASTE = 500;

interface ClipPayload {
  kind: typeof CLIP_MARKER;
  items: EditorItem[];
}

export function serializeClip(items: EditorItem[]): string {
  const payload: ClipPayload = { kind: CLIP_MARKER, items };
  return JSON.stringify(payload);
}

const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);

/** Clipboard text → items, or null when it isn't ours / is malformed. */
export function parseClip(text: string | null | undefined): EditorItem[] | null {
  if (!text || !text.includes(CLIP_MARKER)) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return null;
  }
  if (!parsed || typeof parsed !== 'object' || (parsed as ClipPayload).kind !== CLIP_MARKER) return null;
  const raw = (parsed as ClipPayload).items;
  if (!Array.isArray(raw)) return null;
  const items = raw
    .filter((it): it is EditorItem => Boolean(it) && typeof it === 'object' && typeof (it as EditorItem).iconName === 'string' && isNum((it as EditorItem).xFt) && isNum((it as EditorItem).yFt))
    .slice(0, MAX_PASTE);
  return items.length ? items : null;
}

/** Fresh copies of `items`, shifted by `offsetFt` on both axes. */
export function cloneForPaste(items: EditorItem[], offsetFt: number, newId: () => string): EditorItem[] {
  const groupMap = new Map<string, string>();
  const shift = (n: number | undefined) => (n === undefined ? undefined : +(n + offsetFt).toFixed(2));
  return items.map((src) => {
    const { channelRowIds: _links, ...rest } = src;
    void _links;
    const copy: EditorItem = {
      ...rest,
      id: newId(),
      xFt: +(src.xFt + offsetFt).toFixed(2),
      yFt: +(src.yFt + offsetFt).toFixed(2),
    };
    if (src.kind === 'arrow') {
      copy.x2Ft = shift(src.x2Ft);
      copy.y2Ft = shift(src.y2Ft);
    }
    if (src.groupId) {
      if (!groupMap.has(src.groupId)) groupMap.set(src.groupId, newId());
      copy.groupId = groupMap.get(src.groupId);
    }
    return copy;
  });
}
