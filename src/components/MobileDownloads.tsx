"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import {
  AlertCircle,
  ArrowLeft,
  Check,
  ChevronRight,
  Disc3,
  Download,
  DownloadCloud,
  ListMusic,
  Pause,
  PauseCircle,
  Play,
  RotateCcw,
  Trash2,
  WifiOff,
  X,
} from "lucide-react";
import { usePlayer } from "@/context/PlayerContext";
import {
  applyStableArtworkFallback,
  getDefaultArtworkFallbackUrl,
  getStableTrackArtworkUrl,
} from "@/lib/artwork";
import { audioStorage } from "@/lib/audioStorage";
import type {
  DownloadCollectionRecord,
  DownloadCollectionTrackMeta,
} from "@/lib/downloadCollections";
import {
  countDownloadJobs,
  type DownloadBatch,
  type DownloadJob,
  type DownloadRecordMeta,
} from "@/lib/downloadManager";
import { DOWNLOAD_TEST_NOTE } from "@/lib/testDownloadProvider";
import type { Track } from "@/lib/types";

interface CollectionRow {
  meta: DownloadCollectionTrackMeta;
  track: Track;
  record?: DownloadRecordMeta;
  job?: DownloadJob;
  stored: boolean;
  order: number;
  label: string;
  progress: number | null;
  error?: string;
}

