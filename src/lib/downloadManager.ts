/**
 * Central Download Manager (mobile only).
 *
 * Real behaviour only — there is no simulated progress:
 *  - `fetch` retrieves the actual audio bytes from the legal provider,
 *  - progress is reported from bytes received vs Content-Length,
 *  - the complete Blob is written through the single audio storage adapter,
 *  - a job is marked completed only after the Blob is durably stored.
 *
 * The manager owns queueing, concurrency, cancellation, retries, duplicate
 * prevention, offline/online state, batch outcomes and error classification.
 * React state is a subscription in PlayerContext; this module has no React
 * dependency. A future Capacitor Filesystem adapter replaces only
 * AudioStorageAdapter in audioStorage.ts.
 */

import type { Track } from "./types";
import { audioStorage, isQuotaExceededError, type StoredAudioRecord } from "./audioStorage";
import {
  getDownloadTestFileSize,
  isDownloadTestTrack,
  resolveDownloadSource,
} from "./testDownloadProvider";

export type DownloadStatus =
  | "queued"
  | "downloading"
  | "completed"
  | "failed"
  | "cancelled"
  | "unavailable";

export type DownloadGroupKind = "album" | "playlist";

export interface DownloadGroupInfo {
  kind: DownloadGroupKind;
  /** Stable group id, e.g. "playlist:abc" or "album:xyz". */
  id: string;
  title: string;
  /** Optional starting position of the first track in the group. */
  index?: number;
  total?: number;
  /** Collection metadata, stored by the collection registry (never in audio). */
  artworkUrl?: string;
  author?: string;
  description?: string;
}

export interface DownloadJob {
  id: string;
  title: string;
  artist: string;
  album: string;
  coverUrl: string;
  duration: number;
  status: DownloadStatus;
  /** Bytes received so far. Real, from the stream. */
  loaded: number;
  /** Expected total bytes (Content-Length/provider hint); 0 if unknown. */
  total: number;
  error?: string;
  groupKind?: DownloadGroupKind;
  groupId?: string;
  groupTitle?: string;
  groupIndex?: number;
  groupTotal?: number;
  batchId?: string;
  startedAt?: number;
  finishedAt?: number;
  /** Original source fields are retained so retry never loses provenance. */
  previewUrl?: string;
  downloadUrl?: string;
  downloadMimeType?: string;
  fileSize?: number;
  source?: string;
  isTest?: boolean;
  youtubeId?: string;
}

/** A single enqueue call. A batch is only successful when no track failed. */
export interface DownloadBatch {
  id: string;
  kind?: DownloadGroupKind;
  title: string;
  total: number;
  queued: number;
  duplicates: number;
  completed: number;
  failed: number;
  cancelled: number;
  unavailable: number;
  done: boolean;
  successful: boolean;
  startedAt: number;
  finishedAt?: number;
}

export interface DownloadRecordMeta {
  id: string;
  title?: string;
  artist?: string;
  album?: string;
  coverUrl?: string;
  duration?: number;
  size: number;
  savedAt: number;
  sourceId?: string;
  youtubeId?: string;
  groupKind?: DownloadGroupKind;
  groupId?: string;
  groupTitle?: string;
  groupIndex?: number;
  groupTotal?: number;
}

export interface DownloadSnapshot {
  jobs: DownloadJob[];
  records: DownloadRecordMeta[];
  batches: DownloadBatch[];
  online: boolean;
}

export interface EnqueueResult {
  added: string[];
  duplicates: string[];
  unavailable: string[];
  batchId: string;
}

export interface DownloadJobCounts {
  pending: number;
  completed: number;
  failed: number;
  cancelled: number;
  unavailable: number;
}

/** Accurate counts for the Download Manager header. */
export function countDownloadJobs(jobs: DownloadJob[]): DownloadJobCounts {
  const counts: DownloadJobCounts = {
    pending: 0,
    completed: 0,
    failed: 0,
    cancelled: 0,
    unavailable: 0,
  };
  for (const job of jobs) {
    if (job.status === "queued" || job.status === "downloading") counts.pending++;
    else counts[job.status]++;
  }
  return counts;
}

