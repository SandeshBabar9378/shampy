"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Captions,
  Check,
  ChevronDown,
  Download,
  DownloadCloud,
  GripVertical,
  ListMusic,
  Loader2,
  Moon,
  MoreVertical,
  Music2,
  Pause,
  Play,
  Plus,
  Quote,
  Share2,
  SkipBack,
  SkipForward,
  Timer,
  UserRound,
  X,
} from "lucide-react";
import {
  usePlayer,
  type SleepTimerOption,
} from "@/context/PlayerContext";
import { useDominantColor } from "@/hooks/useDominantColor";
import {
  AnimatedHeart,
  AnimatedRepeat,
  AnimatedShuffle,
} from "@/components/animations/MotionIcons";
import { useDownload } from "@/hooks/useDownload";
import { applyStableArtworkFallback, getStableTrackArtworkUrl } from "@/lib/artwork";
import { Track } from "@/lib/types";
import { ReorderableList } from "@/components/ReorderableList";
import { parseLRC, type LyricLine } from "@/lib/lyrics";
import { hasNonLatinLetters } from "@/lib/transcript";
import { loadTranscripts } from "@/lib/transcriptClient";
import "./MobilePlayer.css";

type MobileView = "player" | "lyrics" | "queue";

const ACCENT = "var(--mp-accent-text)";

