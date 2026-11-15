"use client";

import React, { useState } from "react";
import {
  Play, Pause, SkipBack, SkipForward,
  Shuffle, Repeat, Volume2, VolumeX,
  Heart, Loader2, ChevronDown, ListPlus, Check,
  Mic2, Moon, Gauge, ListMusic, ArrowLeft
} from "lucide-react";
import { usePlayer } from "@/context/PlayerContext";
import { useDominantColor } from "@/hooks/useDominantColor";
import { LyricsPanel } from "@/components/LyricsPanel";
import { SleepTimer } from "@/components/SleepTimer";
import { PlaybackSpeed } from "@/components/PlaybackSpeed";
import { QueueReorder } from "@/components/QueueReorder";

function formatTime(seconds: number): string {
  if (isNaN(seconds) || seconds < 0) return "0:00";
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s < 10 ? "0" : ""}${s}`;
}

export function Player() {
  const {
    currentTrack, isPlaying, currentTime, duration,
    volume, isMuted, isShuffle, isRepeat, isResolving,
    likedSongIds, togglePlay, nextTrack, prevTrack,
    seek, setVolume, toggleMute, toggleShuffle, toggleRepeat, toggleLike,
    mobileExpanded, setMobileExpanded, playlists, addToPlaylist,
    sleepEndsAt, sleepRemainingSeconds, sleepAtEndOfSong, sleepTimerNotice,
  } = usePlayer();

  const [isSeeking, setIsSeeking] = useState(false);
  const [seekVal, setSeekVal] = useState(0);
  const [showPlaylistDropdown, setShowPlaylistDropdown] = useState(false);
  const [addedSuccess, setAddedSuccess] = useState(false);

  // Metrolist Feature Modals
  const [showLyrics, setShowLyrics] = useState(false);
  const [showSleepTimer, setShowSleepTimer] = useState(false);
  const [showSpeed, setShowSpeed] = useState(false);
  const [showQueue, setShowQueue] = useState(false);

  const cover = currentTrack?.coverUrl || "https://images.unsplash.com/photo-1514525253161-7a46d19cd819?w=300";
  const dominantColor = useDominantColor(currentTrack?.coverUrl);

  // Opaque cover-based dark gradient for the phone panel (no see-through layers).
  const mobilePanelBg = (() => {
    const parts = dominantColor.split(",").map((s) => parseInt(s.trim(), 10));
    if (parts.length >= 3 && parts.every((n) => !isNaN(n))) {
      const [r, g, b] = parts.map((n) => Math.round(n * 0.45));
      return `linear-gradient(180deg, rgb(${r}, ${g}, ${b}) 0%, #121212 65%, #121212 100%)`;
    }
    return "linear-gradient(180deg, #1f1f1f 0%, #121212 100%)";
  })();

  if (!currentTrack) return null;

  const isLiked = likedSongIds.has(currentTrack.id);
  const sleepTimerRunning = sleepEndsAt !== null || sleepAtEndOfSong;
  const sleepLabel = sleepAtEndOfSong ? "END" : formatTime(sleepRemainingSeconds);
  const effectiveTime = isSeeking ? seekVal : currentTime;
  const seekPercent = duration > 0 ? Math.min(100, Math.max(0, (effectiveTime / duration) * 100)) : 0;
  const volumeVal = isMuted ? 0 : volume;
  const volumePercent = Math.min(100, Math.max(0, volumeVal * 100));

  const handleSeekChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setIsSeeking(true);
    setSeekVal(Number(e.target.value));
  };
  const handleSeekCommit = () => { setIsSeeking(false); seek(seekVal); };

  const toggleSleepTimerMenu = () => {
    setShowSleepTimer((open) => !open);
    setShowLyrics(false);
    setShowSpeed(false);
    setShowQueue(false);
  };

  return (
    <>
      {/* ══════════════════════════════════════════════════════════════════════
          DESKTOP PLAYER BAR — hidden on mobile
      ══════════════════════════════════════════════════════════════════════ */}
      <footer
        style={{
          background: `linear-gradient(
            to right,
            rgba(${dominantColor}, 0.35) 0%,
            rgba(18, 18, 18, 0.95) 40%
          )`,
          backdropFilter: "blur(20px)",
        }}
        className="hidden sm:flex fixed bottom-0 left-0 right-0 h-24 border-t border-white/10 px-4 items-center justify-between gap-4 select-none z-40 transition-colors duration-500"
      >

        {/* LEFT — track info */}
        <div className="flex items-center gap-3 w-1/4 min-w-[180px]">
          <div
            onClick={() => setMobileExpanded(true)}
            className="flex items-center gap-3 cursor-pointer min-w-0 flex-1 group"
            title="Open full player"
          >
            <div className="relative w-14 h-14 rounded-md overflow-hidden bg-neutral-900 shrink-0 border border-neutral-800">
              <img
                src={cover}
                alt={currentTrack.title}
                crossOrigin="anonymous"
                referrerPolicy="no-referrer"
                onError={(e) => {
                  e.currentTarget.src = "https://images.unsplash.com/photo-1514525253161-7a46d19cd819?w=200&auto=format";
                }}
                className="w-full h-full object-cover group-hover:scale-105 transition-transform"
              />
              {isResolving && (
                <div className="absolute inset-0 bg-black/60 flex items-center justify-center">
                  <Loader2 className="w-5 h-5 text-emerald-400 animate-spin" />
                </div>
              )}
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold text-white truncate group-hover:text-emerald-400 transition-colors">{currentTrack.title}</p>
              <p className="text-xs text-neutral-400 truncate">{currentTrack.artist}</p>
              {isResolving && (
                <p className="text-[10px] text-emerald-400 flex items-center gap-1 font-mono">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                  Streaming via YT
                </p>
              )}
            </div>
          </div>
          <button
            onClick={() => toggleLike(currentTrack)}
            className={`p-1.5 transition-transform active:scale-90 cursor-pointer shrink-0 ${
              isLiked ? "text-emerald-500" : "text-neutral-400 hover:text-white"
            }`}
            title={isLiked ? "Remove from Liked Songs" : "Save to Liked Songs"}
          >
            <Heart className={`w-5 h-5 ${isLiked ? "fill-emerald-500" : ""}`} />
          </button>
        </div>

        {/* CENTER — controls + progress */}
        <div className="flex flex-col items-center gap-1.5 w-2/4 max-w-lg">
          <div className="flex items-center gap-6">
            {/* Shuffle */}
            <button
              onClick={toggleShuffle}
              title="Shuffle"
              className={`relative cursor-pointer transition-colors ${
                isShuffle ? "text-emerald-400" : "text-neutral-400 hover:text-white"
              }`}
            >
              <Shuffle className="w-4 h-4" />
              {isShuffle && (
                <span className="absolute -bottom-1.5 left-1/2 -translate-x-1/2 w-1 h-1 bg-emerald-400 rounded-full" />
              )}
            </button>

            <button onClick={prevTrack} title="Previous"
              className="text-neutral-400 hover:text-white cursor-pointer active:scale-90 transition-transform">
              <SkipBack className="w-5 h-5 fill-current" />
            </button>

            <button
              onClick={togglePlay}
              disabled={isResolving}
              title={isPlaying ? "Pause" : "Play"}
              className="w-9 h-9 rounded-full bg-white text-black flex items-center justify-center hover:scale-105 active:scale-95 transition-all shadow-md cursor-pointer disabled:opacity-60"
            >
              {isPlaying
                ? <Pause className="w-4 h-4 fill-black text-black" />
                : <Play className="w-4 h-4 fill-black text-black ml-0.5" />}
            </button>

            <button onClick={nextTrack} title="Next"
              className="text-neutral-400 hover:text-white cursor-pointer active:scale-90 transition-transform">
              <SkipForward className="w-5 h-5 fill-current" />
            </button>

            {/* Repeat */}
            <button
              onClick={toggleRepeat}
              title="Repeat"
              className={`relative cursor-pointer transition-colors ${
                isRepeat ? "text-emerald-400" : "text-neutral-400 hover:text-white"
              }`}
            >
              <Repeat className="w-4 h-4" />
              {isRepeat && (
                <span className="absolute -bottom-1.5 left-1/2 -translate-x-1/2 w-1 h-1 bg-emerald-400 rounded-full" />
              )}
            </button>
          </div>

          {/* Progress bar */}
          <div className="w-full flex items-center gap-2 text-xs text-neutral-400 font-mono group">
            <span className="w-10 text-right">{formatTime(isSeeking ? seekVal : currentTime)}</span>
            <input
              type="range"
              min={0}
              max={duration || 100}
              value={isSeeking ? seekVal : currentTime}
              onChange={handleSeekChange}
              onMouseUp={handleSeekCommit}
              onTouchEnd={handleSeekCommit}
              style={{
                background: `linear-gradient(to right, #1DB954 ${seekPercent}%, #4d4d4d ${seekPercent}%)`,
              }}
              className="flex-1 h-1 rounded-full appearance-none cursor-pointer [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-3 [&::-webkit-slider-thumb]:h-3 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-white [&::-webkit-slider-thumb]:cursor-pointer [&::-webkit-slider-thumb]:transition-transform [&::-webkit-slider-thumb]:hover:scale-125"
            />
            <span className="w-10 text-left">{formatTime(duration)}</span>
          </div>
        </div>

        {/* RIGHT — volume */}
        <div className="flex items-center justify-end gap-3 w-1/4 min-w-[190px]">
          <button onClick={toggleMute} className="text-neutral-400 hover:text-white cursor-pointer transition-colors">
            {isMuted || volume === 0
              ? <VolumeX className="w-5 h-5 text-red-400" />
              : <Volume2 className="w-5 h-5" />}
          </button>
          <input
            type="range"
            min={0}
            max={1}
            step={0.01}
            value={isMuted ? 0 : volume}
            onChange={(e) => setVolume(Number(e.target.value))}
            style={{
              background: `linear-gradient(to right, #1DB954 ${volumePercent}%, #4d4d4d ${volumePercent}%)`,
            }}
            className="w-24 h-1 rounded-full appearance-none cursor-pointer [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-3 [&::-webkit-slider-thumb]:h-3 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-white [&::-webkit-slider-thumb]:cursor-pointer"
          />

          {/* Add to Playlist button right of volume */}
          <div className="relative flex items-center gap-1">
            <button
              onClick={() => {
                setShowLyrics(!showLyrics);
                setShowSleepTimer(false);
                setShowSpeed(false);
                setShowQueue(false);
              }}
              className={`p-1.5 cursor-pointer transition-colors ${
                showLyrics ? "text-emerald-400" : "text-neutral-400 hover:text-white"
              }`}
              title="Lyrics"
            >
              <Mic2 className="w-4 h-4" />
            </button>

            <button
              onClick={() => {
                setShowQueue(!showQueue);
                setShowLyrics(false);
                setShowSleepTimer(false);
                setShowSpeed(false);
              }}
              className={`p-1.5 cursor-pointer transition-colors ${
                showQueue ? "text-emerald-400" : "text-neutral-400 hover:text-white"
              }`}
              title="Queue"
            >
              <ListMusic className="w-4 h-4" />
            </button>

            <button
              onClick={() => {
                setShowSpeed(!showSpeed);
                setShowLyrics(false);
                setShowSleepTimer(false);
                setShowQueue(false);
              }}
              className={`p-1.5 cursor-pointer transition-colors ${
                showSpeed ? "text-emerald-400" : "text-neutral-400 hover:text-white"
              }`}
              title="Playback Speed"
            >
              <Gauge className="w-4 h-4" />
            </button>

            <div className="flex items-center gap-1">
              <div className="relative">
                <button
                  onClick={toggleSleepTimerMenu}
                  className={`p-1.5 cursor-pointer transition-colors ${
                    showSleepTimer ? "text-emerald-400" : "text-neutral-400 hover:text-white"
                  }`}
                  title="Sleep Timer"
                >
                  <Moon className="w-4 h-4" />
                </button>
              </div>
              {sleepTimerRunning && (
                <span className="min-w-[30px] text-[10px] font-mono text-emerald-400">{sleepLabel}</span>
              )}
            </div>

            <button
              onClick={() => setShowPlaylistDropdown(!showPlaylistDropdown)}
              className="p-1.5 text-neutral-400 hover:text-white cursor-pointer transition-colors"
              title="Add to Playlist"
            >
              {addedSuccess ? (
                <Check className="w-4 h-4 text-emerald-400" />
              ) : (
                <ListPlus className="w-4 h-4" />
              )}
            </button>

            {/* Overlays */}
            {showLyrics && (
              <div className="absolute right-0 bottom-12 z-50">
                <LyricsPanel onClose={() => setShowLyrics(false)} />
              </div>
            )}

            {showQueue && (
              <div className="absolute right-0 bottom-12 z-50">
                <QueueReorder onClose={() => setShowQueue(false)} />
              </div>
            )}

            {showSpeed && (
              <div className="absolute right-0 bottom-12 z-50">
                <PlaybackSpeed onClose={() => setShowSpeed(false)} />
              </div>
            )}

            {showSleepTimer && (
              <div className="absolute right-0 bottom-12 z-50">
                <SleepTimer onClose={() => setShowSleepTimer(false)} />
              </div>
            )}

            {showPlaylistDropdown && (
              <div className="absolute right-0 bottom-12 w-48 bg-neutral-900 border border-neutral-800 rounded-lg shadow-2xl p-1 z-50">
                <p className="text-[10px] uppercase font-semibold text-neutral-500 px-2 py-1">
                  Add to Playlist
                </p>
                {playlists.length === 0 ? (
                  <p className="text-xs text-neutral-500 px-2 py-1.5 italic">No playlists</p>
                ) : (
                  playlists.map((pl) => (
                    <button
                      key={pl.id}
                      onClick={async () => {
                        await addToPlaylist(pl.id, currentTrack);
                        setShowPlaylistDropdown(false);
                        setAddedSuccess(true);
                        setTimeout(() => setAddedSuccess(false), 2000);
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
        </div>
      </footer>

      {/* Transient sleep timer notice — visible on both desktop and mobile */}
      {sleepTimerNotice && (
        <div className="fixed bottom-28 left-1/2 z-50 -translate-x-1/2 rounded-full border border-neutral-700 bg-neutral-900 px-4 py-2 text-xs text-white shadow-2xl pointer-events-none">
          {sleepTimerNotice}
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════════════════
          MOBILE MINI-PLAYER — visible only on mobile (sm:hidden)
          Tap the expand button to see the full-screen overlay player
      ══════════════════════════════════════════════════════════════════════ */}
      <div className="sm:hidden fixed bottom-14 left-0 right-0 z-40 px-3 pb-1">
        {!mobileExpanded ? (
          /* Mini-player bar */
          <div
            style={{
              background: `linear-gradient(
                to right,
                rgba(${dominantColor}, 0.5) 0%,
                rgba(24, 24, 24, 0.95) 60%
              )`,
              backdropFilter: "blur(16px)",
            }}
            className="flex items-center gap-3 border border-white/10 rounded-xl px-3 py-2 shadow-xl"
          >
            <img
              src={cover}
              alt={currentTrack.title}
              crossOrigin="anonymous"
              referrerPolicy="no-referrer"
              onError={(e) => {
                e.currentTarget.src = "https://images.unsplash.com/photo-1514525253161-7a46d19cd819?w=200&auto=format";
              }}
              onClick={() => setMobileExpanded(true)}
              className="w-10 h-10 rounded-lg object-cover shrink-0 cursor-pointer"
            />
            <div className="flex-1 min-w-0 cursor-pointer" onClick={() => setMobileExpanded(true)}>
              <p className="text-sm font-semibold text-white truncate">{currentTrack.title}</p>
              <p className="text-xs text-neutral-400 truncate">{currentTrack.artist}</p>
            </div>
            <button
              onClick={togglePlay}
              className="w-8 h-8 rounded-full bg-white text-black flex items-center justify-center shrink-0 cursor-pointer"
            >
              {isPlaying ? <Pause className="w-4 h-4 fill-black" /> : <Play className="w-4 h-4 fill-black ml-0.5" />}
            </button>
            <button onClick={nextTrack} className="text-neutral-400 cursor-pointer p-1">
              <SkipForward className="w-5 h-5 fill-current" />
            </button>
          </div>
        ) : (
          /* Mobile now-playing panel — covers the upper area; bottom nav (z-50) stays visible */
          <div
            style={{
              background: mobilePanelBg,
            }}
            className="fixed inset-x-0 top-0 bottom-14 z-40 flex flex-col px-5 pt-3 pb-4 overflow-y-auto overflow-x-hidden"
          >
            {/* Top bar: down-chevron (top right) closes the panel */}
            <div className="relative flex items-center justify-between mb-3 shrink-0">
              <span className="text-[10px] uppercase tracking-[0.2em] font-semibold text-white/70">
                Now Playing
              </span>
              <button
                onClick={() => setMobileExpanded(false)}
                className="text-white/80 hover:text-white p-2 -mr-2 cursor-pointer"
                title="Close player"
              >
                <ChevronDown className="w-6 h-6" />
              </button>
            </div>

            {showLyrics ? (
              /* Separate lyrics view inside the same panel */
              <div className="flex-1 flex flex-col min-h-0">
                <div className="flex items-center gap-2 mb-3 shrink-0">
                  <button
                    onClick={() => setShowLyrics(false)}
                    className="p-1.5 -ml-1.5 text-white/80 hover:text-white cursor-pointer"
                    title="Back to player"
                  >
                    <ArrowLeft className="w-5 h-5" />
                  </button>
                  <div className="min-w-0">
                    <p className="text-sm font-bold text-white truncate">Lyrics</p>
                    <p className="text-xs text-white/60 truncate">
                      {currentTrack.title} • {currentTrack.artist}
                    </p>
                  </div>
                </div>
                <div className="flex-1 min-h-0 [&>div]:w-full [&>div]:h-full">
                  <LyricsPanel onClose={() => setShowLyrics(false)} variant="mobile" />
                </div>
              </div>
            ) : (
              <>
                {/* Large rounded cover (~70% of panel width) */}
                <div className="flex justify-center mb-5 shrink-0">
                  <img
                    src={cover}
                    alt={currentTrack.title}
                    crossOrigin="anonymous"
                    referrerPolicy="no-referrer"
                    onError={(e) => {
                      e.currentTarget.src = "https://images.unsplash.com/photo-1514525253161-7a46d19cd819?w=200&auto=format";
                    }}
                    className="w-[70%] max-w-[320px] aspect-square rounded-2xl object-cover shadow-2xl"
                  />
                </div>

                {/* Track info + like */}
                <div className="w-full flex items-start justify-between gap-3 mb-4 shrink-0">
                  <div className="min-w-0 flex-1">
                    <p className="text-2xl font-bold text-white truncate">{currentTrack.title}</p>
                    <p className="text-sm text-white/60 mt-1 truncate">{currentTrack.artist}</p>
                  </div>
                  <button
                    onClick={() => toggleLike(currentTrack)}
                    className={`p-2 shrink-0 cursor-pointer ${isLiked ? "text-emerald-400" : "text-white/70 hover:text-white"}`}
                    title={isLiked ? "Liked" : "Like"}
                  >
                    <Heart className={`w-6 h-6 ${isLiked ? "fill-emerald-400" : ""}`} />
                  </button>
                </div>

                {/* Progress */}
                <div className="w-full flex items-center gap-3 mb-5 text-xs text-white/60 font-mono shrink-0">
                  <span className="w-9 text-left">{formatTime(isSeeking ? seekVal : currentTime)}</span>
                  <input
                    type="range"
                    min={0}
                    max={duration || 100}
                    value={isSeeking ? seekVal : currentTime}
                    onChange={handleSeekChange}
                    onTouchEnd={handleSeekCommit}
                    onMouseUp={handleSeekCommit}
                    style={{
                      background: `linear-gradient(to right, #1DB954 ${seekPercent}%, rgba(255,255,255,0.25) ${seekPercent}%)`,
                    }}
                    className="flex-1 h-1 rounded-full appearance-none cursor-pointer [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-3.5 [&::-webkit-slider-thumb]:h-3.5 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-white [&::-webkit-slider-thumb]:cursor-pointer"
                  />
                  <span className="w-9 text-right">{formatTime(duration)}</span>
                </div>

                {/* Controls: shuffle, previous, play/pause (large white circle), next, repeat */}
                <div className="flex items-center justify-between w-full mb-5 shrink-0">
                  <button onClick={toggleShuffle} className={`cursor-pointer ${isShuffle ? "text-emerald-400" : "text-white/70 hover:text-white"}`}>
                    <Shuffle className="w-5 h-5" />
                  </button>
                  <button onClick={prevTrack} className="text-white cursor-pointer">
                    <SkipBack className="w-8 h-8 fill-current" />
                  </button>
                  <button
                    onClick={togglePlay}
                    disabled={isResolving}
                    className="w-16 h-16 rounded-full bg-white text-black flex items-center justify-center cursor-pointer disabled:opacity-60 shadow-xl"
                  >
                    {isPlaying ? <Pause className="w-7 h-7 fill-black" /> : <Play className="w-7 h-7 fill-black ml-1" />}
                  </button>
                  <button onClick={nextTrack} className="text-white cursor-pointer">
                    <SkipForward className="w-8 h-8 fill-current" />
                  </button>
                  <button onClick={toggleRepeat} className={`cursor-pointer ${isRepeat ? "text-emerald-400" : "text-white/70 hover:text-white"}`}>
                    <Repeat className="w-5 h-5" />
                  </button>
                </div>

                {/* Extra Metrolist mobile buttons */}
                <div className="flex items-center justify-around w-full max-w-xs mx-auto mb-4 shrink-0">
                  <button
                    onClick={() => {
                      setShowLyrics(true);
                      setShowSleepTimer(false);
                      setShowSpeed(false);
                      setShowQueue(false);
                    }}
                    className={`p-2 rounded-full cursor-pointer transition-colors ${
                      showLyrics ? "bg-white/20 text-emerald-400" : "text-white/70 hover:text-white"
                    }`}
                    title="Lyrics"
                  >
                    <Mic2 className="w-5 h-5" />
                  </button>

                  <button
                    onClick={() => {
                      setShowQueue(!showQueue);
                      setShowSleepTimer(false);
                      setShowSpeed(false);
                    }}
                    className={`p-2 rounded-full cursor-pointer transition-colors ${
                      showQueue ? "bg-white/20 text-emerald-400" : "text-white/70 hover:text-white"
                    }`}
                    title="Queue"
                  >
                    <ListMusic className="w-5 h-5" />
                  </button>

                  <button
                    onClick={() => {
                      setShowSpeed(!showSpeed);
                      setShowSleepTimer(false);
                      setShowQueue(false);
                    }}
                    className={`p-2 rounded-full cursor-pointer transition-colors ${
                      showSpeed ? "bg-white/20 text-emerald-400" : "text-white/70 hover:text-white"
                    }`}
                    title="Speed"
                  >
                    <Gauge className="w-5 h-5" />
                  </button>

                  <div className="flex items-center gap-1">
                    <div className="relative">
                      <button
                        onClick={toggleSleepTimerMenu}
                        className={`p-2 rounded-full cursor-pointer transition-colors ${
                          showSleepTimer ? "bg-white/20 text-emerald-400" : "text-white/70 hover:text-white"
                        }`}
                        title="Sleep Timer"
                      >
                        <Moon className="w-5 h-5" />
                      </button>
                    </div>
                    {sleepTimerRunning && (
                      <span className="min-w-[30px] text-[10px] font-mono text-emerald-400">{sleepLabel}</span>
                    )}
                  </div>
                </div>

                {/* Mobile Overlays (queue / speed / sleep) */}
                {showQueue && (
                  <div className="w-full mb-4 flex justify-center shrink-0">
                    <QueueReorder onClose={() => setShowQueue(false)} />
                  </div>
                )}
                {showSpeed && (
                  <div className="w-full mb-4 flex justify-center shrink-0">
                    <PlaybackSpeed onClose={() => setShowSpeed(false)} />
                  </div>
                )}
                {showSleepTimer && (
                  <div className="w-full mb-4 flex justify-center shrink-0">
                    <SleepTimer onClose={() => setShowSleepTimer(false)} />
                  </div>
                )}

                {/* Volume */}
                <div className="w-full flex items-center gap-3 shrink-0">
                  <VolumeX className="w-4 h-4 text-white/60" />
                  <input
                    type="range" min={0} max={1} step={0.01}
                    value={isMuted ? 0 : volume}
                    onChange={(e) => setVolume(Number(e.target.value))}
                    style={{
                      background: `linear-gradient(to right, #1DB954 ${volumePercent}%, rgba(255,255,255,0.25) ${volumePercent}%)`,
                    }}
                    className="flex-1 h-1 rounded-full appearance-none cursor-pointer [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-3 [&::-webkit-slider-thumb]:h-3 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-white [&::-webkit-slider-thumb]:cursor-pointer"
                  />
                  <Volume2 className="w-4 h-4 text-white/60" />
                </div>
              </>
            )}
          </div>
        )}
      </div>
    </>
  );
}
