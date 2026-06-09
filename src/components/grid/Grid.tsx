'use client';

/* ============================================
   LOWPASS — Canonical <Grid> (Phase 1: the spreadsheet core)

   Faithful port of docs/prototypes/grid-playbox.html — ONE grid every
   tabular surface will use. Phase 1 = behaviour + look, static data, no
   slide-over / income / FX feed (those are later phases).

   Implements: the full column model (text/money/number/check/dropdown/
   status/variance/formula/calc/receipts/doc), keyboard nav, Shift-range +
   drag select, ⌘C/⌘V/⌫, ⌘Z/⌘⇧Z undo, type-to-edit, Enter/Tab commit (no
   double-fire — the edit input stops propagation AND the doc handler bails
   while editing), column resize (ghost + clamp), row/section/column reorder
   (pointer-based + FLIP, never native DnD), density, raised section cards
   with a stable per-section accent, styled status/dropdown menus, custom
   columns (+ number formula), delete custom column / day-type with confirm.

   Source-of-truth lives in refs (mirroring the playbox's mutate-then-render
   model) with a force() re-render — this keeps the many pointer/keyboard
   interactions free of React batching surprises. Uncontrolled edit inputs
   are read on commit, exactly like the reference.
   ============================================ */

import './grid.css';
import { forwardRef, useCallback, useEffect, useImperativeHandle, useLayoutEffect, useReducer, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import type { Column, Density, GridFx, GridStatusConfig, GroupBy, Row, Section, Sel, Snapshot } from './types';
import {
  ACCENTS,
  STATUSES,
  cloneData,
  colDef,
  demoFx,
  disp,
  flatRows,
  fmt,
  formulaEst,
  inSel,
  isFormula,
  navCols,
  rowMatches,
  stripCols,
  template,
  variance,
  visCols,
  withCalc,
} from './gridModel';
import { GridMenu, type MenuConfig } from './GridMenu';
import { GridSlideOver } from './GridSlideOver';
import {
  GridConfirm,
  GridPrompt,
  GridWarn,
  type ConfirmState,
  type PromptState,
  type WarnState,
} from './GridModals';

/* This component is deliberately ref-as-source-of-truth (see the header):
   the memoised callbacks read live refs (NC()/flat()/getRowObj()), so their
   dependency arrays are intentionally minimal — they never need to re-create
   to "see" fresh data. exhaustive-deps would force noise that hides nothing. */
/* eslint-disable react-hooks/exhaustive-deps */

/** Imperative handle for the portaled drag overlays (resize ghost +
 *  reorder insertion line). State-driven so they can't be hidden by any
 *  cascade; only the tiny overlay re-renders on pointermove, not the grid. */
interface OverlayHandle {
  setGhost: (x: number | null) => void;
  setIns: (spec: { axis: 'x' | 'y'; left: number; top: number; width: number; height: number } | null) => void;
}

export interface GridProps {
  initialData: Section[];
  initialColumns: Column[];
  /** Phase 2 wires the slide-over here; Phase 1 leaves it undefined. */
  onOpenRow?: (si: number, ri: number) => void;
  /** Persistence hook — fires after a cell commit / status / dropdown / check
      edit, with the row's _uid (= DB id on real surfaces). Phase 3. */
  onEdit?: (rowUid: string, field: string, value: unknown) => void;
  /** Currency/FX injection (default: demo static table). */
  fx?: GridFx;
  /** Status set for the slide's status menu (default: canonical 4). */
  slideStatuses?: GridStatusConfig;
  /** Force the slide's LINE variant (budget Expenses — no person/hotel/
      settlement variants). */
  slideLineVariant?: boolean;
}

type ReorderKind = 'section' | 'row' | 'col';

export function Grid({
  initialData,
  initialColumns,
  onOpenRow,
  onEdit,
  fx: fxProp,
  slideStatuses,
  slideLineVariant,
}: GridProps) {
  const fx = fxProp ?? demoFx;
  const onEditRef = useRef(onEdit);
  onEditRef.current = onEdit;
  const [tick, force] = useReducer((x: number) => x + 1, 0);
  const render = useCallback(() => force(), []);

  /* ---- source of truth (refs) ---- */
  const uidc = useRef(0);
  const dataRef = useRef<Section[]>([]);
  const colsRef = useRef<Column[]>([]);
  const widthsRef = useRef<Record<string, number>>({});
  const calcFns = useRef<Record<string, (row: Row) => number>>({});
  const selRef = useRef<Sel>({ ar: 0, ac: 0, fr: 0, fc: 0 });
  const densityRef = useRef<Density>('comfortable');
  const groupRef = useRef<GroupBy>('section');
  const queryRef = useRef('');
  const filterRef = useRef<Set<string>>(new Set(STATUSES));

  const undoRef = useRef<Snapshot[]>([]);
  const redoRef = useRef<Snapshot[]>([]);
  const clipRef = useRef<string[][] | null>(null);

  const editRef = useRef<{ r: number; c: number; prefill?: string } | null>(null);
  /** inline formula-row edit (pct / fixed est). */
  const fxEditRef = useRef<{ si: number; ri: number; field: 'pct' | 'est' } | null>(null);
  const menuRef = useRef<MenuConfig | null>(null);
  const confirmRef = useRef<ConfirmState | null>(null);
  const promptRef = useRef<PromptState | null>(null);
  const warnRef = useRef<WarnState | null>(null);
  /** toolbar popovers. */
  const popRef = useRef<'filter' | 'cols' | 'addcol' | null>(null);
  const popAnchorRef = useRef<{ left: number; bottom: number }>({ left: 0, bottom: 0 });
  /** open slide-over target (Phase 2). */
  const slideRef = useRef<{ si: number; ri: number } | null>(null);

  /* drag machinery */
  const rootRef = useRef<HTMLDivElement>(null);
  const overlayRef = useRef<OverlayHandle>(null);
  const selDragRef = useRef(false);
  const rzRef = useRef<{ key: string; x: number; w: number } | null>(null);
  const reRef = useRef<{
    kind: ReorderKind;
    arr: unknown[];
    items: HTMLElement[];
    axis: 'x' | 'y';
    from: number;
    si0: number | null;
    to: number;
    started: boolean;
    sx: number;
    sy: number;
    dragEl: HTMLElement | null;
  } | null>(null);
  const flipRef = useRef<{ sel: string; keyAttr: string; first: Map<string, DOMRect> } | null>(null);

  /* ---- one-time init ---- */
  const inited = useRef(false);
  if (!inited.current) {
    inited.current = true;
    const data = cloneData(initialData);
    data.forEach((s, i) => {
      if (!s.accent) s.accent = ACCENTS[i % ACCENTS.length];
      if (!s._uid) s._uid = 's' + uidc.current++;
      s.rows.forEach((r) => {
        if (!r._uid) r._uid = 'r' + uidc.current++;
      });
    });
    dataRef.current = data;
    colsRef.current = initialColumns.map((c) => ({ ...c }));
    const w: Record<string, number> = {};
    initialColumns.forEach((c) => {
      w[c.id] = c.w;
      if (c.calc) calcFns.current[c.id] = c.calc;
    });
    widthsRef.current = w;
  }

  const data = () => dataRef.current;
  const cols = () => colsRef.current;
  const widths = () => widthsRef.current;
  const sel = () => selRef.current;
  const NC = () => navCols(cols());
  const flat = () => flatRows(data(), queryRef.current, filterRef.current);

  /* ---- undo / redo ---- */
  const pushUndo = useCallback(() => {
    undoRef.current.push({
      data: cloneData(data()),
      cols: stripCols(cols()),
      widths: { ...widths() },
    });
    if (undoRef.current.length > 60) undoRef.current.shift();
    redoRef.current = [];
  }, []);
  const applyState = useCallback(
    (s: Snapshot) => {
      dataRef.current = cloneData(s.data);
      colsRef.current = withCalc(s.cols, calcFns.current);
      widthsRef.current = { ...s.widths };
      render();
    },
    [render],
  );
  const undo = useCallback(() => {
    if (!undoRef.current.length) return;
    redoRef.current.push({ data: cloneData(data()), cols: stripCols(cols()), widths: { ...widths() } });
    applyState(undoRef.current.pop()!);
  }, [applyState]);
  const redo = useCallback(() => {
    if (!redoRef.current.length) return;
    undoRef.current.push({ data: cloneData(data()), cols: stripCols(cols()), widths: { ...widths() } });
    applyState(redoRef.current.pop()!);
  }, [applyState]);

  /* ---- selection / editing helpers ---- */
  const getRowObj = () => flat()[sel().fr];

  const move = useCallback(
    (dr: number, dc: number, extend?: boolean) => {
      const n = flat().length;
      const s = sel();
      s.fr = Math.max(0, Math.min(n - 1, s.fr + dr));
      s.fc = Math.max(0, Math.min(NC().length - 1, s.fc + dc));
      if (!extend) {
        s.ar = s.fr;
        s.ac = s.fc;
      }
      render();
      requestAnimationFrame(() => {
        rootRef.current?.querySelector('.cell.active')?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
      });
    },
    [render],
  );

  const commitEdit = useCallback(() => {
    const e = editRef.current;
    if (!e) return;
    const input = rootRef.current?.querySelector('.cell .editing') as HTMLInputElement | null;
    if (!input) {
      editRef.current = null;
      return;
    }
    const key = NC()[e.c];
    const o = flat()[e.r];
    const t = colDef(cols(), key)?.type;
    let v: string | number = input.value;
    pushUndo();
    if (t === 'money' || t === 'number') v = parseFloat(String(v).replace(/[^0-9.\-]/g, '')) || 0;
    if (o) {
      o.row[key] = v;
      if (o.row._uid) onEditRef.current?.(o.row._uid, key, v);
    }
    editRef.current = null;
    render();
  }, [pushUndo, render]);

  const startEdit = useCallback(
    (prefill?: string) => {
      const key = NC()[sel().fc];
      const t = colDef(cols(), key)?.type;
      if (t === 'status' || t === 'dropdown' || t === 'check') return;
      const og = getRowObj();
      if (
        og &&
        data()[og.si]?.kind === 'derived' &&
        key === 'est' &&
        (data()[og.si].source === 'Payroll' || data()[og.si].source === 'Rooming')
      ) {
        const src = data()[og.si].source!;
        warnRef.current = {
          title: 'Pulled from ' + src,
          body: `Estimates for this line come from ${src} and can't be edited here. Actuals can still be edited.`,
          target: src,
        };
        render();
        return;
      }
      editRef.current = { r: sel().fr, c: sel().fc, prefill };
      render();
    },
    [render],
  );

  /* ---- copy / paste / clear ---- */
  const cellVal = (r: number, c: number): string | number => {
    const o = flat()[r];
    if (!o) return '';
    return (o.row[NC()[c]] as string | number) ?? '';
  };
  const doCopy = useCallback(() => {
    const s = sel();
    const r0 = Math.min(s.ar, s.fr),
      r1 = Math.max(s.ar, s.fr),
      c0 = Math.min(s.ac, s.fc),
      c1 = Math.max(s.ac, s.fc);
    const g: string[][] = [];
    for (let r = r0; r <= r1; r++) {
      const rw: string[] = [];
      for (let c = c0; c <= c1; c++) rw.push(String(cellVal(r, c)));
      g.push(rw);
    }
    clipRef.current = g;
    if (navigator.clipboard) navigator.clipboard.writeText(g.map((r) => r.join('\t')).join('\n')).catch(() => {});
  }, []);
  const doPaste = useCallback(() => {
    const clip = clipRef.current;
    if (!clip) return;
    pushUndo();
    const s = sel();
    const r0 = Math.min(s.ar, s.fr),
      c0 = Math.min(s.ac, s.fc);
    clip.forEach((rw, dr) =>
      rw.forEach((val, dc) => {
        const o = flat()[r0 + dr];
        if (!o) return;
        const k = NC()[c0 + dc];
        if (!k) return;
        const t = colDef(cols(), k)?.type;
        o.row[k] = t === 'money' || t === 'number' ? parseFloat(String(val).replace(/[^0-9.\-]/g, '')) || 0 : val;
      }),
    );
    render();
  }, [pushUndo, render]);
  const doDelete = useCallback(() => {
    pushUndo();
    const s = sel();
    const r0 = Math.min(s.ar, s.fr),
      r1 = Math.max(s.ar, s.fr),
      c0 = Math.min(s.ac, s.fc),
      c1 = Math.max(s.ac, s.fc);
    for (let r = r0; r <= r1; r++) {
      const o = flat()[r];
      if (!o) continue;
      for (let c = c0; c <= c1; c++) {
        const k = NC()[c],
          t = colDef(cols(), k)?.type;
        o.row[k] = t === 'money' || t === 'number' ? 0 : t === 'status' ? 'budgeted' : t === 'check' ? false : '';
      }
    }
    render();
  }, [pushUndo, render]);

  /* ---- menus ---- */
  const closeMenu = useCallback(() => {
    menuRef.current = null;
    render();
  }, [render]);

  /* ---- slide-over (Phase 2) ---- */
  const openSlide = useCallback(
    (sIdx: number, rIdx: number) => {
      if (sIdx < 0 || rIdx < 0) return;
      slideRef.current = { si: sIdx, ri: rIdx };
      render();
      onOpenRow?.(sIdx, rIdx);
    },
    [render, onOpenRow],
  );
  const closeSlide = useCallback(() => {
    slideRef.current = null;
    render();
  }, [render]);
  // Menu opener for the slide — auto-closes on pick, but survives a nested
  // open (link picker: category → names) by only closing if THIS menu is
  // still the active one after the pick.
  const slideOpenMenu = useCallback(
    (config: MenuConfig) => {
      const wrapped: MenuConfig = {
        ...config,
        onPick: (v: string) => {
          config.onPick(v);
          if (menuRef.current === wrapped) {
            menuRef.current = null;
            render();
          }
        },
      };
      menuRef.current = wrapped;
      render();
    },
    [render],
  );
  const openStatusMenu = (anchorEl: HTMLElement, rowObj: { row: Row }, id: string) => {
    const a = (anchorEl.querySelector('.pill') ?? anchorEl).getBoundingClientRect();
    menuRef.current = {
      anchor: { left: a.left, bottom: a.bottom },
      options: colDef(cols(), id)?.options ?? STATUSES.slice(),
      current: String(rowObj.row[id]),
      onPick: (v) => {
        pushUndo();
        rowObj.row[id] = v;
        if (rowObj.row._uid) onEditRef.current?.(rowObj.row._uid as string, id, v);
        closeMenu();
      },
    };
    render();
  };
  const openDropMenu = (anchorEl: HTMLElement, rowObj: { row: Row }, id: string) => {
    const col = colDef(cols(), id);
    if (!col) return;
    const a = (anchorEl.querySelector('.ddpill') ?? anchorEl).getBoundingClientRect();
    if (id === 'daytype') {
      openDayTypeMenu(a, rowObj, col);
      return;
    }
    menuRef.current = {
      anchor: { left: a.left, bottom: a.bottom },
      options: col.options ?? [],
      current: String(rowObj.row[id]),
      optColors: col.optColors,
      onPick: (v) => {
        pushUndo();
        rowObj.row[id] = v;
        if (rowObj.row._uid) onEditRef.current?.(rowObj.row._uid as string, id, v);
        closeMenu();
      },
    };
    render();
  };
  const DT_DEFAULTS =['Show', 'Off', 'Travel', 'Rehearsal', 'Press / promo', 'Festival', 'Day off', 'Hold'];
  const openDayTypeMenu = (a: DOMRect, rowObj: { row: Row }, col: Column) => {
    menuRef.current = {
      anchor: { left: a.left, bottom: a.bottom },
      options: (col.options ?? []).map((t) => ({ value: t, deletable: !DT_DEFAULTS.includes(t) })),
      current: String(rowObj.row.daytype),
      optColors: col.optColors,
      onPick: (v) => {
        pushUndo();
        rowObj.row.daytype = v;
        closeMenu();
      },
      onDelete: (t) => {
        pushUndo();
        col.options = (col.options ?? []).filter((z) => z !== t);
        if (col.optColors) delete col.optColors[t];
        closeMenu();
      },
      footer: {
        label: '＋ Add day type',
        onClick: () => {
          menuRef.current = null;
          promptRef.current = {
            title: 'Add day type',
            placeholder: 'e.g. Rehearsal, Press, Festival',
            onSubmit: (name) => {
              if (!name) return;
              pushUndo();
              if (!col.options) col.options = [];
              if (!col.options.includes(name)) {
                col.options.push(name);
                if (!col.optColors) col.optColors = {};
                const used = Object.values(col.optColors);
                const avail = ACCENTS.filter((c) => !used.includes(c));
                const pool = avail.length ? avail : ACCENTS.slice();
                col.optColors[name] = pool[Math.floor((name.length * 7) % pool.length)];
              }
              rowObj.row.daytype = name;
              render();
            },
          };
          render();
        },
      },
    };
    render();
  };

  /* ---- column resize ---- */
  const onResizeMove = useCallback((e: PointerEvent) => {
    const rz = rzRef.current;
    if (!rz) return;
    const col = colDef(colsRef.current, rz.key);
    if (!col) return;
    widthsRef.current[rz.key] = Math.max(col.min, rz.w + (e.clientX - rz.x));
    rootRef.current?.style.setProperty('--cols', template(colsRef.current, widthsRef.current));
    overlayRef.current?.setGhost(e.clientX);
  }, []);
  const endResize = useCallback(() => {
    rzRef.current = null;
    overlayRef.current?.setGhost(null);
    rootRef.current?.querySelectorAll('.grip.drag').forEach((g) => g.classList.remove('drag'));
    document.removeEventListener('pointermove', onResizeMove);
    render();
  }, [onResizeMove, render]);
  const startResize = useCallback(
    (e: React.PointerEvent, key: string) => {
      e.stopPropagation();
      e.preventDefault();
      rzRef.current = { key, x: e.clientX, w: widthsRef.current[key] };
      (e.target as HTMLElement).classList.add('drag');
      overlayRef.current?.setGhost(e.clientX);
      document.addEventListener('pointermove', onResizeMove);
      document.addEventListener('pointerup', endResize, { once: true });
    },
    [onResizeMove, endResize],
  );

  /* ---- pointer reorder (section / row / column) + FLIP ---- */
  const moveReorder = useCallback((e: PointerEvent) => {
    const RE = reRef.current;
    if (!RE) return;
    if (!RE.started) {
      if (Math.abs(e.clientX - RE.sx) < 4 && Math.abs(e.clientY - RE.sy) < 4) return;
      RE.started = true;
      RE.dragEl?.classList.add('dragging');
    }
    const { items, axis } = RE;
    let to: number | null = null;
    let boundary: number | null = null;
    for (let i = 0; i < items.length; i++) {
      const r = items[i].getBoundingClientRect();
      const mid = axis === 'y' ? r.top + r.height / 2 : r.left + r.width / 2;
      const pos = axis === 'y' ? e.clientY : e.clientX;
      if (pos < mid) {
        to = RE.kind === 'col' ? Number(items[i].dataset.ci) : i;
        boundary = axis === 'y' ? r.top : r.left;
        break;
      }
    }
    if (to === null) {
      const last = items[items.length - 1].getBoundingClientRect();
      to = RE.kind === 'col' ? colsRef.current.length : RE.arr.length;
      boundary = axis === 'y' ? last.bottom : last.right;
    }
    RE.to = to;
    const ref = items[0].getBoundingClientRect();
    if (boundary !== null) {
      if (axis === 'y') {
        // horizontal line spanning the section width at the drop boundary.
        overlayRef.current?.setIns({ axis: 'y', left: ref.left, top: boundary - 1, width: ref.width, height: 3 });
      } else {
        // vertical line spanning the whole grid height at the drop boundary.
        const inner = rootRef.current?.querySelector('.gridinner')?.getBoundingClientRect();
        overlayRef.current?.setIns({
          axis: 'x',
          left: boundary - 1,
          top: inner ? inner.top : ref.top,
          width: 3,
          height: inner ? inner.height : ref.height,
        });
      }
    }
  }, []);
  const endReorder = useCallback(() => {
    const RE = reRef.current;
    if (!RE) return;
    const { arr, from, kind } = RE;
    let to = RE.to;
    const started = RE.started;
    RE.dragEl?.classList.remove('dragging');
    overlayRef.current?.setIns(null);
    document.removeEventListener('pointermove', moveReorder);
    reRef.current = null;
    if (!started) return;
    if (to !== from && to !== from + 1) {
      const doIt = () => {
        pushUndo();
        const m = arr.splice(from, 1)[0];
        if (from < to) to--;
        arr.splice(to, 0, m);
        if (kind !== 'col') selRef.current = { ar: 0, ac: 0, fr: 0, fc: 0 };
        render();
      };
      // FLIP — capture the moving elements' first rects, mutate, animate in
      // useLayoutEffect. The selector is KIND-SPECIFIC (A3): a section drag
      // must FLIP only the section cards (`> .section`), NOT also their child
      // rows (which would double-transform); a row drag FLIPs only rows.
      const sel =
        kind === 'col'
          ? '.gridhead .hc[data-colid]'
          : kind === 'section'
            ? '#gr-sections > .section[data-uid]'
            : '#gr-sections .row[data-uid]';
      const keyAttr = kind === 'col' ? 'colid' : 'uid';
      const first = new Map<string, DOMRect>();
      rootRef.current?.querySelectorAll(sel).forEach((el) => {
        const k = (el as HTMLElement).dataset[keyAttr];
        if (k) first.set(k, el.getBoundingClientRect());
      });
      flipRef.current = { sel, keyAttr, first };
      doIt();
    }
  }, [moveReorder, pushUndo, render]);
  const startReorder = useCallback(
    (e: React.PointerEvent, kind: ReorderKind, handleEl: HTMLElement) => {
      e.preventDefault();
      let arr: unknown[] = [];
      let items: HTMLElement[] = [];
      let axis: 'x' | 'y' = 'y';
      let from = 0;
      let si0: number | null = null;
      let dragEl: HTMLElement | null = null;
      const root = rootRef.current!;
      if (kind === 'section') {
        arr = dataRef.current;
        items = [...root.querySelectorAll('#gr-sections > .section')] as HTMLElement[];
        from = Number(handleEl.dataset.si);
        dragEl = items[from];
      } else if (kind === 'row') {
        const si = Number(handleEl.dataset.si);
        si0 = si;
        arr = dataRef.current[si].rows;
        items = [...root.querySelectorAll(`.row[data-si="${si}"]`)] as HTMLElement[];
        from = Number(handleEl.dataset.ri);
        dragEl = items.find((r) => Number(r.dataset.ri) === from) ?? null;
      } else {
        arr = colsRef.current;
        items = [...root.querySelectorAll('.gridhead .hc:not(.noreorder)')] as HTMLElement[];
        axis = 'x';
        from = Number(handleEl.dataset.ci);
        dragEl = handleEl;
      }
      reRef.current = { kind, arr, items, axis, from, si0, to: from, started: false, sx: e.clientX, sy: e.clientY, dragEl };
      document.addEventListener('pointermove', moveReorder);
      document.addEventListener('pointerup', endReorder, { once: true });
    },
    [moveReorder, endReorder],
  );

  // FLIP runner — after a section / row / column reorder commits.
  useLayoutEffect(() => {
    const flip = flipRef.current;
    if (!flip) return;
    flipRef.current = null;
    rootRef.current?.querySelectorAll(flip.sel).forEach((el) => {
      const node = el as HTMLElement;
      const key = node.dataset[flip.keyAttr];
      const f = key ? flip.first.get(key) : undefined;
      if (!f) return;
      const l = node.getBoundingClientRect();
      const dx = f.left - l.left,
        dy = f.top - l.top;
      if (dx || dy) {
        // A2 — kill the mount animation (gr-rise) for the FLIP: a running CSS
        // animation beats inline style on `transform`, so gr-rise would stomp
        // the FLIP and the row would snap. Restore it after the tween.
        node.style.animation = 'none';
        node.style.transition = 'none';
        node.style.transform = `translate(${dx}px,${dy}px)`;
        requestAnimationFrame(() => {
          node.style.transition = 'transform .2s var(--ease)';
          node.style.transform = '';
          const clear = () => {
            node.style.animation = '';
            node.style.transition = '';
            node.removeEventListener('transitionend', clear);
          };
          node.addEventListener('transitionend', clear);
        });
      }
    });
  });

  /* ---- keyboard ---- */
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const inField =
        document.activeElement && /^(input|select|textarea)$/i.test(document.activeElement.tagName);
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'z') {
        if (editRef.current) return;
        e.preventDefault();
        if (e.shiftKey) redo();
        else undo();
        return;
      }
      if (editRef.current) return;
      if (inField) return;
      if (menuRef.current || confirmRef.current || promptRef.current || warnRef.current) return;
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'c') {
        e.preventDefault();
        doCopy();
        return;
      }
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'v') {
        e.preventDefault();
        doPaste();
        return;
      }
      if (e.key === 'Backspace' || e.key === 'Delete') {
        e.preventDefault();
        doDelete();
        return;
      }
      switch (e.key) {
        case 'ArrowUp':
          e.preventDefault();
          move(-1, 0, e.shiftKey);
          break;
        case 'ArrowDown':
          e.preventDefault();
          move(1, 0, e.shiftKey);
          break;
        case 'ArrowLeft':
          e.preventDefault();
          move(0, -1, e.shiftKey);
          break;
        case 'ArrowRight':
          e.preventDefault();
          move(0, 1, e.shiftKey);
          break;
        case 'Enter': {
          e.preventDefault();
          const k = NC()[sel().fc];
          const t = colDef(cols(), k)?.type;
          const cellEl = rootRef.current?.querySelector('.cell.active') as HTMLElement | null;
          const o = getRowObj();
          if (t === 'status' && cellEl && o) openStatusMenu(cellEl, o, k);
          else if (t === 'dropdown' && cellEl && o) openDropMenu(cellEl, o, k);
          else if (t === 'check' && o) {
            pushUndo();
            o.row[k] = !o.row[k];
            if (o.row._uid) onEditRef.current?.(o.row._uid, k, o.row[k]);
            render();
          } else startEdit();
          break;
        }
        case 'Tab':
          e.preventDefault();
          move(0, e.shiftKey ? -1 : 1);
          break;
        default:
          if (e.key.length === 1 && !e.metaKey && !e.ctrlKey && !e.altKey) {
            const t = colDef(cols(), NC()[sel().fc])?.type;
            if (t === 'text' || t === 'money' || t === 'number') {
              e.preventDefault();
              startEdit(e.key);
            }
          }
      }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
    // refs everywhere → stable; the callbacks are memoised.
  }, [doCopy, doPaste, doDelete, move, redo, undo, startEdit, pushUndo, render]);

  /* ---- drag-select ---- */
  useEffect(() => {
    const onMove = (e: PointerEvent) => {
      if (!selDragRef.current) return;
      if (e.buttons === 0) {
        selDragRef.current = false;
        return;
      }
      const el = document.elementFromPoint(e.clientX, e.clientY);
      const td = el && (el as HTMLElement).closest && (el as HTMLElement).closest('.cell');
      if (td && (td as HTMLElement).dataset.r !== undefined) {
        const r = Number((td as HTMLElement).dataset.r),
          c = Number((td as HTMLElement).dataset.c);
        const s = sel();
        if (r !== s.fr || c !== s.fc) {
          s.fr = r;
          s.fc = c;
          render();
        }
      }
    };
    const onUp = () => {
      selDragRef.current = false;
    };
    document.addEventListener('pointermove', onMove);
    document.addEventListener('pointerup', onUp);
    return () => {
      document.removeEventListener('pointermove', onMove);
      document.removeEventListener('pointerup', onUp);
    };
  }, [render]);

  /* ---- cell pointer interaction ---- */
  const onCellPointerDown = (e: React.PointerEvent, r: number, c: number) => {
    const target = e.target as HTMLElement;
    if (target.classList.contains('openbtn') || target.classList.contains('chk')) return;
    e.preventDefault();
    if (editRef.current) commitEdit();
    const s = sel();
    if (e.shiftKey) {
      s.fr = r;
      s.fc = c;
    } else {
      selRef.current = { ar: r, ac: c, fr: r, fc: c };
      selDragRef.current = true;
    }
    render();
    if (!e.shiftKey) {
      const k = NC()[c];
      const t = colDef(cols(), k)?.type;
      const o = flat()[r];
      const cellEl = e.currentTarget as HTMLElement;
      if (o && t === 'status') openStatusMenu(cellEl, o, k);
      else if (o && t === 'dropdown') openDropMenu(cellEl, o, k);
    }
  };

  /* ---- toolbar / popovers ---- */
  const openPop = (which: 'filter' | 'cols' | 'addcol', e: React.MouseEvent) => {
    if (popRef.current === which) {
      popRef.current = null;
      render();
      return;
    }
    const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
    popAnchorRef.current = { left: r.left, bottom: r.bottom + 6 };
    popRef.current = which;
    render();
  };
  const closePop = useCallback(() => {
    popRef.current = null;
    render();
  }, [render]);

  const addSection = () => {
    pushUndo();
    const d = data();
    d.push({
      name: 'New section',
      kind: 'normal',
      accent: ACCENTS[d.length % ACCENTS.length],
      _uid: 's' + uidc.current++,
      rows: [{ item: '', vendor: '', est: 0, act: 0, status: 'budgeted', _uid: 'r' + uidc.current++ }],
    });
    render();
  };
  const addLine = (si: number) => {
    pushUndo();
    data()[si].rows.push({ item: '', vendor: '', est: 0, act: 0, status: 'budgeted', _uid: 'r' + uidc.current++ });
    render();
  };
  const resetWidths = () => {
    pushUndo();
    cols().forEach((c) => (widthsRef.current[c.id] = c.w));
    render();
  };
  const toggleGroup = () => {
    groupRef.current = groupRef.current === 'section' ? 'status' : 'section';
    selRef.current = { ar: 0, ac: 0, fr: 0, fc: 0 };
    render();
  };
  const setDensity = (d: Density) => {
    densityRef.current = d;
    render();
  };
  const removeCol = (id: string) => {
    pushUndo();
    colsRef.current = cols().filter((c) => c.id !== id);
    delete widthsRef.current[id];
    data().forEach((s) => s.rows.forEach((r) => delete r[id]));
    selRef.current = { ar: 0, ac: 0, fr: 0, fc: 0 };
    popRef.current = null;
    render();
  };

  /* ---- formula-row interactions ---- */
  const commitFx = (input: HTMLInputElement | null) => {
    const fx = fxEditRef.current;
    if (!fx || !input) {
      fxEditRef.current = null;
      return;
    }
    pushUndo();
    const row = data()[fx.si].rows[fx.ri];
    const val = parseFloat(input.value.replace(/[^0-9.\-]/g, '')) || 0;
    if (fx.field === 'pct') row.pct = val;
    else row.est = val;
    fxEditRef.current = null;
    render();
  };

  /* =========================================================
     RENDER
     ========================================================= */
  const colsTemplate = template(cols(), widths());
  const vis = visCols(cols());
  const nc = NC();
  const s = sel();

  // Selection visuals as INLINE styles (#1) — the orange active ring + the
  // range tint. Inline so no stylesheet cascade / specificity issue can
  // hide them; the .active/.selected classes stay for the radius/glow too.
  const selStyle = (active: boolean, selected: boolean): React.CSSProperties | undefined => {
    // SOLID colours only — no color-mix in box-shadow (several Chrome builds
    // drop the whole box-shadow when it contains color-mix, killing the
    // ring). Orange hex+alpha tints are the CLAUDE.md-sanctioned variant.
    if (active)
      return {
        // Two independent rings — box-shadow + outline — so the orange shows
        // even if one is dropped by the browser.
        boxShadow: 'inset 0 0 0 2px var(--lp-orange)',
        outline: '2px solid var(--lp-orange)',
        outlineOffset: '-2px',
        background: '#FF450021',
        borderRadius: 'var(--lp-radius-sm)',
        position: 'relative',
        zIndex: 1,
      };
    if (selected) return { background: '#FF450017' };
    return undefined;
  };

  // Money cell content via the injected FX (default = demo). Shows the SOURCE
  // figure in the row's currency; a foreign currency renders red + a ≈
  // converted tag/tooltip in the display currency (C1).
  const moneyContent = (row: Row, id: string) => {
    const cc = (row.cur as string) || fx.displayCurrency;
    const raw = Number(row[id]) || 0;
    if (cc !== fx.displayCurrency) {
      const conv = fx.formatDisplay(fx.toDisplay(raw, cc));
      return (
        <span className="fxconv" title={`≈ ${conv} in ${fx.displayCurrency}`}>
          {fx.symbol(cc)}
          {raw.toLocaleString('en-US')}
          <span className="fxtag">≈{conv}</span>
        </span>
      );
    }
    return fx.formatDisplay(raw);
  };

  const renderEditInput = () => (
    <input
      className="editing"
      defaultValue={editRef.current?.prefill ?? ''}
      autoFocus
      ref={(el) => {
        if (!el) return;
        const pf = editRef.current?.prefill;
        const o = flat()[editRef.current!.r];
        const key = NC()[editRef.current!.c];
        if (pf === undefined) {
          el.value = String(o?.row[key] ?? '');
          el.select();
        } else {
          // type-to-edit: cursor at end
          el.setSelectionRange(el.value.length, el.value.length);
        }
      }}
      onKeyDown={(e) => {
        e.stopPropagation();
        if (e.key === 'Enter') {
          e.preventDefault();
          commitEdit();
          move(1, 0);
        } else if (e.key === 'Tab') {
          e.preventDefault();
          commitEdit();
          move(0, e.shiftKey ? -1 : 1);
        } else if (e.key === 'Escape') {
          e.preventDefault();
          editRef.current = null;
          render();
        }
      }}
      onBlur={() => {
        if (editRef.current) commitEdit();
      }}
    />
  );

  /** one cell → JSX (mirrors dispCell). fi = flat row index. */
  const renderCell = (sec: Section, row: Row, ri: number, col: Column, fi: number, key: string) => {
    const id = col.id,
      t = col.type;
    const editingHere = editRef.current && t !== 'idx';
    const ci = nc.indexOf(id);
    const isActive = s.fr === fi && s.fc === ci;
    const showEdit = editingHere && isActive && editRef.current!.r === fi && editRef.current!.c === ci;

    // day-type blanking on Off/Travel income rows is an income concern; skip here.
    if (t === 'idx')
      return (
        <div
          key={key}
          className="c idx"
          data-si={sec._si}
          data-ri={ri}
          onPointerDown={(e) => {
            e.stopPropagation();
            startReorder(e, 'row', e.currentTarget);
          }}
        >
          {ri + 1}
          <span className="rd">⠿</span>
        </div>
      );
    if (t === 'receipts') {
      const n = (row.docs ? row.docs.length : 0) + (row.transactions ? row.transactions.filter((x) => x.receipt).length : 0);
      return (
        <div
          key={key}
          className={`c rcptcell${n ? ' has' : ''}`}
          onClick={(e) => {
            const names = [
              ...(row.docs ?? []).map((d) => `${d.type}: ${d.name}`),
              ...(row.transactions ?? []).filter((x) => x.receipt).map((x) => `Receipt: ${x.receipt}`),
            ];
            const a = e.currentTarget.getBoundingClientRect();
            menuRef.current = {
              anchor: { left: a.left, bottom: a.bottom },
              options: names.length ? [...names, 'Open line ↗'] : ['No receipts on this line', 'Open line ↗'],
              onPick: (v) => {
                if (v === 'Open line ↗') openSlide(sec._si!, ri);
                closeMenu();
              },
            };
            render();
          }}
        >
          📎{n ? ` ${n}` : ''}
        </div>
      );
    }
    if (t === 'calc')
      return (
        <div key={key} className="c num">
          {fmt(col.calc ? col.calc(row) : 0)}
        </div>
      );
    if (t === 'doc') {
      const n = (row.memos ?? []).length;
      return (
        <div
          key={key}
          className="c doccell"
          onClick={(e) => {
            if (!row.memos) row.memos = [];
            const memos = row.memos;
            const a = e.currentTarget.getBoundingClientRect();
            menuRef.current = {
              anchor: { left: a.left, bottom: a.bottom },
              options: [...memos.map((m) => `📄 ${m}`), '＋ Add memo'],
              onPick: (v) => {
                if (v === '＋ Add memo') {
                  pushUndo();
                  memos.push(`deal-memo-${memos.length + 1}.pdf`);
                }
                closeMenu();
              },
            };
            render();
          }}
        >
          {n ? <span className="rcpt has">📄 {n}</span> : <span className="rcpt none">＋ memo</span>}
        </div>
      );
    }
    if (t === 'variance') {
      const ev = isFormula(sec) ? formulaEst(row, data()) : Number(row.est) || 0;
      const v = variance(row, ev);
      if (!v) return <div key={key} className="c num" />;
      const over = v.d > 0;
      const a = over ? '▲' : '▼';
      return (
        <div key={key} className={`c num var ${over ? 'up' : 'down'}`}>
          <span className="arr">{a}</span>
          {v.pct > 0 ? '+' : ''}
          {v.pct.toFixed(1)}%
        </div>
      );
    }
    if (t === 'formula') {
      const av = Number(row[col.formula!.a]) || 0,
        bv = Number(row[col.formula!.b]) || 0;
      const r = col.formula!.op === '-' ? av - bv : col.formula!.op === '*' ? av * bv : av + bv;
      return (
        <div key={key} className="c num">
          {fmt(r)}
        </div>
      );
    }
    // formula SECTION rows
    if (isFormula(sec)) {
      if (id === 'item')
        return (
          <div key={key} className="c">
            {row.item}
            <span
              className="openbtn"
              onPointerDown={(e) => e.stopPropagation()}
              onClick={() => openSlide(sec._si ?? -1, ri)}
            >
              <span className="oarr">⤢</span>
              <span className="ow">Open</span>
            </span>
          </div>
        );
      if (id === 'vendor') {
        if (row.custom)
          return (
            <div key={key} className="c">
              <span
                className="pctchip custom"
                onClick={() => {
                  confirmRef.current = {
                    title: 'Restore percentage formula?',
                    body: 'This turns the line back into an active percentage calculation and removes the custom fixed value.',
                    onYes: () => {
                      pushUndo();
                      row.custom = false;
                      render();
                    },
                  };
                  render();
                }}
              >
                custom value
              </span>
            </div>
          );
        const pctEditing = fxEditRef.current?.si === sec._si && fxEditRef.current?.ri === ri && fxEditRef.current?.field === 'pct';
        return (
          <div key={key} className="c">
            {pctEditing ? (
              <input
                className="pctedit"
                defaultValue={row.pct ?? 0}
                autoFocus
                ref={(el) => el?.select()}
                onKeyDown={(e) => {
                  e.stopPropagation();
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    commitFx(e.currentTarget);
                  } else if (e.key === 'Escape') {
                    fxEditRef.current = null;
                    render();
                  }
                }}
                onBlur={(e) => commitFx(e.currentTarget)}
              />
            ) : (
              <span
                className="pctchip"
                onClick={() => {
                  fxEditRef.current = { si: sec._si!, ri, field: 'pct' };
                  render();
                }}
              >
                {row.pct}%
              </span>
            )}
            <span
              className="basis"
              onClick={() => {
                pushUndo();
                row.basis = row.basis === 'net' ? 'gross' : 'net';
                render();
              }}
            >
              of {row.basis === 'net' ? 'Net' : 'Gross'}
            </span>
          </div>
        );
      }
      if (id === 'est') {
        const fxEditing = fxEditRef.current?.si === sec._si && fxEditRef.current?.ri === ri && fxEditRef.current?.field === 'est';
        return (
          <div
            key={key}
            className="c num cell-fx"
            onClick={() => {
              if (fxEditing) return;
              if (!row.custom) {
                confirmRef.current = {
                  title: 'Switch to a fixed value?',
                  body: 'This removes the percentage calculation and stores a fixed amount. To switch back later, click the amber "custom value" chip.',
                  onYes: () => {
                    pushUndo();
                    row.custom = true;
                    row.est = Math.round(formulaEst(row, data()));
                    fxEditRef.current = { si: sec._si!, ri, field: 'est' };
                    render();
                  },
                };
                render();
              } else {
                fxEditRef.current = { si: sec._si!, ri, field: 'est' };
                render();
              }
            }}
          >
            {fxEditing ? (
              <input
                className="editing"
                style={{ textAlign: 'right' }}
                defaultValue={row.est ?? 0}
                autoFocus
                ref={(el) => el?.select()}
                onKeyDown={(e) => {
                  e.stopPropagation();
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    commitFx(e.currentTarget);
                  } else if (e.key === 'Escape') {
                    fxEditRef.current = null;
                    render();
                  }
                }}
                onBlur={(e) => commitFx(e.currentTarget)}
              />
            ) : (
              fmt(formulaEst(row, data()))
            )}
          </div>
        );
      }
      if (id === 'act')
        return (
          <div key={key} className="c num muted0">
            {fmt(row.act)}
          </div>
        );
      return <div key={key} className="c" />;
    }
    // Derived sections lock BOTH estimate AND actual — the source module
    // (Payroll/Rooming/…) owns them and the reconcile pass regenerates both
    // each load (GRID_SPEC §6, Phase 3 decision 2).
    if (sec.kind === 'derived' && (id === 'est' || id === 'act')) {
      const ci2 = nc.indexOf(id);
      const active2 = ci2 >= 0 && s.fr === fi && s.fc === ci2;
      const cls = active2 ? ' active' : ci2 >= 0 && inSel(s, fi, ci2) ? ' selected' : '';
      return (
        <div
          key={key}
          className={`c cell num cell-lock${cls}`}
          style={selStyle(active2, ci2 >= 0 && !active2 && inSel(s, fi, ci2))}
          data-r={fi}
          data-c={ci2}
          onPointerDown={(e) => onCellPointerDown(e, fi, ci2)}
        >
          {moneyContent(row, id)}
          <span className="lockmini">🔒</span>
        </div>
      );
    }
    // generic navigable cell
    const selected = !isActive && inSel(s, fi, ci);
    const cls = isActive ? ' active' : selected ? ' selected' : '';
    const mut = t === 'money' && !row[id] ? ' muted0' : '';
    const numCls = t === 'money' || t === 'number' ? ' num' : '';
    return (
      <div
        key={key}
        className={`c cell${numCls}${mut}${cls}`}
        style={selStyle(isActive, selected)}
        data-r={fi}
        data-c={ci}
        onPointerDown={(e) => onCellPointerDown(e, fi, ci)}
      >
        {showEdit ? renderEditInput() : cellInner(row, col, sec, ri)}
      </div>
    );
  };

  /** inner content for a non-edited navigable cell (mirrors cellInner). */
  const cellInner = (row: Row, col: Column, sec: Section, ri: number) => {
    const id = col.id,
      t = col.type;
    if (t === 'text') {
      // #8 — only show the leading icon while there's text; clearing the
      // item (edit to empty / ⌫) drops the emoji too instead of it sticking.
      const ic = id === 'item' && row.icon && String(row[id] ?? '').trim() ? <span className="ic">{row.icon}</span> : null;
      const op =
        id === 'item' ? (
          <span
            className="openbtn"
            onPointerDown={(e) => {
              e.stopPropagation();
            }}
            onClick={() => openSlide(sec._si ?? -1, ri)}
          >
            <span className="oarr">⤢</span>
            <span className="ow">Open</span>
          </span>
        ) : null;
      return (
        <>
          {ic}
          {String(row[id] ?? '')}
          {op}
        </>
      );
    }
    if (t === 'money') return moneyContent(row, id);
    if (t === 'number') return (row[id] ?? '') === '' ? '' : String(row[id]);
    if (t === 'check')
      return (
        <span
          className={`chk ${row[id] ? 'on' : ''}`}
          role="checkbox"
          aria-checked={Boolean(row[id])}
          onClick={(e) => {
            e.stopPropagation();
            pushUndo();
            row[col.id] = !row[col.id];
            render();
          }}
        >
          {row[id] ? '✓' : ''}
        </span>
      );
    if (t === 'dropdown') {
      const cc = col.optColors && col.optColors[String(row[id])];
      return (
        <span
          className="ddpill"
          style={cc ? { color: cc, borderColor: cc } : undefined}
        >
          {String(row[id] ?? '') || '—'}
        </span>
      );
    }
    if (t === 'status') return <span className={`pill ${row[id]}`}>{String(row[id] ?? '')}</span>;
    return null;
  };

  /* ---- sections ---- */
  const renderSections = () => {
    if (groupRef.current === 'status') {
      const out: React.ReactNode[] = [];
      let f = 0;
      STATUSES.forEach((st, si) => {
        const rows: { row: Row; ri: number }[] = [];
        data().forEach((sec) =>
          sec.rows.forEach((row, ri) => {
            if (!isFormula(sec) && row.status === st && rowMatches(row, queryRef.current, filterRef.current)) rows.push({ row, ri });
          }),
        );
        if (!rows.length) return;
        out.push(
          <div className="section" key={st}>
            <div className="sec-head" style={{ cursor: 'default' }}>
              <div className="sh-name">
                <span className="dot" style={{ color: ACCENTS[si % 5] }} />
                <span className="sh-title">{st}</span>
                <span className="sh-count">{rows.length}</span>
              </div>
            </div>
            {rows.map(({ row, ri }) => {
              const fi = f++;
              return (
                <div className="row" key={row._uid ?? `${st}-${ri}`}>
                  {vis.map((c) => renderCell({ kind: 'normal', _si: 0, name: '', rows: [] }, row, ri, c, fi, c.id))}
                </div>
              );
            })}
          </div>,
        );
      });
      return out;
    }

    const out: React.ReactNode[] = [];
    let f = 0;
    data().forEach((sec, si) => {
      sec._si = si;
      const visRows = sec.rows.map((row, ri) => ({ row, ri })).filter((o) => (isFormula(sec) ? true : rowMatches(o.row, queryRef.current, filterRef.current)));
      let est = 0,
        act = 0;
      sec.rows.forEach((r) => {
        est += disp(isFormula(sec) ? formulaEst(r, data()) : r.est, r.cur);
        act += disp(r.act, r.cur);
      });
      const sub = est || act ? `est ${fmt(est)} · act ${fmt(act)}` : '';
      const accent = sec.accent || ACCENTS[si % ACCENTS.length];
      out.push(
        <div className={`section ${sec.kind}`} data-si={si} data-uid={sec._uid} key={sec._uid}>
          <div
            className="sec-head"
            data-si={si}
            onPointerDown={(e) => {
              if ((e.target as HTMLElement).closest('.badge')) return;
              startReorder(e, 'section', e.currentTarget);
            }}
          >
            <div className="sh-name">
              <span className="grip-dots">⠿</span>
              <span className="dot" style={{ color: accent }} />
              <span
                className="sh-title"
                style={{ cursor: 'text' }}
                title="Double-click to rename"
                onPointerDown={(e) => e.stopPropagation()}
                onDoubleClick={(e) => {
                  e.stopPropagation();
                  promptRef.current = {
                    title: 'Rename section',
                    placeholder: sec.name,
                    defaultValue: sec.name,
                    onSubmit: (name) => {
                      if (!name) return;
                      pushUndo();
                      sec.name = name;
                      render();
                    },
                  };
                  render();
                }}
              >
                {sec.name}
              </span>
              <span className="sh-count">{visRows.length}</span>
              {sec.kind === 'derived' ? (
                <span className="badge src" onClick={(e) => e.stopPropagation()}>
                  🔗 {sec.source}
                </span>
              ) : sec.kind === 'formula' ? (
                <span className="badge fx">formula</span>
              ) : null}
            </div>
            <div className="sh-sub">
              {sub ? (
                <>
                  est <b>{fmt(est)}</b> · act <b>{fmt(act)}</b>
                </>
              ) : null}
            </div>
          </div>
          {visRows.map(({ row, ri }) => {
            const fi = isFormula(sec) ? -1 : f;
            const node = (
              <div className="row" data-si={si} data-ri={ri} data-uid={row._uid} key={row._uid ?? ri}>
                {vis.map((c) => renderCell(sec, row, ri, c, fi, c.id))}
              </div>
            );
            if (!isFormula(sec)) f++;
            return node;
          })}
          {sec.kind === 'normal' ? (
            <div className="addline">
              <button type="button" onClick={() => addLine(si)}>
                ＋ Add line
              </button>
            </div>
          ) : null}
        </div>,
      );
    });
    return out;
  };

  /* ---- counts ---- */
  let cEst = 0,
    cAct = 0;
  data().forEach((sec) =>
    sec.rows.forEach((r) => {
      cEst += disp(isFormula(sec) ? formulaEst(r, data()) : r.est, r.cur);
      cAct += disp(r.act, r.cur);
    }),
  );
  const numCols = cols().filter((c) => c.type === 'money' || c.type === 'number');

  return (
    <div className="lp-grid" data-density={densityRef.current} ref={rootRef} style={{ '--cols': colsTemplate } as React.CSSProperties}>
      {/* toolbar */}
      <div className="gr-toolbar">
        <div className="gr-search">
          🔍
          <input
            placeholder="Search items, vendors…"
            defaultValue={queryRef.current}
            onChange={(e) => {
              queryRef.current = e.target.value;
              render();
            }}
          />
        </div>
        <span className="chip" onClick={toggleGroup} role="button">
          <span className="muted">Group</span>
          <span className="accent">{groupRef.current === 'section' ? 'Section' : 'Status'}</span>
        </span>
        <span className="chip" onClick={addSection} role="button">
          ＋ Add section
        </span>
        <span className="chip" onClick={resetWidths} role="button">
          ⇄ Reset widths
        </span>
        <span className={`chip${popRef.current === 'filter' ? ' on' : ''}`} onClick={(e) => openPop('filter', e)} role="button">
          ⚲ Filter
        </span>
        <span className={`chip${popRef.current === 'cols' || popRef.current === 'addcol' ? ' on' : ''}`} onClick={(e) => openPop('cols', e)} role="button">
          ▦ Columns
        </span>
        <span className="gr-spacer" />
        <span className="gr-counts">
          <b>{flat().length} rows</b> · est <b>{fmt(cEst)}</b> · act <b>{fmt(cAct)}</b>
        </span>
        <div className="gr-density">
          {(['compact', 'comfortable', 'spacious'] as Density[]).map((d) => (
            <button
              key={d}
              type="button"
              title={d}
              className={densityRef.current === d ? 'active' : ''}
              onClick={() => setDensity(d)}
            >
              {d === 'compact' ? '≡' : d === 'comfortable' ? '▤' : '☰'}
            </button>
          ))}
        </div>
      </div>

      {/* grid */}
      <div className="gridwrap">
        <div className="gridinner">
          <div className="gridhead">
            {vis.map((c) => (
              <div
                key={c.id}
                className={`hc ${c.type === 'money' || c.type === 'number' || c.type === 'variance' ? 'num' : ''} ${c.id === 'idx' ? 'noreorder' : ''}`}
                data-ci={cols().indexOf(c)}
                data-colid={c.id}
                onPointerDown={(e) => {
                  if ((e.target as HTMLElement).classList.contains('grip')) return;
                  if (c.id === 'idx') return;
                  startReorder(e, 'col', e.currentTarget);
                }}
                onDoubleClick={(e) => {
                  e.stopPropagation();
                  if (c.id === 'idx') return;
                  promptRef.current = {
                    title: 'Rename column',
                    placeholder: c.label,
                    defaultValue: c.label,
                    onSubmit: (name) => {
                      pushUndo();
                      c.label = name || c.label;
                      render();
                    },
                  };
                  render();
                }}
              >
                {c.label}
                {c.resize ? <span className="grip" onPointerDown={(e) => startResize(e, c.id)} /> : null}
              </div>
            ))}
          </div>
          <div id="gr-sections">{renderSections()}</div>
        </div>
      </div>

      <div className="gr-help">
        <span>
          <kbd>↑↓←→</kbd> move · <kbd>Shift</kbd> extend · drag to select
        </span>
        <span>
          <kbd>⌘C/V</kbd> copy/paste · <kbd>⌫</kbd> clear · <kbd>⌘Z</kbd> undo
        </span>
        <span>
          type to edit · <kbd>Enter</kbd>/<kbd>Tab</kbd> commit
        </span>
        <span>
          drag <b>section</b> / <b>#</b> / <b>column header</b> to reorder
        </span>
      </div>

      {/* drag overlays — state-driven + portaled (#6), inline-styled so no
          cascade can hide them (matches the selection-ring fix). */}
      <DragOverlay ref={overlayRef} />

      {/* popovers */}
      {popRef.current === 'filter' ? <FilterPop anchor={popAnchorRef.current} filter={filterRef.current} onChange={() => render()} onClose={closePop} /> : null}
      {popRef.current === 'cols' ? (
        <ColumnsPop
          anchor={popAnchorRef.current}
          cols={cols()}
          onToggle={(id, hidden) => {
            pushUndo();
            const c = colDef(cols(), id);
            if (c) c.hidden = hidden;
            selRef.current = { ar: 0, ac: 0, fr: 0, fc: 0 };
            render();
          }}
          onDelete={(id) => {
            popRef.current = null; // close the Columns popover so the confirm isn't behind it (#3)
            confirmRef.current = {
              title: 'Delete this column?',
              body: 'This removes the column and its data from every row. This can be undone with ⌘Z.',
              confirmLabel: 'Delete',
              onYes: () => removeCol(id),
            };
            render();
          }}
          onAdd={() => {
            popRef.current = 'addcol';
            render();
          }}
          onClose={closePop}
        />
      ) : null}
      {popRef.current === 'addcol' ? (
        <AddColumnPop
          anchor={popAnchorRef.current}
          numCols={numCols}
          onCreate={(col) => {
            pushUndo();
            widthsRef.current[col.id] = col.w;
            colsRef.current.push(col);
            data().forEach((sec) =>
              sec.rows.forEach((r) => {
                if (col.type === 'check') r[col.id] = false;
                else if (col.type === 'dropdown') r[col.id] = col.options?.[0] ?? '';
                else if (col.type !== 'formula') r[col.id] = '';
              }),
            );
            popRef.current = null;
            render();
          }}
          onClose={closePop}
        />
      ) : null}

      {/* menus + modals */}
      {menuRef.current ? <GridMenu config={menuRef.current} onClose={closeMenu} /> : null}
      {confirmRef.current ? (
        <GridConfirm
          state={confirmRef.current}
          onClose={() => {
            confirmRef.current = null;
            render();
          }}
        />
      ) : null}
      {promptRef.current ? (
        <GridPrompt
          state={promptRef.current}
          onClose={() => {
            promptRef.current = null;
            render();
          }}
        />
      ) : null}
      {warnRef.current ? (
        <GridWarn
          state={warnRef.current}
          onClose={() => {
            warnRef.current = null;
            render();
          }}
        />
      ) : null}

      {/* Phase 2 — the slide-over, opened from openSlide() */}
      {slideRef.current ? (
        <GridSlideOver
          data={data()}
          si={slideRef.current.si}
          ri={slideRef.current.ri}
          version={tick}
          onClose={closeSlide}
          pushUndo={pushUndo}
          render={render}
          openMenu={slideOpenMenu}
          fx={fx}
          statuses={slideStatuses}
          forceLineVariant={slideLineVariant}
          onEdit={onEdit}
        />
      ) : null}
    </div>
  );
}

