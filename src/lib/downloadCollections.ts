/**
 * Device-local registry for downloaded playlists, albums and individual songs.
 *
 * This is not a second download manager or player: the existing
 * `downloadManager` still owns fetching/progress/Blob storage, and this module
 * only remembers ordered references to those Blobs. Because a reference is just
 * a track id, one stored audio file can belong to several collections without
 * any duplicate bytes.
 */

import {
  collectionStorage,
  type DownloadCollectionKind,
  type DownloadCollectionRecord,
  type DownloadCollectionTrackMeta,
} from "./audioStorage";
import { getDefaultArtworkFallbackUrl } from "./artwork";
import type { DownloadCompletedRecord, DownloadGroupInfo, DownloadRecordMeta } from "./downloadManager";
import type { Track } from "./types";

export const DOWNLOADED_SONGS_COLLECTION_ID = "downloaded-songs";
export const DOWNLOADED_SONGS_TITLE = "Downloaded Songs";

export type { DownloadCollectionRecord, DownloadCollectionTrackMeta };

function fallbackCover(coverUrl: string | undefined): string {
  return coverUrl || getDefaultArtworkFallbackUrl();
}

export function collectionMetaToTrack(meta: DownloadCollectionTrackMeta): Track {
  return {
    id: meta.id,
    title: meta.title || meta.id,
    artist: meta.artist || "Unknown artist",
    album: meta.album || "Downloads",
    coverUrl: fallbackCover(meta.coverUrl),
    duration: meta.duration || 0,
    youtubeId: meta.youtubeId,
  };
}

function trackToMeta(track: Track, index?: number): DownloadCollectionTrackMeta {
  return {
    id: track.id,
    title: track.title || track.id,
    artist: track.artist || "Unknown artist",
    album: track.album || "Downloads",
    coverUrl: fallbackCover(track.coverUrl),
    duration: track.duration || 0,
    youtubeId: track.youtubeId,
    groupIndex: index,
  };
}

function recordToMeta(
  record: DownloadCompletedRecord | DownloadRecordMeta,
): DownloadCollectionTrackMeta {
  return {
    id: record.id,
    title: record.title || record.id,
    artist: record.artist || "Unknown artist",
    album: record.album || "Downloads",
    coverUrl: fallbackCover(record.coverUrl),
    duration: record.duration || 0,
    youtubeId: record.youtubeId,
    groupIndex: record.groupIndex,
  };
}

function cloneCollection(collection: DownloadCollectionRecord): DownloadCollectionRecord {
  return {
    ...collection,
    trackIds: [...collection.trackIds],
    trackMetas: collection.trackMetas.map((meta) => ({ ...meta })),
    excludedTrackIds: [...(collection.excludedTrackIds ?? [])],
  };
}

function uniqueIds(ids: string[]): string[] {
  return [...new Set(ids.filter((id) => typeof id === "string" && id.length > 0))];
}

/** Insert/update one track while preserving the collection's existing order. */
function upsertMeta(
  existing: DownloadCollectionTrackMeta[],
  incoming: DownloadCollectionTrackMeta,
): DownloadCollectionTrackMeta[] {
  const index = existing.findIndex((meta) => meta.id === incoming.id);
  if (index === -1) return [...existing, { ...incoming }];
  const next = [...existing];
  next[index] = { ...next[index], ...incoming, groupIndex: incoming.groupIndex ?? next[index].groupIndex };
  return next;
}

/** Replace ordering with the source's original order, keeping known metadata. */
function mergeOrderedMetas(
  existing: DownloadCollectionTrackMeta[],
  incoming: DownloadCollectionTrackMeta[],
): DownloadCollectionTrackMeta[] {
  const byId = new Map(existing.map((meta) => [meta.id, meta]));
  const seen = new Set<string>();
  const result: DownloadCollectionTrackMeta[] = [];

  for (const meta of incoming) {
    if (seen.has(meta.id)) continue;
    seen.add(meta.id);
    const previous = byId.get(meta.id);
    result.push({
      ...previous,
      ...meta,
      // Never lose a known artwork/video id when a source row is lossy.
      coverUrl: meta.coverUrl || previous?.coverUrl || meta.coverUrl,
      youtubeId: meta.youtubeId ?? previous?.youtubeId,
    });
  }
  return result;
}

