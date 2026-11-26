import { describe, expect, it } from 'vitest';
import { blockLabel, dateTag, dayBefore, inForce, parseContent, parseQty, requestLine } from './blocks';
import { notifyEmail } from './email';
import { convertLegacyPack, htmlToText } from './legacy';
import { byPosition, isPositionKey, keyAfter, keyBetween, keysBetween } from './position';
import { cleanDoc, docFromText, proseHtml, proseText } from './prose';
import { docModel, riderPdfHtml, runsOf } from './render';
import { attachmentsWanted, buildSnapshot, parseSnapshot, toSnapDoc } from './snapshot';
import { STARTERS, parseTemplateBlocks, placeBlocks } from './starters';
import { buildSummary, changeLine, diffSnapshots, nextVersion, showsAffected, versionLabel } from './summary';
import type { RequestContent, RiderBlock, RiderSnapshot, SnapBlock, SnapDoc } from './types';

const req = (item: string, o: Partial<RequestContent> = {}): RequestContent => ({
  qty: null, item, provider: 'venue', alternatives: '', note: '', optional: false, perPerson: false, summary: false, ...o,
});
const sb = (id: string, b: Omit<SnapBlock, 'id' | 'from' | 'until'> & { from?: string | null; until?: string | null }): SnapBlock =>
  ({ id, from: null, until: null, ...b }) as SnapBlock;

describe('positions', () => {
  it('a key between any two keys, never ending in 0, sorted as bytes', () => {
    const a = keyBetween(null, null);
    const b = keyBetween(a, null);
    const mid = keyBetween(a, b);
    expect(a < mid && mid < b).toBe(true);
    const before = keyBetween(null, '1');
    expect(before < '1').toBe(true);
    for (const k of [a, b, mid, before]) expect(isPositionKey(k)).toBe(true);
  });

  it('100 inserts at the same spot stay ordered and short', () => {
    let lo = keyBetween(null, null);
    const hi = keyBetween(lo, null);
    const keys: string[] = [];
    for (let i = 0; i < 100; i++) {
      lo = keyBetween(lo, hi);
      keys.push(lo);
    }
    expect([...keys].sort()).toEqual(keys);
    expect(Math.max(...keys.map((k) => k.length))).toBeLessThanOrEqual(64);
  });

  it('spreads keys evenly for a whole document, and steps over equal neighbours', () => {
    const keys = keysBetween(null, null, 40);
    expect(new Set(keys).size).toBe(40);
    expect([...keys].sort()).toEqual(keys);
    expect(Math.max(...keys.map((k) => k.length))).toBeLessThanOrEqual(3);
    const rows = [{ position: 'V' }, { position: 'V' }, { position: 'l' }];
    const k = keyAfter(rows, 0);
    expect(k > 'V' && k < 'l').toBe(true);
    expect(keyAfter(rows, -1) < 'V').toBe(true);
    expect([{ id: 'b', position: 'V' }, { id: 'a', position: 'V' }].sort(byPosition).map((x) => x.id)).toEqual(['a', 'b']);
  });
});

describe('prose', () => {
  it('keeps the StarterKit subset, drops javascript links, keeps unknown nodes’ words', () => {
    const doc = cleanDoc({
      type: 'doc',
      content: [
        { type: 'paragraph', content: [{ type: 'text', text: 'Hi', marks: [{ type: 'bold' }, { type: 'link', attrs: { href: 'javascript:alert(1)' } }] }] },
        { type: 'variable', attrs: { label: '{artist}' } },
        { type: 'image', attrs: { src: 'x' } },
        { type: 'bulletList', content: [{ type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'one' }] }] }] },
      ],
    });
    expect(doc.content[0].content?.[0].marks).toEqual([{ type: 'bold' }]);
    expect(proseText(doc)).toBe('Hi\n{artist}\n• one');
    expect(proseHtml(doc)).toContain('<ul><li><p>one</p></li></ul>');
  });

  it('escapes text in the PDF html and makes lists from "- " lines', () => {
    expect(proseHtml(docFromText('<b>"x"</b> & y'))).toBe('<p>&lt;b&gt;&quot;x&quot;&lt;/b&gt; &amp; y</p>');
    expect(proseText(docFromText('Intro\n- a\n- b'))).toBe('Intro\n• a\n• b');
  });
});

