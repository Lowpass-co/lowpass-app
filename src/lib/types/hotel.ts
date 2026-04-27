export type Hotel = {
  id: string;
  workspaceId: string;
  tourId: string;
  name: string;
  address: string | null;
  city: string | null;
  country: string | null;
  phone: string | null;
  confirmationNumber: string | null;
  checkInAt: string | null;
  checkOutAt: string | null;
  showId: string | null;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
};
