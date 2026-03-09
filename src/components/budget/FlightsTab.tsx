'use client';

import { useState, useEffect, useCallback } from 'react';
import { Loader2, Pencil, Trash2 } from 'lucide-react';
import { formatDate } from '@/lib/utils';
import { cn } from '@/lib/utils';
import { DeleteConfirmationModal } from '@/components/ui/DeleteConfirmationModal';

/** Math spec §9: variance_pct = ((actual - proposed) / proposed) × 100; ≤0% green, 0–5% amber, >5% red. Proposed=0 → "—" or "N/A". */
function varianceDisplay(proposed: number, actual: number): { text: string; className: string } {
  const p = Number(proposed) || 0;
  const a = actual != null ? Number(actual) : null;
  if (p === 0 && (a === null || a === 0)) return { text: '—', className: 'text-lp-text-tertiary' };
  if (p === 0 && a !== null) return { text: 'N/A', className: 'text-lp-text-tertiary' };
  const diff = (a ?? 0) - p;
  const pct = p ? (diff / p) * 100 : 0;
  const varianceClass =
    pct <= 0 ? 'text-green-600 dark:text-green-400' : pct <= 5 ? 'text-amber-600 dark:text-amber-400' : 'text-red-600 dark:text-red-400';
  return {
    text: `${diff >= 0 ? '+' : ''}${diff.toLocaleString('en-GB', { minimumFractionDigits: 2 })} (${pct >= 0 ? '+' : ''}${pct.toFixed(1)}%)`,
    className: varianceClass,
  };
}

function formatTime(value: string | null): string {
  if (!value) return '—';
  if (value.includes(':')) return value.slice(0, 5);
  return value;
}

type FlightBooking = {
  id: string;
  person_name: string;
  role: string | null;
  origin_code: string | null;
  destination_code: string | null;
  departure_date: string | null;
  departure_time: string | null;
  airline: string | null;
  flight_number: string | null;
  leg_order: number;
  proposed_cost: number;
  actual_cost: number;
  confirmation: string | null;
};

