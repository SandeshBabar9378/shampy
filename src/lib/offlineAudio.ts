/**
 * Backwards-compatible playback/storage API over the single audio adapter.
 *
 * DownloadManager writes through `audioStorage`; PlayerContext reads through
 * the older `getOfflineAudio` helpers used by the existing HTML5 audio engine.
 * Both now deliberately share the same IndexedDB database, object store and
 * `AudioStorageAdapter`, so there is no duplicate persistence implementation.
 *
 * A future Capacitor filesystem adapter only has to replace `audioStorage`.
 */

import { audioStorage, type StoredAudioRecord } from "./audioStorage";

export type OfflineAudioStorage = typeof audioStorage;

export interface OfflineAudioMeta {
  mimeType?: string;
  /** Legacy metadata name; stored as sourceId by the shared adapter. */
  sourceUrl?: string;
}

export interface OfflineAudioInfo {
  id: string;
  size: number;
  mimeType: string;
  savedAt: number;
}

/** Full stored row. Extra metadata fields are optional on older rows. */
export type OfflineAudioRow = StoredAudioRecord;

function toInfo(record: StoredAudioRecord): OfflineAudioInfo {
  return {
    id: record.id,
    size: record.size,
    mimeType: record.mimeType,
    savedAt: record.savedAt,
  };
}

export async function saveOfflineAudio(
  id: string,
  blob: Blob,
  meta: OfflineAudioMeta = {},
): Promise<void> {
  await audioStorage.save({
    id,
    blob,
    size: blob.size,
    mimeType: meta.mimeType || blob.type || "audio/mpeg",
    savedAt: Date.now(),
    sourceId: meta.sourceUrl,
  });
}

export async function getOfflineAudio(id: string): Promise<Blob | null> {
  const record = await audioStorage.get(id);
  return record?.blob ?? null;
}

export async function getOfflineAudioInfo(id: string): Promise<OfflineAudioInfo | null> {
  const record = await audioStorage.get(id);
  return record ? toInfo(record) : null;
}

export async function removeOfflineAudio(id: string): Promise<void> {
  await audioStorage.remove(id);
}

export async function clearOfflineAudio(): Promise<void> {
  await audioStorage.clear();
}

export async function listOfflineAudio(): Promise<OfflineAudioRow[]> {
  return audioStorage.list();
}

export async function offlineAudioUsage(): Promise<{ usedBytes: number; quotaBytes: number | null }> {
  let usedBytes = 0;
  try {
    usedBytes = (await audioStorage.list()).reduce((sum, row) => sum + row.size, 0);
  } catch {
    // Storage may be unavailable; report what the browser estimate knows.
  }
  let quotaBytes: number | null = null;
  try {
    const estimate = await audioStorage.estimate();
    if (estimate?.quota) quotaBytes = estimate.quota;
    if (estimate?.usage && estimate.usage > usedBytes) usedBytes = estimate.usage;
  } catch {}
  return { usedBytes, quotaBytes };
}

export const offlineAudioStorage: OfflineAudioStorage = {
  save: (record) => audioStorage.save(record),
  get: (id) => audioStorage.get(id),
  list: () => audioStorage.list(),
  remove: (id) => audioStorage.remove(id),
  clear: () => audioStorage.clear(),
  estimate: async () => (await audioStorage.estimate()) ?? { usage: 0, quota: 0 },
};
