'use client';

/* ============================================
   LOWPASS — Parking map editor (Nov 2026, Adam) — phase 1, the overhead plan

   Production › Parking: /operations/[tourId]/parking/[routingId] (linked from
   the show's advance). A satellite map pinned to the venue,
   with vehicles at true size, markers, routes, areas and measurements;
   autosaved; exported as an A4 PDF into tour Files, linked to the show.

   State lives here; rules live in src/lib/parking (geo / model / edit);
   drawing lives in <ParkingScene> (shared with the PDF). Items are metres
   east / north of the anchor — never pixels — so nothing drifts with zoom.

   Saving: debounced PUT with the version this tab last saw. A 409 means
   another tab or person saved first: the banner offers theirs or yours;
   nothing is overwritten silently.
   ============================================ */

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
import { ArrowLeft, ChevronDown, ChevronUp, Compass, Copy, Download, Minus, Navigation, Plus, Redo2, RotateCcw, RotateCw, Route as RouteIcon, Ruler, Pentagon, Trash2, Undo2, X } from 'lucide-react';
import { useToast } from '@/components/ui/Toast';
import { SaveStatus } from '@/components/forms/SaveStatus';
import type { SaveStatus as SaveStatusKind } from '@/lib/forms/useAutoSave';
import { uploadToFiles } from '@/lib/uploads/filesUpload';
import {
  bearing,
  dist,
  fmtMetres,
  niceLength,
  normDeg,
  project,
  toLatLng,
  unproject,
  zoomAt,
  type Camera3d,
  type LatLng,
  type Pt,
  type View,
} from '@/lib/parking/geo';
import { AREAS, MARKERS, PAINTS, VEHICLES, areaLabel, markerSpec, vehicleSpec, type AreaType, type MarkerType, type PaintId, type VehicleType } from '@/lib/parking/catalogue';
import { pathLength, type ParkingDrawing, type ParkingItem } from '@/lib/parking/model';
import { drawableKind, footprint, headroomWarnings, itemFloor, levelLabel, levelsOf, shiftDrawings, svgMatrix } from '@/lib/parking/drawings';
import type { DrawingFile, VenueReuse } from '@/server/parking/maps';
import { DrawingsPanel } from './DrawingsPanel';
import { DriverLinksPanel } from './DriverLinksPanel';
import { DrawingSetup } from './DrawingSetup';
import { sceneDrawings, useDrawingRasters } from './drawingLayers';
import type { DrawingFileRef } from './drawingRaster';
import { addMarker, addVehicle, duplicateItem, duplicateItems, finishDraft, itemsInBox, moveItems, record, redo, removeItems, replaceItem, toggleSelection, turnItems, undo, type History } from '@/lib/parking/edit';
import type { ParkingShow, SavedParkingMap } from '@/server/parking/maps';
import { ParkingScene, MARKER_ICON, type Draft } from './ParkingScene';
import { LIVE_PALETTE, roleColour, areaColour } from './palette';
import { tilesKey } from './googleTiles';
import { exportParkingPdf } from './exportPdf';
import { Parking3D } from './Parking3D';
import { useMapTiles } from './useMapTiles';
import { freeSpot, itemPoints, printFrame } from '@/lib/parking/print';
import { MAX_PAGES, add3dPage, addPlanPage, movePage, pagesOf, planFrame, removePage, updatePage, type Page3d, type PdfPage, type PrintScale } from '@/lib/parking/pages';
import '@/components/advance/advance.css';
import './parking.css';

type Tool =
  | { kind: 'select' }
  | { kind: 'draw'; shape: 'route' | 'area' | 'measure' }
  /** Setting up a drawing: the next click on the map is a pin point. */
  | { kind: 'pick'; prompt: string };

type Drag =
  | { kind: 'pan'; start: Pt; view0: View; moved: boolean }
  /** Moves every selected item; a plain click (no move) on one of several collapses the selection to it. */
  | { kind: 'move'; ids: string[]; start: Pt; items0: ParkingItem[]; moved: boolean; collapseTo: string | null }
  /** Shift-drag on the map: everything touched by the box joins `base`. */
  | { kind: 'box'; start: Pt; base: string[]; moved: boolean }
  /** A Cmd/Ctrl/Shift-click toggle: owns the press so the map doesn't pan or deselect. */
  | { kind: 'hold' }
  | { kind: 'rotate'; id: string; items0: ParkingItem[]; moved: boolean }
  | { kind: 'end'; id: string; which: 'a' | 'b'; items0: ParkingItem[]; moved: boolean }
  | { kind: 'pinch'; d0: number; view0: View; mid: Pt };

const DEFAULT_VIEW: View = { cx: 0, cy: 0, ppm: 3, rotation: 0 };

/** A page for one level frames (and prints) that level's items only. */
const itemsOnLevel = (items: ParkingItem[], drawings: ParkingDrawing[], level: number | undefined) =>
  level == null ? items : items.filter((i) => itemFloor(i, drawings) === level);
const SAVE_DELAY = 900;

export interface ParkingEditorProps {
  show: ParkingShow;
  tourName: string | null;
  initial: SavedParkingMap | null;
  canEdit: boolean;
}

