import { getRoomById, searchRooms } from '@/lib/api/rooms';
import { registerEntity } from './registry';

registerEntity({
  kind: 'room',
  fetchById: getRoomById,
  search: async (query: string, opts?: { tourId?: string; limit?: number }) =>
    searchRooms(query, opts?.tourId, opts?.limit ?? 25),
  getLabel: (r) => {
    const hotel = r.hotel?.name ?? 'Hotel';
    const room = r.roomNumber ? `Room ${r.roomNumber}` : (r.roomType ?? 'Room');
    return `${hotel} · ${room}`;
  },
  getSecondary: (r) =>
    `${r.roomType ?? 'Type TBD'}${r.costAmount != null ? ` · ${r.costCurrency} ${r.costAmount}` : ''}`,
  SlideOverContent: () => import('@/components/entity/room/RoomSlideOver'),
});
