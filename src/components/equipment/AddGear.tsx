'use client';

/* ============================================
   LOWPASS — Add gear: one search box over the stock (Nov 2026 visual pass)

   Replaces the collapsible "Add items" panel. Type to search; ↑ ↓ to move;
   Enter adds one and keeps the box open for the next item. A number first
   adds that many: "8 sm58" or "8x sm58". "/" anywhere on the page jumps here.
   An item already on the job adds to its quantity (the server does that).
   ============================================ */

import { useEffect, useMemo, useRef, useState } from 'react';
import { Package, Search } from 'lucide-react';
import { effectiveInventoryDayRate } from '@/lib/rental-pricing';
import { fmtMoney, type RentalInventoryItem } from './types';
import { Thumb } from './rentalUi';

/** "8 sm58" / "8x sm58" / "8 × sm58" → 8 + "sm58". */
export function readAddQuery(q: string): { qty: number; text: string } {
  const m = /^\s*(\d{1,4})\s*[x×]?\s+(.+)$/i.exec(q);
  if (m && Number(m[1]) >= 1) return { qty: Number(m[1]), text: m[2].trim() };
  return { qty: 1, text: q.trim() };
}

/** Every word must match name, category or serial; names starting with the
 *  first word rank first; retired items last. */
export function searchStock(stock: RentalInventoryItem[], text: string, limit = 8): RentalInventoryItem[] {
  const words = text.toLowerCase().split(/\s+/).filter(Boolean);
  if (words.length === 0) return [];
  const hits = stock.filter((i) => {
    const blob = [i.name, i.category, i.serial_number].filter(Boolean).join(' ').toLowerCase();
    return words.every((w) => blob.includes(w));
  });
  const score = (i: RentalInventoryItem) =>
    (i.status === 'retired' ? 2 : 0) + (i.name.toLowerCase().startsWith(words[0]) ? 0 : 1);
  return hits.sort((a, b) => score(a) - score(b) || a.name.localeCompare(b.name)).slice(0, limit);
}

