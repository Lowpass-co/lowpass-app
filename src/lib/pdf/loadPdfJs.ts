'use client';

/* The browser's pdf.js, loaded once (advance info packs + parking venue
   drawings). The prebuilt minified bundle: webpack re-processing pdf.mjs
   breaks it ("Object.defineProperty called on non-object"). Each caller
   narrows the module to the few calls it makes. */

let pdfjsPromise: Promise<unknown> | null = null;

export function loadPdfJs<T>(): Promise<T> {
  if (!pdfjsPromise) {
    pdfjsPromise = import(/* webpackIgnore: false */ 'pdfjs-dist/build/pdf.min.mjs').then((m) => {
      const pdfjs = m as { GlobalWorkerOptions: { workerSrc: string } };
      pdfjs.GlobalWorkerOptions.workerSrc = new URL('pdfjs-dist/build/pdf.worker.min.mjs', import.meta.url).toString();
      return pdfjs;
    });
  }
  return pdfjsPromise as Promise<T>;
}
