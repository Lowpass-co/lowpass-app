'use client';

import { useState, useEffect, useCallback } from 'react';
import { Loader2, Pencil, Trash2, ChevronRight, Plus, X } from 'lucide-react';
import { useDetailPanel } from '@/contexts/DetailPanelContext';
import { formatDate } from '@/lib/utils';
import { cn } from '@/lib/utils';
import { DeleteConfirmationModal } from '@/components/ui/DeleteConfirmationModal';

/** Math spec §13: per_assignment_cost = nights × rate_per_night; hotel_total = sum of all assignment costs */
function totalRoomsCost(assignments: { nights: number; rate_per_night: number }[]): number {
  return (assignments ?? []).reduce((sum, a) => sum + (Number(a.nights) || 0) * (Number(a.rate_per_night) || 0), 0);
}

type HotelRoomAssignment = {
  id: string;
  hotel_booking_id: string;
  person_name: string;
  check_in: string | null;
  check_out: string | null;
  nights: number;
  room_type: string | null;
  room_number: string | null;
  confirmation: string | null;
  rate_per_night: number;
  notes: string | null;
};

type HotelBooking = {
  id: string;
  tour_id: string;
  line_item_id?: string | null;
  hotel_name: string;
  address: string | null;
  city: string | null;
  check_in_date: string | null;
  check_out_date: string | null;
  distance_to_venue: string | null;
  distance_to_airport: string | null;
  cancellation_policy: string | null;
  room_assignments?: HotelRoomAssignment[];
};

type BudgetLineItem = {
  id: string;
  category: string;
  proposed_cost: number;
  actual_cost: number;
};

