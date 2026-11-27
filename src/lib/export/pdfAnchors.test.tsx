import { describe, expect, it } from 'vitest';
import { PDFDocument, PDFName, PDFString } from 'pdf-lib';
import { anchorPages } from './pdfAnchors';

async function pdfWith(dests: Record<string, number>, asNameTree: boolean): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const pages = [doc.addPage(), doc.addPage(), doc.addPage()];
  const ctx = doc.context;
  const entries = Object.entries(dests).map(([k, i]) => [k, ctx.obj([pages[i - 1].ref, PDFName.of('XYZ'), 0, 0, 0])] as const);
  if (asNameTree) {
    const names = ctx.obj(entries.flatMap(([k, v]) => [PDFString.of(k), v]));
    doc.catalog.set(PDFName.of('Names'), ctx.obj({ Dests: ctx.obj({ Kids: [ctx.register(ctx.obj({ Names: names }))] }) }));
  } else {
    doc.catalog.set(PDFName.of('Dests'), ctx.obj(Object.fromEntries(entries)));
  }
  return doc.save();
}

describe('anchorPages', () => {
  it('reads /Dests (what Chromium writes)', async () => {
    expect(await anchorPages(await pdfWith({ 'h-audio': 2, 'h-hosp': 3 }, false))).toEqual({ 'h-audio': 2, 'h-hosp': 3 });
  });
  it('reads a /Names tree too', async () => {
    expect(await anchorPages(await pdfWith({ 'h-a': 1, 'h-b': 3 }, true))).toEqual({ 'h-a': 1, 'h-b': 3 });
  });
  it('nothing readable → empty, never throws', async () => {
    expect(await anchorPages(new Uint8Array([1, 2, 3]))).toEqual({});
    expect(await anchorPages(await pdfWith({}, false))).toEqual({});
  });
});
