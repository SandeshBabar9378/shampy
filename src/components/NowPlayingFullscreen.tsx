"use client";

import React, {
  useCallback,
  useEffect,
  memo,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  ChevronDown,
  Disc3,
  GripVertical,
  ListEnd,
  ListMusic,
  ListPlus,
  ListStart,
  Loader2,
  Moon,
  MoreVertical,
  Quote,
  SkipBack,
  SkipForward,
  Volume1,
  Volume2,
} from "lucide-react";
import {
  AnimatedHeart,
  AnimatedPlayPause,
  AnimatedRepeat,
  AnimatedShuffle,
} from "@/components/animations/MotionIcons";
import { useRouter } from "next/navigation";
import { usePlayer } from "@/context/PlayerContext";
import { useDominantColor } from "@/hooks/useDominantColor";
import { parseLRC, LyricLine } from "@/lib/lyrics";
import {
  buildFallbackTranscripts,
  hasNonLatinLetters,
  isValidTranscriptList,
} from "@/lib/transcript";
import { SleepTimer } from "@/components/SleepTimer";
import { ReorderableList } from "@/components/ReorderableList";
import { Track } from "@/lib/types";
import { getTrackArtworkFallbackUrl, getTrackArtworkUrl } from "@/lib/artwork";

interface NowPlayingFullscreenProps {
  isOpen: boolean;
  onClose: () => void;
}

interface LyricsData {
  synced: boolean;
  lines: LyricLine[];
  label?: string;
}

