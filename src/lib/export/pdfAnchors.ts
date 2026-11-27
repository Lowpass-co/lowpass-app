/* ============================================
   LOWPASS — which page each #anchor landed on (Nov 2026)

   A printed contents list needs page numbers, and print pagination isn't
   visible to the page's own script. Chromium does write every `<a href="#x">`
   target into the PDF as a named destination (/Dests, or the /Names tree)
   pointing at its page — so render once, read them back here, render again
   with the numbers filled in (the numbers sit in a fixed-width cell, so the
   second pass paginates the same). Server only; pdf-lib.
   ============================================ */

import { PDFArray, PDFDict, PDFDocument, PDFHexString, PDFName, PDFRef, PDFString, type PDFObject } from 'pdf-lib';

function pageRefOf(dest: PDFObject | undefined, doc: PDFDocument): PDFRef | null {
  let d: PDFObject | undefined = dest;
  if (d instanceof PDFRef) d = doc.context.lookup(d);
  if (d instanceof PDFDict) d = d.get(PDFName.of('D'));
  if (d instanceof PDFRef) d = doc.context.lookup(d);
  if (!(d instanceof PDFArray) || d.size() === 0) return null;
  const first = d.get(0);
  return first instanceof PDFRef ? first : null;
}

function keyText(k: PDFObject): string | null {
  if (k instanceof PDFName) return k.decodeText();
  if (k instanceof PDFString || k instanceof PDFHexString) return k.decodeText();
  return null;
}

/** Walk a name tree (/Names [k v k v …] or /Kids [...]). */
function walkNameTree(node: PDFObject | undefined, doc: PDFDocument, out: Array<[string, PDFObject]>, depth = 0): void {
  if (depth > 20) return;
  const n = node instanceof PDFRef ? doc.context.lookup(node) : node;
  if (!(n instanceof PDFDict)) return;
  const names = n.lookup(PDFName.of('Names'));
  if (names instanceof PDFArray) {
    for (let i = 0; i + 1 < names.size(); i += 2) {
      const k = keyText(names.get(i));
      if (k !== null) out.push([k, names.get(i + 1)]);
    }
  }
  const kids = n.lookup(PDFName.of('Kids'));
  if (kids instanceof PDFArray) for (let i = 0; i < kids.size(); i++) walkNameTree(kids.get(i), doc, out, depth + 1);
}

/** anchor name → 1-based page number, for every named destination in the
 *  PDF. Empty when there are none or the PDF can't be read. */
export async function anchorPages(pdf: Uint8Array): Promise<Record<string, number>> {
  try {
    const doc = await PDFDocument.load(pdf, { updateMetadata: false });
    const pageNo = new Map<string, number>();
    doc.getPages().forEach((p, i) => pageNo.set(p.ref.toString(), i + 1));
    const entries: Array<[string, PDFObject]> = [];
    const dests = doc.catalog.lookup(PDFName.of('Dests'));
    if (dests instanceof PDFDict) for (const [k, v] of dests.entries()) entries.push([k.decodeText(), v]);
    const names = doc.catalog.lookup(PDFName.of('Names'));
    if (names instanceof PDFDict) walkNameTree(names.get(PDFName.of('Dests')), doc, entries);
    const out: Record<string, number> = {};
    for (const [name, dest] of entries) {
      const ref = pageRefOf(dest, doc);
      const n = ref ? pageNo.get(ref.toString()) : undefined;
      if (n) out[name] = n;
    }
    return out;
  } catch {
    return {};
  }
}