function makeSongsCollection(now: number): DownloadCollectionRecord {
  return {
    id: DOWNLOADED_SONGS_COLLECTION_ID,
    kind: "songs",
    name: DOWNLOADED_SONGS_TITLE,
    trackIds: [],
    trackMetas: [],
    createdAt: now,
    updatedAt: now,
  };
}

function legacyGroupKey(record: DownloadRecordMeta): string | null {
  if (!record.groupKind) return null;
  if (record.groupId) return record.groupId;
  return record.groupTitle ? `${record.groupKind}:${record.groupTitle}` : null;
}

function sortGroupRecords(records: DownloadRecordMeta[]): DownloadRecordMeta[] {
  return [...records].sort((a, b) => {
    const ai = a.groupIndex ?? Number.MAX_SAFE_INTEGER;
    const bi = b.groupIndex ?? Number.MAX_SAFE_INTEGER;
    return ai !== bi ? ai - bi : a.savedAt - b.savedAt;
  });
}

/** Build collections for downloads created before the registry existed. */
function buildLegacyCollections(records: DownloadRecordMeta[]): DownloadCollectionRecord[] {
  const now = Date.now();
  const grouped = new Map<string, DownloadRecordMeta[]>();
  const standalone: DownloadRecordMeta[] = [];

  for (const record of records) {
    const key = legacyGroupKey(record);
    if (!key) {
      standalone.push(record);
      continue;
    }
    const bucket = grouped.get(key);
    if (bucket) bucket.push(record);
    else grouped.set(key, [record]);
  }

  const collections: DownloadCollectionRecord[] = [];
  for (const [id, rows] of grouped) {
    const ordered = sortGroupRecords(rows);
    const metas = ordered.map(recordToMeta);
    const first = ordered[0];
    const kind: DownloadCollectionKind = first.groupKind === "playlist" ? "playlist" : "album";
    collections.push({
      id,
      kind,
      name: first.groupTitle || first.album || (kind === "playlist" ? "Playlist" : "Album"),
      artworkUrl: fallbackCover(first.coverUrl),
      trackIds: uniqueIds(metas.map((meta) => meta.id)),
      trackMetas: metas,
      createdAt: Math.min(...rows.map((row) => row.savedAt || now)),
      updatedAt: Math.max(...rows.map((row) => row.savedAt || now)),
    });
  }

  const songs = makeSongsCollection(now);
  for (const record of [...standalone].sort((a, b) => b.savedAt - a.savedAt)) {
    const meta = recordToMeta(record);
    songs.trackIds = uniqueIds([...songs.trackIds, meta.id]);
    songs.trackMetas = upsertMeta(songs.trackMetas, meta);
  }
  collections.push(songs);
  return collections;
}

class DownloadCollectionStore {
  private collections = new Map<string, DownloadCollectionRecord>();
  private listeners = new Set<() => void>();
  private hydrated = false;
  private hydratePromise: Promise<void> | null = null;

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  getSnapshot(): DownloadCollectionRecord[] {
    const rank = (kind: DownloadCollectionKind) =>
      kind === "playlist" ? 0 : kind === "album" ? 1 : 2;
    return [...this.collections.values()]
      .sort((a, b) => rank(a.kind) - rank(b.kind) || a.name.localeCompare(b.name))
      .map(cloneCollection);
  }

  private emit(): void {
    for (const listener of this.listeners) {
      try {
        listener();
      } catch {
        // One bad subscriber must not break collection persistence.
      }
    }
  }

  private async persist(changed: DownloadCollectionRecord[]): Promise<void> {
    if (changed.length === 0) return;
    for (const collection of changed) {
      this.collections.set(collection.id, cloneCollection(collection));
    }
    try {
      for (const collection of changed) await collectionStorage.save(collection);
    } catch {
      // In-memory membership still works for this session if storage is blocked.
    }
    this.emit();
  }

  async hydrate(records: DownloadRecordMeta[] = []): Promise<void> {
    if (this.hydrated) {
      await this.syncFromRecords(records);
      return;
    }
    if (this.hydratePromise) return this.hydratePromise;
    this.hydratePromise = this.doHydrate(records);
    return this.hydratePromise;
  }

