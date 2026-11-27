import { describe, expect, it } from 'vitest';
import { parseContent } from './blocks';
import { diffEmbeds, embedFor, embedKey, embedsInUse, emptyEmbeds, othersFor, parseEmbeds, pickEmbeds, sameEmbeds, svgDataUri } from './embeds';
import { decodeEntities, productFromHtml } from './linkPreview';
import { cleanLink, isPhotoPath, linkHost, photoBelongs, photoPath, photoPathsIn, sniffImage, typedLink } from './photos';
import { docModel, riderPdfHtml } from './render';
import { buildSnapshot, parseSnapshot } from './snapshot';
import { STARTERS } from './starters';
import { changeLine, changeReaches, diffSnapshots, showsAffected } from './summary';
import { convertLegacyPack } from './legacy';
import type { EmbedInputList, EmbedStagePlot, RequestContent, RiderEmbeds, SnapBlock, SnapDoc } from './types';

const WS = '0a0a0a0a-0000-4000-8000-000000000001';
const TOUR = '0b0b0b0b-0000-4000-8000-000000000002';
const OTHER = '0c0c0c0c-0000-4000-8000-000000000003';
const PIC = '0d0d0d0d-0000-4000-8000-000000000004';

const list = (docId: string, rows: string[][], version: string | null = 'v3'): EmbedInputList => ({
  docId,
  title: docId === 'list-b' ? 'Festival list' : 'Club list',
  version,
  inputs: { columns: ['Ch', 'Source', 'Mic'], rows },
  outputs: { columns: ['#', 'Item', 'Destination', 'Qty', 'Format', 'Notes'], rows: [['1', 'IEM 1', 'Vox', '1', 'Stereo', '']] },
});
const plot = (docId: string, svg = '<svg xmlns="http://www.w3.org/2000/svg"><rect/></svg>'): EmbedStagePlot => ({ docId, title: 'Plot', version: null, svg });
const sb = (id: string, b: Omit<SnapBlock, 'id' | 'from' | 'until'>): SnapBlock => ({ id, from: null, until: null, ...b }) as SnapBlock;
const techDoc = (blocks: SnapBlock[]): SnapDoc => ({ kind: 'tech', title: 'Tech rider', blocks });
const req = (item: string, o: Partial<RequestContent> = {}): RequestContent => ({
  qty: null, item, provider: 'venue', alternatives: '', note: '', optional: false, perPerson: false, summary: false, link: '', photo: null, ...o,
});

const E: RiderEmbeds = {
  inputLists: { 'list-b': list('list-b', [['1', 'Kick', 'Beta 91']]), 'list-a': list('list-a', [['1', 'Kick', 'D6'], ['2', 'Snare', 'SM57']]) },
  stagePlots: { 'plot-a': plot('plot-a') },
  tour: { inputList: 'list-a', stagePlot: 'plot-a' },
  shows: { 'show-2': { label: 'Sat 14 Dec · Festival', inputList: 'list-b' } },
};
const both = techDoc([sb('il', { kind: 'input_list', content: { outputs: true } }), sb('sp', { kind: 'stage_plot', content: {} })]);

