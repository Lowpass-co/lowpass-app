export type Room = {
  id: string;
  workspaceId: string;
  hotelId: string;
  roomNumber: string | null;
  roomType: string | null;
  costAmount: number | null;
  costCurrency: string;
  bedCount: number | null;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
  hotel?: {
    id: string;
    name: string;
    address: string | null;
    city: string | null;
    phone: string | null;
    confirmationNumber: string | null;
  };
};
