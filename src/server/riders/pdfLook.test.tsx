/** @vitest-environment node */
/* The printed rider (Adam: "a refined version of my rider with logo"): a
   cover per document, the logo at the head of every page after it, contents
   that link to the sections, the opening statement on the cover, empty
   sections dropped — and the logo only ever read from this artist's own
   upload folder. */
import { describe, expect, it } from 'vitest';
import { docModel, dropEmptySections, riderFooterTemplate, riderPdfHtml, type DocItem } from '@/lib/riders/render';
import type { RequestContent, SnapBlock, SnapDoc } from '@/lib/riders/types';
import { loadRiderLogo } from './logo';
import { versionStamp } from './pdf';

const sb = (id: string, b: Omit<SnapBlock, 'id' | 'from' | 'until'>): SnapBlock => ({ id, from: null, until: null, ...b }) as SnapBlock;
const req = (item: string, o: Partial<RequestContent> = {}): RequestContent => ({
  qty: null, item, provider: 'venue', alternatives: '', note: '', optional: false, perPerson: false, summary: false, link: '', photo: null, ...o,
});
const prose = (text: string) => ({ type: 'doc' as const, content: [{ type: 'paragraph' as const, content: [{ type: 'text' as const, text }] }] });
const doc: SnapDoc = {
  kind: 'tech',
  title: 'Technical & Production Rider',
  blocks: [
    sb('intro', { kind: 'text', content: { doc: prose('This rider is part of the performance agreement.') } }),
    sb('h-contacts', { kind: 'heading', content: { text: 'Key contacts', level: 1 } }),
    sb('contacts', { kind: 'contacts', content: { people: [] } }),
    sb('h-audio', { kind: 'heading', content: { text: 'Audio', level: 1 } }),
    sb('r1', { kind: 'request', content: req('Drive lines into the house system') }),
    sb('r2', { kind: 'request', content: req('Quad power drop at FOH', { qty: 1 }) }),
    sb('h-lights', { kind: 'heading', content: { text: 'Lighting', level: 1 } }),
    sb('r3', { kind: 'request', content: req('Hazer', { optional: true }) }),
  ],
};
const model = () => docModel(doc, { date: null, party: 7, docs: [doc], attachments: [] });
const html = (logo: string | null) =>
  riderPdfHtml({
    title: 'Rider',
    header: { artist: 'Charlotte <Sands>', version: 'Version 1.3 · Updated 26 Nov 2026', show: 'For The Basement East, Nashville · 14 Dec 2026' },
    tourName: "Satellite Tour USA '26",
    models: [model(), model()],
    changes: [{ doc: 'tech', section: 'Audio', type: 'added', what: 'Hazer', blockId: 'r3' }],
    linkUrl: 'https://lowpass.app/r/abc',
    logo,
  });

