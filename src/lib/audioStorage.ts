/**
 * Storage abstraction for downloaded audio.
 *
 * The current implementation uses IndexedDB because it works on plain HTTP
 * LAN addresses and can keep real Blob bytes. A future Capacitor build can
 * provide another implementation of `AudioStorageAdapter` without changing
 * the download manager, PlayerContext, or any UI component.
 *
 * Schema note: this reuses the existing `shubhu-offline` / `audio` object
 * store from `offlineAudio.ts`. Version 2 only adds a companion `collections`
 * store; the original `audio` store, its keys and every Blob are untouched.
 * Extra metadata fields remain optional so old rows keep loading.
 */

export type DownloadGroupKind = "album" | "playlist";
export type DownloadCollectionKind = "album" | "playlist" | "songs";

/**
 * Ordered, offline-safe metadata for one downloaded collection.
 *
 * Only track ids are shared with this record — the audio Blob stays in the
 * existing `audio` store, keyed by track id. Two collections can therefore
 * reference the same stored file without duplicating bytes.
 */
export interface DownloadCollectionTrackMeta {
  id: string;
  title: string;
  artist: string;
  album: string;
  coverUrl: string;
  duration: number;
  youtubeId?: string;
  groupIndex?: number;
  /** Membership removals that must not be undone by legacy-record recovery. */
  excludedTrackIds?: string[];
}

export interface DownloadCollectionRecord {
  id: string;
  kind: DownloadCollectionKind;
  name: string;
  artworkUrl?: string;
  author?: string;
  description?: string;
  trackIds: string[];
  trackMetas: DownloadCollectionTrackMeta[];
  excludedTrackIds?: string[];
  createdAt: number;
  updatedAt: number;
}

export interface StoredAudioRecord {
  id: string;
  blob: Blob;
  savedAt: number;
  size: number;
  mimeType: string;
  sourceId?: string;
  title?: string;
  artist?: string;
  coverUrl?: string;
  duration?: number;
  album?: string;
  youtubeId?: string;
  groupKind?: DownloadGroupKind;
  groupId?: string;
  groupTitle?: string;
  groupIndex?: number;
  groupTotal?: number;
}

export interface AudioStorageAdapter {
  save(record: StoredAudioRecord): Promise<void>;
  get(id: string): Promise<StoredAudioRecord | null>;
  list(): Promise<StoredAudioRecord[]>;
  remove(id: string): Promise<void>;
  clear(): Promise<void>;
  estimate(): Promise<{ usage: number; quota: number } | null>;
}

export interface CollectionStorageAdapter {
  save(record: DownloadCollectionRecord): Promise<void>;
  get(id: string): Promise<DownloadCollectionRecord | null>;
  list(): Promise<DownloadCollectionRecord[]>;
  remove(id: string): Promise<void>;
  clear(): Promise<void>;
}

const DB_NAME = "shubhu-offline";
const STORE = "audio";
const COLLECTION_STORE = "collections";
// Version 2 adds only a new object store. The existing `audio` store, its keys
// and every stored Blob are left untouched, so old downloads keep working.
const DB_VERSION = 2;

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === "undefined") {
      reject(new Error("Offline storage is not available in this browser."));
      return;
    }
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) {
        db.createObjectStore(STORE, { keyPath: "id" });
      }
      if (!db.objectStoreNames.contains(COLLECTION_STORE)) {
        db.createObjectStore(COLLECTION_STORE, { keyPath: "id" });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error ?? new Error("Could not open offline storage."));
    req.onblocked = () => reject(new Error("Offline storage is blocked by another tab."));
  });
}

async function runInStore<T>(
  storeName: string,
  mode: IDBTransactionMode,
  fn: (store: IDBObjectStore) => IDBRequest,
): Promise<T> {
  const db = await openDb();
  try {
    return await new Promise<T>((resolve, reject) => {
      const tx = db.transaction(storeName, mode);
      const req = fn(tx.objectStore(storeName));
      tx.oncomplete = () => resolve(req.result as T);
      tx.onerror = () => reject(tx.error ?? new Error("Offline storage failed."));
      tx.onabort = () => reject(tx.error ?? new Error("Offline storage was aborted."));
    });
  } finally {
    db.close();
  }
}

async function run<T>(mode: IDBTransactionMode, fn: (store: IDBObjectStore) => IDBRequest): Promise<T> {
  return runInStore<T>(STORE, mode, fn);
}

