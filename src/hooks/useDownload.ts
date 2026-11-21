"use client";

import { useCallback, useEffect, useState } from "react";
import { usePlayer } from "@/context/PlayerContext";
import type { DownloadJob, DownloadStatus } from "@/lib/downloadManager";
import type { Track } from "@/lib/types";

/**
 * Download state + action for one track, shared by every menu that offers it.
 * Progress and status come from the real byte stream in DownloadManager.
 */
export function useDownload(track: Track | null) {
  const {
    offlineIds,
    downloads,
    downloadProgress,
    downloadJobs,
    downloadTrack,
    removeDownload,
    cancelDownload,
    retryDownload,
  } = usePlayer();
  const [localError, setLocalError] = useState<string | null>(null);

  const id = track?.id;
  const offline = id ? offlineIds.has(id) : false;
  const inList = id ? downloads.some((item) => item.id === id) : false;
  const job: DownloadJob | undefined = id ? downloadJobs.find((item) => item.id === id) : undefined;
  const status: DownloadStatus | undefined = job?.status ?? (offline ? "completed" : undefined);
  const busy = status === "queued" || status === "downloading";
  const streamProgress = job?.status === "downloading" && job.total > 0
    ? Math.min(1, job.loaded / job.total)
    : undefined;
  const progress = streamProgress ?? (id ? downloadProgress[id] : undefined);
  const error = (job?.status === "failed" || job?.status === "cancelled")
    ? job.error ?? null
    : localError;

  useEffect(() => {
    if (!localError) return;
    const timer = setTimeout(() => setLocalError(null), 3500);
    return () => clearTimeout(timer);
  }, [localError]);

  const label = error
    ? error
    : status === "queued"
      ? "Queued…"
      : busy
        ? `Downloading ${Math.round((progress ?? 0) * 100)}%`
        : status === "failed"
          ? "Retry download"
          : offline
            ? "Downloaded — tap to remove"
            : inList
              ? "Download to this device"
              : "Download";

  /** Returns a short message for toast-style UIs, or null if nothing to say. */
  const toggle = useCallback(async (): Promise<string | null> => {
    if (busy || !track) return null;
    if (offline) {
      await removeDownload(track);
      return "Download removed";
    }
    if (status === "failed" || status === "cancelled") {
      if (id && retryDownload(id)) return "Retrying download";
    }
    setLocalError(null);
    const result = await downloadTrack(track);
    if (!result.ok) {
      setLocalError(result.error || "Download failed");
      return result.error || "Download failed";
    }
    return "Download started";
  }, [busy, id, offline, removeDownload, downloadTrack, retryDownload, status, track]);

  const cancel = useCallback(() => {
    if (id) cancelDownload(id);
  }, [cancelDownload, id]);

  const retry = useCallback(() => {
    setLocalError(null);
    return id ? retryDownload(id) : false;
  }, [id, retryDownload]);

  const clearError = useCallback(() => setLocalError(null), []);
  const removeFromList = useCallback(async () => {
    if (track) await removeDownload(track);
  }, [removeDownload, track]);

  return {
    label,
    offline,
    inList,
    busy,
    progress,
    error,
    status,
    job,
    toggle,
    cancel,
    retry,
    clearError,
    removeFromList,
  };
}
