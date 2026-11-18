"use client";

import { useCallback, useEffect, useState } from "react";
import { usePlayer } from "@/context/PlayerContext";
import type { Track } from "@/lib/types";

/**
 * Download state + action for one track, shared by every menu that offers it.
 *  - offline:    the audio is stored on this device
 *  - inList:     it is in the account's synced Downloads list (maybe from another device)
 *  - progress:   0..1 while downloading, otherwise undefined
 */
export function useDownload(track: Track | null) {
  const { offlineIds, downloads, downloadProgress, downloadTrack, removeDownload } = usePlayer();
  const [error, setError] = useState<string | null>(null);

  const id = track?.id;
  const offline = id ? offlineIds.has(id) : false;
  const inList = id ? downloads.some((t) => t.id === id) : false;
  const progress = id ? downloadProgress[id] : undefined;
  const busy = progress !== undefined;

  useEffect(() => {
    if (!error) return;
    const t = setTimeout(() => setError(null), 3500);
    return () => clearTimeout(t);
  }, [error]);

  const label = error
    ? error
    : busy
      ? `Downloading ${Math.round(progress * 100)}%`
      : offline
        ? "Remove download"
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
    const result = await downloadTrack(track);
    if (!result.ok) {
      setError(result.error || "Download failed");
      return result.error || "Download failed";
    }
    return "Downloaded for offline listening";
  }, [busy, offline, removeDownload, downloadTrack, track]);

  /** Drops the song from the synced Downloads list (and this device's copy). */
  const removeFromList = useCallback(async () => {
    if (track) await removeDownload(track);
  }, [removeDownload, track]);

  return { label, offline, inList, busy, progress, error, toggle, removeFromList };
}
