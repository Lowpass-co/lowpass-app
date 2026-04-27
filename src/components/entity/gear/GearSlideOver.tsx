// TODO(UX13): refactor to use <SlideOver> primitive from src/components/shell/SlideOver.tsx.
//   Currently rolls its own chrome (backdrop / aside / header / footer). Functionally OK but
//   skips focus trap, mobile bottom-sheet, and standard animations. UX13 (list pages re-skin)
//   will sweep this when entity surfaces touch DataTable + slide-over.

'use client';

import { useEffect, useMemo, useState } from 'react';
import { Loader2, X } from 'lucide-react';
import Image from 'next/image';
import { getGearById, updateGear } from '@/lib/api/gear';
import type { Gear, TourGear } from '@/lib/types/gear';

type GearWithTours = Gear & { tourGear?: TourGear[] };

export default function GearSlideOver({ id, onClose }: { id: string; onClose: () => void }) {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [gear, setGear] = useState<GearWithTours | null>(null);
  const [newTourId, setNewTourId] = useState('');

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    void getGearById(id)
      .then((row) => {
        if (!cancelled) setGear(row as GearWithTours | null);
      })
      .catch((e) => !cancelled && setError((e as Error).message))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [id]);

  const ownership = gear?.ownership ?? 'owned';
  const showCost = ownership !== 'owned';

  const save = async (patch: Record<string, unknown>) => {
    if (!gear) return;
    setSaving(true);
    try {
      const updated = (await updateGear(gear.id, patch)) as GearWithTours;
      setGear(updated);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSaving(false);
    }
  };

  const tourUsage = useMemo(() => gear?.tourGear ?? [], [gear?.tourGear]);

  if (loading) {
    return (
      <div className="p-6 text-sm text-lp-text-secondary flex items-center gap-2">
        <Loader2 className="h-4 w-4 animate-spin" /> Loading gear...
      </div>
    );
  }
  if (!gear) return <div className="p-6 text-sm text-red-500">{error ?? 'Gear not found'}</div>;

  const handleOwnershipChange = async (nextOwnership: 'owned' | 'sub_hired' | 'hired_to_client') => {
    if (!gear) return;
    if (nextOwnership === gear.ownership) return;
    if (nextOwnership === 'owned') {
      const ok = window.confirm(
        'Set ownership to owned and unlink derived budget hire rows for linked tours?'
      );
      if (!ok) return;
    }
    const syncTourIds = (gear.tourGear ?? []).map((tg) => tg.tourId);
    await save({ ownership: nextOwnership, sync_tour_ids: syncTourIds });
  };

  const updateTourGear = async (nextTourGear: TourGear[]) => {
    const syncTourIds = nextTourGear.map((tg) => tg.tourId);
    await save({
      tour_gear: nextTourGear.map((tg) => ({
        id: tg.id,
        tour_id: tg.tourId,
        tour_ownership: tg.tourOwnership,
        tour_hire_cost_amount: tg.tourHireCostAmount,
        tour_hire_cost_currency: tg.tourHireCostCurrency,
        tour_hire_cost_period: tg.tourHireCostPeriod,
        starts_on: tg.startsOn,
        ends_on: tg.endsOn,
        quantity: tg.quantity,
        notes: tg.notes,
      })),
      sync_tour_ids: syncTourIds,
    });
  };

  return (
    <div className="h-full overflow-y-auto bg-lp-surface">
      <div className="sticky top-0 z-10 flex items-center justify-between border-b border-lp-border bg-lp-surface px-4 py-3">
        <h3 className="text-sm font-semibold text-lp-text">Gear</h3>
        <button type="button" onClick={onClose} className="rounded p-1 hover:bg-lp-bg-tertiary">
          <X className="h-4 w-4" />
        </button>
      </div>

      <div className="space-y-6 p-4">
        {error && <div className="text-xs text-red-500">{error}</div>}

        <section className="space-y-2">
          <h4 className="text-xs uppercase tracking-wider text-lp-text-secondary">Identity</h4>
          <input className="w-full rounded border border-lp-border bg-transparent px-2 py-1 text-sm" defaultValue={gear.name} onBlur={(e) => void save({ name: e.target.value })} />
          <input className="w-full rounded border border-lp-border bg-transparent px-2 py-1 text-sm" placeholder="Category" defaultValue={gear.category ?? ''} onBlur={(e) => void save({ category: e.target.value || null })} />
          <input className="w-full rounded border border-lp-border bg-transparent px-2 py-1 text-sm" placeholder="Manufacturer" defaultValue={gear.manufacturer ?? ''} onBlur={(e) => void save({ manufacturer: e.target.value || null })} />
          <input className="w-full rounded border border-lp-border bg-transparent px-2 py-1 text-sm" placeholder="Model" defaultValue={gear.model ?? ''} onBlur={(e) => void save({ model: e.target.value || null })} />
          <input className="w-full rounded border border-lp-border bg-transparent px-2 py-1 text-sm" placeholder="Serial" defaultValue={gear.serialNumber ?? ''} onBlur={(e) => void save({ serial_number: e.target.value || null })} />
        </section>

        <section className="space-y-2">
          <h4 className="text-xs uppercase tracking-wider text-lp-text-secondary">Ownership</h4>
          <select className="w-full rounded border border-lp-border bg-transparent px-2 py-1 text-sm" value={ownership} onChange={(e) => void handleOwnershipChange(e.target.value as 'owned' | 'sub_hired' | 'hired_to_client')}>
            <option value="owned">Owned</option>
            <option value="sub_hired">Sub-hired</option>
            <option value="hired_to_client">Hired-to-client</option>
          </select>
          {ownership !== 'owned' && (
            <input className="w-full rounded border border-lp-border bg-transparent px-2 py-1 text-sm" placeholder="Owner label" defaultValue={gear.ownerLabel ?? ''} onBlur={(e) => void save({ owner_label: e.target.value || null })} />
          )}
        </section>

        {showCost && (
          <section className="space-y-2">
            <h4 className="text-xs uppercase tracking-wider text-lp-text-secondary">Cost</h4>
            <input className="w-full rounded border border-lp-border bg-transparent px-2 py-1 text-sm" type="number" defaultValue={gear.hireCostAmount ?? 0} onBlur={(e) => void save({ hire_cost_amount: Number(e.target.value) || 0 })} />
            <input className="w-full rounded border border-lp-border bg-transparent px-2 py-1 text-sm" placeholder="Currency" defaultValue={gear.hireCostCurrency ?? 'GBP'} onBlur={(e) => void save({ hire_cost_currency: e.target.value || 'GBP' })} />
            <select className="w-full rounded border border-lp-border bg-transparent px-2 py-1 text-sm" value={gear.hireCostPeriod ?? ''} onChange={(e) => void save({ hire_cost_period: e.target.value || null })}>
              <option value="">Select period</option>
              <option value="day">Day</option>
              <option value="week">Week</option>
              <option value="flat">Flat</option>
            </select>
          </section>
        )}

        <section className="space-y-2">
          <h4 className="text-xs uppercase tracking-wider text-lp-text-secondary">Image</h4>
          <input className="w-full rounded border border-lp-border bg-transparent px-2 py-1 text-sm" placeholder="Image URL" defaultValue={gear.imageUrl ?? ''} onBlur={(e) => void save({ image_url: e.target.value || null })} />
          {gear.imageUrl ? (
            <div className="relative h-44 w-full overflow-hidden rounded border border-lp-border">
              <Image src={gear.imageUrl} alt={gear.name} fill className="object-contain" />
            </div>
          ) : null}
        </section>

        <section className="space-y-2">
          <h4 className="text-xs uppercase tracking-wider text-lp-text-secondary">Tour usage</h4>
          <div className="space-y-1">
            {tourUsage.length === 0 && <div className="text-xs text-lp-text-secondary">No linked tours.</div>}
            {tourUsage.map((tg) => (
              <div key={tg.id} className="rounded border border-lp-border p-2 text-xs text-lp-text-secondary space-y-1">
                <div>Tour: {tg.tourId}</div>
                <div className="grid grid-cols-3 gap-2">
                  <input
                    className="rounded border border-lp-border bg-transparent px-2 py-1"
                    type="number"
                    defaultValue={tg.quantity}
                    onBlur={(e) => {
                      const qty = Math.max(1, Number(e.target.value) || 1);
                      void updateTourGear(
                        tourUsage.map((row) => (row.id === tg.id ? { ...row, quantity: qty } : row))
                      );
                    }}
                  />
                  <select
                    className="rounded border border-lp-border bg-transparent px-2 py-1"
                    defaultValue={tg.tourOwnership ?? ''}
                    onChange={(e) => {
                      const val = e.target.value as 'owned' | 'sub_hired' | 'hired_to_client' | '';
                      void updateTourGear(
                        tourUsage.map((row) =>
                          row.id === tg.id ? { ...row, tourOwnership: val || null } : row
                        )
                      );
                    }}
                  >
                    <option value="">inherit</option>
                    <option value="owned">owned</option>
                    <option value="sub_hired">sub-hired</option>
                    <option value="hired_to_client">hired-to-client</option>
                  </select>
                  <input
                    className="rounded border border-lp-border bg-transparent px-2 py-1"
                    type="number"
                    defaultValue={tg.tourHireCostAmount ?? gear.hireCostAmount ?? 0}
                    onBlur={(e) => {
                      const amount = Number(e.target.value) || 0;
                      void updateTourGear(
                        tourUsage.map((row) =>
                          row.id === tg.id ? { ...row, tourHireCostAmount: amount } : row
                        )
                      );
                    }}
                  />
                </div>
              </div>
            ))}
            <div className="flex gap-2">
              <input
                className="w-full rounded border border-lp-border bg-transparent px-2 py-1 text-xs"
                placeholder="Tour ID to link"
                value={newTourId}
                onChange={(e) => setNewTourId(e.target.value)}
              />
              <button
                type="button"
                className="rounded border border-lp-border px-2 py-1 text-xs hover:bg-lp-bg-tertiary"
                onClick={() => {
                  const tid = newTourId.trim();
                  if (!tid) return;
                  if (tourUsage.some((t) => t.tourId === tid)) return;
                  const next: TourGear[] = [
                    ...tourUsage,
                    {
                      id: `new-${tid}`,
                      workspaceId: gear.workspaceId,
                      tourId: tid,
                      gearId: gear.id,
                      tourOwnership: null,
                      tourHireCostAmount: gear.hireCostAmount,
                      tourHireCostCurrency: gear.hireCostCurrency,
                      tourHireCostPeriod: gear.hireCostPeriod,
                      startsOn: null,
                      endsOn: null,
                      quantity: 1,
                      notes: null,
                      createdAt: new Date().toISOString(),
                    },
                  ];
                  void updateTourGear(next);
                  setNewTourId('');
                }}
              >
                Add
              </button>
            </div>
          </div>
        </section>

        <section className="space-y-2">
          <h4 className="text-xs uppercase tracking-wider text-lp-text-secondary">Notes</h4>
          <textarea className="w-full rounded border border-lp-border bg-transparent px-2 py-1 text-sm" rows={4} defaultValue={gear.notes ?? ''} onBlur={(e) => void save({ notes: e.target.value || null })} />
        </section>

        <section className="space-y-1 text-xs text-lp-text-secondary">
          <h4 className="uppercase tracking-wider">Activity</h4>
          <p>Created: {new Date(gear.createdAt).toLocaleString()}</p>
          <p>Updated: {new Date(gear.updatedAt).toLocaleString()}</p>
          <p>{saving ? 'Saving...' : 'All changes saved'}</p>
        </section>
      </div>
    </div>
  );
}
