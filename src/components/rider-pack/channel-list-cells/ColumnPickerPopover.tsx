'use client';

/* ============================================
   LOWPASS — <ColumnPickerPopover> (§CL-FIX-6b)

   "Add column" picker for the channel-list editor. Lists every
   OPTIONAL column with a checkbox; toggling persists to
   rider_sections.metadata.enabled_columns. Number + Name are
   permanent and not listed. Soft-hide model — disabling a column
   hides its cells but keeps the row data (re-enable shows it
   again).
   ============================================ */

import { useEffect, useRef } from 'react';
import { Check } from 'lucide-react';
import { OPTIONAL_COLUMNS, type ChannelListColumnKey } from '@/lib/channel-list/columns';

interface ColumnPickerPopoverProps {
  open: boolean;
  enabled: Set<ChannelListColumnKey>;
  onToggle: (key: ChannelListColumnKey, enable: boolean) => void;
  onClose: () => void;
}

export function ColumnPickerPopover({ open, enabled, onToggle, onClose }: ColumnPickerPopoverProps) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      ref={ref}
      role="menu"
      aria-label="Toggle channel-list columns"
      className="absolute right-0 top-full z-40 mt-1 w-56 rounded-xl border py-1 shadow-xl"
      style={{ borderColor: 'var(--lp-border)', background: 'var(--lp-surface)' }}
    >
      <div
        className="px-3 py-1.5 text-[10px] font-bold uppercase tracking-wider"
        style={{ color: 'var(--lp-text-tertiary)' }}
      >
        Columns
      </div>
      {OPTIONAL_COLUMNS.map((c) => {
        const on = enabled.has(c.key);
        return (
          <button
            key={c.key}
            type="button"
            role="menuitemcheckbox"
            aria-checked={on}
            onClick={() => onToggle(c.key, !on)}
            className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm hover:bg-lp-surface-hover"
          >
            <span
              className="flex h-4 w-4 shrink-0 items-center justify-center rounded border"
              style={{
                borderColor: on ? 'var(--color-lp-orange)' : 'var(--lp-border)',
                background: on ? 'var(--color-lp-orange)' : 'transparent',
              }}
            >
              {on ? (
                <Check className="h-3 w-3" strokeWidth={3} style={{ color: 'var(--lp-text-inverse)' }} />
              ) : null}
            </span>
            <span className="flex-1 text-lp-text">{c.label}</span>
          </button>
        );
      })}
    </div>
  );
}
