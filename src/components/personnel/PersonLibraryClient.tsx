'use client';

import { useMemo } from 'react';
import type { Person } from '@/lib/types/person';
import { DataTable } from '@/components/data-table/DataTable';
import type { ColumnDef } from '@/components/data-table/types';
import { useEntityRouting } from '@/components/entity/EntityRoutingContext';

export type PersonLibraryRow = Person & {
  lastTouredAt: string | null;
  totalTours: number;
};

function formatDate(value: string | null) {
  if (!value) return '—';
  const dt = new Date(value);
  if (Number.isNaN(dt.getTime())) return '—';
  return dt.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
}

export function PersonLibraryClient({ initial }: { initial: PersonLibraryRow[] }) {
  const entityRouting = useEntityRouting();

  const columns = useMemo<ColumnDef<PersonLibraryRow>[]>(
    () => [
      {
        id: 'name',
        header: 'Name',
        accessor: (p) => p.preferredName ?? p.fullName,
        sortable: true,
        frozen: true,
      },
      {
        id: 'last_toured',
        header: 'Last toured',
        accessor: (p) => p.lastTouredAt ?? '',
        sortable: true,
        cell: (value) => formatDate((value as string) || null),
      },
      {
        id: 'total_tours',
        header: 'Total tours',
        accessor: 'totalTours',
        align: 'right',
        sortable: true,
        cell: (value) => Number(value ?? 0).toLocaleString(),
      },
      {
        id: 'email',
        header: 'Email',
        accessor: (p) => p.email ?? '',
        cell: (value) => String(value || '—'),
      },
    ],
    []
  );

  return (
    <DataTable<PersonLibraryRow>
      rows={initial}
      columns={columns}
      rowKey={(row) => row.id}
      searchPlaceholder="Search people…"
      onRowClick={(row) => entityRouting.open({ kind: 'person', id: row.id })}
      emptyState="No persons found"
    />
  );
}
