// On-device store for downloaded audio, in IndexedDB. (Cache Storage would be
// simpler but only exists on https/localhost, so it would break downloads when
// the app is opened over plain http on a LAN address.)

const DB_NAME = "shubhu-offline";
const STORE = "audio";

interface StoredAudio {
  id: string;
  blob: Blob;
  savedAt: number;
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === "undefined") {
      reject(new Error("Offline storage is not available in this browser."));
      return;
    }
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE, { keyPath: "id" });
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error ?? new Error("Could not open offline storage."));
  });
}

async function run<T>(mode: IDBTransactionMode, fn: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const db = await openDb();
  try {
    return await new Promise<T>((resolve, reject) => {
      const tx = db.transaction(STORE, mode);
      const req = fn(tx.objectStore(STORE));
      tx.oncomplete = () => resolve(req.result);
      tx.onerror = () => reject(tx.error ?? new Error("Offline storage failed."));
      tx.onabort = () => reject(tx.error ?? new Error("Offline storage ran out of space."));
    });
  } finally {
    db.close();
  }
}

export async function saveOfflineAudio(id: string, blob: Blob): Promise<void> {
  await run("readwrite", (s) => s.put({ id, blob, savedAt: Date.now() } satisfies StoredAudio));
  // Ask the browser not to evict downloads under storage pressure (best effort).
  try {
    await navigator.storage?.persist?.();
  } catch {}
}

export async function getOfflineAudio(id: string): Promise<Blob | null> {
  const row = (await run("readonly", (s) => s.get(id))) as StoredAudio | undefined;
  return row?.blob ?? null;
}

export async function removeOfflineAudio(id: string): Promise<void> {
  await run("readwrite", (s) => s.delete(id));
}

export async function clearOfflineAudio(): Promise<void> {
  await run("readwrite", (s) => s.clear());
}

/** Ids of every song stored on this device, with when each was saved. */
export async function listOfflineAudio(): Promise<{ id: string; savedAt: number }[]> {
  const rows = (await run("readonly", (s) => s.getAll())) as StoredAudio[];
  return rows.map((r) => ({ id: r.id, savedAt: r.savedAt }));
}
