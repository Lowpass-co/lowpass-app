'use client';

/* ============================================
   <DrawingSetup> — put a venue drawing on the map (Nov 2026, Adam)

   Three steps, over the left of the map (the map stays live on the right
   for the pin clicks):

     1. Crop    drag a box round the part that matters (title blocks,
                logos and half a mile of road stay off the map)
     2. Scale   click both ends of a dimension printed on the drawing and
                type it ("16" m); then, ideally, a second one — the two must
                agree, or the clicks / the drawing are off
     3. Place   pin to the satellite: a point on the drawing, the same point
                on the map, twice (rotation + position; the drawing keeps its
                own scale and the satellite's disagreement is shown), or
                place by hand at the middle of the screen. Inside a building?
                Its floor and clear height.

   Only numbers leave here (model.ts ParkingDrawing): source units, metres,
   degrees — never this pane's pixels.
   ============================================ */

import { useCallback, useEffect, useRef, useState, type PointerEvent as ReactPointerEvent, type WheelEvent as ReactWheelEvent } from 'react';
import { Minus, Plus, Sparkles, X } from 'lucide-react';
import { CHECK_WARN_PCT, PIN_WARN_PCT, agreement, pinDrawing, placeAt, scaleFromDimension } from '@/lib/parking/drawings';
import { fmtMetres, type Pt, type View } from '@/lib/parking/geo';
import { LIMITS, newItemId, type ParkingDrawing, type SrcPt } from '@/lib/parking/model';
import { canvasUrl, openDrawing, pageCount, pageSize, renderRegion, type DrawingFileRef, type DrawingSource } from './drawingRaster';
import { OVERVIEW_MAX_PX, REFINE_PX, endBox, pickDimensions, rotationFromNorth, toSourcePt, type OverviewRead, type PxPt } from '@/lib/parking/drawingRead';
import { aiCapMessage, detectAiCap } from '@/lib/ai/client';
import { resolvePalette } from './palette';

type Step = 'crop' | 'scale' | 'place';
type Crop = ParkingDrawing['crop'];

export interface DrawingSetupProps {
  file: DrawingFileRef;
  /** Setting up an existing drawing again: its page, crop and dimensions are kept. */
  initial?: ParkingDrawing;
  satelliteOn: boolean;
  view: View;
  /** POST here to have AI read the drawing (crop, dimensions, north). */
  readUrl: string;
  /** Wait for a click on the map (null if cancelled). */
  requestMapPoint: (prompt: string) => Promise<Pt | null>;
  /** Numbered pins to show on the map while pinning. */
  onMarks: (pts: Pt[]) => void;
  /** The drawing as placed so far, shown on the map (null = nothing yet). */
  onPreview: (d: ParkingDrawing | null) => void;
  onDone: (d: ParkingDrawing) => void;
  onCancel: () => void;
}

const fmtNum = (n: number) => (Number.isFinite(n) ? String(Math.round(n * 1000) / 1000) : '');
const parseM = (s: string) => {
  const n = Number(s.replace(',', '.').replace(/m$/i, '').trim());
  return Number.isFinite(n) && n > 0 ? n : null;
};