describe('the printed rider', () => {
  it('opens each document on a cover: logo, title, tour, show, stamp, opening statement, contents', () => {
    const h = html('data:image/png;base64,AAAA');
    const cover = h.slice(h.indexOf('<section class="rp-cover">'), h.indexOf('</section>', h.indexOf('<section class="rp-cover">')));
    expect(cover).toContain('<img class="rp-logo" src="data:image/png;base64,AAAA" alt="Charlotte &lt;Sands&gt;">');
    expect(cover).toContain('<h1 class="rp-title">Technical &amp; Production Rider</h1>');
    expect(cover).toContain('Satellite Tour USA &#39;26');
    expect(cover).toContain('For The Basement East, Nashville · 14 Dec 2026');
    expect(cover).toContain('Version 1.3 · Updated 26 Nov 2026');
    expect(cover).toContain('This rider is part of the performance agreement.');
    // Contents link to the sections that have something in them — not Key contacts (empty).
    expect(cover).toContain('<li><a href="#h-h-audio">Audio</a></li><li><a href="#h-h-lights">Lighting</a></li>');
    expect(cover).not.toContain('Key contacts');
    expect(h.match(/class="rp-cover"/g)?.length).toBe(2);
  });

  it('every page after the cover carries the logo (a repeating table head); the name when there is none', () => {
    expect(html('data:image/png;base64,AAAA')).toContain('<thead><tr><th><div class="rp-runhead"><img class="rp-runlogo"');
    const plain = html(null);
    expect(plain).toContain('<div class="rp-wordmark">Charlotte &lt;Sands&gt;</div>');
    expect(plain).toContain('<div class="rp-runhead"><div class="rp-runname">Charlotte &lt;Sands&gt;</div></div>');
  });

  it('the body has the lines once (the opening statement moved to the cover), and what changed comes last, once', () => {
    const h = html(null);
    expect(h.split('This rider is part of the performance agreement.').length - 1).toBe(2); // one per cover
    expect(h).toContain('<h2 id="h-h-audio" class="rd-h1">Audio</h2>');
    expect(h.split('Changes in this version').length - 1).toBe(1);
    expect(h.lastIndexOf('Changes in this version')).toBeGreaterThan(h.lastIndexOf('rp-cover'));
    expect(h).toContain('If possible');
  });

  it('footer: page x of y, and the stamp', () => {
    const f = riderFooterTemplate('Version 1.3 · Updated 26 Nov 2026 <b>');
    expect(f).toContain('Page <span class="pageNumber"></span> of <span class="totalPages"></span>');
    expect(f).toContain('Version 1.3 · Updated 26 Nov 2026 &lt;b&gt;');
    expect(versionStamp({ label: '1.3', publishedAt: '2026-11-26T10:00:00Z' })).toBe('Version 1.3 · Updated 26 Nov 2026');
    expect(versionStamp(null)).toBe('Draft — not published');
  });

  it('empty sections go: a heading with only headings or page breaks under it', () => {
    const h = (id: string, level: 1 | 2): DocItem => ({ t: 'heading', id, text: id, level, tag: null });
    const p = (id: string): DocItem => ({ t: 'prose', id, doc: prose(id), tag: null });
    const items: DocItem[] = [h('A', 1), h('A1', 2), p('a'), h('B', 1), { t: 'break', id: 'x' }, h('C', 1), h('C1', 2), h('D', 1), p('d'), h('E', 2)];
    expect(dropEmptySections(items).map((i) => i.id)).toEqual(['A', 'A1', 'a', 'x', 'D', 'd']);
  });
});

describe('the logo', () => {
  const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3]);
  const fake = (logoUrl: string, stored: Record<string, Uint8Array>) => {
    const downloads: string[] = [];
    const row = (table: string) => (table === 'tours' ? { artist_id: 'art-1' } : { id: 'art-1', workspace_id: 'ws-1', branding: { logo_url: logoUrl } });
    const client = {
      from: (table: string) => ({ select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: row(table), error: null }) }) }) }),
      storage: {
        from: (bucket: string) => ({
          download: async (path: string) => {
            downloads.push(`${bucket}:${path}`);
            const b = stored[path];
            return b ? { data: new Blob([b as BlobPart]), error: null } : { data: null, error: { message: 'not found' } };
          },
        }),
      },
    };
    return { client: client as never, downloads };
  };
  const base = 'https://proj.supabase.co/storage/v1/object/public/artist-assets/';

  it('reads our own upload from Storage, as a data URI', async () => {
    const { client, downloads } = fake(`${base}ws-1/art-1/logo.png`, { 'ws-1/art-1/logo.png': PNG });
    expect(await loadRiderLogo(client, 'tour-1')).toBe(`data:image/png;base64,${Buffer.from(PNG).toString('base64')}`);
    expect(downloads).toEqual(['artist-assets:ws-1/art-1/logo.png']);
  });

  it('never another artist’s folder, never a non-image', async () => {
    const other = fake(`${base}ws-2/art-9/logo.png`, { 'ws-2/art-9/logo.png': PNG });
    expect(await loadRiderLogo(other.client, 'tour-1')).toBeNull();
    expect(other.downloads).toEqual([]);
    const sneaky = fake(`${base}ws-1/art-1/../../ws-2/x.png`, {});
    expect(await loadRiderLogo(sneaky.client, 'tour-1')).toBeNull();
    const html = fake(`${base}ws-1/art-1/logo.png`, { 'ws-1/art-1/logo.png': new TextEncoder().encode('<html>') });
    expect(await loadRiderLogo(html.client, 'tour-1')).toBeNull();
  });

  it('a URL pointing inside the network is refused (safeFetch), not fetched', async () => {
    const { client } = fake('http://169.254.169.254/latest/meta-data/logo.png', {});
    expect(await loadRiderLogo(client, 'tour-1')).toBeNull();
  });
});