describe('photos + links (pure)', () => {
  it('a photo path is one shape, and only this tour’s is ever signed', () => {
    const p = photoPath(WS, TOUR, PIC, 'image/webp');
    expect(p).toBe(`rider-photos/${WS}/${TOUR}/${PIC}.webp`);
    expect(isPhotoPath(p) && photoBelongs(p, WS, TOUR)).toBe(true);
    expect(photoBelongs(p, WS, OTHER)).toBe(false);
    for (const bad of [`rider-photos/${WS}/${TOUR}/../x.jpg`, `tour-files/${WS}/${TOUR}/${PIC}.jpg`, `rider-photos/${WS}/${TOUR}/${PIC}.svg`, `rider-photos/${WS}/${TOUR}/${PIC}.jpg?x`, 42, null]) {
      expect(isPhotoPath(bad)).toBe(false);
    }
  });

  it('the type comes from the bytes — and SVG is never a photo', () => {
    expect(sniffImage(new Uint8Array([0xff, 0xd8, 0xff, 0xe0]))).toBe('image/jpeg');
    expect(sniffImage(new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))).toBe('image/png');
    expect(sniffImage(new TextEncoder().encode('GIF89a...'))).toBe('image/gif');
    expect(sniffImage(new TextEncoder().encode('RIFF\u0000\u0000\u0000\u0000WEBPVP8 '))).toBe('image/webp');
    expect(sniffImage(new TextEncoder().encode('<svg onload="alert(1)">'))).toBeNull();
    expect(sniffImage(new TextEncoder().encode('<html>'))).toBeNull();
  });

  it('links: web only, no passwords; a bare shop address gets https', () => {
    expect(cleanLink('https://www.sweetwater.com/store/detail/SM57')).toBe('https://www.sweetwater.com/store/detail/SM57');
    for (const bad of ['javascript:alert(1)', 'data:text/html,x', 'https://a:b@x.com/', 'http://localhost/', 'ftp://x.com', 'x'.repeat(501)]) expect(cleanLink(bad)).toBe('');
    expect(typedLink('thomann.de/gb/shure_sm57.htm')).toBe('https://thomann.de/gb/shure_sm57.htm');
    expect(typedLink('  https://www.ikea.com/gb/en/p/x  ')).toBe('https://www.ikea.com/gb/en/p/x');
    expect(typedLink('just some words')).toBe('');
    expect(typedLink('javascript:alert(1)')).toBe('');
    expect(linkHost('https://www.tesco.com/groceries/x')).toBe('tesco.com');
  });

  it('a request line keeps a clean link + this kind of photo path, nothing else', () => {
    const ok = parseContent('request', { item: 'Oat milk', link: 'https://www.oatly.com/x', photo: `rider-photos/${WS}/${TOUR}/${PIC}.jpg` });
    expect([ok.link, ok.photo]).toEqual(['https://www.oatly.com/x', `rider-photos/${WS}/${TOUR}/${PIC}.jpg`]);
    const bad = parseContent('request', { item: 'x', link: 'javascript:alert(1)', photo: 'https://evil.example/p.jpg' });
    expect([bad.link, bad.photo]).toEqual(['', null]);
    expect(parseContent('input_list', {})).toEqual({ outputs: true });
    expect(parseContent('input_list', { outputs: false })).toEqual({ outputs: false });
    expect(parseContent('stage_plot', { evil: 1 })).toEqual({});
    expect(photoPathsIn([{ kind: 'request', content: ok }, { kind: 'request', content: bad }])).toEqual([ok.photo]);
  });
});

describe('the shop page’s own photo', () => {
  it('prefers the Product in JSON-LD (inside @graph too) — its photo and its name — resolved against the page', () => {
    const html = `<html><head><title>Shure SM57 | Shop</title>
      <meta property="og:image" content="https://cdn.shop.com/logo.png">
      <script type="application/ld+json">{"@context":"https://schema.org","@graph":[{"@type":"Organization","logo":"/logo.png"},
        {"@type":"Product","name":"Shure SM57","image":[{"@type":"ImageObject","url":"/img/sm57.jpg"}]}]}</script></head></html>`;
    expect(productFromHtml(html, 'https://www.shop.com/p/sm57')).toEqual({ title: 'Shure SM57', image: 'https://www.shop.com/img/sm57.jpg' });
  });

  it('falls back through og:image, twitter, image_src, itemprop — honouring <base>', () => {
    const og = `<base href="https://img.shop.com/"><meta content='p/1.jpg?w=800&amp;h=800' property='og:image'><meta property="og:title" content="Oat &amp; Co Barista 1L">`;
    expect(productFromHtml(og, 'https://shop.com/x')).toEqual({ title: 'Oat & Co Barista 1L', image: 'https://img.shop.com/p/1.jpg?w=800&h=800' });
    expect(productFromHtml('<meta name="twitter:image" content="//cdn.x.com/a.png">', 'https://x.com/p').image).toBe('https://cdn.x.com/a.png');
    expect(productFromHtml('<link rel="image_src" href="/b.jpg">', 'https://x.com/p').image).toBe('https://x.com/b.jpg');
    expect(productFromHtml('<img itemprop="image" src="c.webp">', 'https://x.com/p/').image).toBe('https://x.com/p/c.webp');
  });

  it('nothing usable → null, never a script or data URL', () => {
    expect(productFromHtml('<meta property="og:image" content="javascript:alert(1)">', 'https://x.com').image).toBeNull();
    expect(productFromHtml('<meta property="og:image" content="data:image/png;base64,AAAA">', 'https://x.com').image).toBeNull();
    expect(productFromHtml('<script type="application/ld+json">{not json</script>', 'https://x.com')).toEqual({ title: null, image: null });
    expect(decodeEntities('&lt;b&gt; &#39;x&#39; &#x2019; &bogus;')).toBe('<b> \'x\' ’ &bogus;');
  });
});