export interface DownloadCompletedRecord {
  id: string;
  title?: string;
  artist?: string;
  album?: string;
  coverUrl?: string;
  duration?: number;
  size: number;
  savedAt: number;
  youtubeId?: string;
  groupKind?: DownloadGroupKind;
  groupId?: string;
  groupTitle?: string;
  groupIndex?: number;
  groupTotal?: number;
}

type CompletedListener = (record: DownloadCompletedRecord) => void | Promise<void>;
type RemovedListener = (id: string) => void | Promise<void>;
type SnapshotListener = (snapshot: DownloadSnapshot) => void;

const CONCURRENCY = 2;
const MIN_VALID_AUDIO_BYTES = 1024;
const HISTORY_LIMIT = 250;

const PENDING_STATUSES: DownloadStatus[] = ["queued", "downloading"];
const TERMINAL_STATUSES: DownloadStatus[] = ["completed", "failed", "cancelled", "unavailable"];

interface QueueEntry {
  track: Track;
  group?: DownloadGroupInfo;
  groupIndex?: number;
  groupTotal?: number;
  batchId: string;
}

function recordToMeta(record: StoredAudioRecord): DownloadRecordMeta {
  return {
    id: record.id,
    title: record.title,
    artist: record.artist,
    album: record.album,
    coverUrl: record.coverUrl,
    duration: record.duration,
    size: record.size,
    savedAt: record.savedAt,
    sourceId: record.sourceId,
    youtubeId: record.youtubeId,
    groupKind: record.groupKind,
    groupId: record.groupId,
    groupTitle: record.groupTitle,
    groupIndex: record.groupIndex,
    groupTotal: record.groupTotal,
  };
}

function jobFromTrack(track: Track, group?: DownloadGroupInfo, batchId?: string): DownloadJob {
  return {
    id: track.id,
    title: track.title,
    artist: track.artist,
    album: track.album,
    coverUrl: track.coverUrl,
    duration: track.duration || 0,
    status: "queued",
    loaded: 0,
    total: getDownloadTestFileSize(track.id) ?? track.fileSize ?? 0,
    groupKind: group?.kind,
    groupId: group?.id,
    groupTitle: group?.title,
    groupIndex: group?.index,
    groupTotal: group?.total,
    batchId,
    previewUrl: track.previewUrl,
    downloadUrl: track.downloadUrl,
    downloadMimeType: track.downloadMimeType,
    fileSize: track.fileSize,
    source: track.source,
    isTest: track.isTest,
    youtubeId: track.youtubeId,
  };
}

function classifyError(err: unknown): string {
  if (typeof navigator !== "undefined" && navigator.onLine === false) {
    return "You are offline. Reconnect, then retry this download.";
  }
  if (isQuotaExceededError(err)) {
    return "Not enough storage space on this device. Remove some downloads and try again.";
  }
  if (err instanceof DOMException) {
    if (err.name === "AbortError") return "Download cancelled.";
    if (err.name === "NotReadableError" || err.name === "InvalidStateError") {
      return "The downloaded file could not be saved. Try again.";
    }
  }
  if (err instanceof TypeError) {
    return "Network interrupted. Check your connection and retry.";
  }
  const message = err instanceof Error ? err.message : "";
  if (/quota|storage full|out of space/i.test(message)) {
    return "Not enough storage space on this device. Remove some downloads and try again.";
  }
  if (/network|fetch|load failed/i.test(message)) {
    return "Network interrupted. Check your connection and retry.";
  }
  return message || "Download failed. Tap retry.";
}

/** Looks like a real MP3/audio payload (guards against HTML error pages). */
function looksLikeAudio(bytes: Uint8Array, mimeType: string): boolean {
  if (bytes.byteLength < MIN_VALID_AUDIO_BYTES) return false;
  // ID3 tag
  if (bytes[0] === 0x49 && bytes[1] === 0x44 && bytes[2] === 0x33) return true;
  // MPEG audio frame sync (0xFF 0xEx/0xFx)
  if (bytes[0] === 0xff && (bytes[1] & 0xe0) === 0xe0) return true;
  // Ogg / RIFF / ftyp containers, in case a provider ships those.
  const head = String.fromCharCode(bytes[0], bytes[1], bytes[2], bytes[3]);
  if (head === "OggS" || head === "RIFF" || head === "ftyp") return true;
  return mimeType.startsWith("audio/") && bytes.byteLength > MIN_VALID_AUDIO_BYTES;
}