function normalize(row: Partial<StoredAudioRecord> | undefined): StoredAudioRecord | null {
  if (!row?.id || !(row.blob instanceof Blob)) return null;
  return {
    id: row.id,
    blob: row.blob,
    savedAt: row.savedAt ?? Date.now(),
    size: row.size ?? row.blob.size,
    mimeType: row.mimeType ?? row.blob.type ?? "application/octet-stream",
    sourceId: row.sourceId,
    title: row.title,
    artist: row.artist,
    coverUrl: row.coverUrl,
    duration: row.duration,
    album: row.album,
    youtubeId: row.youtubeId,
    groupKind: row.groupKind,
    groupId: row.groupId,
    groupTitle: row.groupTitle,
    groupIndex: row.groupIndex,
    groupTotal: row.groupTotal,
  };
}

export const indexedDbAudioStorage: AudioStorageAdapter = {
  async save(record) {
    await run("readwrite", (store) => store.put({ ...record }));
    // Best effort: ask the browser not to evict downloads under pressure.
    try {
      await navigator.storage?.persist?.();
    } catch {
      // Persistence is a hint; storage still works without it.
    }
  },

  async get(id) {
    const row = await run<Partial<StoredAudioRecord> | undefined>("readonly", (store) => store.get(id));
    return normalize(row);
  },

  async list() {
    const rows = await run<Partial<StoredAudioRecord>[]>("readonly", (store) => store.getAll());
    return rows.map(normalize).filter((row): row is StoredAudioRecord => row !== null);
  },

  async remove(id) {
    await run("readwrite", (store) => store.delete(id));
  },

  async clear() {
    await run("readwrite", (store) => store.clear());
  },

  async estimate() {
    if (typeof navigator === "undefined" || !navigator.storage?.estimate) return null;
    try {
      const estimate = await navigator.storage.estimate();
      return { usage: estimate.usage ?? 0, quota: estimate.quota ?? 0 };
    } catch {
      return null;
    }
  },
};

/** The adapter used by the app. Swap this only when adding native storage. */
export const audioStorage: AudioStorageAdapter = indexedDbAudioStorage;

function normalizeCollection(
  row: Partial<DownloadCollectionRecord> | undefined,
): DownloadCollectionRecord | null {
  if (!row?.id) return null;
  const trackIds = Array.isArray(row.trackIds)
    ? row.trackIds.filter((id): id is string => typeof id === "string" && id.length > 0)
    : [];
  const trackMetas: DownloadCollectionTrackMeta[] = Array.isArray(row.trackMetas)
    ? row.trackMetas
        .filter((meta) => Boolean(meta && typeof meta.id === "string" && meta.id.length > 0))
        .map((meta) => ({
          id: meta.id,
          title: meta.title || meta.id,
          artist: meta.artist || "Unknown artist",
          album: meta.album || "Downloads",
          coverUrl: meta.coverUrl || "",
          duration: meta.duration || 0,
          youtubeId: meta.youtubeId,
          groupIndex: meta.groupIndex,
        }))
    : [];
  const excludedTrackIds = Array.isArray(row.excludedTrackIds)
    ? row.excludedTrackIds.filter((id): id is string => typeof id === "string" && id.length > 0)
    : [];
  return {
    id: row.id,
    kind: row.kind === "playlist" || row.kind === "songs" ? row.kind : "album",
    name: row.name || row.id,
    artworkUrl: row.artworkUrl,
    author: row.author,
    description: row.description,
    trackIds,
    trackMetas,
    excludedTrackIds,
    createdAt: row.createdAt ?? Date.now(),
    updatedAt: row.updatedAt ?? row.createdAt ?? Date.now(),
  };
}

export const indexedDbCollectionStorage: CollectionStorageAdapter = {
  async save(record) {
    await runInStore(COLLECTION_STORE, "readwrite", (store) => store.put({ ...record }));
  },

  async get(id) {
    const row = await runInStore<Partial<DownloadCollectionRecord> | undefined>(
      COLLECTION_STORE,
      "readonly",
      (store) => store.get(id),
    );
    return normalizeCollection(row);
  },

  async list() {
    const rows = await runInStore<Partial<DownloadCollectionRecord>[]>(
      COLLECTION_STORE,
      "readonly",
      (store) => store.getAll(),
    );
    return rows.map(normalizeCollection).filter((row): row is DownloadCollectionRecord => row !== null);
  },

  async remove(id) {
    await runInStore(COLLECTION_STORE, "readwrite", (store) => store.delete(id));
  },

  async clear() {
    await runInStore(COLLECTION_STORE, "readwrite", (store) => store.clear());
  },
};

/** Collection registry. It stores references only, never audio bytes. */
export const collectionStorage: CollectionStorageAdapter = indexedDbCollectionStorage;

export function isQuotaExceededError(error: unknown): boolean {
  if (!error) return false;
  const e = error as { name?: string; code?: number; message?: string };
  if (e.name === "QuotaExceededError" || e.name === "NS_ERROR_DOM_QUOTA_REACHED") return true;
  if (e.code === 22 || e.code === 1014) return true;
  return typeof e.message === "string" && /quota|storage full|out of space/i.test(e.message);
}