function formatBytes(bytes: number): string {
  if (!bytes || !Number.isFinite(bytes)) return "—";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function jobLabel(status: string, loaded: number, total: number, error?: string): string {
  if (status === "queued") return "Queued";
  if (status === "downloading") {
    return total > 0 ? `Downloading ${Math.round((loaded / total) * 100)}%` : "Downloading…";
  }
  if (status === "failed") return error || "Failed";
  if (status === "cancelled") return "Cancelled";
  if (status === "unavailable") return "Unavailable";
  if (status === "completed") return "Downloaded";
  return status;
}

function batchSummary(batch: DownloadBatch): string {
  const parts = [`${batch.completed}/${batch.total} completed`];
  if (batch.failed > 0) parts.push(`${batch.failed} failed`);
  if (batch.cancelled > 0) parts.push(`${batch.cancelled} cancelled`);
  if (batch.unavailable > 0) parts.push(`${batch.unavailable} unavailable`);
  if (batch.duplicates > 0) parts.push(`${batch.duplicates} already on device`);
  if (!batch.done) parts.push(`${batch.queued} queued`);
  return parts.join(" · ");
}

function metaToTrack(meta: DownloadCollectionTrackMeta, downloads: Track[]): Track {
  const known = downloads.find((track) => track.id === meta.id);
  if (known) {
    return {
      ...known,
      coverUrl: known.coverUrl || meta.coverUrl,
      youtubeId: known.youtubeId ?? meta.youtubeId,
      duration: known.duration || meta.duration,
    };
  }
  return {
    id: meta.id,
    title: meta.title || meta.id,
    artist: meta.artist || "Unknown artist",
    album: meta.album || "Downloads",
    coverUrl: meta.coverUrl || getDefaultArtworkFallbackUrl(),
    duration: meta.duration || 0,
    youtubeId: meta.youtubeId,
  };
}

function collectionArtwork(collection: DownloadCollectionRecord): string {
  return (
    collection.artworkUrl ||
    collection.trackMetas.find((meta) => meta.coverUrl)?.coverUrl ||
    getDefaultArtworkFallbackUrl()
  );
}

export function MobileDownloads({ onBack }: { onBack: () => void }) {
  const {
    downloads,
    downloadRecords,
    downloadJobs,
    downloadBatches,
    downloadOnline,
    downloadCollections,
    downloadTestPlaylist,
    downloadTestPlaylistVisible,
    hideDownloadTestPlaylist,
    downloadTracks,
    currentTrack,
    isPlaying,
    playTrack,
    togglePlay,
    offlineIds,
    removeTrackFromDownloadCollection,
    deleteDownloadedAudio,
    retryDownload,
    cancelDownload,
    clearFinishedDownloads,
  } = usePlayer();
  const [notice, setNotice] = useState<string | null>(null);
  const [storage, setStorage] = useState<{ usage: number; quota: number } | null>(null);
  const [selectedCollectionId, setSelectedCollectionId] = useState<string | null>(null);
  const [deleteCandidateId, setDeleteCandidateId] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void audioStorage.estimate().then((estimate) => {
      if (!cancelled) setStorage(estimate);
    });
    return () => {
      cancelled = true;
    };
  }, [downloadRecords]);

  const counts = useMemo(() => countDownloadJobs(downloadJobs), [downloadJobs]);

  const buildRows = (collection: DownloadCollectionRecord): CollectionRow[] =>
    collection.trackMetas
      .map((meta, index) => {
        const record = downloadRecords.find((item) => item.id === meta.id);
        const job = downloadJobs.find((item) => item.id === meta.id);
        const stored = Boolean(record || offlineIds.has(meta.id));
        const pendingLabel =
          job && job.status !== "completed"
            ? jobLabel(job.status, job.loaded, job.total, job.error)
            : null;

        return {
          meta,
          track: metaToTrack(meta, downloads),
          record,
          job,
          stored,
          order: meta.groupIndex ?? index,
          label: pendingLabel ?? (stored ? `Downloaded · ${formatBytes(record?.size ?? 0)}` : "Not downloaded"),
          progress:
            job?.status === "downloading" && job.total > 0
              ? Math.min(1, job.loaded / job.total)
              : null,
          error: job && (job.status === "failed" || job.status === "cancelled") ? pendingLabel ?? undefined : undefined,
        };
      })
      .sort((a, b) => a.order - b.order);

  const visibleCollections = useMemo(
    () =>
      downloadCollections.filter((collection) => {
        if (collection.trackMetas.length === 0) return false;
        const hasStored = downloadRecords.some((record) => collection.trackIds.includes(record.id));
        const hasJob = downloadJobs.some((job) => job.groupId === collection.id);
        return hasStored || hasJob;
      }),
    [downloadCollections, downloadRecords, downloadJobs],
  );

  const selectedCollection = selectedCollectionId
    ? downloadCollections.find((collection) => collection.id === selectedCollectionId) ?? null
    : null;
  const selectedRows = selectedCollection ? buildRows(selectedCollection) : [];
  const playableTracks = selectedRows.filter((row) => row.stored).map((row) => row.track);

  const handleDownloadTestPlaylist = async () => {
    const tracks = downloadTestPlaylist.tracks ?? [];
    const result = await downloadTracks(tracks, {
      kind: "playlist",
      id: `playlist:${downloadTestPlaylist.id}`,
      title: downloadTestPlaylist.name,
      index: 0,
      total: tracks.length,
      artworkUrl: downloadTestPlaylist.coverUrl || undefined,
      description: downloadTestPlaylist.description || undefined,
    });
    setNotice(
      result.added.length > 0
        ? `Queued ${result.added.length} test song${result.added.length === 1 ? "" : "s"}.`
        : result.duplicates.length > 0
          ? "All test songs are already downloaded or queued."
          : "No test songs available.",
    );
  };

  const handlePlayCollection = (collection: DownloadCollectionRecord) => {
    const tracks = buildRows(collection)
      .filter((row) => row.stored)
      .map((row) => row.track);
    if (tracks.length === 0) {
      setNotice("No songs from this collection are stored on this device yet.");
      return;
    }
    void playTrack(tracks[0], tracks);
  };

  const handleRemoveFromCollection = async (
    collection: DownloadCollectionRecord,
    track: Track,
  ) => {
    await removeTrackFromDownloadCollection(collection.id, track.id);
    setNotice(`Removed “${track.title}” from ${collection.name}. The audio file is kept.`);
  };

  const handlePermanentDelete = async (track: Track) => {
    await deleteDownloadedAudio(track);
    setDeleteCandidateId(null);
    setNotice(`Permanently deleted “${track.title}” from this device.`);
  };

  const renderManager = () => (
    <section className="rounded-2xl border border-neutral-800 bg-neutral-950/40 p-4">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-bold text-white">Download Manager</h2>
        {counts.completed + counts.failed + counts.cancelled > 0 && (
          <button
            onClick={clearFinishedDownloads}
            className="text-[11px] text-neutral-400 hover:text-white cursor-pointer"
          >
            Clear finished
          </button>
        )}
      </div>
      <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-[11px]">
        <span className="text-neutral-400">Pending: <b className="text-white">{counts.pending}</b></span>
        <span className="text-neutral-400">Completed: <b className="text-emerald-400">{counts.completed}</b></span>
        <span className="text-neutral-400">Failed: <b className="text-rose-400">{counts.failed}</b></span>
        <span className="text-neutral-400">Skipped: <b className="text-neutral-300">{counts.unavailable}</b></span>
      </div>
      {!downloadOnline && (
        <p className="mt-2 flex items-center gap-2 rounded-lg bg-amber-400/10 px-3 py-2 text-[11px] text-amber-200">
          <WifiOff className="w-4 h-4" />
          Offline — queued downloads will resume when the connection returns.
        </p>
      )}
      {downloadBatches.length > 0 && (
        <div className="mt-3 space-y-1.5 border-t border-neutral-800 pt-3">
          <p className="text-[10px] uppercase tracking-wider text-neutral-500 font-semibold">
            Batch results
          </p>
          {downloadBatches.slice(-6).reverse().map((batch) => (
            <div key={batch.id} className="flex items-start justify-between gap-3 text-[11px]">
              <span className="min-w-0 truncate text-neutral-300">
                {batch.kind ? `${batch.kind}: ` : ""}{batch.title}
              </span>
              <span
                className={
                  !batch.done
                    ? "shrink-0 text-neutral-400"
                    : batch.successful
                      ? "shrink-0 text-emerald-400"
                      : "shrink-0 text-amber-300"
                }
              >
                {!batch.done ? "In progress" : batch.successful ? "Success" : "Partial"} · {batchSummary(batch)}
              </span>
            </div>
          ))}
        </div>
      )}
      {downloadJobs.length === 0 ? (
        <p className="mt-3 text-[11px] text-neutral-500">No active downloads.</p>
      ) : (
        <div className="mt-3 space-y-2">
          {downloadJobs.map((job) => (
            <div key={job.id} className="rounded-xl bg-black/30 p-3">
              <div className="flex items-center justify-between gap-2">
                <span className="truncate text-xs font-medium text-neutral-200">{job.title}</span>
                <span className="shrink-0 text-[10px] text-neutral-500">
                  {jobLabel(job.status, job.loaded, job.total, job.error)}
                </span>
              </div>
              {(job.status === "downloading" || job.status === "queued") && (
                <div className="mt-2 h-1 overflow-hidden rounded-full bg-white/10">
                  <div
                    className="h-full rounded-full bg-emerald-400 transition-all"
                    style={{
                      width:
                        job.status === "downloading" && job.total > 0
                          ? `${Math.min(100, (job.loaded / job.total) * 100)}%`
                          : "0%",
                    }}
                  />
                </div>
              )}
              {job.error && job.status !== "completed" && (
                <p className="mt-1.5 flex items-start gap-1.5 text-[11px] text-rose-300">
                  <AlertCircle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                  <span className="flex-1">{job.error}</span>
                </p>
              )}
              {(job.status === "queued" || job.status === "downloading") && (
                <button
                  onClick={() => cancelDownload(job.id)}
                  className="mt-2 inline-flex items-center gap-1 text-[11px] text-rose-300 cursor-pointer"
                >
                  <PauseCircle className="w-3.5 h-3.5" />
                  Cancel
                </button>
              )}
              {(job.status === "failed" || job.status === "cancelled") && (
                <button
                  onClick={() => retryDownload(job.id)}
                  className="mt-2 inline-flex items-center gap-1 text-[11px] text-emerald-300 cursor-pointer"
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                  Retry
                </button>
              )}
            </div>
          ))}
        </div>
      )}
    </section>
  );

  return (
    <div className="space-y-6 animate-in fade-in duration-200">
      {selectedCollection ? (
        <>
          <button
            onClick={() => {
              setSelectedCollectionId(null);
              setDeleteCandidateId(null);
            }}
            className="inline-flex items-center gap-2 text-sm text-neutral-400 hover:text-white cursor-pointer"
          >
            <ArrowLeft className="w-4 h-4" />
            Back to collections
          </button>

          <div className="rounded-2xl border border-emerald-500/20 bg-gradient-to-b from-emerald-500/20 via-neutral-950/60 to-neutral-950/40 p-5">
            <div className="flex items-start gap-4">
              <img
                src={getStableTrackArtworkUrl({ coverUrl: collectionArtwork(selectedCollection) }, "hq")}
                alt=""
                className="w-16 h-16 rounded-xl object-cover bg-neutral-800 shrink-0"
                onError={(event) => applyStableArtworkFallback(event.currentTarget)}
              />
              <div className="min-w-0 flex-1">
                <p className="text-[10px] uppercase font-bold tracking-wider text-emerald-300">
                  {selectedCollection.kind === "songs" ? "COLLECTION" : selectedCollection.kind}
                </p>
                <h1 className="text-2xl font-black text-white mt-1 truncate">{selectedCollection.name}</h1>
                {selectedCollection.author && (
                  <p className="text-xs text-neutral-300 mt-1">{selectedCollection.author}</p>
                )}
                {selectedCollection.description && (
                  <p className="text-[11px] text-neutral-500 mt-1">{selectedCollection.description}</p>
                )}
                <p className="text-xs text-neutral-300 mt-2">
                  {selectedRows.filter((row) => row.stored).length}/{selectedRows.length} songs on this device
                </p>
              </div>
            </div>
            <button
              onClick={() => handlePlayCollection(selectedCollection)}
              className="mt-4 inline-flex items-center gap-2 rounded-full bg-emerald-500 px-4 py-2 text-xs font-bold text-black cursor-pointer disabled:opacity-40"
              disabled={playableTracks.length === 0}
            >
              <Play className="w-4 h-4 fill-black" />
              Play downloaded songs
            </button>
          </div>

          {notice && <p className="text-xs text-emerald-300">{notice}</p>}

          <p className="text-[11px] leading-relaxed text-neutral-500">
            <b className="text-neutral-300">Remove</b> only changes this collection; the shared audio file is
            kept. <b className="text-neutral-300">Delete file</b> permanently removes the downloaded audio from
            this device.
          </p>

          <div className="rounded-2xl border border-neutral-900/60 bg-neutral-950/40 divide-y divide-neutral-900">
            {selectedRows.map((row) => {
              const isCurrent = currentTrack?.id === row.track.id;
              const isActive = isCurrent && isPlaying;
              return (
                <div
                  key={`${selectedCollection.id}:${row.meta.id}`}
                  className={`p-3 transition-colors ${
                    isCurrent ? "bg-emerald-500/10 border-l-2 border-emerald-500/50" : "border-l-2 border-transparent"
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <div className="w-6 shrink-0 text-center">
                      {isActive ? (
                        <span className="w-3 h-3 block mx-auto bg-emerald-400 animate-pulse rounded-full" />
                      ) : (
                        <span className="block text-center text-[11px] text-neutral-600">
                          {row.order + 1}
                        </span>
                      )}
                    </div>
                    <img
                      src={getStableTrackArtworkUrl(row.track, "hq")}
                      alt=""
                      className="w-11 h-11 rounded object-cover bg-neutral-800 shrink-0"
                      onError={(event) => applyStableArtworkFallback(event.currentTarget)}
                    />
                    <div className="min-w-0 flex-1">
                      <p className={`truncate text-sm font-medium ${isCurrent ? "text-emerald-400" : "text-white"}`}>
                        {row.track.title}
                      </p>
                      <p className="truncate text-[11px] text-neutral-500">{row.track.artist}</p>
                      <p
                        className={`mt-0.5 flex items-center gap-1 text-[10px] ${
                          row.stored ? "text-emerald-400" : "text-neutral-500"
                        }`}
                      >
                        {row.stored && <Check className="w-3 h-3" />}
                        <span className="truncate">{row.label}</span>
                      </p>
                    </div>
                    <button
                      onClick={() => (isCurrent ? togglePlay() : void playTrack(row.track, playableTracks))}
                      className="p-1.5 text-emerald-400 cursor-pointer"
                      title={isActive ? "Pause" : `Play ${row.track.title}`}
                    >
                      {isActive ? (
                        <Pause className="w-4 h-4 fill-emerald-400" />
                      ) : (
                        <Play className="w-4 h-4 fill-emerald-400" />
                      )}
                    </button>
                    {(row.job?.status === "failed" || row.job?.status === "cancelled") && (
                      <button
                        onClick={() => retryDownload(row.track.id)}
                        className="p-1.5 text-amber-300 cursor-pointer"
                        title={`Retry ${row.track.title}`}
                      >
                        <RotateCcw className="w-4 h-4" />
                      </button>
                    )}
                    <button
                      onClick={() => void handleRemoveFromCollection(selectedCollection, row.track)}
                      className="p-1.5 text-neutral-500 hover:text-amber-300 cursor-pointer"
                      title={`Remove ${row.track.title} from ${selectedCollection.name}`}
                    >
                      <X className="w-4 h-4" />
                    </button>
                    {row.stored && (
                      <button
                        onClick={() => setDeleteCandidateId(row.track.id)}
                        className="p-1.5 text-neutral-500 hover:text-rose-400 cursor-pointer"
                        title={`Permanently delete downloaded audio for ${row.track.title}`}
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    )}
                  </div>

                  {row.progress !== null && (
                    <div className="ml-9 mt-2 h-1 overflow-hidden rounded-full bg-white/10">
                      <div
                        className="h-full rounded-full bg-emerald-400 transition-all"
                        style={{ width: `${Math.round(row.progress * 100)}%` }}
                      />
                    </div>
                  )}
                  {row.error && (
                    <p className="ml-9 mt-1.5 text-[11px] text-rose-300">{row.error}</p>
                  )}
                  {deleteCandidateId === row.track.id && (
                    <div className="ml-9 mt-2 flex items-center gap-3 rounded-lg bg-rose-500/10 px-3 py-2">
                      <span className="flex-1 text-[11px] text-rose-200">
                        Delete the stored file everywhere? This cannot be undone.
                      </span>
                      <button
                        onClick={() => setDeleteCandidateId(null)}
                        className="text-[11px] text-neutral-300 cursor-pointer"
                      >
                        Cancel
                      </button>
                      <button
                        onClick={() => void handlePermanentDelete(row.track)}
                        className="text-[11px] font-bold text-rose-300 cursor-pointer"
                      >
                        Delete file
                      </button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </>
      ) : (
        <>
          <button
            onClick={onBack}
            className="inline-flex items-center gap-2 text-sm text-neutral-400 hover:text-white cursor-pointer"
          >
            <ArrowLeft className="w-4 h-4" />
            Back to library
          </button>

          <div className="rounded-2xl border border-emerald-500/20 bg-gradient-to-b from-emerald-500/20 via-neutral-950/60 to-neutral-950/40 p-5">
            <p className="text-[10px] uppercase font-bold tracking-wider text-emerald-300">ON THIS DEVICE</p>
            <h1 className="text-3xl font-black text-white mt-1">Downloads</h1>
            <p className="text-xs text-neutral-300 mt-2">
              {downloadRecords.length} song{downloadRecords.length === 1 ? "" : "s"} stored as real audio files
            </p>
            {storage && storage.quota > 0 && (
              <p className="text-[11px] text-neutral-500 mt-1">
                {formatBytes(storage.usage)} used of {formatBytes(storage.quota)} available
              </p>
            )}
          </div>

          {notice && <p className="text-xs text-emerald-300">{notice}</p>}

          {downloadTestPlaylistVisible && (
            <div className="rounded-2xl border border-amber-400/30 bg-amber-400/10 p-4">
              <div className="flex items-start gap-3">
                <DownloadCloud className="w-5 h-5 text-amber-300 shrink-0 mt-0.5" />
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold text-amber-100">Download Test Playlist</p>
                  <p className="text-[11px] text-amber-200/80 leading-snug mt-1">{DOWNLOAD_TEST_NOTE}</p>
                  <div className="mt-3 flex flex-wrap gap-2">
                    <button
                      onClick={() => void handleDownloadTestPlaylist()}
                      className="inline-flex items-center gap-1.5 rounded-full bg-emerald-500 px-3 py-1.5 text-[11px] font-bold text-black cursor-pointer"
                    >
                      <Download className="w-3.5 h-3.5" />
                      Download Playlist
                    </button>
                    <Link
                      href="/album/download-test-samples"
                      className="inline-flex items-center gap-1.5 rounded-full border border-amber-300/40 px-3 py-1.5 text-[11px] font-semibold text-amber-100"
                    >
                      Download Album
                    </Link>
                    <button
                      onClick={hideDownloadTestPlaylist}
                      className="inline-flex items-center gap-1 rounded-full px-2 py-1.5 text-[11px] text-neutral-300 cursor-pointer"
                    >
                      <X className="w-3 h-3" />
                      Remove test playlist
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )}

          {renderManager()}

          <section className="space-y-2">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-bold text-white">Collections</h2>
              <span className="text-[10px] text-neutral-500">
                {visibleCollections.length} on this device
              </span>
            </div>

            <div className="space-y-2">
              {visibleCollections.map((collection) => {
                const rows = buildRows(collection);
                const storedCount = rows.filter((row) => row.stored).length;
                const playingRow = rows.find((row) => row.track.id === currentTrack?.id);
                const KindIcon = collection.kind === "playlist" ? ListMusic : Disc3;
                return (
                  <div
                    key={collection.id}
                    className="rounded-2xl border border-neutral-800 bg-neutral-950/50 p-3"
                  >
                    <button
                      onClick={() => {
                        setSelectedCollectionId(collection.id);
                        setDeleteCandidateId(null);
                      }}
                      className="flex w-full items-center gap-3 text-left cursor-pointer"
                    >
                      <img
                        src={getStableTrackArtworkUrl({ coverUrl: collectionArtwork(collection) }, "hq")}
                        alt=""
                        className="w-14 h-14 rounded-xl object-cover bg-neutral-800 shrink-0"
                        onError={(event) => applyStableArtworkFallback(event.currentTarget)}
                      />
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-1.5">
                          <KindIcon className="w-3 h-3 shrink-0 text-emerald-400" />
                          <span className="text-[10px] font-bold tracking-wider text-emerald-400 uppercase">
                            {collection.kind === "songs" ? "Downloaded Songs" : collection.kind}
                          </span>
                        </div>
                        <p className="truncate text-sm font-semibold text-white mt-0.5">{collection.name}</p>
                        <p className="text-[11px] text-neutral-500 mt-0.5">
                          {storedCount}/{rows.length} downloaded
                        </p>
                        {playingRow && (
                          <p className="mt-1 flex items-center gap-1.5 text-[10px] text-emerald-400">
                            <span
                              className={`w-2 h-2 rounded-full bg-emerald-400 ${isPlaying ? "animate-pulse" : ""}`}
                            />
                            {isPlaying ? "Now playing" : "Current song"}: {playingRow.track.title}
                          </p>
                        )}
                      </div>
                      <ChevronRight className="w-4 h-4 text-neutral-600 shrink-0" />
                    </button>
                    <div className="mt-2 flex justify-end border-t border-neutral-900 pt-2">
                      <button
                        onClick={() => handlePlayCollection(collection)}
                        className="inline-flex items-center gap-1.5 text-[11px] font-semibold text-emerald-300 cursor-pointer disabled:opacity-40"
                        disabled={storedCount === 0}
                      >
                        <Play className="w-3.5 h-3.5 fill-emerald-300" />
                        Play
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>

            {visibleCollections.length === 0 && downloadRecords.length === 0 && downloadJobs.length === 0 && (
              <div className="py-14 text-center text-neutral-500">
                <DownloadCloud className="w-14 h-14 mx-auto mb-3 opacity-40" />
                <p className="text-sm font-semibold text-neutral-300">No downloads yet</p>
                <p className="text-[11px] mt-1">Use a song’s ⋮ menu or the test playlist above.</p>
              </div>
            )}
          </section>
        </>
      )}
    </div>
  );
}
