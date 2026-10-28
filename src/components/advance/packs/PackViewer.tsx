'use client';

/* ============================================
   <PackViewer> — shows a venue pack with the source of an answer highlighted.

   PDFs render with pdf.js; the quote the AI used is found in the page's text
   layer (same normalisation as the server's findQuote) and boxed. When the
   quote can't be found (a scan, or the AI paraphrased) the page itself is
   outlined instead — it never draws a box in the wrong place. Images are
   outlined whole. The box glides between answers.
   ============================================ */

import { useEffect, useRef, useState } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { normaliseForMatch } from '@/lib/advance/packs';

type PdfDoc = { numPages: number; getPage: (n: number) => Promise<PdfPage>; destroy: () => Promise<void> };
type PdfPage = {
  getViewport: (o: { scale: number }) => { width: number; height: number; scale: number; transform: number[] };
  render: (o: { canvasContext: CanvasRenderingContext2D; viewport: unknown; canvas?: HTMLCanvasElement }) => { promise: Promise<void>; cancel: () => void };
  getTextContent: () => Promise<{ items: { str?: string; transform?: number[]; width?: number }[] }>;
};
type PdfJs = {
  getDocument: (src: { url: string }) => { promise: Promise<PdfDoc> };
  GlobalWorkerOptions: { workerSrc: string };
  Util: { transform: (a: number[], b: number[]) => number[] };
};

let pdfjsPromise: Promise<PdfJs> | null = null;
function loadPdfJs(): Promise<PdfJs> {
  if (!pdfjsPromise) {
    pdfjsPromise = import('pdfjs-dist').then((m) => {
      const pdfjs = m as unknown as PdfJs;
      pdfjs.GlobalWorkerOptions.workerSrc = new URL('pdfjs-dist/build/pdf.worker.min.mjs', import.meta.url).toString();
      return pdfjs;
    });
  }
  return pdfjsPromise;
}

interface Box { left: number; top: number; width: number; height: number }

/** Boxes for the text items covering the quote, or null if it isn't on the page. */
export function locateQuote(items: { str: string; rect: Box }[], quote: string): Box[] | null {
  const q = normaliseForMatch(quote);
  if (q.length < 3) return null;
  let joined = '';
  const spans: { start: number; end: number; rect: Box }[] = [];
  for (const it of items) {
    const n = normaliseForMatch(it.str);
    if (!n) continue;
    if (joined) joined += ' ';
    spans.push({ start: joined.length, end: joined.length + n.length, rect: it.rect });
    joined += n;
  }
  let at = joined.indexOf(q);
  if (at < 0) {
    // Hyphenation / line-break joins: try without spaces.
    const squash = (s: string) => s.replace(/ /g, '');
    const map: number[] = [];
    let sq = '';
    for (let i = 0; i < joined.length; i++) if (joined[i] !== ' ') { map.push(i); sq += joined[i]; }
    const j = sq.indexOf(squash(q));
    if (j < 0) return null;
    at = map[j];
    const endIdx = map[j + squash(q).length - 1] + 1;
    return spans.filter((s) => s.end > at && s.start < endIdx).map((s) => s.rect);
  }
  const end = at + q.length;
  return spans.filter((s) => s.end > at && s.start < end).map((s) => s.rect);
}

function union(boxes: Box[]): Box[] {
  // Merge items on the same line into one box per line.
  const lines: Box[] = [];
  for (const b of [...boxes].sort((a, c) => a.top - c.top || a.left - c.left)) {
    const l = lines.find((x) => Math.abs(x.top - b.top) < b.height * 0.6);
    if (l) {
      const right = Math.max(l.left + l.width, b.left + b.width);
      l.left = Math.min(l.left, b.left);
      l.width = right - l.left;
      l.height = Math.max(l.height, b.height);
    } else lines.push({ ...b });
  }
  return lines;
}

