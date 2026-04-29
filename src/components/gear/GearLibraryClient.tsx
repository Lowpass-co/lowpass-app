'use client';

import { useEffect, useMemo, useState } from 'react';
import { DataTable } from '@/components/data-table/DataTable';
import type { ColumnDef } from '@/components/data-table/types';
import { searchGear, updateGear } from '@/lib/api/gear';
import type { Gear } from '@/lib/types/gear';
import GearSlideOver from '@/components/entity/gear/GearSlideOver';

type Row = Gear;

export function GearLibraryClient({ tourId }: { tourId?: string }) {
  const [query] = useState('');
  const [rows, setRows] = useState<Row[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    let cancelled = false;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLoading(true);
    void searchGear(query, { tourId, limit: 300 })
      .then((data) => !cancelled && setRows(data as Row[]))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [query, tourId]);

  const categories = useMemo(() => Array.from(new Set(rows.map((r) => r.category).filter(Boolean))) as string[], [rows]);

  const columns = useMemo<ColumnDef<Row>[]>(
    () => [
      { id: 'name', header: 'Name', accessor: 'name', sortable: true, frozen: true },
      {
        id: 'category',
        header: 'Category',
        accessor: (r) => r.category ?? '',
        sortable: true,
        filter: { kind: 'select', options: categories.map((c) => ({ value: c, label: c })) },
        cell: (value) => String(value || '—'),
      },
      {
        id: 'ownership',
        header: 'Ownership',
        accessor: (r) => String(r.ownership),
        sortable: true,
        filter: {
          kind: 'select',
          options: [
            { value: 'owned', label: 'owned' },
            { value: 'sub_hired', label: 'sub_hired' },
            { value: 'hired_to_client', label: 'hired_to_client' },
          ],
        },
        cell: (value) => String(value).replaceAll('_', '-'),
      },
      {
        id: 'cost',
        header: 'Hire Cost',
        accessor: (r) => r.hireCostAmount ?? 0,
        align: 'right',
        sortable: true,
        cell: (_, r) =>
          r.hireCostAmount == null ? '—' : `${r.hireCostCurrency ?? 'GBP'} ${r.hireCostAmount.toLocaleString()}`,
      },
    ],
    [categories]
  );

  const bulkSetOwnership = async () => {
    if (selectedIds.length === 0) return;
    const picked = window.prompt('Set ownership for selected rows (owned | sub_hired | hired_to_client)', '')?.trim();
    if (!picked || !['owned', 'sub_hired', 'hired_to_client'].includes(picked)) return;
    await Promise.all(selectedIds.map((id) => updateGear(id, { ownership: picked })));
    const refreshed = (await searchGear(query, { tourId, limit: 300 })) as Row[];
    setRows(refreshed);
  };

  const bulkAddToCurrentTour = async () => {
    if (!tourId || selectedIds.length === 0) return;
    await Promise.all(
      selectedIds.map((id) =>
        updateGear(id, {
          tour_gear: [{ tour_id: tourId, quantity: 1 }],
          sync_tour_id: tourId,
        })
      )
    );
    const refreshed = (await searchGear(query, { tourId, limit: 300 })) as Row[];
    setRows(refreshed);
  };

  return (
    <div className="space-y-4">
      <DataTable
        rows={loading ? undefined : rows}
        rowKey={(row) => row.id}
        columns={columns}
        searchPlaceholder="Search gear…"
        searchable
        selectable
        selectedIds={selectedIds}
        onSelectionChange={setSelectedIds}
        selectionActions={
          <div className="flex items-center gap-2">
            <button type="button" className="rounded border border-lp-border px-2 py-1 text-xs" onClick={() => void bulkSetOwnership()}>
              Set ownership for selection
            </button>
            {tourId ? (
              <button type="button" className="rounded border border-lp-border px-2 py-1 text-xs" onClick={() => void bulkAddToCurrentTour()}>
                Add to current tour
              </button>
            ) : null}
          </div>
        }
        onRowClick={(r) => setSelectedId(r.id)}
        emptyState="No gear found"
      />

      {selectedId && (
        <div className="fixed inset-y-0 right-0 z-50 w-[480px] max-w-[95vw] border-l border-lp-border bg-lp-surface shadow-2xl">
          <GearSlideOver id={selectedId} onClose={() => setSelectedId(null)} />
        </div>
      )}
    </div>
  );
}
