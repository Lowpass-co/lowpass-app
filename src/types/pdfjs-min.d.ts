/* The prebuilt pdf.js bundle PackViewer loads (webpack re-processing pdf.mjs
   breaks it). It ships no types of its own; PackViewer narrows it to the few
   calls it makes. */
declare module 'pdfjs-dist/build/pdf.min.mjs';
