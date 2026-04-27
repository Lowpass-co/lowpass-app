// TODO(UX13): refactor to use <SlideOver> primitive from src/components/shell/SlideOver.tsx.
//   Currently rolls its own chrome (backdrop / aside / header / footer). Functionally OK but
//   skips focus trap, mobile bottom-sheet, and standard animations. UX13 (list pages re-skin)
//   will sweep this when entity surfaces touch DataTable + slide-over.

'use client';

import { useCallback, useEffect, useState } from 'react';
import { Loader2, Plus, X } from 'lucide-react';
import { getRoomById, updateRoom } from '@/lib/api/rooms';
import type { Room } from '@/lib/types/room';

type AssignmentRow = {
  id: string;
  person_name: string | null;
  check_in: string | null;
  check_out: string | null;
  room_type: string | null;
  room_number: string | null;
  rate_per_night: number;
  notes: string | null;
};

export default function RoomSlideOver({ id, onClose }: { id: string; onClose: () => void }) {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [room, setRoom] = useState<Room | null>(null);
  const [assignments, setAssignments] = useState<AssignmentRow[]>([]);
  const [newAssignment, setNewAssignment] = useState({
    person_name: '',
    check_in: '',
    check_out: '',
  });
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await getRoomById(id);
      setRoom(data);
      if (data?.hotelId) {
        const res = await fetch(`/api/budget/hotels/assignments?hotel_booking_id=${encodeURIComponent(data.hotelId)}`);
        const json = await res.json();
        const rows = (json.assignments ?? []) as AssignmentRow[];
        setAssignments(rows.filter((a) => a.room_number === data.roomNumber));
      }
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    void load();
  }, [load]);

  const saveField = async (payload: Record<string, unknown>) => {
    if (!room) return;
    setSaving(true);
    setError(null);
    try {
      const updated = await updateRoom(room.id, payload);
      setRoom(updated);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSaving(false);
    }
  };

  const addAssignment = async () => {
    if (!room || !room.hotelId || !newAssignment.person_name.trim()) return;
    setSaving(true);
    try {
      const res = await fetch('/api/budget/hotels/assignments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          hotel_booking_id: room.hotelId,
          person_name: newAssignment.person_name.trim(),
          check_in: newAssignment.check_in || null,
          check_out: newAssignment.check_out || null,
          room_type: room.roomType,
          room_number: room.roomNumber,
          rate_per_night: room.costAmount ?? 0,
          notes: room.notes ?? null,
        }),
      });
      if (!res.ok) throw new Error('Failed to add assignment');
      setNewAssignment({ person_name: '', check_in: '', check_out: '' });
      await load();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="p-6 text-sm text-lp-text-secondary flex items-center gap-2">
        <Loader2 className="h-4 w-4 animate-spin" /> Loading room...
      </div>
    );
  }

  if (!room) {
    return <div className="p-6 text-sm text-red-500">Room not found</div>;
  }

  return (
    <div className="h-full overflow-y-auto bg-lp-surface">
      <div className="sticky top-0 z-10 flex items-center justify-between border-b border-lp-border bg-lp-surface px-4 py-3">
        <h3 className="text-sm font-semibold text-lp-text">Room</h3>
        <button type="button" onClick={onClose} className="rounded p-1 hover:bg-lp-bg-tertiary">
          <X className="h-4 w-4" />
        </button>
      </div>

      <div className="space-y-6 p-4">
        {error && <div className="text-xs text-red-500">{error}</div>}

        <section className="space-y-2">
          <h4 className="text-xs uppercase tracking-wider text-lp-text-secondary">Hotel</h4>
          <input className="w-full rounded border border-lp-border bg-transparent px-2 py-1 text-sm" defaultValue={room.hotel?.name ?? ''} onBlur={(e) => void saveField({ hotel_name: e.target.value })} />
          <input className="w-full rounded border border-lp-border bg-transparent px-2 py-1 text-sm" defaultValue={room.hotel?.address ?? ''} placeholder="Address" onBlur={(e) => void saveField({ hotel_address: e.target.value })} />
          <input className="w-full rounded border border-lp-border bg-transparent px-2 py-1 text-sm" defaultValue={room.hotel?.phone ?? ''} placeholder="Phone" onBlur={(e) => void saveField({ hotel_phone: e.target.value })} />
          <input className="w-full rounded border border-lp-border bg-transparent px-2 py-1 text-sm" defaultValue={room.hotel?.confirmationNumber ?? ''} placeholder="Confirmation #" onBlur={(e) => void saveField({ confirmation_number: e.target.value })} />
        </section>

        <section className="space-y-2">
          <h4 className="text-xs uppercase tracking-wider text-lp-text-secondary">Room</h4>
          <input className="w-full rounded border border-lp-border bg-transparent px-2 py-1 text-sm" defaultValue={room.roomNumber ?? ''} placeholder="Room number" onBlur={(e) => void saveField({ room_number: e.target.value })} />
          <input className="w-full rounded border border-lp-border bg-transparent px-2 py-1 text-sm" defaultValue={room.roomType ?? ''} placeholder="Room type" onBlur={(e) => void saveField({ room_type: e.target.value })} />
          <input className="w-full rounded border border-lp-border bg-transparent px-2 py-1 text-sm" defaultValue={room.costAmount ?? 0} type="number" placeholder="Cost" onBlur={(e) => void saveField({ cost_amount: Number(e.target.value) || 0 })} />
          <input className="w-full rounded border border-lp-border bg-transparent px-2 py-1 text-sm" defaultValue={room.bedCount ?? ''} type="number" placeholder="Beds" onBlur={(e) => void saveField({ bed_count: Number(e.target.value) || null })} />
        </section>

        <section className="space-y-2">
          <h4 className="text-xs uppercase tracking-wider text-lp-text-secondary">Assignments</h4>
          <div className="space-y-1">
            {assignments.map((a) => (
              <div key={a.id} className="rounded border border-lp-border px-2 py-1 text-xs text-lp-text-secondary">
                {a.person_name ?? 'Unknown'} · {a.check_in ?? '?'} to {a.check_out ?? '?'}
              </div>
            ))}
          </div>
          <div className="grid grid-cols-3 gap-2">
            <input className="rounded border border-lp-border bg-transparent px-2 py-1 text-sm" placeholder="Person name" value={newAssignment.person_name} onChange={(e) => setNewAssignment((s) => ({ ...s, person_name: e.target.value }))} />
            <input className="rounded border border-lp-border bg-transparent px-2 py-1 text-sm" type="date" value={newAssignment.check_in} onChange={(e) => setNewAssignment((s) => ({ ...s, check_in: e.target.value }))} />
            <input className="rounded border border-lp-border bg-transparent px-2 py-1 text-sm" type="date" value={newAssignment.check_out} onChange={(e) => setNewAssignment((s) => ({ ...s, check_out: e.target.value }))} />
          </div>
          <button type="button" onClick={() => void addAssignment()} className="inline-flex items-center gap-1 rounded border border-lp-border px-2 py-1 text-xs hover:bg-lp-bg-tertiary">
            <Plus className="h-3.5 w-3.5" /> Add assignment
          </button>
        </section>

        <section className="space-y-2">
          <h4 className="text-xs uppercase tracking-wider text-lp-text-secondary">Notes</h4>
          <textarea className="w-full rounded border border-lp-border bg-transparent px-2 py-1 text-sm" rows={4} defaultValue={room.notes ?? ''} onBlur={(e) => void saveField({ notes: e.target.value })} />
        </section>

        <section className="space-y-1 text-xs text-lp-text-secondary">
          <h4 className="uppercase tracking-wider">Activity</h4>
          <p>Created: {new Date(room.createdAt).toLocaleString()}</p>
          <p>Updated: {new Date(room.updatedAt).toLocaleString()}</p>
        </section>

        <div className="text-xs text-lp-text-secondary">{saving ? 'Saving...' : 'All changes saved'}</div>
      </div>
    </div>
  );
}
