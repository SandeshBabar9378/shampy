"use client";

// Mobile-only download affordance for the full-screen player. It deliberately
// owns no storage or queue: every action and every status value comes from the
// existing useDownload hook (which reads the same PlayerContext state as the
// Downloads page). Download state is copied into local UI state inside effects,
// never read from storage during render.

import { useEffect, useRef, useState } from "react";
import { Check, Download, X } from "lucide-react";
import { useDownload } from "@/hooks/useDownload";
import type { Track } from "@/lib/types";

type ButtonState = "idle" | "downloading" | "done" | "failed";

const RING_RADIUS = 9;
const RING_LENGTH = 2 * Math.PI * RING_RADIUS;

function ProgressRing({ progress }: { progress: number }) {
  const clamped = Math.max(0, Math.min(1, progress || 0));
  return (
    <svg className="shubhu-mp-downloadRing" viewBox="0 0 24 24" aria-hidden="true">
      <circle className="shubhu-mp-downloadRingTrack" cx="12" cy="12" r={RING_RADIUS} />
      <circle
        className="shubhu-mp-downloadRingValue"
        cx="12"
        cy="12"
        r={RING_RADIUS}
        strokeDasharray={RING_LENGTH}
        strokeDashoffset={RING_LENGTH * (1 - clamped)}
        transform="rotate(-90 12 12)"
      />
    </svg>
  );
}

export function MobilePlayerDownloadButton({
  track,
  download,
  online,
  onNotify,
}: {
  track: Track | null;
  download: ReturnType<typeof useDownload>;
  online: boolean;
  onNotify?: (message: string) => void;
}) {
  const [state, setState] = useState<ButtonState>("idle");
  const [progress, setProgress] = useState(0);
  const failedTrackIdRef = useRef<string | null>(null);
  const clearDownloadError = download.clearError;

  // A stale failure from the previous track must not paint a cross here.
  useEffect(() => {
    failedTrackIdRef.current = null;
    clearDownloadError();
  }, [track?.id, clearDownloadError]);

  // Read the shared download state after mount only. The server render and the
  // first client render therefore agree, and no storage is touched in render.
  useEffect(() => {
    let nextState: ButtonState = "idle";
    let nextProgress = 0;

    if (track) {
      if (download.offline) {
        nextState = "done";
        nextProgress = 1;
      } else if (download.busy) {
        nextState = "downloading";
        nextProgress = download.progress ?? 0;
      } else if (download.status !== "cancelled") {
        const failed =
          download.status === "failed" ||
          download.status === "unavailable" ||
          (download.status === undefined && Boolean(download.error));
        if (failed || failedTrackIdRef.current === track.id) {
          nextState = "failed";
        }
      }
    }

    failedTrackIdRef.current = nextState === "failed" ? track?.id ?? null : null;

    // Applying in a microtask keeps the state read in the effect (never during
    // render) without a synchronous cascading render inside the effect body.
    queueMicrotask(() => {
      setState(nextState);
      setProgress(nextProgress);
    });
  }, [
    track,
    download.offline,
    download.busy,
    download.status,
    download.error,
    download.progress,
  ]);

  const hasNoTrack = !track;
  const blockedOffline = !online && state !== "done";
  const disabled = hasNoTrack || blockedOffline;

  const label = hasNoTrack
    ? "Download unavailable — no track selected"
    : blockedOffline
      ? "Download unavailable while offline"
      : state === "downloading"
        ? "Cancel download"
        : state === "done"
          ? "Downloaded to this device"
          : state === "failed"
            ? "Retry download"
            : "Download";

  const handleClick = () => {
    if (disabled) return;
    if (state === "downloading") {
      download.cancel();
      onNotify?.("Download cancelled");
      return;
    }
    if (state === "done") {
      onNotify?.("Already downloaded on this device");
      return;
    }
    if (state === "failed" && download.retry()) {
      onNotify?.("Retrying download");
      return;
    }
    void download.toggle().then((message) => {
      if (message) onNotify?.(message);
    });
  };

  return (
    <button
      type="button"
      className="shubhu-mp-downloadButton"
      onClick={handleClick}
      disabled={disabled}
      data-state={disabled ? "disabled" : state}
      aria-label={label}
      title={label}
      aria-busy={state === "downloading"}
    >
      <span key={state} className="shubhu-mp-downloadIcon">
        {state === "downloading" ? (
          <ProgressRing progress={progress} />
        ) : state === "done" ? (
          <Check />
        ) : state === "failed" ? (
          <X />
        ) : (
          <Download />
        )}
      </span>
    </button>
  );
}