/* ============================================================
   Drag overlays — resize ghost + reorder insertion line (#6)
   ============================================================ */

const DRAG_GLOW = '0 0 12px color-mix(in srgb, var(--lp-orange) 22%, transparent)';

const DragOverlay = forwardRef<OverlayHandle>(function DragOverlay(_props, ref) {
  const [ghostX, setGhostX] = useState<number | null>(null);
  const [ins, setIns] = useState<{ axis: 'x' | 'y'; left: number; top: number; width: number; height: number } | null>(null);
  useImperativeHandle(ref, () => ({ setGhost: setGhostX, setIns }), []);
  if (ghostX === null && !ins) return null;
  return createPortal(
    <>
      {ghostX !== null ? (
        <div
          className="gr-drag-layer"
          style={{ top: 0, bottom: 0, left: ghostX, width: 2, background: 'var(--lp-orange)', boxShadow: DRAG_GLOW }}
        />
      ) : null}
      {ins ? (
        <div
          className="gr-drag-layer"
          style={{
            left: ins.left,
            top: ins.top,
            width: ins.width,
            height: ins.height,
            background: 'var(--lp-orange)',
            boxShadow: DRAG_GLOW,
            borderRadius: 'var(--lp-radius-xs)',
          }}
        />
      ) : null}
    </>,
    document.body,
  );
});

