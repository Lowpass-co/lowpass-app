import type { Person, TourPerson } from '@/lib/types/person';

export type TourPersonnelPatch = {
  role?: string;
  employment_type?: 'staff' | 'freelance' | 'crew' | 'band' | 'mgmt' | null;
  rate_currency?: string | null;
  rate_period?: 'day' | 'week' | 'flat' | 'hour' | null;
  starts_on?: string | null;
  ends_on?: string | null;
};

type PersonRow = {
  id: string;
  workspace_id: string;
  full_name: string;
  preferred_name: string | null;
  pronouns: string | null;
  email: string | null;
  phone: string | null;
  emergency_contact: string | null;
  passport_full_name: string | null;
  passport_number: string | null;
  passport_expiry: string | null;
  passport_country: string | null;
  date_of_birth: string | null;
  dietary: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
  tour_personnel?: TourPersonRow[];
};

type TourPersonRow = {
  id: string;
  workspace_id: string;
  tour_id: string;
  person_id: string;
  role: string;
  employment_type: string | null;
  rate_currency: string | null;
  rate_period: string | null;
  starts_on: string | null;
  ends_on: string | null;
  created_at: string;
  updated_at: string;
  tour_name?: string | null;
};

function mapTourPerson(row: TourPersonRow): TourPerson {
  return {
    id: row.id,
    workspaceId: row.workspace_id,
    tourId: row.tour_id,
    personId: row.person_id,
    role: row.role,
    employmentType: row.employment_type,
    // Rates SSOT — tour_personnel.rate_amount is retired (dropped by 231); pay
    // reads personnel_rate_lines. This vestigial field is no longer sourced.
    rateAmount: null,
    rateCurrency: row.rate_currency ?? 'GBP',
    ratePeriod: row.rate_period,
    startsOn: row.starts_on,
    endsOn: row.ends_on,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    tourName: row.tour_name ?? null,
  };
}

function mapPerson(row: PersonRow): Person {
  return {
    id: row.id,
    workspaceId: row.workspace_id,
    fullName: row.full_name,
    preferredName: row.preferred_name,
    pronouns: row.pronouns,
    email: row.email,
    phone: row.phone,
    emergencyContact: row.emergency_contact,
    passportFullName: row.passport_full_name,
    passportNumber: row.passport_number,
    passportExpiry: row.passport_expiry,
    passportCountry: row.passport_country,
    dateOfBirth: row.date_of_birth,
    dietary: row.dietary,
    notes: row.notes,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    tourPersonnel: (row.tour_personnel ?? []).map(mapTourPerson),
  };
}

export async function listPersons(opts?: { tourId?: string; q?: string; limit?: number }): Promise<Person[]> {
  const params = new URLSearchParams();
  if (opts?.tourId) params.set('tour_id', opts.tourId);
  if (opts?.q?.trim()) params.set('q', opts.q.trim());
  if (opts?.limit) params.set('limit', String(opts.limit));
  const res = await fetch(`/api/persons?${params.toString()}`, { cache: 'no-store' });
  if (!res.ok) throw new Error('Failed to load persons');
  const json = (await res.json()) as { persons?: PersonRow[] };
  return (json.persons ?? []).map(mapPerson);
}

export async function getPersonById(id: string): Promise<Person | null> {
  const res = await fetch(`/api/persons/${encodeURIComponent(id)}`, { cache: 'no-store' });
  if (!res.ok) return null;
  return mapPerson((await res.json()) as PersonRow);
}

export async function searchPersons(
  query: string,
  opts?: { tourId?: string; limit?: number }
): Promise<Person[]> {
  return listPersons({ q: query, tourId: opts?.tourId, limit: opts?.limit });
}

export async function createPerson(input: Record<string, unknown>): Promise<Person> {
  const res = await fetch('/api/persons', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  });
  if (!res.ok) throw new Error('Failed to create person');
  return mapPerson((await res.json()) as PersonRow);
}

export async function updatePerson(id: string, patch: Record<string, unknown>): Promise<Person> {
  const res = await fetch(`/api/persons/${encodeURIComponent(id)}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(patch),
  });
  if (!res.ok) throw new Error('Failed to update person');
  return mapPerson((await res.json()) as PersonRow);
}

export async function deletePerson(id: string): Promise<void> {
  const res = await fetch(`/api/persons/${encodeURIComponent(id)}`, { method: 'DELETE' });
  if (!res.ok) throw new Error('Failed to delete person');
}

/** PATCH canonical tour_personnel row; returns mapped camelCase row. */
export async function updateTourPersonnel(id: string, patch: TourPersonnelPatch): Promise<TourPerson> {
  const body: Record<string, unknown> = {};
  if (patch.role !== undefined) body.role = patch.role;
  if (patch.employment_type !== undefined) body.employment_type = patch.employment_type;
  if (patch.rate_currency !== undefined) body.rate_currency = patch.rate_currency;
  if (patch.rate_period !== undefined) body.rate_period = patch.rate_period;
  if (patch.starts_on !== undefined) body.starts_on = patch.starts_on;
  if (patch.ends_on !== undefined) body.ends_on = patch.ends_on;

  const res = await fetch(`/api/tour-personnel/${encodeURIComponent(id)}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error((json as { error?: string }).error ?? 'Failed to update tour assignment');
  return mapTourPerson(json as TourPersonRow);
}

export async function deleteTourPersonnel(id: string): Promise<void> {
  const res = await fetch(`/api/tour-personnel/${encodeURIComponent(id)}`, {
    method: 'DELETE',
  });
  if (res.status === 204) return;
  const json = await res.json().catch(() => ({}));
  throw new Error((json as { error?: string }).error ?? 'Failed to remove tour assignment');
}
