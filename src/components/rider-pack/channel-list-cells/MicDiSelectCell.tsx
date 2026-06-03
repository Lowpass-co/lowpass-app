'use client';

/* ============================================
   LOWPASS — <MicDiSelectCell> (§CL-FIX-2)

   Mic / DI picker rebuilt as a downshift combobox. Replaces
   the prior BrandedSelect wrapper, which had three defects
   (smoke CHL-07):
     (2) options clipped — the dropdown was constrained by the
         channel-grid's overflow-auto container. Fixed: the
         menu portals to document.body and sizes to the mic
         name, not the cell width.
     (3) no type-to-search — now a true combobox: typing
         filters the list (case-insensitive substring on name).
     (4) no inline add — the last item is always
         "+ Add «typed» to library", which opens <AddMicModal>
         and selects the new row on save.

   Keyboard: ArrowUp/Down move through items (the Add row
   included), Enter selects, Escape closes, typing filters.

   The mic_library entry's `type` drives a small KIND BADGE so
   the column scans without expanding. onPick fires with the
   selected entry (or null when cleared) so the parent row can
   read default_phantom and auto-fill the +48V column.
   ============================================ */

import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useCombobox } from 'downshift';
import { Check, ChevronDown, Plus, X } from 'lucide-react';
import type { MicLibraryEntry } from '@/lib/rider-packs/types';
import { AddMicModal } from './AddMicModal';

const KIND_BADGE: Record<MicLibraryEntry['type'], { label: string; tone: string }> = {
  dynamic:    { label: 'DYN', tone: 'var(--lp-text-secondary)' },
  condenser:  { label: 'CON', tone: 'var(--color-lp-orange)' },
  ribbon:     { label: 'RIB', tone: 'var(--lp-text-secondary)' },
  di_active:  { label: 'DI+', tone: 'var(--color-lp-orange)' },
  di_passive: { label: 'DI',  tone: 'var(--lp-text-secondary)' },
};

/* Discriminated combo items so the Add row and Clear row are
   arrow-navigable alongside real mics. */
type ComboItem =
  | { kind: 'mic'; entry: MicLibraryEntry }
  | { kind: 'clear' }
  | { kind: 'add'; name: string };

const MENU_MIN_WIDTH = 260;
const MENU_MAX_HEIGHT = 320;

interface MicDiSelectCellProps {
  value: string;
  mics: MicLibraryEntry[];
  onPick: (entry: MicLibraryEntry | null, rawName: string) => void;
  ariaLabel: string;
  /** Workspace for inserting a new mic (pack.workspace_id). */
  workspaceId: string;
  /** Parent appends the freshly-created mic to its library list. */
  onMicCreated: (entry: MicLibraryEntry) => void;
}

