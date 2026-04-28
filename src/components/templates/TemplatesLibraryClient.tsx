'use client';

import { useEffect, useMemo, useState } from 'react';
import dynamic from 'next/dynamic';
import type { TemplateKind, TemplateVm } from '@/lib/types/template-vm';
import { listTemplates } from '@/lib/api/templates';
import { DataTable } from '@/components/entity/DataTable';

const TemplateSlideOver = dynamic(() => import('@/components/entity/template/TemplateSlideOver'), {
  ssr: false,
});

function KindLabel({ kind }: { kind: TemplateKind }) {
  const map: Record<TemplateKind, string> = {
    'rider-pack': 'Rider pack',
    'advance-layout': 'Advance layout',
    'advance-schedule': 'Schedule',
    budget: 'Budget',
    other: 'Advance section',
  };
  const label = map[kind];
  return (
    <span
      className="inline-flex rounded-full px-2 py-0.5 text-[10px] font-bold uppercase"
      style={{
        backgroundColor: 'color-mix(in srgb, var(--lp-orange) 14%, transparent)',
        color: 'var(--lp-orange)',
      }}
    >
      {label}
    </span>
  );
}

function rel(iso: string): string {
  try {
    return new Date(iso).toLocaleString(undefined, {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      year: 'numeric',
    });
  } catch {
    return iso;
  }
}

export function TemplatesLibraryClient({ initial }: { initial: TemplateVm[] }) {
  const [kind, setKind] = useState<TemplateKind | ''>('');
  const [updatedAfter, setUpdatedAfter] = useState('');
  const [updatedBefore, setUpdatedBefore] = useState('');
  const [rows, setRows] = useState<TemplateVm[]>(initial);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [selected, setSelected] = useState<TemplateVm | null>(null);

  useEffect(() => {
    let cancelled = false;
    const sid =
      typeof window !== 'undefined'
        ? window.setTimeout(() => {
            if (cancelled) return;
            setLoading(true);
            setErr(null);
            void listTemplates({
              kind: kind === '' ? undefined : kind,
              updatedAfter: updatedAfter.trim() ? updatedAfter.trim() : null,
              updatedBefore: updatedBefore.trim() ? updatedBefore.trim() : null,
            })
              .then((list) => {
                if (!cancelled) setRows(list);
              })
              .catch((e: Error) => !cancelled && setErr(e.message))
              .finally(() => !cancelled && setLoading(false));
          }, 0)
        : undefined;

    return () => {
      cancelled = true;
      if (sid !== undefined) window.clearTimeout(sid);
    };
  }, [kind, updatedAfter, updatedBefore]);

  const columns = useMemo(
    () => [
      {
        key: 'name',
        header: 'Name',
        render: (r: TemplateVm) => <span className="font-medium">{r.name}</span>,
      },
      {
        key: 'kind',
        header: 'Kind',
        render: (r: TemplateVm) => <KindLabel kind={r.kind} />,
      },
      {
        key: 'used',
        header: 'Used count',
        className: 'text-right tabular-nums',
        render: (r: TemplateVm) => r.usedCount,
      },
      {
        key: 'last',
        header: 'Last used',
        render: (r: TemplateVm) => (r.lastUsedAt ? rel(r.lastUsedAt) : '—'),
      },
      {
        key: 'up',
        header: 'Updated',
        render: (r: TemplateVm) => rel(r.updatedAt),
      },
    ],
    []
  );

  return (
    <div className="space-y-4">
      {err ? <div className="rounded border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">{err}</div> : null}

      <div className="flex flex-wrap gap-3">
        <select
          className="rounded-lg border border-lp-border bg-lp-surface px-2 py-2 text-sm outline-none focus:border-lp-orange"
          aria-label="Template kind filter"
          value={kind}
          onChange={(e) => {
            const v = e.target.value;
            setKind(v === '' ? '' : (v as TemplateKind));
          }}
        >
          <option value="">All kinds</option>
          <option value="rider-pack">Rider pack</option>
          <option value="advance-layout">Advance layout</option>
          <option value="advance-schedule">Advance schedule</option>
          <option value="other">Advance section templates</option>
          <option value="budget">Budget templates</option>
        </select>
        <label className="text-xs font-medium">
          <span className="mr-2 text-lp-text-tertiary">Updated after</span>
          <input
            type="date"
            value={updatedAfter}
            onChange={(e) => setUpdatedAfter(e.target.value)}
            className="rounded-lg border border-lp-border bg-lp-surface px-2 py-2 text-sm"
          />
        </label>
        <label className="text-xs font-medium">
          <span className="mr-2 text-lp-text-tertiary">Updated before</span>
          <input
            type="date"
            value={updatedBefore}
            onChange={(e) => setUpdatedBefore(e.target.value)}
            className="rounded-lg border border-lp-border bg-lp-surface px-2 py-2 text-sm"
          />
        </label>
      </div>

      <DataTable
        rows={rows}
        emptyLabel={loading ? 'Loading templates…' : 'No templates in this workspace yet'}
        columns={columns}
        onRowClick={(row) => setSelected(row)}
      />

      {selected ? <TemplateSlideOver template={selected} onClose={() => setSelected(null)} /> : null}
    </div>
  );
}