describe('blocks', () => {
  it('the content gate trims, clamps and drops', () => {
    const c = parseContent('request', { qty: '12', item: ' Guinness \n cans ', provider: 'nobody', optional: 'yes', extra: 1 });
    expect(c).toEqual({ qty: 12, item: ' Guinness   cans', provider: null, alternatives: '', note: '', optional: false, perPerson: false, summary: false });
    expect(parseQty(-1)).toBeNull();
    expect(parseQty('1e9')).toBe(99_999);
    const t = parseContent('table', { columns: ['A', 'B'], rows: [['1'], ['2', '3', '4']] });
    expect(t.rows).toEqual([['1', ''], ['2', '3']]);
    const f = parseContent('files', { items: [{ kind: 'channel_list' }, { kind: 'channel_list' }, { kind: 'file', id: 'not-a-uuid' }] });
    expect(f.items).toEqual([{ kind: 'channel_list' }]);
  });

  it('a request reads as the promoter sees it — per person × the party', () => {
    expect(requestLine(req('Black hand towels', { qty: 10 }), 7)).toBe('(10) Black hand towels');
    expect(requestLine(req('Shower towels', { qty: 1, perPerson: true }), 7)).toBe('(7) Shower towels');
    expect(requestLine(req('Shore power'), 7)).toBe('Shore power');
  });

  it('dates: in force on a show day, tags for the tour view', () => {
    const b = { from: '2026-12-14', until: null };
    expect([inForce(b, '2026-12-13'), inForce(b, '2026-12-14'), inForce(b, null)]).toEqual([false, true, true]);
    expect(dateTag('2026-12-14', null)).toBe('From 14 Dec');
    expect(dateTag(null, '2026-12-13')).toBe('Until 13 Dec');
    expect(dateTag('2026-12-14', '2026-12-14')).toBe('14 Dec only');
    expect(dateTag('2026-12-14', '2026-12-20')).toBe('14–20 Dec');
    expect(dayBefore('2027-01-01')).toBe('2026-12-31');
  });
});

const doc = (kind: 'tech' | 'hospitality', blocks: SnapBlock[]): SnapDoc => ({ kind, title: kind === 'tech' ? 'Tech' : 'Hosp', blocks });

describe('summary + versions + what changed', () => {
  const tech = doc('tech', [
    sb('h1', { kind: 'heading', content: { text: 'Audio', level: 1 } }),
    sb('r1', { kind: 'request', content: req('FOH table', { qty: 1, summary: true }) }),
    sb('r2', { kind: 'request', content: req('Waves LV1', { provider: 'artist', summary: true }), until: '2026-12-13' }),
    sb('r3', { kind: 'request', content: req('DiGiCo Quantum 225', { summary: true }), from: '2026-12-14' }),
  ]);
  const hosp = doc('hospitality', [
    sb('h2', { kind: 'heading', content: { text: 'Towels', level: 1 } }),
    sb('r4', { kind: 'request', content: req('Shower towels', { qty: 1, perPerson: true, summary: true }) }),
  ]);

  it('the summary is built from the lines ticked, per show date', () => {
    expect(buildSummary([tech, hosp], 7, '2026-12-01')).toEqual([
      { heading: 'Audio', lines: ['(1) FOH table', 'Waves LV1 (we bring)'] },
      { heading: 'Towels', lines: ['(7) Shower towels'] },
    ]);
    expect(buildSummary([tech], 7, '2026-12-20')[0].lines).toEqual(['(1) FOH table', 'DiGiCo Quantum 225']);
  });

  it('versions: 1.0, then 1.1, then 2.0', () => {
    const v1 = nextVersion(null, 'minor');
    const v11 = nextVersion(v1, 'minor');
    expect([versionLabel(v1), versionLabel(v11), versionLabel(nextVersion(v11, 'major'))]).toEqual(['1.0', '1.1', '2.0']);
  });

  it('what changed: added, removed, a count change, a provider change, a date', () => {
    const prev = { party: 7, docs: [tech, hosp] };
    const next = {
      party: 8,
      docs: [
        doc('tech', [
          tech.blocks[0],
          sb('r1', { kind: 'request', content: req('FOH table', { qty: 2, summary: true }) }),
          sb('r2', { kind: 'request', content: req('Waves LV1', { provider: 'venue', summary: true }), until: '2026-12-13' }),
          sb('r3', { kind: 'request', content: req('DiGiCo Quantum 225', { summary: true }), from: '2026-12-15' }),
          sb('r5', { kind: 'request', content: req('Hazer') }),
        ]),
        doc('hospitality', [hosp.blocks[0]]),
      ],
    };
    const lines = diffSnapshots(prev, next).map(changeLine);
    expect(lines).toEqual([
      'Touring party: 7 → 8',
      'Audio · (1) FOH table → (2) FOH table',
      'Audio · Changed: Waves LV1 — We bring → Venue (until 13 Dec)',
      'Audio · Changed: DiGiCo Quantum 225 — now from 15 Dec',
      'Audio · Added: Hazer',
      'Towels · Removed: (7) Shower towels',
    ]);
    expect(diffSnapshots(null, next)).toEqual([]);
  });

  it('a show is affected only when its own rider reads differently', () => {
    const prev = { party: 7, docs: [tech] };
    const next = { party: 7, docs: [doc('tech', [...tech.blocks.slice(0, 3), sb('r3', { kind: 'request', content: req('DiGiCo SD12', { summary: true }), from: '2026-12-14' })])] };
    const shows = [{ id: 'a', date: '2026-11-01' }, { id: 'b', date: '2026-12-10' }, { id: 'c', date: '2026-12-20' }];
    expect(showsAffected(prev, next, shows, '2026-11-26').map((s) => s.id)).toEqual(['c']);
    expect(showsAffected(null, next, shows, '2026-11-26').map((s) => s.id)).toEqual(['b', 'c']);
  });
});

