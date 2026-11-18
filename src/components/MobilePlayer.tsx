"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Check,
  ChevronDown,
  Disc3,
  Download,
  Heart,
  ListMusic,
  Loader2,
  Moon,
  MoreVertical,
  Music2,
  Pause,
  Play,
  Plus,
  Quote,
  Radio,
  Repeat,
  Share2,
  Shuffle,
  SkipBack,
  SkipForward,
  Timer,
  X,
} from "lucide-react";
import {
  usePlayer,
  type SleepTimerOption,
} from "@/context/PlayerContext";
import { useDominantColor } from "@/hooks/useDominantColor";
import { getTrackArtworkFallbackUrl, getTrackArtworkUrl } from "@/lib/artwork";
import { parseLRC, type LyricLine } from "@/lib/lyrics";
import "./MobilePlayer.css";

type MobileView = "player" | "lyrics" | "queue";

const ACCENT = "#c9b0ff";

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
    currentIndex,
    playTrack,
    sleepEndsAt,
    sleepRemainingSeconds,
    sleepAtEndOfSong,
    selectSleepTimer,
    cancelSleepTimer,
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

  // Add-to-playlist sheet state.
  const [selectedPlaylists, setSelectedPlaylists] = useState<string[]>([]);
  const [newPlaylistName, setNewPlaylistName] = useState("");

  // Sleep timer sheet state.
  const [selectedSleepOption, setSelectedSleepOption] = useState<SleepTimerOption | null>(null);
  const [customMinutes, setCustomMinutes] = useState("");

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
  const cover = getTrackArtworkUrl(currentTrack, "max");
  const dominantColor = useDominantColor(cover);
  const isLiked = currentTrack ? likedSongIds.has(currentTrack.id) : false;
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
    return () => {
      if (toastTimer.current !== null) window.clearTimeout(toastTimer.current);
    };
  }, []);

  // ── Dynamic artwork background: crossfade the outgoing cover into the new one ──
  const [exitingCover, setExitingCover] = useState<string | null>(null);
  const previousCoverRef = useRef(cover);
  useEffect(() => {
    if (previousCoverRef.current === cover) return;
    setExitingCover(previousCoverRef.current);
    previousCoverRef.current = cover;
    const timeout = window.setTimeout(() => setExitingCover(null), 700);
    return () => window.clearTimeout(timeout);
  }, [cover]);

  // ── Lyrics: fetch, sync and follow the active line ───────────────────────────
  useEffect(() => {
    if (!currentTrack) return;
    let cancelled = false;
    setLyricsLoading(true);
    setLyricLines([]);
    setActiveLyric(-1);

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
  }, [activeLyric, view, manualScrollUntil]);

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
  const neighbourUrl = getTrackArtworkUrl(neighbourSong, "max");

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

  const openSleepSheet = () => {
    // Reflect the current timer state when the sheet is reopened.
    if (sleepAtEndOfSong) {
      setSelectedSleepOption({ label: "End of Current Track", seconds: null });
    } else if (sleepEndsAt) {
      const remaining = Math.ceil((sleepEndsAt - Date.now()) / 1000);
      setSelectedSleepOption(
        [300, 600, 900, 1800, 2700, 3600].find((s) => Math.abs(s - remaining) <= 5)
          ? { label: `${Math.round(remaining / 60)} minutes`, seconds: remaining }
          : null,
      );
    } else {
      setSelectedSleepOption(null);
    }
    setCustomMinutes("");
    setShowMenu(false);
    setShowSleepSheet(true);
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

  const headerTitle = view === "player" ? "Now Playing" : view === "lyrics" ? "Lyrics" : "Up Next";

  return (
    <div
      data-theme-region="legacy-dark"
      className="shubhu-mp-root"
      role="dialog"
      aria-modal="true"
      aria-label="Now playing"
    >
      {/* ── Artwork-driven background (kept in every view) ── */}
      <div className="shubhu-mp-background" aria-hidden="true">
        {exitingCover && exitingCover !== cover && (
          <div
            key={`bg-out-${exitingCover}`}
            className={`shubhu-mp-bgLayer shubhu-mp-bgLayerOut`}
            style={{ backgroundImage: `url("${exitingCover}")` }}
          />
        )}
        <div
          key={`bg-in-${cover}`}
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
            background: `linear-gradient(180deg, rgba(12, 6, 24, 0.58) 0%, rgba(10, 6, 20, 0.84) 46%, rgba(7, 4, 14, 0.97) 100%)`,
          }}
        />
        <div className="shubhu-mp-bgLavender" />
      </div>

      {/* ── Foreground layout ── */}
      <div className="shubhu-mp-content">
        <header className="shubhu-mp-topBar">
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
                        event.currentTarget.src = getTrackArtworkFallbackUrl(currentTrack, "hq");
                      }}
                    />
                    <button
                      className={`shubhu-mp-likeFab ${isLiked ? "shubhu-mp-likeFabActive" : ""}`}
                      onClick={() => toggleLike(currentTrack)}
                      onPointerDown={(event) => event.stopPropagation()}
                      aria-label={isLiked ? "Remove from Liked Songs" : "Add to Liked Songs"}
                    >
                      <Heart className={isLiked ? "shubhu-mp-heartFilled" : "shubhu-mp-heart"} />
                    </button>
                  </div>
                </div>
              </div>

              <div className="shubhu-mp-songInfo">
                <h1 className="shubhu-mp-songTitle">{currentTrack.title}</h1>
                <p className="shubhu-mp-songArtist">{currentTrack.artist}</p>
              </div>

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
                    background: `linear-gradient(to right, ${ACCENT} ${seekPercent}%, rgba(255,255,255,0.22) ${seekPercent}%)`,
                  }}
                  aria-label="Playback progress"
                />
                <span className="shubhu-mp-timeLabel">{formatTime(duration)}</span>
              </div>

              <div className="shubhu-mp-controls">
                <button
                  className={`shubhu-mp-controlSmall ${isShuffle ? "shubhu-mp-controlActive" : ""}`}
                  onClick={toggleShuffle}
                  aria-pressed={isShuffle}
                  aria-label="Shuffle"
                >
                  <Shuffle />
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
                  <Repeat />
                </button>
              </div>
            </div>
          )}

          {view === "lyrics" && (
            <div className="shubhu-mp-lyricsView">
              <div
                ref={lyricsScrollRef}
                className={`shubhu-mp-lyricsScroll shubhu-mp-noScrollbar`}
                onTouchStart={() => setManualScrollUntil(Date.now() + 2600)}
                onWheel={() => setManualScrollUntil(Date.now() + 2600)}
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
                    {lyricLines.map((line, index) => (
                      <button
                        key={`${line.time}-${index}`}
                        data-line={index}
                        className={`shubhu-mp-lyricLine ${index === activeLyric ? "shubhu-mp-lyricActive" : ""}`}
                        onClick={() => {
                          setManualScrollUntil(0);
                          seek(line.time);
                        }}
                      >
                        {line.text || "\u00A0"}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}

          {view === "queue" && (
            <div className="shubhu-mp-queueView">
              <div className={`shubhu-mp-queueScroll shubhu-mp-noScrollbar`}>
                <p className="shubhu-mp-queueHeading">Up next</p>
                {queue.length === 0 ? (
                  <div className="shubhu-mp-placeholder">
                    <ListMusic className="shubhu-mp-placeholderIcon" />
                    <strong>Queue is empty</strong>
                  </div>
                ) : (
                  <div className="shubhu-mp-queueList">
                    {queue.map((track, index) => {
                      const isCurrent = track.id === currentTrack.id;
                      return (
                        <button
                          key={`${track.id}-${index}`}
                          className={`shubhu-mp-queueItem ${isCurrent ? "shubhu-mp-queueItemActive" : ""}`}
                          onClick={() =>
                            isCurrent ? togglePlay() : playTrack(track, queue)
                          }
                        >
                          <img
                            src={getTrackArtworkUrl(track, "max")}
                            alt=""
                            crossOrigin="anonymous"
                            referrerPolicy="no-referrer"
                            onError={(event) => {
                              event.currentTarget.src = getTrackArtworkFallbackUrl(track, "hq");
                            }}
                          />
                          <span className="shubhu-mp-queueMeta">
                            <span className="shubhu-mp-queueTitle">{track.title}</span>
                            <span className="shubhu-mp-queueArtist">
                              {isCurrent ? "Now playing · " : ""}{track.artist}
                            </span>
                          </span>
                          <span className="shubhu-mp-queueDuration">{formatTime(track.duration)}</span>
                          {isCurrent ? (
                            <span className="shubhu-mp-equalizer" aria-hidden="true">
                              <i /><i /><i />
                            </span>
                          ) : (
                            <span className="shubhu-mp-queueGrip" aria-hidden="true">⋮⋮</span>
                          )}
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          )}
        </main>

        {/* ── The same three buttons stay pinned in every view ── */}
        <nav className="shubhu-mp-bottomBar" aria-label="Player views">
          <button
            className={`shubhu-mp-bottomButton ${view === "lyrics" ? "shubhu-mp-bottomButtonActive" : ""}`}
            onClick={() => setView((current) => (current === "lyrics" ? "player" : "lyrics"))}
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
            <Shuffle className="shubhu-mp-bottomIcon" />
            <span>Shuffle</span>
          </button>
          <button
            className={`shubhu-mp-bottomButton ${view === "queue" ? "shubhu-mp-bottomButtonActive" : ""}`}
            onClick={() => setView((current) => (current === "queue" ? "player" : "queue"))}
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
          <div className={`shubhu-mp-menu shubhu-mp-menuIn`} role="menu">
            <button className="shubhu-mp-menuItem" onClick={() => { toggleLike(currentTrack); setShowMenu(false); }} role="menuitem">
              <Heart className={`shubhu-mp-menuIcon ${isLiked ? "shubhu-mp-menuIconActive" : ""}`} />
              <span>{isLiked ? "Unlike" : "Like"}</span>
            </button>
            <button className="shubhu-mp-menuItem" onClick={openPlaylistSheet} role="menuitem">
              <ListMusic className="shubhu-mp-menuIcon" />
              <span>Add to Playlist</span>
            </button>
            <button className="shubhu-mp-menuItem" onClick={() => { setShowMenu(false); showToast("Download is coming soon"); }} role="menuitem">
              <Download className="shubhu-mp-menuIcon" />
              <span>Download</span>
              <span className="shubhu-mp-placeholderTag">soon</span>
            </button>
            <button className="shubhu-mp-menuItem" onClick={openSleepSheet} role="menuitem">
              <Moon className="shubhu-mp-menuIcon" />
              <span>Sleep Timer</span>
              {sleepActive && <span className="shubhu-mp-timerPill">{sleepCountdown}</span>}
            </button>
            <button className="shubhu-mp-menuItem" onClick={goToArtist} role="menuitem">
              <Disc3 className="shubhu-mp-menuIcon" />
              <span>Go to Artist</span>
            </button>
            <button className="shubhu-mp-menuItem" onClick={() => { setShowMenu(false); showToast("Radio is coming soon"); }} role="menuitem">
              <Radio className="shubhu-mp-menuIcon" />
              <span>Radio</span>
              <span className="shubhu-mp-placeholderTag">soon</span>
            </button>
            <div className="shubhu-mp-menuDivider" />
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
          <div className={`shubhu-mp-sheet shubhu-mp-sheetIn`} role="dialog" aria-label="Add to playlist">
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
                  event.currentTarget.src = getTrackArtworkFallbackUrl(currentTrack, "hq");
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
          <div className={`shubhu-mp-sheet shubhu-mp-sheetIn`} role="dialog" aria-label="Sleep timer">
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
