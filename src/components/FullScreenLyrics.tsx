"use client";

import React, { useEffect, useState, useRef } from "react";
import {
  X, Mic2, SkipBack, SkipForward,
  Volume2, VolumeX, Moon, ListPlus, ListMusic, Check,
} from "lucide-react";
import {
  AnimatedHeart,
  AnimatedPlayPause,
  AnimatedRepeat,
  AnimatedShuffle,
} from "@/components/animations/MotionIcons";
import { usePlayer } from "@/context/PlayerContext";
import { parseLRC } from "@/lib/lyrics";
import {
  buildFallbackTranscripts,
  hasNonLatinLetters,
  isValidTranscriptList,
} from "@/lib/transcript";
import { SleepTimer } from "@/components/SleepTimer";
import { getTrackArtworkFallbackUrl, getTrackArtworkUrl } from "@/lib/artwork";

interface LyricLine {
  time: number;
  text: string;
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

export function FullScreenLyrics({ isOpen, onClose }: { isOpen: boolean; onClose: () => void }) {
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
    playTrack,
    sleepEndsAt,
    sleepAtEndOfSong,
  } = usePlayer();

  const [lyricsData, setLyricsData] = useState<LyricsData | null>(null);
  const [loading, setLoading] = useState(false);
  const [romanTranscripts, setRomanTranscripts] = useState<string[]>([]);
  const [transcribing, setTranscribing] = useState(false);
  const [transcriptionDisabled, setTranscriptionDisabled] = useState(false);
  const [showRightQueue, setShowRightQueue] = useState(false);
  const [showSleepMenu, setShowSleepMenu] = useState(false);
  const [showPlaylistDropdown, setShowPlaylistDropdown] = useState(false);
  const [addedSuccess, setAddedSuccess] = useState(false);

  const activeLineRef = useRef<HTMLDivElement | null>(null);

  const isLiked = currentTrack ? likedSongIds.has(currentTrack.id) : false;
  const seekPercent = duration > 0 ? Math.min(100, Math.max(0, (currentTime / duration) * 100)) : 0;
  const volumePercent = Math.min(100, Math.max(0, (isMuted ? 0 : volume) * 100));
  const isSleepActive = sleepEndsAt !== null || sleepAtEndOfSong;