class DownloadManager {
  private jobs = new Map<string, DownloadJob>();
  /** Full original tracks, retained so retry keeps every source field. */
  private tracks = new Map<string, Track>();
  private records = new Map<string, DownloadRecordMeta>();
  private batches = new Map<string, DownloadBatch>();
  private batchOrder: string[] = [];
  private order: string[] = [];
  private queue: QueueEntry[] = [];
  private controllers = new Map<string, AbortController>();
  private running = new Set<string>();
  /** Jobs aborted because connectivity was lost, not because the user cancelled. */
  private offlineInterrupted = new Set<string>();
  private completedListeners = new Set<CompletedListener>();
  private removedListeners = new Set<RemovedListener>();
  private snapshotListeners = new Set<SnapshotListener>();
  private online = typeof navigator === "undefined" ? true : navigator.onLine !== false;
  private hydrated = false;
  private hydratePromise: Promise<void> | null = null;

  // ── Subscriptions ────────────────────────────────────────────────────────
  subscribe(listener: SnapshotListener): () => void {
    this.snapshotListeners.add(listener);
    return () => this.snapshotListeners.delete(listener);
  }

  onCompleted(listener: CompletedListener): () => void {
    this.completedListeners.add(listener);
    return () => this.completedListeners.delete(listener);
  }

  onRemoved(listener: RemovedListener): () => void {
    this.removedListeners.add(listener);
    return () => this.removedListeners.delete(listener);
  }

  getSnapshot(): DownloadSnapshot {
    return {
      jobs: this.order
        .map((id) => this.jobs.get(id))
        .filter((job): job is DownloadJob => job !== undefined)
        .map((job) => ({ ...job })),
      records: [...this.records.values()].map((record) => ({ ...record })),
      batches: this.batchOrder
        .map((id) => this.batches.get(id))
        .filter((batch): batch is DownloadBatch => batch !== undefined)
        .map((batch) => ({ ...batch })),
      online: this.online,
    };
  }

  private emit() {
    if (this.snapshotListeners.size === 0) return;
    const snapshot = this.getSnapshot();
    for (const listener of this.snapshotListeners) {
      try {
        listener(snapshot);
      } catch {
        // A broken subscriber must never stop downloads.
      }
    }
  }

  // ── Hydration / lifecycle ────────────────────────────────────────────────
  async hydrate(): Promise<void> {
    if (this.hydrated) return;
    if (this.hydratePromise) return this.hydratePromise;
    this.hydratePromise = this.readStorage();
    return this.hydratePromise;
  }

  private async readStorage(): Promise<void> {
    if (typeof window !== "undefined") {
      this.online = navigator.onLine !== false;
      window.addEventListener("online", this.handleOnline);
      window.addEventListener("offline", this.handleOffline);
    }
    try {
      const rows = await audioStorage.list();
      this.records.clear();
      for (const row of rows) this.records.set(row.id, recordToMeta(row));
    } catch {
      // Storage may be unavailable (private mode); downloads will report it.
    }
    this.hydrated = true;
    this.emit();
  }

  private handleOnline = () => {
    this.online = true;
    this.emit();
    // Queued work waits for connectivity instead of failing immediately.
    this.pump();
  };

  private handleOffline = () => {
    this.online = false;
    // Stop active byte streams immediately so a network drop is reported as a
    // failed, retryable download instead of hanging or writing a partial file.
    for (const [id, controller] of this.controllers) {
      this.offlineInterrupted.add(id);
      controller.abort();
    }
    this.emit();
  };

