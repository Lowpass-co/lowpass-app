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
import { ArrowLeft, Compass, Copy, Download, Minus, Navigation, Plus, Redo2, RotateCcw, RotateCw, Route as RouteIcon, Ruler, Pentagon, Trash2, Undo2 } from 'lucide-react';
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
  tileRect,
  tileZoomFor,
  toLatLng,
  unproject,
  viewBounds,
  visibleTiles,
  zoomAt,
  type LatLng,
  type Pt,
  type View,
} from '@/lib/parking/geo';
import { AREAS, MARKERS, VEHICLES, areaLabel, markerSpec, vehicleSpec, type AreaType, type MarkerType, type VehicleType } from '@/lib/parking/catalogue';
import { pathLength, type ParkingItem } from '@/lib/parking/model';
import { addMarker, addVehicle, duplicateItem, finishDraft, moveItem, record, redo, removeItem, replaceItem, undo, type History } from '@/lib/parking/edit';
import type { ParkingShow, SavedParkingMap } from '@/server/parking/maps';
import { ParkingScene, MARKER_ICON, type Draft, type SceneTile } from './ParkingScene';
import { LIVE_PALETTE, roleColour, areaColour } from './palette';
import { getTileSession, tileUrl, tilesKey, viewportInfo, type TileSession } from './googleTiles';
import { exportParkingPdf } from './exportPdf';
import { freeSpot, printFrame, type PrintScaleChoice } from '@/lib/parking/print';
import '@/components/advance/advance.css';
import './parking.css';

type Tool = { kind: 'select' } | { kind: 'draw'; shape: 'route' | 'area' | 'measure' };

type Drag =
  | { kind: 'pan'; start: Pt; view0: View; moved: boolean }
  | { kind: 'move'; id: string; start: Pt; item0: ParkingItem; items0: ParkingItem[]; moved: boolean }
  | { kind: 'rotate'; id: string; items0: ParkingItem[]; moved: boolean }
  | { kind: 'end'; id: string; which: 'a' | 'b'; items0: ParkingItem[]; moved: boolean }
  | { kind: 'pinch'; d0: number; view0: View; mid: Pt };

