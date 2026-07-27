/* ============================================
   LOWPASS — what KIND of file is this, really? (RQ-5 FINAL)

   Adam dropped two receipts through the real drop zone. Both saved, neither
   scanned, both showed "Missing vendor, date, amount". Pressing Re-scan on one
   fixed it instantly — same file, same route, same receipt.

   The difference was the gate. Re-scan rebuilds the File from the STORED blob,
   whose media type Supabase reports authoritatively. The upload path trusted
   `file.type` as the browser reported it at drag time — and a browser hands over
   an empty or generic type routinely: files dragged from Finder, files whose
   name confuses the OS's type lookup, files from a share sheet. When the type
   didn't match, isScannable() returned false and the scan was SILENTLY SKIPPED.

   So the receipt looked unreadable when nothing had ever tried to read it, and
   the only cure was a button nobody would think to press.

   THE RULE, in one place because it has to hold on BOTH sides: a file's type is
   what the browser says WHEN THAT IS USABLE, and otherwise what its extension
   says. The route applies the same function to what it receives, so it does not
   depend on any client getting this right.

   Extension is the fallback, not the primary: a browser that reports
   "image/png" for a file named .txt knows something we don't, and the content is
   what matters to Vision.
   ============================================ */

/** Media types Vision takes directly. */
export const IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'] as const;
export const PDF_TYPE = 'application/pdf';

/* Types a browser reports when it means "I don't know". Treating these as fact
   is what skipped the scan — they carry no information, so we fall through to
   the extension rather than refusing the file. */
const UNINFORMATIVE = new Set(['', 'application/octet-stream', 'binary/octet-stream', 'unknown']);

const BY_EXTENSION: Record<string, string> = {
  pdf: PDF_TYPE,
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  webp: 'image/webp',
  gif: 'image/gif',
};

/** The extension, lowercased, from a filename that may contain dots and spaces. */
export function extensionOf(fileName: string | null | undefined): string {
  const name = (fileName ?? '').trim();
  const dot = name.lastIndexOf('.');
  if (dot < 0 || dot === name.length - 1) return '';
  return name.slice(dot + 1).toLowerCase();
}

/**
 * The media type to actually use, or null when the file isn't a receipt at all.
 *
 * `reported` wins when it is a type we can use. Otherwise the extension decides.
 * Returns null for anything that is neither — a .csv is not a receipt however it
 * is labelled, and refusing it is correct.
 */
export function effectiveMediaType(
  fileName: string | null | undefined,
  reported: string | null | undefined,
): string | null {
  const r = (reported ?? '').trim().toLowerCase();
  if (!UNINFORMATIVE.has(r)) {
    if (r === PDF_TYPE) return PDF_TYPE;
    if ((IMAGE_TYPES as readonly string[]).includes(r)) return r;
    /* A reported type we don't support (text/csv, application/zip…) is a real
       answer: refuse it. Falling through to the extension here would let
       "invoice.pdf.zip" masquerade as a PDF. */
    return null;
  }
  return BY_EXTENSION[extensionOf(fileName)] ?? null;
}

/** True when we should send this file to the scanner. */
export function isScannableFile(
  fileName: string | null | undefined,
  reported: string | null | undefined,
): boolean {
  return effectiveMediaType(fileName, reported) !== null;
}