export function DrawingSetup({ file, initial, satelliteOn, view, readUrl, requestMapPoint, onMarks, onPreview, onDone, onCancel }: DrawingSetupProps) {
  const [src, setSrc] = useState<DrawingSource | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [page, setPage] = useState(initial?.page ?? 1);
  const [size, setSize] = useState<{ w: number; h: number } | null>(initial ? { w: initial.srcW, h: initial.srcH } : null);
  const [preview, setPreview] = useState<{ url: string; k: number } | null>(null);
  const [step, setStep] = useState<Step>(initial ? 'scale' : 'crop');
  const [crop, setCrop] = useState<Crop | null>(initial?.crop ?? null);

  // Scale
  const [dim, setDim] = useState<SrcPt[]>(initial?.calib ? [initial.calib.a, initial.calib.b] : []);
  const [metres, setMetres] = useState(initial?.calib ? fmtNum(initial.calib.metres) : '');
  const [chk, setChk] = useState<SrcPt[]>(initial?.calib?.check ? [initial.calib.check.a, initial.calib.check.b] : []);
  const [chkMetres, setChkMetres] = useState(initial?.calib?.check ? fmtNum(initial.calib.check.metres) : '');
  const [measuring, setMeasuring] = useState<'dim' | 'check'>('dim');

  // Place
  const [pinSrc, setPinSrc] = useState<SrcPt[]>([]);
  const [pinGround, setPinGround] = useState<Pt[]>([]);
  const [waitingMap, setWaitingMap] = useState(false);
  const [placed, setPlaced] = useState<Pick<ParkingDrawing, 'x' | 'y' | 'rotation' | 'pinned' | 'pinCheck'> | null>(
    initial ? { x: initial.x, y: initial.y, rotation: initial.rotation, pinned: initial.pinned, pinCheck: initial.pinCheck } : null,
  );
  const [inside, setInside] = useState(initial?.inside ?? false);
  const [floor, setFloor] = useState(fmtNum(initial?.floor ?? 0));
  const [clear, setClear] = useState(initial?.clearHeight != null ? fmtNum(initial.clearHeight) : '');
  // AI read (crop, two dimensions, north) — proposals the person checks.
  const [reading, setReading] = useState<string | null>(null);
  const [aiNote, setAiNote] = useState<string | null>(null);
  const [north, setNorth] = useState<number | null>(null);

  /* ── Open the file, render the page for this pane ─────────── */
  useEffect(() => {
    let dead = false;
    openDrawing(file)
      .then((s) => !dead && setSrc(s))
      .catch((e: unknown) => !dead && setError(e instanceof Error ? e.message : 'The drawing couldn’t be opened.'));
    return () => {
      dead = true;
    };
  }, [file]);

  useEffect(() => {
    if (!src) return;
    let dead = false;
    let url: string | null = null;
    (async () => {
      const sz = await pageSize(src, page);
      if (dead) return;
      setSize(sz);
      setCrop((c) => (c && c.u1 <= sz.w + 0.5 && c.v1 <= sz.h + 0.5 ? c : { u0: 0, v0: 0, u1: sz.w, v1: sz.h }));
      const canvas = await renderRegion(src, page, { u0: 0, v0: 0, u1: sz.w, v1: sz.h }, resolvePalette().paper, 2400);
      url = await canvasUrl(canvas);
      if (dead) return URL.revokeObjectURL(url);
      setPreview({ url, k: canvas.width / sz.w });
    })().catch((e: unknown) => !dead && setError(e instanceof Error ? e.message : 'The page couldn’t be drawn.'));
    return () => {
      dead = true;
      if (url) URL.revokeObjectURL(url);
    };
  }, [src, page]);

  /* ── Pane: zoom / pan, source ↔ pane pixels ──────────────── */
  const pane = useRef<HTMLDivElement>(null);
  const [paneSize, setPaneSize] = useState({ w: 0, h: 0 });
  const [cam, setCam] = useState<{ z: number; x: number; y: number } | null>(null);
  useEffect(() => {
    const el = pane.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setPaneSize({ w: e.contentRect.width, h: e.contentRect.height }));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  const fit = useCallback(
    (r: Crop) => {
      if (!paneSize.w) return;
      const z = Math.min(paneSize.w / (r.u1 - r.u0), paneSize.h / (r.v1 - r.v0)) * 0.92;
      setCam({ z, x: paneSize.w / 2 - ((r.u0 + r.u1) / 2) * z, y: paneSize.h / 2 - ((r.v0 + r.v1) / 2) * z });
    },
    [paneSize.w, paneSize.h],
  );
  useEffect(() => {
    if (size && paneSize.w && !cam) fit(initial?.crop ?? { u0: 0, v0: 0, u1: size.w, v1: size.h });
  }, [size, paneSize.w, cam, fit, initial]);

  const toSrc = (e: { clientX: number; clientY: number }): SrcPt => {
    const r = pane.current!.getBoundingClientRect();
    const c = cam!;
    return { u: (e.clientX - r.left - c.x) / c.z, v: (e.clientY - r.top - c.y) / c.z };
  };
  const toPane = (p: SrcPt) => ({ x: p.u * (cam?.z ?? 1) + (cam?.x ?? 0), y: p.v * (cam?.z ?? 1) + (cam?.y ?? 0) });
  const zoomBy = (f: number, at?: { x: number; y: number }) =>
    setCam((c) => {
      if (!c) return c;
      const ax = at?.x ?? paneSize.w / 2;
      const ay = at?.y ?? paneSize.h / 2;
      const z = Math.max(0.02, Math.min(40, c.z * f));
      return { z, x: ax - ((ax - c.x) * z) / c.z, y: ay - ((ay - c.y) * z) / c.z };
    });
  const onWheel = (e: ReactWheelEvent) => {
    if (!cam) return;
    const r = pane.current!.getBoundingClientRect();
    if (e.ctrlKey || e.metaKey) zoomBy(Math.exp(-e.deltaY * 0.01), { x: e.clientX - r.left, y: e.clientY - r.top });
    else setCam({ ...cam, x: cam.x - e.deltaX, y: cam.y - e.deltaY });
  };

  // Press: drag pans (or draws the crop in step 1); a click (no move) picks a point.
  const press = useRef<{ x: number; y: number; cam: { z: number; x: number; y: number }; at: SrcPt; moved: boolean } | null>(null);
  const onDown = (e: ReactPointerEvent) => {
    if (!cam || e.button !== 0) return;
    e.stopPropagation();
    pane.current?.setPointerCapture?.(e.pointerId);
    press.current = { x: e.clientX, y: e.clientY, cam, at: toSrc(e), moved: false };
  };
  const onMove = (e: ReactPointerEvent) => {
    const p = press.current;
    if (!p) return;
    if (!p.moved && Math.hypot(e.clientX - p.x, e.clientY - p.y) < 4) return;
    p.moved = true;
    if (step === 'crop' && size) {
      const q = toSrc(e);
      const cl = (v: number, hi: number) => Math.max(0, Math.min(hi, v));
      setCrop({ u0: cl(Math.min(p.at.u, q.u), size.w), v0: cl(Math.min(p.at.v, q.v), size.h), u1: cl(Math.max(p.at.u, q.u), size.w), v1: cl(Math.max(p.at.v, q.v), size.h) });
    } else setCam({ ...p.cam, x: p.cam.x + e.clientX - p.x, y: p.cam.y + e.clientY - p.y });
  };
  const onUp = () => {
    const p = press.current;
    press.current = null;
    if (!p || p.moved) return;
    if (step === 'scale') {
      const set = measuring === 'dim' ? setDim : setChk;
      set((list) => (list.length >= 2 ? [p.at] : [...list, p.at]));
    } else if (step === 'place' && !waitingMap && pinSrc.length === pinGround.length && pinSrc.length < 2) {
      void pinPoint(p.at);
    }
  };

  /* ── AI: read the drawing ──────────────────────────────────── */
  const ask = async (body: unknown) => {
    const r = await fetch(readUrl, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    const cap = await detectAiCap(r);
    if (cap) throw new Error(aiCapMessage(cap));
    const j = (await r.json().catch(() => ({}))) as { error?: string };
    if (!r.ok) throw new Error(j.error ?? `The drawing couldn’t be read (${r.status}).`);
    return j;
  };
  const encode = (c: HTMLCanvasElement) => {
    // JPEG keeps a line drawing well under the 3.5 MB the route takes.
    let q = 0.85;
    let url = c.toDataURL('image/jpeg', q);
    while (url.length > 4_400_000 && q > 0.4) url = c.toDataURL('image/jpeg', (q -= 0.15));
    return { data: url.slice(url.indexOf(',') + 1), type: 'image/jpeg', w: c.width, h: c.height };
  };
  const readForMe = async () => {
    if (!src || !size || reading) return;
    const paper = resolvePalette().paper;
    const whole = { u0: 0, v0: 0, u1: size.w, v1: size.h };
    const clamp = (b: Crop): Crop => ({ u0: Math.max(0, b.u0), v0: Math.max(0, b.v0), u1: Math.min(size.w, b.u1), v1: Math.min(size.h, b.v1) });
    setError(null);
    setAiNote(null);
    try {
      setReading('Reading the drawing…');
      const page0 = await renderRegion(src, page, whole, paper, OVERVIEW_MAX_PX);
      const ov = (await ask({ stage: 'overview', image: encode(page0) })) as OverviewRead;
      const pageImg = { w: page0.width, h: page0.height };
      const toSrc = (p: PxPt) => toSourcePt(p, whole, pageImg);
      const picked = pickDimensions(ov.dimensions ?? []);
      // Close-ups round both ends of each dimension: the model points again, ~15× finer.
      const refined: { a: SrcPt; b: SrcPt; metres: number; text: string }[] = [];
      for (const [i, d] of picked.entries()) {
        setReading(`Measuring ${d.text} (${i + 1} of ${picked.length})…`);
        const a = toSrc(d.a);
        const b = toSrc(d.b);
        const len = Math.hypot(b.u - a.u, b.v - a.v);
        const boxes = [clamp(endBox(a, len, size)), clamp(endBox(b, len, size))] as const;
        const shots = await Promise.all(boxes.map((bx) => renderRegion(src, page, bx, paper, REFINE_PX, true)));
        const angle = (Math.atan2(b.v - a.v, b.u - a.u) * 180) / Math.PI;
        const r = (await ask({ stage: 'refine', text: d.text, metres: d.metres, angle, images: shots.map(encode) })) as { ends: (PxPt | null)[] };
        refined.push({
          a: r.ends[0] ? toSourcePt(r.ends[0], boxes[0], { w: shots[0].width, h: shots[0].height }) : a,
          b: r.ends[1] ? toSourcePt(r.ends[1], boxes[1], { w: shots[1].width, h: shots[1].height }) : b,
          metres: d.metres,
          text: d.text,
        });
      }
      if (ov.crop) {
        const tl = toSrc({ x: ov.crop.x0, y: ov.crop.y0 });
        const br = toSrc({ x: ov.crop.x1, y: ov.crop.y1 });
        const next = clamp({ u0: tl.u, v0: tl.v, u1: br.u, v1: br.v });
        setCrop(next);
        fit(next);
      }
      setNorth(ov.north);
      if (refined[0]) {
        setDim([refined[0].a, refined[0].b]);
        setMetres(fmtNum(refined[0].metres));
      }
      if (refined[1]) {
        setChk([refined[1].a, refined[1].b]);
        setChkMetres(fmtNum(refined[1].metres));
      } else setChk([]);
      setMeasuring('dim');
      setStep('scale');
      setAiNote(
        !refined.length
          ? 'No printed dimension found — click one yourself.'
          : `Read ${refined.map((r) => `${r.text} (${fmtMetres(r.metres)})`).join(' and ')}${ov.north != null ? ', and the north arrow' : ''}. Check the lines sit on those dimensions${refined.length < 2 ? ', and add a second to check against' : ''}.`,
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : 'The drawing couldn’t be read.');
    } finally {
      setReading(null);
    }
  };

  /* ── Derived ───────────────────────────────────────────────── */
  const m1 = parseM(metres);
  const scale = dim.length === 2 && m1 ? scaleFromDimension(dim[0], dim[1], m1) : null;
  const m2 = parseM(chkMetres);
  const checkScale = chk.length === 2 && m2 ? scaleFromDimension(chk[0], chk[1], m2) : null;
  const checkPct = scale && checkScale ? agreement(scale, checkScale) : null;
  const floorN = Number(floor.replace(',', '.'));
  const clearN = clear.trim() ? parseM(clear) : null;
  const cropOk = !!crop && crop.u1 - crop.u0 >= 1 && crop.v1 - crop.v0 >= 1;

  const draft = useCallback(
    (p: Pick<ParkingDrawing, 'x' | 'y' | 'rotation' | 'pinned' | 'pinCheck'>): ParkingDrawing | null => {
      if (!size || !crop || !scale) return null;
      return {
        id: initial?.id ?? newItemId(),
        fileId: file.id,
        name: file.name,
        kind: file.kind,
        page,
        srcW: size.w,
        srcH: size.h,
        crop,
        scale,
        calib: { a: dim[0], b: dim[1], metres: m1!, ...(checkScale ? { check: { a: chk[0], b: chk[1], metres: m2! } } : {}) },
        ...p,
        opacity: initial?.opacity ?? 0.85,
        hidden: false,
        inside,
        floor: Number.isFinite(floorN) ? Math.max(LIMITS.floorMin, Math.min(LIMITS.floorMax, floorN)) : 0,
        clearHeight: clearN,
      };
    },
    [size, crop, scale, initial, file, page, dim, m1, checkScale, chk, m2, inside, floorN, clearN],
  );

  // Keep the map's preview in step with every change once placed.
  useEffect(() => {
    onPreview(placed ? draft(placed) : null);
  }, [placed, draft, onPreview]);
  useEffect(() => () => onPreview(null), [onPreview]);
  useEffect(() => onMarks(pinGround), [pinGround, onMarks]);
  useEffect(() => () => onMarks([]), [onMarks]);

  /* ── Pinning ───────────────────────────────────────────────── */
  const pinPoint = async (at: SrcPt) => {
    const nextSrc = [...pinSrc, at];
    setPinSrc(nextSrc);
    setWaitingMap(true);
    const g = await requestMapPoint(`Now click point ${nextSrc.length} on the map`);
    setWaitingMap(false);
    if (!g) {
      setPinSrc(pinSrc);
      return;
    }
    const nextGround = [...pinGround, g];
    setPinGround(nextGround);
    if (nextSrc.length === 2 && scale) {
      const p = pinDrawing(scale, [nextSrc[0], nextSrc[1]], [nextGround[0], nextGround[1]]);
      if (!p) {
        setError('Those two points are too close together — pick two far apart, e.g. opposite corners of the building.');
        setPinSrc([]);
        setPinGround([]);
        return;
      }
      setError(null);
      setPlaced({ x: p.x, y: p.y, rotation: p.rotation, pinned: true, pinCheck: Math.round(p.pinCheck * 10) / 10 });
    }
  };
  const restartPin = () => {
    setPinSrc([]);
    setPinGround([]);
    setPlaced(null);
  };
  const placeByHand = () => {
    if (!crop || !scale) return;
    // North from the drawing's own arrow when it was read; else as the screen is turned.
    const p = placeAt({ crop, scale }, { x: view.cx, y: view.cy }, north != null ? rotationFromNorth(north) : view.rotation);
    restartPin();
    setPlaced({ ...p, pinned: false, pinCheck: null });
  };

  /* ── Render ────────────────────────────────────────────────── */
  const pages = src ? pageCount(src) : 1;
  const prompt =
    step === 'crop'
      ? 'Drag a box round the part of the drawing that matters. Scroll to move, ⌘/Ctrl + scroll to zoom.'
      : step === 'scale'
        ? measuring === 'dim'
          ? dim.length < 2
            ? `Click ${dim.length ? 'the other end' : 'one end'} of a dimension printed on the drawing (a bay length, a door width).`
            : 'Type what that dimension says.'
          : chk.length < 2
            ? `Click ${chk.length ? 'the other end' : 'one end'} of a second dimension, to check the first.`
            : 'Type what it says.'
        : placed
          ? 'Placed. Check it against the map, then Done.'
          : waitingMap
            ? `Now click the same point ${pinSrc.length} on the map →`
            : satelliteOn
              ? `Click point ${pinSrc.length + 1} on the drawing — something you can also see on the satellite (a building corner, a kerb end, a gate).`
              : 'No satellite to pin to: place it in the middle of the map, then move the map to suit.';

  const line = (a: SrcPt, b: SrcPt | undefined, cls: string, label?: string) => {
    const pa = toPane(a);
    const pb = b ? toPane(b) : null;
    return (
      <g className={cls}>
        {pb ? <line x1={pa.x} y1={pa.y} x2={pb.x} y2={pb.y} /> : null}
        <circle cx={pa.x} cy={pa.y} r={5} />
        {pb ? <circle cx={pb.x} cy={pb.y} r={5} /> : null}
        {pb && label ? (
          <text x={(pa.x + pb.x) / 2} y={(pa.y + pb.y) / 2 - 8} textAnchor="middle">
            {label}
          </text>
        ) : null}
      </g>
    );
  };

  return (
    <div className="pk-setup" onPointerDown={(e) => e.stopPropagation()} onWheel={(e) => e.stopPropagation()} role="dialog" aria-label={`Set up ${file.name}`}>
      <div className="pk-setup-head">
        <b className="adv-grow" style={{ minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{file.name}</b>
        {pages > 1 ? (
          <label className="pk-muted">
            Page{' '}
            <select className="adv-field" style={{ width: 'auto', height: 28 }} value={page} onChange={(e) => { setPage(Number(e.target.value)); setCrop(null); setCam(null); setDim([]); setChk([]); restartPin(); }}>
              {Array.from({ length: pages }, (_, i) => (
                <option key={i} value={i + 1}>{i + 1}</option>
              ))}
            </select>
          </label>
        ) : null}
        <button type="button" className="adv-btn adv-btn-sm" onClick={onCancel} aria-label="Cancel">
          <X size={14} />
        </button>
      </div>
      <ol className="pk-steps" aria-label="Steps">
        {(['crop', 'scale', 'place'] as Step[]).map((s, i) => (
          <li key={s} aria-current={s === step ? 'step' : undefined}>
            {i + 1} {s === 'crop' ? 'Crop' : s === 'scale' ? 'Scale' : 'Place'}
          </li>
        ))}
      </ol>
      <p className="pk-setup-prompt" aria-live="polite">{reading ?? error ?? (step === 'scale' && aiNote ? aiNote : prompt)}</p>

      <div
        ref={pane}
        className="pk-setup-pane"
        data-step={step}
        onPointerDown={onDown}
        onPointerMove={onMove}
        onPointerUp={onUp}
        onPointerCancel={() => (press.current = null)}
        onWheel={onWheel}
      >
        {preview && cam && size ? (
          <>
            {/* A blob: URL of the page we just rendered — nothing for next/image to optimise. */}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={preview.url}
              alt=""
              draggable={false}
              style={{ position: 'absolute', left: 0, top: 0, width: size.w * cam.z, height: size.h * cam.z, transform: `translate(${cam.x}px, ${cam.y}px)`, maxWidth: 'none' }}
            />
            <svg className="pk-setup-over" width={paneSize.w} height={paneSize.h}>
              {crop ? (
                <path
                  className="pk-setup-dim"
                  fillRule="evenodd"
                  d={`M0 0H${paneSize.w}V${paneSize.h}H0Z M${toPane({ u: crop.u0, v: crop.v0 }).x} ${toPane({ u: crop.u0, v: crop.v0 }).y}H${toPane({ u: crop.u1, v: crop.v0 }).x}V${toPane({ u: crop.u1, v: crop.v1 }).y}H${toPane({ u: crop.u0, v: crop.v1 }).x}Z`}
                />
              ) : null}
              {step !== 'crop' && dim[0] ? line(dim[0], dim[1], 'pk-setup-line', m1 ? fmtMetres(m1) : undefined) : null}
              {step !== 'crop' && chk[0] ? line(chk[0], chk[1], 'pk-setup-line pk-setup-check', m2 ? fmtMetres(m2) : undefined) : null}
              {pinSrc.map((p, i) => {
                const q = toPane(p);
                return (
                  <g key={i} className="pk-setup-pin">
                    <circle cx={q.x} cy={q.y} r={11} />
                    <text x={q.x} y={q.y + 4} textAnchor="middle">{i + 1}</text>
                  </g>
                );
              })}
            </svg>
          </>
        ) : (
          <p className="pk-muted" style={{ margin: 'var(--lp-space-4)' }}>{error ?? 'Opening the drawing…'}</p>
        )}
        <div className="pk-setup-zoom" onPointerDown={(e) => e.stopPropagation()}>
          <button type="button" className="pk-ctrl" aria-label="Zoom in on the drawing" onClick={() => zoomBy(1.5)}><Plus size={14} /></button>
          <button type="button" className="pk-ctrl" aria-label="Zoom out on the drawing" onClick={() => zoomBy(1 / 1.5)}><Minus size={14} /></button>
        </div>
      </div>

      <div className="pk-setup-foot">
        {step === 'crop' ? (
          <>
            <button type="button" className="adv-btn adv-btn-sm" onClick={() => void readForMe()} disabled={!src || !size || !!reading} title="AI finds the plan, two printed dimensions and the north arrow; you check them">
              <Sparkles size={13} aria-hidden /> {reading ? 'Reading…' : 'Read it for me'}
            </button>
            <button type="button" className="adv-btn adv-btn-sm" onClick={() => size && setCrop({ u0: 0, v0: 0, u1: size.w, v1: size.h })} disabled={!size}>
              Whole page
            </button>
            <button type="button" className="adv-btn adv-btn-sm adv-btn-primary" style={{ marginLeft: 'auto' }} disabled={!cropOk} onClick={() => { setStep('scale'); if (crop) fit(crop); }}>
              Next: scale
            </button>
          </>
        ) : step === 'scale' ? (
          <div className="pk-setup-grid">
            <label className="pk-field">
              That dimension is (m)
              <input className="adv-field" inputMode="decimal" value={metres} onChange={(e) => setMetres(e.target.value)} placeholder="e.g. 16" onFocus={() => setMeasuring('dim')} aria-label="First dimension, metres" />
            </label>
            <label className="pk-field">
              Check: a second one (m)
              <input className="adv-field" inputMode="decimal" value={chkMetres} onChange={(e) => setChkMetres(e.target.value)} placeholder="e.g. 24.08" onFocus={() => setMeasuring('check')} aria-label="Second dimension, metres" />
            </label>
            <div className="adv-row-flex" style={{ gap: 'var(--lp-space-2)', gridColumn: '1 / -1', flexWrap: 'wrap' }}>
              <button type="button" className="adv-btn adv-btn-sm" aria-pressed={measuring === 'dim'} onClick={() => { setMeasuring('dim'); setDim([]); }}>
                {dim.length === 2 ? 'Re-click the dimension' : 'Click the dimension'}
              </button>
              <button type="button" className="adv-btn adv-btn-sm" aria-pressed={measuring === 'check'} onClick={() => { setMeasuring('check'); setChk([]); }} disabled={!scale}>
                {chk.length === 2 ? 'Re-click the check' : 'Check with a second dimension'}
              </button>
              <span className={`pk-setup-verdict${checkPct != null && Math.abs(checkPct) > CHECK_WARN_PCT ? ' is-warn' : ''}`} role="status">
                {!scale
                  ? ''
                  : checkPct == null
                    ? 'One dimension set. A second one catches a slipped click.'
                    : Math.abs(checkPct) <= CHECK_WARN_PCT
                      ? `The two agree within ${Math.abs(checkPct).toFixed(1)} %.`
                      : `They disagree by ${Math.abs(checkPct).toFixed(1)} % — re-click both, or the drawing isn’t to scale.`}
              </span>
            </div>
            <div className="adv-row-flex" style={{ gap: 'var(--lp-space-2)', gridColumn: '1 / -1' }}>
              <button type="button" className="adv-btn adv-btn-sm" onClick={() => setStep('crop')}>Back</button>
              <button type="button" className="adv-btn adv-btn-sm adv-btn-primary" style={{ marginLeft: 'auto' }} disabled={!scale} onClick={() => setStep('place')}>
                Next: place
              </button>
            </div>
          </div>
        ) : (
          <div className="pk-setup-grid">
            <div className="adv-row-flex" style={{ gap: 'var(--lp-space-2)', gridColumn: '1 / -1', flexWrap: 'wrap' }}>
              {satelliteOn ? (
                <button type="button" className="adv-btn adv-btn-sm" onClick={restartPin} disabled={!pinSrc.length && !placed}>
                  Pin again
                </button>
              ) : null}
              <button type="button" className="adv-btn adv-btn-sm" onClick={placeByHand}>
                {north != null ? 'Place in the middle (north from the drawing)' : 'Place in the middle of the map'}
              </button>
              {placed?.pinned && placed.pinCheck != null ? (
                <span className={`pk-setup-verdict${Math.abs(placed.pinCheck) > PIN_WARN_PCT ? ' is-warn' : ''}`} role="status">
                  {Math.abs(placed.pinCheck) <= PIN_WARN_PCT
                    ? `The satellite agrees with the drawing within ${Math.abs(placed.pinCheck).toFixed(1)} %.`
                    : `The satellite reads ${Math.abs(placed.pinCheck).toFixed(1)} % ${placed.pinCheck > 0 ? 'bigger' : 'smaller'} than the drawing — re-pin, or the drawing may be out of date.`}
                </span>
              ) : null}
            </div>
            <label className="pk-check" style={{ gridColumn: '1 / -1' }}>
              <input type="checkbox" checked={inside} onChange={(e) => setInside(e.target.checked)} />
              Inside a building — 3D takes the roof off and shows this as the floor
            </label>
            {inside ? (
              <>
                <label className="pk-field">
                  Floor (m, from the street)
                  <input className="adv-field" inputMode="decimal" value={floor} onChange={(e) => setFloor(e.target.value)} aria-label="Floor height, metres from the street" />
                </label>
                <label className="pk-field">
                  Clear height (m, optional)
                  <input className="adv-field" inputMode="decimal" value={clear} onChange={(e) => setClear(e.target.value)} placeholder="e.g. 4.5" aria-label="Clear height, metres" />
                </label>
              </>
            ) : null}
            <div className="adv-row-flex" style={{ gap: 'var(--lp-space-2)', gridColumn: '1 / -1' }}>
              <button type="button" className="adv-btn adv-btn-sm" onClick={() => setStep('scale')}>Back</button>
              <button
                type="button"
                className="adv-btn adv-btn-sm adv-btn-primary"
                style={{ marginLeft: 'auto' }}
                disabled={!placed}
                onClick={() => {
                  const d = placed ? draft(placed) : null;
                  if (d) onDone(d);
                }}
              >
                Done
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