function formatTime(seconds: number): string {
  if (isNaN(seconds) || seconds < 0) return "0:00";
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s < 10 ? "0" : ""}${s}`;
}

// Estimated heights for lyric lines that have not been measured yet.

interface LyricLineRowProps {
  line: LyricLine;
  index: number;
  romanText: string;
  regionalText: string;
  isActive: boolean;
  distance: number;
  onSeek: (time: number) => void;
}

// Memoized lyric line: re-renders only when its own props change, so per-tick
// currentTime updates never re-render the list.
const LyricLineRow = memo(function LyricLineRow({
  line,
  index,
  romanText,
  regionalText,
  isActive,
  distance,
  onSeek,
}: LyricLineRowProps) {
  // Distance-based opacity instead of blur: active 1, +-1 0.5, +-2 0.3, rest 0.15.
  const opacity = isActive ? 1 : distance === 1 ? 0.5 : distance === 2 ? 0.3 : 0.15;
  return (
    <button
      data-line-idx={index}
      onClick={() => onSeek(line.time)}
      className="block w-full text-center rounded-xl px-2 pt-1 pb-6 md:pb-7 cursor-pointer transition-[opacity,transform] duration-[400ms] ease-out"
      style={{
        opacity,
        transform: isActive ? "scale(1.02)" : "scale(1)",
        transformOrigin: "center",
        willChange: distance <= 2 ? "transform, opacity" : undefined,
      }}
    >
      <p
        className={
          isActive
            ? "text-2xl sm:text-3xl md:text-4xl font-display font-bold text-white leading-snug"
            : "text-lg sm:text-xl md:text-2xl font-display font-semibold text-white/90 leading-snug"
        }
      >
        {romanText || "\u00A0"}
      </p>
      {regionalText && (
        <p
          className={
            isActive
              ? "mt-1.5 text-sm md:text-base text-emerald-200/70"
              : "mt-1 text-xs md:text-sm text-neutral-300/70"
          }
        >
          {regionalText}
        </p>
      )}
    </button>
  );
});

export function NowPlayingFullscreen({ isOpen, onClose }: NowPlayingFullscreenProps) {
  const router = useRouter();
  const {
    currentTrack,
    currentTime,
    duration,
    seek,
    isPlaying,
    togglePlay,
    nextTrack,
    prevTrack,
    isShuffle,
    toggleShuffle,
    isRepeat,
    toggleRepeat,
    volume,
    setVolume,
    isMuted,
    toggleMute,
    likedSongIds,
    toggleLike,
    playlists,
    addToPlaylist,
    queue,
    setAppQueue,
    playNext,
    playTrack,
    isResolving,
  } = usePlayer();

  const [lyricsData, setLyricsData] = useState<LyricsData | null>(null);
  const [loading, setLoading] = useState(false);
  const [romanTranscripts, setRomanTranscripts] = useState<string[]>([]);
  const [transcriptionDisabled, setTranscriptionDisabled] = useState(false);
  const [rightView, setRightView] = useState<"lyrics" | "queue">("lyrics");
  const [showMenu, setShowMenu] = useState(false);
  const [showPlaylists, setShowPlaylists] = useState(false);
  const [showSleepTimer, setShowSleepTimer] = useState(false);
  const [isSeeking, setIsSeeking] = useState(false);
  const [seekVal, setSeekVal] = useState(0);
  // Active lyric index: state changes only when the index itself changes,
  // not on every currentTime tick.
  const [activeIndex, setActiveIndex] = useState(-1);
  // Native-scroll lyrics: panel height and manual-scroll state.
  const [panelHeight, setPanelHeight] = useState(0);
  const [isManual, setIsManual] = useState(false);
  const [metricsVersion, setMetricsVersion] = useState(0);

  // Keep the overlay mounted through its exit animation. `mounted` stays true
  // while the closing transition runs; `visible` covers the opening render.
  const [mounted, setMounted] = useState(isOpen);
  const closing = !isOpen && mounted;
  const visible = isOpen || mounted;

  useEffect(() => {
    if (isOpen) {
      setMounted(true);
      return;
    }
    if (!mounted) return;
    const timer = window.setTimeout(() => setMounted(false), 260);
    return () => window.clearTimeout(timer);
  }, [isOpen, mounted]);

  const scrollContainerRef = useRef<HTMLDivElement | null>(null);
  const animFrameRef = useRef<number | null>(null);
  const resumeTimerRef = useRef<number | null>(null);
  const seekRef = useRef(seek);

  const cover = getTrackArtworkUrl(currentTrack, "max");
  const dominantColor = useDominantColor(getTrackArtworkUrl(currentTrack, "max"));
  const isLiked = currentTrack ? likedSongIds.has(currentTrack.id) : false;
  const effectiveTime = isSeeking ? seekVal : currentTime;
  const seekPercent = duration > 0 ? Math.min(100, Math.max(0, (effectiveTime / duration) * 100)) : 0;
  const volumeVal = isMuted ? 0 : volume;
  const volumePercent = Math.min(100, Math.max(0, volumeVal * 100));

  // Fetch lyrics (same endpoint/query as the existing full-screen lyrics view).
  useEffect(() => {
    if (!currentTrack || !isOpen) return;

    let cancelled = false;
    setLoading(true);
    setRomanTranscripts([]);
    setTranscriptionDisabled(false);
    // Reset lyric scroll state for the new song (visual only).
    if (resumeTimerRef.current !== null) {
      window.clearTimeout(resumeTimerRef.current);
      resumeTimerRef.current = null;
    }
    setIsManual(false);
    setActiveIndex(-1);
    if (scrollContainerRef.current) scrollContainerRef.current.scrollTop = 0;

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
          synced?: boolean;
          label?: string;
        } | null) => {
          if (cancelled) return;
          if (!data) {
            setLyricsData(null);
          } else if (Array.isArray(data.lines)) {
            setLyricsData({ synced: !!data.synced, lines: data.lines, label: data.label });
          } else if (data.syncedLyrics) {
            setLyricsData({ synced: true, lines: parseLRC(data.syncedLyrics), label: "Synced Lyrics" });
          } else if (data.plainLyrics) {
            const plainLines = data.plainLyrics
              .split("\n")
              .map((text, i) => ({ time: i * 5, text: text.trim() }))
              .filter((line) => line.text.length > 0);
            setLyricsData({ synced: false, lines: plainLines, label: "Plain Lyrics" });
          } else {
            setLyricsData(null);
          }
          setLoading(false);
        }
      )
      .catch(() => {
        if (!cancelled) {
          setLyricsData(null);
          setLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [currentTrack?.id, isOpen]);

  // Existing Roman transcript logic (same cache version and validation).
  useEffect(() => {
    if (!lyricsData?.lines?.length || !currentTrack?.id) {
      setRomanTranscripts([]);
      return;
    }

    const lines = lyricsData.lines.map((line) => line.text);
    const cacheKey = `lyrics-roman-v2_${currentTrack.id}`;

    if (typeof window !== "undefined") {
      try {
        const cached = localStorage.getItem(cacheKey);
        if (cached) {
          const parsed: unknown = JSON.parse(cached);
          if (isValidTranscriptList(lines, parsed)) {
            setRomanTranscripts(parsed);
            setTranscriptionDisabled(false);
            return;
          }
          localStorage.removeItem(cacheKey);
        }
      } catch {
        // Ignore malformed cache entries.
      }
    }

    let cancelled = false;
    setTranscriptionDisabled(false);

    fetch("/api/transcribe", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ songId: currentTrack.id, lines }),
    })
      .then((res) => (res.ok ? res.json() : null))
      .then((data: { transcriptions?: unknown; error?: string } | null) => {
        if (cancelled) return;

        if (data?.error === "transcription disabled: no API key") {
          setTranscriptionDisabled(true);
          setRomanTranscripts([]);
          return;
        }

        if (isValidTranscriptList(lines, data?.transcriptions)) {
          setRomanTranscripts(data.transcriptions);
          if (typeof window !== "undefined") {
            try {
              localStorage.setItem(cacheKey, JSON.stringify(data.transcriptions));
            } catch {
              // Ignore localStorage quota errors.
            }
          }
        } else {
          setRomanTranscripts(buildFallbackTranscripts(lines));
        }
      })
      .catch(() => {
        if (!cancelled) setRomanTranscripts(buildFallbackTranscripts(lines));
      });

    return () => {
      cancelled = true;
    };
  }, [lyricsData, currentTrack?.id]);

  // Active line from playback time: setState only when the index changes.
  useEffect(() => {
    const lines = lyricsData?.lines;
    if (!lines?.length) {
      setActiveIndex((prev) => (prev === -1 ? prev : -1));
      return;
    }
    let idx = -1;
    for (let i = 0; i < lines.length; i++) {
      if (currentTime >= lines[i].time) idx = i;
      else break;
    }
    setActiveIndex((prev) => (prev === idx ? prev : idx));
  }, [currentTime, lyricsData]);

  // Re-center after web fonts settle (measurements depend on final font metrics).
  useEffect(() => {
    if (typeof document === "undefined" || !document.fonts) return;
    let cancelled = false;
    document.fonts.ready
      .then(() => {
        if (!cancelled) setMetricsVersion((version) => version + 1);
      })
      .catch(() => {
        // Ignore font loading errors.
      });
    return () => {
      cancelled = true;
    };
  }, [lyricsData]);

  // Track the panel height: used for the half-panel top/bottom padding and for
  // centering the active line.
  useEffect(() => {
    const el = scrollContainerRef.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(() => {
      const height = el.clientHeight;
      setPanelHeight((prev) => (Math.abs(prev - height) > 1 ? height : prev));
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, [rightView, lyricsData]);

  const cancelScrollAnimation = useCallback(() => {
    if (animFrameRef.current !== null) {
      cancelAnimationFrame(animFrameRef.current);
      animFrameRef.current = null;
    }
  }, []);

  // Smooth scrollTop animation: ease-out over ~500ms, rAF driven.
  const animateScrollTo = useCallback(
    (container: HTMLDivElement, target: number) => {
      cancelScrollAnimation();
      const max = Math.max(0, container.scrollHeight - container.clientHeight);
      const to = Math.min(max, Math.max(0, target));
      const from = container.scrollTop;
      if (Math.abs(to - from) < 1) {
        container.scrollTop = to;
        return;
      }
      const duration = 500;
      const startTime = performance.now();
      const step = (now: number) => {
        const progress = Math.min(1, (now - startTime) / duration);
        const eased = 1 - Math.pow(1 - progress, 3);
        container.scrollTop = from + (to - from) * eased;
        if (progress < 1) {
          animFrameRef.current = requestAnimationFrame(step);
        } else {
          animFrameRef.current = null;
        }
      };
      animFrameRef.current = requestAnimationFrame(step);
    },
    [cancelScrollAnimation]
  );

  // Center a line using its real (unscaled) layout metrics: offsetTop and
  // offsetHeight are unaffected by the active line's transform scale.
  const scrollToLine = useCallback(
    (index: number, smooth: boolean) => {
      const container = scrollContainerRef.current;
      if (!container || index < 0) return;
      const line = container.querySelector<HTMLElement>(`[data-line-idx="${index}"]`);
      if (!line) return;
      const target = line.offsetTop + line.offsetHeight / 2 - container.clientHeight / 2;
      if (smooth) {
        animateScrollTo(container, target);
      } else {
        cancelScrollAnimation();
        container.scrollTop = Math.max(0, target);
      }
    },
    [animateScrollTo, cancelScrollAnimation]
  );

  // Auto-follow: on every active-line change (and after panel/font changes),
  // smoothly re-center the current line. Paused during manual scrolling and
  // resumed with the *current* active line after the pause.
  useEffect(() => {
    if (rightView !== "lyrics" || isManual) return;
    scrollToLine(activeIndex, true);
  }, [activeIndex, isManual, rightView, panelHeight, metricsVersion, scrollToLine]);

  // Manual input pauses auto-follow for 3s, then re-centers the current line.
  const markManual = useCallback(() => {
    cancelScrollAnimation();
    setIsManual(true);
    if (resumeTimerRef.current !== null) window.clearTimeout(resumeTimerRef.current);
    resumeTimerRef.current = window.setTimeout(() => {
      resumeTimerRef.current = null;
      setIsManual(false);
    }, 3000);
  }, [cancelScrollAnimation]);

  const cancelManualHold = useCallback(() => {
    if (resumeTimerRef.current !== null) {
      window.clearTimeout(resumeTimerRef.current);
      resumeTimerRef.current = null;
    }
    setIsManual(false);
  }, []);

  useEffect(() => {
    return () => {
      if (resumeTimerRef.current !== null) window.clearTimeout(resumeTimerRef.current);
      if (animFrameRef.current !== null) cancelAnimationFrame(animFrameRef.current);
    };
  }, []);

  // Stable seek handler for lyric lines (memo-friendly).
  const handleLineSeek = useCallback(
    (time: number) => {
      cancelScrollAnimation();
      cancelManualHold();
      seekRef.current(time);
    },
    [cancelManualHold, cancelScrollAnimation]
  );
  seekRef.current = seek;

  const coverTracks = useMemo(() => queue, [queue]);

  if (!visible || !currentTrack) return null;

  const handleSeekChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setIsSeeking(true);
    setSeekVal(Number(e.target.value));
  };
  const handleSeekCommit = () => {
    setIsSeeking(false);
    seek(seekVal);
  };

  const closeMenu = () => {
    setShowMenu(false);
    setShowPlaylists(false);
    setShowSleepTimer(false);
  };

  const handleAddToQueue = () => {
    if (!queue.some((track) => track.id === currentTrack.id)) {
      setAppQueue([...queue, currentTrack]);
    }
    closeMenu();
  };

  const handleAddToPlaylist = async (playlistId: string) => {
    await addToPlaylist(playlistId, currentTrack);
    closeMenu();
  };

  const handlePlayNext = () => {
    playNext(currentTrack);
    closeMenu();
  };

  const playQueueTrack = (track: Track) => {
    if (track.id === currentTrack.id) {
      togglePlay();
      return;
    }
    playTrack(track, queue);
  };

  return (
    <div
      data-theme-region="legacy-dark"
      className={`shubhu-ui-controls fixed inset-0 z-[70] h-[100dvh] bg-[#08090a] text-white select-none overflow-hidden overflow-x-hidden ${
        closing ? "shubhu-np-exit" : "shubhu-np-enter"
      }`}
    >
      {/* Blurred cover background, faded on song change */}
      <div key={currentTrack.id} className="absolute inset-0 shubhu-bg-fade pointer-events-none">
        <div
          className="absolute inset-0 bg-cover bg-center scale-125 blur-3xl opacity-55"
          style={{ backgroundImage: `url(${cover})` }}
        />
        <div
          className="absolute inset-0"
          style={{
            background: `linear-gradient(180deg, rgba(${dominantColor}, 0.42) 0%, rgba(8, 9, 10, 0.82) 55%, rgba(8, 9, 10, 0.97) 100%)`,
          }}
        />
      </div>

      {/* Inner rounded frame */}
      <div className="shubhu-np-frame relative z-10 h-full w-full md:p-3">
        <div className="flex h-full w-full flex-col overflow-hidden overscroll-contain rounded-none md:rounded-3xl border-0 md:border md:border-white/10 bg-black/25 backdrop-blur-sm">
          {/* Top bar */}
          <header className="flex items-center justify-between px-4 sm:px-6 py-3 shrink-0">
            <button
              onClick={onClose}
              className="p-2 rounded-full text-neutral-300 hover:text-white hover:bg-white/10 transition-colors cursor-pointer"
              title="Close now playing"
            >
              <ChevronDown className="w-5 h-5" />
            </button>
            <span className="text-[10px] sm:text-xs uppercase tracking-[0.25em] text-white/50 font-semibold">
              Now playing
            </span>
            <div className="w-9" aria-hidden="true" />
          </header>

          {/* Main content */}
          <div className="flex-1 min-h-0 flex flex-col md:flex-row gap-[clamp(0.5rem,1.8dvh,1.5rem)] md:gap-8 px-4 sm:px-6 md:px-8 pb-[max(0.5rem,env(safe-area-inset-bottom))] md:pb-6 overflow-hidden overflow-x-hidden">
            {/* LEFT COLUMN */}
            <div className="w-full md:w-[45%] shrink-0 flex flex-col min-h-0 md:justify-center gap-[clamp(0.55rem,1.8dvh,1.5rem)] md:gap-0 pt-[clamp(0.75rem,3dvh,2rem)] md:pt-0">
              {/* Cover + vinyl: one centered group, width in percentages */}
              {/* Mobile: cover stays optically centered on screen (vinyl overhangs right).
                  md+ keeps the original 81% / aspect-27:20 composition exactly. */}
              <div className="w-full flex justify-center md:contents">
                <div className="relative w-[min(54%,24dvh)] max-w-[270px] aspect-square md:w-[81%] md:max-w-none md:aspect-[27/20] md:mx-auto md:mb-6">
                {/* Vinyl disc behind: right 35% of its diameter sticks out past the cover */}
                <div
                  className="absolute left-[34%] md:left-[25.93%] top-1/2 -translate-y-1/2 w-full md:w-[74.07%] aspect-square rounded-full shadow-2xl shubhu-vinyl overflow-hidden"
                  style={{
                    animationPlayState: isPlaying ? "running" : "paused",
                    background:
                      "radial-gradient(circle at center, #0b0b0b 0%, #0b0b0b 62%, #161616 100%)",
                  }}
                >
                  {/* Fine concentric grooves: thin alternating dark / light rings */}
                  <div
                    className="absolute inset-0 rounded-full"
                    style={{
                      background:
                        "repeating-radial-gradient(circle at center, rgba(255,255,255,0.05) 0px, rgba(255,255,255,0.05) 0.5px, rgba(0,0,0,0.55) 0.5px, rgba(0,0,0,0.55) 2px)",
                    }}
                  />
                  {/* Soft diagonal gloss across the upper-right */}
                  <div
                    className="absolute inset-0 rounded-full pointer-events-none"
                    style={{
                      background:
                        "linear-gradient(225deg, rgba(255,255,255,0.09) 0%, rgba(255,255,255,0.04) 18%, rgba(255,255,255,0) 42%, rgba(255,255,255,0) 100%)",
                    }}
                  />
                  {/* Plain white label (38% of disc diameter) */}
                  <div
                    className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-[38%] aspect-square rounded-full flex items-center justify-center"
                    style={{
                      background: "#f3f3f3",
                      boxShadow: "inset 0 0 10px rgba(0,0,0,0.10), inset 0 1px 2px rgba(0,0,0,0.12)",
                    }}
                  >
                    {/* Spindle hole (~4% of disc diameter) */}
                    <div
                      className="w-[10.5%] aspect-square rounded-full"
                      style={{
                        background: "#050505",
                        boxShadow: "inset 0 0 2px rgba(0,0,0,0.9)",
                      }}
                    />
                  </div>
                  <div className="absolute inset-0 rounded-full ring-1 ring-white/10 pointer-events-none" />
                </div>

                {/* Cover square on top */}
                <div className="absolute left-0 md:left-0 top-1/2 -translate-y-1/2 w-full md:w-[74.07%] aspect-square rounded-2xl overflow-hidden border border-white/10 shadow-2xl z-10 bg-neutral-900">
                  <img
                    src={cover}
                    alt={currentTrack.title}
                    crossOrigin="anonymous"
                    referrerPolicy="no-referrer"
                    onError={(e) => {
                      e.currentTarget.src = getTrackArtworkFallbackUrl(currentTrack, "hq");
                    }}
                    className="w-full h-full object-cover"
                  />
                </div>
                </div>
              </div>

              {/* Title + actions */}
              <div className="relative">
                <div className="flex flex-col items-center text-center md:text-left md:flex-row md:items-start md:justify-between gap-2 md:gap-3">
                  <div className="min-w-0 w-full md:flex-1">
                    <h1 className="text-2xl sm:text-3xl font-display font-bold tracking-tight text-white truncate text-center md:text-left">
                      {currentTrack.title}
                    </h1>
                    <p className="text-sm text-neutral-400 truncate mt-1 text-center md:text-left">{currentTrack.artist}</p>
                  </div>
                  <div className="flex items-center gap-1 shrink-0 absolute right-0 -top-1 md:static md:right-auto md:top-auto">
                    <button
                      onClick={() => toggleLike(currentTrack)}
                      className={`shubhu-like-btn p-2 rounded-full transition-colors cursor-pointer ${
                        isLiked ? "text-emerald-400" : "text-neutral-300 hover:text-white hover:bg-white/5"
                      }`}
                      title={isLiked ? "Remove from Liked Songs" : "Save to Liked Songs"}
                    >
                      <AnimatedHeart filled={isLiked} className="w-5 h-5" burstColor="#34d399" />
                    </button>
                    <button
                      onClick={() => {
                        setShowMenu((open) => !open);
                        setShowPlaylists(false);
                        setShowSleepTimer(false);
                      }}
                      className="p-2 rounded-full text-neutral-300 hover:text-white hover:bg-white/5 transition-colors cursor-pointer"
                      title="More options"
                    >
                      <MoreVertical className="w-5 h-5" />
                    </button>
                  </div>
                </div>

                {/* 3-dot menu (same handlers as the song row menu) */}
                {showMenu && (
                  <>
                    <button
                      className="fixed inset-0 z-[78] cursor-default"
                      onClick={closeMenu}
                      aria-label="Close options menu"
                    />
                    <div className="absolute right-0 top-11 z-[79] w-56 bg-neutral-900 border border-neutral-800 rounded-xl shadow-2xl p-1 text-xs text-neutral-200">
                      <button
                        onClick={() => setShowPlaylists((value) => !value)}
                        className="w-full text-left px-2.5 py-2 rounded hover:bg-neutral-800 flex items-center gap-2 cursor-pointer"
                      >
                        <ListPlus className="w-4 h-4" />
                        Add to playlist
                      </button>
                      {showPlaylists && (
                        <div className="border-t border-neutral-800 mt-1 pt-1 max-h-36 overflow-y-auto">
                          {playlists.length === 0 ? (
                            <p className="px-2.5 py-2 text-neutral-500 italic">No playlists</p>
                          ) : (
                            playlists.map((playlist) => (
                              <button
                                key={playlist.id}
                                onClick={() => handleAddToPlaylist(playlist.id)}
                                className="w-full text-left px-3 py-1.5 rounded hover:bg-neutral-800 truncate cursor-pointer"
                              >
                                {playlist.name}
                              </button>
                            ))
                          )}
                        </div>
                      )}
                      <button
                        onClick={handleAddToQueue}
                        className="w-full text-left px-2.5 py-2 rounded hover:bg-neutral-800 flex items-center gap-2 cursor-pointer"
                      >
                        <ListEnd className="w-4 h-4" />
                        Add to queue
                      </button>
                      <button
                        onClick={handlePlayNext}
                        className="w-full text-left px-2.5 py-2 rounded hover:bg-neutral-800 flex items-center gap-2 cursor-pointer"
                      >
                        <ListStart className="w-4 h-4" />
                        Play next
                      </button>
                      <button
                        onClick={() => {
                          setShowPlaylists(false);
                          setShowSleepTimer(true);
                        }}
                        className="w-full text-left px-2.5 py-2 rounded hover:bg-neutral-800 flex items-center gap-2 cursor-pointer"
                      >
                        <Moon className="w-4 h-4" />
                        Sleep timer
                      </button>
                      {currentTrack.artistId && (
                        <button
                          onClick={() => {
                            const artistId = currentTrack.artistId;
                            closeMenu();
                            if (artistId) router.push(`/artist/${artistId}`);
                          }}
                          className="w-full text-left px-2.5 py-2 rounded hover:bg-neutral-800 flex items-center gap-2 cursor-pointer"
                        >
                          <Disc3 className="w-4 h-4" />
                          Go to artist
                        </button>
                      )}
                      <button
                        onClick={() => {
                          toggleLike(currentTrack);
                          closeMenu();
                        }}
                        className="w-full text-left px-2.5 py-2 rounded hover:bg-neutral-800 flex items-center gap-2 cursor-pointer border-t border-neutral-800 mt-1"
                      >
                        <span className={isLiked ? "text-emerald-400" : ""}>
                          <AnimatedHeart filled={isLiked} className="w-4 h-4" burstColor="#34d399" />
                        </span>
                        {isLiked ? "Unlike" : "Like"}
                      </button>
                    </div>
                  </>
                )}

                {/* Sleep timer popover (same component as the player bar moon icon) */}
                {showSleepTimer && (
                  <>
                    <button
                      className="fixed inset-0 z-[78] cursor-default"
                      onClick={() => setShowSleepTimer(false)}
                      aria-label="Close sleep timer"
                    />
                    <div className="absolute right-0 top-11 z-[79]">
                      <SleepTimer onClose={() => setShowSleepTimer(false)} />
                    </div>
                  </>
                )}
              </div>

              {/* Progress */}
              <div className="w-full flex items-center gap-2.5 text-[11px] text-neutral-400 font-mono mt-0 md:mt-5">
                <span className="w-10 text-left tabular-nums">{formatTime(effectiveTime)}</span>
                <input
                  type="range"
                  min={0}
                  max={duration || 100}
                  step={0.5}
                  value={effectiveTime}
                  onChange={handleSeekChange}
                  onMouseUp={handleSeekCommit}
                  onTouchEnd={handleSeekCommit}
                  style={{
                    background: `linear-gradient(to right, #10b981 ${seekPercent}%, rgba(255,255,255,0.22) ${seekPercent}%)`,
                  }}
                  className="flex-1 h-1 rounded-full appearance-none cursor-pointer [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-3 [&::-webkit-slider-thumb]:h-3 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-white [&::-webkit-slider-thumb]:cursor-pointer"
                />
                <span className="w-10 text-right tabular-nums">{formatTime(duration)}</span>
              </div>

              {/* Controls centered with even spacing */}
              <div className="flex items-center justify-center gap-7 sm:gap-9 w-full mt-0 md:mt-5">
                <button
                  onClick={toggleShuffle}
                  aria-pressed={isShuffle}
                  className={`relative p-2 cursor-pointer rounded-full transition-all duration-200 ${
                    isShuffle
                      ? "text-emerald-400 bg-emerald-400/10 ring-1 ring-emerald-400/40 drop-shadow-[0_0_10px_rgba(52,211,153,0.5)]"
                      : "text-neutral-400 hover:text-white"
                  }`}
                  title={isShuffle ? "Shuffle on" : "Shuffle off"}
                >
                  <AnimatedShuffle active={isShuffle} className="w-5 h-5" />
                  {isShuffle && (
                    <span className="absolute -bottom-1 left-1/2 -translate-x-1/2 w-1.5 h-1.5 bg-emerald-400 rounded-full shadow-[0_0_8px_2px_rgba(52,211,153,0.8)]" />
                  )}
                </button>
                <button
                  onClick={prevTrack}
                  className="text-neutral-200 hover:text-white cursor-pointer active:scale-90 transition-transform"
                  title="Previous"
                >
                  <SkipBack className="w-7 h-7 fill-current" />
                </button>
                <button
                  onClick={togglePlay}
                  disabled={isResolving}
                  className="w-14 h-14 rounded-full bg-white text-black flex items-center justify-center hover:scale-105 active:scale-95 transition-all shadow-xl cursor-pointer disabled:opacity-60"
                  title={isPlaying ? "Pause" : "Play"}
                >
                  {isResolving ? (
                    <Loader2 className="w-6 h-6 animate-spin" />
                  ) : (
                    <AnimatedPlayPause playing={isPlaying} className="w-6 h-6 text-black" />
                  )}
                </button>
                <button
                  onClick={nextTrack}
                  className="text-neutral-200 hover:text-white cursor-pointer active:scale-90 transition-transform"
                  title="Next"
                >
                  <SkipForward className="w-7 h-7 fill-current" />
                </button>
                <button
                  onClick={toggleRepeat}
                  aria-pressed={isRepeat}
                  className={`relative p-2 cursor-pointer rounded-full transition-all duration-200 ${
                    isRepeat
                      ? "text-emerald-400 bg-emerald-400/10 ring-1 ring-emerald-400/40 drop-shadow-[0_0_10px_rgba(52,211,153,0.5)]"
                      : "text-neutral-400 hover:text-white"
                  }`}
                  title={isRepeat ? "Repeat on" : "Repeat off"}
                >
                  <AnimatedRepeat active={isRepeat} className="w-5 h-5" />
                  {isRepeat && (
                    <span className="absolute -bottom-1 left-1/2 -translate-x-1/2 w-1.5 h-1.5 bg-emerald-400 rounded-full shadow-[0_0_8px_2px_rgba(52,211,153,0.8)]" />
                  )}
                </button>
              </div>

              {/* Volume: ~60% width, centered */}
              <div className="w-[60%] mx-auto flex items-center gap-3 mt-0 md:mt-[18px] pb-1">
                <button
                  onClick={toggleMute}
                  className="text-neutral-400 hover:text-white transition-colors cursor-pointer shrink-0"
                  title={isMuted ? "Unmute" : "Mute"}
                >
                  <Volume1 className="w-4 h-4" />
                </button>
                <input
                  type="range"
                  min={0}
                  max={1}
                  step={0.01}
                  value={volumeVal}
                  onChange={(e) => setVolume(Number(e.target.value))}
                  aria-label="Volume"
                  style={{
                    background: `linear-gradient(to right, #10b981 ${volumePercent}%, #4d4d4d ${volumePercent}%)`,
                  }}
                  className="flex-1 min-w-0 h-1 rounded-full appearance-none cursor-pointer [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-3 [&::-webkit-slider-thumb]:h-3 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-white [&::-webkit-slider-thumb]:cursor-pointer [&::-webkit-slider-thumb]:transition-transform [&::-webkit-slider-thumb]:hover:scale-125"
                />
                <Volume2 className="w-4 h-4 text-neutral-400 shrink-0" />
              </div>
            </div>

            {/* RIGHT COLUMN */}
            <div className="w-full md:flex-1 md:min-w-0 flex flex-col min-h-0 flex-1 md:h-full">
              <div className="flex-1 min-h-0 relative">
                {rightView === "lyrics" ? (
                  <div
                    ref={scrollContainerRef}
                    className="h-full relative overflow-y-auto lyrics-scroll touch-pan-y px-1 sm:px-2"
                    onWheel={markManual}
                    onTouchStart={markManual}
                    onTouchMove={markManual}
                    onPointerDown={markManual}
                  >
                    {loading ? (
                      <div className="h-full flex flex-col items-center justify-center gap-3 text-neutral-400">
                        <Loader2 className="w-6 h-6 animate-spin text-emerald-400" />
                        <p className="text-xs font-mono">Loading lyrics...</p>
                      </div>
                    ) : !lyricsData?.lines?.length ? (
                      <div className="h-full flex flex-col items-center justify-center gap-2 text-center">
                        <ListMusic className="w-10 h-10 text-neutral-600" />
                        <p className="text-sm font-semibold text-neutral-300">Lyrics not available</p>
                        <p className="text-xs text-neutral-500">Enjoy the music</p>
                      </div>
                    ) : (
                      <div
                        style={{
                          paddingTop: panelHeight / 2,
                          paddingBottom: panelHeight / 2,
                        }}
                      >
                        {lyricsData.lines.map((line, index) => {
                          const distance = Math.abs(index - activeIndex);
                          const originalIsLatin = !hasNonLatinLetters(line.text);
                          const romanText = originalIsLatin
                            ? line.text
                            : romanTranscripts[index] || line.text;
                          const isSame =
                            romanText.trim().toLowerCase() === line.text.trim().toLowerCase();
                          const regionalText = originalIsLatin || isSame ? "" : line.text;
                          return (
                            <LyricLineRow
                              key={`${line.time}-${index}`}
                              line={line}
                              index={index}
                              romanText={romanText}
                              regionalText={regionalText}
                              isActive={index === activeIndex}
                              distance={distance}
                              onSeek={handleLineSeek}
                            />
                          );
                        })}
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="h-full overflow-y-auto lyrics-scroll touch-pan-y px-1 sm:px-2 py-4">
                    <p className="text-xs uppercase tracking-[0.2em] text-neutral-500 font-semibold mb-3 px-1">
                      Up next
                    </p>
                    {coverTracks.length === 0 ? (
                      <div className="h-full flex flex-col items-center justify-center gap-2 text-center">
                        <ListMusic className="w-10 h-10 text-neutral-600" />
                        <p className="text-sm font-semibold text-neutral-300">Queue is empty</p>
                      </div>
                    ) : (
                      <ReorderableList
                        items={coverTracks}
                        itemKey={(track) => track.id}
                        onReorder={setAppQueue}
                        onRowClick={(track) => playQueueTrack(track)}
                        className="space-y-1"
                        rowClassName={(index, state) => {
                          const isCurrent = coverTracks[index]?.id === currentTrack.id;
                          return `w-full flex items-center gap-3 p-2 rounded-xl text-left border ${
                            state.isDragging
                              ? "bg-neutral-800/95 border-neutral-600 text-white shadow-2xl"
                              : isCurrent
                                ? "bg-emerald-500/15 border-emerald-500/20 text-emerald-400"
                                : "hover:bg-white/5 border-transparent text-neutral-200"
                          }`;
                        }}
                      >
                        {(track) => {
                          const isCurrent = track.id === currentTrack.id;
                          return (
                            <>
                              <img
                                src={getTrackArtworkUrl(track, "max")}
                                alt={track.title}
                                crossOrigin="anonymous"
                                referrerPolicy="no-referrer"
                                draggable={false}
                                onError={(e) => {
                                  e.currentTarget.src = getTrackArtworkFallbackUrl(track, "hq");
                                }}
                                className="w-10 h-10 rounded-lg object-cover bg-neutral-800 shrink-0 pointer-events-none"
                              />
                              <div className="min-w-0 flex-1 pointer-events-none">
                                <p className={`text-sm font-semibold truncate ${isCurrent ? "text-emerald-400" : "text-white"}`}>
                                  {track.title}
                                </p>
                                <p className="text-xs text-neutral-400 truncate">{track.artist}</p>
                              </div>
                              <span className="text-[11px] text-neutral-500 font-mono tabular-nums shrink-0 pointer-events-none">
                                {formatTime(track.duration)}
                              </span>
                              <span
                                className="shubhu-reorder-handle text-neutral-500 hover:text-white shrink-0 p-1 -m-1"
                                title="Hold and drag to reorder"
                                aria-label="Hold and drag to reorder"
                              >
                                <GripVertical className="w-4 h-4" />
                              </span>
                            </>
                          );
                        }}
                      </ReorderableList>
                    )}
                  </div>
                )}
              </div>

              {/* Bottom-right view toggles */}
              <div className="flex items-center justify-end gap-2 pt-2 md:pt-3 pb-[max(0.125rem,env(safe-area-inset-bottom))] md:pb-0 shrink-0">
                <button
                  onClick={() => setRightView("lyrics")}
                  className={`p-2 rounded-full transition-colors cursor-pointer ${
                    rightView === "lyrics"
                      ? "bg-emerald-500/15 text-emerald-400 border border-emerald-500/20"
                      : "text-neutral-400 hover:text-white hover:bg-white/5 border border-transparent"
                  }`}
                  title="Lyrics"
                >
                  <Quote className="w-4 h-4" />
                </button>
                <button
                  onClick={() => setRightView("queue")}
                  className={`p-2 rounded-full transition-colors cursor-pointer ${
                    rightView === "queue"
                      ? "bg-emerald-500/15 text-emerald-400 border border-emerald-500/20"
                      : "text-neutral-400 hover:text-white hover:bg-white/5 border border-transparent"
                  }`}
                  title="Up next"
                >
                  <ListMusic className="w-4 h-4" />
                </button>
              </div>

              {transcriptionDisabled && rightView === "lyrics" && !loading && (
                <p className="text-[10px] font-mono text-amber-400/80 text-right pt-1">
                  transcription disabled: no API key
                </p>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
