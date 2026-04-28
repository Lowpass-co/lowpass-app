/**
 * Offline expense receipts queue — IndexedDB.
 */

import type { ExpenseInput } from '@/lib/api/expenses';

export type QueuedExpense = {
  id: string;
  payload: ExpenseInput;
  photoBlob: Blob;
  filename: string;
  enqueuedAt: number;
  attempts: number;
};

const DB = 'lp-expense-queue';
const STORE = 'pending';
const VERSION = 1;

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB, VERSION);
    req.onerror = () => reject(req.error ?? new Error('IndexedDB'));
    req.onsuccess = () => resolve(req.result);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) {
        db.createObjectStore(STORE, { keyPath: 'id' });
      }
    };
  });
}

export async function enqueueExpense(
  payload: ExpenseInput,
  photoBlob: Blob,
  filename: string
): Promise<void> {
  const db = await openDb();
  const row: QueuedExpense = {
    id: payload.id,
    payload,
    photoBlob,
    filename,
    enqueuedAt: Date.now(),
    attempts: 0,
  };
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite');
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.objectStore(STORE).put(row);
  });
  db.close();
}

export async function getPendingExpenses(): Promise<QueuedExpense[]> {
  const db = await openDb();
  const rows = await new Promise<QueuedExpense[]>((resolve, reject) => {
    const tx = db.transaction(STORE, 'readonly');
    const req = tx.objectStore(STORE).getAll();
    req.onsuccess = () => resolve((req.result as QueuedExpense[]) ?? []);
    req.onerror = () => reject(req.error);
  });
  db.close();
  return rows.sort((a, b) => a.enqueuedAt - b.enqueuedAt);
}

export async function markExpenseSent(id: string): Promise<void> {
  const db = await openDb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite');
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.objectStore(STORE).delete(id);
  });
  db.close();
}

export async function incrementExpenseAttempts(id: string): Promise<void> {
  const db = await openDb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite');
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    const store = tx.objectStore(STORE);
    const getReq = store.get(id);
    getReq.onsuccess = () => {
      const row = getReq.result as QueuedExpense | undefined;
      if (row) {
        row.attempts = (row.attempts ?? 0) + 1;
        store.put(row);
      }
    };
    getReq.onerror = () => reject(getReq.error);
  });
  db.close();
}