  private async doHydrate(records: DownloadRecordMeta[]): Promise<void> {
    let stored: DownloadCollectionRecord[] = [];
    try {
      stored = await collectionStorage.list();
    } catch {
      // Private mode / blocked storage: keep an in-memory registry.
    }
    this.collections.clear();
    for (const collection of stored) {
      this.collections.set(collection.id, cloneCollection(collection));
    }
    if (!this.collections.has(DOWNLOADED_SONGS_COLLECTION_ID)) {
      this.collections.set(DOWNLOADED_SONGS_COLLECTION_ID, makeSongsCollection(Date.now()));
    }
    await this.syncFromRecords(records);
    this.hydrated = true;
    this.emit();
  }

  /** Recovers grouping for old rows and records added before hydration. */
  private async syncFromRecords(records: DownloadRecordMeta[]): Promise<void> {
    if (records.length === 0) return;
    const legacy = buildLegacyCollections(records);
    const changed: DownloadCollectionRecord[] = [];

    for (const candidate of legacy) {
      const existing = this.collections.get(candidate.id);
      const excluded = new Set(existing?.excludedTrackIds ?? []);
      const metas = candidate.trackMetas.filter((meta) => !excluded.has(meta.id));
      if (metas.length === 0) continue;
      const filtered: DownloadCollectionRecord = {
        ...candidate,
        trackIds: uniqueIds(metas.map((meta) => meta.id)),
        trackMetas: metas,
      };

      if (!existing) {
        changed.push(filtered);
        continue;
      }
      if (candidate.id === DOWNLOADED_SONGS_COLLECTION_ID) {
        const missing = filtered.trackMetas.filter(
          (meta) => !existing.trackIds.includes(meta.id),
        );
        if (missing.length === 0) continue;
        const next = cloneCollection(existing);
        for (const meta of missing) {
          next.trackIds = uniqueIds([...next.trackIds, meta.id]);
          next.trackMetas = upsertMeta(next.trackMetas, meta);
          next.excludedTrackIds = (next.excludedTrackIds ?? []).filter((id) => id !== meta.id);
        }
        next.updatedAt = Date.now();
        changed.push(next);
      }
      // Existing group collections keep their persisted metadata and order.
    }

    await this.persist(changed);
  }

  /** Register/replace the ordered source manifest for an album or playlist. */
  async registerGroup(group: DownloadGroupInfo, tracks: Track[]): Promise<void> {
    if (!this.hydrated) await this.hydrate();
    const now = Date.now();
    const metas = tracks.map((track, index) =>
      trackToMeta(track, typeof group.index === "number" ? group.index + index : index),
    );
    const existing = this.collections.get(group.id);
    const next: DownloadCollectionRecord = existing
      ? {
          ...cloneCollection(existing),
          kind: group.kind,
          name: group.title || existing.name,
          artworkUrl: group.artworkUrl || existing.artworkUrl || metas[0]?.coverUrl,
          author: group.author ?? existing.author,
          description: group.description ?? existing.description,
          trackIds: uniqueIds(metas.map((meta) => meta.id)),
          trackMetas: mergeOrderedMetas(existing.trackMetas, metas),
          excludedTrackIds: (existing.excludedTrackIds ?? []).filter(
            (id) => !metas.some((meta) => meta.id === id),
          ),
          updatedAt: now,
        }
      : {
          id: group.id,
          kind: group.kind,
          name: group.title || "Downloaded collection",
          artworkUrl: group.artworkUrl || metas[0]?.coverUrl,
          author: group.author,
          description: group.description,
          trackIds: uniqueIds(metas.map((meta) => meta.id)),
          trackMetas: metas,
          createdAt: now,
          updatedAt: now,
        };
    await this.persist([next]);
  }

