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

/* A GENUINE baseline JPEG (94x120), inline as base64.

   The first version of this fixture used raw RGB under FlateDecode. That is
   image-only, but it is NOT what a phone produces — Adam's files carry a
   DCTDecode JPEG. "Our synthetic fixture passes" was precisely why the real
   class went unreproduced, so the fixture now embeds real JPEG bytes and
   declares /DCTDecode, matching the profile Cowork measured instead of
   approximating it.

   Small on purpose: the JPEG only has to be REAL, not big. The file's bulk
   comes from the incompressible padding stream, which is what makes it
   phone-sized. */
const REAL_JPEG_B64 =
  '/9j/4AAQSkZJRgABAQAASABIAAD/4QBMRXhpZgAATU0AKgAAAAgAAYdpAAQAAAABAAAAGgAAAAAAA6ABAAMAAAABAAEAAKAC' +
  'AAQAAAABAAAAXqADAAQAAAABAAAAeAAAAAD/wAARCAB4AF4DASIAAhEBAxEB/8QAHwAAAQUBAQEBAQEAAAAAAAAAAAECAwQF' +
  'BgcICQoL/8QAtRAAAgEDAwIEAwUFBAQAAAF9AQIDAAQRBRIhMUEGE1FhByJxFDKBkaEII0KxwRVS0fAkM2JyggkKFhcYGRol' +
  'JicoKSo0NTY3ODk6Q0RFRkdISUpTVFVWV1hZWmNkZWZnaGlqc3R1dnd4eXqDhIWGh4iJipKTlJWWl5iZmqKjpKWmp6ipqrKz' +
  'tLW2t7i5usLDxMXGx8jJytLT1NXW19jZ2uHi4+Tl5ufo6erx8vP09fb3+Pn6/8QAHwEAAwEBAQEBAQEBAQAAAAAAAAECAwQF' +
  'BgcICQoL/8QAtREAAgECBAQDBAcFBAQAAQJ3AAECAxEEBSExBhJBUQdhcRMiMoEIFEKRobHBCSMzUvAVYnLRChYkNOEl8RcY' +
  'GRomJygpKjU2Nzg5OkNERUZHSElKU1RVVldYWVpjZGVmZ2hpanN0dXZ3eHl6goOEhYaHiImKkpOUlZaXmJmaoqOkpaanqKmq' +
  'srO0tba3uLm6wsPExcbHyMnK0tPU1dbX2Nna4uPk5ebn6Onq8vP09fb3+Pn6/9sAQwAJCQkJCQkQCQkQFhAQEBYeFhYWFh4m' +
  'Hh4eHh4mLiYmJiYmJi4uLi4uLi4uNzc3Nzc3QEBAQEBISEhISEhISEhI/9sAQwELDAwSERIfEREfSzMqM0tLS0tLS0tLS0tL' +
  'S0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tL/90ABAAG/9oADAMBAAIRAxEAPwD25pEQgOwGemT6U3z4' +
  'P769Aeo6HpWTrGk2GptEbyQoY9wTBA+9gHr1rKPhnSDGP9Ibap4OU4LLtPbuOg6DtigDq0mhkyI3VscnBBoWaFvuup+hHesm' +
  '107TreCVI5ARJGEdgRnaoIzkfWs1PDGl7Vh8+Q/dwAwBOzoeBz1/CgDq1ZXG5SCD3FOqnYWcen2kdnEzMsYwC3Jq5QAUUUUA' +
  'FFFFABRRRQB//9D1zVJrKNUS9jaQNkgAZ6Y9xWbDPogTyI7dgkjAkFTjPTJye36V09JQBifZ9JtpPISH/XgKSOQQ34+1V47r' +
  'SIZiY4nDw5AOCemenPPeujpaAIYJ0uIhMgIB9Rg8cVNRRQAUUUUAFFFFABRRRQB//9H2a5tTcOjCR0CZyFOAc+v0qD7BL5hk' +
  '+0ScjBHbt/hUl7ffYgp8qSXd/wA8xnGPWqz6uFOBBM3uF9gf6/pQA6HTZYpFc3MrbWzgng+30q3c27XChVkaPGeV68ii1uft' +
  'UZk2MmDjDCmS3oid0McjFACNq53ZzwKACO1dJ/OaVmH909Ku1nf2gPKaXynwpAxjnn2qzbXAuYhIFZP9lhgigCxRRRQAUUUU' +
  'AFFFFAH/0vZbsXxK/Y2QY+9vBOenTH41XX+1s/N5fT9eP/r1dmube3KrPIqFvuhiBnHpmkhu7W4JEEqSEddrA9PpQBFaG/yw' +
  'vAn+zsJ/XNOuvtmF+ybe+7d9OP1pn9p6dnH2iLOcY3jrnHr68VZinhnG6F1ceqkH+VAFJ/7UL/u/LC5HXP41pVVe9s4mKyTI' +
  'pHUFhxjmh72ziIEkyKSARlh0PQ/jQBaooooAKKKKACiiigD/0/ZLvT7S+x9pTcVBUHJBG7GcY6HjrUFno9jYSCS1VkIzxuJH' +
  'zYzwT7VNeXF1Bt+zQGctnOGC4/Omx3V20Jke2YMCAFBGTnqecdKAIzo+nmUz7DvPfcf72/19aksdMs9OBWzUopx8u4kcexNN' +
  '+23eP+POT/vpP/iqPtl3/wA+kn/fSe/+1QBFJolhLLJMwcNKSWw7AZIx0B9KnbS7N5BK6klRgZJ6DtUUl9equUs3J9Cy/wBM' +
  '1ctZZ5og88flMf4c5oAs0UUUAFFFFABRRRQB/9T2W6hu5Sv2abygPvfKCT9M1TFpqyn/AI+ww90FXbq8hswGmyAe4GcflVa2' +
  '1ixvHaOBmLKpYjaRwPrQASW+ptbLGlwqyg8vtzkfTtSC21QZ3XAb/gIHrU9tqFtduY4SdwGSCCOKvUAJS0UUAFFFFABRRRQA' +
  'UUUUAf/V9wowKWigBMCloooAKKKKACiiigAooooAKKKKAP/W9xooooAKKKKACiiigAooooAKKKKACiiigD//2Q==';

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

  /* The page image is a REAL JPEG (DCTDecode), like a phone's. Its own pixel
     dimensions are small; the PDF scales it to the page box, exactly what an
     iOS "Save as PDF" does with a photo. */
  const image = Buffer.from(REAL_JPEG_B64, 'base64');
  /* Padding to phone-photo size. A 1.7 KB fixture would not exercise anything
     about real uploads, and Adam's were ~500-600 KB. Incompressible by design
     (seeded noise), parked in an unreferenced stream so it changes the FILE
     without changing what renders. */
  const padding = deflateSync(noise(0xc0ffee, width * height * 3), { level: 6 });

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
      `/ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${image.length} >>`,
    image,
  );

  // Unreferenced ballast — see `padding` above.
  push(`<< /Length ${padding.length} >>`, padding);

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
  /** The image filter — /DCTDecode is what a phone camera roll produces. */
  imageFilter: string | null;
} {
  const head = buf.toString('latin1');
  const count = /\/Count\s+(\d+)/.exec(head);
  return {
    bytes: buf.length,
    hasImage: head.includes('/Subtype /Image') || head.includes('/Subtype/Image'),
    hasFont: /\/Type\s*\/Font|\/BaseFont/.test(head),
    encrypted: head.includes('/Encrypt'),
    declaredPageCount: count ? Number(count[1]) : null,
    imageFilter: head.includes('/DCTDecode') ? 'DCTDecode' : head.includes('/FlateDecode') ? 'FlateDecode' : null,
  };
}