describe('render model + PDF', () => {
  const snap: RiderSnapshot = buildSnapshot({
    tourName: 'Satellite',
    artistName: 'Charlotte Sands',
    party: 7,
    docs: [
      doc('tech', [
        sb('h', { kind: 'heading', content: { text: 'Audio', level: 1 } }),
        sb('a', { kind: 'request', content: req('Riser 8x8x1', { qty: 1, alternatives: '4x8 + 4x8', summary: true }) }),
        sb('b', { kind: 'request', content: req('Hazer', { optional: true }), from: '2026-12-14' }),
        sb('s', { kind: 'summary', content: { title: 'Advance summary' } }),
        sb('f', { kind: 'files', content: { items: [{ kind: 'channel_list' }, { kind: 'stage_plot' }] } }),
      ]),
    ],
    attachments: [{ kind: 'channel_list', id: 'tour-1', label: 'Input list' }],
  });

  it('a show sees only what applies that day; the tour view tags dated lines', () => {
    const show = docModel(snap.docs[0], { date: '2026-12-01', party: 7, docs: snap.docs, attachments: snap.attachments, states: { a: { state: 'substitute', note: '4x8' } } });
    expect(show.items.map((i) => i.t)).toEqual(['heading', 'request', 'summary', 'files']);
    const reqItem = show.items[1];
    expect(reqItem.t === 'request' && [reqItem.qty, reqItem.state?.state]).toEqual(['1', 'substitute']);
    const tour = docModel(snap.docs[0], { date: null, party: 7, docs: snap.docs, attachments: snap.attachments });
    const hazer = tour.items.find((i) => i.t === 'request' && i.item === 'Hazer');
    expect(hazer && 'tag' in hazer ? hazer.tag : null).toBe('From 14 Dec');
    expect(runsOf(tour.items).map((r) => r.t)).toEqual(['one', 'requests', 'one', 'one']);
    const files = tour.items.find((i) => i.t === 'files');
    expect(files && files.t === 'files' ? files.items.map((a) => [a.label, a.id]) : null).toEqual([['Input list', 'tour-1'], ['Stage plot', null]]);
  });

  it('the PDF prints the version, every line, escaped, and what changed', () => {
    const models = snap.docs.map((d) => docModel(d, { date: null, party: 7, docs: snap.docs, attachments: snap.attachments }));
    const html = riderPdfHtml({
      title: 'Rider',
      header: { artist: 'Charlotte <Sands>', version: 'Version 1.7 · 26 Nov 2026', show: null },
      models,
      changes: [{ doc: 'tech', section: 'Audio', type: 'added', what: 'Hazer', blockId: 'b' }],
      linkUrl: 'https://x/r/t',
    });
    expect(html).toContain('Version 1.7 · 26 Nov 2026');
    expect(html).toContain('Charlotte &lt;Sands&gt;');
    expect(html).toContain('Riser 8x8x1');
    expect(html).toContain('If possible');
    expect(html).toContain('Stage plot — not attached yet');
    expect(html).toContain('Audio · Added: Hazer');
  });

  it('a stored snapshot reads back through the gate', () => {
    const round = parseSnapshot(JSON.parse(JSON.stringify(snap)));
    expect(round).toEqual(snap);
    expect(parseSnapshot({ docs: [{ kind: 'tech', blocks: [{ id: 'x', kind: 'evil', content: {} }] }], party: -2 }).docs[0].blocks).toEqual([]);
    expect(attachmentsWanted(snap.docs)).toEqual({ channelList: true, stagePlot: true, fileIds: [] });
  });
});

