'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Loader2, ExternalLink, X } from 'lucide-react';
import Link from 'next/link';
import Image from 'next/image';
import {
  getGearById,
  linkGearToRentalInventory,
  searchUnlinkedRentalInventory,
  updateGear,
} from '@/lib/api/gear';
import type { Gear, TourGear } from '@/lib/types/gear';
import type { RentalInventory } from '@/lib/types/rental';
import { SlideOver } from '@/components/shell/SlideOver';

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
    if (!gear) return;
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

  const title = loading ? 'Gear' : (gear?.name ?? 'Gear');

  return (
    <SlideOver
      open
      onClose={onClose}
      title={title}
      subtitle={
        <span className="text-xs" style={{ color: 'var(--lp-text-secondary)' }}>
          Canonical gear record
        </span>
      }
      width="wide"
      backdrop
      footer={
        <div className="flex items-center justify-end gap-2">
          <button type="button" className="rounded-md border border-lp-border px-3 py-2 text-sm text-lp-text" onClick={onClose}>
            Close
          </button>
        </div>
      }
    >
      <div className="space-y-6">
        {loading && (
          <div className="flex items-center gap-2 text-sm text-lp-text-secondary">
            <Loader2 className="h-4 w-4 animate-spin" />
            Loading gear...
          </div>
        )}
        {!loading && !gear && <div className="text-sm text-red-500">{error ?? 'Gear not found'}</div>}
        {!loading && gear && (
          <>
            {error && <div className="text-xs text-red-500">{error}</div>}

            <section className="space-y-2">
              <h4 className="text-xs uppercase tracking-wider text-lp-text-secondary">Identity</h4>
              <input className="w-full rounded border border-lp-border bg-transparent px-2 py-1 text-sm" defaultValue={gear.name} onBlur={(e) => void save({ name: e.target.value })} />
              <input
                className="w-full rounded border border-lp-border bg-transparent px-2 py-1 text-sm"
                placeholder="Category"
                defaultValue={gear.category ?? ''}
                onBlur={(e) => void save({ category: e.target.value || null })}
              />
              <input
                className="w-full rounded border border-lp-border bg-transparent px-2 py-1 text-sm"
                placeholder="Manufacturer"
                defaultValue={gear.manufacturer ?? ''}
                onBlur={(e) => void save({ manufacturer: e.target.value || null })}
              />
              <input
                className="w-full rounded border border-lp-border bg-transparent px-2 py-1 text-sm"
                placeholder="Model"
                defaultValue={gear.model ?? ''}
                onBlur={(e) => void save({ model: e.target.value || null })}
              />
              <input
                className="w-full rounded border border-lp-border bg-transparent px-2 py-1 text-sm"
                placeholder="Serial"
                defaultValue={gear.serialNumber ?? ''}
                onBlur={(e) => void save({ serial_number: e.target.value || null })}
              />
            </section>

            <section className="space-y-2">
              <h4 className="text-xs uppercase tracking-wider text-lp-text-secondary">Ownership</h4>
              <select className="w-full rounded border border-lp-border bg-transparent px-2 py-1 text-sm" value={ownership} onChange={(e) => void handleOwnershipChange(e.target.value as 'owned' | 'sub_hired' | 'hired_to_client')}>
                <option value="owned">Owned</option>
                <option value="sub_hired">Sub-hired</option>
                <option value="hired_to_client">Hired-to-client</option>
              </select>
              {ownership !== 'owned' && (
                <input
                  className="w-full rounded border border-lp-border bg-transparent px-2 py-1 text-sm"
                  placeholder="Owner label"
                  defaultValue={gear.ownerLabel ?? ''}
                  onBlur={(e) => void save({ owner_label: e.target.value || null })}
                />
              )}
            </section>

            {showCost && (
              <section className="space-y-2">
                <h4 className="text-xs uppercase tracking-wider text-lp-text-secondary">Cost</h4>
                <input
                  className="w-full rounded border border-lp-border bg-transparent px-2 py-1 text-sm"
                  type="number"
                  defaultValue={gear.hireCostAmount ?? 0}
                  onBlur={(e) => void save({ hire_cost_amount: Number(e.target.value) || 0 })}
                />
                <input
                  className="w-full rounded border border-lp-border bg-transparent px-2 py-1 text-sm"
                  placeholder="Currency"
                  defaultValue={gear.hireCostCurrency ?? 'GBP'}
                  onBlur={(e) => void save({ hire_cost_currency: e.target.value || 'GBP' })}
                />
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
                            tourUsage.map((row) => (row.id === tg.id ? { ...row, tourOwnership: val || null } : row))
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

            <RentalInventoryLinkSection
              gearId={gear.id}
              rentalInventoryId={gear.rentalInventoryId}
              onChange={(updated) => setGear(updated)}
            />

            <section className="space-y-2">
              <h4 className="text-xs uppercase tracking-wider text-lp-text-secondary">Notes</h4>
              <textarea
                className="w-full rounded border border-lp-border bg-transparent px-2 py-1 text-sm"
                rows={4}
                defaultValue={gear.notes ?? ''}
                onBlur={(e) => void save({ notes: e.target.value || null })}
              />
            </section>

            <section className="space-y-1 text-xs text-lp-text-secondary">
              <h4 className="uppercase tracking-wider">Activity</h4>
              <p>Created: {new Date(gear.createdAt).toLocaleString()}</p>
              <p>Updated: {new Date(gear.updatedAt).toLocaleString()}</p>
              <p>{saving ? 'Saving...' : 'All changes saved'}</p>
            </section>
          </>
        )}
      </div>
    </SlideOver>
  );
}

/**
 * UX21 — Rental inventory link section inside GearSlideOver.
 * - When linked: shows the link with a deep-link to /equipment and an Unlink button.
 * - When unlinked: shows a debounced picker over the workspace's unlinked
 *   rental_inventory rows. Selecting one calls linkGearToRentalInventory.
 */
function RentalInventoryLinkSection({
  gearId,
  rentalInventoryId,
  onChange,
}: {
  gearId: string;
  rentalInventoryId: string | null;
  onChange: (updated: Gear & { tourGear?: TourGear[] }) => void;
}) {
  const [pickerQuery, setPickerQuery] = useState('');
  const [results, setResults] = useState<RentalInventory[]>([]);
  const [searching, setSearching] = useState(false);
  const [linkErr, setLinkErr] = useState<string | null>(null);
  const [linking, setLinking] = useState(false);

  const runSearch = useCallback((q: string) => {
    setSearching(true);
    setLinkErr(null);
    void searchUnlinkedRentalInventory(q, { limit: 20 })
      .then((items) => setResults(items))
      .catch((e) => setLinkErr((e as Error).message))
      .finally(() => setSearching(false));
  }, []);

  // Debounced search when picker is open (rentalInventoryId is null).
  useEffect(() => {
    if (rentalInventoryId) return;
    const t = window.setTimeout(() => runSearch(pickerQuery.trim()), 220);
    return () => window.clearTimeout(t);
  }, [rentalInventoryId, pickerQuery, runSearch]);

  const link = useCallback(
    async (rentalInvId: string | null) => {
      setLinking(true);
      setLinkErr(null);
      try {
        const updated = await linkGearToRentalInventory(gearId, rentalInvId);
        onChange(updated);
      } catch (e) {
        setLinkErr((e as Error).message);
      } finally {
        setLinking(false);
      }
    },
    [gearId, onChange],
  );

  return (
    <section className="space-y-2">
      <h4 className="text-xs uppercase tracking-wider text-lp-text-secondary">
        Rental inventory link
      </h4>

      {rentalInventoryId ? (
        <div className="space-y-2">
          <div className="rounded border border-lp-border bg-lp-bg-tertiary/40 px-3 py-2 text-xs">
            <p className="text-lp-text-secondary">
              Linked to a rental inventory item. The Channel List picker will surface this gear
              from the rental house source.
            </p>
            <p className="mt-1 font-mono text-[10px] text-lp-text-tertiary">{rentalInventoryId}</p>
          </div>
          <div className="flex items-center gap-2">
            <Link
              href="/equipment"
              className="inline-flex items-center gap-1 rounded border border-lp-border px-2 py-1 text-xs text-lp-text-secondary hover:border-lp-orange hover:text-lp-orange"
            >
              <ExternalLink className="h-3 w-3" /> Open /equipment
            </Link>
            <button
              type="button"
              disabled={linking}
              onClick={() => void link(null)}
              className="inline-flex items-center gap-1 rounded border border-lp-border px-2 py-1 text-xs text-lp-text-secondary hover:border-red-500 hover:text-red-500 disabled:opacity-50"
            >
              <X className="h-3 w-3" /> Unlink
            </button>
          </div>
        </div>
      ) : (
        <div className="space-y-2">
          <p className="text-xs text-lp-text-secondary">
            Link this canonical gear to its underlying rental_inventory row.
          </p>
          <input
            type="text"
            value={pickerQuery}
            onChange={(e) => setPickerQuery(e.target.value)}
            placeholder="Search rental inventory…"
            className="w-full rounded border border-lp-border bg-transparent px-2 py-1 text-sm"
          />
          <div className="max-h-44 overflow-y-auto rounded border border-lp-border">
            {searching && results.length === 0 ? (
              <div className="px-3 py-2 text-xs text-lp-text-tertiary">Searching…</div>
            ) : results.length === 0 ? (
              <div className="px-3 py-2 text-xs text-lp-text-tertiary">
                No unlinked rental items match.
              </div>
            ) : (
              <ul className="divide-y divide-lp-border">
                {results.map((r) => (
                  <li key={r.id}>
                    <button
                      type="button"
                      disabled={linking}
                      onClick={() => void link(r.id)}
                      className="flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-xs hover:bg-lp-bg-tertiary/40 disabled:opacity-50"
                    >
                      <span className="min-w-0 truncate">
                        <span className="font-medium text-lp-text">{r.name}</span>
                        {r.category ? (
                          <span className="ml-2 text-lp-text-secondary">· {r.category}</span>
                        ) : null}
                      </span>
                      {r.dayRate != null ? (
                        <span className="shrink-0 text-lp-text-tertiary tabular-nums">
                          £{r.dayRate}/day
                        </span>
                      ) : null}
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      )}

      {linkErr ? <p className="text-xs text-red-500">{linkErr}</p> : null}
    </section>
  );
}
