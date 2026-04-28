/** IndexedDB cache for file blobs viewed on mobile (max ~50 MB per blob). */

const DB = 'lp-mobile-file-cache';
const STORE = 'blobs';
const VERSION = 1;
export const FILE_CACHE_MAX_BYTES = 50 * 1024 * 1024;

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB, VERSION);
    req.onerror = () => reject(req.error ?? new Error('IndexedDB'));
    req.onsuccess = () => resolve(req.result);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) {
        db.createObjectStore(STORE, { keyPath: 'key' });
      }
    };
  });
}

export type CachedFileRecord = {
  key: string;
  blob: Blob;
  mimeType: string | null;
  savedAt: number;
};

export async function putFileBlob(key: string, blob: Blob, mimeType: string | null): Promise<boolean> {
  if (blob.size > FILE_CACHE_MAX_BYTES) return false;
  try {
    const db = await openDb();
    const row: CachedFileRecord = {
      key,
      blob,
      mimeType,
      savedAt: Date.now(),
    };
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE, 'readwrite');
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
      tx.objectStore(STORE).put(row);
    });
    db.close();
    return true;
  } catch {
    return false;
  }
}

export async function getFileBlob(key: string): Promise<CachedFileRecord | null> {
  try {
    const db = await openDb();
    const record = await new Promise<CachedFileRecord | undefined>((resolve, reject) => {
      const tx = db.transaction(STORE, 'readonly');
      const req = tx.objectStore(STORE).get(key);
      req.onsuccess = () => resolve(req.result as CachedFileRecord | undefined);
      req.onerror = () => reject(req.error);
    });
    db.close();
    return record ?? null;
  } catch {
    return null;
  }
}

export async function hasFileBlob(key: string): Promise<boolean> {
  const row = await getFileBlob(key);
  return !!row;
}
