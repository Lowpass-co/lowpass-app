/* ============================================
   LOWPASS — Equipment / Inventory Tab
   ============================================ */

'use client';

import { useState } from 'react';
import { Plus, Pencil, Trash2, Search } from 'lucide-react';
import { cn } from '@/lib/utils';
import { createClient } from '@/lib/supabase-client';
import { InventoryModal } from './InventoryModal';
import { CATEGORIES, fmtUSD, type RentalInventoryItem } from './types';

interface Props {
  userId: string;
  inventory: RentalInventoryItem[];
  setInventory: (items: RentalInventoryItem[]) => void;
}

export function InventoryTab({ userId, inventory, setInventory }: Props) {
  const [search, setSearch]   = useState('');
  const [catFilter, setCat]   = useState('');
  const [modalOpen, setModal] = useState(false);
  const [editing, setEditing] = useState<RentalInventoryItem | null>(null);

  const supabase = createClient();

  const filtered = inventory.filter(i => {
    const q = search.toLowerCase();
    const matchQ = !q || (i.name?.toLowerCase().includes(q)) || (i.serial_number?.toLowerCase().includes(q)) || (i.category?.toLowerCase().includes(q));
    const matchC = !catFilter || i.category === catFilter;
    return matchQ && matchC;
  });

  function openAdd()  { setEditing(null); setModal(true); }
  function openEdit(item: RentalInventoryItem) { setEditing(item); setModal(true); }

  async function handleDelete(item: RentalInventoryItem) {
    if (!confirm(`Delete "${item.name}"?\n\nItems in use on a job cannot be deleted.`)) return;
    const { error } = await supabase.from('rental_inventory').delete().eq('id', item.id);
    if (error) {
      if (error.code === '23503') alert('This item is currently assigned to a job. Remove it from all jobs first.');
      else alert('Delete failed: ' + error.message);
      return;
    }
    setInventory(inventory.filter(i => i.id !== item.id));
  }

  function onSave(saved: RentalInventoryItem) {
    const existing = inventory.find(i => i.id === saved.id);
    if (existing) setInventory(inventory.map(i => i.id === saved.id ? saved : i));
    else setInventory([...inventory, saved].sort((a, b) => a.name.localeCompare(b.name)));
    setModal(false);
  }

  return (
    <>
      {/* Controls row */}
      <div className="flex items-center gap-3 flex-wrap">
        <div className="relative flex-1 min-w-[180px] max-w-xs">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2" style={{ color: 'var(--lp-text-tertiary)' }} />
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search inventory…"
            className="w-full rounded-lg border py-2 pl-8 pr-3 text-sm"
            style={{
              backgroundColor: 'var(--lp-surface)',
              borderColor: 'var(--lp-border)',
              color: 'var(--lp-text)',
            }}
          />
        </div>
        <select
          value={catFilter}
          onChange={e => setCat(e.target.value)}
          className="rounded-lg border px-3 py-2 text-sm"
          style={{ backgroundColor: 'var(--lp-surface)', borderColor: 'var(--lp-border)', color: 'var(--lp-text)' }}
        >
          <option value="">All categories</option>
          {CATEGORIES.map(c => <option key={c}>{c}</option>)}
        </select>
        <span className="ml-auto text-xs" style={{ color: 'var(--lp-text-tertiary)' }}>
          {inventory.length} item{inventory.length !== 1 ? 's' : ''}
        </span>
        <button
          onClick={openAdd}
          className="flex items-center gap-2 rounded-lg px-4 py-2 text-xs font-bold uppercase tracking-wider text-white transition-colors"
          style={{ backgroundColor: '#FF4500' }}
          onMouseOver={e => (e.currentTarget.style.backgroundColor = '#E63E00')}
          onMouseOut={e => (e.currentTarget.style.backgroundColor = '#FF4500')}
        >
          <Plus size={14} strokeWidth={2.5} /> Add Item
        </button>
      </div>

      {/* Table */}
      <div
        className="overflow-hidden rounded-xl border"
        style={{ borderColor: 'var(--lp-border)', backgroundColor: 'var(--lp-surface)' }}
      >
        {filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 gap-3">
            <div className="text-3xl">📦</div>
            <p className="text-sm font-medium" style={{ color: 'var(--lp-text-secondary)' }}>
              {inventory.length === 0 ? 'No inventory yet' : 'No items match that search'}
            </p>
            {inventory.length === 0 && (
              <button
                onClick={openAdd}
                className="mt-1 text-xs font-semibold"
                style={{ color: '#FF4500' }}
              >
                Add your first item →
              </button>
            )}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr style={{ borderBottom: '1px solid var(--lp-border)', backgroundColor: 'var(--lp-bg-secondary)' }}>
                  {['', 'Name', 'Category', 'Serial No.', 'Origin', 'Weight', 'Purchase Cost', 'Day Rate', ''].map((h, i) => (
                    <th
                      key={i}
                      className={cn('px-4 py-3 text-left text-xs font-extrabold uppercase tracking-wider', i === 0 && 'w-14', i === 8 && 'w-20 text-right')}
                      style={{ color: 'var(--lp-text-tertiary)' }}
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filtered.map((item, idx) => (
                  <tr
                    key={item.id}
                    className="transition-colors"
                    style={{ borderBottom: idx < filtered.length - 1 ? '1px solid var(--lp-border-light)' : 'none' }}
                    onMouseOver={e => (e.currentTarget.style.backgroundColor = 'var(--lp-surface-hover)')}
                    onMouseOut={e => (e.currentTarget.style.backgroundColor = 'transparent')}
                  >
                    {/* Thumbnail */}
                    <td className="px-4 py-2.5">
                      {item.image_url ? (
                        <img
                          src={item.image_url}
                          alt=""
                          className="h-10 w-10 rounded-lg object-cover"
                          style={{ border: '1px solid var(--lp-border)' }}
                          onError={e => {
                            e.currentTarget.style.display = 'none';
                            (e.currentTarget.nextElementSibling as HTMLElement)!.style.display = 'flex';
                          }}
                        />
                      ) : null}
                      <div
                        className="h-10 w-10 rounded-lg items-center justify-center text-base"
                        style={{ backgroundColor: 'var(--lp-bg-secondary)', display: item.image_url ? 'none' : 'flex', border: '1px solid var(--lp-border)' }}
                      >
                        📦
                      </div>
                    </td>
                    {/* Name */}
                    <td className="px-4 py-2.5">
                      <div className="font-semibold" style={{ color: 'var(--lp-text)' }}>{item.name}</div>
                      {item.notes && (
                        <div className="mt-0.5 text-xs truncate max-w-[220px]" style={{ color: 'var(--lp-text-tertiary)' }}>
                          {item.notes}
                        </div>
                      )}
                    </td>
                    {/* Category */}
                    <td className="px-4 py-2.5">
                      {item.category ? (
                        <span
                          className="inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium"
                          style={{ backgroundColor: 'rgba(255,69,0,0.08)', color: '#FF4500' }}
                        >
                          {item.category}
                        </span>
                      ) : <span style={{ color: 'var(--lp-text-tertiary)' }}>—</span>}
                    </td>
                    {/* Serial */}
                    <td className="px-4 py-2.5 font-mono text-xs" style={{ color: 'var(--lp-text-secondary)' }}>
                      {item.serial_number || <span style={{ color: 'var(--lp-text-tertiary)' }}>—</span>}
                    </td>
                    {/* Origin */}
                    <td className="px-4 py-2.5 text-sm" style={{ color: 'var(--lp-text-secondary)' }}>
                      {item.country_of_origin || <span style={{ color: 'var(--lp-text-tertiary)' }}>—</span>}
                    </td>
                    {/* Weight */}
                    <td className="px-4 py-2.5 text-sm" style={{ color: 'var(--lp-text-secondary)' }}>
                      {item.weight_kg != null ? `${item.weight_kg} kg` : <span style={{ color: 'var(--lp-text-tertiary)' }}>—</span>}
                    </td>
                    {/* Purchase cost */}
                    <td className="px-4 py-2.5 text-sm" style={{ color: 'var(--lp-text-secondary)' }}>
                      {fmtUSD(item.purchase_cost)}
                    </td>
                    {/* Day rate */}
                    <td className="px-4 py-2.5">
                      <span className="font-semibold" style={{ color: 'var(--lp-text)' }}>
                        {fmtUSD(item.day_rate)}<span className="text-xs font-normal ml-0.5" style={{ color: 'var(--lp-text-tertiary)' }}>/day</span>
                      </span>
                    </td>
                    {/* Actions */}
                    <td className="px-4 py-2.5 text-right">
                      <div className="flex justify-end gap-1">
                        <button
                          onClick={() => openEdit(item)}
                          className="rounded-md p-1.5 transition-colors"
                          style={{ color: 'var(--lp-text-tertiary)' }}
                          onMouseOver={e => (e.currentTarget.style.color = 'var(--lp-text)')}
                          onMouseOut={e => (e.currentTarget.style.color = 'var(--lp-text-tertiary)')}
                          title="Edit"
                        >
                          <Pencil size={14} />
                        </button>
                        <button
                          onClick={() => handleDelete(item)}
                          className="rounded-md p-1.5 transition-colors"
                          style={{ color: 'var(--lp-text-tertiary)' }}
                          onMouseOver={e => (e.currentTarget.style.color = '#EF4444')}
                          onMouseOut={e => (e.currentTarget.style.color = 'var(--lp-text-tertiary)')}
                          title="Delete"
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {modalOpen && (
        <InventoryModal
          userId={userId}
          editing={editing}
          onSave={onSave}
          onClose={() => setModal(false)}
        />
      )}
    </>
  );
}
