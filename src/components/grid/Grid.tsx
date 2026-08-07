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
import { cloneElement, forwardRef, useCallback, useEffect, useImperativeHandle, useLayoutEffect, useMemo, useReducer, useRef, useState, type CSSProperties } from 'react';
import { createPortal } from 'react-dom';
import type { Column, Density, GridFx, GridLineApi, GridStatusConfig, GroupBy, Row, Section, Sel, Snapshot } from './types';
import { colourForDayType, labelForDayType } from '@/lib/routing/dayType';
import { Lock, Search, Trash2, Filter } from 'lucide-react';
import {
  ACCENTS,
  STATUSES,
  cloneData,
  colDef,
  demoFx,
  flatRows,
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
import { evaluateFormula } from '@/lib/grid/formula';
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
  /** M1-A — the text column that hosts the per-row provenance chips
   *  (Auto / Manual / FX-lock). Default 'item' (Budget Expenses); Income passes
   *  'venue' (its label column). Chips only render when a row carries
   *  `_provenance` / `_fxLocked`, so /grid-demo (which sets neither) is untouched. */
  chipCol?: string;
  /** Phase 2 wires the slide-over here; Phase 1 leaves it undefined. */
  onOpenRow?: (si: number, ri: number) => void;
  /** Persistence hook — fires after a cell commit / status / dropdown / check
      edit, with the row's _uid (= DB id on real surfaces). Phase 3. May return a
      Promise; the fill-handle (#2) reverts the optimistic value if it rejects.
      Returning void (the default) keeps the existing fire-and-forget behaviour. */
  onEdit?: (rowUid: string, field: string, value: unknown) => void | Promise<unknown>;
  /** Currency/FX injection (default: demo static table). */
  fx?: GridFx;
  /** Status set for the slide's status menu (default: canonical 4). */
  slideStatuses?: GridStatusConfig;
  /** Force the slide's LINE variant (budget Expenses — no person/hotel/
      settlement variants). */
  slideLineVariant?: boolean;
  /** Structural CRUD hooks. When provided, the grid delegates instead of
      mutating local state (real surfaces persist + re-fetch). Phase 3. */
  onAddLine?: (sectionUid: string) => void;
  onAddSection?: () => void;
  onRenameSection?: (sectionUid: string, name: string) => void;
  onDeleteRow?: (rowUid: string) => void;
  /** Reorder persistence — fired after a drag commits with the NEW full order
      of uids (= DB ids on real surfaces). Caller PATCHes sort_order. Phase 3. */
  onReorderRow?: (sectionUid: string, orderedRowUids: string[]) => void;
  onReorderSection?: (orderedSectionUids: string[]) => void;
  /** Async transactions/documents CRUD for the slide + 📎 cell. Absent on the
      demo (in-memory). Phase 3 Steps 3–5. */
  lineApi?: GridLineApi;
  /** Fixed flat structure when false: hides the per-section "＋ Add line"
      button + the toolbar's Group-by + "＋ Add section" chips. Default true
      (Expenses / demo / every existing consumer unchanged). Income — rows are
      routing-anchored, no sections/statuses — passes false. */
  allowAddRows?: boolean;
  /** VIS-BG-06 — additionally render a PROMINENT "＋ Add line" chip in the top
   *  toolbar (the per-section ghost button always stays). Opt-in: only Budget
   *  Expenses passes it, so income (allowAddRows:false) + /grid-demo (omits it)
   *  stay byte-identical. Adds the line to the last normal section. */
  toolbarAddLine?: boolean;
  /* ---- WIDE MODE (additive, opt-in — budget never sets these) ---------- */
  /** Wide (people × many-day matrix) mode: sets data-wide (frozen-column CSS),
      and dropdown cells fill the whole cell with the optColor tint instead of a
      pill. Default false → budget/demo/income unchanged. */
  wide?: boolean;
  /** Number of leading columns to freeze (sticky-left) under `wide`. Matrices
      pass 1 (the person column). Default 0. */
  frozenCols?: number;
  /** Custom header content per column id (e.g. the matrix's date·city·day-type
      pill). Falls back to the column label. Additive. */
  headerFor?: (colId: string) => React.ReactNode;
  /** Optional footer row (rendered on the same --cols grid) — one cell per
      column id (e.g. rooming rooms-per-night). Additive — only when passed.
      Grid-v2: receives the Grid's LIVE flat rows as a 2nd arg so the footer can
      reflect in-grid edits without a parent re-render (existing callers ignore
      it → unchanged). */
  columnFooter?: (colId: string, liveRows?: Row[]) => React.ReactNode;
  /* ---- GRID-V2 INTERACTION (additive, opt-in — default off) ------------- */
  /** Excel fill-handle: a drag target on the active cell's bottom-right that
      fills the dragged range with the source value (persists via onEdit).
      Default off → no handle rendered, existing drag-select untouched. (#2) */
  fillHandle?: boolean;
  /** Dropdown/status cells: require the cell to be ALREADY active before a click
      opens the menu (1st click selects, 2nd opens). Default off → single-click
      opens (unchanged). (#3) */
  clickTwiceToOpen?: boolean;
  /** Revamp #3 — editable money cells render as a PLAIN number (no currency
      symbol); the symbol is reserved for locked / computed (ro) cells so an
      editable field reads as editable. Opt-in per grid (Budget · Income) so
      other money grids (Expenses) keep the symbol on every cell. */
  plainEditableMoney?: boolean;
  /** After Tab lands on a dropdown/status cell, auto-open its menu (fast matrix
      entry). Default off → Tab just moves (unchanged). (#4) */
  tabOpensMenu?: boolean;
  /** Versioning B2 — when the active budget version is approved/locked, the
      PROPOSED (`est`) cells render read-only (mirrors the derived-lock); actuals
      stay editable. An edit attempt fires onLockedEdit. Default off. */
  versionLocked?: boolean;
  /** Which column ids the version-lock applies to. Default `['est']` (Expenses).
      Income passes its proposed-column ids for the PROJECTED view and `[]` for the
      Actual view, so actuals never lock and a locked proposed edit fires the modal
      on BOTH grids. Editing one of these (when versionLocked) → onLockedEdit. */
  versionLockedCols?: string[];
  /** Raised when the user tries to edit a version-locked proposed cell (→ the
      Unlock-or-New-Version modal lives in the host). */
  onLockedEdit?: () => void;
  /** Income UX — leading columns to render as a recessed, look-don't-touch
      REFERENCE block (routing date/venue/city, drawn from elsewhere). Adds a
      `ref-col` class + a divider after the last. Additive, opt-in — default
      undefined → every other consumer unchanged. */
  referenceCols?: string[];
  /** Receipts B1.5 — opt-in file-drop onto a row. When set, a FILE (image/PDF)
      dragged over a row highlights it; on drop the host gets (rowUid, file).
      Default undefined → no behaviour change (Payroll/Rooming/Income/Channel-List
      unaffected). Uses HTML5 drag-drop (dataTransfer.files) — entirely separate
      from the pointer-based row reorder, which is untouched. */
  onFileDropToRow?: (rowUid: string, file: File) => void;
  /** Income polish R2 (A3) — opt-in per-tour column hide/show persistence. When
      set, the Columns popover's hidden/shown choices persist to
      `localStorage[columnPrefsKey]` (a list of hidden column ids) and restore on
      mount. The `idx` + `referenceCols` columns are never hideable. Default
      undefined → no persistence (every other grid unchanged). */
  columnPrefsKey?: string;
  /** #28 — per-cell manual override of a COMPUTED (read-only) output cell.
      Opt-in. For a column listed in `cols`: when `isOverridden(uid,col)` is true
      the cell ignores its column `ro` (becomes editable) and shows a distinct ✎
      marker; right-clicking an override-capable output opens a menu — "Override
      formula" (→ warn → editable) or "Revert to formula" (→ host recomputes).
      Mirrors the per-cell `isVersionLocked` seam. Default undefined → no
      behaviour change (every other grid + non-output cell unchanged). */
  cellOverride?: {
    cols: string[];
    isOverridden: (rowUid: string, colId: string) => boolean;
    onSet: (rowUid: string, colId: string) => void;
    onClear: (rowUid: string, colId: string) => void;
    /** confirm body shown before enabling an override. */
    warnBody?: string;
    /** tooltip on the edit input + ✎ marker (e.g. "Pre-withholding value"). */
    inputHint?: string;
  };
  /** Stage-3 parity — the Group-by cycle. Default `['section','status']` (income
   *  + /grid-demo unchanged: toggle still flips section↔status). Budget passes
   *  `['section','status','phase']` to add phase grouping (rows carry `phase`).
   *  Opt-in: absent → byte-identical behaviour for every existing consumer. */
  groupModes?: GroupBy[];
}