function formatTime(seconds: number): string {
  if (!isFinite(seconds) || seconds < 0) return "0:00";
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s < 10 ? "0" : ""}${s}`;
}

// The full mobile player is deliberately confined to this component. It is
// rendered only inside the `sm:hidden` mobile branch of Player.tsx, so none of
// the desktop components (desktop bar, NowPlayingFullscreen, panels) change.
// Every action below delegates to the shared PlayerContext — there is no
// second playback engine, queue, playlist store or sleep timer.
export function MobilePlayer({ onClose }: { onClose: () => void }) {
  const router = useRouter();
  const {
    currentTrack,
    isPlaying,
    currentTime,
    duration,
    seek,
    togglePlay,
    nextTrack,
    prevTrack,
    isShuffle,
    toggleShuffle,
    isRepeat,
    toggleRepeat,
    isResolving,
    likedSongIds,
    toggleLike,
    playlists,
    addToPlaylist,
    createPlaylist,
    queue,
    setAppQueue,
    currentIndex,
    playTrack,
    sleepEndsAt,
    sleepRemainingSeconds,
    sleepAtEndOfSong,
    selectSleepTimer,
    cancelSleepTimer,
    playbackError,
    clearPlaybackError,
  } = usePlayer();

  const [view, setView] = useState<MobileView>("player");
  const [showMenu, setShowMenu] = useState(false);
  const [showPlaylistSheet, setShowPlaylistSheet] = useState(false);
  const [showSleepSheet, setShowSleepSheet] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  const [isSeeking, setIsSeeking] = useState(false);
  const [seekVal, setSeekVal] = useState(0);

  // Lyrics (same /api/lyrics source as the existing full-screen lyrics view).
  const [lyricLines, setLyricLines] = useState<LyricLine[]>([]);
  const [lyricsLoading, setLyricsLoading] = useState(false);
  const [activeLyric, setActiveLyric] = useState(-1);
  const [manualScrollUntil, setManualScrollUntil] = useState(0);
  const lyricsScrollRef = useRef<HTMLDivElement | null>(null);

  // Lyrics sheet expansion (Apple Music style). Compact by default so the
  // standard playback controls stay visible; expanding is a purely visual,
  // mobile-only state and never touches playback or desktop components.
  const [lyricsExpanded, setLyricsExpanded] = useState(false);
  const lyricsScrollTopRef = useRef<number | null>(null);
  const lyricsScrollUpRef = useRef(0);
  const lyricsExpandLockRef = useRef(0);

  // Transcript (Roman script) is a real, mobile-only toggle that defaults OFF.
  // It reuses the same /api/transcribe endpoint, validation and cache key as
  // the laptop lyrics view.
  const [transcriptEnabled, setTranscriptEnabled] = useState(false);
  const [transcriptions, setTranscriptions] = useState<string[]>([]);
  const [transcriptLoading, setTranscriptLoading] = useState(false);
  const [transcriptDisabled, setTranscriptDisabled] = useState(false);

  // Add-to-playlist sheet state.
  const [selectedPlaylists, setSelectedPlaylists] = useState<string[]>([]);
  const [newPlaylistName, setNewPlaylistName] = useState("");

  // Sleep timer sheet state.
  const [selectedSleepOption, setSelectedSleepOption] = useState<SleepTimerOption | null>(null);
  const [customMinutes, setCustomMinutes] = useState("");

  // ── Drag-to-minimize (main player) ──────────────────────────────────────────
  // Purely presentational: the player sheet follows the finger, then either
  // snaps back or slides off-screen before `onClose()` reveals the mini-player.
  // Playback lives in PlayerContext, so nothing pauses or unmounts early.
  const [minimizeY, setMinimizeY] = useState(0);
  const [minimizePhase, setMinimizePhase] = useState<"idle" | "dragging" | "settling">("idle");
  const minimizeGestureRef = useRef<{
    id: number;
    startY: number;
    startX: number;
    lastY: number;
    lastT: number;
    velocity: number;
    moved: boolean;
  } | null>(null);
  const minimizeTimer = useRef<number | null>(null);
  // After a real drag we swallow the synthetic click that would otherwise
  // activate the button/menu the gesture started on.
  const suppressHeaderClickUntil = useRef(0);

  // ── Shared bottom-sheet drag-to-dismiss ─────────────────────────────────────
  const [sheetDragY, setSheetDragY] = useState(0);
  const [sheetDragPhase, setSheetDragPhase] = useState<"idle" | "dragging" | "settling">("idle");
  const sheetGestureRef = useRef<{
    id: number;
    startY: number;
    lastY: number;
    lastT: number;
    velocity: number;
    moved: boolean;
  } | null>(null);
  const sheetTimer = useRef<number | null>(null);

  // Swipe state (pointer events + `touch-action: pan-y`).
  const [dragX, setDragX] = useState(0);
  const [dragging, setDragging] = useState(false);
  const dragXRef = useRef(0);
  const gestureRef = useRef<{
    id: number;
    startX: number;
    startY: number;
    axis: "none" | "x" | "y";
  } | null>(null);
  const stageRef = useRef<HTMLDivElement | null>(null);
  const [stageWidth, setStageWidth] = useState(320);

  const toastTimer = useRef<number | null>(null);
  const cover = getStableTrackArtworkUrl(currentTrack, "max");
  const dominantColor = useDominantColor(cover);
  const isLiked = currentTrack ? likedSongIds.has(currentTrack.id) : false;
  const download = useDownload(currentTrack);
  const effectiveTime = isSeeking ? seekVal : currentTime;
  const seekPercent = duration > 0 ? Math.min(100, Math.max(0, (effectiveTime / duration) * 100)) : 0;

  const sleepActive = sleepEndsAt !== null || sleepAtEndOfSong;
  const sleepCountdown = sleepAtEndOfSong ? "END" : formatTime(sleepRemainingSeconds);

  const showToast = useCallback((message: string) => {
    setToast(message);
    if (toastTimer.current !== null) window.clearTimeout(toastTimer.current);
    toastTimer.current = window.setTimeout(() => setToast(null), 2200);
  }, []);

  useEffect(() => {
    if (!playbackError) return;
    queueMicrotask(() => showToast(playbackError));
    clearPlaybackError();
  }, [playbackError, clearPlaybackError, showToast]);

  useEffect(() => {
    return () => {
      if (toastTimer.current !== null) window.clearTimeout(toastTimer.current);
      if (minimizeTimer.current !== null) window.clearTimeout(minimizeTimer.current);
      if (sheetTimer.current !== null) window.clearTimeout(sheetTimer.current);
    };
  }, []);

  // ── Dynamic artwork background: crossfade the outgoing cover into the new one ──
  const [exitingCover, setExitingCover] = useState<string | null>(null);
  const trackKey = currentTrack?.id ?? "none";
  const previousTrackKeyRef = useRef(trackKey);
  const previousCoverRef = useRef(cover);
  useEffect(() => {
    // Only a different song crossfades. Metadata/URL changes for the same
    // song (online ↔ offline) must never remount or replay the artwork.
    if (previousTrackKeyRef.current === trackKey) {
      previousCoverRef.current = cover;
      return;
    }
    setExitingCover(previousCoverRef.current);
    previousCoverRef.current = cover;
    previousTrackKeyRef.current = trackKey;
    const timeout = window.setTimeout(() => setExitingCover(null), 700);
    return () => window.clearTimeout(timeout);
  }, [trackKey, cover]);

  // ── Lyrics: fetch, sync and follow the active line ───────────────────────────
  useEffect(() => {
    if (!currentTrack) return;
    let cancelled = false;
    setLyricsLoading(true);
    setLyricLines([]);
    setActiveLyric(-1);
    setTranscriptions([]);
    setTranscriptDisabled(false);

    const query = new URLSearchParams({
      title: currentTrack.title,
      artist: currentTrack.artist || "",
      album: currentTrack.album || "",
      duration: String(currentTrack.duration || 0),
    });

    fetch(`/api/lyrics?${query.toString()}`)
      .then((res) => (res.ok ? res.json() : null))
      .then(
        (data: {
          syncedLyrics?: string | null;
          plainLyrics?: string | null;
          lines?: LyricLine[];
        } | null) => {
          if (cancelled) return;
          if (Array.isArray(data?.lines)) {
            setLyricLines(data!.lines!);
          } else if (data?.syncedLyrics) {
            setLyricLines(parseLRC(data.syncedLyrics));
          } else if (data?.plainLyrics) {
            setLyricLines(
              data.plainLyrics
                .split("\n")
                .map((text, i) => ({ time: i * 5, text: text.trim() }))
                .filter((line) => line.text.length > 0),
            );
          }
          setLyricsLoading(false);
        },
      )
      .catch(() => {
        if (!cancelled) {
          setLyricLines([]);
          setLyricsLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [currentTrack?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    let idx = -1;
    for (let i = 0; i < lyricLines.length; i++) {
      if (currentTime >= lyricLines[i].time) idx = i;
      else break;
    }
    setActiveLyric((prev) => (prev === idx ? prev : idx));
  }, [currentTime, lyricLines]);

  useEffect(() => {
    if (view !== "lyrics" || activeLyric < 0 || Date.now() < manualScrollUntil) return;
    const container = lyricsScrollRef.current;
    const line = container?.querySelector<HTMLElement>(`[data-line="${activeLyric}"]`);
    if (!container || !line) return;
    const target = line.offsetTop + line.offsetHeight / 2 - container.clientHeight / 2;
    container.scrollTo({ top: Math.max(0, target), behavior: "smooth" });
  }, [activeLyric, view, manualScrollUntil, lyricsExpanded, transcriptEnabled, transcriptions]);

  // Only fetch Roman transcripts when the toggle is actually ON. The shared
  // helper uses the laptop view's endpoint, validation and cache.
  useEffect(() => {
    if (!transcriptEnabled || view !== "lyrics" || !currentTrack || lyricLines.length === 0) {
      return;
    }
    let cancelled = false;
    setTranscriptLoading(true);
    setTranscriptDisabled(false);

    loadTranscripts(currentTrack.id, lyricLines.map((line) => line.text)).then(
      (result) => {
        if (cancelled) return;
        setTranscriptions(result.transcriptions ?? []);
        setTranscriptDisabled(result.disabled);
        setTranscriptLoading(false);
      },
    );

    return () => {
      cancelled = true;
    };
  }, [transcriptEnabled, view, currentTrack?.id, lyricLines]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Swipe helpers ────────────────────────────────────────────────────────────
  useEffect(() => {
    const stage = stageRef.current;
    if (!stage || typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(() => setStageWidth(stage.clientWidth || 320));
    observer.observe(stage);
    return () => observer.disconnect();
  }, []);

  const swipeThreshold = Math.min(96, Math.max(56, stageWidth * 0.22));

  const playingIndex = useMemo(() => {
    const byId = queue.findIndex((track) => track.id === currentTrack?.id);
    return byId !== -1 ? byId : currentIndex;
  }, [queue, currentTrack?.id, currentIndex]);

  // The queue screen must distinguish the real current track even if it is not
  // part of the current queue (the swipe preview above falls back to
  // `currentIndex` for browsing, which is a different concern).
  const queueCurrentIndex = useMemo(
    () => queue.findIndex((track) => track.id === currentTrack?.id),
    [queue, currentTrack?.id],
  );

  // "Up Next" is the queue minus the track that is playing. Reordering that
  // visible slice maps back onto the same free slots in the full queue, so the
  // current track never shifts position while dragging around it.
  const upNextTracks = useMemo(
    () => queue.filter((_, index) => index !== queueCurrentIndex),
    [queue, queueCurrentIndex],
  );

  const handleQueueReorder = useCallback(
    (nextUpNext: Track[]) => {
      if (queueCurrentIndex < 0) {
        setAppQueue(nextUpNext);
        return;
      }

      const slots: number[] = [];
      for (let i = 0; i < queue.length; i += 1) {
        if (i !== queueCurrentIndex) slots.push(i);
      }

      const next = [...queue];
      slots.forEach((slot, position) => {
        next[slot] = nextUpNext[position];
      });
      setAppQueue(next);
    },
    [queue, queueCurrentIndex, setAppQueue],
  );

  const previousSong = queue.length
    ? queue[(playingIndex - 1 + queue.length) % queue.length]
    : null;
  const nextSong = queue.length ? queue[(playingIndex + 1) % queue.length] : null;

  const onSwipePointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    if (showMenu || showPlaylistSheet || showSleepSheet) return;
    gestureRef.current = {
      id: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      axis: "none",
    };
    try {
      event.currentTarget.setPointerCapture(event.pointerId);
    } catch {
      /* capture is best-effort */
    }
  };

  const setDrag = (value: number) => {
    dragXRef.current = value;
    setDragX(value);
  };

  const onSwipePointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    const gesture = gestureRef.current;
    if (!gesture || gesture.id !== event.pointerId) return;
    const dx = event.clientX - gesture.startX;
    const dy = event.clientY - gesture.startY;

    if (gesture.axis === "none") {
      if (Math.abs(dx) > 8 && Math.abs(dx) > Math.abs(dy)) gesture.axis = "x";
      else if (Math.abs(dy) > 8) gesture.axis = "y";
      else return;
    }
    if (gesture.axis !== "x") return;

    setDragging(true);
    const limit = stageWidth * 0.9;
    setDrag(Math.max(-limit, Math.min(limit, dx)));
  };

  const finishSwipe = (event: React.PointerEvent<HTMLDivElement>) => {
    const gesture = gestureRef.current;
    if (!gesture || gesture.id !== event.pointerId) return;
    gestureRef.current = null;
    const dx = dragXRef.current;
    setDragging(false);

    if (gesture.axis === "x" && Math.abs(dx) > swipeThreshold) {
      if (dx < 0) nextTrack();
      else prevTrack();
    }
    setDrag(0);
  };

  const swipeProgress = dragging
    ? Math.min(1, Math.abs(dragX) / Math.max(1, swipeThreshold))
    : 0;
  const neighbourSong = dragX < 0 ? nextSong : previousSong;
  const neighbourUrl = getStableTrackArtworkUrl(neighbourSong, "max");

  // ── Menu / sheet handlers ────────────────────────────────────────────────────
  const closeOverlays = () => {
    setShowMenu(false);
    setShowPlaylistSheet(false);
    setShowSleepSheet(false);
  };

  const openPlaylistSheet = () => {
    setSelectedPlaylists([]);
    setNewPlaylistName("");
    setShowMenu(false);
    setShowPlaylistSheet(true);
  };

  const togglePlaylistSelection = (id: string) => {
    setSelectedPlaylists((prev) =>
      prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id],
    );
  };

  const confirmAddToPlaylists = async () => {
    if (!currentTrack || selectedPlaylists.length === 0) return;
    const count = selectedPlaylists.length;
    for (const id of selectedPlaylists) {
      await addToPlaylist(id, currentTrack);
    }
    setShowPlaylistSheet(false);
    setSelectedPlaylists([]);
    showToast(`Added to ${count} playlist${count === 1 ? "" : "s"}`);
  };

  const createAndSelectPlaylist = async () => {
    const name = newPlaylistName.trim();
    if (!name) return;
    // Reuse an identically named playlist instead of creating a duplicate.
    const existing = playlists.find(
      (playlist) => playlist.name.trim().toLowerCase() === name.toLowerCase(),
    );
    if (existing) {
      setSelectedPlaylists((prev) =>
        prev.includes(existing.id) ? prev : [...prev, existing.id],
      );
      showToast("Playlist already exists — selected it");
    } else {
      const id = await createPlaylist(name);
      if (id) {
        setSelectedPlaylists((prev) => (prev.includes(id) ? prev : [...prev, id]));
        showToast("Playlist created");
      }
    }
    setNewPlaylistName("");
  };

  const sleepOptions: SleepTimerOption[] = useMemo(
    () => [
      { label: "5 minutes", seconds: 300 },
      { label: "10 minutes", seconds: 600 },
      { label: "15 minutes", seconds: 900 },
      { label: "30 minutes", seconds: 1800 },
      { label: "45 minutes", seconds: 2700 },
      { label: "60 minutes", seconds: 3600 },
    ],
    [],
  );
  const customSleepOption: SleepTimerOption = { label: "Custom Timer", seconds: -1 };
  const endOfTrackOption: SleepTimerOption = { label: "End of Current Track", seconds: null };

  const startSleepTimer = () => {
    if (!selectedSleepOption) {
      showToast("Choose a timer first");
      return;
    }
    let option: SleepTimerOption = selectedSleepOption;
    if (selectedSleepOption.seconds === -1) {
      const minutes = Number(customMinutes);
      if (!isFinite(minutes) || minutes <= 0) {
        showToast("Enter a valid number of minutes");
        return;
      }
      option = { label: `Custom (${minutes} min)`, seconds: Math.round(minutes * 60) };
    }
    // `selectSleepTimer` is the single source of truth and is additive: it
    // extends the existing deadline instead of replacing it. Do NOT cancel
    // first — that would reset a running countdown.
    const hadCountdown = sleepEndsAt !== null;
    selectSleepTimer(option);
    setShowSleepSheet(false);
    showToast(
      hadCountdown ? `Added ${option.label} to timer` : `Timer set · ${option.label}`,
    );
  };

  const cancelTimer = () => {
    cancelSleepTimer();
    setSelectedSleepOption(null);
    showToast("Timer cancelled");
  };

  const shareTrack = async () => {
    if (!currentTrack) return;
    const text = `${currentTrack.title} — ${currentTrack.artist}`;
    const url = typeof window !== "undefined" ? window.location.href : "";
    try {
      if (typeof navigator !== "undefined" && navigator.share) {
        await navigator.share({ title: currentTrack.title, text, url });
      } else if (typeof navigator !== "undefined" && navigator.clipboard) {
        await navigator.clipboard.writeText(`${text} ${url}`);
        showToast("Link copied to clipboard");
      } else {
        showToast("Sharing is not available here");
      }
    } catch {
      // The user cancelled the native share sheet — no action needed.
    }
    setShowMenu(false);
  };

  const goToArtist = () => {
    const artistId = currentTrack?.artistId;
    setShowMenu(false);
    if (artistId) {
      onClose();
      router.push(`/artist/${artistId}`);
    } else {
      showToast("Artist page not available");
    }
  };

  if (!currentTrack) return null;

  const headerTitle = view === "player" ? "Now Playing" : view === "lyrics" ? "Lyrics" : "Queue";

  // ── Lyrics / Transcript sheet expansion ────────────────────────────────────
  // Expanding only changes layout; the compact view keeps the seekbar,
  // transport controls and dock. Scrolling (below) is the primary trigger and
  // the handle remains tappable.
  const toggleLyricsExpanded = () => {
    setLyricsExpanded((expanded) => !expanded);
    setManualScrollUntil(0);
  };

  // Scroll-to-expand: while the user is manually scrolling the lyrics, going
  // further down hides the footer transport and dock; returning to the top of
  // the lyric stream reveals them again. Programmatic auto-scroll is ignored
  // (manualScrollUntil is only set by touch/wheel input), so timestamp syncing
  // can never open or close the sheet on its own.
  const handleLyricsScroll = () => {
    const container = lyricsScrollRef.current;
    if (!container) return;

    const now = Date.now();
    if (view !== "lyrics" || now >= manualScrollUntil) {
      // Keep the baseline fresh for programmatic/auto scrolling so it can
      // never be mistaken for a manual upward gesture.
      lyricsScrollTopRef.current = container.scrollTop;
      lyricsScrollUpRef.current = 0;
      return;
    }

    const top = container.scrollTop;
    const previousTop = lyricsScrollTopRef.current ?? top;
    lyricsScrollTopRef.current = top;
    const delta = top - previousTop;
    if (delta > 0) lyricsScrollUpRef.current = 0;
    else if (delta < 0) lyricsScrollUpRef.current += delta;

    if (!lyricsExpanded) {
      if (top > 36 && delta > 0 && now > lyricsExpandLockRef.current) {
        setLyricsExpanded(true);
        lyricsScrollUpRef.current = 0;
      }
      return;
    }

    if (top <= 12) {
      setLyricsExpanded(false);
      lyricsScrollUpRef.current = 0;
      lyricsExpandLockRef.current = now + 500;
    } else if (lyricsScrollUpRef.current < -60 && now > lyricsExpandLockRef.current) {
      // Scrolling back up anywhere in the stream reveals the controls again.
      setLyricsExpanded(false);
      lyricsScrollUpRef.current = 0;
      lyricsExpandLockRef.current = now + 500;
    }
  };

  // ── Drag-to-minimize (header regions of Player / Lyrics / Queue) ────────────
  // The whole designated header is the gesture area, including its buttons.
  // A tap (no movement) still activates the button; only a real vertical drag
  // turns into a minimize gesture, and its trailing click is swallowed.
  const startPlayerDrag = (event: React.PointerEvent<HTMLElement>) => {
    if (showMenu || showPlaylistSheet || showSleepSheet) return;
    if (event.pointerType === "mouse" && event.button !== 0) return;
    const target = event.target as HTMLElement;
    if (target.closest("input, textarea, select")) return;

    if (minimizeTimer.current !== null) {
      window.clearTimeout(minimizeTimer.current);
      minimizeTimer.current = null;
    }
    minimizeGestureRef.current = {
      id: event.pointerId,
      startY: event.clientY,
      startX: event.clientX,
      lastY: event.clientY,
      lastT: performance.now(),
      velocity: 0,
      moved: false,
    };
    setMinimizePhase("dragging");
  };

  const movePlayerDrag = (event: React.PointerEvent<HTMLElement>) => {
    const gesture = minimizeGestureRef.current;
    if (!gesture || gesture.id !== event.pointerId) return;
    const dy = event.clientY - gesture.startY;
    const dx = event.clientX - gesture.startX;

    if (!gesture.moved) {
      // A horizontal gesture is not a minimize drag.
      if (Math.abs(dx) > Math.abs(dy) && Math.abs(dx) > 10) {
        minimizeGestureRef.current = null;
        setMinimizePhase("idle");
        setMinimizeY(0);
        return;
      }
      if (Math.abs(dy) < 4) return;
      gesture.moved = true;
      // Capture only once the gesture is definitely a drag, so plain taps on
      // the header buttons keep their normal click target.
      try {
        event.currentTarget.setPointerCapture(event.pointerId);
      } catch {
        // Pointer capture is best-effort.
      }
    }

    const now = performance.now();
    const dt = now - gesture.lastT;
    if (dt >= 8) {
      gesture.velocity = Math.max(-4, Math.min(4, (event.clientY - gesture.lastY) / dt));
      gesture.lastY = event.clientY;
      gesture.lastT = now;
    }

    // Only downward travel minimizes; upward movement simply rests at 0.
    setMinimizeY(Math.max(0, dy));
  };

  const finishPlayerDrag = (event: React.PointerEvent<HTMLElement>) => {
    const gesture = minimizeGestureRef.current;
    if (!gesture || gesture.id !== event.pointerId) return;
    minimizeGestureRef.current = null;

    if (!gesture.moved) {
      setMinimizePhase("idle");
      setMinimizeY(0);
      return;
    }

    // The pointerup may still produce a click on the header button.
    suppressHeaderClickUntil.current = Date.now() + 500;

    const dy = Math.max(0, event.clientY - gesture.startY);
    const velocity = performance.now() - gesture.lastT > 120 ? 0 : gesture.velocity;
    const shouldMinimize = dy > 96 || (dy > 36 && velocity > 0.55);

    setMinimizePhase("settling");
    if (shouldMinimize) {
      // Slide the whole sheet down, then reveal the page underneath (which
      // still hosts the mini-player). Playback is never interrupted.
      setMinimizeY(typeof window === "undefined" ? 900 : window.innerHeight);
      minimizeTimer.current = window.setTimeout(() => {
        minimizeTimer.current = null;
        onClose();
      }, 320);
    } else {
      setMinimizeY(0);
      minimizeTimer.current = window.setTimeout(() => {
        minimizeTimer.current = null;
        setMinimizePhase("idle");
      }, 360);
    }
  };

  const cancelPlayerDrag = () => {
    if (!minimizeGestureRef.current) return;
    minimizeGestureRef.current = null;
    setMinimizePhase("settling");
    setMinimizeY(0);
    if (minimizeTimer.current !== null) window.clearTimeout(minimizeTimer.current);
    minimizeTimer.current = window.setTimeout(() => {
      minimizeTimer.current = null;
      setMinimizePhase("idle");
    }, 360);
  };

  const handleHeaderClickCapture = (event: React.MouseEvent<HTMLElement>) => {
    if (Date.now() < suppressHeaderClickUntil.current) {
      event.preventDefault();
      event.stopPropagation();
    }
  };

  // ── Drag-to-dismiss for both bottom sheets (handle + header only) ───────────
  const startSheetDrag = (event: React.PointerEvent<HTMLDivElement>) => {
    if (event.pointerType === "mouse" && event.button !== 0) return;
    const target = event.target as HTMLElement;
    // Buttons, inputs and the scrollable list keep their own gestures.
    if (target.closest("button, input")) return;
    if (!target.closest(".shubhu-mp-sheetHandle, .shubhu-mp-sheetHeader")) return;

    if (sheetTimer.current !== null) {
      window.clearTimeout(sheetTimer.current);
      sheetTimer.current = null;
    }
    sheetGestureRef.current = {
      id: event.pointerId,
      startY: event.clientY,
      lastY: event.clientY,
      lastT: performance.now(),
      velocity: 0,
      moved: false,
    };
    setSheetDragPhase("dragging");
    try {
      event.currentTarget.setPointerCapture(event.pointerId);
    } catch {
      // Pointer capture is best-effort.
    }
  };

  const moveSheetDrag = (event: React.PointerEvent<HTMLDivElement>) => {
    const gesture = sheetGestureRef.current;
    if (!gesture || gesture.id !== event.pointerId) return;
    const dy = event.clientY - gesture.startY;
    if (!gesture.moved) {
      if (Math.abs(dy) < 3) return;
      gesture.moved = true;
    }

    const now = performance.now();
    const dt = now - gesture.lastT;
    if (dt >= 8) {
      gesture.velocity = Math.max(-4, Math.min(4, (event.clientY - gesture.lastY) / dt));
      gesture.lastY = event.clientY;
      gesture.lastT = now;
    }

    setSheetDragY(Math.max(0, dy));
  };

  const finishSheetDrag = (event: React.PointerEvent<HTMLDivElement>) => {
    const gesture = sheetGestureRef.current;
    if (!gesture || gesture.id !== event.pointerId) return;
    sheetGestureRef.current = null;

    if (!gesture.moved) {
      setSheetDragPhase("idle");
      setSheetDragY(0);
      return;
    }

    const dy = Math.max(0, event.clientY - gesture.startY);
    const velocity = performance.now() - gesture.lastT > 120 ? 0 : gesture.velocity;
    const shouldDismiss = dy > 96 || (dy > 36 && velocity > 0.5);

    setSheetDragPhase("settling");
    if (shouldDismiss) {
      setSheetDragY(typeof window === "undefined" ? 900 : window.innerHeight);
      sheetTimer.current = window.setTimeout(() => {
        sheetTimer.current = null;
        setShowPlaylistSheet(false);
        setShowSleepSheet(false);
        setShowMenu(false);
        setSheetDragY(0);
        setSheetDragPhase("idle");
      }, 280);
    } else {
      // Insufficient travel: spring back without touching any sheet state
      // (selected playlists, timer choice and custom minutes all survive).
      setSheetDragY(0);
      sheetTimer.current = window.setTimeout(() => {
        sheetTimer.current = null;
        setSheetDragPhase("idle");
      }, 320);
    }
  };

  const cancelSheetDrag = () => {
    if (!sheetGestureRef.current) return;
    sheetGestureRef.current = null;
    setSheetDragPhase("settling");
    setSheetDragY(0);
    if (sheetTimer.current !== null) window.clearTimeout(sheetTimer.current);
    sheetTimer.current = window.setTimeout(() => {
      sheetTimer.current = null;
      setSheetDragPhase("idle");
    }, 320);
  };

  const sheetDragStyle =
    sheetDragY !== 0 || sheetDragPhase !== "idle"
      ? { transform: `translateY(${sheetDragY}px)` }
      : undefined;
  const sheetDragClass =
    sheetDragPhase === "dragging"
      ? "shubhu-mp-sheetDragging"
      : sheetDragPhase === "settling"
        ? "shubhu-mp-sheetSnapping"
        : "";


  const toggleTranscript = () => {
    const next = !transcriptEnabled;
    setTranscriptEnabled(next);
    setShowMenu(false);
    if (next) {
      // Transcript now follows the same compact-first flow as Lyrics.
      setView("lyrics");
      setLyricsExpanded(false);
      setManualScrollUntil(0);
    } else {
      setLyricsExpanded(false);
    }
  };

  // Word-by-word highlight driven by the real playback timestamp. The line's
  // duration is the gap to the next timestamp (or the track duration for the
  // final line) — no invented timers.
  const renderLyricText = (text: string, index: number, isActive: boolean) => {
    if (!isActive) return text || "\u00A0";
    const words = text.split(/\s+/).filter(Boolean);
    if (words.length === 0) return "\u00A0";

    const lineStart = lyricLines[index]?.time ?? 0;
    const nextStart = lyricLines[index + 1]?.time;
    const end = nextStart && nextStart > lineStart ? nextStart : Math.max(duration, lineStart + 4);
    const lineDuration = Math.max(0.4, end - lineStart);
    const progress = Math.min(0.999, Math.max(0, (currentTime - lineStart) / lineDuration));
    const currentWord = Math.floor(progress * words.length);

    return words.map((word, wordIndex) => (
      <span
        key={`${word}-${wordIndex}`}
        className={
          wordIndex === currentWord
            ? "shubhu-mp-lyricWordCurrent"
            : wordIndex < currentWord
              ? "shubhu-mp-lyricWordSung"
              : "shubhu-mp-lyricWordUpcoming"
        }
      >
        {word}
        {wordIndex < words.length - 1 ? " " : ""}
      </span>
    ));
  };

  const progressRow = (
    <div className="shubhu-mp-progressRow">
      <span className="shubhu-mp-timeLabel">{formatTime(effectiveTime)}</span>
      <input
        className="shubhu-mp-range"
        type="range"
        min={0}
        max={duration || 100}
        step={0.5}
        value={effectiveTime}
        onChange={(event) => {
          setIsSeeking(true);
          setSeekVal(Number(event.target.value));
        }}
        onPointerUp={() => {
          if (isSeeking) {
            setIsSeeking(false);
            seek(seekVal);
          }
        }}
        onTouchEnd={() => {
          if (isSeeking) {
            setIsSeeking(false);
            seek(seekVal);
          }
        }}
        onMouseUp={() => {
          if (isSeeking) {
            setIsSeeking(false);
            seek(seekVal);
          }
        }}
        style={{
          background: `linear-gradient(to right, ${ACCENT} ${seekPercent}%, rgba(var(--mp-ink-rgb),0.22) ${seekPercent}%)`,
        }}
        aria-label="Playback progress"
      />
      <span className="shubhu-mp-timeLabel">{formatTime(duration)}</span>
    </div>
  );

  const playbackControls = (
    <div className="shubhu-mp-controls">
      <button
        className={`shubhu-mp-controlSmall ${isShuffle ? "shubhu-mp-controlActive" : ""}`}
        onClick={toggleShuffle}
        aria-pressed={isShuffle}
        aria-label="Shuffle"
      >
        <AnimatedShuffle active={isShuffle} className="" />
      </button>
      <button className="shubhu-mp-controlSkip" onClick={prevTrack} aria-label="Previous song">
        <SkipBack className="shubhu-mp-skipIcon" />
      </button>
      <button
        className="shubhu-mp-playButton"
        onClick={togglePlay}
        disabled={isResolving}
        aria-label={isPlaying ? "Pause" : "Play"}
      >
        {isResolving ? (
          <Loader2 className="shubhu-mp-spinner" />
        ) : isPlaying ? (
          <Pause className="shubhu-mp-playIconFilled" />
        ) : (
          <Play className="shubhu-mp-playIcon" />
        )}
      </button>
      <button className="shubhu-mp-controlSkip" onClick={nextTrack} aria-label="Next song">
        <SkipForward className="shubhu-mp-skipIcon" />
      </button>
      <button
        className={`shubhu-mp-controlSmall ${isRepeat ? "shubhu-mp-controlActive" : ""}`}
        onClick={toggleRepeat}
        aria-pressed={isRepeat}
        aria-label="Repeat"
      >
        <AnimatedRepeat active={isRepeat} className="" />
      </button>
    </div>
  );

  const queueItemContent = (track: Track, isCurrent: boolean) => (
    <>
      <img
        src={getStableTrackArtworkUrl(track, "max")}
        alt=""
        crossOrigin="anonymous"
        referrerPolicy="no-referrer"
        draggable={false}
        onError={(event) => {
          applyStableArtworkFallback(event.currentTarget);
        }}
      />
      <span className="shubhu-mp-queueMeta">
        <span className="shubhu-mp-queueTitle">{track.title}</span>
        <span className="shubhu-mp-queueArtist">{track.artist}</span>
      </span>
      {isCurrent ? (
        <span className="shubhu-mp-equalizer" aria-hidden="true">
          <i /><i /><i />
        </span>
      ) : (
        <GripVertical
          className="shubhu-mp-queueGripIcon shubhu-reorder-handle"
          aria-hidden="true"
        />
      )}
    </>
  );

  return (
    <div
      data-theme-region="legacy-dark"
      className={`shubhu-ui-controls shubhu-mp-root ${view === "lyrics" && lyricsExpanded ? "shubhu-mp-rootExpanded" : ""} ${
        minimizePhase === "dragging"
          ? "shubhu-mp-rootDragging"
          : minimizePhase === "settling"
            ? "shubhu-mp-rootSnapping"
            : ""
      }`}
      style={minimizeY !== 0 ? { transform: `translateY(${minimizeY}px)` } : undefined}
      role="dialog"
      aria-modal="true"
      aria-label="Now playing"
    >
      {/* ── Artwork-driven background (kept in every view) ── */}
      <div className="shubhu-mp-background" aria-hidden="true">
        {exitingCover && exitingCover !== cover && (
          <div
            key={`bg-out-${trackKey}`}
            className={`shubhu-mp-bgLayer shubhu-mp-bgLayerOut`}
            style={{ backgroundImage: `url("${exitingCover}")` }}
          />
        )}
        <div
          key={`bg-in-${trackKey}`}
          className={`shubhu-mp-bgLayer shubhu-mp-bgLayerIn`}
          style={{ backgroundImage: `url("${cover}")` }}
        />
        <div
          className="shubhu-mp-bgGlow"
          style={{
            background: `radial-gradient(circle at 50% 22%, rgba(${dominantColor}, 0.42) 0%, transparent 62%)`,
          }}
        />
        <div
          className="shubhu-mp-bgVeil"
          style={{
            background: "var(--mp-veil-bg)",
          }}
        />
        <div className="shubhu-mp-bgLavender" />
      </div>

      {/* ── Foreground layout ── */}
      <div className="shubhu-mp-content">
        {view === "lyrics" ? (
          <header
            className="shubhu-mp-lyricsHeader shubhu-mp-headerDraggable"
            onPointerDown={startPlayerDrag}
            onPointerMove={movePlayerDrag}
            onPointerUp={finishPlayerDrag}
            onPointerCancel={cancelPlayerDrag}
            onClickCapture={handleHeaderClickCapture}
          >
            <div className="shubhu-mp-lyricsDragArea">
              <button
                className="shubhu-mp-lyricsHandle"
                aria-label={lyricsExpanded ? "Collapse lyrics" : "Expand lyrics"}
                aria-expanded={lyricsExpanded}
                onClick={toggleLyricsExpanded}
              >
                <span />
              </button>
              <div className="shubhu-mp-lyricsTrackRow">
                <img
                  src={cover}
                  alt=""
                  crossOrigin="anonymous"
                  referrerPolicy="no-referrer"
                  onError={(event) => {
                    applyStableArtworkFallback(event.currentTarget);
                  }}
                />
                <span className="shubhu-mp-lyricsTrackMeta">
                  <strong>{currentTrack.title}</strong>
                  <small>{currentTrack.artist}</small>
                </span>
                {transcriptEnabled && (
                  <span className="shubhu-mp-transcriptPill">
                    <Captions />
                    Transcript
                  </span>
                )}
              </div>
            </div>
            <button
              className="shubhu-mp-lyricsMenuButton"
              onClick={() => setShowMenu((open) => !open)}
              aria-label="More options"
              aria-expanded={showMenu}
            >
              <MoreVertical className="shubhu-mp-chevron" />
            </button>
          </header>
        ) : (
          <header
            className={`shubhu-mp-topBar ${
              view === "player" ? "shubhu-mp-topBarDraggable" : "shubhu-mp-headerDraggable"
            }`}
            onPointerDown={startPlayerDrag}
            onPointerMove={movePlayerDrag}
            onPointerUp={finishPlayerDrag}
            onPointerCancel={cancelPlayerDrag}
            onClickCapture={handleHeaderClickCapture}
          >
            <button
              className="shubhu-mp-iconButton"
              onClick={() => (view === "player" ? onClose() : setView("player"))}
              aria-label={view === "player" ? "Close player" : "Back to player"}
            >
              <ChevronDown className="shubhu-mp-chevron" />
            </button>
            <span className="shubhu-mp-headerTitle">{headerTitle}</span>
            <button
              className="shubhu-mp-iconButton"
              onClick={() => setShowMenu((open) => !open)}
              aria-label="More options"
              aria-expanded={showMenu}
            >
              <MoreVertical className="shubhu-mp-chevron" />
            </button>
          </header>
        )}

        <main className="shubhu-mp-body">
          {view === "player" && (
            <div className="shubhu-mp-playerView">
              {/* Swipeable artwork with progressive neighbour preview */}
              <div
                ref={stageRef}
                className="shubhu-mp-artworkStage"
                onPointerDown={onSwipePointerDown}
                onPointerMove={onSwipePointerMove}
                onPointerUp={finishSwipe}
                onPointerCancel={finishSwipe}
              >
                <div className="shubhu-mp-artworkFrame">
                  {neighbourSong && (
                    <div
                      className="shubhu-mp-neighbourArt"
                      style={{ opacity: dragging ? swipeProgress * 0.92 : 0 }}
                      aria-hidden="true"
                    >
                      <img
                        src={neighbourUrl}
                        alt=""
                        crossOrigin="anonymous"
                        referrerPolicy="no-referrer"
                        draggable={false}
                      />
                    </div>
                  )}
                  <div
                    className={`shubhu-mp-currentArt ${dragging ? "shubhu-mp-dragging" : ""}`}
                    style={{
                      transform: dragging
                        ? `translateX(${dragX}px) rotate(${dragX / 34}deg) scale(${1 - swipeProgress * 0.05})`
                        : "translateX(0) rotate(0deg) scale(1)",
                    }}
                  >
                    <img
                      src={cover}
                      alt={currentTrack.title}
                      crossOrigin="anonymous"
                      referrerPolicy="no-referrer"
                      draggable={false}
                      onError={(event) => {
                        applyStableArtworkFallback(event.currentTarget);
                      }}
                    />
                    <button
                      className={`shubhu-mp-likeFab shubhu-like-btn ${isLiked ? "shubhu-mp-likeFabActive" : ""}`}
                      onClick={() => toggleLike(currentTrack)}
                      onPointerDown={(event) => event.stopPropagation()}
                      aria-label={isLiked ? "Remove from Liked Songs" : "Add to Liked Songs"}
                    >
                      <AnimatedHeart
                        filled={isLiked}
                        className={isLiked ? "shubhu-mp-heartFilled" : "shubhu-mp-heart"}
                        burstColor="rgb(var(--mp-like-rgb))"
                      />
                    </button>
                  </div>
                </div>
              </div>

              <div className="shubhu-mp-songInfo">
                <h1 className="shubhu-mp-songTitle">{currentTrack.title}</h1>
                <p className="shubhu-mp-songArtist">{currentTrack.artist}</p>
              </div>

              {progressRow}

              {playbackControls}
            </div>
          )}

          {view === "lyrics" && (
            <div className={`shubhu-mp-lyricsView ${lyricsExpanded ? "shubhu-mp-lyricsViewExpanded" : ""}`}>
              <div
                ref={lyricsScrollRef}
                className="shubhu-mp-lyricsScroll shubhu-mp-noScrollbar"
                onTouchStart={() => setManualScrollUntil(Date.now() + 2600)}
                onWheel={() => setManualScrollUntil(Date.now() + 2600)}
                onScroll={handleLyricsScroll}
              >
                {lyricsLoading ? (
                  <div className="shubhu-mp-placeholder">
                    <Loader2 className="shubhu-mp-spinner" />
                    <span>Loading lyrics…</span>
                  </div>
                ) : lyricLines.length === 0 ? (
                  <div className="shubhu-mp-placeholder">
                    <Music2 className="shubhu-mp-placeholderIcon" />
                    <strong>Lyrics not available</strong>
                    <span>Enjoy the music</span>
                  </div>
                ) : (
                  <div className="shubhu-mp-lyricsInner">
                    {transcriptEnabled && (transcriptLoading || transcriptDisabled) && (
                      <p className="shubhu-mp-transcriptStatus">
                        {transcriptDisabled
                          ? "Transcription unavailable — showing original lyrics"
                          : "Loading transcript…"}
                      </p>
                    )}
                    {lyricLines.map((line, index) => {
                      const isActive = index === activeLyric;
                      const isPast = activeLyric !== -1 && index < activeLyric;
                      const originalIsLatin = !hasNonLatinLetters(line.text);
                      const romanLine = transcriptEnabled
                        ? originalIsLatin
                          ? line.text
                          : transcriptions[index] || line.text
                        : line.text;
                      const regionalLine =
                        transcriptEnabled &&
                        !originalIsLatin &&
                        romanLine.trim().toLowerCase() !== line.text.trim().toLowerCase()
                          ? line.text
                          : "";

                      return (
                        <button
                          key={`${line.time}-${index}`}
                          data-line={index}
                          className={`shubhu-mp-lyricLine ${
                            isActive
                              ? "shubhu-mp-lyricActive"
                              : isPast
                                ? "shubhu-mp-lyricPast"
                                : "shubhu-mp-lyricUpcoming"
                          }`}
                          onClick={() => {
                            setManualScrollUntil(0);
                            seek(line.time);
                          }}
                        >
                          <span className="shubhu-mp-lyricMain">
                            {renderLyricText(romanLine, index, isActive)}
                          </span>
                          {regionalLine && (
                            <span className="shubhu-mp-lyricRegional">{regionalLine}</span>
                          )}
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>

              <div className="shubhu-mp-lyricsFooter">
                {progressRow}
                {playbackControls}
              </div>
            </div>
          )}

          {view === "queue" && (
            <div className="shubhu-mp-queueView">
              <div className={`shubhu-mp-queueScroll shubhu-mp-noScrollbar`}>
                {queue.length === 0 ? (
                  <div className="shubhu-mp-placeholder">
                    <ListMusic className="shubhu-mp-placeholderIcon" />
                    <strong>Queue is empty</strong>
                  </div>
                ) : (
                  <>
                    <p className="shubhu-mp-queueHeading">Now Playing</p>
                    <div className="shubhu-mp-queueNowPlaying">
                      {queue[queueCurrentIndex] || currentTrack ? (
                        <button
                          type="button"
                          className="shubhu-mp-queueItem shubhu-mp-queueItemActive"
                          onClick={togglePlay}
                        >
                          {queueItemContent(
                            (queue[queueCurrentIndex] || currentTrack) as Track,
                            true,
                          )}
                        </button>
                      ) : null}
                    </div>

                    <p className="shubhu-mp-queueHeading shubhu-mp-queueHeadingNext">
                      Up Next
                    </p>
                    <div className="shubhu-mp-queueList">
                      <ReorderableList
                        items={upNextTracks}
                        itemKey={(track) => track.id}
                        onReorder={handleQueueReorder}
                        onRowClick={(track) => playTrack(track, queue)}
                        rowClassName={() => "shubhu-mp-queueItem"}
                      >
                        {(track) => queueItemContent(track, false)}
                      </ReorderableList>
                    </div>
                  </>
                )}
              </div>
            </div>
          )}
        </main>

        {/* ── The same three buttons stay pinned in every view ── */}
        <nav
          className={`shubhu-mp-bottomBar ${view === "lyrics" && lyricsExpanded ? "shubhu-mp-bottomBarHidden" : ""}`}
          aria-label="Player views"
          aria-hidden={view === "lyrics" && lyricsExpanded}
        >
          <button
            className={`shubhu-mp-bottomButton ${view === "lyrics" ? "shubhu-mp-bottomButtonActive" : ""}`}
            onClick={() => {
              setShowMenu(false);
              setLyricsExpanded(false);
              setView((current) => (current === "lyrics" ? "player" : "lyrics"));
            }}
            aria-pressed={view === "lyrics"}
          >
            <Quote className="shubhu-mp-bottomIcon" />
            <span>Lyrics</span>
          </button>
          <button
            className={`shubhu-mp-bottomButton ${isShuffle ? "shubhu-mp-bottomButtonActive" : ""}`}
            onClick={toggleShuffle}
            aria-pressed={isShuffle}
          >
            <AnimatedShuffle active={isShuffle} className="shubhu-mp-bottomIcon" />
            <span>Shuffle</span>
          </button>
          <button
            className={`shubhu-mp-bottomButton ${view === "queue" ? "shubhu-mp-bottomButtonActive" : ""}`}
            onClick={() => {
              setShowMenu(false);
              setLyricsExpanded(false);
              setView((current) => (current === "queue" ? "player" : "queue"));
            }}
            aria-pressed={view === "queue"}
          >
            <ListMusic className="shubhu-mp-bottomIcon" />
            <span>Queue</span>
          </button>
        </nav>
      </div>

      {/* ── Three-dot menu ── */}
      {showMenu && (
        <>
          <button className="shubhu-mp-overlay" onClick={closeOverlays} aria-label="Close menu" />
          <div
            className={`shubhu-mp-menu shubhu-mp-menuIn ${view === "lyrics" ? "shubhu-mp-menuLyrics" : ""}`}
            role="menu"
          >
            <button
              className="shubhu-mp-menuItem shubhu-like-btn"
              onClick={() => {
                toggleLike(currentTrack);
                setShowMenu(false);
              }}
              role="menuitem"
            >
              <AnimatedHeart
                filled={isLiked}
                className={`shubhu-mp-menuIcon ${isLiked ? "shubhu-mp-menuIconActive" : ""}`}
                burstColor="rgb(var(--mp-like-rgb))"
              />
              <span>Like</span>
            </button>
            <button className="shubhu-mp-menuItem" onClick={openPlaylistSheet} role="menuitem">
              <ListMusic className="shubhu-mp-menuIcon" />
              <span>Add to Playlist</span>
            </button>
            <button
              className="shubhu-mp-menuItem"
              onClick={() => {
                setShowMenu(false);
                if (!currentTrack) return;
                if (download.busy) {
                  showToast(download.label);
                  return;
                }
                void download.toggle().then((message) => message && showToast(message));
              }}
              role="menuitem"
            >
              {download.offline ? <DownloadCloud className="shubhu-mp-menuIcon" /> : <Download className="shubhu-mp-menuIcon" />}
              <span>
                {download.offline
                  ? "Remove download"
                  : download.status === "failed"
                    ? "Retry download"
                    : download.inList
                      ? "Download to this device"
                      : "Download"}
              </span>
            </button>
            {download.busy && (
              <div className="shubhu-mp-downloadMeta">
                <div className="shubhu-mp-downloadTrack">
                  <div
                    className="shubhu-mp-downloadFill"
                    style={{ width: `${Math.round((download.progress ?? 0) * 100)}%` }}
                  />
                </div>
                <button
                  className="shubhu-mp-downloadAction"
                  onClick={() => {
                    download.cancel();
                    showToast("Download cancelled");
                  }}
                >
                  Cancel
                </button>
              </div>
            )}
            {download.error && (
              <div className="shubhu-mp-downloadError">
                <span>{download.error}</span>
                <button onClick={download.clearError} aria-label="Dismiss error">×</button>
              </div>
            )}
            <button
              className="shubhu-mp-menuItem"
              onClick={toggleTranscript}
              role="menuitemcheckbox"
              aria-checked={transcriptEnabled}
            >
              <Captions className="shubhu-mp-menuIcon" />
              <span>Transcript</span>
              <span className="shubhu-mp-menuToggleState">
                {transcriptEnabled ? "On" : "Off"}
              </span>
              <span
                className={`shubhu-mp-switch ${transcriptEnabled ? "shubhu-mp-switchOn" : ""}`}
                aria-hidden="true"
              >
                <i />
              </span>
            </button>
            <button
              className="shubhu-mp-menuItem"
              onClick={() => {
                setShowMenu(false);
                setShowSleepSheet(true);
              }}
              role="menuitem"
            >
              <Moon className="shubhu-mp-menuIcon" />
              <span>
                Sleep Timer
                {sleepActive && (
                  <span className="shubhu-mp-menuTimerState"> — {sleepCountdown}</span>
                )}
              </span>
            </button>
            <button className="shubhu-mp-menuItem" onClick={goToArtist} role="menuitem">
              <UserRound className="shubhu-mp-menuIcon" />
              <span>Go to Artist</span>
            </button>
            <button className="shubhu-mp-menuItem" onClick={shareTrack} role="menuitem">
              <Share2 className="shubhu-mp-menuIcon" />
              <span>Share</span>
            </button>
          </div>
        </>
      )}

      {/* ── Add to Playlist bottom sheet ── */}
      {showPlaylistSheet && currentTrack && (
        <>
          <button className="shubhu-mp-overlay" onClick={closeOverlays} aria-label="Close sheet" />
          <div
            className={`shubhu-mp-sheet shubhu-mp-sheetIn ${sheetDragClass}`}
            style={sheetDragStyle}
            role="dialog"
            aria-label="Add to playlist"
            onPointerDown={startSheetDrag}
            onPointerMove={moveSheetDrag}
            onPointerUp={finishSheetDrag}
            onPointerCancel={cancelSheetDrag}
          >
            <div className="shubhu-mp-sheetHandle" />
            <div className="shubhu-mp-sheetHeader">
              <h2>Add to Playlist</h2>
              <button className="shubhu-mp-sheetClose" onClick={closeOverlays} aria-label="Close">
                <X />
              </button>
            </div>

            <div className="shubhu-mp-sheetSong">
              <img
                src={cover}
                alt=""
                crossOrigin="anonymous"
                referrerPolicy="no-referrer"
                onError={(event) => {
                  applyStableArtworkFallback(event.currentTarget);
                }}
              />
              <span>
                <strong>{currentTrack.title}</strong>
                <small>{currentTrack.artist}</small>
              </span>
            </div>

            <div className={`shubhu-mp-sheetList shubhu-mp-noScrollbar`}>
              <div className="shubhu-mp-createRow">
                <button className="shubhu-mp-createIcon" onClick={createAndSelectPlaylist} aria-label="Create new playlist">
                  <Plus />
                </button>
                <input
                  value={newPlaylistName}
                  onChange={(event) => setNewPlaylistName(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") createAndSelectPlaylist();
                  }}
                  placeholder="Create New Playlist"
                  aria-label="New playlist name"
                />
              </div>

              {playlists.length === 0 ? (
                <p className="shubhu-mp-emptyList">No playlists yet — create one above.</p>
              ) : (
                playlists.map((playlist) => {
                  const selected = selectedPlaylists.includes(playlist.id);
                  const alreadyHasTrack = playlist.tracks?.some((track) => track.id === currentTrack.id);
                  return (
                    <button
                      key={playlist.id}
                      className={`shubhu-mp-playlistRow ${selected ? "shubhu-mp-playlistRowSelected" : ""}`}
                      onClick={() => togglePlaylistSelection(playlist.id)}
                    >
                      <span className="shubhu-mp-playlistThumb">
                        {playlist.coverUrl ? (
                          <img src={playlist.coverUrl} alt="" />
                        ) : (
                          <ListMusic />
                        )}
                      </span>
                      <span className="shubhu-mp-playlistInfo">
                        <strong>{playlist.name}</strong>
                        <small>
                          {playlist.tracks?.length ?? playlist.trackCount ?? 0} songs
                          {alreadyHasTrack ? " · already added" : ""}
                        </small>
                      </span>
                      <span className={`shubhu-mp-checkbox ${selected ? "shubhu-mp-checkboxOn" : ""}`}>
                        {selected && <Check />}
                      </span>
                    </button>
                  );
                })
              )}
            </div>

            <div className="shubhu-mp-sheetFooter">
              <button
                className="shubhu-mp-clearButton"
                onClick={() => setSelectedPlaylists([])}
                disabled={selectedPlaylists.length === 0}
              >
                Clear
              </button>
              <button
                className="shubhu-mp-primaryButton"
                onClick={confirmAddToPlaylists}
                disabled={selectedPlaylists.length === 0}
              >
                Add ({selectedPlaylists.length})
              </button>
            </div>
          </div>
        </>
      )}

      {/* ── Sleep Timer bottom sheet ── */}
      {showSleepSheet && (
        <>
          <button className="shubhu-mp-overlay" onClick={closeOverlays} aria-label="Close sheet" />
          <div
            className={`shubhu-mp-sheet shubhu-mp-sheetIn ${sheetDragClass}`}
            style={sheetDragStyle}
            role="dialog"
            aria-label="Sleep timer"
            onPointerDown={startSheetDrag}
            onPointerMove={moveSheetDrag}
            onPointerUp={finishSheetDrag}
            onPointerCancel={cancelSheetDrag}
          >
            <div className="shubhu-mp-sheetHandle" />
            <div className="shubhu-mp-sheetHeader">
              <h2>Sleep Timer</h2>
              <button className="shubhu-mp-sheetClose" onClick={closeOverlays} aria-label="Close">
                <X />
              </button>
            </div>

            {sleepActive && (
              <div className="shubhu-mp-sleepStatus">
                <Moon className="shubhu-mp-sleepStatusIcon" />
                <span>
                  <strong>{sleepAtEndOfSong ? "Stops after current track" : "Playback stops in"}</strong>
                  <small>{sleepCountdown}</small>
                </span>
              </div>
            )}

            <div className="shubhu-mp-sleepGrid">
              {sleepOptions.map((option) => (
                <button
                  key={option.label}
                  className={`shubhu-mp-sleepOption ${selectedSleepOption?.label === option.label ? "shubhu-mp-sleepOptionActive" : ""}`}
                  onClick={() => setSelectedSleepOption(option)}
                >
                  <Timer className="shubhu-mp-sleepOptionIcon" />
                  {option.label}
                </button>
              ))}
              <button
                className={`shubhu-mp-sleepOption shubhu-mp-sleepOptionWide ${selectedSleepOption?.label === "Custom Timer" ? "shubhu-mp-sleepOptionActive" : ""}`}
                onClick={() => setSelectedSleepOption(customSleepOption)}
              >
                <Timer className="shubhu-mp-sleepOptionIcon" />
                Custom Timer
              </button>
              <button
                className={`shubhu-mp-sleepOption shubhu-mp-sleepOptionWide ${selectedSleepOption?.label === "End of Current Track" ? "shubhu-mp-sleepOptionActive" : ""}`}
                onClick={() => setSelectedSleepOption(endOfTrackOption)}
              >
                <Music2 className="shubhu-mp-sleepOptionIcon" />
                End of Current Track
              </button>
            </div>

            {selectedSleepOption?.label === "Custom Timer" && (
              <div className="shubhu-mp-customTimerRow">
                <input
                  type="number"
                  min={1}
                  value={customMinutes}
                  onChange={(event) => setCustomMinutes(event.target.value)}
                  placeholder="Minutes"
                  aria-label="Custom minutes"
                />
                <span>minutes</span>
              </div>
            )}

            <div className="shubhu-mp-sheetFooter">
              <button className="shubhu-mp-clearButton" onClick={cancelTimer} disabled={!sleepActive}>
                Cancel Timer
              </button>
              <button className="shubhu-mp-primaryButton" onClick={startSleepTimer}>
                Start Timer
              </button>
            </div>
          </div>
        </>
      )}

      {toast && <div className="shubhu-mp-toast">{toast}</div>}
    </div>
  );
}