describe('input list + stage plot inside the rider', () => {
  it('a show gets its own document, else the tour’s; the tour view says who differs', () => {
    expect(embedFor(E, 'inputList', 'show-2')?.docId).toBe('list-b');
    expect(embedFor(E, 'inputList', 'show-1')?.docId).toBe('list-a');
    expect(embedFor(E, 'stagePlot', 'show-2')?.docId).toBe('plot-a');
    expect(othersFor(E, 'inputList')).toEqual(['Sat 14 Dec · Festival: Festival list (v3)']);
    expect(othersFor(E, 'stagePlot')).toEqual([]);
  });

  it('a version carries only what its blocks show', () => {
    expect(embedsInUse([techDoc([])], E)).toEqual(emptyEmbeds());
    const plotOnly = pickEmbeds(E, { inputList: false, stagePlot: true });
    expect([Object.keys(plotOnly.inputLists), plotOnly.tour.inputList, Object.keys(plotOnly.shows)]).toEqual([[], null, []]);
    expect(Object.keys(pickEmbeds(E, { inputList: true, stagePlot: false }).inputLists)).toEqual(['list-a', 'list-b']);
  });

  it('key order never matters (JSONB reorders keys) — and the gate drops what doesn’t fit', () => {
    const stored = JSON.parse(JSON.stringify({ ...E, inputLists: { 'list-a': E.inputLists['list-a'], 'list-b': E.inputLists['list-b'] } }));
    expect(sameEmbeds(parseEmbeds(stored), pickEmbeds(E, { inputList: true, stagePlot: true }))).toBe(true);
    expect(JSON.stringify(parseEmbeds(stored))).toBe(JSON.stringify(pickEmbeds(E, { inputList: true, stagePlot: true })));
    expect(embedKey(parseEmbeds(stored), 'show-2')).toBe(embedKey(pickEmbeds(E, { inputList: true, stagePlot: true }), 'show-2'));
    const changed = pickEmbeds({ ...E, inputLists: { ...E.inputLists, 'list-a': list('list-a', [['1', 'Kick', 'Beta 52']]) } }, { inputList: true, stagePlot: true });
    expect(sameEmbeds(changed, parseEmbeds(stored))).toBe(false);
    const junk = parseEmbeds({ inputLists: { x: { docId: 'x', inputs: 'nope' } }, stagePlots: { p: { docId: 'p', svg: '<script>alert(1)</script>' } }, tour: { inputList: 'x', stagePlot: 'p' }, shows: { s: { label: 'A', inputList: 'gone' } } });
    expect(junk).toEqual(emptyEmbeds());
  });

  it('what changed names the channel, and a show’s own document', () => {
    const next: RiderEmbeds = {
      ...E,
      inputLists: { ...E.inputLists, 'list-a': list('list-a', [['1', 'Kick', 'D6'], ['2', 'Snare', 'Beta 57A'], ['3', 'Hat', 'SM81']]) },
      stagePlots: { 'plot-a': plot('plot-a', '<svg><circle/></svg>') },
      shows: { 'show-2': { label: 'Sat 14 Dec · Festival', inputList: 'list-a' } },
    };
    const lines = diffEmbeds(E, next, { inputList: true, stagePlot: true }).map(changeLine);
    expect(lines).toEqual([
      'Input list · Ch 2 Snare: SM57 → Beta 57A',
      'Input list · Added: Ch 3 Hat',
      'Changed: Stage plot',
      'Input list for Sat 14 Dec · Festival: Festival list (v3) → Club list (v3)',
    ]);
    // A block only now added is its own "Added" in the block diff, not an embed change.
    expect(diffEmbeds(E, next, { inputList: false, stagePlot: false })).toEqual([]);
  });

  it('a show’s link lists only the changes that reach it', () => {
    const next: RiderEmbeds = { ...E, inputLists: { 'list-a': list('list-a', [['1', 'Kick', 'RE20']]), 'list-b': list('list-b', [['1', 'Kick', 'D112']]) } };
    const changes = diffEmbeds(E, next, { inputList: true, stagePlot: true });
    const festival = { date: '2026-12-14', routingId: 'show-2' };
    const club = { date: '2026-12-13', routingId: 'show-1' };
    expect(changes.filter((c) => changeReaches(c, festival, next)).map(changeLine)).toEqual(['Changed: Input list for Sat 14 Dec · Festival']);
    expect(changes.filter((c) => changeReaches(c, club, next)).map(changeLine)).toEqual(['Input list · Ch 1 Kick: D6 → RE20', 'Input list · Removed: Ch 2 Snare']);
    const dated = { doc: 'tech' as const, section: null, type: 'added' as const, what: 'Hazer', blockId: 'b', from: '2026-12-14', until: null };
    expect([changeReaches(dated, club, next), changeReaches(dated, festival, next)]).toEqual([false, true]);
  });

  it('a show is affected when the input list IT gets changes — not another show’s', () => {
    const shows = [{ date: '2026-12-13', routingId: 'show-1' }, { date: '2026-12-14', routingId: 'show-2' }];
    const prev = { docs: [both], party: 5, embeds: pickEmbeds(E, { inputList: true, stagePlot: true }) };
    const festivalOnly = { ...prev, embeds: pickEmbeds({ ...E, inputLists: { ...E.inputLists, 'list-b': list('list-b', [['1', 'Kick', 'RE20']]) } }, { inputList: true, stagePlot: true }) };
    expect(showsAffected(prev, festivalOnly, shows, '2026-12-01').map((s) => s.routingId)).toEqual(['show-2']);
    const tourList = { ...prev, embeds: pickEmbeds({ ...E, inputLists: { ...E.inputLists, 'list-a': list('list-a', [['1', 'Kick', 'RE20']]) } }, { inputList: true, stagePlot: true }) };
    expect(showsAffected(prev, tourList, shows, '2026-12-01').map((s) => s.routingId)).toEqual(['show-1']);
  });

  it('the snapshot freezes them, reads them back, and diffs say so', () => {
    const snap = buildSnapshot({ tourName: 'T', artistName: 'A', party: 5, docs: [both], attachments: [], embeds: E });
    expect(parseSnapshot(JSON.parse(JSON.stringify(snap)))).toEqual(snap);
    const outputsOff = techDoc([sb('il', { kind: 'input_list', content: { outputs: false } }), sb('sp', { kind: 'stage_plot', content: {} })]);
    expect(diffSnapshots(snap, { docs: [outputsOff], party: 5, embeds: snap.embeds }).map(changeLine)).toEqual(['Changed: Input list — outputs left out']);
  });

  it('renders inline — the plot only ever as an image, the item name as its link', () => {
    const evil = '<svg xmlns="http://www.w3.org/2000/svg"><script>alert(document.cookie)</script></svg>';
    const embeds: RiderEmbeds = { ...E, stagePlots: { 'plot-a': plot('plot-a', evil) } };
    const doc = techDoc([...both.blocks, sb('r', { kind: 'request', content: req('SM57', { link: 'https://www.shure.com/sm57' }) })]);
    const model = docModel(doc, { date: null, party: 5, docs: [doc], attachments: [], embeds });
    expect(model.items.map((i) => i.t)).toEqual(['inputs', 'plot', 'request']);
    const html = riderPdfHtml({ title: 'Rider', header: { artist: 'A', version: 'Version 1.0', show: null }, models: [model], changes: [], linkUrl: null });
    expect(html).toContain('<td>Snare</td>');
    expect(html).toContain('Outputs (IEM / mixes)');
    expect(html).toContain(svgDataUri(evil).replace(/&/g, '&amp;'));
    expect(html).not.toContain('<script>alert');
    expect(html).toContain('href="https://www.shure.com/sm57"');
    expect(html).toContain('Different for: Sat 14 Dec · Festival: Festival list (v3)');
    const none = docModel(doc, { date: null, party: 5, docs: [doc], attachments: [], embeds: emptyEmbeds() });
    expect(riderPdfHtml({ title: 'R', header: { artist: null, version: 'v', show: null }, models: [none], changes: [], linkUrl: null })).toContain('The input list will follow.');
  });

  it('starters show both; an old pack’s channel list becomes the block', () => {
    for (const s of STARTERS.filter((x) => x.kind === 'tech')) {
      expect(s.blocks.map((b) => b.kind)).toEqual(expect.arrayContaining(['input_list', 'stage_plot']));
      expect(s.blocks.some((b) => b.kind === 'files')).toBe(false);
    }
    const { blocks } = convertLegacyPack({ id: 'p', title: 'Tech rider', scope: 'tour', cover_disclaimer: null }, [{ title: 'Inputs', sort_order: 1, section_type: 'channel_list' }], null);
    expect(blocks.map((b) => b.kind)).toEqual(['heading', 'input_list']);
  });
});
