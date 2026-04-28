/** Canonical expense (mobile receipts + entity registry). Mirrors `public.expenses`. */

export interface Expense {
  id: string;
  workspace_id: string;
  tour_id: string;
  show_id: string | null;
  amount: number;
  currency: string;
  category: string;
  description: string | null;
  spent_at: string;
  city: string | null;
  country: string | null;
  receipt_url: string | null;
  receipt_filename: string | null;
  submitted_by: string | null;
  submitted_at: string;
  person_id: string | null;
  status: string;
  notes: string | null;
  created_at: string;
  updated_at: string;
}
