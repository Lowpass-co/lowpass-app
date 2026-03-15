/* ============================================
   LOWPASS — Day Type Combobox

   Type-ahead, empty by default. Preset + custom
   (localStorage) options. Matches design language.
   ============================================ */

'use client';

import { useState, useRef, useEffect, useLayoutEffect } from 'react';
import { createPortal } from 'react-dom';
import { ChevronDown } from 'lucide-react';
import { getDayTypeLabel, getDayTypeColor } from '@/lib/utils';
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

const CUSTOM_STORAGE_KEY = 'lowpass_custom_day_types';

function getCustomDayTypes(): string[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = localStorage.getItem(CUSTOM_STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function addCustomDayType(label: string): void {
  const custom = getCustomDayTypes();
  const trimmed = label.trim();
  if (!trimmed || custom.includes(trimmed)) return;
  custom.push(trimmed);
  try {
    localStorage.setItem(CUSTOM_STORAGE_KEY, JSON.stringify(custom));
  } catch {
    // ignore
  }
}

/** Value is preset slug (DayType), custom label string, or '' for empty. If customTypes/onAddCustomType provided, use DB; else fallback to localStorage. */
export function DayTypeCombobox({
  value,
  onChange,
  customTypes,
  onAddCustomType,
  placeholder = 'Day type',
  className,
}: {
  value: string;
  onChange: (value: string) => void;
  customTypes?: string[];
  onAddCustomType?: (newType: string) => void;
  placeholder?: string;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [dropdownRect, setDropdownRect] = useState<{ top: number; left: number; width: number } | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const displayValue = value ? getDayTypeLabel(value) : '';
  const customList = customTypes ?? getCustomDayTypes();
  const persistCustom = (label: string) => {
    const trimmed = label.trim();
    if (!trimmed || customList.includes(trimmed)) return;
    if (onAddCustomType) onAddCustomType(trimmed);
    else addCustomDayType(trimmed);
  };
  const presetOptions = PRESET_DAY_TYPES.map((slug) => ({
    value: slug,
    label: getDayTypeLabel(slug),
  }));
  const customOptions = customList
    .filter((c) => !PRESET_DAY_TYPES.includes(c as DayType))
    .map((label) => ({ value: label, label }));
  const allOptions = [...presetOptions, ...customOptions];
  const q = query.trim().toLowerCase();
  const filtered =
    q.length === 0
      ? allOptions
      : allOptions.filter(
          (o) => o.label.toLowerCase().includes(q) || o.value.toLowerCase().includes(q)
        );
  const exactMatch = filtered.find(
    (o) => o.label.toLowerCase() === q || o.value.toLowerCase() === q
  );
  const hasFullMatch = open ? !!exactMatch : !!value;
  const colors = hasFullMatch ? getDayTypeColor(open && exactMatch ? exactMatch.value : value) : null;
  const isEmpty = !value;

  useLayoutEffect(() => {
    if (open && inputRef.current) {
      const rect = inputRef.current.getBoundingClientRect();
      setDropdownRect({ top: rect.bottom, left: rect.left, width: rect.width });
    } else {
      setDropdownRect(null);
    }
  }, [open]);

  useEffect(() => {
    const close = (e: MouseEvent) => {
      const target = e.target as Node;
      const inContainer = containerRef.current?.contains(target);
      const inDropdown = dropdownRef.current?.contains(target);
      if (!inContainer && !inDropdown) {
        setOpen((wasOpen) => {
          if (!wasOpen) return false;
          if (query.trim()) {
            if (!exactMatch && query.trim() !== displayValue) {
              persistCustom(query.trim());
              onChange(query.trim());
            } else if (exactMatch) {
              onChange(exactMatch.value);
            }
          } else {
            onChange(''); // Allow clearing to blank
          }
          setQuery('');
          return false;
        });
      }
    };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, [query, exactMatch, displayValue, onChange]);

  const handleSelect = (val: string) => {
    onChange(val);
    setQuery('');
    setOpen(false);
    inputRef.current?.blur();
  };

  const handleFocus = () => {
    setOpen(true);
    setQuery(displayValue); // Pre-fill so user can backspace to clear
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      if (!query.trim()) {
        onChange('');
        setQuery('');
        setOpen(false);
        e.preventDefault();
        return;
      }
      if (exactMatch) handleSelect(exactMatch.value);
      else {
        persistCustom(query.trim());
        onChange(query.trim());
        setQuery('');
        setOpen(false);
      }
      e.preventDefault();
    }
    if (e.key === 'Tab') {
      if (open) {
        if (!query.trim()) {
          onChange('');
        } else if (filtered.length > 0) {
          if (query.trim() && !exactMatch) {
            persistCustom(query.trim());
            onChange(query.trim());
          } else {
            const toSelect = exactMatch ? exactMatch.value : filtered[0].value;
            onChange(toSelect);
          }
        }
        setQuery('');
        setOpen(false);
      }
    }
    if (e.key === 'Escape') {
      setQuery(displayValue);
      setOpen(false);
      inputRef.current?.blur();
    }
  };

  const activate = () => {
    inputRef.current?.focus();
    if (!open) setOpen(true);
  };

  return (
    <div
      ref={containerRef}
      className={cn('relative min-w-[140px]', className)}
      onMouseDown={(e) => {
        e.preventDefault();
        activate();
      }}
      onClick={activate}
    >
      <input
        ref={inputRef}
        type="text"
        value={open ? query : displayValue}
        onChange={(e) => {
          setQuery(e.target.value);
          if (!open) setOpen(true);
        }}
        onFocus={handleFocus}
        onKeyDown={handleKeyDown}
        placeholder="Day type"
        aria-label="Day type"
        className={cn(
          'w-full rounded-xl border border-lp-border bg-lp-surface py-2 pl-3 pr-9 text-sm transition-colors placeholder:text-lp-text-tertiary focus:border-lp-orange focus:outline-none focus:ring-2 focus:ring-lp-orange/20',
          !hasFullMatch && 'text-lp-text-tertiary',
          hasFullMatch && colors?.text
        )}
        style={{ caretColor: open ? 'currentColor' : 'transparent' }}
      />
      <ChevronDown
        className={cn(
          'pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-lp-text-tertiary transition-transform',
          open && 'rotate-180'
        )}
      />
      {open &&
        dropdownRect &&
        typeof document !== 'undefined' &&
        createPortal(
          <div
            ref={dropdownRef}
            className="lp-dropdown-layer max-h-56 overflow-y-auto rounded-xl border border-lp-border bg-lp-surface py-1 shadow-lg"
            style={{
              position: 'fixed',
              top: dropdownRect.top + 4,
              left: dropdownRect.left,
              width: dropdownRect.width,
              minWidth: 140,
            }}
          >
            <ul>
              {filtered.length === 0 ? (
                <li className="px-3 py-2 text-sm text-lp-text-tertiary">
                  {query.trim() ? 'Press Enter to add' : 'No options'}
                </li>
              ) : (
                filtered.map((opt) => {
                  const c = getDayTypeColor(opt.value);
                  return (
                    <li key={opt.value}>
                      <button
                        type="button"
                        onMouseDown={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          handleSelect(opt.value);
                        }}
                        className={cn(
                          'w-full px-3 py-2 text-left text-sm transition-colors hover:bg-lp-surface-hover',
                          c.text,
                          value === opt.value && 'bg-lp-surface-hover'
                        )}
                      >
                        {opt.label}
                      </button>
                    </li>
                  );
                })
              )}
            </ul>
          </div>,
          document.body
        )}
    </div>
  );
}
