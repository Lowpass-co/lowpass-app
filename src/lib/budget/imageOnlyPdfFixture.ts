/* ============================================
   LOWPASS — build an IMAGE-ONLY PDF, for tests (RQ-5)

   Every PDF fixture in this suite until now was a generated TEXT pdf, which is
   why the most common real receipt — an iPhone photo saved as PDF — was never
   exercised and shipped broken. Cowork's analysis of Adam's two failing files:

     bytes 593,864 / 504,618 · pages 1 · /Image TRUE · /Font FALSE
     /Encrypt FALSE · producer "iOS Version 26.6 (Build 23G71)"

   This builds that shape: one page, one big DeviceRGB image XObject, NO font
   resources anywhere, at a realistic size. GENERATED rather than committed as a
   binary — a checked-in 600 KB blob nobody can read is a worse test artefact
   than 60 lines that state exactly what makes the class distinctive.

   Deterministic: the pixel noise comes from a seeded LCG, not Math.random, so
   the bytes are identical on every run (and Math.random is unavailable in some
   of this repo's runners anyway).

   The noise is the point of the size. A flat image compresses to nothing; a
   photo doesn't. Without it the fixture would be 3 KB and would not resemble
   what actually arrives.
   ============================================ */

import { deflateSync } from 'node:zlib';

export interface ImageOnlyPdfOptions {
  /** Image pixel width. Default lands ~600 KB, the size of Adam's real files. */
  width?: number;
  height?: number;
  /** How many identical image pages. 1 = the real-world case. */
  pages?: number;
}

/** Seeded LCG — deterministic "photo noise" that defeats Flate compression. */
function noise(seed: number, length: number): Buffer {
  const out = Buffer.allocUnsafe(length);
  let s = seed >>> 0;
  for (let i = 0; i < length; i++) {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    out[i] = (s >>> 16) & 0xff;
  }
  return out;
}

/**
 * A single-page (or N-page) PDF whose only content is a raster image.
 * No /Font, no text operators — exactly what a phone "Save as PDF" produces.
 */
export function buildImageOnlyPdf(opts: ImageOnlyPdfOptions = {}): Buffer {
  /* 410×500 RGB = ~615 KB raw. The noise below is incompressible by design, so
     raw size IS final size — which is how the fixture lands in the same band as
     the real files (593,864 / 504,618 bytes) rather than at 3 MB or at 3 KB. */
  const width = opts.width ?? 410;
  const height = opts.height ?? 500;
  const pages = Math.max(1, opts.pages ?? 1);

  // RGB pixel data. Seeded noise over a light background, so it reads as a
  // photograph to a compressor rather than as a solid fill.
  const raw = noise(0xc0ffee, width * height * 3);
  const image = deflateSync(raw, { level: 6 });

  const objects: string[] = [];
  const binary: Array<Buffer | null> = [];

  const push = (body: string, bin: Buffer | null = null): number => {
    objects.push(body);
    binary.push(bin);
    return objects.length; // 1-based object number
  };

  // 1 catalog, 2 pages tree — reserved by convention, filled at the end.
  push(''); // 1
  push(''); // 2

  const imgNum = push(
    `<< /Type /XObject /Subtype /Image /Width ${width} /Height ${height} ` +
      `/ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /FlateDecode /Length ${image.length} >>`,
    image,
  );

  const kids: number[] = [];
  for (let i = 0; i < pages; i++) {
    // The ONLY content: place the image over the whole page. No text, no font.
    const content = `q ${width} 0 0 ${height} 0 0 cm /Im0 Do Q`;
    const contentNum = push(`<< /Length ${content.length} >>\nstream\n${content}\nendstream`);
    const pageNum = push(
      `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${width} ${height}] ` +
        `/Resources << /XObject << /Im0 ${imgNum} 0 R >> >> /Contents ${contentNum} 0 R >>`,
    );
    kids.push(pageNum);
  }

  objects[0] = '<< /Type /Catalog /Pages 2 0 R >>';
  objects[1] = `<< /Type /Pages /Kids [${kids.map((k) => `${k} 0 R`).join(' ')}] /Count ${pages} >>`;

  // Assemble with a real xref table — pdf-parse and the API both want one.
  const chunks: Buffer[] = [Buffer.from('%PDF-1.4\n%\xE2\xE3\xCF\xD3\n', 'latin1')];
  let offset = chunks[0].length;
  const offsets: number[] = [];

  for (let i = 0; i < objects.length; i++) {
    offsets[i] = offset;
    const head = Buffer.from(`${i + 1} 0 obj\n${objects[i]}\n`, 'latin1');
    const bin = binary[i];
    const parts = bin
      ? [head, Buffer.from('stream\n', 'latin1'), bin, Buffer.from('\nendstream\n', 'latin1'), Buffer.from('endobj\n', 'latin1')]
      : [head, Buffer.from('endobj\n', 'latin1')];
    for (const part of parts) {
      chunks.push(part);
      offset += part.length;
    }
  }

  const xrefAt = offset;
  let xref = `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  for (const o of offsets) xref += `${String(o).padStart(10, '0')} 00000 n \n`;
  xref += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefAt}\n%%EOF`;
  chunks.push(Buffer.from(xref, 'latin1'));

  return Buffer.concat(chunks);
}

/** Structural facts a test can assert, mirroring Cowork's analysis of the real files. */
export function describePdf(buf: Buffer): {
  bytes: number;
  hasImage: boolean;
  hasFont: boolean;
  encrypted: boolean;
  declaredPageCount: number | null;
} {
  const head = buf.toString('latin1');
  const count = /\/Count\s+(\d+)/.exec(head);
  return {
    bytes: buf.length,
    hasImage: head.includes('/Subtype /Image') || head.includes('/Subtype/Image'),
    hasFont: /\/Type\s*\/Font|\/BaseFont/.test(head),
    encrypted: head.includes('/Encrypt'),
    declaredPageCount: count ? Number(count[1]) : null,
  };
}