describe('templates + bring-over + email', () => {
  it('every starter block passes the content gate unchanged, and places in order', () => {
    for (const s of STARTERS) {
      const parsed = parseTemplateBlocks(JSON.parse(JSON.stringify(s.blocks)));
      expect(parsed.map((b) => b.content)).toEqual(s.blocks.map((b) => b.content));
      let n = 0;
      const rows = placeBlocks(parsed, () => `id-${n++}`);
      expect([...rows.map((r) => r.position)].sort()).toEqual(rows.map((r) => r.position));
    }
  });

  it('an old pack becomes blocks — text, tables, contacts, checklists; a show pack is dated', () => {
    const { kind, blocks } = convertLegacyPack(
      { id: 'p', title: 'Hospitality rider', scope: 'show', cover_disclaimer: '<p>Be kind</p>' },
      [
        { title: 'Rooms', sort_order: 2, section_type: 'fields', fields: [{ type: 'checkbox_list', items: [{ label: 'Fridge' }] }, { type: 'contact', entries: [{ name: 'Jo', role: 'PM' }] }] },
        { title: 'Intro', sort_order: 1, section_type: 'rich_text', metadata: { content: { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Hello' }] }] } } },
        { title: 'Summary', sort_order: 3, section_type: 'advance_summary', metadata: { summary: [{ subject: 'Towels', body: '<b>20</b>' }] } },
      ],
      '2026-12-14',
    );
    expect(kind).toBe('hospitality');
    expect(blocks.map((b) => (b.kind === 'heading' ? `#${b.content.text}` : b.kind))).toEqual(['text', '#Intro', 'text', '#Rooms', 'request', 'contacts', '#Summary', 'table']);
    expect(blocks.every((b) => b.from === '2026-12-14' && b.until === '2026-12-14')).toBe(true);
    expect(htmlToText('<p>a<br>b</p><ul><li>c</li></ul>')).toBe('a\nb\n- c');
  });

  it('the notify email names the version, the show, what changed and the link', () => {
    const { subject, body } = notifyEmail({
      artist: 'Charlotte Sands', version: '1.7', publishedAt: '2026-11-26T10:00:00Z', venue: 'The Leadmill', city: 'Sheffield', date: '2026-12-14',
      link: 'https://lowpass/r/abc', changes: [{ doc: 'hospitality', section: 'Hospitality', type: 'changed', what: '(12) Guinness', before: '(8) Guinness', after: '(12) Guinness', blockId: 'x' }],
      note: null, recipientName: 'Jo Smith', senderName: 'Adam', first: false,
    });
    expect(subject).toBe('Charlotte Sands rider updated to v1.7 — The Leadmill, Sheffield, 14 Dec 2026');
    expect(body).toContain('Hi Jo,');
    expect(body).toContain('• Hospitality · (8) Guinness → (12) Guinness');
    expect(body).toContain('https://lowpass/r/abc');
  });

  it('labels for threads and the outline', () => {
    const b = { kind: 'request', content: req('Riser', { qty: 1 }) } as Pick<RiderBlock, 'kind' | 'content'>;
    expect(blockLabel(b)).toBe('(1) Riser');
    expect(toSnapDoc({ kind: 'tech', title: ' ' }, []).title).toBe('Technical & Production Rider');
  });
});

describe('pasted lists → request lines', () => {
  it('reads counts in the ways riders write them', async () => {
    const { parseRequestText } = await import('./blocks');
    expect(parseRequestText('(8) Guinness cans')).toEqual({ qty: 8, item: 'Guinness cans' });
    expect(parseRequestText('- 24 x Liquid Death')).toEqual({ qty: 24, item: 'Liquid Death' });
    expect(parseRequestText('6× Red Bull')).toEqual({ qty: 6, item: 'Red Bull' });
    expect(parseRequestText('Honey + fresh lemon')).toEqual({ qty: null, item: 'Honey + fresh lemon' });
    expect(parseRequestText('5 Gum (blue only)')).toEqual({ qty: 5, item: 'Gum (blue only)' });
    expect(parseRequestText('   ')).toBeNull();
  });
});