/* ============================================================
   Toolbar popovers (portaled, token-clean via .lp-grid-pop)
   ============================================================ */

function PopShell({
  anchor,
  onClose,
  children,
}: {
  anchor: { left: number; bottom: number };
  onClose: () => void;
  children: React.ReactNode;
}) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const onDown = (e: PointerEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    };
    const t = setTimeout(() => document.addEventListener('pointerdown', onDown), 0);
    return () => {
      clearTimeout(t);
      document.removeEventListener('pointerdown', onDown);
    };
  }, [onClose]);
  return createPortal(
    <div ref={ref} className="lp-grid-pop" style={{ left: anchor.left, top: anchor.bottom }}>
      {children}
    </div>,
    document.body,
  );
}

function FilterPop({
  anchor,
  filter,
  onChange,
  onClose,
}: {
  anchor: { left: number; bottom: number };
  filter: Set<string>;
  onChange: () => void;
  onClose: () => void;
}) {
  return (
    <PopShell anchor={anchor} onClose={onClose}>
      <div className="ttl">Show statuses</div>
      {STATUSES.map((st) => (
        <label key={st}>
          <input
            type="checkbox"
            defaultChecked={filter.has(st)}
            onChange={(e) => {
              if (e.target.checked) filter.add(st);
              else filter.delete(st);
              onChange();
            }}
          />{' '}
          {st}
        </label>
      ))}
    </PopShell>
  );
}

