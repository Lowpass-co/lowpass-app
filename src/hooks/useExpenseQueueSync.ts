'use client';

import {
  getPendingExpenses,
  incrementExpenseAttempts,
  markExpenseSent,
  type QueuedExpense,
} from '@/lib/mobile/expense-queue';
import { useEffect, useRef } from 'react';

const MAX_ATTEMPTS = 5;
const INTERVAL_MS = 30_000;

function buildFormData(q: QueuedExpense): FormData {
  const p = q.payload;
  const fd = new FormData();
  fd.set('id', p.id);
  fd.set('tour_id', p.tour_id);
  if (p.show_id) fd.set('show_id', p.show_id);
  fd.set('amount', String(p.amount));
  fd.set('currency', p.currency);
  fd.set('category', p.category);
  if (p.description) fd.set('description', p.description);
  fd.set('spent_at', p.spent_at);
  if (p.city) fd.set('city', p.city);
  if (p.country) fd.set('country', p.country);
  if (p.person_id) fd.set('person_id', p.person_id);
  fd.set('file', q.photoBlob, q.filename);
  return fd;
}

async function flushOne(q: QueuedExpense): Promise<boolean> {
  const fd = buildFormData(q);
  const res = await fetch('/api/expenses', { method: 'POST', body: fd });
  if (!res.ok) return false;
  await markExpenseSent(q.id);
  return true;
}

/** Periodically uploads pending mobile expenses when online; also on window `online`. */
export function useExpenseQueueSync() {
  const busy = useRef(false);

  useEffect(() => {
    async function flush() {
      if (typeof navigator !== 'undefined' && !navigator.onLine) return;
      if (busy.current) return;
      busy.current = true;
      try {
        const pending = await getPendingExpenses();
        for (const q of pending) {
          if (q.attempts >= MAX_ATTEMPTS) continue;
          const ok = await flushOne(q);
          if (!ok) {
            await incrementExpenseAttempts(q.id);
          }
        }
      } finally {
        busy.current = false;
      }
    }

    void flush();
    const t = window.setInterval(() => void flush(), INTERVAL_MS);
    window.addEventListener('online', flush);
    return () => {
      window.clearInterval(t);
      window.removeEventListener('online', flush);
    };
  }, []);
}