export function FlightsTab({ tourId }: { tourId: string }) {
  const [loading, setLoading] = useState(true);
  const [flights, setFlights] = useState<FlightBooking[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editRow, setEditRow] = useState<Partial<FlightBooking> | null>(null);
  const [deleteModal, setDeleteModal] = useState<{ id: string; name: string } | null>(null);
  const [saving, setSaving] = useState(false);
  const [addingNew, setAddingNew] = useState(false);

  const load = useCallback(() => {
    if (!tourId) return;
    setLoading(true);
    setError(null);
    fetch(`/api/budget/flights?tour_id=${tourId}`)
      .then((r) => (r.ok ? r.json() : { flights: [] }))
      .then((data) => setFlights(data.flights ?? []))
      .catch((err) => setError(err?.message ?? 'Failed to load'))
      .finally(() => setLoading(false));
  }, [tourId]);

  useEffect(() => load(), [load]);

  const totalProposed = flights.reduce((s, f) => s + (Number(f.proposed_cost) || 0), 0);
  const totalActual = flights.reduce((s, f) => s + (Number(f.actual_cost) || 0), 0);
  const totalVariance = varianceDisplay(totalProposed, totalActual);

  const saveFlight = async (id: string, payload: Partial<FlightBooking>) => {
    setSaving(true);
    try {
      const res = await fetch('/api/budget/flights', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, ...payload }),
      });
      if (!res.ok) throw new Error('Save failed');
      setEditingId(null);
      setEditRow(null);
      load();
    } catch (e) {
      setError((e as Error)?.message ?? 'Failed to save');
    } finally {
      setSaving(false);
    }
  };

  const createFlight = async (payload: Partial<FlightBooking> & { tour_id: string; person_name: string }) => {
    setSaving(true);
    try {
      const res = await fetch('/api/budget/flights', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tour_id: tourId,
          person_name: payload.person_name?.trim() ?? '',
          role: payload.role ?? null,
          origin_code: payload.origin_code ?? null,
          destination_code: payload.destination_code ?? null,
          proposed_cost: Number(payload.proposed_cost) || 0,
          actual_cost: Number(payload.actual_cost) || 0,
          airline: payload.airline ?? null,
          flight_number: payload.flight_number ?? null,
          confirmation: payload.confirmation ?? null,
          departure_date: payload.departure_date ?? null,
          departure_time: payload.departure_time ?? null,
          leg_order: Number(payload.leg_order) || 1,
        }),
      });
      if (!res.ok) throw new Error('Create failed');
      setAddingNew(false);
      setEditRow(null);
      load();
    } catch (e) {
      setError((e as Error)?.message ?? 'Failed to create');
    } finally {
      setSaving(false);
    }
  };

  const deleteFlight = async (id: string) => {
    setSaving(true);
    try {
      const res = await fetch('/api/budget/flights', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id }),
      });
      if (!res.ok) throw new Error('Delete failed');
      setDeleteModal(null);
      load();
    } catch (e) {
      setError((e as Error)?.message ?? 'Failed to delete');
    } finally {
      setSaving(false);
    }
  };

  const sortedFlights = [...flights].sort((a, b) => {
    const dA = a.departure_date ?? '';
    const dB = b.departure_date ?? '';
    if (dA !== dB) return dA.localeCompare(dB);
    const n = (a.person_name ?? '').localeCompare(b.person_name ?? '');
    if (n !== 0) return n;
    return (a.leg_order ?? 0) - (b.leg_order ?? 0);
  });

  if (loading) {
    return (
      <div className="flex items-center gap-2 rounded-xl border border-lp-border bg-lp-surface p-8 text-lp-text-secondary">
        <Loader2 className="h-5 w-5 animate-spin" />
        Loading flights…
      </div>
    );
  }
  if (error) {
    return (
      <div className="rounded-xl border border-lp-border bg-lp-surface p-8 text-center text-red-600">
        {error}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex justify-end">
        <button
          type="button"
          onClick={() => {
            setAddingNew(true);
            setEditRow({ person_name: '', leg_order: 1, proposed_cost: 0, actual_cost: 0 });
          }}
          className="flex items-center gap-1 rounded-lg border border-lp-border bg-lp-bg px-3 py-2 text-sm font-medium text-lp-text hover:bg-lp-bg-tertiary"
        >
          Add flight
        </button>
      </div>
      <div className="rounded-xl border border-lp-border bg-lp-surface overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-lp-border bg-lp-bg-tertiary">
                <th className="text-left p-3 font-medium text-lp-text">Person</th>
                <th className="text-left p-3 font-medium text-lp-text">Role</th>
                <th className="text-left p-3 font-medium text-lp-text">Origin</th>
                <th className="text-left p-3 font-medium text-lp-text">Destination</th>
                <th className="text-left p-3 font-medium text-lp-text">Departure</th>
                <th className="text-left p-3 font-medium text-lp-text">Airline</th>
                <th className="text-left p-3 font-medium text-lp-text">Flight #</th>
                <th className="text-left p-3 font-medium text-lp-text">Leg</th>
                <th className="text-right p-3 font-medium text-lp-text">Proposed</th>
                <th className="text-right p-3 font-medium text-lp-text">Actual</th>
                <th className="text-right p-3 font-medium text-lp-text">Variance</th>
                <th className="text-left p-3 font-medium text-lp-text">Confirmation</th>
                <th className="w-24 p-3" />
              </tr>
            </thead>
            <tbody>
              {addingNew && editRow && (
                <tr className="border-b border-lp-border bg-lp-orange-subtle/30">
                  <td className="p-2">
                    <input
                      className="w-full min-w-[100px] rounded border border-lp-border bg-lp-bg px-2 py-1 text-lp-text"
                      value={editRow.person_name ?? ''}
                      onChange={(e) => setEditRow((r) => ({ ...r, person_name: e.target.value }))}
                      placeholder="Name"
                    />
                  </td>
                  <td className="p-2">
                    <input
                      className="w-full min-w-[80px] rounded border border-lp-border bg-lp-bg px-2 py-1 text-lp-text"
                      value={editRow.role ?? ''}
                      onChange={(e) => setEditRow((r) => ({ ...r, role: e.target.value || null }))}
                      placeholder="Role"
                    />
                  </td>
                  <td className="p-2">
                    <input
                      className="w-16 rounded border border-lp-border bg-lp-bg px-2 py-1 text-lp-text"
                      value={editRow.origin_code ?? ''}
                      onChange={(e) => setEditRow((r) => ({ ...r, origin_code: e.target.value || null }))}
                      placeholder="LHR"
                    />
                  </td>
                  <td className="p-2">
                    <input
                      className="w-16 rounded border border-lp-border bg-lp-bg px-2 py-1 text-lp-text"
                      value={editRow.destination_code ?? ''}
                      onChange={(e) => setEditRow((r) => ({ ...r, destination_code: e.target.value || null }))}
                      placeholder="BNA"
                    />
                  </td>
                  <td className="p-2">
                    <input
                      type="date"
                      className="rounded border border-lp-border bg-lp-bg px-2 py-1 text-lp-text"
                      value={editRow.departure_date ?? ''}
                      onChange={(e) => setEditRow((r) => ({ ...r, departure_date: e.target.value || null }))}
                    />
                    <input
                      type="time"
                      className="ml-1 w-20 rounded border border-lp-border bg-lp-bg px-2 py-1 text-lp-text"
                      value={editRow.departure_time ?? ''}
                      onChange={(e) => setEditRow((r) => ({ ...r, departure_time: e.target.value || null }))}
                    />
                  </td>
                  <td className="p-2">
                    <input
                      className="w-24 rounded border border-lp-border bg-lp-bg px-2 py-1 text-lp-text"
                      value={editRow.airline ?? ''}
                      onChange={(e) => setEditRow((r) => ({ ...r, airline: e.target.value || null }))}
                    />
                  </td>
                  <td className="p-2">
                    <input
                      className="w-20 rounded border border-lp-border bg-lp-bg px-2 py-1 text-lp-text"
                      value={editRow.flight_number ?? ''}
                      onChange={(e) => setEditRow((r) => ({ ...r, flight_number: e.target.value || null }))}
                    />
                  </td>
                  <td className="p-2">
                    <input
                      type="number"
                      min={1}
                      className="w-12 rounded border border-lp-border bg-lp-bg px-2 py-1 text-lp-text"
                      value={editRow.leg_order ?? 1}
                      onChange={(e) => setEditRow((r) => ({ ...r, leg_order: parseInt(e.target.value, 10) || 1 }))}
                    />
                  </td>
                  <td className="p-2">
                    <input
                      type="number"
                      step="0.01"
                      className="w-20 rounded border border-lp-border bg-lp-bg px-2 py-1 text-lp-text text-right"
                      value={editRow.proposed_cost ?? 0}
                      onChange={(e) => setEditRow((r) => ({ ...r, proposed_cost: parseFloat(e.target.value) || 0 }))}
                    />
                  </td>
                  <td className="p-2">
                    <input
                      type="number"
                      step="0.01"
                      className="w-20 rounded border border-lp-border bg-lp-bg px-2 py-1 text-lp-text text-right"
                      value={editRow.actual_cost ?? 0}
                      onChange={(e) => setEditRow((r) => ({ ...r, actual_cost: parseFloat(e.target.value) || 0 }))}
                    />
                  </td>
                  <td className="p-2 text-lp-text-tertiary">—</td>
                  <td className="p-2">
                    <input
                      className="w-24 rounded border border-lp-border bg-lp-bg px-2 py-1 text-lp-text"
                      value={editRow.confirmation ?? ''}
                      onChange={(e) => setEditRow((r) => ({ ...r, confirmation: e.target.value || null }))}
                    />
                  </td>
                  <td className="p-2">
                    <button
                      type="button"
                      onClick={() => createFlight({ ...editRow, tour_id: tourId, person_name: editRow.person_name ?? '' })}
                      disabled={saving || !editRow.person_name?.trim()}
                      className="text-lp-orange hover:underline disabled:opacity-50"
                    >
                      Save
                    </button>
                    <button
                      type="button"
                      onClick={() => { setAddingNew(false); setEditRow(null); }}
                      className="ml-2 text-lp-text-tertiary hover:underline"
                    >
                      Cancel
                    </button>
                  </td>
                </tr>
              )}
              {sortedFlights.map((f) => {
                const isEditing = editingId === f.id;
                const row = isEditing ? (editRow ?? f) : f;
                const variance = varianceDisplay(Number(f.proposed_cost) || 0, f.actual_cost);
                return (
                  <tr key={f.id} className="border-b border-lp-border">
                    <td className="p-3 text-lp-text">
                      {isEditing ? (
                        <input
                          className="w-full min-w-[100px] rounded border border-lp-border bg-lp-bg px-2 py-1 text-lp-text"
                          value={row.person_name ?? ''}
                          onChange={(e) => setEditRow((r) => ({ ...r, person_name: e.target.value }))}
                        />
                      ) : (
                        f.person_name
                      )}
                    </td>
                    <td className="p-3 text-lp-text-secondary">
                      {isEditing ? (
                        <input
                          className="w-full min-w-[80px] rounded border border-lp-border bg-lp-bg px-2 py-1 text-lp-text"
                          value={row.role ?? ''}
                          onChange={(e) => setEditRow((r) => ({ ...r, role: e.target.value || null }))}
                        />
                      ) : (
                        f.role ?? '—'
                      )}
                    </td>
                    <td className="p-3 text-lp-text-secondary font-mono">
                      {isEditing ? (
                        <input
                          className="w-16 rounded border border-lp-border bg-lp-bg px-2 py-1 font-mono text-lp-text"
                          value={row.origin_code ?? ''}
                          onChange={(e) => setEditRow((r) => ({ ...r, origin_code: e.target.value || null }))}
                        />
                      ) : (
                        f.origin_code ?? '—'
                      )}
                    </td>
                    <td className="p-3 text-lp-text-secondary font-mono">
                      {isEditing ? (
                        <input
                          className="w-16 rounded border border-lp-border bg-lp-bg px-2 py-1 font-mono text-lp-text"
                          value={row.destination_code ?? ''}
                          onChange={(e) => setEditRow((r) => ({ ...r, destination_code: e.target.value || null }))}
                        />
                      ) : (
                        f.destination_code ?? '—'
                      )}
                    </td>
                    <td className="p-3 text-lp-text-secondary whitespace-nowrap">
                      {isEditing ? (
                        <span className="flex items-center gap-1">
                          <input
                            type="date"
                            className="rounded border border-lp-border bg-lp-bg px-2 py-1 text-lp-text"
                            value={row.departure_date ?? ''}
                            onChange={(e) => setEditRow((r) => ({ ...r, departure_date: e.target.value || null }))}
                          />
                          <input
                            type="time"
                            className="w-20 rounded border border-lp-border bg-lp-bg px-2 py-1 text-lp-text"
                            value={row.departure_time ?? ''}
                            onChange={(e) => setEditRow((r) => ({ ...r, departure_time: e.target.value || null }))}
                          />
                        </span>
                      ) : (
                        <>
                          {f.departure_date ? formatDate(f.departure_date) : '—'}
                          {f.departure_time && <span className="ml-1">{formatTime(f.departure_time)}</span>}
                        </>
                      )}
                    </td>
                    <td className="p-3 text-lp-text-secondary">
                      {isEditing ? (
                        <input
                          className="w-24 rounded border border-lp-border bg-lp-bg px-2 py-1 text-lp-text"
                          value={row.airline ?? ''}
                          onChange={(e) => setEditRow((r) => ({ ...r, airline: e.target.value || null }))}
                        />
                      ) : (
                        f.airline ?? '—'
                      )}
                    </td>
                    <td className="p-3 text-lp-text-secondary">
                      {isEditing ? (
                        <input
                          className="w-20 rounded border border-lp-border bg-lp-bg px-2 py-1 text-lp-text"
                          value={row.flight_number ?? ''}
                          onChange={(e) => setEditRow((r) => ({ ...r, flight_number: e.target.value || null }))}
                        />
                      ) : (
                        f.flight_number ?? '—'
                      )}
                    </td>
                    <td className="p-3 text-lp-text">
                      {isEditing ? (
                        <input
                          type="number"
                          min={1}
                          className="w-12 rounded border border-lp-border bg-lp-bg px-2 py-1 text-lp-text"
                          value={row.leg_order ?? 1}
                          onChange={(e) => setEditRow((r) => ({ ...r, leg_order: parseInt(e.target.value, 10) || 1 }))}
                        />
                      ) : (
                        f.leg_order
                      )}
                    </td>
                    <td className="p-3 text-right tabular-nums text-lp-text">
                      {isEditing ? (
                        <input
                          type="number"
                          step="0.01"
                          className="w-20 rounded border border-lp-border bg-lp-bg px-2 py-1 text-right text-lp-text"
                          value={row.proposed_cost ?? 0}
                          onChange={(e) => setEditRow((r) => ({ ...r, proposed_cost: parseFloat(e.target.value) || 0 }))}
                        />
                      ) : (
                        (Number(f.proposed_cost) || 0).toLocaleString('en-GB', { minimumFractionDigits: 2 })
                      )}
                    </td>
                    <td className="p-3 text-right tabular-nums text-lp-text">
                      {isEditing ? (
                        <input
                          type="number"
                          step="0.01"
                          className="w-20 rounded border border-lp-border bg-lp-bg px-2 py-1 text-right text-lp-text"
                          value={row.actual_cost ?? 0}
                          onChange={(e) => setEditRow((r) => ({ ...r, actual_cost: parseFloat(e.target.value) || 0 }))}
                        />
                      ) : (
                        (f.actual_cost != null ? Number(f.actual_cost) : 0).toLocaleString('en-GB', { minimumFractionDigits: 2 })
                      )}
                    </td>
                    <td className={cn('p-3 text-right text-sm tabular-nums', !isEditing && variance.className)}>
                      {isEditing ? '—' : variance.text}
                    </td>
                    <td className="p-3 text-lp-text-secondary">
                      {isEditing ? (
                        <input
                          className="w-24 rounded border border-lp-border bg-lp-bg px-2 py-1 text-lp-text"
                          value={row.confirmation ?? ''}
                          onChange={(e) => setEditRow((r) => ({ ...r, confirmation: e.target.value || null }))}
                        />
                      ) : (
                        f.confirmation ?? '—'
                      )}
                    </td>
                    <td className="p-3">
                      <div className="flex items-center gap-1">
                        {isEditing ? (
                          <>
                            <button
                              type="button"
                              onClick={() => editRow && saveFlight(f.id, editRow)}
                              disabled={saving}
                              className="text-lp-orange hover:underline text-xs"
                            >
                              Save
                            </button>
                            <button
                              type="button"
                              onClick={() => { setEditingId(null); setEditRow(null); }}
                              className="text-lp-text-tertiary hover:underline text-xs"
                            >
                              Cancel
                            </button>
                          </>
                        ) : (
                          <>
                            <button
                              type="button"
                              onClick={() => { setEditingId(f.id); setEditRow({ ...f }); }}
                              className="rounded p-1 text-lp-text-tertiary hover:bg-lp-bg-tertiary hover:text-lp-text"
                              title="Edit"
                            >
                              <Pencil className="h-4 w-4" />
                            </button>
                            <button
                              type="button"
                              onClick={() => setDeleteModal({ id: f.id, name: `${f.person_name} ${f.origin_code ?? ''}–${f.destination_code ?? ''}` })}
                              className="rounded p-1 text-lp-text-tertiary hover:bg-red-500/10 hover:text-red-600"
                              title="Delete"
                            >
                              <Trash2 className="h-4 w-4" />
                            </button>
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      <div className="flex flex-wrap items-baseline gap-6 rounded-xl border border-lp-border bg-lp-surface p-4">
        <span className="font-semibold text-lp-text">
          Total Flights (Proposed) = {totalProposed.toLocaleString('en-GB', { minimumFractionDigits: 2 })}
        </span>
        <span className="font-semibold text-lp-text">
          Total Flights (Actual) = {totalActual.toLocaleString('en-GB', { minimumFractionDigits: 2 })}
        </span>
        <span className={cn('text-sm font-medium tabular-nums', totalVariance.className)}>
          Variance: {totalVariance.text}
        </span>
      </div>

      <DeleteConfirmationModal
        open={!!deleteModal}
        itemName={deleteModal?.name ?? 'Flight'}
        onClose={() => setDeleteModal(null)}
        onConfirm={async () => { if (deleteModal) await deleteFlight(deleteModal.id); }}
      />
    </div>
  );
}