export function ParkingEditor({ show, tourName, initial, canEdit }: ParkingEditorProps) {
  const { showToast } = useToast();
  const [anchor, setAnchor] = useState<LatLng | null>(initial?.anchor ?? show.venue.coords);
  const [view, setView] = useState<View>(initial?.view ?? DEFAULT_VIEW);
  const [items, setItems] = useState<ParkingItem[]>(initial?.items ?? []);
  const [notes, setNotes] = useState(initial?.notes ?? '');
  const [drawings, setDrawings] = useState<ParkingDrawing[]>(initial?.drawings ?? []);
  const [hist, setHist] = useState<History<ParkingItem[]>>({ past: [], future: [] });
  // Selected ids (Cmd/Ctrl/Shift-click adds, Shift-drag boxes, ⌘A = all).
  const [selected, setSelected] = useState<string[]>([]);
  const [box, setBox] = useState<{ a: Pt; b: Pt } | null>(null);
  const [tool, setTool] = useState<Tool>({ kind: 'select' });
  const [areaType, setAreaType] = useState<AreaType>('crew');
  const [draft, setDraft] = useState<Draft | null>(null);
  const [size, setSize] = useState({ w: 0, h: 0 });
  const [dragging, setDragging] = useState(false);
  const [pdf, setPdf] = useState(initial?.pdf ?? null);
  const [exporting, setExporting] = useState(false);
  const [mode, setMode] = useState<'plan' | '3d'>('plan');


  // Saving
  const [status, setStatus] = useState<SaveStatusKind>('idle');
  const [savedAt, setSavedAt] = useState<Date | null>(initial ? new Date(initial.updatedAt) : null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [conflict, setConflict] = useState<SavedParkingMap | null>(null);

  const mapRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef(view);
  const itemsRef = useRef(items);
  const selectedRef = useRef(selected);
  const sizeRef = useRef(size);
  const drag = useRef<Drag | null>(null);
  const pointers = useRef(new Map<number, Pt>());
  const versionRef = useRef<number | null>(initial?.version ?? null);
  const dataRef = useRef({ anchor, view, items, notes, drawings });
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const saving = useRef(false);
  const again = useRef(false);
  const touched = useRef(false);
  const focusSnap = useRef<ParkingItem[] | null>(null);
  viewRef.current = view;
  itemsRef.current = items;
  selectedRef.current = selected;
  sizeRef.current = size;
  dataRef.current = { anchor, view, items, notes, drawings };

  const base = `/api/tours/${show.tourId}/parking/${show.routingId}`;

  /* ── Size ─────────────────────────────────────────────── */
  useEffect(() => {
    const el = mapRef.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setSize({ w: Math.round(e.contentRect.width), h: Math.round(e.contentRect.height) }));
    ro.observe(el);
    return () => ro.disconnect();
  }, [anchor]);

  // A new map opens with about 250 m across the screen.
  const fitted = useRef(!!initial);
  useEffect(() => {
    if (fitted.current || !size.w) return;
    fitted.current = true;
    setView((v) => ({ ...v, ppm: Math.max(0.5, size.w / 250) }));
  }, [size.w]);

  /* ── Imagery ──────────────────────────────────────────── */
  // Satellite off (view.satellite === false): a venue drawing or the grid is the base.
  const satelliteOn = view.satellite !== false;
  // Levels: the street plus each inside drawing's floor. Picking one fades the rest.
  const levels = useMemo(() => levelsOf(drawings), [drawings]);
  const level = levels.length > 1 && view.level != null && levels.includes(view.level) ? view.level : undefined;
  const levelRef = useRef(level);
  levelRef.current = level;
  /** A new item goes on the level being shown. */
  const atLevel = (list: ParkingItem[], id: string): ParkingItem[] =>
    levelRef.current == null ? list : list.map((i) => (i.id === id ? ({ ...i, floor: levelRef.current } as ParkingItem) : i));
  const { session, tiles, attribution, maxZoom, imageryError } = useMapTiles(anchor, view, size, satelliteOn);

  // The PDF's pages (pages.ts) live on the view; plan pages are outlined on the map.
  const pages = useMemo(() => pagesOf(view), [view]);
  const planFrames = useMemo(
    () => pages.flatMap((page, i) => (page.kind === 'plan' ? [{ page, n: i + 1, ...planFrame(page, itemsOnLevel(items, drawings, page.level), view, size) }] : [])),
    [pages, items, drawings, view, size],
  );
  const frame = useMemo(() => planFrames.find((f) => f.page.fit)?.frame ?? printFrame(items, view, size, 'auto'), [planFrames, items, view, size]);
  const autoScale = useMemo(() => printFrame(items, view, size, 'auto').scale, [items, view, size]);
  // Which 3D view the 3D page opens on (a page's camera after "Show").
  const [shown3d, setShown3d] = useState<{ pageId: string | null; cam: Camera3d | undefined; key: number }>({ pageId: null, cam: undefined, key: 0 });

  /* ── Saving ───────────────────────────────────────────── */
  const save = useCallback(
    async (keepalive = false) => {
      if (!canEdit || !dataRef.current.anchor) return;
      if (saving.current && !keepalive) {
        again.current = true;
        return;
      }
      saving.current = true;
      setStatus('saving');
      try {
        const res = await fetch(base, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ map: dataRef.current, version: versionRef.current }),
          keepalive,
        });
        const j = (await res.json().catch(() => ({}))) as { map?: SavedParkingMap; current?: SavedParkingMap; error?: string };
        if (res.status === 409 && j.current) {
          setConflict(j.current);
          setStatus('error');
          setSaveError('Changed elsewhere');
        } else if (!res.ok || !j.map) {
          setStatus('error');
          setSaveError(j.error ?? `Save failed (${res.status})`);
        } else {
          versionRef.current = j.map.version;
          setStatus('saved');
          setSavedAt(new Date());
          setSaveError(null);
        }
      } catch {
        setStatus('error');
        setSaveError('Offline? Not saved yet.');
      } finally {
        saving.current = false;
        if (again.current) {
          again.current = false;
          void save();
        }
      }
    },
    [base, canEdit],
  );

  useEffect(() => {
    if (!touched.current || conflict) return;
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => {
      saveTimer.current = null;
      void save();
    }, SAVE_DELAY);
  }, [anchor, view, items, notes, drawings, save, conflict]);

  // Leaving with a save pending: send it anyway.
  useEffect(() => {
    const flush = () => {
      if (saveTimer.current) {
        clearTimeout(saveTimer.current);
        saveTimer.current = null;
        void save(true);
      }
    };
    window.addEventListener('pagehide', flush);
    return () => {
      window.removeEventListener('pagehide', flush);
      flush();
    };
  }, [save]);

  const touch = () => {
    touched.current = true;
  };

  /* ── Changing items (with undo) ───────────────────────── */
  const commit = useCallback((next: ParkingItem[], before: ParkingItem[] = itemsRef.current) => {
    touch();
    setHist((h) => record(h, before));
    setItems(next);
  }, []);

  const doUndo = useCallback(() => {
    setHist((h) => {
      const r = undo(h, itemsRef.current);
      if (!r) return h;
      touch();
      setItems(r.value);
      return r.h;
    });
  }, []);
  const doRedo = useCallback(() => {
    setHist((h) => {
      const r = redo(h, itemsRef.current);
      if (!r) return h;
      touch();
      setItems(r.value);
      return r.h;
    });
  }, []);

  const changeView = (v: View) => {
    touch();
    setView(v);
  };

  /* ── Pointer ──────────────────────────────────────────── */
  const local = (e: { clientX: number; clientY: number }): Pt => {
    const r = mapRef.current!.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  };
  const ground = (e: { clientX: number; clientY: number }): Pt => unproject(viewRef.current, sizeRef.current.w, sizeRef.current.h, local(e));

  const onMapDown = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    mapRef.current?.setPointerCapture(e.pointerId);
    pointers.current.set(e.pointerId, local(e));
    if (pointers.current.size === 2) {
      const [a, b] = [...pointers.current.values()];
      drag.current = { kind: 'pinch', d0: Math.hypot(a.x - b.x, a.y - b.y), view0: viewRef.current, mid: { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 } };
      return;
    }
    if (drag.current) return; // an item or handle already took this press
    if (e.shiftKey && e.pointerType === 'mouse' && canEdit && tool.kind === 'select') {
      drag.current = { kind: 'box', start: local(e), base: selectedRef.current, moved: false };
      return;
    }
    drag.current = { kind: 'pan', start: local(e), view0: viewRef.current, moved: false };
  };

  const onItemDown = (e: ReactPointerEvent, item: ParkingItem) => {
    if (!canEdit || tool.kind !== 'select') return;
    const cur = selectedRef.current;
    if (e.metaKey || e.ctrlKey || e.shiftKey) {
      const next = toggleSelection(cur, item.id);
      setSelected(next);
      // Still in → a drag moves the whole selection; taken out → hold still.
      drag.current = next.includes(item.id) ? { kind: 'move', ids: next, start: ground(e), items0: itemsRef.current, moved: false, collapseTo: null } : { kind: 'hold' };
      return;
    }
    if (cur.includes(item.id) && cur.length > 1) {
      drag.current = { kind: 'move', ids: cur, start: ground(e), items0: itemsRef.current, moved: false, collapseTo: item.id };
      return;
    }
    setSelected([item.id]);
    drag.current = { kind: 'move', ids: [item.id], start: ground(e), items0: itemsRef.current, moved: false, collapseTo: null };
  };

  const onHandleDown = (e: ReactPointerEvent, item: ParkingItem, handle: string) => {
    if (!canEdit || tool.kind !== 'select') return;
    e.stopPropagation();
    mapRef.current?.setPointerCapture(e.pointerId);
    pointers.current.set(e.pointerId, local(e));
    setSelected([item.id]);
    drag.current =
      handle === 'rotate'
        ? { kind: 'rotate', id: item.id, items0: itemsRef.current, moved: false }
        : { kind: 'end', id: item.id, which: handle === 'b' ? 'b' : 'a', items0: itemsRef.current, moved: false };
  };

  const onMapMove = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (pointers.current.has(e.pointerId)) pointers.current.set(e.pointerId, local(e));
    const d = drag.current;
    if (tool.kind === 'draw' && draft) setDraft({ ...draft, cursor: ground(e) });
    if (!d) return;
    const { w, h } = sizeRef.current;
    if (d.kind === 'pinch') {
      const ps = [...pointers.current.values()];
      if (ps.length < 2) return;
      const dd = Math.hypot(ps[0].x - ps[1].x, ps[0].y - ps[1].y);
      changeView(zoomAt(d.view0, w, h, d.mid, dd / Math.max(1, d.d0)));
      return;
    }
    if (d.kind === 'pan') {
      const s = local(e);
      if (!d.moved && Math.hypot(s.x - d.start.x, s.y - d.start.y) < 4) return;
      d.moved = true;
      setDragging(true);
      const a = unproject(d.view0, w, h, d.start);
      const b = unproject(d.view0, w, h, s);
      changeView({ ...d.view0, cx: d.view0.cx - (b.x - a.x), cy: d.view0.cy - (b.y - a.y) });
      return;
    }
    if (d.kind === 'hold') return;
    if (d.kind === 'box') {
      const s = local(e);
      if (!d.moved && Math.hypot(s.x - d.start.x, s.y - d.start.y) < 4) return;
      d.moved = true;
      setBox({ a: d.start, b: s });
      return;
    }
    const g = ground(e);
    if (d.kind === 'move') {
      d.moved = true;
      setDragging(true);
      setItems(moveItems(d.items0, d.ids, { x: g.x - d.start.x, y: g.y - d.start.y }));
      touch();
    } else if (d.kind === 'rotate') {
      d.moved = true;
      setItems((list) =>
        list.map((i) => {
          if (i.id !== d.id || i.kind !== 'vehicle') return i;
          const raw = bearing(i, g);
          return { ...i, heading: e.shiftKey ? raw : normDeg(Math.round(raw / 5) * 5) };
        }),
      );
      touch();
    } else if (d.kind === 'end') {
      d.moved = true;
      setItems((list) => list.map((i) => (i.id === d.id && i.kind === 'measure' ? { ...i, [d.which]: { x: g.x, y: g.y } } : i)));
      touch();
    }
  };

  const onMapUp = (e: ReactPointerEvent<HTMLDivElement>) => {
    pointers.current.delete(e.pointerId);
    const d = drag.current;
    if (d?.kind === 'pinch') {
      if (pointers.current.size === 0) drag.current = null;
      return;
    }
    drag.current = null;
    setDragging(false);
    if (!d || d.kind === 'hold') return;
    if (d.kind === 'box') {
      setBox(null);
      if (d.moved) {
        const { w, h } = sizeRef.current;
        const hit = itemsInBox(itemsRef.current, viewRef.current, w, h, d.start, local(e));
        setSelected([...d.base, ...hit.filter((id) => !d.base.includes(id))]);
      }
      return;
    }
    if (d.kind === 'move' && !d.moved && d.collapseTo) {
      setSelected([d.collapseTo]);
      return;
    }
    if (d.kind === 'pan' && !d.moved) {
      if (tool.kind === 'draw') addPoint(ground(e));
      else if (tool.kind === 'pick') {
        const resolve = pickRef.current;
        pickRef.current = null;
        setTool({ kind: 'select' });
        resolve?.(ground(e));
      } else setSelected([]);
      return;
    }
    if ((d.kind === 'move' || d.kind === 'rotate' || d.kind === 'end') && d.moved) setHist((hh) => record(hh, d.items0));
  };

  // Wheel zoom (non-passive so the page doesn't scroll).
  useEffect(() => {
    const el = mapRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const r = el.getBoundingClientRect();
      const factor = Math.exp(-e.deltaY * (e.ctrlKey ? 0.01 : 0.0015));
      touched.current = true;
      setView((v) => zoomAt(v, r.width, r.height, { x: e.clientX - r.left, y: e.clientY - r.top }, factor));
    };
    if (mode !== 'plan') return; // the 3D engine has the wheel
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, [anchor, mode]);

  /* ── Drawing ──────────────────────────────────────────── */
  const startDraw = (shape: 'route' | 'area' | 'measure') => {
    setSelected([]);
    setTool({ kind: 'draw', shape });
    setDraft({ kind: shape, points: [], cursor: null });
  };
  const cancelDraw = () => {
    if (pickRef.current) {
      pickRef.current(null);
      pickRef.current = null;
    }
    setTool({ kind: 'select' });
    setDraft(null);
  };
  /** The drawing setup asks for a point on the map: resolved by the next click (null if cancelled). */
  const pickRef = useRef<((p: Pt | null) => void) | null>(null);
  const requestMapPoint = useCallback(
    (prompt: string) =>
      new Promise<Pt | null>((resolve) => {
        pickRef.current?.(null);
        pickRef.current = resolve;
        setDraft(null);
        setTool({ kind: 'pick', prompt });
      }),
    [],
  );
  const finishDraw = useCallback(
    (points?: Pt[]) => {
      if (tool.kind !== 'draw' || !draft) return;
      const r = finishDraft(itemsRef.current, tool.shape, points ?? draft.points, areaType);
      if (r) {
        commit(atLevel(r.items, r.id));
        setSelected([r.id]);
      } else if ((points ?? draft.points).length) {
        showToast(tool.shape === 'area' ? 'An area needs at least three points' : 'Needs at least two points', 'error');
      }
      setTool({ kind: 'select' });
      setDraft(null);
    },
    [tool, draft, areaType, commit, showToast],
  );
  const addPoint = (p: Pt) => {
    if (!draft || tool.kind !== 'draw') return;
    const points = [...draft.points, p];
    if (tool.shape === 'measure' && points.length === 2) return finishDraw(points);
    setDraft({ ...draft, points });
  };

  /* ── Adding ───────────────────────────────────────────── */
  const centre = (): Pt => ({ x: viewRef.current.cx, y: viewRef.current.cy });
  const placeVehicle = (t: VehicleType) => {
    const r = addVehicle(itemsRef.current, t, freeSpot(itemsRef.current, centre(), viewRef.current, 5), viewRef.current.rotation);
    commit(atLevel(r.items, r.id));
    setSelected([r.id]);
    cancelDraw();
  };
  const placeMarker = (t: MarkerType) => {
    const r = addMarker(itemsRef.current, t, freeSpot(itemsRef.current, centre(), viewRef.current));
    commit(atLevel(r.items, r.id));
    setSelected([r.id]);
    cancelDraw();
  };

  // Ids that still exist (undo / delete can take items away under the selection).
  const selIds = useMemo(() => selected.filter((id) => items.some((i) => i.id === id)), [selected, items]);
  const sel = selIds.length === 1 ? (items.find((i) => i.id === selIds[0]) ?? null) : null;
  const group = useMemo(() => (selIds.length > 1 ? items.filter((i) => selIds.includes(i.id)) : []), [selIds, items]);

  /* ── Venue drawings ───────────────────────────────────── */
  const [drawingFiles, setDrawingFiles] = useState<DrawingFile[] | null>(null);
  const [reuse, setReuse] = useState<VenueReuse | null>(null);
  const [uploading, setUploading] = useState(false);
  const [setup, setSetup] = useState<{ file: DrawingFileRef; initial?: ParkingDrawing } | null>(null);
  const [previewDrawing, setPreviewDrawing] = useState<ParkingDrawing | null>(null);
  const [pinMarks, setPinMarks] = useState<Pt[]>([]);
  const fileRefs = useMemo(() => new Map((drawingFiles ?? []).map((f) => [f.id, f])), [drawingFiles]);
  const shownDrawings = useMemo(
    () => (previewDrawing ? [...drawings.filter((d) => d.id !== previewDrawing.id), previewDrawing] : drawings),
    [drawings, previewDrawing],
  );
  const { rasters, errors: drawingErrors } = useDrawingRasters(shownDrawings, fileRefs);

  const loadDrawingFiles = useCallback(async () => {
    const ids = dataRef.current.drawings.map((d) => d.fileId).join(',');
    try {
      const r = await fetch(`${base}/drawings${ids ? `?ids=${encodeURIComponent(ids)}` : ''}`);
      const j = (await r.json().catch(() => ({}))) as { files?: DrawingFile[]; reuse?: VenueReuse | null };
      if (!r.ok) throw new Error();
      setDrawingFiles((old) => {
        // Keep files uploaded this session that the list may not have caught up with.
        const got = j.files ?? [];
        const extra = (old ?? []).filter((f) => !got.some((g) => g.id === f.id));
        return [...got, ...extra];
      });
      setReuse(j.reuse ?? null);
    } catch {
      setDrawingFiles((old) => old ?? []);
    }
  }, [base]);
  // Once the map has its pin: the drawings' files (to draw them) and "last time at this venue".
  const hasAnchor = !!anchor;
  useEffect(() => {
    if (hasAnchor) void loadDrawingFiles();
  }, [loadDrawingFiles, hasAnchor]);

  const changeDrawings = useCallback((next: ParkingDrawing[]) => {
    touched.current = true;
    setDrawings(next);
  }, []);
  const linkToVenue = (fileId: string) => {
    if (!show.venue.canonicalId) return;
    // So the drawing turns up at this venue on other tours (best effort).
    void fetch('/api/file-links', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ fileId, type: 'venue', entityId: show.venue.canonicalId }) }).catch(() => {});
  };
  const uploadDrawing = async (file: File) => {
    const kind = drawableKind(file.name, file.type);
    if (!kind) return showToast('Venue drawings are PDFs or JPG / PNG images', 'error');
    setUploading(true);
    try {
      const vm = await uploadToFiles({ scope: 'tour', scopeId: show.tourId, folder: 'Parking maps', file });
      const df: DrawingFile = { id: vm.id.replace(/^ref:/, ''), name: vm.filename, mime: vm.mimeType, kind, bucket: vm.storageBucket, path: vm.storagePath, from: 'Tour files' };
      setDrawingFiles((l) => [...(l ?? []).filter((x) => x.id !== df.id), df]);
      setSetup({ file: df });
    } catch (e) {
      showToast(e instanceof Error ? e.message : 'The upload failed', 'error');
    } finally {
      setUploading(false);
    }
  };
  const finishSetup = (d: ParkingDrawing) => {
    const exists = dataRef.current.drawings.some((x) => x.id === d.id);
    changeDrawings(exists ? dataRef.current.drawings.map((x) => (x.id === d.id ? d : x)) : [...dataRef.current.drawings, d]);
    if (!exists) linkToVenue(d.fileId);
    setSetup(null);
    setPreviewDrawing(null);
    showToast(`${d.name} is on the map${d.pinned ? '' : ' — placed by hand'}`);
  };
  const onPreviewDrawing = useCallback((d: ParkingDrawing | null) => setPreviewDrawing(d), []);
  const onPinMarks = useCallback((pts: Pt[]) => setPinMarks(pts), []);

  // Headroom: vehicles taller than an inside drawing's clear height or a height limit.
  const warnings = useMemo(() => headroomWarnings(items, drawings), [items, drawings]);
  const warnIds = useMemo(() => new Set(warnings.flatMap((w) => w.vehicleIds)), [warnings]);
  // Items on another level than the one shown: faint, not pickable.
  const fadedIds = useMemo(
    () => (level == null ? undefined : new Set(items.filter((i) => itemFloor(i, drawings) !== level).map((i) => i.id))),
    [items, drawings, level],
  );
  const levelOptions = useMemo(() => levels.map((l) => ({ value: l, label: levelLabel(l, drawings) })), [levels, drawings]);
  /** The dark look of each drawing: 3D lays these as floors. */
  const floorCanvases = useMemo(() => new Map([...rasters].map(([id, r]) => [id, r.dark])), [rasters]);

  const patchSelected = (patch: Partial<ParkingItem>) => {
    if (!sel) return;
    touch();
    setItems((list) => list.map((i) => (i.id === sel.id ? ({ ...i, ...patch } as ParkingItem) : i)));
  };
  const onFieldFocus = () => {
    focusSnap.current = itemsRef.current;
  };
  const onFieldBlur = () => {
    if (focusSnap.current && focusSnap.current !== itemsRef.current) setHist((h) => record(h, focusSnap.current!));
    focusSnap.current = null;
  };
  const deleteSelected = useCallback(() => {
    if (!selIds.length) return;
    commit(removeItems(itemsRef.current, selIds));
    setSelected([]);
  }, [selIds, commit]);
  /** Turn what's selected: one vehicle about itself (as before), several as one block. */
  const turnSelected = useCallback(
    (by: number) => {
      if (sel?.kind === 'vehicle') commit(replaceItem(itemsRef.current, { ...sel, heading: normDeg(sel.heading + by) }));
      else if (selIds.length > 1) commit(turnItems(itemsRef.current, selIds, by));
    },
    [sel, selIds, commit],
  );
  const duplicateGroup = () => {
    // The copies park beside the originals: the group's width across the screen + 2 m, to the right.
    const r = (viewRef.current.rotation * Math.PI) / 180;
    const across = { x: Math.cos(r), y: -Math.sin(r) };
    const us = itemPoints(group).map((q) => q.x * across.x + q.y * across.y);
    const gap = Math.max(...us) - Math.min(...us) + 2;
    const out = duplicateItems(itemsRef.current, selIds, { x: across.x * gap, y: across.y * gap });
    if (out.ids.length) {
      commit(out.items);
      setSelected(out.ids);
    }
  };

  /* ── Keyboard ─────────────────────────────────────────── */
  useEffect(() => {
    if (!canEdit) return;
    const onKey = (e: KeyboardEvent) => {
      if (mode !== 'plan') return; // keys edit the plan; 3D is for looking
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' || t.isContentEditable)) return;
      const mod = e.metaKey || e.ctrlKey;
      if (mod && e.key.toLowerCase() === 'a' && tool.kind === 'select') {
        e.preventDefault();
        setSelected(itemsRef.current.map((i) => i.id));
        return;
      }
      if (mod && e.key.toLowerCase() === 'z') {
        e.preventDefault();
        if (e.shiftKey) doRedo();
        else doUndo();
        return;
      }
      if (tool.kind === 'pick') {
        if (e.key === 'Escape') cancelDraw();
        return;
      }
      if (tool.kind === 'draw') {
        if (e.key === 'Escape') cancelDraw();
        else if (e.key === 'Enter') finishDraw();
        else if (e.key === 'Backspace' && draft?.points.length) setDraft({ ...draft, points: draft.points.slice(0, -1) });
        return;
      }
      if (e.key === 'Escape') return setSelected([]);
      if (!selIds.length) return;
      if (e.key === 'Delete' || e.key === 'Backspace') {
        e.preventDefault();
        deleteSelected();
        return;
      }
      if (e.key.startsWith('Arrow')) {
        e.preventDefault();
        const step = e.shiftKey ? 1 : 0.1;
        // Nudge along the SCREEN's axes, whatever the map's rotation.
        const sx = e.key === 'ArrowLeft' ? -1 : e.key === 'ArrowRight' ? 1 : 0;
        const sy = e.key === 'ArrowUp' ? 1 : e.key === 'ArrowDown' ? -1 : 0;
        const r = (viewRef.current.rotation * Math.PI) / 180;
        const d = { x: (sx * Math.cos(r) + sy * Math.sin(r)) * step, y: (-sx * Math.sin(r) + sy * Math.cos(r)) * step };
        commit(moveItems(itemsRef.current, selIds, d));
        return;
      }
      if (e.key === '[' || e.key === ']') turnSelected((e.key === ']' ? 1 : -1) * (e.shiftKey ? 45 : 5));
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [canEdit, mode, tool, draft, selIds, doUndo, doRedo, finishDraw, deleteSelected, turnSelected, commit]);

  /* ── Export ───────────────────────────────────────────── */
  const venueName = show.venue.name ?? show.venue.city ?? 'Show';
  const dateLabel = new Date(`${show.date}T12:00:00Z`).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });

  const doExport = async () => {
    if (!anchor || exporting) return;
    setExporting(true);
    // Open the tab NOW, while the click still counts as a click: the 3D page
    // can take a while, and a window opened after that is blocked as a popup.
    const tab = window.open('about:blank', '_blank');
    try {
      if (saveTimer.current) {
        clearTimeout(saveTimer.current);
        saveTimer.current = null;
      }
      await save();
      const out = await exportParkingPdf({
        title: `Parking — ${venueName}`,
        subtitle: [dateLabel, show.venue.city, tourName].filter(Boolean).join(' · '),
        anchor,
        pages: pages.map((p) =>
          p.kind === 'plan'
            ? {
                kind: 'plan' as const,
                title: p.title,
                ...planFrame(p, itemsOnLevel(items, drawings, p.level), view, size),
                ...(p.level != null && levels.length > 1 ? { level: p.level, levelLabel: levelLabel(p.level, drawings) } : {}),
              }
            : {
                kind: '3d' as const,
                title: p.title,
                cam: p.cam,
                fallback: { centre: { x: frame.cx, y: frame.cy }, extent: Math.max(frame.wM, frame.hM) * 0.7, rotation: view.rotation },
              },
        ),
        items,
        notes,
        session: satelliteOn ? session : null,
        maxZoom,
        attribution,
        drawings: drawings
          .filter((d) => !d.hidden && rasters.has(d.id))
          .map((d) => {
            const r = rasters.get(d.id)!;
            const lines = !d.inside && satelliteOn && !!session;
            return { id: d.id, name: d.name, matrix: svgMatrix(d), crop: d.crop, canvas: lines ? r.light : r.dark, opacity: d.opacity, blend: lines ? ('multiply' as const) : ('normal' as const), inside: d.inside, floor: d.floor };
          }),
        allDrawings: drawings,
        floors: floorCanvases,
        satellite: satelliteOn,
        warnings: warnings.map((w) => w.text),
      });
      const url = URL.createObjectURL(out.blob);
      if (tab && !tab.closed) tab.location.href = url;
      else {
        const a = document.createElement('a');
        a.href = url;
        a.download = out.fileName;
        a.click();
      }
      setTimeout(() => URL.revokeObjectURL(url), 120_000);
      if (out.warning) showToast(out.warning, 'error');
      if (canEdit) {
        try {
          const file = await uploadToFiles({ scope: 'tour', scopeId: show.tourId, folder: 'Parking maps', file: new File([out.blob], out.fileName, { type: 'application/pdf' }) });
          const link = await fetch('/api/file-links', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ fileId: file.id, type: 'show', entityId: show.routingId }) });
          const r = await fetch(base, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ pdfFileId: file.id }) });
          const j = (await r.json().catch(() => ({}))) as { map?: SavedParkingMap };
          if (j.map?.pdf) setPdf(j.map.pdf);
          showToast(
            link.ok
              ? `PDF (${out.pageCount} ${out.pageCount === 1 ? 'page' : 'pages'}) saved to Files › Parking maps, linked to this show`
              : 'PDF saved to Files › Parking maps, but it couldn’t be linked to this show',
            link.ok ? undefined : 'error',
          );
        } catch (e) {
          showToast(`The PDF opened, but it couldn’t be saved to Files: ${e instanceof Error ? e.message : 'error'}`, 'error');
        }
      }
    } catch (e) {
      if (tab && !tab.closed) tab.close();
      showToast(e instanceof Error ? e.message : 'Couldn’t make the PDF', 'error');
    } finally {
      setExporting(false);
    }
  };

  /* ── Render ───────────────────────────────────────────── */
  const backHref = `/operations/${show.tourId}/parking`;
  const advanceHref = `/advance/${show.tourId}/${show.routingId}`;

  if (!anchor) {
    return <AnchorPicker show={show} backHref={backHref} canEdit={canEdit} onPick={(a) => { touch(); setAnchor(a); }} />;
  }

  const scaleM = niceLength(110 / view.ppm);

  const setPages = (next: PdfPage[]) => changeView({ ...viewRef.current, pages: next });
  const showPage = (page: PdfPage) => {
    if (page.kind === '3d') {
      setShown3d((s) => ({ pageId: page.id, cam: page.cam ?? undefined, key: s.key + 1 }));
      setMode('3d');
      return;
    }
    setMode('plan');
    const { frame: f, rotation } = planFrame(page, items, view, size);
    // Fit the page's area on screen with a little room around it.
    const ppm = Math.min(size.w / f.wM, size.h / f.hM) * 0.9;
    changeView({ ...viewRef.current, cx: f.cx, cy: f.cy, rotation, ppm });
  };
  const showDrawing = (d: ParkingDrawing) => {
    setMode('plan');
    const r = (view.rotation * Math.PI) / 180;
    const f = footprint(d);
    const us = f.map((q) => q.x * Math.cos(r) - q.y * Math.sin(r));
    const vs = f.map((q) => q.x * Math.sin(r) + q.y * Math.cos(r));
    const cx = f.reduce((a, q) => a + q.x, 0) / 4;
    const cy = f.reduce((a, q) => a + q.y, 0) / 4;
    const ppm = Math.min(size.w / (Math.max(...us) - Math.min(...us)), size.h / (Math.max(...vs) - Math.min(...vs))) * 0.9;
    const onOther = levels.length > 1 && view.level != null && (d.inside ? d.floor : 0) !== view.level;
    changeView({ ...view, cx, cy, ppm, ...(onOther ? { level: d.inside ? d.floor : 0 } : {}) });
  };
  const counts = { vehicles: items.filter((i) => i.kind === 'vehicle').length };

  return (
    <div className="pk-page">
      <aside className="pk-panel" aria-label="Parking map tools">
        <div className="pk-head">
          <Link href={backHref} className="adv-link" style={{ fontSize: 'var(--lp-text-xs)' }}>
            <ArrowLeft size={13} aria-hidden /> All shows
          </Link>
          <h1 className="lp-page-title">Parking</h1>
          <span style={{ fontSize: 'var(--lp-text-sm)', fontWeight: 'var(--lp-weight-semibold)' }}>{venueName}</span>
          <span className="pk-muted">
            {dateLabel}
            {show.venue.city ? ` · ${show.venue.city}` : ''} ·{' '}
            <Link href={advanceHref} className="adv-link">
              Advance
            </Link>
          </span>
          <div className="adv-row-flex" style={{ gap: 'var(--lp-space-2)', marginTop: 'var(--lp-space-2)', flexWrap: 'wrap' }}>
            {canEdit ? <SaveStatus status={status} lastSavedAt={savedAt} errorMessage={saveError} onRetry={() => void save()} /> : <span className="pk-muted">View only</span>}
            <button type="button" className="adv-btn adv-btn-primary adv-btn-sm" onClick={() => void doExport()} disabled={exporting} style={{ marginLeft: 'auto' }}>
              <Download size={14} aria-hidden /> {exporting ? 'Making PDF…' : 'Export PDF'}
            </button>
          </div>
          <PagesPanel
            pages={pages}
            autoScale={autoScale}
            canEdit={canEdit}
            mode={mode}
            onChange={setPages}
            onShow={showPage}
            onAddPlan={() => setPages(addPlanPage(pages, viewRef.current, sizeRef.current))}
            levels={levelOptions}
          />
          {pdf ? <span className="pk-muted">Last PDF {pdf.exportedAt ? new Date(pdf.exportedAt).toLocaleString('en-GB', { dateStyle: 'medium', timeStyle: 'short' }) : ''} · in Files › Parking maps</span> : null}
        </div>

        {canEdit ? (
          <>
            {sel ? (
              <Inspector
                item={sel}
                anchor={anchor}
                levels={levelOptions}
                floor={itemFloor(sel, drawings)}
                onPatch={patchSelected}
                onChangeNow={(patch) => sel && commit(replaceItem(itemsRef.current, { ...sel, ...patch } as ParkingItem))}
                onFocus={onFieldFocus}
                onBlur={onFieldBlur}
                onDelete={deleteSelected}
                onDuplicate={() => {
                  // A copy parks alongside: one vehicle width + 1 m to its right.
                  const h = sel.kind === 'vehicle' ? (sel.heading * Math.PI) / 180 : 0;
                  const gap = sel.kind === 'vehicle' ? sel.width + 1 : 5;
                  const r = duplicateItem(itemsRef.current, sel.id, { x: Math.cos(h) * gap, y: -Math.sin(h) * gap });
                  if (r) {
                    commit(r.items);
                    setSelected([r.id]);
                  }
                }}
              />
            ) : group.length ? (
              <GroupPanel
                items={group}
                onTurn={turnSelected}
                onColour={(colour) => commit(itemsRef.current.map((i) => (i.kind === 'vehicle' && selIds.includes(i.id) ? ({ ...i, colour } as ParkingItem) : i)))}
                onDuplicate={duplicateGroup}
                onDelete={deleteSelected}
                onClear={() => setSelected([])}
              />
            ) : (
              <p className="pk-muted" style={{ margin: 0 }}>
                Click anything on the map to edit it. ⌘/Ctrl- or Shift-click to pick several; Shift-drag a box; ⌘A picks everything. Drag to move; drag the white knob to turn a vehicle (Shift = free). Arrow keys nudge 10 cm (Shift 1 m); [ and ] turn 5° (Shift 45°) — several turn as one block. ⌘Z undoes.
              </p>
            )}

            <section className="pk-sec">
              <h3>Vehicles · true size</h3>
              {VEHICLES.map((v) => (
                <button key={v.type} type="button" className="pk-add" onClick={() => placeVehicle(v.type)}>
                  <span className="pk-swatch" style={{ background: roleColour(LIVE_PALETTE, v.role) }} aria-hidden />
                  {v.label}
                  <span className="pk-dims">{v.length} × {v.width}</span>
                </button>
              ))}
            </section>

            <section className="pk-sec">
              <h3>Markers</h3>
              <div className="pk-grid2">
                {MARKERS.map((m) => {
                  const Icon = MARKER_ICON[m.type];
                  return (
                    <button key={m.type} type="button" className="pk-tool" onClick={() => placeMarker(m.type)} style={{ justifyContent: 'flex-start', padding: '0 var(--lp-space-2)' }}>
                      <Icon size={14} aria-hidden /> {m.label}
                    </button>
                  );
                })}
              </div>
            </section>

            <section className="pk-sec">
              <h3>Draw</h3>
              <div className="pk-grid3">
                <button type="button" className="pk-tool" aria-pressed={tool.kind === 'draw' && tool.shape === 'route'} onClick={() => startDraw('route')}>
                  <RouteIcon size={14} aria-hidden /> Route
                </button>
                <button type="button" className="pk-tool" aria-pressed={tool.kind === 'draw' && tool.shape === 'area'} onClick={() => startDraw('area')}>
                  <Pentagon size={14} aria-hidden /> Area
                </button>
                <button type="button" className="pk-tool" aria-pressed={tool.kind === 'draw' && tool.shape === 'measure'} onClick={() => startDraw('measure')}>
                  <Ruler size={14} aria-hidden /> Measure
                </button>
              </div>
              {tool.kind === 'draw' && tool.shape === 'area' ? (
                <label className="pk-field">
                  New area is
                  <select className="adv-field" value={areaType} onChange={(e) => setAreaType(e.target.value as AreaType)}>
                    {AREAS.map((a) => (
                      <option key={a.type} value={a.type}>{a.label}</option>
                    ))}
                  </select>
                </label>
              ) : null}
            </section>

          </>
        ) : sel ? (
          <Inspector item={sel} anchor={anchor} readOnly onPatch={() => {}} onFocus={() => {}} onBlur={() => {}} onDelete={() => {}} onDuplicate={() => {}} />
        ) : null}

        <DrawingsPanel
          drawings={drawings}
          canEdit={canEdit}
          satellite={{ available: !!tilesKey(), on: satelliteOn }}
          errors={drawingErrors}
          files={drawingFiles}
          reuse={reuse ? { ...reuse, when: new Date(reuse.updatedAt).toLocaleDateString('en-GB', { month: 'short', year: 'numeric' }) } : null}
          uploading={uploading}
          warnings={warnings}
          onSatellite={(on) => {
            const { satellite: _drop, ...rest } = viewRef.current;
            void _drop;
            changeView(on ? rest : { ...rest, satellite: false });
          }}
          onChange={changeDrawings}
          onPick={(f) => setSetup({ file: f })}
          onUpload={(f) => void uploadDrawing(f)}
          onUseReuse={() => {
            if (!reuse || !anchor) return;
            changeDrawings(shiftDrawings(reuse.drawings, reuse.anchor, anchor));
            showToast(`${reuse.drawings.length === 1 ? 'The drawing' : `${reuse.drawings.length} drawings`} from last time placed — check ${reuse.drawings.length === 1 ? 'it' : 'them'} against the map`);
          }}
          onSetup={(d) => {
            const f = fileRefs.get(d.fileId);
            if (!f) return showToast(`${d.name}’s file isn’t available — was it deleted from Files?`, 'error');
            setSetup({ file: f, initial: d });
          }}
          onShow={showDrawing}
          onOpenFiles={() => void loadDrawingFiles()}
        />

        {canEdit ? (
          <DriverLinksPanel
            base={base}
            venueName={venueName}
            ensureSaved={async () => {
              if (saveTimer.current) {
                clearTimeout(saveTimer.current);
                saveTimer.current = null;
              }
              await save();
            }}
          />
        ) : null}

        <section className="pk-sec">
          <h3>Notes on the PDF</h3>
          <textarea
            className="adv-field"
            style={{ height: 'auto', minHeight: 96, padding: 'var(--lp-space-2) var(--lp-space-3)', lineHeight: 'var(--lp-leading-normal)' }}
            value={notes}
            readOnly={!canEdit}
            placeholder="e.g. Buses not before 08:00. Call security on arrival."
            onChange={(e) => {
              touch();
              setNotes(e.target.value);
            }}
            maxLength={4000}
          />
        </section>

        <p className="pk-muted" style={{ margin: 0 }}>
          Pinned to {venueName} · {anchor.lat.toFixed(5)}, {anchor.lng.toFixed(5)}. Sizes are true: {counts.vehicles ? `${counts.vehicles} vehicle${counts.vehicles === 1 ? '' : 's'} drawn at their real length and width.` : 'vehicles are drawn at their real length and width.'}
        </p>
      </aside>

      <div
        ref={mapRef}
        className="pk-map"
        data-tool={tool.kind}
        data-dragging={dragging}
        data-mode={mode}
        onPointerDown={mode === 'plan' ? onMapDown : undefined}
        onPointerMove={mode === 'plan' ? onMapMove : undefined}
        onPointerUp={mode === 'plan' ? onMapUp : undefined}
        onPointerCancel={mode === 'plan' ? onMapUp : undefined}
        onDoubleClick={() => mode === 'plan' && tool.kind === 'draw' && finishDraw()}
        role="application"
        aria-label={`Parking map for ${venueName}`}
      >
        {mode === '3d' && size.w ? (
          <Parking3D
            anchor={anchor}
            items={items}
            drawings={drawings}
            floors={floorCanvases}
            satellite={satelliteOn}
            fallback={{ centre: { x: frame.cx, y: frame.cy }, extent: Math.max(frame.wM, frame.hM) * 0.7, rotation: view.rotation }}
            key={shown3d.key}
            cam3d={shown3d.cam ?? pages.find((p): p is Page3d => p.kind === '3d' && !!p.cam)?.cam ?? undefined}
            canEdit={canEdit}
            pageTitle={shown3d.pageId ? pages.find((p) => p.id === shown3d.pageId)?.title ?? null : null}
            atLimit={pages.length >= MAX_PAGES}
            onAddPage={(cam) => {
              const next = add3dPage(pages, cam);
              setPages(next);
              setShown3d((st) => ({ ...st, pageId: next[next.length - 1].id }));
              showToast(`Added “${next[next.length - 1].title}” — page ${next.length} of the PDF`);
            }}
            onSaveToPage={(cam) => {
              if (!shown3d.pageId) return;
              setPages(updatePage(pages, shown3d.pageId, { cam } as Partial<PdfPage>));
              showToast('Page updated to this view');
            }}
          />
        ) : null}

        {mode === 'plan' && size.w ? (
          <ParkingScene
            view={view}
            width={size.w}
            height={size.h}
            items={items}
            tiles={tiles}
            palette={LIVE_PALETTE}
            selectedIds={selIds}
            drawings={sceneDrawings(shownDrawings, rasters, satelliteOn && !!session, level)}
            fadedIds={fadedIds}
            warnIds={warnIds}
            draft={draft}
            grid={!session || !satelliteOn}
            onItemDown={canEdit && tool.kind === 'select' ? onItemDown : undefined}
            onHandleDown={canEdit && tool.kind === 'select' ? onHandleDown : undefined}
          >
            <VenuePin at={project(view, size.w, size.h, { x: 0, y: 0 })} />
            {pinMarks.map((g, i) => {
              const q = project(view, size.w, size.h, g);
              return (
                <g key={i} className="pk-setup-pin" pointerEvents="none">
                  <circle cx={q.x} cy={q.y} r={11} />
                  <text x={q.x} y={q.y + 4} textAnchor="middle">{i + 1}</text>
                </g>
              );
            })}
            {box ? (
              <rect
                className="pk-box"
                x={Math.min(box.a.x, box.b.x)}
                y={Math.min(box.a.y, box.b.y)}
                width={Math.abs(box.b.x - box.a.x)}
                height={Math.abs(box.b.y - box.a.y)}
                pointerEvents="none"
              />
            ) : null}
          </ParkingScene>
        ) : null}

        {mode === 'plan' && tool.kind === 'draw' ? (
          <div className="pk-hint" onPointerDown={(e) => e.stopPropagation()}>
            {tool.shape === 'measure' ? 'Click two points' : `Click to add points${draft && draft.points.length > 1 && tool.shape === 'route' ? ` · ${fmtMetres(pathLength(draft.points))}` : ''} · double-click or Enter to finish`}
            {tool.shape !== 'measure' ? (
              <button type="button" className="adv-btn adv-btn-sm adv-btn-primary" onClick={() => finishDraw()}>Done</button>
            ) : null}
            <button type="button" className="adv-btn adv-btn-sm" onClick={cancelDraw}>Cancel</button>
          </div>
        ) : null}

        {mode === 'plan' && tool.kind === 'pick' ? (
          <div className="pk-hint pk-hint-right" onPointerDown={(e) => e.stopPropagation()}>
            {tool.prompt} · drag to move the map
            <button type="button" className="adv-btn adv-btn-sm" onClick={cancelDraw}>Cancel</button>
          </div>
        ) : null}

        {mode === 'plan' && setup && canEdit ? (
          <DrawingSetup
            key={`${setup.file.id}:${setup.initial?.id ?? 'new'}`}
            file={setup.file}
            initial={setup.initial}
            satelliteOn={satelliteOn && !!session}
            view={view}
            readUrl={`${base}/drawings/read`}
            requestMapPoint={requestMapPoint}
            onMarks={onPinMarks}
            onPreview={onPreviewDrawing}
            onDone={finishSetup}
            onCancel={() => {
              cancelDraw();
              setSetup(null);
              setPreviewDrawing(null);
            }}
          />
        ) : null}

        {mode === 'plan' && levels.length > 1 ? (
          <div className="pk-levels" role="group" aria-label="Level" onPointerDown={(e) => e.stopPropagation()}>
            <button type="button" aria-pressed={level == null} onClick={() => { const { level: _l, ...rest } = viewRef.current; void _l; changeView(rest); }}>
              All levels
            </button>
            {levelOptions.map((l) => (
              <button key={l.value} type="button" aria-pressed={level === l.value} onClick={() => changeView({ ...viewRef.current, level: l.value })}>
                {l.label}
              </button>
            ))}
          </div>
        ) : null}

        {conflict ? (
          <div className="pk-banner" onPointerDown={(e) => e.stopPropagation()}>
            <span className="adv-grow">This map was changed somewhere else since you opened it. Nothing has been overwritten.</span>
            <button
              type="button"
              className="adv-btn adv-btn-sm"
              onClick={() => {
                versionRef.current = conflict.version;
                setItems(conflict.items);
                setNotes(conflict.notes);
                setView(conflict.view);
                setDrawings(conflict.drawings ?? []);
                setHist({ past: [], future: [] });
                setConflict(null);
                setStatus('saved');
                setSaveError(null);
              }}
            >
              Load theirs
            </button>
            <button
              type="button"
              className="adv-btn adv-btn-sm adv-btn-primary"
              onClick={() => {
                versionRef.current = conflict.version;
                setConflict(null);
                void save();
              }}
            >
              Keep mine
            </button>
          </div>
        ) : null}

        <div className="pk-modes" role="group" aria-label="View" onPointerDown={(e) => e.stopPropagation()}>
          <button type="button" aria-pressed={mode === 'plan'} onClick={() => setMode('plan')}>
            Plan
          </button>
          <button
            type="button"
            aria-pressed={mode === '3d'}
            onClick={() => {
              cancelDraw();
              // Opened from the switch, not from a page: no page to update.
              setShown3d((st) => (st.pageId ? { pageId: null, cam: undefined, key: st.key + 1 } : st));
              setMode('3d');
            }}
          >
            3D
          </button>
        </div>

        {mode === 'plan' && imageryError ? (
          <div className="pk-badge" style={{ top: 'calc(var(--lp-space-3) + 44px)', left: 'var(--lp-space-3)', maxWidth: 360, pointerEvents: 'auto' }}>
            {imageryError === 'not-configured'
              ? 'No satellite imagery yet: the Google Map Tiles key isn’t set up. Sizes and the grid are still true.'
              : `Satellite imagery didn’t load: ${imageryError}`}
          </div>
        ) : null}

        {mode === 'plan' ? (
        <div className="pk-ctrls" onPointerDown={(e) => e.stopPropagation()}>
          <div className="pk-ctrl-group">
            <button type="button" className="pk-ctrl" aria-label="Zoom in" onClick={() => changeView(zoomAt(view, size.w, size.h, { x: size.w / 2, y: size.h / 2 }, 1.5))}>
              <Plus size={16} />
            </button>
            <button type="button" className="pk-ctrl" aria-label="Zoom out" onClick={() => changeView(zoomAt(view, size.w, size.h, { x: size.w / 2, y: size.h / 2 }, 1 / 1.5))}>
              <Minus size={16} />
            </button>
          </div>
          <div className="pk-ctrl-group">
            <button type="button" className="pk-ctrl" aria-label="Turn the map left 15°" onClick={() => changeView({ ...view, rotation: normDeg(view.rotation - 15) })}>
              <RotateCcw size={16} />
            </button>
            <button
              type="button"
              className="pk-ctrl"
              aria-label={`North ${view.rotation ? 'up (map is turned ' + Math.round(view.rotation) + '°)' : 'is up'}`}
              title="North up"
              onClick={() => changeView({ ...view, rotation: 0 })}
            >
              <Compass size={18} style={{ transform: `rotate(${-view.rotation - 45}deg)`, transition: 'transform var(--lp-dur-fast) var(--lp-ease-out)' }} />
            </button>
            <button type="button" className="pk-ctrl" aria-label="Turn the map right 15°" onClick={() => changeView({ ...view, rotation: normDeg(view.rotation + 15) })}>
              <RotateCw size={16} />
            </button>
          </div>
          {sel && sel.kind === 'vehicle' && canEdit ? (
            <div className="pk-ctrl-group">
              <button type="button" className="pk-ctrl" aria-label="Square the map to this vehicle" title="Square the map to this vehicle" onClick={() => changeView({ ...view, rotation: sel.heading, cx: sel.x, cy: sel.y })}>
                <Navigation size={15} />
              </button>
            </div>
          ) : null}
          {canEdit ? (
            <div className="pk-ctrl-group">
              <button type="button" className="pk-ctrl" aria-label="Undo" onClick={doUndo} disabled={!hist.past.length}>
                <Undo2 size={16} />
              </button>
              <button type="button" className="pk-ctrl" aria-label="Redo" onClick={doRedo} disabled={!hist.future.length}>
                <Redo2 size={16} />
              </button>
            </div>
          ) : null}
        </div>
        ) : null}

        {mode === 'plan' && size.w
          ? planFrames.map(({ page, n, frame: f, rotation }) => {
              const c = project(view, size.w, size.h, { x: f.cx, y: f.cy });
              const w = f.wM * view.ppm;
              const h = f.hM * view.ppm;
              return (
                <div
                  key={page.id}
                  aria-hidden
                  style={{
                    position: 'absolute',
                    left: c.x - w / 2,
                    top: c.y - h / 2,
                    width: w,
                    height: h,
                    transform: `rotate(${rotation - view.rotation}deg)`,
                    border: '1.5px dashed var(--lp-map-select)',
                    boxShadow: '0 0 0 1px var(--lp-map-halo)',
                    pointerEvents: 'none',
                  }}
                >
                  <span className="pk-badge" style={{ left: 0, top: 0, transform: 'translateY(-100%)', borderRadius: 'var(--lp-radius-sm) var(--lp-radius-sm) 0 0', whiteSpace: 'nowrap' }}>
                    Page {n} · {page.title} · 1:{f.scale.toLocaleString('en-GB')}
                  </span>
                </div>
              );
            })
          : null}

        {mode === 'plan' ? (
          <div className="pk-badge pk-scale" aria-label={`Scale bar: ${fmtMetres(scaleM)}`}>
            <span>{fmtMetres(scaleM)}</span>
            <span className="pk-scale-bar" style={{ width: scaleM * view.ppm }} />
          </div>
        ) : null}
        {mode === 'plan' && session ? <div className="pk-badge pk-attrib">Google Maps{attribution ? ` · ${attribution}` : ''}</div> : null}
      </div>
    </div>
  );
}

