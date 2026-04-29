'use client';

import { useEffect, useMemo, useState } from 'react';
import dynamic from 'next/dynamic';
import type { TemplateKind, TemplateVm } from '@/lib/types/template-vm';
import { listTemplates } from '@/lib/api/templates';
import { DataTable } from '@/components/data-table/DataTable';
import type { ColumnDef } from '@/components/data-table/types';

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
            void listTemplates({})
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
  }, []);

  const columns = useMemo<ColumnDef<TemplateVm>[]>(
    () => [
      {
        id: 'name',
        header: 'Name',
        accessor: 'name',
        sortable: true,
        frozen: true,
        cell: (value) => <span className="font-medium">{String(value)}</span>,
      },
      {
        id: 'kind',
        header: 'Kind',
        accessor: 'kind',
        filter: {
          kind: 'select',
          options: [
            { value: 'rider-pack', label: 'Rider pack' },
            { value: 'advance-layout', label: 'Advance layout' },
            { value: 'advance-schedule', label: 'Advance schedule' },
            { value: 'other', label: 'Advance section templates' },
            { value: 'budget', label: 'Budget templates' },
          ],
        },
        cell: (value) => <KindLabel kind={value as TemplateKind} />,
      },
      {
        id: 'used',
        header: 'Used count',
        align: 'right',
        accessor: 'usedCount',
        sortable: true,
        cell: (value) => Number(value ?? 0).toLocaleString(),
      },
      {
        id: 'last',
        header: 'Last used',
        accessor: (r) => r.lastUsedAt ?? '',
        cell: (value) => (value ? rel(String(value)) : '—'),
      },
      {
        id: 'updated',
        header: 'Updated',
        accessor: 'updatedAt',
        sortable: true,
        cell: (value) => rel(String(value)),
      },
    ],
    []
  );

  return (
    <div className="space-y-4">
      {err ? <div className="rounded border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">{err}</div> : null}

      <DataTable
        rows={loading ? undefined : rows}
        rowKey={(row) => row.id}
        emptyState="No templates in this workspace yet"
        columns={columns}
        searchPlaceholder="Search templates…"
        onRowClick={(row) => setSelected(row)}
      />

      {selected ? <TemplateSlideOver template={selected} onClose={() => setSelected(null)} /> : null}
    </div>
  );
}