function ColumnsPop({
  anchor,
  cols,
  onToggle,
  onDelete,
  onAdd,
  onClose,
}: {
  anchor: { left: number; bottom: number };
  cols: Column[];
  onToggle: (id: string, hidden: boolean) => void;
  onDelete: (id: string) => void;
  onAdd: () => void;
  onClose: () => void;
}) {
  return (
    <PopShell anchor={anchor} onClose={onClose}>
      <div className="ttl">Columns</div>
      {cols
        .filter((c) => c.id !== 'idx' && c.id !== 'item')
        .map((c) => (
          <label key={c.id}>
            <input type="checkbox" defaultChecked={!c.hidden} onChange={(e) => onToggle(c.id, !e.target.checked)} /> {c.label}
            {c.custom ? (
              <span
                className="delcol"
                role="button"
                aria-label="Delete column"
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  onDelete(c.id);
                }}
              >
                ✕
              </span>
            ) : null}
          </label>
        ))}
      <div className="mi" onClick={onAdd}>
        ＋ Add custom column
      </div>
    </PopShell>
  );
}

function AddColumnPop({
  anchor,
  numCols,
  onCreate,
  onClose,
}: {
  anchor: { left: number; bottom: number };
  numCols: Column[];
  onCreate: (col: Column) => void;
  onClose: () => void;
}) {
  const nameRef = useRef<HTMLInputElement>(null);
  const optsRef = useRef<HTMLInputElement>(null);
  const aRef = useRef<HTMLSelectElement>(null);
  const opRef = useRef<HTMLSelectElement>(null);
  const bRef = useRef<HTMLSelectElement>(null);
  const [type, setType] = useState('text');
  const [fx, setFx] = useState(false);

  return (
    <PopShell anchor={anchor} onClose={onClose}>
      <div className="ttl">New column</div>
      <input ref={nameRef} type="text" placeholder="Column name" />
      <select value={type} onChange={(e) => setType(e.target.value)}>
        <option value="text">Text</option>
        <option value="number">Number</option>
        <option value="check">Checkbox</option>
        <option value="dropdown">Dropdown</option>
      </select>
      {type === 'number' ? (
        <div>
          <label>
            <input type="checkbox" checked={fx} onChange={(e) => setFx(e.target.checked)} /> Make it a formula
          </label>
          {fx ? (
            <div>
              <select ref={aRef}>
                {numCols.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.label}
                  </option>
                ))}
              </select>
              <select ref={opRef}>
                <option value="+">＋ add</option>
                <option value="-">− subtract</option>
                <option value="*">× multiply</option>
              </select>
              <select ref={bRef}>
                {numCols.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.label}
                  </option>
                ))}
              </select>
            </div>
          ) : null}
        </div>
      ) : type === 'dropdown' ? (
        <input ref={optsRef} type="text" placeholder="Options, comma separated" />
      ) : null}
      <button
        className="go"
        type="button"
        style={{ background: 'var(--lp-orange)', color: 'var(--lp-text-inverse)', border: 0, width: '100%', marginTop: 6, padding: 8, borderRadius: 'var(--lp-radius-lg)', cursor: 'pointer', fontWeight: 650 }}
        onClick={() => {
          const name = nameRef.current?.value.trim() || 'Column';
          const t = type;
          const id = 'c' + Date.now().toString(36);
          const col: Column = { id, label: name, w: 140, min: 90, resize: true, custom: true, type: 'text' };
          if (t === 'number' && fx) {
            col.type = 'formula';
            col.formula = {
              a: aRef.current?.value ?? numCols[0]?.id ?? '',
              op: (opRef.current?.value as '+' | '-' | '*') ?? '+',
              b: bRef.current?.value ?? numCols[0]?.id ?? '',
            };
          } else if (t === 'dropdown') {
            col.type = 'dropdown';
            col.options = (optsRef.current?.value || 'Option A,Option B')
              .split(',')
              .map((sx) => sx.trim())
              .filter(Boolean);
            col.optColors = {};
            col.options.forEach((o, i) => (col.optColors![o] = ACCENTS[i % ACCENTS.length]));
          } else {
            col.type = t as Column['type'];
          }
          onCreate(col);
        }}
      >
        Add column
      </button>
    </PopShell>
  );
}

