/* ============================================
   LOWPASS — linking channels to stage-plot items (Oct 2026)

   Pure rules behind the editor's Channels panel:

   - linkChannel():   drag a channel onto an item. A channel lives in ONE
                      place, so dropping it on a new item MOVES the link
                      (it is removed from whichever item had it).
   - iconForChannel(): drag a channel onto empty stage → which icon to drop
                      (DI for a DI-only channel, a kick / overhead / tom /
                      talkback mic by name, else a vocal-style mic).
   - suggestLinks():  one-click "link by name". Only offered when ONE item is
                      the clear best match, so a suggestion is never a coin
                      toss between two guitar amps.
   ============================================ */

import type { Channel, EditorItem } from './editor-types';

/** Shorthand on channel lists → one word. */
const SYNONYMS: Record<string, string> = {
  gtr: 'guitar', gtrs: 'guitar', gt: 'guitar', guitars: 'guitar', elec: 'guitar',
  vox: 'vocal', voc: 'vocal', vocals: 'vocal', vocal: 'vocal', bv: 'vocal', bvs: 'vocal', bvox: 'vocal', lv: 'vocal',
  kik: 'kick', kck: 'kick', bd: 'kick',
  sn: 'snare', snr: 'snare', sd: 'snare',
  oh: 'overhead', ohs: 'overhead', overheads: 'overhead', ovh: 'overhead',
  hh: 'hihat', hat: 'hihat', hats: 'hihat', hihat: 'hihat',
  tom: 'tom', toms: 'tom', ft: 'tom', rt: 'tom', rack: 'tom', floor: 'tom',
  bs: 'bass', bas: 'bass',
  kb: 'keys', kbd: 'keys', key: 'keys', keys: 'keys', synth: 'keys', synths: 'keys', piano: 'keys', pno: 'keys', organ: 'keys', rhodes: 'keys',
  ac: 'acoustic', acc: 'acoustic', acou: 'acoustic', acgtr: 'acoustic',
  tb: 'talkback', talkback: 'talkback',
  amb: 'ambient', aud: 'ambient', crowd: 'ambient',
  drum: 'drums', drums: 'drums', kit: 'drums',
};

/** Words that say what KIND of thing, not WHICH one — they match many items. */
const GENERIC = new Set(['vocal', 'guitar', 'bass', 'keys', 'acoustic', 'drums', 'mic', 'amp', 'di', 'in', 'out', 'top', 'bottom', 'bot', 'left', 'right', 'l', 'r', 'st', 'stereo', 'mono', 'line', 'stand']);
const DRUM_WORDS = new Set(['kick', 'snare', 'overhead', 'hihat', 'tom', 'ride', 'crash', 'drums']);
const IGNORE = new Set(['the', 'and', 'of', 'a', 'ch', 'no', 'x']);

export function tokens(s: string | null | undefined): string[] {
  return (s ?? '')
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((t) => t.length > 0 && !/^\d+$/.test(t) && !IGNORE.has(t))
    .map((t) => SYNONYMS[t] ?? t);
}

/** Move-semantics link: `channelId` ends up on `itemId` only. */
export function linkChannel(items: EditorItem[], channelId: string, itemId: string): EditorItem[] {
  return items.map((it) => {
    const has = (it.channelRowIds ?? []).includes(channelId);
    if (it.id === itemId) return has ? it : { ...it, channelRowIds: [...(it.channelRowIds ?? []), channelId] };
    if (!has) return it;
    const rest = (it.channelRowIds ?? []).filter((c) => c !== channelId);
    return { ...it, channelRowIds: rest.length ? rest : undefined };
  });
}

/** Which icon a channel dropped on empty stage becomes. */
export function iconForChannel(ch: Pick<Channel, 'label' | 'mic' | 'di'>): string {
  const t = new Set(tokens(ch.label));
  const mic = (ch.mic ?? '').trim();
  const di = (ch.di ?? '').trim();
  if (t.has('talkback')) return 'mic-talkback';
  if ((di && !mic) || /^di\b/i.test(mic)) return t.has('stereo') || /stereo|\bst\b/i.test(di) ? 'di-stereo' : 'di-mono';
  if (t.has('kick')) return 'mic-kick';
  if (t.has('overhead')) return 'mic-overhead';
  if (t.has('tom')) return 'mic-tom-clip';
  if (t.has('ambient')) return 'mic-area';
  return 'mic-vocal';
}

export interface LinkSuggestion {
  channelId: string;
  itemId: string;
}

type IconLookup = (iconName: string) => { label: string; category?: string } | undefined;

/** Name-match suggestions for channels that aren't on the plot yet. */
export function suggestLinks(channels: Channel[], items: EditorItem[], iconOf: IconLookup): LinkSuggestion[] {
  const placed = new Set(items.flatMap((it) => it.channelRowIds ?? []));
  const candidates = items
    .filter((it) => it.kind !== 'text' && it.kind !== 'arrow' && !it.iconName.startsWith('infra-'))
    .map((it) => {
      const icon = iconOf(it.iconName);
      const words = new Set([...tokens(it.label), ...tokens(icon?.label)]);
      const isKit = it.iconName.startsWith('drum-kit');
      const isDrum = isKit || it.iconName.startsWith('drum-');
      const isMic = it.iconName.startsWith('mic-');
      return { it, words, isKit, isDrum, isMic };
    });
  const out: LinkSuggestion[] = [];
  for (const ch of channels) {
    if (placed.has(ch.id)) continue;
    const words = tokens(ch.label);
    if (words.length === 0) continue;
    // "VOX TOM" is a singer called Tom, not a rack tom.
    const drumChannel = words.some((w) => DRUM_WORDS.has(w)) && !words.includes('vocal');
    const scored = candidates
      .map((c) => {
        let score = 0;
        for (const w of words) {
          if (c.words.has(w)) score += GENERIC.has(w) ? 1 : 3;
        }
        // A drum channel belongs to the kit, a matching split piece, or a
        // mic on it — never to, say, a person who happens to be called Tom.
        if (drumChannel && c.isKit) score += 2;
        if (drumChannel && !c.isDrum && !c.isMic) score = 0;
        // …and a non-drum channel never lands on the kit (its own name says
        // "3 toms", which "VOX TOM" would otherwise tie with).
        if (!drumChannel && c.isDrum) score = 0;
        return { id: c.it.id, score };
      })
      .filter((s) => s.score > 0)
      .sort((a, b) => b.score - a.score);
    if (scored.length === 0) continue;
    if (scored.length > 1 && scored[1].score === scored[0].score) continue; // not a clear winner
    out.push({ channelId: ch.id, itemId: scored[0].id });
  }
  return out;
}