/** Several things picked at once: what they are, and what can be done to all of them. */
function GroupPanel({
  items,
  onTurn,
  onColour,
  onDuplicate,
  onDelete,
  onClear,
}: {
  items: ParkingItem[];
  onTurn: (by: number) => void;
  onColour: (colour: PaintId | undefined) => void;
  onDuplicate: () => void;
  onDelete: () => void;
  onClear: () => void;
}) {
  const vehicles = items.filter((i) => i.kind === 'vehicle');
  const kinds: [string, number][] = [
    ['vehicle', vehicles.length],
    ['marker', items.filter((i) => i.kind === 'marker').length],
    ['area', items.filter((i) => i.kind === 'area').length],
    ['route', items.filter((i) => i.kind === 'route').length],
    ['measurement', items.filter((i) => i.kind === 'measure').length],
  ];
  const what = kinds.filter(([, n]) => n).map(([k, n]) => `${n} ${k}${n === 1 ? '' : 's'}`).join(' · ');
  const colours = new Set(vehicles.map((v) => (v.kind === 'vehicle' ? (v.colour ?? '') : '')));
  const shared = colours.size === 1 ? [...colours][0] : null;
  return (
    <section className="pk-inspect" aria-label="Selected items">
      <div className="adv-row-flex" style={{ gap: 'var(--lp-space-2)' }}>
        <b style={{ fontSize: 'var(--lp-text-sm)' }} className="adv-grow">{items.length} selected</b>
        <button type="button" className="adv-btn adv-btn-sm" onClick={onDuplicate} aria-label="Duplicate all">
          <Copy size={13} />
        </button>
        <button type="button" className="adv-btn adv-btn-sm" onClick={onDelete} aria-label="Delete all">
          <Trash2 size={13} />
        </button>
      </div>
      <span className="pk-muted">{what}</span>
      <div className="pk-field">
        Turn together
        <div className="adv-row-flex" style={{ gap: 'var(--lp-space-1)', flexWrap: 'wrap' }}>
          {[-45, -5, 5, 45].map((by) => (
            <button key={by} type="button" className="adv-btn adv-btn-sm" onClick={() => onTurn(by)} aria-label={`Turn ${by < 0 ? 'left' : 'right'} ${Math.abs(by)}°`}>
              {by < 0 ? <RotateCcw size={13} aria-hidden /> : <RotateCw size={13} aria-hidden />} {Math.abs(by)}°
            </button>
          ))}
        </div>
      </div>
      {vehicles.length ? (
        <div className="pk-field">
          Colour{vehicles.length < items.length ? ' (vehicles)' : ''}
          <div className="pk-swatches" role="radiogroup" aria-label="Colour of the selected vehicles">
            <button
              type="button"
              role="radio"
              aria-checked={shared === ''}
              aria-label="Default (each type's colour)"
              title="Default — each type's colour"
              className="pk-paint pk-paint-default"
              style={{ background: roleColour(LIVE_PALETTE, 'bus') }}
              onClick={() => onColour(undefined)}
            />
            {PAINTS.map((c) => (
              <button
                key={c.id}
                type="button"
                role="radio"
                aria-checked={shared === c.id}
                aria-label={c.label}
                title={c.label}
                className="pk-paint"
                style={{ background: `var(--lp-map-paint-${c.id})` }}
                onClick={() => onColour(c.id)}
              />
            ))}
          </div>
        </div>
      ) : null}
      <span className="pk-muted">
        Drag any of them to move them all; arrows nudge, [ ] turn. ⌘/Ctrl-click one to take it out.{' '}
        <button type="button" className="adv-link" onClick={onClear}>Clear</button>
      </span>
    </section>
  );
}