export function AddGear({
  stock,
  onJob,
  conv,
  currency,
  onAdd,
}: {
  stock: RentalInventoryItem[];
  /** How many of this item are on the job already. */
  onJob: (gearId: string) => number;
  conv: (usd: number) => number;
  currency: string;
  onAdd: (gearId: string, qty: number) => Promise<boolean>;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [q, setQ] = useState('');
  const [focused, setFocused] = useState(false);
  const [active, setActive] = useState(0);
  const [busy, setBusy] = useState<string | null>(null);

  const { qty, text } = readAddQuery(q);
  const results = useMemo(() => searchStock(stock, text), [stock, text]);
  const shownActive = Math.min(active, Math.max(0, results.length - 1));

  /* "/" focuses the box unless you're typing somewhere else. */
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== '/' || e.metaKey || e.ctrlKey || e.altKey) return;
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' || t.isContentEditable)) return;
      e.preventDefault();
      inputRef.current?.focus();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  async function add(item: RentalInventoryItem) {
    if (busy) return;
    setBusy(item.id);
    const ok = await onAdd(item.id, qty);
    setBusy(null);
    if (ok) {
      setQ('');
      setActive(0);
      inputRef.current?.focus();
    }
  }

  const open = focused && text.length > 0;

  return (
    <div className="relative">
      <div
        className="flex h-10 items-center gap-2 rounded-xl border px-3 transition-colors focus-within:border-[var(--color-lp-orange)]"
        style={{ borderColor: 'var(--lp-border-strong)', backgroundColor: 'var(--lp-surface)' }}
      >
        <Search size={15} aria-hidden style={{ color: 'var(--lp-text-tertiary)' }} />
        <input
          ref={inputRef}
          value={q}
          onChange={(e) => {
            setQ(e.target.value);
            setActive(0);
          }}
          onFocus={() => setFocused(true)}
          onBlur={() => setTimeout(() => setFocused(false), 120)}
          onKeyDown={(e) => {
            if (e.key === 'ArrowDown') {
              e.preventDefault();
              setActive(Math.min(shownActive + 1, results.length - 1));
            } else if (e.key === 'ArrowUp') {
              e.preventDefault();
              setActive(Math.max(shownActive - 1, 0));
            } else if (e.key === 'Enter') {
              e.preventDefault();
              const item = results[shownActive];
              if (item) void add(item);
            } else if (e.key === 'Escape') {
              if (q) setQ('');
              else inputRef.current?.blur();
            }
          }}
          role="combobox"
          aria-expanded={open}
          aria-controls="add-gear-results"
          aria-autocomplete="list"
          aria-label="Add gear"
          placeholder="Add gear — type to search, Enter adds one"
          className="min-w-0 flex-1 bg-transparent text-sm text-lp-text outline-none placeholder:text-lp-text-tertiary"
          autoComplete="off"
          spellCheck={false}
        />
        {qty > 1 && text ? (
          <span className="shrink-0 rounded-md px-1.5 py-0.5 text-xs tabular-nums" style={{ color: 'var(--lp-orange)', backgroundColor: 'color-mix(in srgb, var(--lp-orange) 10%, transparent)' }}>
            Adds {qty}
          </span>
        ) : (
          <kbd className="shrink-0 rounded border px-1.5 text-[11px] text-lp-text-tertiary" style={{ borderColor: 'var(--lp-border)' }}>/</kbd>
        )}
      </div>

      {open ? (
        <div
          id="add-gear-results"
          role="listbox"
          className="absolute left-0 right-0 top-full mt-1.5 overflow-hidden rounded-xl border"
          style={{ zIndex: 'var(--lp-z-dropdown)', borderColor: 'var(--lp-border)', backgroundColor: 'var(--lp-surface)', boxShadow: 'var(--lp-shadow-lg)' }}
        >
          {results.length === 0 ? (
            <p className="px-3 py-3 text-sm text-lp-text-tertiary">Nothing in your stock matches “{text}”.</p>
          ) : (
            results.map((i, idx) => {
              const already = onJob(i.id);
              const owned = i.quantity ?? 1;
              const warn = i.status === 'retired' ? 'Retired' : i.status === 'maintenance' ? 'In maintenance' : null;
              return (
                <div
                  key={i.id}
                  role="option"
                  aria-selected={idx === shownActive}
                  onMouseDown={(e) => e.preventDefault()}
                  onMouseEnter={() => setActive(idx)}
                  onClick={() => void add(i)}
                  className="flex cursor-pointer items-center gap-3 px-3 py-2 text-sm"
                  style={{
                    backgroundColor: idx === shownActive ? 'var(--lp-surface-hover)' : undefined,
                    borderTop: idx ? '1px solid var(--lp-border-light)' : undefined,
                    opacity: busy && busy !== i.id ? 0.6 : 1,
                  }}
                >
                  <Thumb src={i.image_url} icon={<Package size={13} strokeWidth={1.75} aria-hidden />} />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-lp-text">{i.name}</span>
                    <span className="block truncate text-xs text-lp-text-tertiary">
                      {[i.category, `${owned} owned`].filter(Boolean).join(' · ')}
                      {already ? <span style={{ color: 'var(--lp-orange)' }}> · {already} on this job</span> : null}
                      {warn ? <span style={{ color: 'var(--color-lp-warning)' }}> · {warn}</span> : null}
                    </span>
                  </span>
                  <span className="shrink-0 text-xs tabular-nums text-lp-text-secondary">
                    {fmtMoney(conv(effectiveInventoryDayRate(i) ?? 0), currency)}/day
                  </span>
                  {busy === i.id ? <span className="shrink-0 text-xs text-lp-text-tertiary">Adding…</span> : null}
                </div>
              );
            })
          )}
        </div>
      ) : null}
    </div>
  );
}