export function HotelsTab({ tourId }: { tourId: string }) {
  const { openLineItem } = useDetailPanel();
  const [loading, setLoading] = useState(true);
  const [hotels, setHotels] = useState<HotelBooking[]>([]);
  const [lineItems, setLineItems] = useState<BudgetLineItem[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [editingHotel, setEditingHotel] = useState<HotelBooking | null>(null);
  const [assignmentsModalHotelId, setAssignmentsModalHotelId] = useState<string | null>(null);
  const [assignmentForm, setAssignmentForm] = useState<Partial<HotelRoomAssignment> | null>(null);
  const [deleteModal, setDeleteModal] = useState<{ kind: 'hotel' | 'assignment'; id: string; name: string } | null>(null);
  const [saving, setSaving] = useState(false);
  const [newHotelName, setNewHotelName] = useState('');
  const [addingHotel, setAddingHotel] = useState(false);

  const load = useCallback(() => {
    if (!tourId) return;
    setLoading(true);
    setError(null);
    Promise.all([
      fetch(`/api/budget/hotels?tour_id=${tourId}`).then((r) => (r.ok ? r.json() : { hotels: [] })),
      fetch(`/api/budget/line-items?tour_id=${tourId}&category=hotels`).then((r) => (r.ok ? r.json() : { line_items: [] })),
    ])
      .then(([hotelsRes, lineRes]) => {
        setHotels((hotelsRes?.hotels ?? []).map((h: HotelBooking) => ({ ...h, room_assignments: h.room_assignments ?? [] })));
        setLineItems(lineRes?.line_items ?? []);
      })
      .catch((err) => setError(err?.message ?? 'Failed to load'))
      .finally(() => setLoading(false));
  }, [tourId]);

  useEffect(() => load(), [load]);

  const totalProposedLineItems = lineItems.reduce((s, i) => s + (Number(i.proposed_cost) || 0), 0);
  const totalActualLineItems = lineItems.reduce((s, i) => s + (Number(i.actual_cost) || 0), 0);

  const saveHotel = async (payload: Partial<HotelBooking> & { id: string }) => {
    setSaving(true);
    try {
      const res = await fetch('/api/budget/hotels', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (!res.ok) throw new Error('Save failed');
      setEditingHotel(null);
      load();
    } catch (e) {
      setError((e as Error)?.message ?? 'Failed to save');
    } finally {
      setSaving(false);
    }
  };

  const createHotel = async (payload: { tour_id: string; hotel_name: string; [k: string]: unknown }) => {
    setSaving(true);
    try {
      const res = await fetch('/api/budget/hotels', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (!res.ok) throw new Error('Create failed');
      setEditingHotel(null);
      load();
    } catch (e) {
      setError((e as Error)?.message ?? 'Failed to create');
    } finally {
      setSaving(false);
    }
  };

  const deleteHotel = async (id: string) => {
    setSaving(true);
    try {
      const res = await fetch('/api/budget/hotels', {
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

  const saveAssignment = async (hotelId: string, body: Partial<HotelRoomAssignment> & { hotel_booking_id?: string }) => {
    setSaving(true);
    try {
      const payload = { ...body, hotel_booking_id: hotelId };
      if (body.id) {
        const res = await fetch('/api/budget/hotels/assignments', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ id: body.id, ...payload }),
        });
        if (!res.ok) throw new Error('Update failed');
      } else {
        const res = await fetch('/api/budget/hotels/assignments', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });
        if (!res.ok) throw new Error('Create failed');
      }
      setAssignmentForm(null);
      load();
    } catch (e) {
      setError((e as Error)?.message ?? 'Failed to save assignment');
    } finally {
      setSaving(false);
    }
  };

  const deleteAssignment = async (id: string) => {
    setSaving(true);
    try {
      const res = await fetch('/api/budget/hotels/assignments', {
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

  if (loading) {
    return (
      <div className="flex items-center gap-2 rounded-xl border border-lp-border bg-lp-surface p-8 text-lp-text-secondary">
        <Loader2 className="h-5 w-5 animate-spin" />
        Loading hotels…
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
          onClick={() => setAddingHotel(true)}
          className="flex items-center gap-1 rounded-lg border border-lp-border bg-lp-bg px-3 py-2 text-sm font-medium text-lp-text hover:bg-lp-bg-tertiary"
        >
          <Plus className="h-4 w-4" />
          Add hotel
        </button>
      </div>
      <div className="rounded-xl border border-lp-border bg-lp-surface overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-lp-border">
                <th className="text-left p-3 text-[10px] font-semibold uppercase tracking-widest text-lp-text-tertiary">Hotel Name</th>
                <th className="text-left p-3 text-[10px] font-semibold uppercase tracking-widest text-lp-text-tertiary">Address</th>
                <th className="text-left p-3 text-[10px] font-semibold uppercase tracking-widest text-lp-text-tertiary">City</th>
                <th className="text-left p-3 text-[10px] font-semibold uppercase tracking-widest text-lp-text-tertiary">Check-in / Check-out</th>
                <th className="text-left p-3 text-[10px] font-semibold uppercase tracking-widest text-lp-text-tertiary">Distance to Venue</th>
                <th className="text-left p-3 text-[10px] font-semibold uppercase tracking-widest text-lp-text-tertiary">Distance to Airport</th>
                <th className="text-left p-3 text-[10px] font-semibold uppercase tracking-widest text-lp-text-tertiary">Cancellation</th>
                <th className="text-right p-3 text-[10px] font-semibold uppercase tracking-widest text-lp-text-tertiary">Room Count</th>
                <th className="text-right p-3 text-[10px] font-semibold uppercase tracking-widest text-lp-text-tertiary">Total Rooms Cost</th>
                <th className="text-right p-3 text-[10px] font-semibold uppercase tracking-widest text-lp-text-tertiary w-32">Actions</th>
              </tr>
            </thead>
            <tbody>
              {hotels.map((hotel) => {
                const assignments = hotel.room_assignments ?? [];
                const cost = totalRoomsCost(assignments);
                const isEditing = editingHotel?.id === hotel.id;
                return (
                  <tr
                    key={hotel.id}
                    role={!isEditing && hotel.line_item_id ? 'button' : undefined}
                    tabIndex={!isEditing && hotel.line_item_id ? 0 : undefined}
                    onClick={(e) => {
                      if (isEditing) return;
                      if ((e.target as HTMLElement).closest('button, input, a, label')) return;
                      if (hotel.line_item_id) openLineItem(hotel.line_item_id);
                    }}
                    onKeyDown={(e) => {
                      if (isEditing || !hotel.line_item_id) return;
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        openLineItem(hotel.line_item_id);
                      }
                    }}
                    className={cn(
                      'border-b border-lp-border',
                      !isEditing && hotel.line_item_id && 'cursor-pointer hover:bg-lp-surface-hover'
                    )}
                  >
                      <td className="p-3 text-lp-text">
                        {isEditing ? (
                          <input
                            className="w-full max-w-[180px] rounded-md border border-lp-border bg-transparent px-2 py-1 text-sm text-lp-text focus:border-lp-orange focus:outline-none focus:ring-1 focus:ring-lp-orange/30"
                            defaultValue={editingHotel?.hotel_name}
                            onBlur={(e) => {
                              const v = e.target.value.trim();
                              if (v && editingHotel) saveHotel({ id: editingHotel.id, hotel_name: v });
                            }}
                          />
                        ) : (
                          hotel.hotel_name
                        )}
                      </td>
                      <td className="p-3 text-lp-text-secondary max-w-[160px] truncate" title={hotel.address ?? undefined}>
                        {hotel.address ?? '—'}
                      </td>
                      <td className="p-3 text-lp-text-secondary">{hotel.city ?? '—'}</td>
                      <td className="p-3 text-lp-text-secondary whitespace-nowrap">
                        {hotel.check_in_date && hotel.check_out_date
                          ? `${formatDate(hotel.check_in_date)} – ${formatDate(hotel.check_out_date)}`
                          : '—'}
                      </td>
                      <td className="p-3 text-lp-text-secondary">{hotel.distance_to_venue ?? '—'}</td>
                      <td className="p-3 text-lp-text-secondary">{hotel.distance_to_airport ?? '—'}</td>
                      <td className="p-3 text-lp-text-secondary max-w-[120px] truncate" title={hotel.cancellation_policy ?? undefined}>
                        {hotel.cancellation_policy ?? '—'}
                      </td>
                      <td className="p-3 text-right text-lp-text">{assignments.length}</td>
                      <td className="p-3 text-right font-medium text-lp-text tabular-nums">
                        {cost.toLocaleString('en-GB', { minimumFractionDigits: 2 })}
                      </td>
                      <td className="p-3">
                        <div className="flex items-center justify-end gap-1">
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              setEditingHotel(isEditing ? null : hotel);
                            }}
                            className="rounded p-1.5 text-lp-text-tertiary hover:bg-lp-bg-tertiary hover:text-lp-text"
                            title="Edit hotel"
                          >
                            <Pencil className="h-4 w-4" />
                          </button>
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              setAssignmentsModalHotelId(hotel.id);
                            }}
                            className="rounded px-2 py-1 text-xs font-medium text-lp-orange hover:bg-lp-orange-subtle"
                          >
                            View Assignments
                          </button>
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              setDeleteModal({ kind: 'hotel', id: hotel.id, name: hotel.hotel_name });
                            }}
                            className="rounded p-1.5 text-lp-text-tertiary hover:bg-red-500/10 hover:text-red-600"
                            title="Delete hotel"
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                          {hotel.line_item_id ? (
                            <ChevronRight size={14} className="text-lp-text-tertiary shrink-0 ml-0.5" aria-hidden />
                          ) : null}
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
          Total Hotels Cost (Proposed) = {totalProposedLineItems.toLocaleString('en-GB', { minimumFractionDigits: 2 })}
        </span>
        <span className="font-semibold text-lp-text">
          Total Hotels Cost (Actual) = {totalActualLineItems.toLocaleString('en-GB', { minimumFractionDigits: 2 })}
        </span>
        <p className="text-xs text-lp-text-tertiary">
          From budget line items with category &quot;hotels&quot;. Per-hotel room cost is computed from assignments (nights × rate per night).
        </p>
      </div>

      {/* Assignments modal */}
      {assignmentsModalHotelId && (() => {
        const hotel = hotels.find((h) => h.id === assignmentsModalHotelId);
        if (!hotel) return null;
        const assignments = hotel.room_assignments ?? [];
        return (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={() => setAssignmentsModalHotelId(null)}>
            <div
              className="max-h-[90vh] w-full max-w-2xl overflow-auto rounded-xl border border-lp-border bg-lp-surface p-6 shadow-xl"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-semibold text-lp-text">Room assignments – {hotel.hotel_name}</h3>
                <button
                  type="button"
                  onClick={() => setAssignmentsModalHotelId(null)}
                  className="rounded p-1 text-lp-text-tertiary hover:bg-lp-bg-tertiary"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-lp-border text-left">
                    <th className="p-2 text-[10px] font-semibold uppercase tracking-widest text-lp-text-tertiary">Person</th>
                    <th className="p-2 text-[10px] font-semibold uppercase tracking-widest text-lp-text-tertiary">Check-in / Check-out</th>
                    <th className="p-2 text-[10px] font-semibold uppercase tracking-widest text-lp-text-tertiary">Nights</th>
                    <th className="p-2 text-[10px] font-semibold uppercase tracking-widest text-lp-text-tertiary">Room Type</th>
                    <th className="p-2 text-[10px] font-semibold uppercase tracking-widest text-lp-text-tertiary">Room #</th>
                    <th className="p-2 text-[10px] font-semibold uppercase tracking-widest text-lp-text-tertiary">Rate/night</th>
                    <th className="p-2 text-[10px] font-semibold uppercase tracking-widest text-lp-text-tertiary">Confirmation</th>
                    <th className="p-2 text-[10px] font-semibold uppercase tracking-widest text-lp-text-tertiary">Notes</th>
                    <th className="p-2 w-24" />
                  </tr>
                </thead>
                <tbody>
                  {assignments.map((a) => (
                    <tr key={a.id} className="border-b border-lp-border">
                      <td className="p-2 text-lp-text">{a.person_name}</td>
                      <td className="p-2 text-lp-text-secondary">
                        {a.check_in && a.check_out ? `${formatDate(a.check_in)} – ${formatDate(a.check_out)}` : '—'}
                      </td>
                      <td className="p-2 text-lp-text">{a.nights}</td>
                      <td className="p-2 text-lp-text-secondary">{a.room_type ?? '—'}</td>
                      <td className="p-2 text-lp-text-secondary">{a.room_number ?? '—'}</td>
                      <td className="p-2 tabular-nums text-lp-text">{Number(a.rate_per_night).toLocaleString('en-GB', { minimumFractionDigits: 2 })}</td>
                      <td className="p-2 text-lp-text-secondary">{a.confirmation ?? '—'}</td>
                      <td className="p-2 text-lp-text-secondary max-w-[120px] truncate">{a.notes ?? '—'}</td>
                      <td className="p-2">
                        <button
                          type="button"
                          onClick={() => setAssignmentForm({ ...a })}
                          className="text-lp-orange hover:underline text-xs"
                        >
                          Edit
                        </button>
                        <button
                          type="button"
                          onClick={() => setDeleteModal({ kind: 'assignment', id: a.id, name: a.person_name })}
                          className="text-red-600 hover:underline text-xs ml-1"
                        >
                          Delete
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <div className="mt-4">
                <button
                  type="button"
                  onClick={() => setAssignmentForm({ hotel_booking_id: hotel.id, person_name: '', nights: 0, rate_per_night: 0 })}
                  className="flex items-center gap-1 rounded-lg border border-lp-border bg-lp-bg px-3 py-2 text-sm font-medium text-lp-text hover:bg-lp-bg-tertiary"
                >
                  <Plus className="h-4 w-4" />
                  Add assignment
                </button>
              </div>
            </div>
          </div>
        );
      })()}

      {/* Assignment form modal */}
      {assignmentForm && assignmentsModalHotelId && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50" onClick={() => setAssignmentForm(null)}>
          <div
            className="w-full max-w-md rounded-xl border border-lp-border bg-lp-surface p-6 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <h4 className="text-lg font-semibold text-lp-text mb-4">{assignmentForm.id ? 'Edit assignment' : 'Add assignment'}</h4>
            <div className="space-y-3">
              <label className="block text-sm font-medium text-lp-text">Person name</label>
              <input
                className="w-full rounded-md border border-lp-border bg-transparent px-3 py-2 text-sm text-lp-text focus:border-lp-orange focus:outline-none focus:ring-1 focus:ring-lp-orange/30"
                value={assignmentForm.person_name ?? ''}
                onChange={(e) => setAssignmentForm((f) => ({ ...f, person_name: e.target.value }))}
              />
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium text-lp-text">Check-in</label>
                  <input
                    type="date"
                    className="w-full rounded-md border border-lp-border bg-transparent px-3 py-2 text-sm text-lp-text focus:border-lp-orange focus:outline-none focus:ring-1 focus:ring-lp-orange/30"
                    value={assignmentForm.check_in ?? ''}
                    onChange={(e) => setAssignmentForm((f) => ({ ...f, check_in: e.target.value || null }))}
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-lp-text">Check-out</label>
                  <input
                    type="date"
                    className="w-full rounded-md border border-lp-border bg-transparent px-3 py-2 text-sm text-lp-text focus:border-lp-orange focus:outline-none focus:ring-1 focus:ring-lp-orange/30"
                    value={assignmentForm.check_out ?? ''}
                    onChange={(e) => setAssignmentForm((f) => ({ ...f, check_out: e.target.value || null }))}
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium text-lp-text">Nights</label>
                  <input
                    type="number"
                    min={0}
                    className="w-full rounded-md border border-lp-border bg-transparent px-3 py-2 text-sm text-lp-text focus:border-lp-orange focus:outline-none focus:ring-1 focus:ring-lp-orange/30"
                    value={assignmentForm.nights ?? 0}
                    onChange={(e) => setAssignmentForm((f) => ({ ...f, nights: parseInt(e.target.value, 10) || 0 }))}
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-lp-text">Rate per night</label>
                  <input
                    type="number"
                    step="0.01"
                    min={0}
                    className="w-full rounded-md border border-lp-border bg-transparent px-3 py-2 text-sm text-lp-text focus:border-lp-orange focus:outline-none focus:ring-1 focus:ring-lp-orange/30"
                    value={assignmentForm.rate_per_night ?? 0}
                    onChange={(e) => setAssignmentForm((f) => ({ ...f, rate_per_night: parseFloat(e.target.value) || 0 }))}
                  />
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-lp-text">Room type</label>
                <input
                  className="w-full rounded-md border border-lp-border bg-transparent px-3 py-2 text-sm text-lp-text focus:border-lp-orange focus:outline-none focus:ring-1 focus:ring-lp-orange/30"
                  value={assignmentForm.room_type ?? ''}
                  onChange={(e) => setAssignmentForm((f) => ({ ...f, room_type: e.target.value || null }))}
                  placeholder="e.g. SGL, DBL"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-lp-text">Room number</label>
                <input
                  className="w-full rounded-md border border-lp-border bg-transparent px-3 py-2 text-sm text-lp-text focus:border-lp-orange focus:outline-none focus:ring-1 focus:ring-lp-orange/30"
                  value={assignmentForm.room_number ?? ''}
                  onChange={(e) => setAssignmentForm((f) => ({ ...f, room_number: e.target.value || null }))}
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-lp-text">Confirmation #</label>
                <input
                  className="w-full rounded-md border border-lp-border bg-transparent px-3 py-2 text-sm text-lp-text focus:border-lp-orange focus:outline-none focus:ring-1 focus:ring-lp-orange/30"
                  value={assignmentForm.confirmation ?? ''}
                  onChange={(e) => setAssignmentForm((f) => ({ ...f, confirmation: e.target.value || null }))}
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-lp-text">Notes</label>
                <input
                  className="w-full rounded-md border border-lp-border bg-transparent px-3 py-2 text-sm text-lp-text focus:border-lp-orange focus:outline-none focus:ring-1 focus:ring-lp-orange/30"
                  value={assignmentForm.notes ?? ''}
                  onChange={(e) => setAssignmentForm((f) => ({ ...f, notes: e.target.value || null }))}
                />
              </div>
            </div>
            <div className="mt-6 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setAssignmentForm(null)}
                className="rounded-lg border border-lp-border px-4 py-2 text-sm font-medium text-lp-text hover:bg-lp-bg-tertiary"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => {
                  if (assignmentForm.person_name?.trim()) {
                    saveAssignment(assignmentsModalHotelId, assignmentForm);
                  }
                }}
                disabled={saving || !assignmentForm.person_name?.trim()}
                className="rounded-lg bg-lp-orange px-4 py-2 text-sm font-medium text-white hover:bg-lp-orange/90 disabled:opacity-50"
              >
                {saving ? 'Saving…' : 'Save'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Add hotel modal */}
      {addingHotel && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={() => setAddingHotel(false)}>
          <div
            className="w-full max-w-md rounded-xl border border-lp-border bg-lp-surface p-6 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <h4 className="text-lg font-semibold text-lp-text mb-4">Add hotel</h4>
            <label className="block text-sm font-medium text-lp-text mb-2">Hotel name</label>
            <input
              className="mb-4 w-full rounded-md border border-lp-border bg-transparent px-3 py-2 text-sm text-lp-text focus:border-lp-orange focus:outline-none focus:ring-1 focus:ring-lp-orange/30"
              value={newHotelName}
              onChange={(e) => setNewHotelName(e.target.value)}
              placeholder="Hotel name"
            />
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => { setAddingHotel(false); setNewHotelName(''); }}
                className="rounded-lg border border-lp-border px-4 py-2 text-sm font-medium text-lp-text hover:bg-lp-bg-tertiary"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => {
                  if (newHotelName.trim()) {
                    createHotel({ tour_id: tourId, hotel_name: newHotelName.trim() });
                    setNewHotelName('');
                    setAddingHotel(false);
                  }
                }}
                disabled={saving || !newHotelName.trim()}
                className="rounded-lg bg-lp-orange px-4 py-2 text-sm font-medium text-white hover:bg-lp-orange/90 disabled:opacity-50"
              >
                {saving ? 'Creating…' : 'Create'}
              </button>
            </div>
          </div>
        </div>
      )}

      <DeleteConfirmationModal
        open={!!deleteModal}
        itemName={deleteModal?.name ?? ''}
        onClose={() => setDeleteModal(null)}
        onConfirm={async () => {
          if (!deleteModal) return;
          if (deleteModal.kind === 'hotel') await deleteHotel(deleteModal.id);
          else await deleteAssignment(deleteModal.id);
        }}
        description={deleteModal?.kind === 'hotel' ? 'This will delete all room assignments for this hotel.' : undefined}
      />
    </div>
  );
}
