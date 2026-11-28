'use client';

/* ============================================
   LOWPASS — small pieces the rental pages share (Nov 2026 visual pass)
   ============================================ */

import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Check, ChevronDown } from 'lucide-react';
import { JOB_STATUS_LABEL, JOB_STATUS_ORDER, type JobStatus } from '@/lib/rental/jobList';
import { JOB_STATUS_TONE, StatusPill } from './StatusPill';

/** A button that opens a panel under it; closes on outside click / Escape. */
export function Popover({
  trigger,
  children,
  align = 'left',
  width = 220,
  open,
  onOpenChange,
}: {
  trigger: (props: { open: boolean; toggle: () => void }) => ReactNode;
  children: ReactNode | ((close: () => void) => ReactNode);
  align?: 'left' | 'right';
  width?: number;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const down = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) onOpenChange(false);
    };
    const key = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onOpenChange(false);
    };
    document.addEventListener('mousedown', down);
    document.addEventListener('keydown', key);
    return () => {
      document.removeEventListener('mousedown', down);
      document.removeEventListener('keydown', key);
    };
  }, [open, onOpenChange]);
  const close = () => onOpenChange(false);
  return (
    <div ref={ref} className="relative inline-flex">
      {trigger({ open, toggle: () => onOpenChange(!open) })}
      {open ? (
        <div
          role="menu"
          className="absolute top-full mt-1.5 rounded-xl border p-1.5"
          style={{
            [align]: 0,
            width,
            zIndex: 'var(--lp-z-dropdown)',
            borderColor: 'var(--lp-border)',
            backgroundColor: 'var(--lp-surface)',
            boxShadow: 'var(--lp-shadow-lg)',
          }}
        >
          {typeof children === 'function' ? children(close) : children}
        </div>
      ) : null}
    </div>
  );
}

export function MenuItem({ children, onClick, active, hint }: { children: ReactNode; onClick: () => void; active?: boolean; hint?: string }) {
  return (
    <button
      type="button"
      role="menuitem"
      onClick={onClick}
      className="flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-left text-sm text-lp-text hover:bg-lp-surface-hover"
    >
      <span className="min-w-0 flex-1">{children}</span>
      {hint ? <span className="text-xs text-lp-text-tertiary">{hint}</span> : null}
      {active ? <Check size={14} style={{ color: 'var(--lp-orange)' }} aria-hidden /> : null}
    </button>
  );
}

/** The job's status as a pill you click to change. */
export function StatusMenu({ status, onChange }: { status: string; onChange: (s: JobStatus) => void }) {
  const [open, setOpen] = useState(false);
  const label = JOB_STATUS_LABEL[status as JobStatus] ?? status;
  return (
    <Popover
      open={open}
      onOpenChange={setOpen}
      width={180}
      trigger={({ toggle }) => (
        <button
          type="button"
          onClick={toggle}
          aria-haspopup="menu"
          aria-expanded={open}
          aria-label={`Status: ${label}. Change`}
          className="inline-flex items-center gap-1 rounded-full"
        >
          <StatusPill tone={JOB_STATUS_TONE[status] ?? 'neutral'}>
            {label}
            <ChevronDown size={12} aria-hidden />
          </StatusPill>
        </button>
      )}
    >
      {(close) =>
        JOB_STATUS_ORDER.map((s) => (
          <MenuItem
            key={s}
            active={s === status}
            onClick={() => {
              close();
              if (s !== status) onChange(s);
            }}
          >
            <StatusPill tone={JOB_STATUS_TONE[s]}>{JOB_STATUS_LABEL[s]}</StatusPill>
          </MenuItem>
        ))
      }
    </Popover>
  );
}

/** A small grey thumbnail: the item's photo, else an icon. */
export function Thumb({ src, icon, size = 28 }: { src: string | null | undefined; icon: ReactNode; size?: number }) {
  return src ? (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={src} alt="" className="shrink-0 rounded-md object-cover" style={{ width: size, height: size, border: '1px solid var(--lp-border)' }} />
  ) : (
    <span
      className="flex shrink-0 items-center justify-center rounded-md"
      style={{ width: size, height: size, backgroundColor: 'var(--lp-bg-secondary)', color: 'var(--lp-text-tertiary)' }}
    >
      {icon}
    </span>
  );
}