  async refreshFromStorage(): Promise<void> {
    try {
      const rows = await audioStorage.list();
      const present = new Set(rows.map((row) => row.id));
      this.records.clear();
      for (const row of rows) {
        this.records.set(row.id, recordToMeta(row));
        const job = this.jobs.get(row.id);
        if (job && job.status !== "completed") this.markTerminal(job, "completed", row.size, row.size);
      }
      for (const [id, job] of this.jobs) {
        if (job.status === "completed" && !present.has(id)) this.jobs.delete(id);
      }
    } catch {}
    this.emit();
  }

  hasCompleted(id: string): boolean {
    return this.records.has(id);
  }

  // ── Batch accounting ─────────────────────────────────────────────────────
  private createBatch(tracks: Track[], group?: DownloadGroupInfo): string {
    const id = `batch_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
    this.batches.set(id, {
      id,
      kind: group?.kind,
      title: group?.title || tracks[0]?.title || "Download",
      total: group?.total ?? tracks.length,
      queued: 0,
      duplicates: 0,
      completed: 0,
      failed: 0,
      cancelled: 0,
      unavailable: 0,
      done: false,
      successful: true,
      startedAt: Date.now(),
    });
    this.batchOrder.push(id);
    if (this.batchOrder.length > HISTORY_LIMIT) {
      const old = this.batchOrder.shift()!;
      this.batches.delete(old);
    }
    return id;
  }

  private batchFor(job: DownloadJob): DownloadBatch | undefined {
    return job.batchId ? this.batches.get(job.batchId) : undefined;
  }

  private batchKey(status: DownloadStatus): "completed" | "failed" | "cancelled" | "unavailable" | null {
    if (status === "completed" || status === "failed" || status === "cancelled" || status === "unavailable") {
      return status;
    }
    return null;
  }

  private checkBatch(batch: DownloadBatch): void {
    if (batch.done || batch.queued > 0) return;
    batch.done = true;
    batch.finishedAt = Date.now();
    batch.successful = batch.failed === 0 && batch.cancelled === 0 && batch.unavailable === 0;
  }

  /** Moves a job to a terminal state and keeps its batch counters honest. */
  private markTerminal(
    job: DownloadJob,
    status: "completed" | "failed" | "cancelled" | "unavailable",
    loaded?: number,
    total?: number,
    error?: string,
  ): void {
    const previous = job.status;
    if (previous === status) return;

    const batch = this.batchFor(job);
    if (batch) {
      const prevKey = this.batchKey(previous);
      if (prevKey) batch[prevKey] = Math.max(0, batch[prevKey] - 1);
      if (PENDING_STATUSES.includes(previous)) batch.queued = Math.max(0, batch.queued - 1);
      batch[status]++;
    }

    job.status = status;
    if (typeof loaded === "number") job.loaded = loaded;
    if (typeof total === "number") job.total = total;
    job.error = error;
    job.finishedAt = Date.now();

    if (batch) this.checkBatch(batch);
  }

  private detachFromBatch(job: DownloadJob): void {
    const batch = this.batchFor(job);
    if (!batch) return;
    const key = this.batchKey(job.status);
    if (key) batch[key] = Math.max(0, batch[key] - 1);
    if (PENDING_STATUSES.includes(job.status)) batch.queued = Math.max(0, batch.queued - 1);
    this.checkBatch(batch);
  }

  // ── Queueing ─────────────────────────────────────────────────────────────
  async enqueue(tracks: Track[], group?: DownloadGroupInfo): Promise<EnqueueResult> {
    const emptyBatchId = tracks.length > 0 ? this.createBatch(tracks, group) : "empty";
    if (!tracks.length) {
      return { added: [], duplicates: [], unavailable: [], batchId: emptyBatchId };
    }
    await this.hydrate();

    const result: EnqueueResult = { added: [], duplicates: [], unavailable: [], batchId: emptyBatchId };
    const batch = this.batches.get(emptyBatchId)!;
    const groupTotal = group?.total ?? tracks.length;
    const startIndex = group?.index ?? 0;

    tracks.forEach((track, position) => {
      if (!track?.id) return;
      this.tracks.set(track.id, track);
      if (this.records.has(track.id)) {
        result.duplicates.push(track.id);
        batch.duplicates++;
        return;
      }
      const existing = this.jobs.get(track.id);
      if (
        existing &&
        PENDING_STATUSES.includes(existing.status)
      ) {
        result.duplicates.push(track.id);
        batch.duplicates++;
        return;
      }
      if (!resolveDownloadSource(track)) {
        result.unavailable.push(track.id);
        const job = this.ensureJob(track, group, batch.id);
        job.error = isDownloadTestTrack(track)
          ? "This test track has no downloadable audio file."
          : "This song has no legally downloadable audio source. YouTube streaming is still available.";
        this.markTerminal(job, "unavailable", 0, job.total, job.error);
        return;
      }

      const job = this.ensureJob(track, group, batch.id);
      job.status = "queued";
      job.loaded = 0;
      job.total = getDownloadTestFileSize(track.id) ?? track.fileSize ?? 0;
      job.error = undefined;
      job.startedAt = undefined;
      job.finishedAt = undefined;
      batch.queued++;
      this.queue.push({
        track,
        group,
        groupIndex: startIndex + position,
        groupTotal,
        batchId: batch.id,
      });
      result.added.push(track.id);
    });

    this.checkBatch(batch);
    this.emit();
    this.pump();
    return result;
  }

  private ensureJob(track: Track, group?: DownloadGroupInfo, batchId?: string): DownloadJob {
    let job = this.jobs.get(track.id);
    if (!job) {
      job = jobFromTrack(track, group, batchId);
      this.jobs.set(track.id, job);
      this.order.push(track.id);
      this.trimHistory();
    } else {
      job.title = track.title || job.title;
      job.artist = track.artist || job.artist;
      job.album = track.album || job.album;
      job.coverUrl = track.coverUrl || job.coverUrl;
      job.duration = track.duration || job.duration;
      job.previewUrl = track.previewUrl ?? job.previewUrl;
      job.downloadUrl = track.downloadUrl ?? job.downloadUrl;
      job.downloadMimeType = track.downloadMimeType ?? job.downloadMimeType;
      job.fileSize = track.fileSize ?? job.fileSize;
      job.source = track.source ?? job.source;
      job.isTest = track.isTest ?? job.isTest;
      job.youtubeId = track.youtubeId ?? job.youtubeId;
      if (group) {
        job.groupKind = group.kind;
        job.groupId = group.id;
        job.groupTitle = group.title;
        if (typeof group.index === "number") job.groupIndex = group.index;
        if (typeof group.total === "number") job.groupTotal = group.total;
      }
      if (batchId && !job.batchId) job.batchId = batchId;
    }
    return job;
  }

  private trimHistory() {
    if (this.order.length <= HISTORY_LIMIT) return;
    const finished = this.order.filter((id) => {
      const job = this.jobs.get(id);
      return job ? TERMINAL_STATUSES.includes(job.status) : false;
    });
    while (this.order.length > HISTORY_LIMIT && finished.length > 0) {
      const id = finished.shift()!;
      const job = this.jobs.get(id);
      if (job) this.detachFromBatch(job);
      this.jobs.delete(id);
      this.order = this.order.filter((entry) => entry !== id);
    }
  }

  cancel(id: string): boolean {
    const job = this.jobs.get(id);
    if (!job || !PENDING_STATUSES.includes(job.status)) return false;
    this.queue = this.queue.filter((entry) => entry.track.id !== id);
    this.controllers.get(id)?.abort();
    this.markTerminal(job, "cancelled", job.loaded, job.total, "Download cancelled.");
    this.emit();
    this.pump();
    return true;
  }

  retry(id: string): boolean {
    const job = this.jobs.get(id);
    if (!job || PENDING_STATUSES.includes(job.status) || this.records.has(id)) return false;
    if (!resolveDownloadSource(job as Track)) {
      this.markTerminal(
        job,
        "unavailable",
        0,
        getDownloadTestFileSize(id) ?? job.total,
        "This song has no legally downloadable audio source.",
      );
      this.emit();
      return false;
    }

    const batch = this.batchFor(job);
    if (batch) {
      const key = this.batchKey(job.status);
      if (key) batch[key] = Math.max(0, batch[key] - 1);
      batch.queued++;
      batch.done = false;
      batch.finishedAt = undefined;
      batch.successful = true;
    }

    job.status = "queued";
    job.error = undefined;
    job.loaded = 0;
    job.total = getDownloadTestFileSize(id) ?? job.total;
    job.startedAt = undefined;
    job.finishedAt = undefined;
    const original = this.tracks.get(id);
    const track: Track = original
      ? { ...original }
      : {
          id: job.id,
          title: job.title,
          artist: job.artist,
          album: job.album,
          coverUrl: job.coverUrl,
          duration: job.duration,
          previewUrl: job.previewUrl,
          downloadUrl: job.downloadUrl,
          downloadMimeType: job.downloadMimeType,
          fileSize: job.fileSize,
          source: job.source as Track["source"],
          isTest: job.isTest,
          youtubeId: job.youtubeId,
        };
    this.tracks.set(id, track);
    this.queue.push({
      track,
      group:
        job.groupKind && job.groupId && job.groupTitle
          ? {
              kind: job.groupKind,
              id: job.groupId,
              title: job.groupTitle,
              index: job.groupIndex,
              total: job.groupTotal,
            }
          : undefined,
      groupIndex: job.groupIndex,
      groupTotal: job.groupTotal,
      batchId: job.batchId ?? "retry",
    });
    this.emit();
    this.pump();
    return true;
  }

  async remove(id: string): Promise<void> {
    this.queue = this.queue.filter((entry) => entry.track.id !== id);
    const job = this.jobs.get(id);
    if (job) this.detachFromBatch(job);
    this.controllers.get(id)?.abort();
    this.controllers.delete(id);
    this.running.delete(id);
    this.jobs.delete(id);
    this.tracks.delete(id);
    this.order = this.order.filter((entry) => entry !== id);
    try {
      await audioStorage.remove(id);
      this.records.delete(id);
    } finally {
      this.emit();
      for (const listener of this.removedListeners) {
        try {
          await listener(id);
        } catch {
          // Library sync can retry independently of local removal.
        }
      }
      this.pump();
    }
  }

  clearFinished(): void {
    const removable = this.order.filter((id) => {
      const job = this.jobs.get(id);
      return job ? TERMINAL_STATUSES.includes(job.status) : false;
    });
    for (const id of removable) {
      const job = this.jobs.get(id);
      if (job) this.detachFromBatch(job);
      this.jobs.delete(id);
    }
    const removableSet = new Set(removable);
    this.order = this.order.filter((entry) => !removableSet.has(entry));
    this.emit();
  }

  /** Signs out / clears this device: aborts work and forgets local state. */
  reset(): void {
    for (const controller of this.controllers.values()) controller.abort();
    this.controllers.clear();
    this.queue = [];
    this.running.clear();
    this.jobs.clear();
    this.tracks.clear();
    this.records.clear();
    this.batches.clear();
    this.batchOrder = [];
    this.order = [];
    this.emit();
  }

  // ── Worker ───────────────────────────────────────────────────────────────
  private pump() {
    if (!this.online) return;
    while (this.running.size < CONCURRENCY && this.queue.length > 0) {
      const entry = this.queue.shift()!;
      if (this.running.has(entry.track.id)) continue;
      const job = this.jobs.get(entry.track.id);
      if (!job || job.status !== "queued") continue;
      void this.run(entry, job);
    }
  }

  private async run(entry: QueueEntry, job: DownloadJob): Promise<void> {
    const source = resolveDownloadSource(entry.track);
    if (!source) {
      this.markTerminal(
        job,
        "unavailable",
        0,
        job.total,
        "This song has no legally downloadable audio source.",
      );
      this.emit();
      this.pump();
      return;
    }
    if (!this.online) {
      job.status = "queued";
      this.queue.unshift(entry);
      this.emit();
      return;
    }

    const controller = new AbortController();
    this.offlineInterrupted.delete(job.id);
    this.controllers.set(job.id, controller);
    this.running.add(job.id);
    job.status = "downloading";
    job.loaded = 0;
    job.error = undefined;
    job.startedAt = Date.now();
    this.emit();

    try {
      const response = await fetch(source.url, {
        signal: controller.signal,
        cache: "no-store",
        credentials: "same-origin",
      });
      if (!response.ok) {
        throw new Error(
          response.status === 404
            ? "The audio file was not found."
            : `The audio source refused the download (${response.status}).`,
        );
      }

      const contentType = (response.headers.get("Content-Type") || source.mimeType)
        .split(";")[0]
        .trim()
        .toLowerCase();
      if (contentType.includes("text/html") || contentType.includes("application/json")) {
        throw new Error("The audio source returned an error page, not audio.");
      }

      const declared = Number(response.headers.get("Content-Length")) || source.expectedSize || 0;
      job.total = declared > 0 ? declared : job.total;

      const reader = response.body?.getReader();
      const chunks: Uint8Array[] = [];
      let received = 0;

      if (!reader) {
        const blob = await response.blob();
        received = blob.size;
        chunks.push(new Uint8Array(await blob.arrayBuffer()));
        job.loaded = received;
        this.emit();
      } else {
        for (;;) {
          const { done, value } = await reader.read();
          if (done) break;
          if (!value) continue;
          chunks.push(value);
          received += value.byteLength;
          job.loaded = received;
          // Emit every real chunk so the UI reflects streamed bytes, not a timer.
          this.emit();
        }
      }

      if (controller.signal.aborted) throw new DOMException("Aborted", "AbortError");
      if (received < MIN_VALID_AUDIO_BYTES) {
        throw new Error("The audio source returned an empty file.");
      }
      if (job.total > 0 && received < job.total * 0.98) {
        throw new Error("The download was interrupted before the full file arrived.");
      }
      if (!looksLikeAudio(chunks[0] ?? new Uint8Array(), contentType)) {
        throw new Error("The downloaded file is not valid audio.");
      }

      const blob = new Blob(chunks as BlobPart[], { type: contentType || source.mimeType });
      job.total = received;
      job.loaded = received;
      this.emit();

      const savedAt = Date.now();
      const groupIndex = entry.groupIndex ?? job.groupIndex;
      const groupTotal = entry.groupTotal ?? job.groupTotal;
      job.groupIndex = groupIndex;
      job.groupTotal = groupTotal;
      await audioStorage.save({
        id: job.id,
        blob,
        savedAt,
        size: received,
        mimeType: contentType || source.mimeType,
        sourceId: source.sourceId,
        title: job.title,
        artist: job.artist,
        album: job.album,
        coverUrl: job.coverUrl,
        duration: job.duration,
        youtubeId: job.youtubeId,
        groupKind: entry.group?.kind,
        groupId: entry.group?.id,
        groupTitle: entry.group?.title,
        groupIndex,
        groupTotal,
      });

      const record: DownloadCompletedRecord = {
        id: job.id,
        title: job.title,
        artist: job.artist,
        album: job.album,
        coverUrl: job.coverUrl,
        duration: job.duration,
        size: received,
        savedAt,
        youtubeId: job.youtubeId,
        groupKind: entry.group?.kind,
        groupId: entry.group?.id,
        groupTitle: entry.group?.title,
        groupIndex,
        groupTotal,
      };
      this.records.set(job.id, record);
      this.markTerminal(job, "completed", received, received);
      this.emit();

      for (const listener of this.completedListeners) {
        try {
          await listener(record);
        } catch {
          // The file is safe; library metadata sync can retry.
        }
      }
    } catch (err) {
      if (controller.signal.aborted && this.offlineInterrupted.has(job.id)) {
        this.markTerminal(job, "failed", job.loaded, job.total, "Network interrupted. Check your connection and retry.");
      } else if (controller.signal.aborted) {
        this.markTerminal(job, "cancelled", job.loaded, job.total, "Download cancelled.");
      } else {
        this.markTerminal(job, "failed", job.loaded, job.total, classifyError(err));
      }
      this.emit();
    } finally {
      this.controllers.delete(job.id);
      this.offlineInterrupted.delete(job.id);
      this.running.delete(job.id);
      this.emit();
      this.pump();
    }
  }
}

/** The single app-wide manager. */
export const downloadManager = new DownloadManager();
