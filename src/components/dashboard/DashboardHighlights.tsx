'use client';

import { useState, useRef, useEffect, useLayoutEffect } from 'react';
import { createPortal } from 'react-dom';
import { ChevronUp, ChevronDown, Minus, Plus } from 'lucide-react';
import { cn } from '@/lib/utils';

export type HighlightId =
  | 'active_tours'
  | 'shows_this_year'
  | 'artists'
  | 'completed_tours'
  | 'days_until_next_show'
  | 'total_routing_days'
  | 'touring_days_this_year';

const HIGHLIGHT_OPTIONS: { id: HighlightId; label: string }[] = [
  { id: 'active_tours', label: 'Active Tours' },
  { id: 'shows_this_year', label: 'Shows This Year' },
  { id: 'artists', label: 'Artists' },
  { id: 'completed_tours', label: 'Completed Tours' },
  { id: 'days_until_next_show', label: 'Days Until Next Show' },
  { id: 'total_routing_days', label: 'Total Routing Days' },
  { id: 'touring_days_this_year', label: 'Touring Days This Year' },
];

const MIN_SLOTS = 1;
const MAX_SLOTS = 6;

type DashboardHighlightsProps = {
  activeToursCount: number;
  showsThisYearCount: number;
  artistsCount: number;
  completedToursCount?: number;
  daysUntilNextShow?: number | null;
  totalRoutingDays?: number;
  touringDaysThisYear?: number;
};

function getValue(id: HighlightId, props: DashboardHighlightsProps): number | string {
  switch (id) {
    case 'active_tours': return props.activeToursCount;
    case 'shows_this_year': return props.showsThisYearCount;
    case 'artists': return props.artistsCount;
    case 'completed_tours': return props.completedToursCount ?? 0;
    case 'days_until_next_show': return props.daysUntilNextShow ?? 0;
    case 'total_routing_days': return props.totalRoutingDays ?? 0;
    case 'touring_days_this_year': return props.touringDaysThisYear ?? 0;
    default: return 0;
  }
}

export function DashboardHighlights({
  activeToursCount,
  showsThisYearCount,
  artistsCount,
  completedToursCount = 0,
  daysUntilNextShow = null,
  totalRoutingDays = 0,
  touringDaysThisYear = 0,
}: DashboardHighlightsProps) {
  const [slots, setSlots] = useState<HighlightId[]>(['active_tours', 'shows_this_year', 'artists']);
  const [openIndex, setOpenIndex] = useState<number | null>(null);
  const [dropdownRect, setDropdownRect] = useState<{ top: number; left: number; width: number } | null>(null);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const cardRefs = useRef<(HTMLDivElement | null)[]>([]);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const props = {
    activeToursCount,
    showsThisYearCount,
    artistsCount,
    completedToursCount,
    daysUntilNextShow,
    totalRoutingDays,
    touringDaysThisYear,
  };

  useLayoutEffect(() => {
    if (openIndex === null) {
      setDropdownRect(null);
      return;
    }
    const el = cardRefs.current[openIndex];
    if (el) {
      const rect = el.getBoundingClientRect();
      setDropdownRect({ top: rect.bottom + 4, left: rect.left, width: rect.width });
    } else {
      setDropdownRect(null);
    }
  }, [openIndex]);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      const target = e.target as Node;
      if (wrapperRef.current?.contains(target) || dropdownRef.current?.contains(target)) return;
      setOpenIndex(null);
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const addSlot = () => {
    if (slots.length >= MAX_SLOTS) return;
    const used = new Set(slots);
    const nextId = HIGHLIGHT_OPTIONS.find((o) => !used.has(o.id))?.id ?? 'active_tours';
    setSlots((prev) => [...prev, nextId]);
  };

  const removeSlot = (index: number) => {
    if (slots.length <= MIN_SLOTS) return;
    setSlots((prev) => prev.filter((_, i) => i !== index));
    if (openIndex === index) setOpenIndex(null);
    else if (openIndex != null && openIndex > index) setOpenIndex(openIndex - 1);
  };

  return (
    <div ref={wrapperRef} className="flex flex-col gap-4">
      {slots.map((highlightId, index) => {
        const option = HIGHLIGHT_OPTIONS.find((o) => o.id === highlightId)!;
        const value = getValue(highlightId, props);
        const isOpen = openIndex === index;

        return (
          <div
            key={`${index}-${highlightId}`}
            ref={(el) => { cardRefs.current[index] = el; }}
            className="lp-dashboard-glass-card relative rounded-2xl p-5"
          >
            <div className="flex items-start justify-between gap-2">
              <p className="text-xs font-bold uppercase tracking-wider text-lp-text-tertiary">
                {option.label}
              </p>
              <div className="flex items-center gap-0.5">
                <button
                  type="button"
                  onClick={() => setOpenIndex(isOpen ? null : index)}
                  className="rounded-lg p-1 text-lp-text-tertiary transition-colors hover:bg-lp-surface-hover hover:text-lp-orange"
                  aria-label="Change highlight"
                  aria-expanded={isOpen}
                >
                  <ChevronUp size={16} />
                  <ChevronDown size={16} className="-mt-1" />
                </button>
                {slots.length > MIN_SLOTS && (
                  <button
                    type="button"
                    onClick={() => removeSlot(index)}
                    className="rounded-lg p-1 text-lp-text-tertiary transition-colors hover:bg-red-500/10 hover:text-red-500"
                    aria-label="Remove highlight"
                  >
                    <Minus size={16} />
                  </button>
                )}
              </div>
            </div>
            <div className="mt-2">
              <span className="text-3xl font-extrabold text-lp-orange">{value}</span>
            </div>
          </div>
        );
      })}
      {slots.length < MAX_SLOTS && (
        <button
          type="button"
          onClick={addSlot}
          className="flex items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-lp-border py-4 text-sm font-medium text-lp-text-tertiary transition-colors hover:border-lp-orange/50 hover:text-lp-orange"
        >
          <Plus size={18} />
          Add highlight
        </button>
      )}
      {openIndex !== null &&
        dropdownRect &&
        typeof document !== 'undefined' &&
        createPortal(
          <div
            ref={dropdownRef}
            className="lp-dropdown-layer fixed max-h-64 overflow-y-auto rounded-xl border border-lp-border bg-lp-surface py-1 shadow-lg"
            style={{ top: dropdownRect.top, left: dropdownRect.left, width: dropdownRect.width, minWidth: 200 }}
          >
            {HIGHLIGHT_OPTIONS.map((opt) => (
              <button
                key={opt.id}
                type="button"
                onClick={() => {
                  const next = [...slots];
                  next[openIndex] = opt.id;
                  setSlots(next);
                  setOpenIndex(null);
                }}
                className={cn(
                  'w-full px-4 py-2 text-left text-sm font-medium transition-colors',
                  opt.id === slots[openIndex]
                    ? 'bg-lp-orange/10 text-lp-orange'
                    : 'text-lp-text hover:bg-lp-surface-hover'
                )}
              >
                {opt.label}
              </button>
            ))}
          </div>,
          document.body
        )}
    </div>
  );
}