  // Fetch lyrics whenever current track changes
  useEffect(() => {
    if (!currentTrack || !isOpen) return;

    let cancelled = false;
    setLoading(true);
    setRomanTranscripts([]);
    setTranscriptionDisabled(false);

    const query = new URLSearchParams({
      title: currentTrack.title,
      artist: currentTrack.artist || "",
      album: currentTrack.album || "",
      duration: String(currentTrack.duration || 0),
    });

    fetch(`/api/lyrics?${query.toString()}`)
      .then((res) => (res.ok ? res.json() : null))
      .then((data: { syncedLyrics?: string | null; plainLyrics?: string | null; lines?: LyricLine[]; synced?: boolean; label?: string } | null) => {
        if (!cancelled) {
          if (!data) {
            setLyricsData(null);
          } else if (Array.isArray(data.lines)) {
            setLyricsData({
              synced: !!data.synced,
              lines: data.lines,
              label: data.label,
            });
          } else if (data.syncedLyrics) {
            const parsed = parseLRC(data.syncedLyrics);
            setLyricsData({
              synced: true,
              lines: parsed,
              label: "Synced Lyrics",
            });
          } else if (data.plainLyrics) {
            const plainLines = data.plainLyrics
              .split("\n")
              .map((text, i) => ({ time: i * 5, text: text.trim() }))
              .filter((l) => l.text.length > 0);
            setLyricsData({
              synced: false,
              lines: plainLines,
              label: "Plain Lyrics",
            });
          } else {
            setLyricsData(null);
          }
          setLoading(false);
        }
      })
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

  // Transcribe all lyric lines to Roman script (English letters) using /api/transcribe
  useEffect(() => {
    if (!lyricsData?.lines?.length || !currentTrack?.id) {
      setRomanTranscripts([]);
      return;
    }

    const lines = lyricsData.lines.map((l) => l.text);
    // New cache version: lyrics-roman-v1 may contain original-script entries from
    // older builds, so it is intentionally ignored.
    const cacheKey = `lyrics-roman-v2_${currentTrack.id}`;

    // Check localStorage cache first; only accept a complete, all-Latin result.
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
    setTranscribing(true);
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
          // Rule 7: keep the original lines visible and surface the reason.
          setTranscriptionDisabled(true);
          setRomanTranscripts([]);
          setTranscribing(false);
          return;
        }

        if (isValidTranscriptList(lines, data?.transcriptions)) {
          setRomanTranscripts(data.transcriptions);
          // Cache only complete results (same number of lines as source).
          if (typeof window !== "undefined") {
            try {
              localStorage.setItem(cacheKey, JSON.stringify(data.transcriptions));
            } catch {
              // Ignore localStorage quota errors.
            }
          }
        } else {
          // Last-resort local Roman fallback so the big line is never the
          // original non-Latin script.
          setRomanTranscripts(buildFallbackTranscripts(lines));
        }
        setTranscribing(false);
      })
      .catch((err) => {
        if (!cancelled) {
          console.error("Transcription request failed:", err);
          setRomanTranscripts(buildFallbackTranscripts(lines));
          setTranscribing(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [lyricsData, currentTrack?.id]);

  // Find active line index
  let activeIndex = -1;
  if (lyricsData?.lines?.length) {
    for (let i = 0; i < lyricsData.lines.length; i++) {
      if (currentTime >= lyricsData.lines[i].time) {
        activeIndex = i;
      } else {
        break;
      }
    }
  }

  // Smooth auto-scroll
  useEffect(() => {
    if (activeLineRef.current) {
      activeLineRef.current.scrollIntoView({
        behavior: "smooth",
        block: "center",
      });
    }
  }, [activeIndex]);

  if (!isOpen) return null;

  const cover = getTrackArtworkUrl(currentTrack, "max");

  return (
    <div data-theme-region="legacy-dark" className="shubhu-ui-controls fixed inset-0 z-50 flex flex-col bg-neutral-950 text-white select-none overflow-hidden animate-in fade-in duration-300">
      {/* Dynamic blurred background from artwork */}
      <div
        className="absolute inset-0 bg-cover bg-center opacity-25 blur-3xl scale-125 pointer-events-none transition-all duration-1000"
        style={{ backgroundImage: `url(${cover})` }}
      />
      <div className="absolute inset-0 bg-neutral-950/75 pointer-events-none" />

      {/* Top Header bar */}
      <header className="relative z-10 flex items-center justify-between px-6 py-4 border-b border-white/5 shrink-0">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-400">
            <Mic2 className="w-4 h-4" />
          </div>
          <div>
            <h1 className="font-display font-bold text-base tracking-tight leading-none">Lyrics</h1>
            <p className="text-[11px] text-neutral-400 font-mono mt-0.5">
              {currentTrack?.title || "No track"}
            </p>
          </div>
        </div>

        <button
          onClick={onClose}
          className="p-2 rounded-full bg-white/5 hover:bg-white/15 text-neutral-300 hover:text-white transition-colors cursor-pointer"
          title="Close lyrics"
        >
          <X className="w-5 h-5" />
        </button>
      </header>

      {/* Main split area */}
      <div className="relative z-10 flex-1 grid grid-cols-1 md:grid-cols-12 gap-6 px-6 md:px-12 py-6 overflow-hidden max-w-7xl mx-auto w-full">
        {/* Left column: Artwork + Song info */}
        <div className="hidden md:flex md:col-span-3 lg:col-span-3 flex-col justify-between h-full py-2">
          <div className="space-y-4">
            <div className="relative aspect-square w-full rounded-2xl overflow-hidden shadow-2xl border border-white/10 group">
              <img
                src={cover}
                alt={currentTrack?.title || "Album art"}
                crossOrigin="anonymous"
                referrerPolicy="no-referrer"
                onError={(e) => {
                  e.currentTarget.src = getTrackArtworkFallbackUrl(currentTrack, "hq");
                }}
                className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-700"
              />
            </div>

            <div>
              <h2 className="font-display font-bold text-2xl text-white tracking-tight leading-tight line-clamp-2">
                {currentTrack?.title || "No track"}
              </h2>
              <p className="text-sm text-neutral-400 mt-1 font-medium truncate">
                {currentTrack?.artist || "Unknown artist"}
              </p>
              {currentTrack?.album && (
                <p className="text-xs text-neutral-500 mt-0.5 truncate">
                  {currentTrack.album}
                </p>
              )}
            </div>
          </div>

          <div className="text-xs text-neutral-500 font-mono">
            {lyricsData?.label || (lyricsData?.synced ? "Synced Lyrics" : "Plain Lyrics")}
          </div>
        </div>

        {/* Center column: Interactive lyrics stream */}
        <div className={`col-span-1 ${showRightQueue ? "md:col-span-6 lg:col-span-6" : "md:col-span-9 lg:col-span-9"} flex flex-col h-full overflow-y-auto px-4 md:px-6 py-6 scrollbar-hide`}>
          {transcriptionDisabled && !loading && (
            <p className="mb-4 text-center text-xs font-mono text-amber-400/80">
              transcription disabled: no API key
            </p>
          )}
          {loading ? (
            <div className="m-auto text-center space-y-3">
              <div className="w-8 h-8 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin mx-auto" />
              <p className="text-xs text-neutral-400 font-mono">Loading synchronized lyrics...</p>
            </div>
          ) : !lyricsData?.lines?.length ? (
            <div className="m-auto text-center space-y-2">
              <Mic2 className="w-12 h-12 text-neutral-600 mx-auto opacity-50" />
              <p className="text-xl font-bold font-display text-white">Lyrics not available</p>
              <p className="text-xs text-neutral-400">Enjoy the music</p>
            </div>
          ) : (
            <div className="space-y-6 my-auto">
              {lyricsData.lines.map((line, index) => {
                const isActive = index === activeIndex;
                const isPast = activeIndex !== -1 && index < activeIndex;

                // Rule 3: an original line already in English letters is both the
                // big line and has no second line.
                const originalIsLatin = !hasNonLatinLetters(line.text);
                // Roman transcript (English letters) is always the main line (big slot).
                const romanLine = originalIsLatin
                  ? line.text
                  : romanTranscripts[index] || line.text;
                // Regional / original line under it if different from the Roman transcript
                const isSame = romanLine.trim().toLowerCase() === line.text.trim().toLowerCase();
                const regionalLine = originalIsLatin || isSame ? "" : line.text;

                return (
                  <div
                    key={`${line.time}-${index}`}
                    ref={isActive ? activeLineRef : null}
                    onClick={() => seek(line.time)}
                    className={`transition-all duration-300 rounded-2xl p-4 cursor-pointer select-text ${
                      isActive
                        ? "text-emerald-400 font-bold scale-105 bg-emerald-500/10 border border-emerald-500/20 shadow-xl"
                        : isPast
                        ? "text-neutral-500 hover:text-neutral-300 font-medium opacity-60"
                        : "text-neutral-300 hover:text-white font-medium opacity-80"
                    }`}
                  >
                    {/* Big Roman Transcript Line (English letters) */}
                    <p className={`font-display tracking-tight leading-relaxed ${
                      isActive ? "text-2xl md:text-3xl lg:text-4xl" : "text-lg md:text-xl lg:text-2xl"
                    }`}>
                      {romanLine}
                    </p>

                    {/* Regional / Original line below in smaller muted font */}
                    {regionalLine && (
                      <p className={`mt-1 text-sm md:text-base font-normal tracking-wide ${
                        isActive ? "text-emerald-300/80" : "text-neutral-400/80"
                      }`}>
                        {regionalLine}
                      </p>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Right column: Up next queue list */}
        {showRightQueue && (
          <div className="hidden md:flex md:col-span-3 lg:col-span-3 flex-col h-full bg-neutral-900/60 rounded-2xl border border-white/5 p-3 overflow-hidden backdrop-blur-xl">
            <div className="flex items-center justify-between pb-2 mb-2 border-b border-white/5">
              <span className="text-xs font-semibold text-white">Up next</span>
              <button
                onClick={() => setShowRightQueue(false)}
                className="text-neutral-400 hover:text-white p-1"
                title="Hide queue"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto space-y-1 scrollbar-hide">
              {queue.length === 0 ? (
                <div className="py-8 text-center text-xs text-neutral-500">Queue is empty</div>
              ) : (
                queue.map((track, i) => {
                  const isCurrent = track.id === currentTrack?.id;
                  return (
                    <button
                      key={`lyrics-q-${track.id}-${i}`}
                      onClick={() => playTrack(track, queue)}
                      className={`w-full flex items-center gap-2.5 p-2 rounded-xl text-left transition-colors cursor-pointer group ${
                        isCurrent
                          ? "bg-emerald-500/15 text-emerald-400 border border-emerald-500/20"
                          : "hover:bg-white/5 text-neutral-300 hover:text-white"
                      }`}
                    >
                      <img
                        src={getTrackArtworkUrl(track, "max")}
                        alt={track.title}
                        crossOrigin="anonymous"
                        referrerPolicy="no-referrer"
                        onError={(e) => {
                          e.currentTarget.src = getTrackArtworkFallbackUrl(track, "hq");
                        }}
                        className="w-9 h-9 rounded-lg object-cover shrink-0 bg-neutral-800"
                      />
                      <div className="min-w-0 flex-1">
                        <p className="text-xs font-semibold truncate group-hover:text-emerald-400">
                          {track.title}
                        </p>
                        <p className="text-[10px] text-neutral-400 truncate">
                          {track.artist}
                        </p>
                      </div>
                    </button>
                  );
                })
              )}
            </div>
          </div>
        )}
      </div>

      {/* Bottom Player Control Bar */}
      <footer className="relative z-10 px-6 py-3 border-t border-white/10 bg-neutral-950/90 backdrop-blur-2xl flex items-center justify-between gap-4 shrink-0">
        {/* Left: Thumbnail, title, artist, like */}
        <div className="flex items-center gap-3 w-1/4 min-w-[180px]">
          <img
            src={cover}
            alt={currentTrack?.title || "Track"}
            crossOrigin="anonymous"
            referrerPolicy="no-referrer"
            onError={(e) => {
              e.currentTarget.src = getTrackArtworkFallbackUrl(currentTrack, "hq");
            }}
            className="w-12 h-12 rounded-xl object-cover shrink-0 bg-neutral-800 shadow"
          />
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold text-white truncate">
              {currentTrack?.title || "No track"}
            </p>
            <p className="text-xs text-neutral-400 truncate">
              {currentTrack?.artist || "Unknown artist"}
            </p>
          </div>
          {currentTrack && (
            <button
              onClick={() => toggleLike(currentTrack)}
              className={`shubhu-like-btn p-1.5 transition-colors cursor-pointer shrink-0 ${
                isLiked ? "text-emerald-400" : "text-neutral-400 hover:text-white"
              }`}
              title={isLiked ? "Liked" : "Like"}
            >
              <AnimatedHeart filled={isLiked} className="w-4 h-4" burstColor="#34d399" />
            </button>
          )}
        </div>

        {/* Center: Controls + Progress bar */}
        <div className="flex flex-col items-center gap-1.5 flex-1 max-w-xl">
          <div className="flex items-center gap-4">
            <button
              onClick={toggleShuffle}
              className={`p-1.5 cursor-pointer transition-colors ${
                isShuffle ? "text-emerald-400" : "text-neutral-400 hover:text-white"
              }`}
              title="Shuffle"
            >
              <AnimatedShuffle active={isShuffle} className="w-4 h-4" />
            </button>

            <button
              onClick={prevTrack}
              className="p-1.5 text-neutral-300 hover:text-white cursor-pointer transition-colors"
              title="Previous"
            >
              <SkipBack className="w-5 h-5 fill-current" />
            </button>

            <button
              onClick={togglePlay}
              className="w-10 h-10 rounded-full bg-emerald-500 hover:bg-emerald-400 text-black flex items-center justify-center shadow-lg hover:scale-105 active:scale-95 transition-all cursor-pointer"
              title={isPlaying ? "Pause" : "Play"}
            >
              <AnimatedPlayPause playing={isPlaying} className="w-5 h-5 text-black" />
            </button>

            <button
              onClick={nextTrack}
              className="p-1.5 text-neutral-300 hover:text-white cursor-pointer transition-colors"
              title="Next"
            >
              <SkipForward className="w-5 h-5 fill-current" />
            </button>

            <button
              onClick={toggleRepeat}
              className={`p-1.5 cursor-pointer transition-colors ${
                isRepeat ? "text-emerald-400" : "text-neutral-400 hover:text-white"
              }`}
              title="Repeat"
            >
              <AnimatedRepeat active={isRepeat} className="w-4 h-4" />
            </button>
          </div>

          {/* Progress bar and timestamps */}
          <div className="flex items-center gap-2 w-full text-xs text-neutral-400 font-mono">
            <span className="w-10 text-right">{formatTime(currentTime)}</span>
            <input
              type="range"
              min={0}
              max={duration || 100}
              step={0.5}
              value={currentTime}
              onChange={(e) => seek(Number(e.target.value))}
              style={{
                background: `linear-gradient(to right, #10b981 ${seekPercent}%, #374151 ${seekPercent}%)`,
              }}
              className="flex-1 h-1 rounded-full appearance-none cursor-pointer [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-3 [&::-webkit-slider-thumb]:h-3 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-white [&::-webkit-slider-thumb]:cursor-pointer [&::-webkit-slider-thumb]:transition-transform [&::-webkit-slider-thumb]:hover:scale-125"
            />
            <span className="w-10 text-left">{formatTime(duration)}</span>
          </div>
        </div>

        {/* Right side: Sleep timer, add to playlist, queue, volume */}
        <div className="flex items-center justify-end gap-3 w-1/4 min-w-[200px] relative">
          {/* Sleep timer button */}
          <button
            onClick={() => {
              setShowSleepMenu(!showSleepMenu);
              setShowPlaylistDropdown(false);
            }}
            className={`p-1.5 cursor-pointer transition-colors ${
              isSleepActive ? "text-emerald-400" : "text-neutral-400 hover:text-white"
            }`}
            title="Sleep timer"
          >
            <Moon className="w-4 h-4" />
          </button>

          {/* Add to playlist button */}
          <button
            onClick={() => {
              setShowPlaylistDropdown(!showPlaylistDropdown);
              setShowSleepMenu(false);
            }}
            className="p-1.5 text-neutral-400 hover:text-white cursor-pointer transition-colors"
            title="Add to playlist"
          >
            {addedSuccess ? (
              <Check className="w-4 h-4 text-emerald-400" />
            ) : (
              <ListPlus className="w-4 h-4" />
            )}
          </button>

          {/* Queue toggle */}
          <button
            onClick={() => setShowRightQueue(!showRightQueue)}
            className={`p-1.5 cursor-pointer transition-colors ${
              showRightQueue ? "text-emerald-400" : "text-neutral-400 hover:text-white"
            }`}
            title="Up next queue"
          >
            <ListMusic className="w-4 h-4" />
          </button>

          {/* Volume slider */}
          <div className="flex items-center gap-1.5">
            <button
              onClick={toggleMute}
              className="text-neutral-400 hover:text-white cursor-pointer transition-colors"
              title="Mute / Unmute"
            >
              {isMuted || volume === 0 ? (
                <VolumeX className="w-4 h-4 text-red-400" />
              ) : (
                <Volume2 className="w-4 h-4" />
              )}
            </button>
            <input
              type="range"
              min={0}
              max={1}
              step={0.01}
              value={isMuted ? 0 : volume}
              onChange={(e) => setVolume(Number(e.target.value))}
              style={{
                background: `linear-gradient(to right, #10b981 ${volumePercent}%, #374151 ${volumePercent}%)`,
              }}
              className="w-20 h-1 rounded-full appearance-none cursor-pointer [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-2.5 [&::-webkit-slider-thumb]:h-2.5 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-white [&::-webkit-slider-thumb]:cursor-pointer"
            />
          </div>

          {/* Sleep timer popover */}
          {showSleepMenu && (
            <div className="absolute right-24 bottom-14 z-50">
              <SleepTimer onClose={() => setShowSleepMenu(false)} />
            </div>
          )}

          {/* Add to playlist dropdown */}
          {showPlaylistDropdown && (
            <div className="absolute right-16 bottom-14 w-48 bg-neutral-900 border border-neutral-800 rounded-lg shadow-2xl p-1 z-50">
              <p className="text-[10px] uppercase font-semibold text-neutral-500 px-2 py-1">
                Add to Playlist
              </p>
              {playlists.length === 0 ? (
                <p className="text-xs text-neutral-500 px-2 py-1.5 italic">No playlists</p>
              ) : (
                playlists.map((pl) => (
                  <button
                    key={`lyrics-pl-${pl.id}`}
                    onClick={async () => {
                      if (currentTrack) {
                        await addToPlaylist(pl.id, currentTrack);
                        setShowPlaylistDropdown(false);
                        setAddedSuccess(true);
                        setTimeout(() => setAddedSuccess(false), 2000);
                      }
                    }}
                    className="w-full text-left px-2 py-1.5 rounded hover:bg-neutral-800 text-xs text-neutral-200 truncate cursor-pointer"
                  >
                    {pl.name}
                  </button>
                ))
              )}
            </div>
          )}
        </div>
      </footer>
    </div>
  );
}
