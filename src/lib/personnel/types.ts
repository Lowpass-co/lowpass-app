/* ============================================
   LOWPASS — Personnel UI types (Sprint 9 §6)

   Shared types between the Operations Personnel page client
   components and the API route shapes. Mirrors the JSON
   responses in src/app/api/tours/[id]/personnel/<sub>/route.ts.
   ============================================ */

export type PersonnelStatus =
  | 'confirmed'
  | 'tentative'
  | 'awaiting_contract'
  | 'cancelled'
  | 'fired';

export interface PersonnelListItem {
  /** tour_personnel.id */
  id: string;
  /** persons.id (== personnel.id by convention). */
  person_id: string;
  workspace_id: string;
  display_name: string;
  email: string | null;
  phone: string | null;
  role: string;
  employment_type: string | null;
  rate_amount: number | null;
  rate_currency: string | null;
  rate_period: string | null;
  starts_on: string | null;
  ends_on: string | null;
  status: PersonnelStatus;
  canonical_person_id: string | null;
  tags: string[];
}

export interface PersonnelListResponse {
  personnel: PersonnelListItem[];
}

export interface PersonnelSearchHit {
  id: string;
  display_name: string;
  email: string | null;
  phone: string | null;
}

export interface PersonnelSearchResponse {
  persons: PersonnelSearchHit[];
}

export interface ConflictRow {
  workspace_id: string;
  workspace_name: string;
  tour_id: string;
  tour_name: string;
  /** Sprint 9 §7.3 — role on the conflicting tour. Required by
   *  ConflictBanner copy ("…as Sound Engineer in WorkspaceX"). */
  role: string;
  start_date: string | null;
  end_date: string | null;
  status: string;
}

export interface ConflictsResponse {
  by_canonical: Record<string, ConflictRow[]>;
  by_email: Record<string, ConflictRow[]>;
}

export interface MyScheduleShow {
  routing_id: string;
  date: string;
  city: string;
  venue_name: string | null;
  day_type: string;
  in_window: boolean;
}

export interface MyScheduleResponse {
  tour: {
    id: string;
    name: string;
    start_date: string | null;
    end_date: string | null;
  };
  person: { id: string; display_name: string };
  assignment: {
    role: string;
    starts_on: string | null;
    ends_on: string | null;
    status: string;
  } | null;
  pay: {
    rate_amount: number | null;
    rate_currency: string | null;
    rate_period: string | null;
    days_in_window: number;
    total_expected: number | null;
  };
  shows: MyScheduleShow[];
}