/** Imperative handle (opt-in via ref). Lets a host patch specific cells by row
 *  `_uid` WITHOUT a remount — so engine-materialised values (Income's projected
 *  overage/merch/VIP) surface in place, with no cursor jump / full-grid flash. */
export interface GridHandle {
  updateRowCells: (uid: string, patch: Record<string, unknown>) => void;
}

type ReorderKind = 'section' | 'row' | 'col';

/** The full set of statuses for the status FILTER — the status column's
 *  configured options UNION every status actually present in the data. The
 *  union guard means a row whose status isn't in the canonical set is never
 *  silently filtered out (the income/draft-rows-invisible bug class). */
function statusUniverse(columns: Column[], sections: Section[]): string[] {
  const set = new Set<string>();
  const statusCol = columns.find((c) => c.type === 'status');
  (statusCol?.options ?? STATUSES.slice()).forEach((sName) => set.add(sName));
  sections.forEach((sec) => sec.rows.forEach((r) => { if (r.status) set.add(String(r.status)); }));
  return [...set];
}

export const Grid = forwardRef<GridHandle, GridProps>(function Grid({
  initialData,
  initialColumns,
  onOpenRow,
  onEdit,
  fx: fxProp,
  slideStatuses,
  slideLineVariant,
  onAddLine,
  onAddSection,
  onRenameSection,
  onDeleteRow,
  onReorderRow,
  onReorderSection,
  lineApi,
  allowAddRows = true,
  toolbarAddLine = false,
  wide = false,
  frozenCols = 0,
  headerFor,
  columnFooter,
  fillHandle = false,
  clickTwiceToOpen = false,
  tabOpensMenu = false,
  plainEditableMoney = false,
  chipCol = 'item',
  versionLocked = false,
  versionLockedCols,
  onLockedEdit,
  referenceCols,
  onFileDropToRow,
  columnPrefsKey,
  cellOverride,
  groupModes,
}: GridProps, ref) {
  // Stage-3 parity — opt-in Group-by cycle. Absent → section↔status (unchanged).
  const groupModesRef = useRef<GroupBy[]>(
    groupModes && groupModes.length > 0 ? groupModes : ['section', 'status'],
  );
  groupModesRef.current =
    groupModes && groupModes.length > 0 ? groupModes : ['section', 'status'];
  const onLockedEditRef = useRef(onLockedEdit);
  onLockedEditRef.current = onLockedEdit;
  // #28 — live ref so the keydown/right-click handlers read the latest override
  // config without re-subscribing. `pendingOverrideRef` is a synchronous bridge:
  // the moment the user confirms an override we want the cell editable, before
  // the host's optimistic state round-trips back through props.
  const cellOverrideRef = useRef(cellOverride);
  cellOverrideRef.current = cellOverride;
  const pendingOverrideRef = useRef<Set<string>>(new Set());
  const fx = fxProp ?? demoFx;
  // Totals / section-header / KPI maths must use the SAME injected FX + display
  // currency as the cells — not gridModel's USD-pivot `disp`/`fmt`. (BUD-40.)
  const dispC = (v: unknown, cur?: unknown) =>
    fx.toDisplay(Number(v) || 0, ((cur as string) || fx.displayCurrency).toUpperCase());
  const fmtC = (n: number | undefined | null) => fx.formatDisplay(Number(n) || 0);
  const onEditRef = useRef(onEdit);
  onEditRef.current = onEdit;
  const onReorderRowRef = useRef(onReorderRow);
  onReorderRowRef.current = onReorderRow;
  const onReorderSectionRef = useRef(onReorderSection);
  onReorderSectionRef.current = onReorderSection;
  const [tick, force] = useReducer((x: number) => x + 1, 0);
  const render = useCallback(() => force(), []);
  /** Grid-v2 #2 — true while a fill-handle drag is in progress (drives the
      circle cursor + the pulsing range-preview CSS via data-filling). */
  const [filling, setFilling] = useState(false);

  /* ---- source of truth (refs) ---- */
  const uidc = useRef(0);
  const dataRef = useRef<Section[]>([]);

  // Income UX — imperative cell patch by _uid (no remount → no cursor jump).
  useImperativeHandle(
    ref,
    () => ({
      updateRowCells(uid: string, patch: Record<string, unknown>) {
        for (const sec of dataRef.current) {
          const row = sec.rows.find((r) => r._uid === uid);
          if (row) {
            Object.assign(row, patch);
            render();
            return;
          }
        }
      },
    }),
    [render],
  );

  // Versioning — which columns the lock applies to (default Expenses' `est`).
  const versionLockedColSet = useMemo(() => new Set(versionLockedCols ?? ['est']), [versionLockedCols]);
  const isVersionLocked = (key: string) => versionLocked && versionLockedColSet.has(key);

  // #28 — per-cell override seam. `isOverrideCol` = the column supports override
  // at all; `isCellOverridden` = THIS row's output is currently overridden (host
  // truth ∪ the synchronous pending bridge) → editable + ✎-marked.
  const isOverrideCol = (key: string) => !!cellOverrideRef.current?.cols.includes(key);
  const isCellOverridden = (uid: string | undefined, key: string): boolean => {
    if (!uid || !isOverrideCol(key)) return false;
    if (pendingOverrideRef.current.has(`${uid}:${key}`)) return true;
    return !!cellOverrideRef.current?.isOverridden(uid, key);
  };

  // Receipts B1.5 — which row a FILE is being dragged over (for the highlight).
  // A ref + render() (not state) so it never causes a stale-closure re-render
  // race with the grid's own reducer. Inert unless onFileDropToRow is set.
  const fileDragUidRef = useRef<string | null>(null);
  const hasFileDrag = (e: React.DragEvent) => Array.from(e.dataTransfer.types || []).includes('Files');
  /** HTML5 file-drop handlers for a row (separate from pointer-based reorder).
   *  Returns {} when the prop is off, so non-budget grids are untouched. */
  const fileDropProps = (uid?: string): React.HTMLAttributes<HTMLDivElement> => {
    if (!onFileDropToRow || !uid) return {};
    return {
      onDragOver: (e) => {
        if (!hasFileDrag(e)) return; // ignore text / row-reorder drags
        e.preventDefault();
        if (fileDragUidRef.current !== uid) { fileDragUidRef.current = uid; render(); }
      },
      onDragLeave: () => {
        if (fileDragUidRef.current === uid) { fileDragUidRef.current = null; render(); }
      },
      onDrop: (e) => {
        if (!hasFileDrag(e)) return;
        e.preventDefault();
        fileDragUidRef.current = null;
        render();
        const f = e.dataTransfer.files?.[0];
        if (f) onFileDropToRow(uid, f);
      },
    };
  };

  // Income UX — recessed reference block (routing strip). Stable from the prop.
  const refColSet = useMemo(() => new Set(referenceCols ?? []), [referenceCols]);
  const refColEndId = referenceCols && referenceCols.length ? referenceCols[referenceCols.length - 1] : null;
  /** Clone-merge the `ref-col` class onto a reference column's cell. */
  const wrapCell = (cell: React.ReactElement, colId: string): React.ReactElement => {
    if (!refColSet.has(colId)) return cell;
    const el = cell as React.ReactElement<{ className?: string }>;
    const base = el.props.className ?? '';
    return cloneElement(el, { className: `${base} ref-col${colId === refColEndId ? ' ref-col-end' : ''}` });
  };

  const colsRef = useRef<Column[]>([]);
  const widthsRef = useRef<Record<string, number>>({});
  const calcFns = useRef<Record<string, (row: Row) => number>>({});
  const selRef = useRef<Sel>({ ar: 0, ac: 0, fr: 0, fc: 0 });
  const densityRef = useRef<Density>('comfortable');
  const groupRef = useRef<GroupBy>('section');
  const queryRef = useRef('');
  // Seed the status filter with the SURFACE's full status set (all checked),
  // not the canonical 4 — otherwise budget `draft` rows (and any DB status not
  // in the demo set) get silently filtered to zero rows. BUD-38 blocker fix.
  const filterRef = useRef<Set<string>>(new Set(statusUniverse(initialColumns, initialData)));

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
  /** Grid-v2 #2 — active fill-handle drag (source cell). null when not filling. */
  const fillDragRef = useRef<{ fromR: number; fromC: number } | null>(null);
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
    if (t === 'money' || t === 'number') {
      // Grid-v2 #1 — formula input: `=1+1` commits 2. Safe arithmetic only (no
      // eval). Only a leading `=` triggers it, so every plain numeric edit is
      // byte-identical to before. D1 — retain the `=…` string on a sidecar
      // `<key>__f` field so re-opening the cell shows the formula (in-session;
      // not persisted — onEdit still fires the numeric result).
      const raw = String(v).trim();
      if (raw.startsWith('=')) {
        const result = evaluateFormula(raw.slice(1));
        if (result !== null) {
          v = result;
          if (o) o.row[`${key}__f`] = raw;
        } else {
          v = parseFloat(raw.replace(/[^0-9.\-]/g, '')) || 0;
          if (o) delete o.row[`${key}__f`];
        }
      } else {
        v = parseFloat(raw.replace(/[^0-9.\-]/g, '')) || 0;
        if (o) delete o.row[`${key}__f`];
      }
    }
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
      const cdef = colDef(cols(), key);
      const t = cdef?.type;
      // #28 — a computed (ro) output stays read-only UNLESS this cell is overridden,
      // in which case it's hand-editable (the value lives in the same column).
      const ovUid = getRowObj()?.row?._uid as string | undefined;
      if (cdef?.ro && !isCellOverridden(ovUid, key)) return;
      // Versioning (B2) — proposed (est) is read-only on an approved version;
      // an edit attempt raises the Unlock-or-New-Version modal (host-owned).
      if (isVersionLocked(key)) {
        onLockedEditRef.current?.();
        return;
      }
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
        const v: string | number =
          t === 'money' || t === 'number' ? parseFloat(String(val).replace(/[^0-9.\-]/g, '')) || 0 : val;
        o.row[k] = v;
        // Bug 2 (paste stale): commit through the SAME path a normal edit uses
        // (see commitEdit) so the paste persists + the parent (hook / PATCH /
        // POST) learns of it and footers/totals update — not just the in-memory
        // dataRef. Without this, a re-seed reverts the cell to its old value.
        if (o.row._uid) onEditRef.current?.(o.row._uid, k, v);
      }),
    );
    render();
  }, [pushUndo, render]);
  const doDelete = useCallback(() => {
    const s = sel();
    const r0 = Math.min(s.ar, s.fr),
      r1 = Math.max(s.ar, s.fr),
      c0 = Math.min(s.ac, s.fc),
      c1 = Math.max(s.ac, s.fc);
    // Read-only cells are immutable to Backspace/Delete too — mirror the
    // type-edit (startEdit :430) and paste (:1002) guards: column `ro` (incl
    // the `referenceCols` reference block), the version-locked proposed (`est`)
    // cell, and the derived (Payroll/Rooming) est/act source-lock. Defer
    // pushUndo until the first real clear so an all-read-only selection is a
    // genuine no-op (no empty undo entry, no needless render).
    let wrote = false;
    for (let r = r0; r <= r1; r++) {
      const o = flat()[r];
      if (!o) continue;
      const tsec = data()[o.si];
      for (let c = c0; c <= c1; c++) {
        const k = NC()[c];
        const cd = colDef(cols(), k);
        if (!k || cd?.ro) continue;
        if (isVersionLocked(k)) continue;
        if (tsec?.kind === 'derived' && (k === 'est' || k === 'act')) continue;
        if (!wrote) {
          pushUndo();
          wrote = true;
        }
        const t = cd?.type;
        o.row[k] = t === 'money' || t === 'number' ? 0 : t === 'status' ? 'budgeted' : t === 'check' ? false : '';
      }
    }
    if (wrote) render();
  }, [pushUndo, render, versionLocked]);

  /* ---- menus ---- */
  const closeMenu = useCallback(() => {
    menuRef.current = null;
    render();
  }, [render]);

  // #28 — right-click an override-capable output → set/clear the manual override.
  // "Override formula" warns (consequence is the P&L stops tracking the formula),
  // then enables + opens the editor; "Revert to formula" clears the flag so the
  // host recomputes. A version-locked cell can't be overridden → fires the modal.
  const openOverrideMenu = (
    anchorEl: HTMLElement,
    row: Row,
    id: string,
    fi: number,
    ci: number,
    overridden: boolean,
  ) => {
    const co = cellOverrideRef.current;
    const uid = row._uid as string | undefined;
    if (!co || !uid) return;
    if (isVersionLocked(id)) {
      onLockedEditRef.current?.();
      return;
    }
    const a = anchorEl.getBoundingClientRect();
    menuRef.current = {
      anchor: { left: a.left, bottom: a.bottom },
      options: overridden
        ? [{ value: '__revert__', label: 'Revert to formula' }]
        : [{ value: '__override__', label: 'Override formula' }],
      onPick: (v) => {
        closeMenu();
        if (v === '__override__') {
          confirmRef.current = {
            title: 'Override the formula?',
            body:
              co.warnBody ??
              'This output will stop tracking the formula — the P&L will use the number you type. You can revert to the formula later.',
            confirmLabel: 'Override',
            onYes: () => {
              // Bridge: mark overridden synchronously so startEdit sees an
              // editable cell before the host's optimistic state round-trips.
              pendingOverrideRef.current.add(`${uid}:${id}`);
              co.onSet(uid, id);
              selRef.current = { ar: fi, ac: ci, fr: fi, fc: ci };
              render();
              startEdit();
            },
          };
          render();
        } else if (v === '__revert__') {
          pendingOverrideRef.current.delete(`${uid}:${id}`);
          co.onClear(uid, id);
          render();
        }
      },
    };
    render();
  };

  /* ---- slide-over (Phase 2) ---- */
  const openSlide = useCallback(
    (sIdx: number, rIdx: number) => {
      if (sIdx < 0 || rIdx < 0) return;
      // Income-lean (2026-08-07): a caller-provided onOpenRow REPLACES the
      // generic GridSlideOver — the caller owns the row surface (e.g. the
      // income deal slide-over). No consumer passes onOpenRow AND wants the
      // generic slide; grep before changing this contract.
      if (onOpenRow) {
        onOpenRow(sIdx, rIdx);
        return;
      }
      slideRef.current = { si: sIdx, ri: rIdx };
      render();
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
    const { arr, from, kind, si0 } = RE;
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
        // Persist the new order (BUD-42). Column reorder is display-only.
        if (kind === 'section') {
          const ids = (arr as Section[]).map((s) => s._uid).filter(Boolean) as string[];
          if (ids.length) onReorderSectionRef.current?.(ids);
        } else if (kind === 'row' && si0 != null) {
          const sec = dataRef.current[si0];
          const ids = (arr as Row[]).map((r) => r._uid).filter(Boolean) as string[];
          if (sec?._uid && ids.length) onReorderRowRef.current?.(sec._uid, ids);
        }
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

  /* ---- A3: per-tour column hide/show persistence (opt-in via columnPrefsKey) ----
     idx + the reference block are structural and never hideable. We restore the
     persisted hidden set AFTER mount (in an effect) so the server render and the
     first client render agree — applying it during render would risk a hydration
     mismatch. */
  const isHideLocked = useCallback(
    (id: string) => id === 'idx' || refColSet.has(id),
    [refColSet],
  );
  useEffect(() => {
    if (!columnPrefsKey || typeof window === 'undefined') return;
    let hiddenIds: Set<string>;
    try {
      const raw = window.localStorage.getItem(columnPrefsKey);
      if (!raw) return;
      hiddenIds = new Set(JSON.parse(raw) as string[]);
    } catch {
      return; // malformed prefs — ignore, default = all shown
    }
    let changed = false;
    for (const c of colsRef.current) {
      const next = hiddenIds.has(c.id) && !isHideLocked(c.id);
      if (!!c.hidden !== next) {
        c.hidden = next;
        changed = true;
      }
    }
    if (changed) render();
  }, [columnPrefsKey, isHideLocked, render]);

  /* ---- keyboard ---- */
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      // Bug 1 (Tab +2): hard-suppress the document handler for any key that
      // ORIGINATED in the grid's editing input. The input owns its own Tab/Enter
      // (commitEdit + one move). React flushes that commit SYNCHRONOUSLY before
      // the native event bubbles here, so by now editRef is null, the input is
      // detached (activeElement = body → inField false), and a `.cell` ancestor
      // lookup fails. We therefore test the event TARGET's OWN tag+class, which
      // survives detachment — no ancestor walk. Without this, Tab moves twice.
      const tgt = e.target as HTMLElement | null;
      if (tgt && tgt.tagName === 'INPUT' && (tgt as HTMLInputElement).classList?.contains('editing')) return;
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
          // Grid-v2 #4 — after Tab lands, auto-open the dropdown/status menu
          // (fast matrix entry). Opt-in (tabOpensMenu); rAF so the post-move
          // render has painted the new .cell.active to anchor the menu. The
          // shipped editing-input Tab guard at the top of onKey is untouched.
          if (tabOpensMenu) {
            requestAnimationFrame(() => {
              const k = NC()[sel().fc];
              const ty = colDef(cols(), k)?.type;
              const o = flat()[sel().fr];
              const cellEl = rootRef.current?.querySelector('.cell.active') as HTMLElement | null;
              if (o && cellEl && ty === 'status') openStatusMenu(cellEl, o, k);
              else if (o && cellEl && ty === 'dropdown') openDropMenu(cellEl, o, k);
            });
          }
          break;
        default:
          if (e.key.length === 1 && !e.metaKey && !e.ctrlKey && !e.altKey) {
            const k = NC()[sel().fc];
            const cd = colDef(cols(), k);
            const t = cd?.type;
            if (t === 'text' || t === 'money' || t === 'number') {
              e.preventDefault();
              startEdit(e.key);
            } else if (t === 'dropdown' && k !== 'daytype' && cd?.options?.length && !cd.ro) {
              // A1 — type-to-select: with a dropdown cell active, typing a letter
              // jumps to + commits the first option whose (display) label starts
              // with it (V→VS, P→PLUS, D→… currency). Same commit path as the menu;
              // doesn't touch click-open, Tab-auto-open, or Esc. A version-locked
              // proposed dropdown fires the lock modal instead (parity with edits).
              const opt = cd.options.find((op) => (cd.optLabels?.[op] ?? op).toLowerCase().startsWith(e.key.toLowerCase()));
              if (opt !== undefined) {
                e.preventDefault();
                if (isVersionLocked(k)) {
                  onLockedEditRef.current?.();
                } else {
                  const o = getRowObj();
                  if (o?.row && opt !== String(o.row[k])) {
                    pushUndo();
                    o.row[k] = opt;
                    if (o.row._uid) onEditRef.current?.(o.row._uid as string, k, opt);
                    render();
                  }
                }
              }
            }
          }
      }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
    // refs everywhere → stable; the callbacks are memoised.
  }, [doCopy, doPaste, doDelete, move, redo, undo, startEdit, pushUndo, render]);

  /* ---- drag-select + fill-handle (#2) ---- */
  useEffect(() => {
    const onMove = (e: PointerEvent) => {
      // Both gestures extend the selection focus to the hovered cell; the
      // difference is what pointerup does (fill writes the source value).
      if (!selDragRef.current && !fillDragRef.current) return;
      if (e.buttons === 0) {
        selDragRef.current = false;
        if (fillDragRef.current) {
          fillDragRef.current = null;
          setFilling(false);
        }
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
      if (fillDragRef.current) {
        // #2 — write the SOURCE cell's value across the previewed range, through
        // the same commit path as a normal edit (persists via onEdit). Skips the
        // source itself + read-only cells.
        const fd = fillDragRef.current;
        fillDragRef.current = null;
        setFilling(false);
        const s = sel();
        const r0 = Math.min(s.ar, s.fr),
          r1 = Math.max(s.ar, s.fr),
          c0 = Math.min(s.ac, s.fc),
          c1 = Math.max(s.ac, s.fc);
        const srcKey = NC()[fd.fromC];
        const srcObj = flat()[fd.fromR];
        if (srcObj && srcKey) {
          const srcVal = srcObj.row[srcKey];
          const srcFormula = srcObj.row[`${srcKey}__f`];
          let wrote = false;
          for (let r = r0; r <= r1; r++) {
            for (let c = c0; c <= c1; c++) {
              if (r === fd.fromR && c === fd.fromC) continue;
              const k = NC()[c];
              const cd = colDef(cols(), k);
              if (!k || cd?.ro) continue;
              const o = flat()[r];
              if (!o) continue;
              // GV2-02 fix — mirror the normal-edit derived lock (renderCell
              // :1460): NEVER write est/act of a derived (Payroll/Rooming-
              // reconciled) section. Those 🔒 cells are source-owned + the server
              // rejects them ("Could not save"). data()[o.si] is the row's section.
              const tsec = data()[o.si];
              if (tsec?.kind === 'derived' && (k === 'est' || k === 'act')) continue;
              if (!wrote) {
                pushUndo();
                wrote = true;
              }
              const targetRow = o.row;
              const prevVal = targetRow[k];
              const prevFormula = targetRow[`${k}__f`];
              targetRow[k] = srcVal;
              if (srcFormula !== undefined) targetRow[`${k}__f`] = srcFormula;
              else delete targetRow[`${k}__f`];
              if (targetRow._uid) {
                const ret = onEditRef.current?.(targetRow._uid, k, srcVal);
                // Revert-on-failure: if onEdit returns a rejecting promise, roll
                // this cell's optimistic value back immediately (not on reload).
                if (ret && typeof (ret as Promise<unknown>).then === 'function') {
                  void (ret as Promise<unknown>).then(undefined, () => {
                    targetRow[k] = prevVal;
                    if (prevFormula !== undefined) targetRow[`${k}__f`] = prevFormula;
                    else delete targetRow[`${k}__f`];
                    render();
                  });
                }
              }
            }
          }
          if (wrote) render();
        }
        return;
      }
      selDragRef.current = false;
    };
    document.addEventListener('pointermove', onMove);
    document.addEventListener('pointerup', onUp);
    return () => {
      document.removeEventListener('pointermove', onMove);
      document.removeEventListener('pointerup', onUp);
    };
  }, [render, pushUndo]);

  /* ---- cell pointer interaction ---- */
  const onCellPointerDown = (e: React.PointerEvent, r: number, c: number) => {
    const target = e.target as HTMLElement;
    // Grid-v2 #2 — the fill-handle is a distinct hit target; grabbing it must
    // NOT start a selection / drag-select.
    if (target.classList.contains('openbtn') || target.classList.contains('chk') || target.classList.contains('fillhandle')) return;
    e.preventDefault();
    if (editRef.current) commitEdit();
    // Grid-v2 #3 — capture whether this cell was ALREADY the active cell BEFORE
    // we move the selection (so click-twice-to-open can require a 2nd click).
    const prev = sel();
    const wasActive = !e.shiftKey && prev.fr === r && prev.fc === c;
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
      // #3 — default: a single click opens the dropdown immediately (unchanged).
      // When clickTwiceToOpen is on, the cell must already be active.
      const shouldOpen = clickTwiceToOpen ? wasActive : true;
      if (shouldOpen) {
        const k = NC()[c];
        const t = colDef(cols(), k)?.type;
        const o = flat()[r];
        const cellEl = e.currentTarget as HTMLElement;
        if (o && t === 'status') openStatusMenu(cellEl, o, k);
        else if (o && t === 'dropdown') openDropMenu(cellEl, o, k);
      }
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
    // Real surfaces persist + re-fetch (the new row needs a DB id before it's
    // editable); the demo mutates locally.
    if (onAddSection) {
      onAddSection();
      return;
    }
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
    if (onAddLine) {
      const uid = data()[si]?._uid;
      if (uid) onAddLine(uid);
      return;
    }
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
    // Cycle through the (opt-in) group modes. Default ['section','status'] →
    // identical section↔status flip for income + demo.
    const modes = groupModesRef.current;
    const i = modes.indexOf(groupRef.current);
    groupRef.current = modes[(i + 1) % modes.length] ?? modes[0];
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

  // MTX-06 — second frozen column (wide matrices with frozenCols >= 2). The
  // sticky-left offset for the 2nd column is the width of the 1st frozen column
  // (which is fixed-width in those matrices, so this is stable). budget/income
  // never set `wide`, so this is inert there.
  const frozen2 = wide && frozenCols >= 2 && vis.length >= 2;
  const frozen2Left = frozen2 ? Number(widths()[vis[0].id] ?? vis[0].w) || 0 : 0;

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
  const moneyContent = (row: Row, id: string, plain = false) => {
    // A money cell whose value is EXPLICITLY null/undefined renders "—" (blank),
    // distinct from a real 0 ("£0"). Used by Income's computed outputs to show
    // "not yet computable" without a misleading literal 0. Existing callers pass
    // numbers (never null), so their cells are unaffected.
    if (row[id] === null || row[id] === undefined) return '—';
    const cc = (row.cur as string) || fx.displayCurrency;
    const raw = Number(row[id]) || 0;
    if (cc !== fx.displayCurrency) {
      const conv = fx.formatDisplay(fx.toDisplay(raw, cc));
      // #3 (plain) — editable cells drop the leading currency symbol so the
      // value reads as a plain, typeable number; the ≈ display-currency tag
      // stays for cross-currency context.
      return (
        <span className="fxconv" title={`≈ ${conv} in ${fx.displayCurrency}`}>
          {plain ? null : fx.symbol(cc)}
          {raw.toLocaleString('en-US')}
          <span className="fxtag">≈{conv}</span>
        </span>
      );
    }
    // #3 — plain editable money: number only, no symbol (the symbol is reserved
    // for locked / computed cells so an editable field looks editable).
    if (plain) return raw.toLocaleString('en-US');
    return fx.formatDisplay(raw);
  };

  const renderEditInput = () => {
    // A2 — number-entry affordance: money/number edit inputs are right-aligned +
    // get the decimal soft-keyboard (inputMode). The input is type="text" (no
    // native spinner arrows — they'd break the grid's keyboard model) and already
    // select-all-on-focus (el.select() below), so typing replaces. Pure
    // presentation — commit/parse, the fill-handle, and copy-paste are untouched.
    const editKey = NC()[editRef.current!.c];
    const numericEdit = ((t) => t === 'money' || t === 'number')(colDef(cols(), editKey)?.type);
    // #28 — editing an overridden output: surface the value's meaning (pre-WH).
    const overrideHint = isOverrideCol(editKey) ? cellOverrideRef.current?.inputHint : undefined;
    return (
    <input
      className="editing"
      title={overrideHint}
      inputMode={numericEdit ? 'decimal' : undefined}
      style={numericEdit ? { textAlign: 'right' } : undefined}
      defaultValue={editRef.current?.prefill ?? ''}
      autoFocus
      ref={(el) => {
        if (!el) return;
        const pf = editRef.current?.prefill;
        const o = flat()[editRef.current!.r];
        const key = NC()[editRef.current!.c];
        if (pf === undefined) {
          // Grid-v2 #1 (D1) — re-edit shows the retained `=…` formula if the
          // cell was committed from one; else the stored value.
          el.value = String(o?.row[`${key}__f`] ?? o?.row[key] ?? '');
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
  };

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
      // Step 5 — real surfaces (lineApi) count documents + transactions from the
      // server-supplied counts (docCount/txnCount), falling back to the loaded
      // arrays once the slide has fetched them. Demo counts docs + receipt-txns.
      const n = lineApi
        ? (row.docs?.length ?? row.docCount ?? 0) + (row.transactions?.length ?? row.txnCount ?? 0)
        : (row.docs ? row.docs.length : 0) + (row.transactions ? row.transactions.filter((x) => x.receipt).length : 0);
      const openToaster = (a: { left: number; bottom: number }) => {
        const docNames = (row.docs ?? []).map((d) => `${d.type}: ${d.name}`);
        const txnNames = lineApi
          ? (row.transactions ?? []).map((x) => `Txn: ${x.desc || '—'}${x.receipt ? ' 📎' : ''}`)
          : (row.transactions ?? []).filter((x) => x.receipt).map((x) => `Receipt: ${x.receipt}`);
        const names = [...docNames, ...txnNames];
        menuRef.current = {
          anchor: a,
          options: names.length ? [...names, 'Open line ↗'] : ['No receipts or documents', 'Open line ↗'],
          onPick: (v) => {
            if (v === 'Open line ↗') openSlide(sec._si!, ri);
            closeMenu();
          },
        };
        render();
      };
      return (
        <div
          key={key}
          className={`c rcptcell${n ? ' has' : ''}`}
          onClick={(e) => {
            const r = e.currentTarget.getBoundingClientRect();
            const a = { left: r.left, bottom: r.bottom };
            // Lazy-load the real lists on first open so the toaster shows names.
            if (lineApi && row._uid && (row.transactions === undefined || row.docs === undefined)) {
              const lineId = String(row._uid);
              void Promise.all([lineApi.listTransactions(lineId), lineApi.listDocuments(lineId)])
                .then(([txns, docs]) => {
                  row.transactions = txns;
                  row.docs = docs;
                  openToaster(a);
                })
                .catch(() => openToaster(a));
            } else {
              openToaster(a);
            }
          }}
        >
          📎{n ? ` ${n}` : ''}
        </div>
      );
    }
    if (t === 'calc')
      return (
        <div key={key} className="c num">
          {fmtC(col.calc ? col.calc(row) : 0)}
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
    if (t === 'daytype') {
      // Stage-3 parity — read-only day-type pill + 3px tick (hue desaturated
      // ~50% toward the panel per §2). Value rides on row[col.id]. Only reached
      // when a column declares type:'daytype' (budget only).
      const dt = String(row[id] ?? '').trim();
      if (!dt) return <div key={key} className="c" />;
      const hue = colourForDayType(dt);
      return (
        <div key={key} className="c">
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, minWidth: 0 }}>
            <span
              aria-hidden
              style={{ width: 3, height: 14, borderRadius: 1, flexShrink: 0, background: `color-mix(in srgb, ${hue} 55%, var(--lp-panel))` }}
            />
            <span className="truncate" style={{ fontSize: 'var(--lp-text-2xs)', color: 'var(--lp-text-secondary)' }}>
              {labelForDayType(dt) || dt}
            </span>
          </span>
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
          {fmtC(r)}
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
              fmtC(formulaEst(row, data()))
            )}
          </div>
        );
      }
      if (id === 'act')
        return (
          <div key={key} className="c num muted0">
            {fmtC(row.act)}
          </div>
        );
      return <div key={key} className="c" />;
    }
    // Derived sections lock BOTH estimate AND actual — the source module
    // (Payroll/Rooming/…) owns them. Versioning (B2): an approved version locks
    // the PROPOSED (est) cell across ALL sections (actuals stay editable) — a
    // click raises the Unlock-or-New-Version modal. (GRID_SPEC §6.)
    const versionLockedEst = isVersionLocked(id);
    if ((sec.kind === 'derived' && (id === 'est' || id === 'act')) || versionLockedEst) {
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
          onClick={versionLockedEst ? () => onLockedEditRef.current?.() : undefined}
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
    // Wide mode (matrices): fill the whole cell with the optColor tint. The
    // selection style (active/selected) takes precedence (spread last).
    const wideTint = wide && t === 'dropdown' ? col.optColors?.[String(row[id])] : null;
    // #28 — right-click an override-capable output to set/clear the override;
    // an overridden cell wears a distinct ✎ marker (NOT the header ƒ).
    const overridable = isOverrideCol(id);
    const overridden = overridable && isCellOverridden(row._uid as string | undefined, id);
    return (
      <div
        key={key}
        className={`c cell${numCls}${mut}${cls}${overridden ? ' cell-override' : ''}`}
        style={{
          ...(wideTint ? { background: `color-mix(in srgb, ${wideTint} 20%, transparent)` } : null),
          ...selStyle(isActive, selected),
        }}
        data-r={fi}
        data-c={ci}
        onPointerDown={(e) => onCellPointerDown(e, fi, ci)}
        onContextMenu={
          overridable
            ? (e) => {
                e.preventDefault();
                openOverrideMenu(e.currentTarget, row, id, fi, ci, !!overridden);
              }
            : undefined
        }
      >
        {showEdit ? renderEditInput() : cellInner(row, col, sec, ri)}
        {overridden && !showEdit ? (
          <span
            className="cell-override-mark"
            aria-hidden
            title={cellOverrideRef.current?.inputHint ?? 'Manual override (right-click to revert)'}
            style={{ position: 'absolute', top: 1, left: 3, fontSize: 9, lineHeight: 1, color: 'var(--lp-violet)', fontWeight: 700, pointerEvents: 'none' }}
          >
            ✎
          </span>
        ) : null}
        {/* Grid-v2 #2 — fill-handle on the active cell's bottom-right (opt-in).
            Its own pointerdown starts the fill drag; the cell handler ignores
            `.fillhandle` so it doesn't start a selection. */}
        {fillHandle && isActive && !showEdit ? (
          <span
            className="fillhandle"
            onPointerDown={(e) => {
              e.stopPropagation();
              e.preventDefault();
              fillDragRef.current = { fromR: fi, fromC: ci };
              setFilling(true);
            }}
          />
        ) : null}
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
      // M1-A — per-row provenance chips (Auto / Manual / FX-lock), neutral (10px
      // caps, NOT orange — orange is act/selected). Rendered on the chip-anchor
      // column (chipCol; 'item' for Expenses, 'venue' for Income). Gated on
      // row._provenance / row._fxLocked, which ONLY the budget/income adapters
      // set → /grid-demo rows (neither) stay untouched. `Auto` keeps the lock
      // glyph (derived lines still lock their cells via derivedLockPolicy).
      const CHIP_BASE: CSSProperties = {
        display: 'inline-flex',
        alignItems: 'center',
        gap: 3,
        padding: '1px 6px',
        borderRadius: 999,
        fontSize: 10,
        letterSpacing: '0.04em',
        textTransform: 'uppercase',
        fontWeight: 600,
        whiteSpace: 'nowrap',
        verticalAlign: 'middle',
        border: '1px solid var(--lp-border-subtle)',
      };
      const autoSource =
        (row._provenanceSource as string | undefined) ??
        (row._derivedSource as string | undefined) ??
        sec.source ??
        'its source';
      const provenanceChips =
        id === chipCol && (row._provenance || row._fxLocked) ? (
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, marginLeft: 6, verticalAlign: 'middle' }}>
            {row._provenance === 'auto' ? (
              <span
                title={`Synced from ${autoSource}`}
                style={{ ...CHIP_BASE, color: 'var(--lp-text-tertiary)', background: 'var(--lp-bg-deep)' }}
              >
                <Lock size={9} aria-hidden /> Auto
              </span>
            ) : row._provenance === 'manual' ? (
              <span
                title="Hand-entered"
                style={{ ...CHIP_BASE, color: 'var(--lp-text-tertiary)', background: 'transparent' }}
              >
                Manual
              </span>
            ) : null}
            {row._fxLocked ? (
              <span
                title="FX rate locked at settlement"
                style={{ ...CHIP_BASE, color: 'var(--lp-text-tertiary)', background: 'var(--lp-bg-deep)' }}
              >
                <Lock size={9} aria-hidden /> FX
              </span>
            ) : null}
          </span>
        ) : null;
      return (
        <>
          {ic}
          {String(row[id] ?? '')}
          {provenanceChips}
          {op}
        </>
      );
    }
    // #3 — editable money reads as a plain number; ro/computed money keeps the
    // symbol. Scoped by the plainEditableMoney opt-in (Budget · Income only).
    if (t === 'money') return moneyContent(row, id, plainEditableMoney && !col.ro);
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
      const raw = String(row[id] ?? '');
      const cc = col.optColors && col.optColors[raw];
      const val = col.optLabels?.[raw] ?? (raw || '—');
      // Wide mode (matrices): the tint fills the whole CELL (applied to the
      // wrapper in renderCell) — here we just render the centred value. Budget
      // keeps the pill (border/text colour). Gated → budget unchanged.
      if (wide) return <span className="ddcell">{val}</span>;
      return (
        <span className="ddpill" style={cc ? { color: cc, borderColor: cc } : undefined}>
          {val}
        </span>
      );
    }
    if (t === 'status') return <span className={`pill ${row[id]}`}>{String(row[id] ?? '')}</span>;
    return null;
  };

  /* ---- sections ---- */
  const renderSections = () => {
    if (groupRef.current === 'phase') {
      // Stage-3 parity — group rows by their `phase` (budget phase_tag). Only
      // reachable when the consumer opted phase into `groupModes` (budget).
      const PHASE_ORDER = ['pre_prod', 'rehearsals', 'show_days', 'wrap'];
      const PHASE_LABEL: Record<string, string> = {
        pre_prod: 'Pre-production',
        rehearsals: 'Rehearsals',
        show_days: 'Show days',
        wrap: 'Wrap',
      };
      const present = new Set<string>();
      let anyUntagged = false;
      data().forEach((sec) =>
        sec.rows.forEach((row) => {
          if (isFormula(sec)) return;
          const p = String(row.phase ?? '').trim();
          if (p) present.add(p);
          else anyUntagged = true;
        }),
      );
      const ordered = [
        ...PHASE_ORDER.filter((p) => present.has(p)),
        ...[...present].filter((p) => !PHASE_ORDER.includes(p)),
      ];
      const universe = anyUntagged ? [...ordered, '__untagged__'] : ordered;
      const out: React.ReactNode[] = [];
      let f = 0;
      universe.forEach((ph, si) => {
        const rows: { row: Row; ri: number }[] = [];
        data().forEach((sec) =>
          sec.rows.forEach((row, ri) => {
            if (isFormula(sec)) return;
            const p = String(row.phase ?? '').trim();
            const inBucket = ph === '__untagged__' ? !p : p === ph;
            if (inBucket && rowMatches(row, queryRef.current, filterRef.current)) rows.push({ row, ri });
          }),
        );
        if (!rows.length) return;
        const title = ph === '__untagged__' ? 'Untagged' : PHASE_LABEL[ph] ?? ph;
        out.push(
          <div className="section" key={ph}>
            <div className="sec-head" style={{ cursor: 'default' }}>
              <div className="sh-name">
                <span className="dot" style={{ color: ACCENTS[si % 5] }} />
                <span className="sh-title">{title}</span>
                <span className="sh-count">{rows.length}</span>
              </div>
            </div>
            {rows.map(({ row, ri }) => {
              const fi = f++;
              return (
                <div
                  className={`row${fileDragUidRef.current === row._uid ? ' file-drop-target' : ''}`}
                  key={row._uid ?? `${ph}-${ri}`}
                  {...fileDropProps(row._uid ? String(row._uid) : undefined)}
                >
                  {vis.map((c) => wrapCell(renderCell({ kind: 'normal', _si: 0, name: '', rows: [] }, row, ri, c, fi, c.id), c.id))}
                </div>
              );
            })}
          </div>,
        );
      });
      return out;
    }
    if (groupRef.current === 'status') {
      const out: React.ReactNode[] = [];
      let f = 0;
      statusUniverse(cols(), data()).forEach((st, si) => {
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
                <div
                  className={`row${fileDragUidRef.current === row._uid ? ' file-drop-target' : ''}`}
                  key={row._uid ?? `${st}-${ri}`}
                  {...fileDropProps(row._uid ? String(row._uid) : undefined)}
                >
                  {vis.map((c) => wrapCell(renderCell({ kind: 'normal', _si: 0, name: '', rows: [] }, row, ri, c, fi, c.id), c.id))}
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
        est += dispC(isFormula(sec) ? formulaEst(r, data()) : r.est, r.cur);
        act += dispC(r.act, r.cur);
      });
      const sub = est || act ? `est ${fmtC(est)} · act ${fmtC(act)}` : '';
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
                      // rename is a simple PATCH — persist without a re-fetch.
                      if (sec._uid) onRenameSection?.(sec._uid, name);
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
                  est <b>{fmtC(est)}</b> · act <b>{fmtC(act)}</b>
                </>
              ) : null}
            </div>
          </div>
          {visRows.map(({ row, ri }) => {
            const fi = isFormula(sec) ? -1 : f;
            const node = (
              <div
                className={`row${row._rowClass ? ` ${String(row._rowClass)}` : ''}${fileDragUidRef.current === row._uid ? ' file-drop-target' : ''}`}
                data-si={si} data-ri={ri} data-uid={row._uid} key={row._uid ?? ri}
                {...fileDropProps(row._uid ? String(row._uid) : undefined)}
              >
                {vis.map((c) => wrapCell(renderCell(sec, row, ri, c, fi, c.id), c.id))}
              </div>
            );
            if (!isFormula(sec)) f++;
            return node;
          })}
          {sec.kind === 'normal' && allowAddRows ? (
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
      cEst += dispC(isFormula(sec) ? formulaEst(r, data()) : r.est, r.cur);
      cAct += dispC(r.act, r.cur);
    }),
  );
  const numCols = cols().filter((c) => c.type === 'money' || c.type === 'number');

  return (
    <div
      className="lp-grid"
      data-density={densityRef.current}
      data-wide={wide && frozenCols > 0 ? '' : undefined}
      data-frozen2={frozen2 ? '' : undefined}
      data-filling={filling ? '' : undefined}
      ref={rootRef}
      style={{ '--cols': colsTemplate, '--frz2-left': `${frozen2Left}px` } as React.CSSProperties}
    >
      {/* toolbar */}
      <div className="gr-toolbar">
        <div className="gr-search">
          <Search size={14} aria-hidden style={{ flexShrink: 0, opacity: 0.6 }} />
          <input
            placeholder="Search items, vendors…"
            defaultValue={queryRef.current}
            onChange={(e) => {
              queryRef.current = e.target.value;
              render();
            }}
          />
        </div>
        {allowAddRows ? (
          <>
            <span className="chip" onClick={toggleGroup} role="button">
              <span className="muted">Group</span>
              <span className="accent">{groupRef.current === 'section' ? 'Section' : groupRef.current === 'phase' ? 'Phase' : 'Status'}</span>
            </span>
            <span className="chip" onClick={addSection} role="button">
              ＋ Add section
            </span>
            {/* VIS-BG-06 — prominent toolbar add-line (opt-in; budget only).
                Targets the last normal section; the per-section ghost stays. */}
            {toolbarAddLine ? (
              <span
                className="chip accent"
                role="button"
                onClick={() => {
                  const d = data();
                  let si = -1;
                  for (let i = 0; i < d.length; i++) if (d[i].kind === 'normal') si = i;
                  if (si >= 0) addLine(si);
                }}
                style={{ borderColor: 'var(--lp-orange)', color: 'var(--lp-orange)', fontWeight: 600 }}
              >
                ＋ Add line
              </span>
            ) : null}
          </>
        ) : null}
        <span className="chip" onClick={resetWidths} role="button">
          ⇄ Reset widths
        </span>
        {onDeleteRow ? (
          <span
            className="chip"
            role="button"
            title="Delete the active line"
            onClick={() => {
              const o = flat()[sel().fr];
              if (o?.row._uid) onDeleteRow(o.row._uid);
            }}
          >
            <Trash2 size={13} aria-hidden style={{ display: 'inline', verticalAlign: '-2px', marginRight: 4 }} />
            Delete line
          </span>
        ) : null}
        {statusUniverse(cols(), data()).length > 0 ? (
          <span className={`chip${popRef.current === 'filter' ? ' on' : ''}`} onClick={(e) => openPop('filter', e)} role="button">
            <Filter size={12} aria-hidden style={{ display: 'inline', verticalAlign: '-1px', marginRight: 4 }} />
            Filter
          </span>
        ) : null}
        <span className={`chip${popRef.current === 'cols' || popRef.current === 'addcol' ? ' on' : ''}`} onClick={(e) => openPop('cols', e)} role="button">
          ▦ Columns
        </span>
        <span className="gr-spacer" />
        <span className="gr-counts">
          <b>{flat().length} rows</b> · est <b>{fmtC(cEst)}</b> · act <b>{fmtC(cAct)}</b>
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
                className={`hc ${c.type === 'money' || c.type === 'number' || c.type === 'variance' ? 'num' : ''} ${c.id === 'idx' ? 'noreorder' : ''}${refColSet.has(c.id) ? ' ref-col' : ''}${c.id === refColEndId ? ' ref-col-end' : ''}`}
                data-ci={cols().indexOf(c)}
                data-colid={c.id}
                onPointerDown={(e) => {
                  if ((e.target as HTMLElement).classList.contains('grip')) return;
                  if (wide || c.id === 'idx') return; // wide: day columns are fixed-order
                  startReorder(e, 'col', e.currentTarget);
                }}
                onDoubleClick={(e) => {
                  e.stopPropagation();
                  if (wide || c.id === 'idx') return;
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
                {headerFor ? headerFor(c.id) : c.label}
                {c.resize ? <span className="grip" onPointerDown={(e) => startResize(e, c.id)} /> : null}
              </div>
            ))}
          </div>
          <div id="gr-sections">{renderSections()}</div>
          {columnFooter ? (
            <div className="gr-foot">
              {vis.map((c) => (
                <div key={c.id} className={`c${c.type === 'money' || c.type === 'number' ? ' num' : ''}`}>
                  {columnFooter(c.id)}
                </div>
              ))}
            </div>
          ) : null}
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
      {popRef.current === 'filter' ? (
        <FilterPop
          anchor={popAnchorRef.current}
          filter={filterRef.current}
          statusList={statusUniverse(cols(), data())}
          onChange={() => render()}
          onClose={closePop}
        />
      ) : null}
      {popRef.current === 'cols' ? (
        <ColumnsPop
          anchor={popAnchorRef.current}
          cols={cols()}
          lockedCols={refColSet}
          onToggle={(id, hidden) => {
            if (isHideLocked(id)) return; // structural columns can't be hidden
            pushUndo();
            const c = colDef(cols(), id);
            if (c) c.hidden = hidden;
            selRef.current = { ar: 0, ac: 0, fr: 0, fc: 0 };
            // A3 — persist the hidden set per tour (opt-in via columnPrefsKey).
            if (columnPrefsKey && typeof window !== 'undefined') {
              try {
                const hiddenIds = cols().filter((cc) => cc.hidden).map((cc) => cc.id);
                window.localStorage.setItem(columnPrefsKey, JSON.stringify(hiddenIds));
              } catch {
                /* localStorage unavailable (private mode / quota) — non-fatal */
              }
            }
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
          lineApi={lineApi}
        />
      ) : null}
    </div>
  );
});

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
    // G1-C keyboard contract — Esc exits the popover (Filter / Columns / Add
    // column). Tab still moves natively through the form controls inside.
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
      }
    };
    const t = setTimeout(() => document.addEventListener('pointerdown', onDown), 0);
    document.addEventListener('keydown', onKey);
    return () => {
      clearTimeout(t);
      document.removeEventListener('pointerdown', onDown);
      document.removeEventListener('keydown', onKey);
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
  statusList,
  onChange,
  onClose,
}: {
  anchor: { left: number; bottom: number };
  filter: Set<string>;
  statusList: string[];
  onChange: () => void;
  onClose: () => void;
}) {
  return (
    <PopShell anchor={anchor} onClose={onClose}>
      <div className="ttl">Show statuses</div>
      {statusList.map((st) => (
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
  lockedCols,
}: {
  anchor: { left: number; bottom: number };
  cols: Column[];
  onToggle: (id: string, hidden: boolean) => void;
  onDelete: (id: string) => void;
  onAdd: () => void;
  onClose: () => void;
  /** A3 — structural columns (idx + reference block) excluded from the hide/show checklist. */
  lockedCols?: Set<string>;
}) {
  return (
    <PopShell anchor={anchor} onClose={onClose}>
      <div className="ttl">Columns</div>
      {cols
        .filter((c) => c.id !== 'idx' && c.id !== 'item' && !lockedCols?.has(c.id))
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

