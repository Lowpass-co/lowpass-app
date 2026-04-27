'use client';

import { useMemo, useState } from 'react';
import dynamic from 'next/dynamic';
import { Search } from 'lucide-react';
import type { Person } from '@/lib/types/person';
import { DataTable } from '@/components/entity/DataTable';

const PersonSlideOver = dynamic(() => import('@/components/entity/person/PersonSlideOver'), { ssr: false });

export function PersonLibraryClient({ initial }: { initial: Person[] }) {
  const [rows] = useState(initial);
  const [query, setQuery] = useState('');
  const [activePersonId, setActivePersonId] = useState<string | null>(null);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter(
      (p) =>
        p.fullName.toLowerCase().includes(q) ||
        (p.preferredName ?? '').toLowerCase().includes(q) ||
        (p.email ?? '').toLowerCase().includes(q)
    );
  }, [rows, query]);

  const columns = useMemo(
    () => [
      { key: 'name', header: 'Name', render: (p: Person) => p.preferredName ?? p.fullName },
      { key: 'full', header: 'Legal Name', render: (p: Person) => p.fullName },
      { key: 'email', header: 'Email', render: (p: Person) => p.email ?? '—' },
      { key: 'phone', header: 'Phone', render: (p: Person) => p.phone ?? '—' },
    ],
    []
  );

  return (
    <div className="space-y-4">
      <div className="relative max-w-md">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-lp-text-tertiary" />
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search person..."
          className="w-full rounded-lg border border-lp-border bg-lp-surface py-2 pl-9 pr-3 text-sm text-lp-text outline-none focus:border-lp-orange"
        />
      </div>
      <DataTable
        columns={columns}
        rows={filtered}
        emptyLabel="No persons found"
        onRowClick={(p) => setActivePersonId(p.id)}
      />
      {activePersonId && (
        <PersonSlideOver
          id={activePersonId}
          onClose={() => {
            setActivePersonId(null);
          }}
        />
      )}
    </div>
  );
}
