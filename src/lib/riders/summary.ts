/* ============================================
   LOWPASS — Riders: advance summary, versions, what changed — pure

   The summary is BUILT from the request lines ticked "In summary" (both
   documents), grouped under their section headings — never typed — so it
   can't drift from the detail (Adam's Satellite '26 riders said 20 towels in
   the summary and 10 in the hospitality rider).

   What changed is a diff of two snapshots by block id. A show is "affected"
   by a version when the blocks in force on its date differ.
   ============================================ */

import { blockLabel, dateTag, inForce, providerShort, requestLine } from './blocks';
import { diffEmbeds, embedKey, usesEmbed } from './embeds';
import { proseText } from './prose';
import type {
  BlockContentMap,
  RequestContent,
  RiderChange,
  RiderEmbeds,
  RiderKind,
  RiderSnapshot,
  SnapBlock,
  SnapDoc,
  VersionNo,
} from './types';

/** What a diff / "which shows changed" compares: the documents, the party
 *  and (when the documents show them) the embedded input list / stage plot. */
type Comparable = Pick<RiderSnapshot, 'docs' | 'party'> & { embeds?: RiderEmbeds | null };

/* ---------- summary ---------- */

export interface SummaryGroup {
  heading: string;
  lines: string[];
}

export function buildSummary(docs: readonly SnapDoc[], party: number | null, date: string | null = null): SummaryGroup[] {
  const groups: SummaryGroup[] = [];
  const groupFor = (heading: string) => {
    let g = groups.find((x) => x.heading.toLowerCase() === heading.toLowerCase());
    if (!g) {
      g = { heading, lines: [] };
      groups.push(g);
    }
    return g;
  };
  for (const doc of docs) {
    let heading = doc.kind === 'hospitality' ? 'Hospitality' : 'Production';
    for (const b of doc.blocks) {
      if (!inForce(b, date)) continue;
      if (b.kind === 'heading' && b.content.level === 1 && b.content.text.trim()) heading = b.content.text.trim();
      if (b.kind === 'request' && b.content.summary && b.content.item.trim()) {
        const who = providerShort(b.content.provider);
        groupFor(heading).lines.push(`${requestLine(b.content, party)}${who === 'We bring' ? ' (we bring)' : ''}`);
      }
    }
  }
  return groups.filter((g) => g.lines.length);
}

/* ---------- versions ---------- */

export function nextVersion(prev: VersionNo | null, bump: 'minor' | 'major'): VersionNo {
  if (!prev) return { major: 1, minor: 0 };
  return bump === 'major' ? { major: prev.major + 1, minor: 0 } : { major: prev.major, minor: prev.minor + 1 };
}

export const versionLabel = (v: VersionNo): string => `${v.major}.${v.minor}`;

/* ---------- what changed ---------- */

const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);
const lowerFirst = (t: string) => t.charAt(0).toLowerCase() + t.slice(1);

function sectionsOf(doc: SnapDoc): Map<string, string | null> {
  const out = new Map<string, string | null>();
  let current: string | null = null;
  for (const b of doc.blocks) {
    if (b.kind === 'heading' && b.content.level === 1) current = b.content.text.trim() || null;
    out.set(b.id, b.kind === 'heading' && b.content.level === 1 ? null : current);
  }
  return out;
}

function requestDetail(a: RequestContent, b: RequestContent, party: number | null): { before?: string; after?: string; what?: string } {
  const la = requestLine(a, party);
  const lb = requestLine(b, party);
  if (la !== lb) return { before: la, after: lb };
  const bits: string[] = [];
  if (a.provider !== b.provider) bits.push(`${providerShort(a.provider) ?? 'No one'} → ${providerShort(b.provider) ?? 'no one'}`);
  if (a.alternatives !== b.alternatives) bits.push(b.alternatives ? `alternatives: ${b.alternatives}` : 'alternatives removed');
  if (a.note !== b.note) bits.push(b.note ? `note: ${b.note.length > 60 ? `${b.note.slice(0, 58)}…` : b.note}` : 'note removed');
  if (a.optional !== b.optional) bits.push(b.optional ? 'now if possible' : 'now required');
  if ((a.link ?? '') !== (b.link ?? '')) bits.push(b.link ? (a.link ? 'new link to the exact item' : 'link to the exact item') : 'link removed');
  if ((a.photo ?? null) !== (b.photo ?? null)) bits.push(b.photo ? (a.photo ? 'new photo' : 'photo added') : 'photo removed');
  return bits.length ? { what: `${lb} — ${bits.join('; ')}` } : {};
}

function blockChange(doc: RiderKind, section: string | null, prev: SnapBlock, next: SnapBlock, party: number | null): RiderChange | null {
  const datesChanged = prev.from !== next.from || prev.until !== next.until;
  const contentChanged = prev.kind !== next.kind || !same(prev.content, next.content);
  if (!datesChanged && !contentChanged) return null;
  const base = { doc, section, type: 'changed' as const, blockId: next.id, from: next.from, until: next.until };
  if (next.kind === 'summary' || next.kind === 'break') return null; // built / layout only
  if (contentChanged && prev.kind === 'request' && next.kind === 'request') {
    const d = requestDetail(prev.content, next.content, party);
    if (d.before) return { ...base, what: d.after!, before: d.before, after: d.after };
    if (d.what) return { ...base, what: d.what };
  }
  if (contentChanged && prev.kind === 'input_list' && next.kind === 'input_list' && prev.content.outputs !== next.content.outputs) {
    return { ...base, what: `Input list — ${next.content.outputs ? 'now with the outputs (IEM / mixes)' : 'outputs left out'}` };
  }
  if (contentChanged && prev.kind === 'heading' && next.kind === 'heading' && prev.content.text !== next.content.text) {
    return { ...base, what: `Section renamed`, before: prev.content.text, after: next.content.text };
  }
  if (contentChanged && next.kind === 'text') {
    const a = proseText((prev.content as BlockContentMap['text']).doc);
    if (a.trim() === proseText(next.content.doc).trim()) {
      if (!datesChanged) return null; // formatting only
    } else return { ...base, what: blockLabel(next, party), before: blockLabel(prev, party) };
  }
  if (datesChanged && !contentChanged) {
    return { ...base, what: `${blockLabel(next, party)} — now ${lowerFirst(dateTag(next.from, next.until) ?? 'every show')}` };
  }
  return { ...base, what: blockLabel(next, party) };
}

