export type TourPerson = {
  id: string;
  workspaceId: string;
  tourId: string;
  personId: string;
  role: string;
  employmentType: string | null;
  rateAmount: number | null;
  rateCurrency: string;
  ratePeriod: string | null;
  startsOn: string | null;
  endsOn: string | null;
  createdAt: string;
  updatedAt: string;
  tourName?: string | null;
};

export type Person = {
  id: string;
  workspaceId: string;
  fullName: string;
  preferredName: string | null;
  pronouns: string | null;
  email: string | null;
  phone: string | null;
  emergencyContact: string | null;
  passportFullName: string | null;
  passportNumber: string | null;
  passportExpiry: string | null;
  passportCountry: string | null;
  dateOfBirth: string | null;
  dietary: string | null;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
  tourPersonnel?: TourPerson[];
};
