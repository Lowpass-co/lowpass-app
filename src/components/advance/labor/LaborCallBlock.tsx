/* ============================================
   LOWPASS — <LaborCallBlock> (P6 · the primary editing home)

   Renders inside the decomposed Advance builder as a REGISTERED block (see
   components/advance/blocks/registry.tsx) — not a hardcoded label-match. Table of
   the day's crew calls (dept · call · heads · company · contact + notes), with
   add / duplicate / delete rows, apply-template, and save-as-template. Reads and
   writes the first-class labor_calls table via /api/labor-calls. NOT payroll.
   ============================================ */

'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { DEPARTMENT_SUGGESTIONS, toRow, type LaborCall, type LaborCallTemplate } from '@/lib/labor-calls/types';
import type { AdvanceBlockEditorProps } from '@/components/advance/blocks/registry';

const cell: React.CSSProperties = {
  width: '100%',
  minWidth: 0,
  fontSize: 'var(--lp-text-xs)',
  padding: '4px 6px',
  borderRadius: 5,
  border: '1px solid var(--lp-border)',
  background: 'var(--lp-surface)',
  color: 'var(--lp-text)',
};

export function LaborCallBlock({ tourId, routingId, readOnly }: AdvanceBlockEditorProps) {
  const [calls, setCalls] = useState<LaborCall[]>([]);
  const [templates, setTemplates] = useState<LaborCallTemplate[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [tplId, setTplId] = useState('');
  const saveTimers = useRef<Record<string, ReturnType<typeof setTimeout>>>({});

  const load = useCallback(async () => {
    const res = await fetch(`/api/labor-calls?routing_id=${routingId}`);
    const json = res.ok ? await res.json() : { calls: [] };
    setCalls((json.calls ?? []) as LaborCall[]);
    setLoading(false);
  }, [routingId]);

  useEffect(() => {
    // Async load — setState happens after the awaited fetch, not synchronously.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
  }, [load]);

  useEffect(() => {
    fetch(`/api/labor-call-templates?tour_id=${tourId}`)
      .then((r) => (r.ok ? r.json() : { templates: [] }))
      .then((j) => setTemplates((j.templates ?? []) as LaborCallTemplate[]))
      .catch(() => {});
  }, [tourId]);

  const patchLocal = (id: string, field: keyof LaborCall, value: unknown) =>
    setCalls((prev) => prev.map((c) => (c.id === id ? { ...c, [field]: value } : c)));

  const savePatch = (id: string, field: keyof LaborCall, value: unknown) => {
    patchLocal(id, field, value);
    clearTimeout(saveTimers.current[id + String(field)]);
    saveTimers.current[id + String(field)] = setTimeout(() => {
      void fetch('/api/labor-calls', {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ id, [field]: value }),
      });
    }, 500);
  };

  const addRow = async (row?: Partial<LaborCall>) => {
    setBusy(true);
    const res = await fetch('/api/labor-calls', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ tour_id: tourId, routing_id: routingId, row: row ? toRow(row as LaborCall) : undefined }),
    });
    if (res.ok) {
      const { call } = await res.json();
      if (call) setCalls((prev) => [...prev, call]);
    }
    setBusy(false);
  };

  const deleteRow = async (id: string) => {
    setCalls((prev) => prev.filter((c) => c.id !== id));
    await fetch('/api/labor-calls', {
      method: 'DELETE',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ id }),
    });
  };

  const applyTemplate = async () => {
    if (!tplId) return;
    setBusy(true);
    const res = await fetch('/api/labor-calls/apply-template', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ tour_id: tourId, routing_id: routingId, template_id: tplId }),
    });
    if (res.ok) await load();
    setBusy(false);
  };

  const saveAsTemplate = async () => {
    const name = window.prompt('Template name', 'Labor call template');
    if (name == null) return;
    setBusy(true);
    const res = await fetch('/api/labor-call-templates', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ tour_id: tourId, name, rows: calls.map(toRow) }),
    });
    if (res.ok) {
      const { template } = await res.json();
      if (template) setTemplates((prev) => [...prev, template]);
    }
    setBusy(false);
  };

  if (loading) return <div className="text-xs text-lp-text-tertiary">Loading labor calls…</div>;

  return (
    <div className="rounded-lg border border-lp-border bg-lp-bg p-2">
      <datalist id="lp-labor-depts">
        {DEPARTMENT_SUGGESTIONS.map((d) => (
          <option key={d} value={d} />
        ))}
      </datalist>

      <div className="overflow-x-auto">
        <table className="w-full border-collapse text-xs">
          <thead>
            <tr className="text-[10px] uppercase tracking-wide text-lp-text-tertiary">
              <th className="px-1 py-1 text-left">Dept</th>
              <th className="px-1 py-1 text-left">Call</th>
              <th className="px-1 py-1 text-right">Heads</th>
              <th className="px-1 py-1 text-left">Company</th>
              <th className="px-1 py-1 text-left">Contact</th>
              <th className="px-1 py-1" />
            </tr>
          </thead>
          <tbody>
            {calls.length === 0 && (
              <tr>
                <td colSpan={6} className="px-1 py-3 text-center text-lp-text-tertiary">
                  No labor calls yet.
                </td>
              </tr>
            )}
            {calls.map((c) => (
              <tr key={c.id} className="border-t border-lp-border-light align-top">
                <td className="px-1 py-1">
                  <input
                    list="lp-labor-depts"
                    value={c.department}
                    disabled={readOnly}
                    onChange={(e) => savePatch(c.id, 'department', e.target.value)}
                    style={cell}
                    placeholder="Steel…"
                  />
                </td>
                <td className="px-1 py-1">
                  <input
                    type="time"
                    value={c.call_time ?? ''}
                    disabled={readOnly}
                    onChange={(e) => savePatch(c.id, 'call_time', e.target.value || null)}
                    style={{ ...cell, width: 96 }}
                  />
                </td>
                <td className="px-1 py-1">
                  <input
                    type="number"
                    min={0}
                    value={c.headcount ?? ''}
                    disabled={readOnly}
                    onChange={(e) => savePatch(c.id, 'headcount', e.target.value === '' ? null : Number(e.target.value))}
                    style={{ ...cell, width: 56, textAlign: 'right' }}
                  />
                </td>
                <td className="px-1 py-1">
                  <input
                    value={c.company}
                    disabled={readOnly}
                    onChange={(e) => savePatch(c.id, 'company', e.target.value)}
                    style={cell}
                    placeholder="Local co."
                  />
                </td>
                <td className="px-1 py-1">
                  <input
                    value={c.contact_name}
                    disabled={readOnly}
                    onChange={(e) => savePatch(c.id, 'contact_name', e.target.value)}
                    style={{ ...cell, marginBottom: 3 }}
                    placeholder="Name"
                  />
                  <input
                    value={c.contact_phone}
                    disabled={readOnly}
                    onChange={(e) => savePatch(c.id, 'contact_phone', e.target.value)}
                    style={cell}
                    placeholder="Phone"
                  />
                </td>
                <td className="px-1 py-1 text-right">
                  {!readOnly && (
                    <div className="flex flex-col gap-1">
                      <button
                        type="button"
                        title="Duplicate row"
                        onClick={() => void addRow(c)}
                        className="rounded border border-lp-border px-1.5 py-0.5 text-[10px] text-lp-text-tertiary hover:bg-lp-surface-hover"
                      >
                        Dup
                      </button>
                      <button
                        type="button"
                        title="Delete row"
                        onClick={() => void deleteRow(c.id)}
                        className="rounded border border-lp-border px-1.5 py-0.5 text-lp-text-tertiary hover:text-lp-error"
                      >
                        ×
                      </button>
                    </div>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {!readOnly && (
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => void addRow()}
            disabled={busy}
            className="rounded border border-lp-border px-2 py-1 text-xs font-semibold text-lp-text-secondary hover:bg-lp-surface-hover disabled:opacity-40"
          >
            + Add call
          </button>
          <span className="mx-1 h-4 w-px bg-lp-border" />
          <select
            value={tplId}
            onChange={(e) => setTplId(e.target.value)}
            className="rounded border border-lp-border bg-lp-surface px-2 py-1 text-xs text-lp-text"
          >
            <option value="">Apply template…</option>
            {templates.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
                {t.artist_id ? ' (artist)' : ''}
              </option>
            ))}
          </select>
          <button
            type="button"
            onClick={() => void applyTemplate()}
            disabled={!tplId || busy}
            className="rounded border border-lp-border px-2 py-1 text-xs text-lp-text-secondary hover:bg-lp-surface-hover disabled:opacity-40"
          >
            Apply
          </button>
          <button
            type="button"
            onClick={() => void saveAsTemplate()}
            disabled={calls.length === 0 || busy}
            className="rounded border border-lp-border px-2 py-1 text-xs text-lp-text-secondary hover:bg-lp-surface-hover disabled:opacity-40"
          >
            Save as template
          </button>
        </div>
      )}
    </div>
  );
}