function VenuePin({ at }: { at: Pt }) {
  return (
    <g pointerEvents="none" aria-hidden>
      <circle cx={at.x} cy={at.y} r={5} fill="var(--lp-map-select)" stroke="var(--lp-map-halo)" strokeWidth={2} />
      <circle cx={at.x} cy={at.y} r={11} fill="none" stroke="var(--lp-map-select)" strokeOpacity={0.6} strokeWidth={1.5} />
    </g>
  );
}

function num(v: string): number | null {
  const n = Number(v.replace(',', '.'));
  return Number.isFinite(n) ? n : null;
}

function Inspector({
  item,
  anchor,
  readOnly = false,
  onPatch,
  onFocus,
  onBlur,
  onDelete,
  onDuplicate,
  onChangeNow = () => {},
  levels = [],
  floor = 0,
}: {
  item: ParkingItem;
  anchor: LatLng;
  readOnly?: boolean;
  /** The map's levels (drawings.ts levelsOf), when there's more than one. */
  levels?: { value: number; label: string }[];
  /** The item's level as it stands (its own, or the drawing it's on). */
  floor?: number;
  /** One-click changes (colour, standard size): applied as one undo step. */
  onChangeNow?: (p: Partial<ParkingItem>) => void;
  onPatch: (p: Partial<ParkingItem>) => void;
  onFocus: () => void;
  onBlur: () => void;
  onDelete: () => void;
  onDuplicate: () => void;
}) {
  const f = { onFocus, onBlur, readOnly, disabled: readOnly };
  const title =
    item.kind === 'vehicle' ? vehicleSpec(item.type)?.label : item.kind === 'marker' ? markerSpec(item.type)?.label : item.kind === 'area' ? areaLabel(item.type) : item.kind === 'route' ? 'Route' : 'Measurement';

  return (
    <section className="pk-inspect" aria-label="Selected item">
      <div className="adv-row-flex" style={{ gap: 'var(--lp-space-2)' }}>
        <b style={{ fontSize: 'var(--lp-text-sm)' }} className="adv-grow">{title}</b>
        {!readOnly ? (
          <>
            {item.kind !== 'measure' ? (
              <button type="button" className="adv-btn adv-btn-sm" onClick={onDuplicate} aria-label="Duplicate">
                <Copy size={13} />
              </button>
            ) : null}
            <button type="button" className="adv-btn adv-btn-sm" onClick={onDelete} aria-label="Delete">
              <Trash2 size={13} />
            </button>
          </>
        ) : null}
      </div>

      {levels.length > 1 ? (
        <label className="pk-field">
          Level
          <select className="adv-field" value={floor} onChange={(e) => onChangeNow({ floor: Number(e.target.value) })} {...f}>
            {levels.map((l) => (
              <option key={l.value} value={l.value}>{l.label}</option>
            ))}
          </select>
        </label>
      ) : null}

      {item.kind === 'vehicle' ? (
        <>
          <label className="pk-field">
            Name on the map
            <input className="adv-field" value={item.label} maxLength={80} onChange={(e) => onPatch({ label: e.target.value })} {...f} />
          </label>
          <label className="pk-field">
            Type
            <select className="adv-field" value={item.type} onChange={(e) => onPatch({ type: e.target.value as VehicleType })} {...f}>
              {VEHICLES.map((v) => (
                <option key={v.type} value={v.type}>{v.label}</option>
              ))}
            </select>
          </label>
          <div className="pk-field">
            Colour
            <div className="pk-swatches" role="radiogroup" aria-label="Vehicle colour">
              <button
                type="button"
                role="radio"
                aria-checked={!item.colour}
                aria-label={`Default (${vehicleSpec(item.type)?.label ?? 'type'} colour)`}
                title="Default — the type's colour"
                disabled={readOnly}
                className="pk-paint pk-paint-default"
                style={{ background: roleColour(LIVE_PALETTE, vehicleSpec(item.type)?.role ?? 'bus') }}
                onClick={() => onChangeNow({ colour: undefined } as Partial<ParkingItem>)}
              />
              {PAINTS.map((c) => (
                <button
                  key={c.id}
                  type="button"
                  role="radio"
                  aria-checked={item.colour === c.id}
                  aria-label={c.label}
                  title={c.label}
                  disabled={readOnly}
                  className="pk-paint"
                  style={{ background: `var(--lp-map-paint-${c.id})` }}
                  onClick={() => onChangeNow({ colour: c.id } as Partial<ParkingItem>)}
                />
              ))}
            </div>
          </div>
          <div className="pk-grid3">
            {(['length', 'width', 'height'] as const).map((k) => (
              <label key={k} className="pk-field">
                {k === 'length' ? 'Length m' : k === 'width' ? 'Width m' : 'Height m'}
                <input
                  className="adv-field adv-mono"
                  inputMode="decimal"
                  defaultValue={item[k]}
                  key={`${item.id}-${k}-${item[k]}`}
                  onBlur={(e) => {
                    const n = num(e.target.value);
                    if (n != null && n >= 0.5 && n <= (k === 'length' ? 40 : k === 'width' ? 6 : 8)) onPatch({ [k]: n } as Partial<ParkingItem>);
                    else e.target.value = String(item[k]);
                    onBlur();
                  }}
                  onFocus={onFocus}
                  readOnly={readOnly}
                />
              </label>
            ))}
          </div>
          {!readOnly && vehicleSpec(item.type) && (vehicleSpec(item.type)!.length !== item.length || vehicleSpec(item.type)!.width !== item.width) ? (
            <button
              type="button"
              className="adv-link"
              style={{ alignSelf: 'flex-start', fontSize: 'var(--lp-text-xs)' }}
              onClick={() => {
                const s = vehicleSpec(item.type)!;
                onChangeNow({ length: s.length, width: s.width, height: s.height });
              }}
            >
              Use the standard {vehicleSpec(item.type)!.label} size
            </button>
          ) : null}
          <label className="pk-field">
            Facing (° from north)
            <input
              className="adv-field adv-mono"
              inputMode="numeric"
              defaultValue={Math.round(item.heading)}
              key={`${item.id}-h-${item.heading}`}
              onBlur={(e) => {
                const n = num(e.target.value);
                if (n != null) onPatch({ heading: normDeg(n) });
                onBlur();
              }}
              onFocus={onFocus}
              readOnly={readOnly}
            />
          </label>
        </>
      ) : null}

      {item.kind === 'marker' ? (
        <>
          <label className="pk-field">
            Type
            <select className="adv-field" value={item.type} onChange={(e) => onPatch({ type: e.target.value as MarkerType })} {...f}>
              {MARKERS.map((m) => (
                <option key={m.type} value={m.type}>{m.label}</option>
              ))}
            </select>
          </label>
          <label className="pk-field">
            Name
            <input className="adv-field" value={item.label} placeholder={markerSpec(item.type)?.label} maxLength={80} onChange={(e) => onPatch({ label: e.target.value })} {...f} />
          </label>
          <label className="pk-field">
            Detail
            <input className="adv-field" value={item.detail} placeholder={markerSpec(item.type)?.detailHint} maxLength={300} onChange={(e) => onPatch({ detail: e.target.value })} {...f} />
          </label>
          {item.type === 'height_limit' ? (
            <label className="pk-field">
              Clear height (m) — checked against every vehicle’s height
              <input
                className="adv-field adv-mono"
                inputMode="decimal"
                defaultValue={item.clear ?? ''}
                key={`${item.id}-clear-${item.clear ?? ''}`}
                placeholder="e.g. 4.2"
                onBlur={(e) => {
                  const v = e.target.value.trim();
                  const n = v ? num(v) : null;
                  if (!v) onPatch({ clear: undefined } as Partial<ParkingItem>);
                  else if (n != null && n >= 0.5 && n <= 20) onPatch({ clear: n } as Partial<ParkingItem>);
                  else e.target.value = item.clear != null ? String(item.clear) : '';
                  onBlur();
                }}
                onFocus={onFocus}
                readOnly={readOnly}
              />
            </label>
          ) : null}
          <GpsLine at={toLatLng(anchor, item)} />
        </>
      ) : null}

      {item.kind === 'route' ? (
        <>
          <label className="pk-field">
            Name
            <input className="adv-field" value={item.label} placeholder="e.g. Bus approach" maxLength={80} onChange={(e) => onPatch({ label: e.target.value })} {...f} />
          </label>
          <span className="pk-muted">{fmtMetres(pathLength(item.points))} · {item.points.length} points</span>
        </>
      ) : null}

      {item.kind === 'area' ? (
        <>
          <label className="pk-field">
            Type
            <select className="adv-field" value={item.type} onChange={(e) => onPatch({ type: e.target.value as AreaType })} {...f}>
              {AREAS.map((a) => (
                <option key={a.type} value={a.type}>{a.label}</option>
              ))}
            </select>
          </label>
          <label className="pk-field">
            Name
            <input className="adv-field" value={item.label} placeholder={areaLabel(item.type)} maxLength={80} onChange={(e) => onPatch({ label: e.target.value })} {...f} />
          </label>
          <span className="pk-muted" style={{ display: 'flex', alignItems: 'center', gap: 'var(--lp-space-2)' }}>
            <span className="pk-swatch" style={{ background: areaColour(LIVE_PALETTE, item.type), height: 10 }} aria-hidden />
            About {Math.round(polygonArea(item.points)).toLocaleString('en-GB')} m²
          </span>
        </>
      ) : null}

      {item.kind === 'measure' ? (
        <span style={{ fontSize: 'var(--lp-text-sm)' }}>
          <b className="adv-mono">{fmtMetres(dist(item.a, item.b))}</b> <span className="pk-muted">· {Math.round(bearing(item.a, item.b))}° from north</span>
        </span>
      ) : null}
    </section>
  );
}