  /** Add one completed file to its source collection (or Downloaded Songs). */
  async addCompleted(record: DownloadCompletedRecord): Promise<void> {
    if (!this.hydrated) await this.hydrate();
    const meta = recordToMeta(record);
    const hasGroup = Boolean(
      record.groupId && record.groupKind && record.groupTitle,
    );
    const targetId = hasGroup ? (record.groupId as string) : DOWNLOADED_SONGS_COLLECTION_ID;
    const existing = this.collections.get(targetId);
    const now = Date.now();
    const kind: DownloadCollectionKind = hasGroup
      ? record.groupKind === "playlist"
        ? "playlist"
        : "album"
      : "songs";
    const next: DownloadCollectionRecord = existing
      ? {
          ...cloneCollection(existing),
          artworkUrl: existing.artworkUrl || fallbackCover(meta.coverUrl),
          trackIds: uniqueIds([...existing.trackIds, meta.id]),
          trackMetas: upsertMeta(existing.trackMetas, meta),
          excludedTrackIds: (existing.excludedTrackIds ?? []).filter((id) => id !== meta.id),
          updatedAt: now,
        }
      : {
          id: targetId,
          kind,
          name: hasGroup ? (record.groupTitle as string) : DOWNLOADED_SONGS_TITLE,
          artworkUrl: fallbackCover(meta.coverUrl),
          trackIds: [meta.id],
          trackMetas: [meta],
          createdAt: now,
          updatedAt: now,
        };
    await this.persist([next]);
  }

  /**
   * Membership-only removal. The audio Blob is never deleted here. If a track
   * is no longer in any collection it is kept visible in Downloaded Songs.
   */
  async removeFromCollection(collectionId: string, trackId: string): Promise<void> {
    if (!this.hydrated) await this.hydrate();
    const collection = this.collections.get(collectionId);
    if (!collection || !collection.trackIds.includes(trackId)) return;

    const next = cloneCollection(collection);
    next.trackIds = next.trackIds.filter((id) => id !== trackId);
    next.trackMetas = next.trackMetas.filter((meta) => meta.id !== trackId);
    next.excludedTrackIds = uniqueIds([...(next.excludedTrackIds ?? []), trackId]);
    next.updatedAt = Date.now();

    const removedMeta = collection.trackMetas.find((meta) => meta.id === trackId);
    const changed: DownloadCollectionRecord[] = [next];

    if (
      collectionId !== DOWNLOADED_SONGS_COLLECTION_ID &&
      !this.isReferencedAfterChanges(trackId, changed)
    ) {
      const songs = this.collections.get(DOWNLOADED_SONGS_COLLECTION_ID);
      const meta = removedMeta ?? collectionMetaToFallback(trackId);
      if (songs) {
        const kept = cloneCollection(songs);
        kept.trackIds = uniqueIds([...kept.trackIds, trackId]);
        kept.trackMetas = upsertMeta(kept.trackMetas, meta);
        kept.excludedTrackIds = (kept.excludedTrackIds ?? []).filter((id) => id !== trackId);
        kept.updatedAt = Date.now();
        changed.push(kept);
      }
    }

    await this.persist(changed);
  }

  private isReferencedAfterChanges(
    trackId: string,
    changed: DownloadCollectionRecord[],
  ): boolean {
    const overrides = new Map(changed.map((collection) => [collection.id, collection]));
    return [...this.collections.values()].some((collection) => {
      const candidate = overrides.get(collection.id) ?? collection;
      return candidate.trackIds.includes(trackId);
    });
  }

  /** Permanent-delete cleanup: called only after the audio Blob is removed. */
  async purgeTrack(trackId: string): Promise<void> {
    if (!this.hydrated) await this.hydrate();
    const changed: DownloadCollectionRecord[] = [];
    for (const collection of this.collections.values()) {
      if (!collection.trackIds.includes(trackId)) continue;
      const next = cloneCollection(collection);
      next.trackIds = next.trackIds.filter((id) => id !== trackId);
      next.trackMetas = next.trackMetas.filter((meta) => meta.id !== trackId);
      next.updatedAt = Date.now();
      changed.push(next);
    }
    await this.persist(changed);
  }

  async clear(): Promise<void> {
    this.collections.clear();
    try {
      await collectionStorage.clear();
    } catch {
      // Sign-out already clears audio; a blocked registry is harmless.
    }
    this.emit();
  }
}

function collectionMetaToFallback(trackId: string): DownloadCollectionTrackMeta {
  return {
    id: trackId,
    title: trackId,
    artist: "Unknown artist",
    album: "Downloads",
    coverUrl: getDefaultArtworkFallbackUrl(),
    duration: 0,
  };
}

export const downloadCollections = new DownloadCollectionStore();