export function PackViewer({
  url,
  kind,
  page,
  quote,
  label,
  textPages,
  onPage,
}: {
  url: string | null;
  kind: 'pdf' | 'image' | 'text';
  page: number | null;
  quote: string | null;
  label: string | null;
  textPages?: { num: number; text: string }[];
  onPage?: (n: number) => void;
}) {
  const wrap = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const [doc, setDoc] = useState<PdfDoc | null>(null);
  const [pdfjs, setPdfjs] = useState<PdfJs | null>(null);
  const [num, setNum] = useState(page ?? 1);
  const [boxes, setBoxes] = useState<Box[] | null>(null);
  const [size, setSize] = useState<{ w: number; h: number } | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => setNum(page ?? 1), [page]);

  useEffect(() => {
    if (kind !== 'pdf' || !url) return;
    let live = true;
    let d: PdfDoc | null = null;
    setFailed(false);
    loadPdfJs()
      .then((p) => {
        setPdfjs(p);
        return p.getDocument({ url }).promise;
      })
      .then((x) => {
        d = x;
        if (live) setDoc(x);
      })
      .catch(() => live && setFailed(true));
    return () => {
      live = false;
      void d?.destroy();
    };
  }, [url, kind]);

  useEffect(() => {
    if (!doc || !pdfjs || !canvas.current || !wrap.current) return;
    let cancelled = false;
    let task: { cancel: () => void } | null = null;
    (async () => {
      const n = Math.min(Math.max(1, num), doc.numPages);
      const pg = await doc.getPage(n);
      const avail = Math.max(320, (wrap.current?.clientWidth ?? 600) - 32);
      const base = pg.getViewport({ scale: 1 });
      const scale = Math.min(2, avail / base.width);
      const vp = pg.getViewport({ scale });
      const ratio = window.devicePixelRatio || 1;
      const c = canvas.current!;
      c.width = Math.floor(vp.width * ratio);
      c.height = Math.floor(vp.height * ratio);
      c.style.width = `${vp.width}px`;
      c.style.height = `${vp.height}px`;
      const ctx = c.getContext('2d')!;
      ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
      const r = pg.render({ canvasContext: ctx, viewport: vp, canvas: c });
      task = r;
      await r.promise;
      if (cancelled) return;
      setSize({ w: vp.width, h: vp.height });
      if (!quote) {
        setBoxes(null);
        return;
      }
      const tc = await pg.getTextContent();
      const items = tc.items
        .filter((it) => typeof it.str === 'string' && it.transform)
        .map((it) => {
          const t = pdfjs.Util.transform(vp.transform, it.transform!);
          const h = Math.hypot(t[2], t[3]);
          return { str: it.str!, rect: { left: t[4], top: t[5] - h, width: (it.width ?? 0) * vp.scale, height: h * 1.15 } };
        });
      const found = locateQuote(items, quote);
      if (!cancelled) setBoxes(found && found.length ? union(found) : null);
    })().catch(() => {});
    return () => {
      cancelled = true;
      task?.cancel();
    };
  }, [doc, pdfjs, num, quote]);

  const pages = kind === 'pdf' ? doc?.numPages ?? null : kind === 'text' ? textPages?.length ?? 1 : 1;
  const go = (n: number) => {
    setNum(n);
    onPage?.(n);
  };

  const first = boxes?.[0];
  return (
    <div ref={wrap} style={{ flex: 1, minHeight: 0, overflow: 'auto', padding: 16, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10 }}>
      {pages && pages > 1 ? (
        <div className="adv-row-flex" style={{ gap: 6, fontSize: 'var(--lp-text-xs)', color: 'var(--lp-text-tertiary)' }}>
          <button type="button" className="adv-btn adv-btn-sm adv-btn-ghost" aria-label="Previous page" disabled={num <= 1} onClick={() => go(num - 1)}><ChevronLeft size={14} aria-hidden /></button>
          <span className="adv-mono">p. {num} of {pages}</span>
          <button type="button" className="adv-btn adv-btn-sm adv-btn-ghost" aria-label="Next page" disabled={num >= pages} onClick={() => go(num + 1)}><ChevronRight size={14} aria-hidden /></button>
        </div>
      ) : null}

      {kind === 'pdf' ? (
        failed ? (
          <div className="adv-muted" style={{ padding: 40, fontSize: 'var(--lp-text-sm)' }}>Couldn’t show this file.</div>
        ) : (
          <div className="adv-page-wrap" style={size ? { width: size.w, height: size.h } : undefined}>
            <canvas ref={canvas} aria-label={`Page ${num}`} role="img" />
            {boxes
              ? boxes.map((b, i) => <span key={i} className="adv-hl" style={{ left: b.left - 3, top: b.top - 2, width: b.width + 6, height: b.height + 4 }} />)
              : quote && size ? <span key={`wash-${num}-${quote}`} className="adv-page-wash" /> : null}
            {first && label ? <span className="adv-hl-tag" style={{ left: Math.min(first.left, (size?.w ?? 400) - 140), top: Math.max(0, first.top - 26) }}>{label}</span> : null}
          </div>
        )
      ) : kind === 'image' ? (
        url ? (
          <div className="adv-page-wrap">
            {/* eslint-disable-next-line @next/next/no-img-element -- a signed storage URL, not a static asset */}
            <img src={url} alt={label ?? 'Venue document'} style={{ maxWidth: '100%', height: 'auto' }} />
            {quote ? <span className="adv-page-wash" /> : null}
          </div>
        ) : null
      ) : (
        <div style={{ width: '100%', maxWidth: 720, background: 'var(--lp-panel)', border: '1px solid var(--lp-border)', borderRadius: 8, padding: 20, whiteSpace: 'pre-wrap', fontSize: 'var(--lp-text-sm)', lineHeight: 1.6 }}>
          <TextPage text={textPages?.find((p) => p.num === num)?.text ?? ''} quote={quote} />
        </div>
      )}
    </div>
  );
}

function TextPage({ text, quote }: { text: string; quote: string | null }) {
  const ref = useRef<HTMLElement>(null);
  useEffect(() => ref.current?.scrollIntoView({ block: 'center', behavior: 'smooth' }), [quote]);
  if (!quote) return <>{text}</>;
  const i = text.toLowerCase().indexOf(quote.toLowerCase().slice(0, 60));
  if (i < 0) return <>{text}</>;
  return (
    <>
      {text.slice(0, i)}
      <mark ref={ref} style={{ background: '#FF45002E', color: 'inherit', boxShadow: 'inset 0 0 0 1.5px var(--lp-orange)', borderRadius: 3 }}>{text.slice(i, i + quote.length)}</mark>
      {text.slice(i + quote.length)}
    </>
  );
}
