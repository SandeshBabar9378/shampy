"use client";

import React, { useState } from "react";
import {
  SkipBack, SkipForward, Volume2, VolumeX,
  Loader2, Mic2, Moon, ListMusic, Maximize2
} from "lucide-react";
import { usePlayer } from "@/context/PlayerContext";
import { useDominantColor } from "@/hooks/useDominantColor";
import {
  applyStableArtworkFallback,
  getTrackArtworkFallbackUrl,
  getTrackArtworkUrl,
  getStableTrackArtworkUrl,
} from "@/lib/artwork";
import {
  AnimatedHeart,
  AnimatedListPlus,
  AnimatedPlayPause,
  AnimatedRepeat,
  AnimatedShuffle,
} from "@/components/animations/MotionIcons";
import { LyricsPanel } from "@/components/LyricsPanel";
import { MobilePlayer } from "@/components/MobilePlayer";
import { NowPlayingFullscreen } from "@/components/NowPlayingFullscreen";
import { SleepTimer } from "@/components/SleepTimer";
import { QueueReorder } from "@/components/QueueReorder";

function formatTime(seconds: number): string {
  if (isNaN(seconds) || seconds < 0) return "0:00";
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s < 10 ? "0" : ""}${s}`;
}

interface PlayerProps {
  /** Home renders the bar inside the center region with equal side gutters. */
  embedded?: boolean;
}

export function Player({ embedded = false }: PlayerProps) {
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
  const [showNowPlaying, setShowNowPlaying] = useState(false);
  const [showSleepTimer, setShowSleepTimer] = useState(false);
  const [showQueue, setShowQueue] = useState(false);

  const cover = getTrackArtworkUrl(currentTrack, "max");
  const dominantColor = useDominantColor(getTrackArtworkUrl(currentTrack, "max"));
  // The mobile bar keeps the track's stored artwork URL; the desktop footer
  // above continues to use the original resolver and is intentionally unchanged.
  const mobileCover = getStableTrackArtworkUrl(currentTrack, "max");

  // In embedded mode the bar is positioned inside the center flex region with
  // matching left/right gutters, so it stays centered as either sidebar changes.
  // Detail pages keep the original fixed, viewport-wide bar.
  const positionClasses = embedded
    ? "absolute bottom-3 left-3 right-3"
    : "fixed bottom-3 left-4 right-4";

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
    setShowQueue(false);
  };

  return (
    <>
      {/* ══════════════════════════════════════════════════════════════════════
          DESKTOP PLAYER BAR — Floating rounded pill with thin border
      ══════════════════════════════════════════════════════════════════════ */}
      <footer
        style={{
          background: `linear-gradient(
            to right,
            rgba(${dominantColor}, 0.25) 0%,
            rgba(var(--player-surface-rgb), 0.94) 40%
          )`,
          backdropFilter: "blur(24px)",
        }}
        className={`hidden sm:flex ${positionClasses} shubhu-ui-controls h-22 rounded-2xl border border-white/10 px-5 items-center justify-between gap-4 select-none z-40 shadow-2xl transition-all duration-500`}
      >

        {/* LEFT — track info */}
        <div className="flex items-center gap-3 w-[28%] min-w-[170px]">
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
                  e.currentTarget.src = getTrackArtworkFallbackUrl(currentTrack, "hq");
                }}
                className="w-full h-full object-cover group-hover:scale-105 transition-transform"
              />
              {isResolving && (
                <div className="theme-dark-surface absolute inset-0 bg-black/60 flex items-center justify-center">
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
            className={`player-like-btn shubhu-like-btn p-1.5 transition-transform active:scale-90 cursor-pointer shrink-0 ${
              isLiked ? "text-emerald-500" : "text-neutral-400 hover:text-white"
            }`}
            title={isLiked ? "Remove from Liked Songs" : "Save to Liked Songs"}
            aria-pressed={isLiked}
            aria-label={isLiked ? "Remove from Liked Songs" : "Save to Liked Songs"}
          >
            <AnimatedHeart
              filled={isLiked}
              className="w-5 h-5"
              burstColor={isLiked ? "#10b981" : undefined}
            />
          </button>
        </div>

        {/* CENTER — controls + progress */}
        <div className="flex flex-col items-center gap-1.5 w-2/4 max-w-lg">
          <div className="flex items-center gap-6">
            {/* Shuffle */}
            <button
              onClick={toggleShuffle}
              title={isShuffle ? "Shuffle on" : "Shuffle off"}
              aria-pressed={isShuffle}
              className={`relative cursor-pointer transition-colors active:scale-90 ${
                isShuffle ? "text-emerald-400" : "text-white hover:text-white/80"
              }`}
            >
              <AnimatedShuffle active={isShuffle} className="w-4 h-4" />
              {isShuffle && (
                <span className="absolute -bottom-1.5 left-1/2 -translate-x-1/2 w-1 h-1 bg-emerald-400 rounded-full" />
              )}
            </button>

            <button onClick={prevTrack} title="Previous"
              className="text-white hover:text-white/80 cursor-pointer active:scale-90 transition-transform">
              <SkipBack className="w-5 h-5 fill-current" />
            </button>

            <button
              onClick={togglePlay}
              disabled={isResolving}
              title={isPlaying ? "Pause" : "Play"}
              aria-label={isPlaying ? "Pause" : "Play"}
              className="w-9 h-9 rounded-full bg-[var(--theme-accent)] text-[var(--theme-accent-contrast)] flex items-center justify-center hover:scale-105 active:scale-95 transition-all shadow-md cursor-pointer disabled:opacity-60"
            >
              <AnimatedPlayPause playing={isPlaying} className="w-4 h-4 text-black" />
            </button>

            <button onClick={nextTrack} title="Next"
              className="text-white hover:text-white/80 cursor-pointer active:scale-90 transition-transform">
              <SkipForward className="w-5 h-5 fill-current" />
            </button>

            {/* Repeat */}
            <button
              onClick={toggleRepeat}
              title={isRepeat ? "Repeat on" : "Repeat off"}
              aria-pressed={isRepeat}
              className={`relative cursor-pointer transition-colors active:scale-90 ${
                isRepeat ? "text-emerald-400" : "text-white hover:text-white/80"
              }`}
            >
              <AnimatedRepeat active={isRepeat} className="w-4 h-4" />
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
                background: `linear-gradient(to right, var(--theme-accent) ${seekPercent}%, var(--theme-slider-track) ${seekPercent}%)`,
              }}
              className="flex-1 h-1 rounded-full appearance-none cursor-pointer [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-3 [&::-webkit-slider-thumb]:h-3 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-white [&::-webkit-slider-thumb]:cursor-pointer [&::-webkit-slider-thumb]:transition-transform [&::-webkit-slider-thumb]:hover:scale-125"
            />
            <span className="w-10 text-left">{formatTime(duration)}</span>
          </div>
        </div>

        {/* RIGHT — volume + controls */}
        <div className="flex items-center justify-end gap-1.5 lg:gap-2 w-[28%] min-w-[170px]">
          <button onClick={toggleMute} className="text-white hover:text-white/80 cursor-pointer transition-colors">
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
              background: `linear-gradient(to right, var(--theme-accent) ${volumePercent}%, var(--theme-slider-track) ${volumePercent}%)`,
            }}
            className="w-14 lg:w-20 xl:w-24 h-1 rounded-full appearance-none cursor-pointer [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-3 [&::-webkit-slider-thumb]:h-3 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-white [&::-webkit-slider-thumb]:cursor-pointer"
          />

          {/* Add to Playlist button right of volume */}
          <div className="relative flex items-center gap-1">
            {/* Lyrics side panel */}
            <button
              onClick={() => {
                setShowLyrics(!showLyrics);
                setShowQueue(false);
                setShowSleepTimer(false);
                setShowNowPlaying(false);
              }}
              className={`hidden md:block p-1.5 cursor-pointer transition-colors ${
                showLyrics ? "text-emerald-400" : "text-white hover:text-white/80"
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
              }}
              className={`hidden md:block p-1.5 cursor-pointer transition-colors ${
                showQueue ? "text-emerald-400" : "text-white hover:text-white/80"
              }`}
              title="Queue"
            >
              <ListMusic className="w-4 h-4" />
            </button>

            <div className="hidden lg:flex items-center gap-1">
              <div className="relative">
                <button
                  onClick={toggleSleepTimerMenu}
                  className={`p-1.5 cursor-pointer transition-colors ${
                    showSleepTimer ? "text-emerald-400" : "text-white hover:text-white/80"
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
              className={`hidden xl:block p-1.5 cursor-pointer transition-colors ${
                addedSuccess ? "text-emerald-400" : "text-white hover:text-white/80"
              }`}
              title="Add to Playlist"
              aria-label="Add to Playlist"
            >
              <AnimatedListPlus added={addedSuccess} className="w-4 h-4" />
            </button>

            <button
              onClick={() => {
                setShowNowPlaying(true);
                setShowLyrics(false);
                setShowSleepTimer(false);
                setShowQueue(false);
              }}
              className="p-1.5 cursor-pointer text-white hover:text-white/80 transition-colors"
              title="Now Playing"
            >
              <Maximize2 className="w-4 h-4" />
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
          MOBILE MINI-PLAYER — visible only on mobile (sm:hidden).
          The full-screen player is a separate isolated component so the
          desktop footer and NowPlayingFullscreen remain untouched.
      ══════════════════════════════════════════════════════════════════════ */}
      <div
        className={`sm:hidden fixed bottom-14 left-0 right-0 z-40 px-3 pb-1 shubhu-ui-controls ${
          mobileExpanded ? "pointer-events-none" : ""
        }`}
      >
        {!mobileExpanded && (
          <div
            style={{
              background: `linear-gradient(
                to right,
                rgba(${dominantColor}, 0.35) 0%,
                rgba(var(--player-surface-rgb), 0.96) 60%
              )`,
              backdropFilter: "blur(20px)",
            }}
            className="flex items-center gap-3 border border-white/10 rounded-2xl px-3.5 py-2.5 shadow-2xl"
          >
            <img
              src={mobileCover}
              alt={currentTrack.title}
              crossOrigin="anonymous"
              referrerPolicy="no-referrer"
              onError={(e) => applyStableArtworkFallback(e.currentTarget)}
              onClick={() => setMobileExpanded(true)}
              className="w-10 h-10 rounded-lg object-cover shrink-0 cursor-pointer"
            />
            <div className="flex-1 min-w-0 cursor-pointer" onClick={() => setMobileExpanded(true)}>
              <p className="text-sm font-semibold text-white truncate">{currentTrack.title}</p>
              <p className="text-xs text-neutral-400 truncate">{currentTrack.artist}</p>
            </div>
            <button
              onClick={togglePlay}
              aria-label={isPlaying ? "Pause" : "Play"}
              className="w-8 h-8 rounded-full bg-[var(--theme-accent)] text-[var(--theme-accent-contrast)] flex items-center justify-center shrink-0 cursor-pointer active:scale-90 transition-transform"
            >
              <AnimatedPlayPause playing={isPlaying} className="w-4 h-4 text-black" />
            </button>
            <button onClick={nextTrack} className="text-neutral-400 cursor-pointer p-1">
              <SkipForward className="w-5 h-5 fill-current" />
            </button>
          </div>
        )}
      </div>

      {mobileExpanded && (
        <div className="sm:hidden">
          <MobilePlayer onClose={() => setMobileExpanded(false)} />
        </div>
      )}

      {/* Full-Screen Now Playing Overlay */}
      <NowPlayingFullscreen
        isOpen={showNowPlaying}
        onClose={() => setShowNowPlaying(false)}
      />
    </>
  );
}
