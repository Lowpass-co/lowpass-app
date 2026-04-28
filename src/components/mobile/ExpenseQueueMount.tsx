'use client';

import { useExpenseQueueSync } from '@/hooks/useExpenseQueueSync';

/** Runs background sync for offline expense queue (mount once in app shell). */
export function ExpenseQueueMount() {
  useExpenseQueueSync();
  return null;
}
