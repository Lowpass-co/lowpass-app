'use client';

import { useEffect, useMemo, useState } from 'react';
import { DataTable } from '@/components/entity/DataTable';
import { searchGear } from '@/lib/api/gear';
import type { Gear } from '@/lib/types/gear';
import GearSlideOver from '@/components/entity/gear/GearSlideOver';

type Row = Gear;

export function GearLibraryClient({ tourId }: { tourId?: string }) {
  const [query, setQuery] = useState('');
  const [rows, setRows] = useState<Row[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [ownership, setOwnership] = useState('');
  const [category, setCategory] = useState('');

  useEffect(() => {
    let cancelled = false;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLoading(true);
    void searchGear(query, { tourId, ownership: ownership || undefined, category: category || undefined, limit: 300 })
      .then((data) => !cancelled && setRows(data as Row[]))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [query, tourId, ownership, category]);

  const categories = useMemo(() => Array.from(new Set(rows.map((r) => r.category).filter(Boolean))) as string[], [rows]);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2">
        <input
          className="min-w-[240px] rounded border border-lp-border bg-transparent px-2 py-1 text-sm"
          placeholder="Search gear..."
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        <select className="rounded border border-lp-border bg-transparent px-2 py-1 text-sm" value={ownership} onChange={(e) => setOwnership(e.target.value)}>
          <option value="">All ownership</option>
          <option value="owned">Owned</option>
          <option value="sub_hired">Sub-hired</option>
          <option value="hired_to_client">Hired-to-client</option>
        </select>
        <select className="rounded border border-lp-border bg-transparent px-2 py-1 text-sm" value={category} onChange={(e) => setCategory(e.target.value)}>
          <option value="">All categories</option>
          {categories.map((c) => (
            <option key={c} value={c}>{c}</option>
          ))}
        </select>
      </div>

      <DataTable
        rows={rows}
        emptyLabel={loading ? 'Loading...' : 'No gear found'}
        onRowClick={(r) => setSelectedId(r.id)}
        columns={[
          { key: 'name', header: 'Name', render: (r) => r.name },
          { key: 'category', header: 'Category', render: (r) => r.category ?? '—' },
          { key: 'ownership', header: 'Ownership', render: (r) => String(r.ownership).replace('_', '-') },
          { key: 'cost', header: 'Hire Cost', className: 'text-right', render: (r) => r.hireCostAmount == null ? '—' : `${r.hireCostCurrency ?? 'GBP'} ${r.hireCostAmount}` },
        ]}
      />

      {selectedId && (
        <div className="fixed inset-y-0 right-0 z-50 w-[480px] max-w-[95vw] border-l border-lp-border bg-lp-surface shadow-2xl">
          <GearSlideOver id={selectedId} onClose={() => setSelectedId(null)} />
        </div>
      )}
    </div>
  );
}
