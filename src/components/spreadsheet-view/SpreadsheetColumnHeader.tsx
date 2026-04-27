'use client';

import { useState, useRef, useEffect, useLayoutEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import {
  ArrowDownAZ,
  ArrowUpAZ,
  Search,
  ArrowUpDown,
  Calendar,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { BrandedSelect } from '@/components/ui/BrandedSelect';

type SortText = 'az' | 'za' | null;
type SortNum = 'hi' | 'lo' | null;
type SortDate = 'earliest' | 'latest' | null;

const SEARCH_POPOVER_W = 160;
const SEARCH_POPOVER_Z = 6000;

export function TextColumnHeader({
  label,
  className,
  labelAlign = 'left',
  search,
  onSearchChange,
  textSort,
  onTextSort,
}: {
  label: string;
  className?: string;
  /** Label alignment for the title and filter row. */
  labelAlign?: 'left' | 'right' | 'center';
  search: string;
  onSearchChange: (q: string) => void;
  textSort: SortText;
  onTextSort: (s: SortText) => void;
}) {
  const [open, setOpen] = useState(false);
  const [popoverRect, setPopoverRect] = useState<{ top: number; left: number; width: number } | null>(null);
  const ref = useRef<HTMLDivElement>(null);
  const searchBtnRef = useRef<HTMLButtonElement>(null);
  const popoverRef = useRef<HTMLDivElement>(null);

  const updatePopoverPosition = useCallback(() => {
    const btn = searchBtnRef.current;
    const root = ref.current;
    const el = btn ?? root;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const width = SEARCH_POPOVER_W;
    const left = Math.max(8, Math.min(r.left, window.innerWidth - width - 8));
    const top = r.bottom + 4;
    setPopoverRect({ top, left, width });
  }, []);

  useLayoutEffect(() => {
    if (!open) {
      setPopoverRect(null);
      return;
    }
    updatePopoverPosition();
  }, [open, updatePopoverPosition]);

  useEffect(() => {
    if (!open) return;
    const onScrollOrResize = () => updatePopoverPosition();
    window.addEventListener('resize', onScrollOrResize);
    window.addEventListener('scroll', onScrollOrResize, true);
    return () => {
      window.removeEventListener('resize', onScrollOrResize);
      window.removeEventListener('scroll', onScrollOrResize, true);
    };
  }, [open, updatePopoverPosition]);

  useEffect(() => {
    if (!open) return;
    const f = (e: MouseEvent) => {
      const t = e.target as Node;
      if (ref.current?.contains(t)) return;
      if (popoverRef.current?.contains(t)) return;
      setOpen(false);
    };
    document.addEventListener('mousedown', f);
    return () => document.removeEventListener('mousedown', f);
  }, [open]);

  const searchPopover =
    open &&
    popoverRect &&
    typeof document !== 'undefined' &&
    createPortal(
      <div
        ref={popoverRef}
        className="fixed rounded-md border border-lp-border bg-lp-bg p-2 shadow-lg"
        style={{
          top: popoverRect.top,
          left: popoverRect.left,
          width: popoverRect.width,
          zIndex: SEARCH_POPOVER_Z,
        }}
      >
        <input
          type="search"
          value={search}
          onChange={(e) => onSearchChange(e.target.value)}
          placeholder="Filter…"
          className="w-full rounded border border-lp-border bg-lp-surface px-2 py-1.5 text-xs text-lp-text"
          autoFocus
        />
      </div>,
      document.body
    );

  return (
    <div ref={ref} className={cn('group relative', className)}>
      <div className="flex min-h-11 w-full min-w-0 flex-col gap-1 py-1 pr-1">
        <span
          className={cn(
            'min-w-0 w-full truncate text-sm font-semibold uppercase leading-tight tracking-wide lp-table-header-text',
            labelAlign === 'right' ? 'text-right' : labelAlign === 'center' ? 'text-center' : 'text-left'
          )}
        >
          {label}
        </span>
        <div
          className={cn(
            'flex min-h-5 shrink-0 items-center gap-1 opacity-0 transition-opacity group-hover:opacity-100',
            labelAlign === 'right' ? 'justify-end' : labelAlign === 'center' ? 'justify-center' : 'justify-start'
          )}
        >
          <button
            type="button"
            className={cn('rounded p-0.5 hover:bg-lp-surface-hover', textSort === 'az' && 'text-lp-orange')}
            title="A–Z"
            onClick={() => onTextSort(textSort === 'az' ? null : 'az')}
          >
            <ArrowDownAZ className="h-4 w-4" />
          </button>
          <button
            type="button"
            className={cn('rounded p-0.5 hover:bg-lp-surface-hover', textSort === 'za' && 'text-lp-orange')}
            title="Z–A"
            onClick={() => onTextSort(textSort === 'za' ? null : 'za')}
          >
            <ArrowUpAZ className="h-4 w-4" />
          </button>
          <button
            ref={searchBtnRef}
            type="button"
            className={cn('rounded p-0.5 hover:bg-lp-surface-hover', open && 'text-lp-orange')}
            title="Search"
            onClick={() => setOpen((o) => !o)}
          >
            <Search className="h-4 w-4" />
          </button>
        </div>
      </div>
      {searchPopover}
    </div>
  );
}

export function NumberColumnHeader({
  label,
  className,
  labelAlign = 'right',
  numSort,
  onNumSort,
}: {
  label: string;
  className?: string;
  labelAlign?: 'left' | 'right' | 'center';
  numSort: SortNum;
  onNumSort: (s: SortNum) => void;
}) {
  const alignText =
    labelAlign === 'center' ? 'text-center' : labelAlign === 'left' ? 'text-left' : 'text-right';
  const alignRow =
    labelAlign === 'center' ? 'justify-center' : labelAlign === 'left' ? 'justify-start' : 'justify-end';

  return (
    <div className={cn('group relative flex min-h-11 w-full min-w-0 flex-col gap-1 px-1 py-1', className)}>
      <span
        className={cn(
          'min-w-0 w-full truncate text-sm font-semibold uppercase leading-tight tracking-wide lp-table-header-text',
          alignText
        )}
      >
        {label}
      </span>
      <div
        className={cn(
          'flex min-h-5 shrink-0 items-center gap-1 opacity-0 transition-opacity group-hover:opacity-100',
          alignRow
        )}
      >
        <button
          type="button"
          className={cn('rounded p-0.5 hover:bg-lp-surface-hover', numSort === 'hi' && 'text-lp-orange')}
          title="High → Low"
          onClick={() => onNumSort(numSort === 'hi' ? null : 'hi')}
        >
          <ArrowUpDown className="h-4 w-4 scale-y-[-1]" />
        </button>
        <button
          type="button"
          className={cn('rounded p-0.5 hover:bg-lp-surface-hover', numSort === 'lo' && 'text-lp-orange')}
          title="Low → High"
          onClick={() => onNumSort(numSort === 'lo' ? null : 'lo')}
        >
          <ArrowUpDown className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}

export function DateColumnHeader({
  label,
  className,
  dateSort,
  onDateSort,
  monthYyyymm,
  onMonthYyyymm,
  monthOptions,
}: {
  label: string;
  className?: string;
  dateSort: SortDate;
  onDateSort: (s: SortDate) => void;
  monthYyyymm: string;
  onMonthYyyymm: (v: string) => void;
  monthOptions: { value: string; label: string }[];
}) {
  const [open, setOpen] = useState(false);
  return (
    <div className={cn('group relative flex min-h-11 w-full min-w-0 flex-col gap-1 py-1 pr-0.5', className)}>
      <span className="min-w-0 w-full truncate text-right text-sm font-semibold uppercase leading-tight tracking-wide lp-table-header-text">
        {label}
      </span>
      <div className="flex min-h-5 shrink-0 items-center justify-end gap-1 opacity-0 transition-opacity group-hover:opacity-100">
        <button
          type="button"
          className={cn('rounded p-0.5 hover:bg-lp-surface-hover', dateSort === 'earliest' && 'text-lp-orange')}
          title="Earliest first"
          onClick={() => onDateSort(dateSort === 'earliest' ? null : 'earliest')}
        >
          <span className="text-[11px] font-bold">1→9</span>
        </button>
        <button
          type="button"
          className={cn('rounded p-0.5 hover:bg-lp-surface-hover', dateSort === 'latest' && 'text-lp-orange')}
          title="Latest first"
          onClick={() => onDateSort(dateSort === 'latest' ? null : 'latest')}
        >
          <span className="text-[11px] font-bold">9→1</span>
        </button>
        <div className="relative">
          <button
            type="button"
            className={cn('rounded p-0.5 hover:bg-lp-surface-hover', open && 'text-lp-orange', monthYyyymm && 'text-lp-orange/80')}
            title="Month"
            onClick={() => setOpen((o) => !o)}
          >
            <Calendar className="h-4 w-4" />
          </button>
          {open && (
            <div className="absolute right-0 top-full z-30 mt-1 min-w-[10rem] rounded-md border border-lp-border bg-lp-bg p-1 shadow-md">
              <BrandedSelect
                value={monthYyyymm}
                onChange={(v) => {
                  onMonthYyyymm(v);
                  setOpen(false);
                }}
                options={[
                  { value: '', label: 'All months' },
                  ...monthOptions.map((o) => ({ value: o.value, label: o.label })),
                ]}
                ariaLabel="Month filter"
                size="sm"
                className="w-full"
                minWidth={144}
                autoOpen
                onOpenChange={(o) => {
                  if (!o) setOpen(false);
                }}
              />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
