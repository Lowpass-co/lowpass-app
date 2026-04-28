import type { Expense } from '@/lib/types/expense';

export type ExpenseInput = {
  id: string;
  tour_id: string;
  show_id?: string | null;
  amount: number;
  currency: string;
  category: string;
  description?: string | null;
  spent_at: string;
  city?: string | null;
  country?: string | null;
  person_id?: string | null;
};

/** For slide-over / command palette search (server-backed). Requires a tour scope. */
export async function searchExpenses(
  query: string,
  opts?: { tourId?: string; limit?: number }
): Promise<Expense[]> {
  const q = query.trim();
  if (q.length < 1) return [];
  if (!opts?.tourId) return [];
  const params = new URLSearchParams();
  params.set('tour_id', opts.tourId);
  params.set('q', q);
  if (opts?.limit) params.set('limit', String(opts.limit));
  const res = await fetch(`/api/expenses?${params}`, { cache: 'no-store' });
  if (!res.ok) return [];
  const j = (await res.json()) as { expenses?: Expense[] };
  return j.expenses ?? [];
}

export async function getExpenseById(id: string): Promise<Expense | null> {
  const res = await fetch(`/api/expenses/${encodeURIComponent(id)}`, { cache: 'no-store' });
  if (!res.ok) return null;
  const j = (await res.json()) as { expense: Expense };
  return j.expense ?? null;
}