/** Changes from `prev` (null = first version: nothing to compare) to `next`. */
export function diffSnapshots(prev: Comparable | null, next: Comparable): RiderChange[] {
  if (!prev) return [];
  const out: RiderChange[] = [];
  if ((prev.party ?? null) !== (next.party ?? null)) {
    out.push({ doc: null, section: null, type: 'changed', what: 'Touring party', before: prev.party ? String(prev.party) : 'not set', after: next.party ? String(next.party) : 'not set', blockId: null });
  }
  for (const nd of next.docs) {
    const pd = prev.docs.find((d) => d.kind === nd.kind) ?? { kind: nd.kind, title: nd.title, blocks: [] };
    const before = new Map(pd.blocks.map((b) => [b.id, b]));
    const after = new Set(nd.blocks.map((b) => b.id));
    const nSections = sectionsOf(nd);
    const pSections = sectionsOf(pd);
    const party = next.party;
    for (const b of nd.blocks) {
      const p = before.get(b.id);
      if (!p) {
        if (b.kind === 'break' || (b.kind === 'text' && !proseText(b.content.doc).trim())) continue;
        out.push({ doc: nd.kind, section: nSections.get(b.id) ?? null, type: 'added', what: blockLabel(b, party), blockId: b.id, from: b.from, until: b.until });
        continue;
      }
      const c = blockChange(nd.kind, nSections.get(b.id) ?? null, p, b, party);
      if (c) out.push(c);
    }
    for (const p of pd.blocks) {
      if (after.has(p.id) || p.kind === 'break' || (p.kind === 'text' && !proseText(p.content.doc).trim())) continue;
      out.push({ doc: nd.kind, section: pSections.get(p.id) ?? null, type: 'removed', what: blockLabel(p, prev.party), blockId: p.id, from: p.from, until: p.until });
    }
    if (pd.title && nd.title !== pd.title) out.push({ doc: nd.kind, section: null, type: 'changed', what: 'Title', before: pd.title, after: nd.title, blockId: null });
  }
  out.push(
    ...diffEmbeds(prev.embeds, next.embeds, {
      inputList: usesEmbed(prev.docs, 'inputList') && usesEmbed(next.docs, 'inputList'),
      stagePlot: usesEmbed(prev.docs, 'stagePlot') && usesEmbed(next.docs, 'stagePlot'),
    }),
  );
  return out;
}

/** One line per change, as the promoter page, the email and the PDF print it. */
export function changeLine(c: RiderChange): string {
  const where = c.section ? `${c.section} · ` : '';
  const when = dateTag(c.from ?? null, c.until ?? null);
  const tail = when && !c.what.includes('— now') ? ` (${lowerFirst(when)})` : '';
  if (c.type === 'added') return `${where}Added: ${c.what}${tail}`;
  if (c.type === 'removed') return `${where}Removed: ${c.what}`;
  if (c.before !== undefined && c.after !== undefined) {
    return c.named || c.what === 'Section renamed' || c.what === 'Title' || c.what === 'Touring party'
      ? `${where}${c.what}: ${c.before} → ${c.after}`
      : `${where}${c.before} → ${c.after}${tail}`;
  }
  return `${where}Changed: ${c.what}${tail}`;
}

/** Does this change reach this show? A dated line only on its dates; a
 *  change to the tour's input list / stage plot not where the show has its
 *  own (`embeds`: the copies of the version being read); a show's own
 *  document's change only there. */
export function changeReaches(c: RiderChange, show: { date: string; routingId?: string | null }, embeds?: RiderEmbeds | null): boolean {
  if ((c.from || c.until) && !inForce({ from: c.from ?? null, until: c.until ?? null }, show.date)) return false;
  if (c.show) return c.show === show.routingId;
  if (c.embed && show.routingId && embeds?.shows[show.routingId]?.[c.embed]) return false;
  return true;
}

/** What a show reads, as comparable text: the blocks in force on its date
 *  and the input list / stage plot it gets. */
function inForceKey(s: Comparable, date: string, routingId: string | null): string {
  return JSON.stringify([
    s.party,
    s.docs.map((d) => [d.kind, d.title, d.blocks.filter((b) => inForce(b, date)).map((b) => [b.id, b.kind, b.content])]),
    embedKey(s.embeds, routingId),
  ]);
}

/** Upcoming shows (date ≥ today) whose rider reads differently in `next`. */
export function showsAffected<T extends { date: string; routingId?: string }>(prev: Comparable | null, next: Comparable, shows: readonly T[], today: string): T[] {
  return shows.filter((s) => s.date >= today && (!prev || inForceKey(prev, s.date, s.routingId ?? null) !== inForceKey(next, s.date, s.routingId ?? null)));
}
