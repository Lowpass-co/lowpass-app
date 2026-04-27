import type { Room } from '@/lib/types/room';

type RoomRow = {
  id: string;
  workspace_id: string;
  hotel_id: string;
  room_number: string | null;
  room_type: string | null;
  cost_amount: number | null;
  cost_currency: string | null;
  bed_count: number | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
  hotels?: {
    id: string;
    name: string;
    address: string | null;
    city: string | null;
    phone: string | null;
    confirmation_number: string | null;
  } | null;
};

function mapRoom(row: RoomRow): Room {
  return {
    id: row.id,
    workspaceId: row.workspace_id,
    hotelId: row.hotel_id,
    roomNumber: row.room_number,
    roomType: row.room_type,
    costAmount: row.cost_amount == null ? null : Number(row.cost_amount),
    costCurrency: row.cost_currency ?? 'GBP',
    bedCount: row.bed_count,
    notes: row.notes,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    hotel: row.hotels
      ? {
          id: row.hotels.id,
          name: row.hotels.name,
          address: row.hotels.address,
          city: row.hotels.city,
          phone: row.hotels.phone,
          confirmationNumber: row.hotels.confirmation_number,
        }
      : undefined,
  };
}

export async function searchRooms(query: string, tourId?: string, limit = 25): Promise<Room[]> {
  const params = new URLSearchParams();
  if (query) params.set('q', query);
  if (tourId) params.set('tour_id', tourId);
  params.set('limit', String(limit));
  const res = await fetch(`/api/rooms?${params.toString()}`, { cache: 'no-store' });
  if (!res.ok) throw new Error('Failed to search rooms');
  const json = (await res.json()) as { rooms?: RoomRow[] };
  return (json.rooms ?? []).map(mapRoom);
}

export async function getRoomById(id: string): Promise<Room | null> {
  const res = await fetch(`/api/rooms/${id}`, { cache: 'no-store' });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error('Failed to fetch room');
  const json = (await res.json()) as RoomRow;
  return mapRoom(json);
}

export async function updateRoom(id: string, payload: Record<string, unknown>): Promise<Room> {
  const res = await fetch(`/api/rooms/${id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  if (!res.ok) throw new Error('Failed to update room');
  const json = (await res.json()) as RoomRow;
  return mapRoom(json);
}
