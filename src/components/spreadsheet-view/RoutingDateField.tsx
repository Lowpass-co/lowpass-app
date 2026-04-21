'use client';

import { useState, useEffect, useRef, useCallback, useLayoutEffect } from 'react';
import { createPortal } from 'react-dom';
import { Calendar } from 'lucide-react';
import { cn } from '@/lib/utils';
import { formatDate } from '@/lib/utils';
import { RoutingDatePickerBody, type CalRow } from '@/components/budget/RoutingMiniCalendar';

type RoutingApiRow = { date: string; day_type?: string; venue_name?: string | null; city?: string };

const POPOVER_MIN_WIDTH = 280;
const POPOVER_MAX_H = 420;

function computePopoverRect(button: DOMRect, align: 'left' | 'right') {
  const width = Math.max(button.width, POPOVER_MIN_WIDTH);
  let left = align === 'right' ? button.right - width : button.left;
  const margin = 8;
  left = Math.max(margin, Math.min(left, window.innerWidth - width - margin));
  let top = button.bottom + 4;
  const spaceBelow = window.innerHeight - top - margin;
  const spaceAbove = button.top - margin;
  if (spaceBelow < 160 && spaceAbove > spaceBelow) {
    top = Math.max(margin, button.top - POPOVER_MAX_H - 4);
  }
  return { top, left, width };
}

export function RoutingDateField({
  tourId,
  value,
  onChange,
  className,
  align = 'left',
  variant = 'default',
}: {
  tourId: string;
  value: string | null | undefined;
  onChange: (iso: string | null) => void;
  className?: string;
  align?: 'left' | 'right';
  /** Match spreadsheet row height/padding (e.g. Hotels check-in/out). */
  variant?: 'default' | 'tableCell';
}) {
  const [open, setOpen] = useState(false);
  const [calRows, setCalRows] = useState<CalRow[]>([]);
  const [popoverRect, setPopoverRect] = useState<{ top: number; left: number; width: number } | null>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const popoverRef = useRef<HTMLDivElement>(null);

  const loadRouting = useCallback(() => {
    if (!tourId) return;
    fetch(`/api/tours/${tourId}/routing`)
      .then((r) => (r.ok ? r.json() : []))
      .then((data: RoutingApiRow[] | { routing?: RoutingApiRow[] }) => {
        const list = Array.isArray(data) ? data : (data as { routing?: RoutingApiRow[] }).routing ?? [];
        setCalRows(
          list.map((r) => ({
            date: r.date,
            day_type: String(r.day_type ?? ''),
            venue_name: r.venue_name ?? null,
            city: String(r.city ?? ''),
          }))
        );
      })
      .catch(() => setCalRows([]));
  }, [tourId]);

  useEffect(() => {
    if (open) void loadRouting();
  }, [open, loadRouting]);

  const updatePopoverPosition = useCallback(() => {
    const el = buttonRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    setPopoverRect(computePopoverRect(rect, align));
  }, [align]);

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
    const onDoc = (e: MouseEvent) => {
      const t = e.target as Node;
      if (buttonRef.current?.contains(t)) return;
      if (popoverRef.current?.contains(t)) return;
      setOpen(false);
    };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [open]);

  const norm = value && String(value).length >= 10 ? String(value).slice(0, 10) : null;
  const label = norm
    ? (() => {
        try {
          return formatDate(norm);
        } catch {
          return norm;
        }
      })()
    : '—';

  const popover =
    open &&
    popoverRect &&
    typeof document !== 'undefined' &&
    createPortal(
      <div
        ref={popoverRef}
        className="fixed max-h-[min(70vh,420px)] overflow-y-auto rounded-xl border border-lp-border bg-lp-bg py-1 shadow-lg"
        style={{
          top: popoverRect.top,
          left: popoverRect.left,
          width: popoverRect.width,
          zIndex: 5000,
        }}
        role="dialog"
        aria-label="Pick date"
      >
        <RoutingDatePickerBody
          key={tourId}
          routingRows={calRows}
          value={norm}
          onSelect={(iso) => {
            onChange(iso);
            setOpen(false);
          }}
        />
      </div>,
      document.body
    );

  const isTableCell = variant === 'tableCell';

  return (
    <div
      className={cn(
        'relative',
        /* Block flex avoids inline baseline / line-box shifts inside table cells */
        isTableCell && 'flex w-fit max-w-full min-w-0',
        className
      )}
    >
      <button
        ref={buttonRef}
        type="button"
        onClick={() => setOpen((o) => !o)}
        className={cn(
          'items-center gap-1.5 border border-transparent text-sm text-lp-text transition-colors hover:bg-lp-surface-hover',
          isTableCell
            ? 'flex h-auto max-w-full min-h-0 min-w-0 items-center whitespace-nowrap px-0 py-0 text-sm leading-5'
            : cn('flex min-h-[2.75rem] w-full min-w-0 px-3 py-2', align === 'right' && 'justify-end'),
          open && 'border-lp-orange/35 bg-lp-surface'
        )}
      >
        <Calendar className="h-3.5 w-3.5 shrink-0 text-lp-text-tertiary" aria-hidden />
        <span className="tabular-nums">{label}</span>
      </button>
      {popover}
    </div>
  );
}
