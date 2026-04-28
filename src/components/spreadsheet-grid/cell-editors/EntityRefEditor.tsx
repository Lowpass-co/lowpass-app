'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { flushSync } from 'react-dom';
import { getEntityDescriptor } from '@/lib/entities/registry';
import type { EntityKind } from '@/lib/entities/types';

type EntityRefEditorProps = {
  value: string;
  onChange: (v: string) => void;
  onKeyDown: (e: React.KeyboardEvent) => void;
  entity: EntityKind;
  tourId?: string | null;
};

export function EntityRefEditor({
  value,
  onChange,
  onKeyDown,
  entity,
  tourId,
}: EntityRefEditorProps) {
  const ref = useRef<HTMLInputElement>(null);
  const [q, setQ] = useState('');
  const [open, setOpen] = useState(true);
  const [rows, setRows] = useState<{ id: string; label: string; sub?: string }[]>([]);
  const [loading, setLoading] = useState(false);
  const seq = useRef(0);

  useEffect(() => {
    ref.current?.focus();
  }, []);

  const runSearch = useCallback(
    async (query: string) => {
      const d = getEntityDescriptor(entity);
      if (!d) {
        setRows([]);
        return;
      }
      const n = ++seq.current;
      setLoading(true);
      try {
        const list = await d.search(query, { limit: 12, tourId: tourId ?? undefined });
        if (n !== seq.current) return;
        setRows(
          list.map(r => ({
            id: (r as { id: string }).id,
            label: d.getLabel(r as never),
            sub: d.getSecondary ? d.getSecondary(r as never) : undefined,
          }))
        );
      } finally {
        if (n === seq.current) setLoading(false);
      }
    },
    [entity, tourId]
  );

  useEffect(() => {
    const t = window.setTimeout(() => {
      void runSearch(q);
    }, 180);
    return () => window.clearTimeout(t);
  }, [q, runSearch]);

  const pick = useCallback(
    (id: string) => {
      flushSync(() => {
        onChange(id);
      });
      setOpen(false);
      setQ('');
      requestAnimationFrame(() => {
        ref.current?.dispatchEvent(
          new KeyboardEvent('keydown', { key: 'Enter', code: 'Enter', bubbles: true, cancelable: true })
        );
      });
    },
    [onChange]
  );

  return (
    <div className="relative z-20 flex w-full min-w-0 flex-col gap-0">
      <input
        ref={ref}
        className="min-w-0 flex-1 border-0 bg-transparent p-0 text-sm outline-none"
        style={{ color: 'var(--lp-text)' }}
        value={q}
        placeholder={value ? `Replace (current id)…` : 'Search…'}
        onChange={e => setQ(e.target.value)}
        onKeyDown={e => {
          if (e.key === 'Escape') {
            onKeyDown(e);
            return;
          }
          if (e.key === 'Enter' && rows[0]) {
            e.preventDefault();
            pick(rows[0].id);
            return;
          }
          onKeyDown(e);
        }}
        aria-label={`Search ${entity} to link`}
        autoComplete="off"
      />
      {open && (
        <div
          className="absolute left-0 right-0 top-full z-[50] mt-0.5 max-h-48 overflow-auto rounded-md border py-0.5 shadow-lg"
          style={{
            background: 'var(--lp-bg)',
            borderColor: 'var(--lp-border)',
            boxShadow: 'var(--lp-shadow-md)',
          }}
          onMouseDown={e => e.preventDefault()}
        >
          {loading && (
            <div className="px-2 py-1.5 text-xs" style={{ color: 'var(--lp-text-tertiary)' }}>
              Searching…
            </div>
          )}
          {!loading && rows.length === 0 && (
            <div className="px-2 py-1.5 text-xs" style={{ color: 'var(--lp-text-tertiary)' }}>
              No matches
            </div>
          )}
          {rows.map(r => (
            <button
              key={r.id}
              type="button"
              className="flex w-full flex-col items-start px-2 py-1.5 text-left text-sm hover:opacity-90"
              style={{ color: 'var(--lp-text)' }}
              onClick={() => pick(r.id)}
            >
              <span className="font-medium">{r.label}</span>
              {r.sub && (
                <span className="text-xs" style={{ color: 'var(--lp-text-tertiary)' }}>
                  {r.sub}
                </span>
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
