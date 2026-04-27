import type { Hotel } from '@/lib/types/hotel';

type HotelRow = {
  id: string;
  workspace_id: string;
  tour_id: string;
  name: string;
  address: string | null;
  city: string | null;
  country: string | null;
  phone: string | null;
  confirmation_number: string | null;
  check_in_at: string | null;
  check_out_at: string | null;
  show_id: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
};

function mapHotel(row: HotelRow): Hotel {
  return {
    id: row.id,
    workspaceId: row.workspace_id,
    tourId: row.tour_id,
    name: row.name,
    address: row.address,
    city: row.city,
    country: row.country,
    phone: row.phone,
    confirmationNumber: row.confirmation_number,
    checkInAt: row.check_in_at,
    checkOutAt: row.check_out_at,
    showId: row.show_id,
    notes: row.notes,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export async function listHotels(tourId: string): Promise<Hotel[]> {
  const res = await fetch(`/api/rooms?tour_id=${encodeURIComponent(tourId)}&group=hotel`, {
    cache: 'no-store',
  });
  if (!res.ok) throw new Error('Failed to load hotels');
  const json = (await res.json()) as { hotels?: HotelRow[] };
  return (json.hotels ?? []).map(mapHotel);
}
