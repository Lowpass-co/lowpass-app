/* ============================================
   LOWPASS — Riders: snapshots — pure

   What Publish freezes and what every reader (promoter page, PDF, diff)
   reads. `parseSnapshot` runs a stored snapshot back through the content
   gate, so an old or hand-edited row can never render something the
   renderers don't know.
   ============================================ */

import { isBlockKind, parseContent, parseDates } from './blocks';
import { byPosition } from './position';
import {
  RIDER_DEFAULT_TITLE,
  RIDER_KINDS,
  type ResolvedAttachment,
  type RiderBlock,
  type RiderKind,
  type RiderSnapshot,
  type SnapBlock,
  type SnapDoc,
} from './types';

export function toSnapDoc(rider: { kind: RiderKind; title: string }, blocks: readonly RiderBlock[]): SnapDoc {
  return {
    kind: rider.kind,
    title: rider.title.trim() || RIDER_DEFAULT_TITLE[rider.kind],
    blocks: [...blocks].sort(byPosition).map((b) => ({ id: b.id, kind: b.kind, content: b.content, from: b.from, until: b.until }) as SnapBlock),
  };
}

export function buildSnapshot(input: {
  tourName: string;
  artistName: string | null;
  party: number | null;
  docs: readonly SnapDoc[];
  attachments: readonly ResolvedAttachment[];
}): RiderSnapshot {
  const docs = RIDER_KINDS.flatMap((k) => input.docs.filter((d) => d.kind === k));
  return { v: 1, tourName: input.tourName, artistName: input.artistName, party: input.party, docs, attachments: [...input.attachments] };
}

export function parseSnapshot(raw: unknown): RiderSnapshot {
  const r = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  const docs: SnapDoc[] = [];
  for (const d of Array.isArray(r.docs) ? r.docs : []) {
    const x = (d && typeof d === 'object' ? d : {}) as Record<string, unknown>;
    const kind = RIDER_KINDS.find((k) => k === x.kind);
    if (!kind || docs.some((y) => y.kind === kind)) continue;
    const blocks: SnapBlock[] = [];
    for (const b of Array.isArray(x.blocks) ? x.blocks : []) {
      const y = (b && typeof b === 'object' ? b : {}) as Record<string, unknown>;
      if (!isBlockKind(y.kind) || typeof y.id !== 'string') continue;
      const dates = parseDates(y.from, y.until);
      blocks.push({ id: y.id, kind: y.kind, content: parseContent(y.kind, y.content), from: dates.from, until: dates.until } as SnapBlock);
    }
    docs.push({ kind, title: typeof x.title === 'string' && x.title.trim() ? x.title.slice(0, 200) : RIDER_DEFAULT_TITLE[kind], blocks });
  }
  const attachments: ResolvedAttachment[] = [];
  for (const a of Array.isArray(r.attachments) ? r.attachments : []) {
    const x = (a && typeof a === 'object' ? a : {}) as Record<string, unknown>;
    if (x.kind !== 'channel_list' && x.kind !== 'stage_plot' && x.kind !== 'file') continue;
    attachments.push({ kind: x.kind, id: typeof x.id === 'string' ? x.id : null, label: typeof x.label === 'string' ? x.label.slice(0, 200) : 'Attachment' });
  }
  const party = typeof r.party === 'number' && r.party > 0 ? Math.floor(r.party) : null;
  return {
    v: 1,
    tourName: typeof r.tourName === 'string' ? r.tourName : '',
    artistName: typeof r.artistName === 'string' ? r.artistName : null,
    party,
    docs,
    attachments,
  };
}

/** Which attachments the documents ask for (to resolve at publish). */
export function attachmentsWanted(docs: readonly SnapDoc[]): { channelList: boolean; stagePlot: boolean; fileIds: string[] } {
  let channelList = false;
  let stagePlot = false;
  const fileIds = new Set<string>();
  for (const d of docs)
    for (const b of d.blocks)
      if (b.kind === 'files')
        for (const it of b.content.items) {
          if (it.kind === 'channel_list') channelList = true;
          else if (it.kind === 'stage_plot') stagePlot = true;
          else fileIds.add(it.id);
        }
  return { channelList, stagePlot, fileIds: [...fileIds] };
}