export function MicDiSelectCell({
  value,
  mics,
  onPick,
  ariaLabel,
  workspaceId,
  onMicCreated,
}: MicDiSelectCellProps) {
  /* inputValue mirrors the committed `value` until the operator
     types to filter. On close-without-select we snap it back so
     stray filter text never lingers in the cell. */
  const [inputValue, setInputValue] = useState(value);
  const [modalOpen, setModalOpen] = useState(false);
  const justSelectedRef = useRef(false);

  const wrapRef = useRef<HTMLDivElement>(null);
  const [rect, setRect] = useState<{ top: number; left: number; width: number } | null>(null);

  /* Sync display when the row's mic changes externally (row
     switch, server refresh) and the menu isn't being edited. */
  useEffect(() => {
    setInputValue(value);
  }, [value]);

  const trimmed = inputValue.trim();
  const filtered = useMemo(() => {
    const needle = trimmed.toLowerCase();
    if (!needle) return mics;
    return mics.filter((m) => m.name.toLowerCase().includes(needle));
  }, [mics, trimmed]);

  const items = useMemo<ComboItem[]>(() => {
    const out: ComboItem[] = [];
    if (value) out.push({ kind: 'clear' });
    for (const entry of filtered) out.push({ kind: 'mic', entry });
    const exact = trimmed !== '' && mics.some((m) => m.name.toLowerCase() === trimmed.toLowerCase());
    if (trimmed !== '' && !exact) out.push({ kind: 'add', name: trimmed });
    return out;
  }, [filtered, mics, trimmed, value]);

  const {
    isOpen,
    getMenuProps,
    getInputProps,
    getToggleButtonProps,
    getItemProps,
    highlightedIndex,
    openMenu,
  } = useCombobox<ComboItem>({
    items,
    inputValue,
    selectedItem: null,
    itemToString: (item) =>
      item?.kind === 'mic' ? item.entry.name : item?.kind === 'add' ? item.name : '',
    onInputValueChange: ({ inputValue: v, type }) => {
      // Only follow user keystrokes; ignore the library-driven
      // resets downshift emits on open/close/select.
      if (type === useCombobox.stateChangeTypes.InputChange) setInputValue(v ?? '');
    },
    onSelectedItemChange: ({ selectedItem }) => {
      if (!selectedItem) return;
      justSelectedRef.current = true;
      if (selectedItem.kind === 'add') {
        setModalOpen(true);
        return;
      }
      if (selectedItem.kind === 'clear') {
        onPick(null, '');
        setInputValue('');
        return;
      }
      onPick(selectedItem.entry, selectedItem.entry.name);
      setInputValue(selectedItem.entry.name);
    },
    onIsOpenChange: ({ isOpen: open }) => {
      if (!open) {
        // Snap back to the committed value unless a selection
        // just committed a new one this tick.
        if (justSelectedRef.current) justSelectedRef.current = false;
        else setInputValue(value);
      }
    },
  });

  /* Position the portaled menu under the trigger. Re-measure
     while open so scroll/resize keep it anchored. */
  useLayoutEffect(() => {
    if (!isOpen || !wrapRef.current) {
      setRect(null);
      return;
    }
    const measure = () => {
      const el = wrapRef.current;
      if (!el) return;
      const r = el.getBoundingClientRect();
      setRect({ top: r.bottom + 4, left: r.left, width: Math.max(r.width, MENU_MIN_WIDTH) });
    };
    measure();
    window.addEventListener('scroll', measure, true);
    window.addEventListener('resize', measure);
    return () => {
      window.removeEventListener('scroll', measure, true);
      window.removeEventListener('resize', measure);
    };
  }, [isOpen]);

  const currentEntry = mics.find((m) => m.name === value) ?? null;
  const badge = currentEntry ? KIND_BADGE[currentEntry.type] : null;

  return (
    <>
      <div ref={wrapRef} className="relative flex min-w-0 items-center gap-1">
        {badge ? (
          <span
            aria-hidden
            className="shrink-0 inline-flex items-center justify-center rounded"
            style={{
              padding: '1px 4px',
              fontSize: '9px',
              fontWeight: 700,
              letterSpacing: '0.04em',
              color: 'var(--lp-text-inverse)',
              background: badge.tone,
              minWidth: 22,
              textAlign: 'center',
            }}
          >
            {badge.label}
          </span>
        ) : null}
        <div className="relative min-w-0 flex-1">
          <input
            {...getInputProps({
              'aria-label': ariaLabel,
              placeholder: '—',
              onFocus: () => {
                if (!isOpen) openMenu();
              },
            })}
            className="h-8 w-full min-w-0 rounded-lg border border-lp-border bg-lp-bg-secondary pl-2 pr-6 text-xs text-lp-text outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[var(--color-lp-orange)]"
          />
          <button
            type="button"
            {...getToggleButtonProps()}
            aria-label="Toggle mic list"
            tabIndex={-1}
            className="absolute inset-y-0 right-0 flex w-6 items-center justify-center text-lp-text-tertiary"
          >
            <ChevronDown
              size={14}
              className="transition-transform"
              style={{ transform: isOpen ? 'rotate(180deg)' : undefined }}
            />
          </button>
        </div>
      </div>

      {/* Portaled menu — escapes the channel grid's overflow-auto
          clip and sizes to the mic name, not the cell. getMenuProps
          must always render (downshift a11y); we gate visibility on
          isOpen + rect. */}
      {typeof document !== 'undefined'
        ? createPortal(
            <ul
              {...getMenuProps()}
              className="lp-dropdown-layer fixed z-50 overflow-y-auto rounded-xl border py-1 shadow-xl"
              style={
                isOpen && rect
                  ? {
                      top: rect.top,
                      left: rect.left,
                      width: rect.width,
                      maxHeight: MENU_MAX_HEIGHT,
                      borderColor: 'var(--lp-border)',
                      background: 'var(--lp-surface)',
                    }
                  : { display: 'none' }
              }
            >
              {isOpen && items.length === 0 ? (
                <li className="px-3 py-2 text-xs italic" style={{ color: 'var(--lp-text-tertiary)' }}>
                  No mics match “{trimmed}”.
                </li>
              ) : null}
              {isOpen
                ? items.map((item, index) => {
                    const highlighted = highlightedIndex === index;
                    const key =
                      item.kind === 'mic' ? `mic:${item.entry.id}` : item.kind === 'add' ? 'add' : 'clear';
                    if (item.kind === 'clear') {
                      return (
                        <li
                          key={key}
                          {...getItemProps({ item, index })}
                          className="flex cursor-pointer items-center gap-2 px-3 py-2 text-xs"
                          style={{
                            background: highlighted ? 'var(--lp-surface-hover)' : undefined,
                            color: 'var(--lp-text-tertiary)',
                          }}
                        >
                          <X size={13} className="shrink-0" />
                          Clear
                        </li>
                      );
                    }
                    if (item.kind === 'add') {
                      return (
                        <li
                          key={key}
                          {...getItemProps({ item, index })}
                          className="flex cursor-pointer items-center gap-2 px-3 py-2 text-xs font-semibold"
                          style={{
                            background: highlighted ? 'var(--lp-surface-hover)' : undefined,
                            color: 'var(--color-lp-orange)',
                            borderTop: '1px solid var(--lp-border)',
                          }}
                        >
                          <Plus size={13} className="shrink-0" />
                          Add “{item.name}” to library
                        </li>
                      );
                    }
                    const b = KIND_BADGE[item.entry.type];
                    const selected = item.entry.name === value;
                    return (
                      <li
                        key={key}
                        {...getItemProps({ item, index })}
                        className="flex cursor-pointer items-center gap-2 px-3 py-2 text-sm"
                        style={{ background: highlighted ? 'var(--lp-surface-hover)' : undefined }}
                      >
                        <span
                          aria-hidden
                          className="shrink-0 inline-flex items-center justify-center rounded"
                          style={{
                            padding: '1px 4px',
                            fontSize: '9px',
                            fontWeight: 700,
                            letterSpacing: '0.04em',
                            color: 'var(--lp-text-inverse)',
                            background: b.tone,
                            minWidth: 22,
                            textAlign: 'center',
                          }}
                        >
                          {b.label}
                        </span>
                        <span className="min-w-0 flex-1 truncate text-lp-text">{item.entry.name}</span>
                        {selected ? (
                          <Check size={14} className="shrink-0" style={{ color: 'var(--color-lp-orange)' }} />
                        ) : null}
                      </li>
                    );
                  })
                : null}
            </ul>,
            document.body,
          )
        : null}

      <AddMicModal
        key={modalOpen ? `add:${trimmed}` : 'add:closed'}
        open={modalOpen}
        initialName={trimmed}
        workspaceId={workspaceId}
        onClose={() => setModalOpen(false)}
        onCreated={(entry) => {
          onMicCreated(entry);
          onPick(entry, entry.name);
          setInputValue(entry.name);
        }}
      />
    </>
  );
}
