"use client";

import { usePlayer } from "@/context/PlayerContext";
import type { Track } from "@/lib/types";

/** Compact per-song status shown under album/playlist download actions on mobile. */
export function DownloadStatusList({ tracks }: { tracks: Track[] }) {
  const { offlineIds, downloadJobs, currentTrack, isPlaying } = usePlayer();
  if (tracks.length === 0) return null;

  return (
    <div className="sm:hidden mt-3 rounded-xl border border-white/10 bg-black/25 px-3 py-2">
      <p className="text-[10px] uppercase tracking-wider text-neutral-500 font-semibold mb-1.5">
        Download status
      </p>
      <div className="space-y-1">
        {tracks.map((track) => {
          const job = downloadJobs.find((item) => item.id === track.id);
          const offline = offlineIds.has(track.id);
          const isCurrent = currentTrack?.id === track.id;
          const label = offline
            ? "Downloaded"
            : job?.status === "downloading"
              ? `Downloading ${Math.round(job.total > 0 ? (job.loaded / job.total) * 100 : 0)}%`
              : job?.status === "queued"
                ? "Queued"
                : job?.status === "failed"
                  ? job.error || "Failed"
                  : job?.status === "cancelled"
                    ? "Cancelled"
                    : job?.status === "unavailable"
                      ? "Unavailable"
                      : "Not downloaded";
          return (
            <div
              key={track.id}
              className={`flex items-center justify-between gap-3 rounded px-1 py-0.5 text-[11px] ${
                isCurrent ? "bg-emerald-500/10 text-emerald-400" : ""
              }`}
            >
              <span className="flex min-w-0 items-center gap-1.5 truncate">
                {isCurrent && isPlaying && (
                  <span className="w-2 h-2 shrink-0 rounded-full bg-emerald-400 animate-pulse" />
                )}
                <span className="truncate">{track.title}</span>
              </span>
              <span
                className={
                  offline
                    ? "shrink-0 text-emerald-400"
                    : job?.status === "failed" || job?.status === "unavailable"
                      ? "shrink-0 text-rose-400"
                      : "shrink-0 text-neutral-500"
                }
              >
                {label}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
