'use client';

import { useState, useRef, useEffect, useLayoutEffect } from 'react';
import { createPortal } from 'react-dom';
import { ChevronDown } from 'lucide-react';
import { getDayTypeLabel, getDayTypeColor, parseDayTypes } from '@/lib/utils';
import type { DayType } from '@/types';
import { cn } from '@/lib/utils';

const PRESET_DAY_TYPES: DayType[] = [
  'show',
  'off',
  'travel',
  'rehearsal',
  'press',
  'radio',
  'tv',
  'festival',
];

// Must roughly match Tailwind `max-h-64` used on the dropdown layer.
const MAX_DROPDOWN_PX = 256;

function serializeDayTypes(types: string[]): string {
  return types.filter(Boolean).join(', ');
}

export function DayTypeDropdown({
  value,
  onChange,
  customTypes = [],
}: {
  value: string;
  onChange: (value: string) => void;
  customTypes?: string[];
}) {
  const [open, setOpen] = useState(false);
  const [dropdownRect, setDropdownRect] = useState<
    { top: number; left: number; width: number; flipUp: boolean } | null
  >(null);
  const ref = useRef<HTMLDivElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const selected = parseDayTypes(value);
  const allTypes = [...PRESET_DAY_TYPES, ...customTypes.filter((c) => !PRESET_DAY_TYPES.includes(c as DayType))];

  useLayoutEffect(() => {
    if (open && ref.current) {
      const rect = ref.current.getBoundingClientRect();
      const downTop = rect.bottom + 4;
      const spaceBelow = window.innerHeight - downTop;

      // Flip when the dropdown can't fully fit downward. When flipping, we anchor the
      // dropdown's *bottom* to the select by using `translateY(-100%)` (no gap).
      const shouldFlipUp = spaceBelow < MAX_DROPDOWN_PX && rect.top - 4 > 8;

      setDropdownRect({
        top: shouldFlipUp ? rect.top - 4 : downTop,
        left: rect.left,
        width: rect.width,
        flipUp: shouldFlipUp,
      });
    } else {
      setDropdownRect(null);
    }
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => {
      const target = e.target as Node;
      if (ref.current?.contains(target) || dropdownRef.current?.contains(target)) return;
      setOpen(false);
    };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, [open]);

  const toggle = (type: string) => {
    const next = selected.includes(type)
      ? selected.filter((t) => t !== type)
      : [...selected, type];
    onChange(serializeDayTypes(next));
  };

  const summary =
    selected.length === 0
      ? 'Select day type'
      : selected.length <= 2
        ? selected.map((t) => getDayTypeLabel(t)).join(', ')
        : `${selected.length} types`;

  return (
    <div className="relative min-w-[140px]" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className={cn(
          'flex h-9 w-full items-center justify-between gap-2 rounded-xl border bg-lp-surface px-3 py-2 text-left text-sm transition-all duration-150',
          open && 'ring-2 ring-lp-orange/20',
          'border-lp-border focus:border-lp-orange'
        )}
      >
        <span className={cn('truncate', selected.length === 0 && 'text-lp-text-tertiary')}>
          {summary}
        </span>
        <ChevronDown size={14} className={cn('shrink-0 text-lp-text-tertiary transition-transform duration-150', open && 'rotate-180')} />
      </button>
      {open &&
        dropdownRect &&
        typeof document !== 'undefined' &&
        createPortal(
          <div
            ref={dropdownRef}
            // Sprint 8.2 §4 — dropped the inline `z-[70]` Tailwind
            // class. It overrode `lp-dropdown-layer`'s z-index
            // (now 1300) and forced the dropdown behind any
            // slide-over (z-index 1210). lp-dropdown-layer alone
            // is the right layer.
            className="lp-dropdown-layer fixed max-h-64 overflow-y-auto rounded-xl border border-lp-border bg-lp-surface py-2 shadow-xl"
            style={{
              top: dropdownRect.top,
              left: dropdownRect.left,
              width: dropdownRect.width,
              minWidth: 140,
              transform: dropdownRect.flipUp ? 'translateY(-100%)' : undefined,
              transformOrigin: 'top',
            }}
          >
            <div className="flex flex-wrap gap-1.5 px-2">
              {allTypes.map((type) => {
                const isSelected = selected.includes(type);
                const colors = getDayTypeColor(type);
                return (
                  <button
                    key={type}
                    type="button"
                    onClick={() => toggle(type)}
                    className={cn(
                      'rounded-full px-2.5 py-1 text-xs font-medium cursor-pointer transition-all duration-200',
                      isSelected
                        ? [colors.bg, colors.text, 'ring-2 ring-lp-accent/50 border-transparent']
                        : 'bg-lp-surface-hover text-lp-text-secondary border border-lp-border hover:border-lp-border-light'
                    )}
                  >
                    {getDayTypeLabel(type)}
                  </button>
                );
              })}
            </div>
          </div>,
          document.body
        )}
    </div>
  );
}