function polygonArea(p: Pt[]): number {
  let s = 0;
  for (let i = 0; i < p.length; i++) {
    const a = p[i];
    const b = p[(i + 1) % p.length];
    s += a.x * b.y - b.x * a.y;
  }
  return Math.abs(s) / 2;
}

function GpsLine({ at }: { at: LatLng }) {
  const q = `${at.lat.toFixed(6)},${at.lng.toFixed(6)}`;
  return (
    <span className="pk-muted">
      {q} ·{' '}
      <a className="adv-link" href={`https://www.google.com/maps/search/?api=1&query=${q}`} target="_blank" rel="noopener noreferrer">
        Open in Google Maps
      </a>
    </span>
  );
}

/** No coordinates for this venue yet: find it, or paste them. */
function AnchorPicker({ show, backHref, canEdit, onPick }: { show: ParkingShow; backHref: string; canEdit: boolean; onPick: (a: LatLng) => void }) {
  const { showToast } = useToast();
  const [q, setQ] = useState([show.venue.name, show.venue.address ?? show.venue.city].filter(Boolean).join(', '));
  const [busy, setBusy] = useState(false);
  const find = async () => {
    const pasted = /^\s*(-?\d{1,2}(?:\.\d+)?)\s*,\s*(-?\d{1,3}(?:\.\d+)?)\s*$/.exec(q);
    if (pasted) {
      const lat = Number(pasted[1]);
      const lng = Number(pasted[2]);
      if (Math.abs(lat) <= 85 && Math.abs(lng) <= 180) return onPick({ lat, lng });
    }
    setBusy(true);
    try {
      const r = await fetch(`/api/geocode?address=${encodeURIComponent(q)}`);
      const j = (await r.json().catch(() => ({}))) as { lat?: number; lng?: number; error?: string };
      if (!r.ok || j.lat == null || j.lng == null) throw new Error(j.error ?? 'Not found');
      onPick({ lat: j.lat, lng: j.lng });
    } catch (e) {
      showToast(`Couldn’t find that place (${e instanceof Error ? e.message : 'error'}). Try the full address, or paste coordinates like 53.8027, -1.5446.`, 'error');
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="pk-anchor">
      <div className="pk-anchor-card">
        <Link href={backHref} className="adv-link" style={{ fontSize: 'var(--lp-text-xs)' }}>
          <ArrowLeft size={13} aria-hidden /> All shows
        </Link>
        <h1 className="lp-page-title" style={{ margin: 0 }}>Where is {show.venue.name ?? 'the venue'}?</h1>
        <p className="pk-muted" style={{ margin: 0 }}>
          This venue has no map position in Lowpass yet. Search for it, or paste coordinates from Google Maps (right-click the spot › copy the numbers). Everything on the parking map is measured from this point.
        </p>
        {canEdit ? (
          <form
            className="adv-row-flex"
            style={{ gap: 'var(--lp-space-2)' }}
            onSubmit={(e) => {
              e.preventDefault();
              void find();
            }}
          >
            <input className="adv-field adv-grow" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Venue address or coordinates" />
            <button type="submit" className="adv-btn adv-btn-primary" disabled={busy || !q.trim()}>
              {busy ? 'Finding…' : 'Find'}
            </button>
          </form>
        ) : (
          <p className="pk-muted" style={{ margin: 0 }}>Ask an admin or manager to set it.</p>
        )}
      </div>
    </div>
  );
}

const PLAN_SCALES: PrintScale[] = [200, 250, 500, 750, 1000, 1500, 2000, 2500, 5000];

/** The PDF's pages: what prints, in order (pages.ts). */
function PagesPanel({
  pages,
  autoScale,
  canEdit,
  mode,
  onChange,
  onShow,
  onAddPlan,
  levels = [],
}: {
  pages: PdfPage[];
  autoScale: number;
  canEdit: boolean;
  mode: 'plan' | '3d';
  /** The map's levels, when it has more than one: a plan page can print one. */
  levels?: { value: number; label: string }[];
  onChange: (next: PdfPage[]) => void;
  onShow: (page: PdfPage) => void;
  onAddPlan: () => void;
}) {
  return (
    <section className="pk-sec" aria-label="PDF pages">
      <h3>PDF pages</h3>
      <ol className="pk-pages">
        {pages.map((p, i) => (
          <li key={p.id} className="pk-pagerow">
            <span className="pk-pagenum" aria-hidden>
              {i + 1}
            </span>
            <span className="pk-pagekind">{p.kind === '3d' ? '3D' : 'Plan'}</span>
            <input
              className="adv-field pk-pagetitle"
              value={p.title}
              maxLength={60}
              readOnly={!canEdit}
              aria-label={`Page ${i + 1} name`}
              onChange={(e) => onChange(updatePage(pages, p.id, { title: e.target.value }))}
            />
            {p.kind === 'plan' ? (
              <select
                className="adv-field pk-pagescale"
                aria-label={`Page ${i + 1} scale`}
                disabled={!canEdit}
                value={p.fit ? String(p.scale) : String(p.scale)}
                onChange={(e) => {
                  const v = e.target.value;
                  onChange(updatePage(pages, p.id, { scale: v === 'auto' ? 'auto' : (Number(v) as PrintScale) } as Partial<PdfPage>));
                }}
              >
                {p.fit ? <option value="auto">Fit (1:{autoScale.toLocaleString('en-GB')})</option> : null}
                {PLAN_SCALES.map((n) => (
                  <option key={n} value={n}>
                    1:{n.toLocaleString('en-GB')}
                  </option>
                ))}
              </select>
            ) : (
              <span className="pk-muted pk-pagescale">{p.cam ? 'Your view' : 'Default view'}</span>
            )}
            {p.kind === 'plan' && levels.length > 1 ? (
              <select
                className="adv-field pk-pagelevel"
                aria-label={`Page ${i + 1} level`}
                disabled={!canEdit}
                value={p.level == null ? 'all' : String(p.level)}
                onChange={(e) => {
                  const v = e.target.value;
                  const { level: _drop, ...rest } = p;
                  void _drop;
                  onChange(pages.map((x) => (x.id === p.id ? (v === 'all' ? rest : { ...rest, level: Number(v) }) : x)) as PdfPage[]);
                }}
              >
                <option value="all">All levels</option>
                {levels.map((l) => (
                  <option key={l.value} value={l.value}>{l.label}</option>
                ))}
              </select>
            ) : null}
            <span className="pk-pageacts">
              <button type="button" className="adv-link" onClick={() => onShow(p)}>
                Show
              </button>
              {canEdit ? (
                <>
                  <button type="button" className="pk-iconbtn" aria-label={`Move page ${i + 1} up`} disabled={i === 0} onClick={() => onChange(movePage(pages, p.id, -1))}>
                    <ChevronUp size={13} />
                  </button>
                  <button
                    type="button"
                    className="pk-iconbtn"
                    aria-label={`Move page ${i + 1} down`}
                    disabled={i === pages.length - 1}
                    onClick={() => onChange(movePage(pages, p.id, 1))}
                  >
                    <ChevronDown size={13} />
                  </button>
                  <button type="button" className="pk-iconbtn" aria-label={`Remove page ${i + 1}`} disabled={pages.length === 1} onClick={() => onChange(removePage(pages, p.id))}>
                    <X size={13} />
                  </button>
                </>
              ) : null}
            </span>
          </li>
        ))}
      </ol>
      {canEdit ? (
        <div className="adv-row-flex" style={{ gap: 'var(--lp-space-2)', flexWrap: 'wrap' }}>
          <button type="button" className="adv-btn adv-btn-sm" onClick={onAddPlan} disabled={mode !== 'plan' || pages.length >= MAX_PAGES}>
            <Plus size={13} aria-hidden /> This plan view
          </button>
          <span className="pk-muted">{mode === 'plan' ? 'For a 3D page, switch to 3D and add the view there.' : 'In 3D: “Add this view as a page”.'}</span>
        </div>
      ) : null}
    </section>
  );
}
