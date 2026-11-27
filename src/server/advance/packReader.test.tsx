// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { PDFDocument } from 'pdf-lib';
import type { AdvSection } from '@/lib/advance/board';
import { extractFromContent, scanParts, shiftPages, type PackContent } from './packReader';

const sections: AdvSection[] = [
  { template_id: 'power', label: 'Power', fields: [{ id: 'main', label: 'Main power', type: 'text' } as never] },
  { template_id: 'access', label: 'Access', fields: [{ id: 'load_in', label: 'Load-in time', type: 'text' } as never] },
];
const show = { venue: 'Hall', city: 'Leeds', date: '2026-12-01', artist: 'Band' };

async function pdf(pages: number): Promise<string> {
  const doc = await PDFDocument.create();
  for (let i = 0; i < pages; i++) doc.addPage([200, 200]);
  return Buffer.from(await doc.save()).toString('base64');
}

/** A fake withAiUsage runner: answers from `reply(blocks)`, records calls. */
function fakeRun(reply: (text: string, i: number) => unknown) {
  const calls: { content: { type: string; text?: string }[]; system: string }[] = [];
  const run = async (fn: (a: never) => Promise<{ result: unknown; usage: unknown }>) => {
    const anthropic = {
      messages: {
        create: async (req: { messages: { content: { type: string; text?: string }[] }[]; system: string }) => {
          const i = calls.length;
          calls.push({ content: req.messages[0].content, system: req.system });
          const text = req.messages[0].content.map((b) => b.text ?? '').join('\n');
          const input = reply(text, i);
          if (input instanceof Error) throw input;
          return { content: [{ type: 'tool_use', name: 'record_pack', input }], stop_reason: 'tool_use', usage: {} };
        },
      },
    };
    return (await fn(anthropic as never)).result;
  };
  return { run, calls };
}

describe('scanParts', () => {
  it('splits a long scan into 12-page parts with their first / last pages', async () => {
    const parts = await scanParts(await pdf(30));
    expect(parts.map((p) => [p.first, p.last])).toEqual([
      [1, 12],
      [13, 24],
      [25, 30],
    ]);
    const second = await PDFDocument.load(Buffer.from(parts[1].base64, 'base64'));
    expect(second.getPageCount()).toBe(12);
  });

  it('keeps a short scan whole and takes only the head when limited', async () => {
    const b64 = await pdf(5);
    expect(await scanParts(b64)).toEqual([{ base64: b64, first: 1, last: 5 }]);
    const head = await scanParts(await pdf(40), 3, 3);
    expect(head).toHaveLength(1);
    expect((await PDFDocument.load(Buffer.from(head[0].base64, 'base64'))).getPageCount()).toBe(3);
  });

  it('falls back to the whole file when it can’t be opened', async () => {
    const junk = Buffer.from('not a pdf').toString('base64');
    expect(await scanParts(junk)).toEqual([{ base64: junk, first: 1, last: 0 }]);
  });
});

describe('shiftPages', () => {
  it('moves answer and extra pages onto the document’s numbering', () => {
    expect(shiftPages({ answers: [{ page: 2 }, { page: null }], extras: [{ page: 1 }] }, 12)).toEqual({ answers: [{ page: 14 }, { page: null }], extras: [{ page: 13 }] });
  });
});

describe('extractFromContent', () => {
  const longText: PackContent = {
    kind: 'text',
    name: 'pack.pdf',
    mime: 'application/pdf',
    pageCount: 6,
    pages: Array.from({ length: 6 }, (_, i) => ({ num: i + 1, text: `Page ${i + 1}. ${i === 4 ? 'Main power is 125A CEE three phase stage left.' : ''} ${'x'.repeat(10_000)}` })),
  };

  it('reads a long document in parts side by side, reporting progress', async () => {
    const seen: string[] = [];
    const { run, calls } = fakeRun((text) => {
      if (text.includes('125A CEE')) return { answers: [{ section_id: 'power', field_id: 'main', value: '125A CEE', quote: 'Main power is 125A CEE three phase stage left.', page: 5, confidence: 'high' }] };
      return { answers: [] };
    });
    const r = await extractFromContent(longText, sections, show, 0, run, { planned: (n) => seen.push(`planned ${n}`), done: () => seen.push('done') });
    // 60k characters → 3 parts of ≤ 24k.
    expect(calls).toHaveLength(3);
    expect(seen).toEqual(['planned 3', 'done', 'done', 'done']);
    expect(r.parts).toBe(3);
    expect(r.suggestions).toEqual([expect.objectContaining({ section_id: 'power', field_id: 'main', page: 5, verified: true })]);
    // A part says which pages it is; extras are fewer per part.
    expect(calls[0].content[0].text).toMatch(/part: pages 1–2 of 6/);
    expect(calls[0].system).toMatch(/up to 8 facts/);
  });

  it('keeps the other parts when one fails, and says so', async () => {
    const { run } = fakeRun((text, i) => {
      if (i === 0) return new Error('overloaded');
      if (text.includes('125A CEE')) return { answers: [{ section_id: 'power', field_id: 'main', value: '125A', quote: 'Main power is 125A CEE three phase stage left.', page: 5, confidence: 'high' }] };
      return { answers: [] };
    });
    const r = await extractFromContent(longText, sections, show, 0, run);
    expect(r.failedParts).toBe(1);
    expect(r.suggestions).toHaveLength(1);
  });

  it('reads a long scan in parts and puts its pages back on the document', async () => {
    const scan: PackContent = { kind: 'pdf', name: 'scan.pdf', mime: 'application/pdf', base64: await pdf(20), pageCount: 20 };
    const { run, calls } = fakeRun((text) =>
      text.includes('pages 13–20') ? { answers: [{ section_id: 'access', field_id: 'load_in', value: '09:00', quote: 'Load in 9am', page: 2, confidence: 'high' }] } : { answers: [] },
    );
    const r = await extractFromContent(scan, sections, show, 1, run);
    expect(calls).toHaveLength(2);
    expect(r.suggestions).toEqual([expect.objectContaining({ field_id: 'load_in', page: 14, verified: false, file: 1 })]);
  });

  it('sends a short document in one call with the full extras allowance', async () => {
    const short: PackContent = { kind: 'text', name: 'a.txt', mime: 'text/plain', pageCount: 1, pages: [{ num: 1, text: 'Load in 09:00' }] };
    const { run, calls } = fakeRun(() => ({ answers: [] }));
    await extractFromContent(short, sections, show, 0, run);
    expect(calls).toHaveLength(1);
    expect(calls[0].system).toMatch(/up to 15 facts/);
  });
});