const DEFAULT_VIEW: View = { cx: 0, cy: 0, ppm: 3, rotation: 0 };
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
  const [hist, setHist] = useState<History<ParkingItem[]>>({ past: [], future: [] });
  const [selected, setSelected] = useState<string | null>(null);
  const [tool, setTool] = useState<Tool>({ kind: 'select' });
  const [areaType, setAreaType] = useState<AreaType>('crew');
  const [draft, setDraft] = useState<Draft | null>(null);
  const [size, setSize] = useState({ w: 0, h: 0 });
  const [dragging, setDragging] = useState(false);
  const [pdf, setPdf] = useState(initial?.pdf ?? null);
  const [exporting, setExporting] = useState(false);
  const [printScale, setPrintScale] = useState<PrintScaleChoice>('auto');

  // Imagery
  const [session, setSession] = useState<TileSession | null>(null);
  const [imageryError, setImageryError] = useState<string | null>(tilesKey() ? null : 'not-configured');
  const [attribution, setAttribution] = useState('');
  const [maxZoom, setMaxZoom] = useState(20);

  // Saving
  const [status, setStatus] = useState<SaveStatusKind>('idle');
  const [savedAt, setSavedAt] = useState<Date | null>(initial ? new Date(initial.updatedAt) : null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [conflict, setConflict] = useState<SavedParkingMap | null>(null);

  const mapRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef(view);
  const itemsRef = useRef(items);
  const sizeRef = useRef(size);
  const drag = useRef<Drag | null>(null);
  const pointers = useRef(new Map<number, Pt>());
  const versionRef = useRef<number | null>(initial?.version ?? null);
  const dataRef = useRef({ anchor, view, items, notes });
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const saving = useRef(false);
  const again = useRef(false);
  const touched = useRef(false);
  const focusSnap = useRef<ParkingItem[] | null>(null);
  viewRef.current = view;
  itemsRef.current = items;
  sizeRef.current = size;
  dataRef.current = { anchor, view, items, notes };

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
  useEffect(() => {
    if (!tilesKey() || !anchor) return;
    let live = true;
    getTileSession()
      .then((s) => live && setSession(s))
      .catch((e: Error) => live && setImageryError(e.message));
    return () => {
      live = false;
    };
  }, [anchor]);

  const dpr = typeof window === 'undefined' ? 1 : Math.min(window.devicePixelRatio || 1, 2);
  const tiles: SceneTile[] = useMemo(() => {
    if (!session || !anchor || !size.w) return [];
    const z = tileZoomFor(anchor.lat, view.ppm, dpr, session.tileScale, maxZoom);
    const layer = (zz: number) =>
      visibleTiles(anchor, view, size.w, size.h, zz, 64).map((k) => ({ id: `${k.z}/${k.x}/${k.y}`, href: tileUrl(session, k), ...tileRect(anchor, k) }));
    // A coarse layer underneath, so zooming never flashes blank.
    const under = z - 3 >= 1 ? layer(z - 3) : [];
    return [...under, ...layer(z)];
  }, [session, anchor, view, size.w, size.h, dpr, maxZoom]);

  useEffect(() => {
    if (!session || !anchor || !size.w) return;
    const t = setTimeout(() => {
      const z = tileZoomFor(anchor.lat, view.ppm, dpr, session.tileScale, 22);
      viewportInfo(session, z, viewBounds(anchor, view, size.w, size.h), toLatLng(anchor, { x: view.cx, y: view.cy }))
        .then((v) => {
          setAttribution(v.copyright);
          setMaxZoom(v.maxZoom);
        })
        .catch(() => {});
    }, 500);
    return () => clearTimeout(t);
  }, [session, anchor, view, size.w, size.h, dpr]);

  const frame = useMemo(() => printFrame(items, view, size, printScale), [items, view, size, printScale]);
  const autoScale = useMemo(() => printFrame(items, view, size, 'auto').scale, [items, view, size]);

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
  }, [anchor, view, items, notes, save, conflict]);

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
    drag.current = { kind: 'pan', start: local(e), view0: viewRef.current, moved: false };
  };

  const onItemDown = (e: ReactPointerEvent, item: ParkingItem) => {
    if (!canEdit || tool.kind !== 'select') return;
    setSelected(item.id);
    drag.current = { kind: 'move', id: item.id, start: ground(e), item0: item, items0: itemsRef.current, moved: false };
  };

  const onHandleDown = (e: ReactPointerEvent, item: ParkingItem, handle: string) => {
    if (!canEdit || tool.kind !== 'select') return;
    e.stopPropagation();
    mapRef.current?.setPointerCapture(e.pointerId);
    pointers.current.set(e.pointerId, local(e));
    setSelected(item.id);
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
    const g = ground(e);
    if (d.kind === 'move') {
      d.moved = true;
      setDragging(true);
      setItems((list) => replaceItem(list, moveItem(d.item0, { x: g.x - d.start.x, y: g.y - d.start.y })));
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
    if (!d) return;
    if (d.kind === 'pan' && !d.moved) {
      if (tool.kind === 'draw') addPoint(ground(e));
      else setSelected(null);
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
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, [anchor]);

  /* ── Drawing ──────────────────────────────────────────── */
  const startDraw = (shape: 'route' | 'area' | 'measure') => {
    setSelected(null);
    setTool({ kind: 'draw', shape });
    setDraft({ kind: shape, points: [], cursor: null });
  };
  const cancelDraw = () => {
    setTool({ kind: 'select' });
    setDraft(null);
  };
  const finishDraw = useCallback(
    (points?: Pt[]) => {
      if (tool.kind !== 'draw' || !draft) return;
      const r = finishDraft(itemsRef.current, tool.shape, points ?? draft.points, areaType);
      if (r) {
        commit(r.items);
        setSelected(r.id);
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
    commit(r.items);
    setSelected(r.id);
    cancelDraw();
  };
  const placeMarker = (t: MarkerType) => {
    const r = addMarker(itemsRef.current, t, freeSpot(itemsRef.current, centre(), viewRef.current));
    commit(r.items);
    setSelected(r.id);
    cancelDraw();
  };

  const sel = items.find((i) => i.id === selected) ?? null;

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
    if (!selected) return;
    commit(removeItem(itemsRef.current, selected));
    setSelected(null);
  }, [selected, commit]);

  /* ── Keyboard ─────────────────────────────────────────── */
  useEffect(() => {
    if (!canEdit) return;
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' || t.isContentEditable)) return;
      const mod = e.metaKey || e.ctrlKey;
      if (mod && e.key.toLowerCase() === 'z') {
        e.preventDefault();
        if (e.shiftKey) doRedo();
        else doUndo();
        return;
      }
      if (tool.kind === 'draw') {
        if (e.key === 'Escape') cancelDraw();
        else if (e.key === 'Enter') finishDraw();
        else if (e.key === 'Backspace' && draft?.points.length) setDraft({ ...draft, points: draft.points.slice(0, -1) });
        return;
      }
      if (e.key === 'Escape') return setSelected(null);
      if (!sel) return;
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
        commit(replaceItem(itemsRef.current, moveItem(sel, d)));
        return;
      }
      if ((e.key === '[' || e.key === ']') && sel.kind === 'vehicle') {
        const by = (e.key === ']' ? 1 : -1) * (e.shiftKey ? 45 : 5);
        commit(replaceItem(itemsRef.current, { ...sel, heading: normDeg(sel.heading + by) }));
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [canEdit, tool, draft, sel, doUndo, doRedo, finishDraw, deleteSelected, commit]);

  /* ── Export ───────────────────────────────────────────── */
  const venueName = show.venue.name ?? show.venue.city ?? 'Show';
  const dateLabel = new Date(`${show.date}T12:00:00Z`).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });

  const doExport = async () => {
    if (!anchor || exporting) return;
    setExporting(true);
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
        view,
        frame,
        items,
        notes,
        session,
        maxZoom,
        attribution,
      });
      const url = URL.createObjectURL(out.blob);
      window.open(url, '_blank', 'noopener');
      setTimeout(() => URL.revokeObjectURL(url), 60_000);
      if (canEdit) {
        try {
          const file = await uploadToFiles({ scope: 'tour', scopeId: show.tourId, folder: 'Parking maps', file: new File([out.blob], out.fileName, { type: 'application/pdf' }) });
          const link = await fetch('/api/file-links', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ fileId: file.id, type: 'show', entityId: show.routingId }) });
          const r = await fetch(base, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ pdfFileId: file.id }) });
          const j = (await r.json().catch(() => ({}))) as { map?: SavedParkingMap };
          if (j.map?.pdf) setPdf(j.map.pdf);
          showToast(
            link.ok
              ? `PDF saved to Files › Parking maps at 1:${out.scale.toLocaleString('en-GB')}, linked to this show`
              : 'PDF saved to Files › Parking maps, but it couldn’t be linked to this show',
            link.ok ? undefined : 'error',
          );
        } catch (e) {
          showToast(`The PDF opened, but it couldn’t be saved to Files: ${e instanceof Error ? e.message : 'error'}`, 'error');
        }
      }
    } catch (e) {
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
  // The print area, outlined on the map: exactly what the PDF will show.
  const fc = project(view, size.w, size.h, { x: frame.cx, y: frame.cy });
  const fw = frame.wM * view.ppm;
  const fh = frame.hM * view.ppm;
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
          <label className="pk-field" style={{ flexDirection: 'row', alignItems: 'center', gap: 'var(--lp-space-2)' }}>
            Print scale
            <select
              className="adv-field"
              style={{ height: 30, width: 'auto', flex: 1 }}
              value={String(printScale)}
              onChange={(e) => setPrintScale(e.target.value === 'auto' ? 'auto' : (Number(e.target.value) as PrintScaleChoice))}
              aria-label="Print scale"
            >
              <option value="auto">Fit the drawing ({`1:${autoScale.toLocaleString('en-GB')}`})</option>
              {[200, 250, 500, 750, 1000, 1500, 2000].map((n) => (
                <option key={n} value={n}>1:{n.toLocaleString('en-GB')}</option>
              ))}
            </select>
          </label>
          {pdf ? <span className="pk-muted">Last PDF {pdf.exportedAt ? new Date(pdf.exportedAt).toLocaleString('en-GB', { dateStyle: 'medium', timeStyle: 'short' }) : ''} · in Files › Parking maps</span> : null}
        </div>

        {canEdit ? (
          <>
            {sel ? (
              <Inspector
                item={sel}
                anchor={anchor}
                onPatch={patchSelected}
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
                    setSelected(r.id);
                  }
                }}
              />
            ) : (
              <p className="pk-muted" style={{ margin: 0 }}>
                Click anything on the map to edit it. Drag to move; drag the white knob to turn a vehicle (Shift = free). Arrow keys nudge 10 cm (Shift 1 m); [ and ] turn 5° (Shift 45°). ⌘Z undoes.
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
        onPointerDown={onMapDown}
        onPointerMove={onMapMove}
        onPointerUp={onMapUp}
        onPointerCancel={onMapUp}
        onDoubleClick={() => tool.kind === 'draw' && finishDraw()}
        role="application"
        aria-label={`Parking map for ${venueName}`}
      >
        {size.w ? (
          <ParkingScene
            view={view}
            width={size.w}
            height={size.h}
            items={items}
            tiles={tiles}
            palette={LIVE_PALETTE}
            selectedId={selected}
            draft={draft}
            grid={!session}
            onItemDown={canEdit && tool.kind === 'select' ? onItemDown : undefined}
            onHandleDown={canEdit && tool.kind === 'select' ? onHandleDown : undefined}
          >
            <VenuePin at={project(view, size.w, size.h, { x: 0, y: 0 })} />
          </ParkingScene>
        ) : null}

        {tool.kind === 'draw' ? (
          <div className="pk-hint" onPointerDown={(e) => e.stopPropagation()}>
            {tool.shape === 'measure' ? 'Click two points' : `Click to add points${draft && draft.points.length > 1 && tool.shape === 'route' ? ` · ${fmtMetres(pathLength(draft.points))}` : ''} · double-click or Enter to finish`}
            {tool.shape !== 'measure' ? (
              <button type="button" className="adv-btn adv-btn-sm adv-btn-primary" onClick={() => finishDraw()}>Done</button>
            ) : null}
            <button type="button" className="adv-btn adv-btn-sm" onClick={cancelDraw}>Cancel</button>
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

        {imageryError ? (
          <div className="pk-badge" style={{ top: 'var(--lp-space-3)', left: 'var(--lp-space-3)', maxWidth: 360, pointerEvents: 'auto' }}>
            {imageryError === 'not-configured'
              ? 'No satellite imagery yet: the Google Map Tiles key isn’t set up. Sizes and the grid are still true.'
              : `Satellite imagery didn’t load: ${imageryError}`}
          </div>
        ) : null}

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

        {size.w ? (
          <div
            aria-hidden
            style={{
              position: 'absolute',
              left: fc.x - fw / 2,
              top: fc.y - fh / 2,
              width: fw,
              height: fh,
              border: '1.5px dashed var(--lp-map-select)',
              boxShadow: '0 0 0 1px var(--lp-map-halo)',
              pointerEvents: 'none',
            }}
          >
            <span className="pk-badge" style={{ left: 0, top: 0, transform: 'translateY(-100%)', borderRadius: 'var(--lp-radius-sm) var(--lp-radius-sm) 0 0' }}>
              Prints at 1:{frame.scale.toLocaleString('en-GB')} · A4
            </span>
          </div>
        ) : null}

        <div className="pk-badge pk-scale" aria-label={`Scale bar: ${fmtMetres(scaleM)}`}>
          <span>{fmtMetres(scaleM)}</span>
          <span className="pk-scale-bar" style={{ width: scaleM * view.ppm }} />
        </div>
        {session ? <div className="pk-badge pk-attrib">Google Maps{attribution ? ` · ${attribution}` : ''}</div> : null}
      </div>
    </div>
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
}: {
  item: ParkingItem;
  anchor: LatLng;
  readOnly?: boolean;
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
                onFocus();
                onPatch({ length: s.length, width: s.width, height: s.height });
                onBlur();
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
